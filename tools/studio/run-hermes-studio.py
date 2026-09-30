r"""Temporarily run a 64K Bonsai server for Hermes, then restore normal Bonsai.

Invoke with D:\ai\Local-Models\bridge-runtime\Scripts\python.exe.
Only the owned server is terminated; busy shared models are left alone.
"""
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from filelock import FileLock

ROOT=Path(__file__).resolve().parents[2]
MODELS=Path(r'D:\ai\Local-Models')
sys.path.insert(0,str(MODELS))
import local_models_mcp as bridge


def get(url):
    with urllib.request.urlopen(url,timeout=3) as response:return json.load(response)


async def main():
    with FileLock(str(MODELS/'inference.lock'),timeout=1):
        queue=get('http://127.0.0.1:8188/queue')
        if queue['queue_running'] or queue['queue_pending'] or get('http://127.0.0.1:8188/studio/director/status')['state']=='running':
            raise RuntimeError('Finish Studio generation and assembly before running Hermes.')
        if await bridge.loaded_lms() or (await bridge.local_get('http://127.0.0.1:11434/api/ps') or {}).get('models'):
            raise RuntimeError('An external GPU model is loaded. Unload it before starting Hermes.')
        if await bridge.local_get('http://127.0.0.1:8089/health'):
            raise RuntimeError('Port 8089 already has a server; it was left alone.')
        request=urllib.request.Request('http://127.0.0.1:8188/free',data=b'{"unload_models":true,"free_memory":true}',headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(request,timeout=10):pass
        restore=await bridge.stop_idle_bonsai()
        proc=None
        needle=None
        try:
            with (ROOT/'logs/hermes-bonsai.log').open('w',encoding='utf-8') as log:
                proc=subprocess.Popen([str(MODELS/'bonsai-runtime/llama-server.exe'),'-m',str(MODELS/'models/Bonsai-2-27B/Ternary-Bonsai-2-27B-PTQ1_0.gguf'),'--alias','bonsai-2-27b','--host','127.0.0.1','--port','8089','-c','65536','-np','1','-ngl','auto','--fit-target','768','-fa','on','--jinja','--cache-type-k','q8_0','--cache-type-v','q8_0','--no-kv-offload','--reasoning-budget','128'],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
                for attempt in range(120):
                    if proc.poll() is not None:raise RuntimeError('Hermes model failed to load; see logs/hermes-bonsai.log.')
                    if (await bridge.local_get('http://127.0.0.1:8089/health') or {}).get('status')=='ok':break
                    await asyncio.sleep(1)
                else:raise TimeoutError('Hermes model startup exceeded two minutes.')
                props=get('http://127.0.0.1:8089/props')
                (ROOT/'reports/studio/hermes-server-props.json').write_text(json.dumps(props,indent=2),encoding='utf-8')
                print('Hermes model ready: 64K context, cache in system RAM.',flush=True)
                needle=subprocess.Popen([sys.executable,str(ROOT/'tools/studio/hermes-needle-mcp.py')],stdout=log,stderr=log,creationflags=subprocess.CREATE_NO_WINDOW)
                await asyncio.sleep(2)
                if needle.poll() is not None:raise RuntimeError('Needle MCP did not start; see logs/hermes-bonsai.log.')
                child=await asyncio.create_subprocess_exec(str(ROOT/'tools/hermes-runtime/Scripts/python.exe'),str(ROOT/'tools/studio/hermes-review.py'),*sys.argv[1:],env={**os.environ,'PYTHONUTF8':'1','PYTHONIOENCODING':'utf-8'},creationflags=subprocess.CREATE_NO_WINDOW)
                try:
                    code=await asyncio.wait_for(child.wait(),360)
                except BaseException:
                    child.terminate();await child.wait();raise
                if code:raise RuntimeError(f'Hermes exited with code {code}.')
        finally:
            if needle and needle.poll() is None:
                needle.terminate()
                await asyncio.to_thread(needle.wait)
            if proc and proc.poll() is None:
                proc.terminate()
                await asyncio.to_thread(proc.wait)
            if restore:await bridge.start_bonsai()


if __name__=='__main__':asyncio.run(main())
