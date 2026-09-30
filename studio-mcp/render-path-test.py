"""MCP render-path test: mesh (seed 7) -> blender_render via MCP tools."""
import json
import os
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ENV = dict(os.environ, STUDIO_BASE='http://127.0.0.1:8188',
           STUDIO_CREDENTIAL_FILE=os.path.join(PROJECT, 'studio-data', 'credential'),
           PYTHONSAFEPATH='1')


def main():
    proc = subprocess.Popen([os.path.join(HERE, '.venv', 'Scripts', 'python.exe'),
                             '-u', os.path.join(HERE, 'server.py')],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, cwd=PROJECT, env=ENV)
    rid = [0]

    def rpc(method, params=None):
        rid[0] += 1
        msg = {'jsonrpc': '2.0', 'id': rid[0], 'method': method}
        if params is not None:
            msg['params'] = params
        proc.stdin.write((json.dumps(msg) + '\n').encode())
        proc.stdin.flush()
        return json.loads(proc.stdout.readline().decode())

    def tool(name, args):
        r = rpc('tools/call', {'name': name, 'arguments': args})
        assert 'result' in r, r
        out = r['result']
        texts = [b.get('text', '') for b in out.get('content', []) if b.get('type') == 'text']
        return json.loads(texts[0]) if texts else out

    def wait_done(jid, budget):
        deadline = time.time() + budget
        while True:
            st = tool('job_status', {'job_id': jid})
            state = (st.get('job') or {}).get('state')
            if state in ('succeeded', 'failed', 'cancelled', 'timed_out', 'stale', 'unknown'):
                return state, st
            assert time.time() < deadline, 'poll timeout'
            time.sleep(5)

    rpc('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {},
                       'clientInfo': {'name': 't', 'version': '0'}})
    proc.stdin.write(b'{"jsonrpc": "2.0", "method": "notifications/initialized"}\n')
    proc.stdin.flush()

    g = tool('generate_mesh', {'front_artifact_id': '0c5e36d6-2326-49ff-81e7-d2853d7f28bd',
                               'detail': 128, 'faces': 5000, 'steps': 10,
                               'seed': 7, 'idempotency_key': 'mcp-r-mesh'})
    assert g.get('job_id'), g
    s, _ = wait_done(g['job_id'], 600)
    print('mesh:', s)
    assert s == 'succeeded'
    res = tool('job_result', {'job_id': g['job_id']})
    arts = ((res.get('job') or {}).get('result') or {}).get('artifacts', [])
    glb = next(a for a in arts if a['kind'] == 'glb')
    r = tool('blender_render', {'source_artifact_id': glb['artifact_id'],
                                'idempotency_key': 'mcp-r-render'})
    s2, _ = wait_done(r['job_id'], 600)
    print('render:', s2)
    assert s2 == 'succeeded'
    res2 = tool('job_result', {'job_id': r['job_id']})
    files = ((res2.get('job') or {}).get('result') or {}).get('artifacts', [])
    print('files:', len(files), sorted(a['filename'] for a in files))
    assert len(files) == 7
    proc.stdin.close()
    proc.wait(timeout=15)
    print('MCP RENDER PATH: PASS')


main()
