"""Isolated Bonsai image reviewer with conservative GPU offload."""
import asyncio
import base64
import subprocess
import socket
from pathlib import Path
import httpx
from filelock import FileLock
import local_models_mcp as bridge

async def review(request,emit):
    root=Path(r'D:\ai\Local-Models');lock=FileLock(str(root/'inference.lock'),timeout=1,thread_local=False)
    await asyncio.to_thread(lock.acquire)
    process=None;restore=False
    try:
        if await bridge.loaded_lms() or (await bridge.local_get('http://127.0.0.1:11434/api/ps') or {}).get('models'):raise ValueError('Unload other local chat models before image review.')
        restore=await bridge.stop_idle_bonsai()
        emit({'stage':'Loading the local image reviewer; Studio generation pauses for this review…'})
        args=[str(root/'bonsai-runtime/llama-server.exe'),'-m',str(root/'models/Bonsai-2-27B/Ternary-Bonsai-2-27B-PTQ1_0.gguf'),'--mmproj',str(root/'models/Bonsai-2-27B/Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf'),'--no-mmproj-offload','-ngl','auto','--fit-target','768','-np','1','--cache-type-k','q8_0','--cache-type-v','q8_0','--jinja','-fa','on','-c','4096','-t','4','--host','127.0.0.1','--port','8091','--alias','studio-vision','--image-max-tokens','512','--reasoning-budget','0']
        with socket.socket() as probe:
            try:probe.bind(('127.0.0.1',8091))
            except OSError:raise ValueError('Review port 8091 is already occupied. Nothing was stopped.') from None
        process=await asyncio.create_subprocess_exec(*args,stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
        async with httpx.AsyncClient(timeout=600,trust_env=False) as client:
            for _ in range(180):
                if process.returncode is not None:raise RuntimeError('Vision runtime exited while loading.')
                try:
                    response=await client.get('http://127.0.0.1:8091/health',timeout=2)
                    if response.status_code==200:break
                except httpx.HTTPError:pass
                await asyncio.sleep(1)
            else:raise RuntimeError('Vision runtime did not become ready.')
            path=Path(request['image_file']);mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.suffix.lower()]
            content=[{'type':'text','text':'Review the actual image against this brief in at most 80 words. Give visible evidence and a suggested fix for composition, drawing defects, light/value and prompt adherence. Mark uncertain details unknown. Do not infer unseen reference images. Brief: '+request['prompt']},{'type':'image_url','image_url':{'url':f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode()}}]
            emit({'stage':'Inspecting the image locally…'})
            response=await client.post('http://127.0.0.1:8091/v1/chat/completions',json={'model':'studio-vision','messages':[{'role':'user','content':content}],'max_tokens':256,'temperature':.2,'chat_template_kwargs':{'enable_thinking':False}});response.raise_for_status()
            choice=response.json()['choices'][0];return {'text':choice['message']['content'],'finish_reason':choice.get('finish_reason')}
    finally:
        try:
            if process and process.returncode is None:process.terminate();await process.wait()
            if restore:await bridge.start_bonsai()
        finally:lock.release()
