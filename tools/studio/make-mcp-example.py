"""Generate studio-mcp/opencode.example.jsonc from verified local paths.
Refuses to emit placeholders: any unresolved path blocks generation.
Validates the result parses as JSONC and carries type local + enabled false.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))


def fail(msg):
    print(f'BLOCKED: {msg}')
    raise SystemExit(1)


def main():
    venv_py = os.path.join(PROJECT, 'studio-mcp', '.venv', 'Scripts', 'python.exe')
    server = os.path.join(PROJECT, 'studio-mcp', 'server.py')
    cred = os.path.join(PROJECT, 'studio-data', 'credential')
    for label, p in (('venv python', venv_py), ('server script', server),
                     ('credential file', cred)):
        if not os.path.isfile(p):
            fail(f'{label} missing: {p}')
    doc = {
        '$schema': 'https://opencode.ai/config.json',
        'mcp': {
            'studio': {
                'type': 'local',
                'command': [venv_py, '-u', server],
                'cwd': PROJECT,
                'environment': {
                    'STUDIO_BASE': 'http://127.0.0.1:8188',
                    'STUDIO_CREDENTIAL_FILE': cred,
                },
                'enabled': False,
            }
        },
    }
    out = os.path.join(PROJECT, 'studio-mcp', 'opencode.example.jsonc')
    with open(out, 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')
    raw = open(out).read()
    back = json.loads(raw)
    entry = back['mcp']['studio']
    assert entry['type'] == 'local' and entry['enabled'] is False
    assert os.path.isfile(entry['command'][0]) and os.path.isfile(entry['command'][2])
    assert os.path.isfile(entry['environment']['STUDIO_CREDENTIAL_FILE'])
    print(f'wrote {out} (validated, disabled by default)')


main()
