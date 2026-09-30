"""Live MCP tool test: status -> generate_mesh -> poll -> result ->
blender_post -> result -> cancel-path. Requires running backend (dev tool)."""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ENV = dict(os.environ, STUDIO_BASE='http://127.0.0.1:8188',
           STUDIO_CREDENTIAL_FILE=os.path.join(PROJECT, 'studio-data', 'credential'),
           PYTHONSAFEPATH='1')
FRONT = '0c5e36d6-2326-49ff-81e7-d2853d7f28bd'


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
        r = rpc('tools/call', {'name': name, 'arguments': args}, )
        assert 'result' in r, r
        out = r['result']
        texts = [b.get('text', '') for b in out.get('content', []) if b.get('type') == 'text']
        return json.loads(texts[0]) if texts else out

    rpc('initialize', {'protocolVersion': '2025-11-25', 'capabilities': {},
                       'clientInfo': {'name': 't', 'version': '0'}})
    proc.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
    proc.stdin.flush()

    s = tool('studio_status', {})
    assert s['http'] == 200, s
    print('status ok, features:', s['status']['features'])

    g = tool('generate_mesh', {'front_artifact_id': FRONT, 'detail': 128,
                               'faces': 5000, 'steps': 10,
                               'idempotency_key': 'mcp-live-mesh-1'})
    assert g.get('job_id') and not g.get('error'), g
    jid = g['job_id']
    print('mesh admitted:', jid)
    deadline = time.time() + 600
    while True:
        st = tool('job_status', {'job_id': jid})
        state = (st.get('job') or {}).get('state')
        if state in ('succeeded', 'failed', 'cancelled', 'timed_out', 'stale', 'unknown'):
            break
        assert time.time() < deadline, 'mesh poll timeout'
        time.sleep(5)
    print('mesh terminal:', state)
    assert state == 'succeeded', st
    res = tool('job_result', {'job_id': jid})
    arts = ((res.get('job') or {}).get('result') or {}).get('artifacts', [])
    glb = next(a for a in arts if a['kind'] == 'glb')
    print('mesh artifact:', glb['filename'], glb['size'])

    p = tool('blender_post', {'source_artifact_id': glb['artifact_id'],
                              'preset': 'preserve',
                              'idempotency_key': 'mcp-live-post-1'})
    assert p.get('job_id'), p
    deadline = time.time() + 600
    while True:
        st = tool('job_status', {'job_id': p['job_id']})
        state = (st.get('job') or {}).get('state')
        if state in ('succeeded', 'failed', 'cancelled', 'timed_out', 'stale', 'unknown'):
            break
        assert time.time() < deadline, 'post poll timeout'
        time.sleep(5)
    print('post terminal:', state)
    assert state == 'succeeded', st

    c = tool('generate_mesh', {'front_artifact_id': FRONT,
                               'idempotency_key': 'mcp-live-cancel-1'})
    cc = tool('job_cancel', {'job_id': c['job_id']})
    assert cc['http'] == 200, cc
    st = tool('job_status', {'job_id': c['job_id']})
    print('cancelled job:', (st.get('job') or {}).get('state'))

    bad = tool('job_status', {'job_id': '00000000-0000-0000-0000-000000000000'})
    assert bad['http'] == 404, bad
    print('unknown-id 404 ok')
    proc.stdin.close()
    proc.wait(timeout=15)
    print('MCP LIVE: PASS')


main()
