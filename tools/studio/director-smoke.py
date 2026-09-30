"""Real CPU assembly smoke test, using only newly created solid-color fixtures."""
import json
from pathlib import Path
import time
import urllib.request
import urllib.error
import subprocess
from PIL import Image

root=Path(__file__).resolve().parents[2]
inputs=root/'ComfyUI_windows_portable/ComfyUI/input/studio-director-test'
inputs.mkdir(exist_ok=True)
for name,color in [('red.png','red'),('blue.png','blue')]:Image.new('RGB',(64,64),color).save(inputs/name)
def request(path,body=None):
    req=urllib.request.Request('http://127.0.0.1:8188'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=15) as response:return json.load(response)
shot=lambda name,seconds:dict(seconds=seconds,media=dict(name=name,subfolder='studio-director-test',type='input'))
try:
    request('/studio/director/render',dict(width=640,shots=[shot('red.png',600)]*24+[shot('blue.png',1)]))
    raise AssertionError('Accepted over four hours')
except urllib.error.HTTPError as e:
    assert e.code==400
    assert 'four hours' in e.read().decode()
request('/studio/director/render',dict(width=640,shots=[shot('red.png',600)]))
time.sleep(.3)
request('/studio/director/cancel',{})
for _ in range(60):
    stopped=request('/studio/director/status')
    if stopped['state']!='running':break
    time.sleep(.2)
assert stopped['state']=='cancelled',stopped
request('/studio/director/render',dict(width=640,shots=[shot('red.png',1),shot('blue.png',1)]))
for _ in range(90):
    state=request('/studio/director/status')
    if state['state']!='running':break
    time.sleep(.5)
assert state['state']=='done',state
output=root/'ComfyUI_windows_portable/ComfyUI/output'/state['output']['subfolder']/state['output']['filename']
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',str(output)]))
assert 1.9<=float(probe['format']['duration'])<=2.15,probe
assert any(s['codec_type']=='video' and s['width']==640 and s['height']==360 for s in probe['streams'])
assert any(s['codec_type']=='audio' for s in probe['streams'])
print(json.dumps({'four_hour_limit':'passed','cancellation':'passed','two_shot_assembly':'passed','duration':probe['format']['duration'],'output':str(output)}))
