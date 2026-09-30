"""Stdio handshake + tool discovery test for studio-mcp (dev tool)."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
ENV = dict(os.environ, STUDIO_BASE='http://127.0.0.1:8188',
           STUDIO_CREDENTIAL_FILE=os.path.join(PROJECT, 'studio-data', 'credential'),
           PYTHONSAFEPATH='1')


def rpc(proc, method, params=None, rid=1):
    msg = {'jsonrpc': '2.0', 'id': rid, 'method': method}
    if params is not None:
        msg['params'] = params
    proc.stdin.write((json.dumps(msg) + '\n').encode())
    proc.stdin.flush()
    return json.loads(proc.stdout.readline().decode())


proc = subprocess.Popen([os.path.join(HERE, '.venv', 'Scripts', 'python.exe'),
                         '-u', os.path.join(HERE, 'server.py')],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE, cwd=PROJECT, env=ENV)
init = rpc(proc, 'initialize', {'protocolVersion': '2025-11-25',
                                'capabilities': {}, 'clientInfo': {'name': 't', 'version': '0'}})
print('server:', (init.get('result') or {}).get('serverInfo'))
proc.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
proc.stdin.flush()
tools = rpc(proc, 'tools/list', {}, rid=2)
names = sorted(t['name'] for t in tools['result']['tools'])
print('tools:', names)
expected = {'generate_image', 'generate_video', 'generate_mesh', 'blender_post',
            'blender_render', 'job_status', 'job_result', 'job_cancel',
            'studio_status', 'studio_catalog'}
missing = expected - set(names)
assert not missing, f'missing tools: {missing}'
proc.stdin.close()
proc.wait(timeout=15)
err = proc.stderr.read().decode()
print('stderr bytes:', len(err))
print('HANDSHAKE: PASS')
