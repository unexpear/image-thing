"""Isolated runner fixture (Phase-1 gate). No backend needed."""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(PROJECT, 'ComfyUI_windows_portable', 'ComfyUI', 'custom_nodes'))
sys.path.insert(0, os.path.join(PROJECT, 'ComfyUI_windows_portable', 'ComfyUI'))

from studio_jobs import runner

staging = os.path.join(PROJECT, 'studio-data', 'staging')
os.makedirs(staging, exist_ok=True)

py = runner.resolve_exe('python')
print('exe:', py)

r = runner.run('fixture-ok', [py, '-s', '-c', 'print(123)'], 30,
               os.path.join(staging, 'fixture-ok.log'))
print('quick:', r)
assert r['exit_code'] == 0 and not r['timed_out'], r

sleepy = os.path.join(staging, 'sleeper.py')
with open(sleepy, 'w') as f:
    f.write('import time\ntime.sleep(60)\n')
r2 = runner.run('fixture-timeout', [py, '-s', sleepy], 5,
                os.path.join(staging, 'fixture-timeout.log'))
print('timeout:', {k: v for k, v in r2.items() if k != 'log'})
assert r2['timed_out'] and r2['exit_code'] is not None, r2

procs = subprocess.run(['tasklist', '/FO', 'CSV'], capture_output=True, text=True).stdout
assert 'sleeper.py' not in procs, 'child survived tree kill'
print('tree dead: True')
print('RUNNER FIXTURE: PASS')
