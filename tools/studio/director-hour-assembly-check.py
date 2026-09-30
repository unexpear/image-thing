"""Produce and probe a real one-hour MP4 through the Director backend."""
import json
from pathlib import Path
import subprocess
import time
import urllib.request
from PIL import Image

root=Path(__file__).resolve().parents[2]
report=root/'reports/studio/director-hour-assembly-check.json'
def request(route,body=None):
    req=urllib.request.Request('http://127.0.0.1:8188'+route,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
try:
    for _ in range(60):
        try:
            status=request('/studio/director/status')
            break
        except OSError:time.sleep(1)
    if status['state']=='running':raise RuntimeError('An existing assembly is running; did not interrupt it.')
    source=root/'ComfyUI_windows_portable/ComfyUI/input/studio-director-test/hour-assembly-synthetic.png'
    source.parent.mkdir(parents=True,exist_ok=True)
    Image.new('RGB',(640,360),(30,70,110)).save(source)
    request('/studio/director/render',{'width':640,'shots':[{'seconds':3600,'media':{'name':source.name,'subfolder':'studio-director-test','type':'input'}}]})
    start=time.monotonic()
    while True:
        status=request('/studio/director/status')
        report.write_text(json.dumps({'elapsed':time.monotonic()-start,**status}),encoding='utf-8')
        if status['state']!='running':break
        if time.monotonic()-start>3600:raise RuntimeError('Hour assembly exceeded test timeout.')
        time.sleep(5)
    if status['state']!='done':raise RuntimeError(status['message'])
    output=root/'ComfyUI_windows_portable/ComfyUI/output'/status['output']['subfolder']/status['output']['filename']
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height,nb_frames','-of','json',str(output)]))
    assert abs(float(probe['format']['duration'])-3600)<.1,probe
    assert any(s.get('nb_frames')=='86400' for s in probe['streams']),probe
    report.write_text(json.dumps({'state':'passed','elapsed':time.monotonic()-start,'probe':probe,'output':str(output)},indent=2),encoding='utf-8')
except Exception as error:
    report.write_text(json.dumps({'state':'error','message':str(error)}),encoding='utf-8')
    raise
