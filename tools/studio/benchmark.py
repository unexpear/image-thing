"""Project-local benchmark harness (contract 9.6). Stdlib only.
Usage:
  python -s tools/studio/benchmark.py --spec reports/studio/matrix-existing.json
Spec: {"cases": [{"case": "...", "kind": "...", "parameters": {...},
                  "profiles": ["existing"], "seeds": [0,1,2,3],
                  "timeout_s": 3600, "cold_boot_id": "<optional>" }]}
Per trial: reset metrics (idle) -> admit -> poll + device-sample ->
terminal -> result + history cache evidence -> per-trial JSON.
Failure/OOM/timeout stops identical-condition repeats. Serialized only.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))
TERMINAL = ('succeeded', 'failed', 'cancelled', 'timed_out', 'stale', 'unknown')


def load_token():
    with open(os.path.join(PROJECT, 'studio-data', 'credential')) as f:
        return f.read().strip()


def call(base, token, method, path, body=None):
    req = urllib.request.Request(base + path, method=method,
                                 headers={'Authorization': 'Bearer ' + token,
                                          'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}')
        except ValueError:
            return e.code, {}


def device_snapshot(base):
    try:
        with urllib.request.urlopen(base + '/system_stats', timeout=10) as r:
            s = json.loads(r.read().decode())
        devs = []
        for d in s.get('devices', []):
            if d.get('type') == 'cuda':
                devs.append({'name': d.get('name'), 'vram_total': d.get('vram_total'),
                             'vram_free': d.get('vram_free')})
        return {'cuda': devs, 'ram_free': (s.get('system') or {}).get('ram_free')}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {e}'}


def run_trial(base, token, out_dir, case, profile, seed, key, timeout_s, params):
    rec = {'case': case, 'profile': profile, 'seed': seed,
           'idempotency_key': key, 'started_ns': time.time_ns(), 'samples': [],
           'graph_version': case.get('graph_version', 'unversioned')}
    st, status = call(base, token, 'GET', '/studio/status')
    rec['boot_id'] = (status.get('epoch') or '').split(':')[-1]
    rec['epoch'] = status.get('epoch')
    st, reset = call(base, token, 'POST', '/studio/metrics/reset')
    rec['metrics_reset'] = {'http': st, 'body': reset}
    body = {'schema_version': 1, 'kind': case['kind'],
            'expected_epoch': rec['epoch'], 'idempotency_key': key,
            'parameters': dict(params, seed=seed, memory_profile_id=profile,
                               workflow_id=params.get('workflow_id', case.get('workflow_id', 'mesh-hunyuan')))}
    if case['kind'] == 'generate_mesh':
        body['parameters'].setdefault('workflow_id', 'mesh-hunyuan')
    st, res = call(base, token, 'POST', '/studio/jobs', body)
    rec['admit_http'] = st
    if st not in (200, 202):
        rec['admit_error'] = res
        rec['outcome'] = 'admit_failed'
        return rec
    job = res['job']
    rec['job_id'] = job['job_id']
    rec['prompt_id'] = job.get('prompt_id')
    rec['replay'] = res.get('replay', False)
    if rec['replay']:
        rec['outcome'] = 'replay_rejected'
        return rec
    t0 = time.time()
    peak_used = None
    min_free = None
    interval = 1.0
    while True:
        time.sleep(interval)
        snap = device_snapshot(base)
        rec['samples'].append({'t': round(time.time() - t0, 2), 'snap': snap})
        for d in (snap.get('cuda') or []):
            if d.get('vram_total') and d.get('vram_free') is not None:
                used = d['vram_total'] - d['vram_free']
                peak_used = used if peak_used is None else max(peak_used, used)
                min_free = d['vram_free'] if min_free is None else min(min_free, d['vram_free'])
        st, jr = call(base, token, 'GET', '/studio/jobs/' + job['job_id'])
        state = (jr.get('job') or {}).get('state')
        if state in TERMINAL:
            rec['final'] = jr.get('job')
            break
        if time.time() - t0 > timeout_s:
            call(base, token, 'POST', '/studio/jobs/' + job['job_id'] + '/cancel')
            rec['final'] = {'state': 'timed_out_by_harness'}
            break
    rec['observed_device_peak_used'] = peak_used
    rec['observed_device_min_free'] = min_free
    rec['sample_interval_s'] = interval
    rec['wall_s'] = round(time.time() - t0, 2)
    try:
        with urllib.request.urlopen(base + '/history/' + (rec.get('prompt_id') or ''), timeout=30) as r:
            hist = json.loads(r.read().decode()).get(rec.get('prompt_id') or '', {})
        msgs = ((hist.get('status') or {}).get('messages') or [])
        rec['cache_hit_nodes'] = [m[1].get('nodes') for m in msgs if m[0] == 'execution_cached']
        rec['output_nodes'] = sorted((hist.get('outputs') or {}).keys())
        rec['history_completed'] = bool((hist.get('status') or {}).get('completed'))
    except Exception as e:
        rec['history_error'] = f'{type(e).__name__}: {e}'
    rec['outcome'] = (rec.get('final') or {}).get('state', 'unknown')
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--base', default='http://127.0.0.1:8188')
    ap.add_argument('--out', default=os.path.join(PROJECT, 'reports', 'studio', 'bench'))
    ap.add_argument('--run-id', default=time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    args = ap.parse_args()
    token = load_token()
    spec = json.load(open(args.spec))
    manifest = {'spec': args.spec, 'run_id': args.run_id,
                'started': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'trials': [], 'stopped_conditions': []}
    for case in spec['cases']:
        for profile in case['profiles']:
            for i, seed in enumerate(case['seeds']):
                key = f"{args.run_id}-{case['case']}-{profile}-s{seed}"
                params = dict(case.get('parameters', {}))
                print(f'trial {key}', flush=True)
                rec = run_trial(args.base, token, args.out, case, profile, seed, key,
                                case.get('timeout_s', 3600), params)
                d = os.path.join(args.out, case['case'], profile)
                os.makedirs(d, exist_ok=True)
                with open(os.path.join(d, f'trial-s{seed}.json'), 'w') as f:
                    json.dump(rec, f, indent=1)
                manifest['trials'].append({'key': key, 'outcome': rec.get('outcome'),
                                           'job_id': rec.get('job_id'), 'wall_s': rec.get('wall_s')})
                if rec.get('outcome') != 'succeeded':
                    manifest['stopped_conditions'].append(
                        f"stop identical repeats: {case['case']}/{profile} -> {rec.get('outcome')}")
                    break
    manifest['ended'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    with open(os.path.join(args.out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print(json.dumps(manifest, indent=1))


if __name__ == '__main__':
    main()
