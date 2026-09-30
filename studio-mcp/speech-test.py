"""Live MCP test for the speech and verification tools.

Drives the real stdio server the way an agent harness would: list the tools,
read the installed voices, generate one short line, poll it to completion, and
verify the installed models. Requires a running backend (dev tool).
"""
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


def main():
    proc = subprocess.Popen([os.path.join(HERE, '.venv', 'Scripts', 'python.exe'),
                             '-u', os.path.join(HERE, 'server.py')],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, cwd=PROJECT, env=ENV)
    seq = [0]

    def send(method, params=None):
        seq[0] += 1
        message = {'jsonrpc': '2.0', 'id': seq[0], 'method': method}
        if params is not None:
            message['params'] = params
        proc.stdin.write((json.dumps(message) + '\n').encode())
        proc.stdin.flush()
        while True:
            line = proc.stdout.readline()
            if not line:
                raise SystemExit('server closed the connection')
            reply = json.loads(line)
            if reply.get('id') == seq[0]:
                return reply

    def call(name, arguments):
        reply = send('tools/call', {'name': name, 'arguments': arguments})
        content = reply.get('result', {}).get('content', [{}])
        return json.loads(content[0].get('text', '{}'))

    failures = []
    try:
        send('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {},
                            'clientInfo': {'name': 'speech-test', 'version': '1'}})
        proc.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
        proc.stdin.flush()

        listed = send('tools/list').get('result', {}).get('tools', [])
        names = {t['name'] for t in listed}
        print(f'{len(names)} tools exposed')
        for expected in ('generate_speech', 'speech_status', 'speech_cancel',
                         'list_voices', 'verify_models'):
            ok = expected in names
            print(f'  {"ok  " if ok else "MISS"} {expected}')
            if not ok:
                failures.append(f'{expected} not exposed')

        voices = call('list_voices', {})
        print(f"\nvoices: {len(voices.get('voices', []))}, default {voices.get('default')}")
        if len(voices.get('voices', [])) < 1:
            failures.append('no voices listed')

        started = call('generate_speech', {'text': 'Tool surface check.', 'engine': 'kokoro',
                                           'voice': 'bm_george', 'speed': 0.95})
        print('speech start:', started)
        job = started.get('job_id')
        if not job:
            failures.append('speech did not start')
        else:
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                time.sleep(2)
                status = call('speech_status', {'job_id': job})
                if status.get('state') not in ('running', 'cancelling'):
                    break
            print('speech finished:', status.get('state'), '|',
                  (status.get('result') or {}).get('seconds'), 'seconds')
            if status.get('state') != 'done':
                failures.append(f"speech ended {status.get('state')}")

        verified = call('verify_models', {'full': False})
        print('\nverify:', verified.get('summary'))
        if not verified.get('passed'):
            failures.append('model verification failed')
    finally:
        proc.terminate()
        proc.wait(timeout=10)

    print('\n' + ('FAILED: ' + '; '.join(failures) if failures else 'all speech MCP checks passed'))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
