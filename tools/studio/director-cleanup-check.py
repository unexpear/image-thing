"""Exercise cleanup only against isolated synthetic temporary files."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
root=Path(__file__).resolve().parents[2]
class Routes:
    def get(self,*args):return lambda fn:fn
    post=get
class Queue:
    mutex=threading.RLock()
    def get_current_queue_volatile(self):return ([],[])
    def wipe_history(self):pass
with tempfile.TemporaryDirectory(prefix='studio-cleanup-check-') as temp:
    base=Path(temp);comfy=base/'portable'/'ComfyUI';input_dir=comfy/'input';input_dir.mkdir(parents=True)
    (input_dir/'used.png').write_bytes(b'fixture');(input_dir/'unused.png').write_bytes(b'fixture')
    sys.modules['folder_paths']=types.SimpleNamespace(get_input_directory=lambda:str(input_dir),get_output_directory=lambda:str(comfy/'output'),get_temp_directory=lambda:str(comfy/'temp'))
    sys.modules['server']=types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes(),prompt_queue=Queue())))
    spec=importlib.util.spec_from_file_location('cleanup',root/'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_cleanup/__init__.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ROOT=comfy;module.STAMP=comfy/'user'/'epoch.txt'
    saved=base/'studio-data/director-projects/test';saved.mkdir(parents=True);(saved/'latest.json').write_text(json.dumps({'media':{'name':'used.png','type':'input'}}))
    request=types.SimpleNamespace(headers={'X-Studio-Cleanup':'1'},can_read_body=False)
    response=asyncio.run(module.clear_media(request));assert response.status==200
    assert (input_dir/'used.png').is_file() and not (input_dir/'unused.png').exists()
    (input_dir/'unused.png').write_bytes(b'fixture');(saved/'latest.json').write_text('broken')
    response=asyncio.run(module.clear_media(request));assert response.status==409 and (input_dir/'unused.png').exists()
print('Cleanup protects saved media and fails closed on unreadable snapshots; synthetic files only.')
