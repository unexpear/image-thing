"""Episode music must continue across picture cuts, with matching trims/fades."""
import json
import math
from pathlib import Path
import struct
import subprocess
import time
import urllib.request
import urllib.error
import wave
from PIL import Image

root=Path(__file__).resolve().parents[2]
folder=root/'ComfyUI_windows_portable/ComfyUI/input/studio-episode-audio-test'
folder.mkdir(exist_ok=True)
Image.new('RGB',(320,180),(40,80,120)).save(folder/'board.png')
with wave.open(str(folder/'score.wav'),'wb') as w:
    w.setparams((1,2,24000,0,'NONE','not compressed'))
    w.writeframes(b''.join(struct.pack('<h',int((500 if i<24000 else 6000)*math.sin(2*math.pi*440*i/24000))) for i in range(144000)))
def file(name):return {'name':name,'subfolder':folder.name,'type':'input'}
def api(route,body=None):
    req=urllib.request.Request('http://127.0.0.1:8188'+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
for _ in range(60):
    try:status=api('/studio/director/status');break
    except OSError:time.sleep(1)
assert status['state']!='running'
track={'id':'music','label':'Score','kind':'music','media':file('score.wav'),'start':.5,'sourceStart':1,'duration':3,'volume':.5,'fadeIn':.5,'fadeOut':.5,'muted':False}
body={'width':640,'shots':[{'seconds':1,'media':file('board.png')} for _ in range(4)],'episodeAudio':[track,{**track,'id':'muted','muted':True,'volume':1}]}
for invalid in [{'fadeOut':4},{'volume':2},{'start':-1},{'muted':'false'}]:
    try:api('/studio/director/render',{**body,'episodeAudio':[{**track,**invalid}]})
    except urllib.error.HTTPError as e:assert e.code==400
    else:raise AssertionError('Invalid episode track accepted')
api('/studio/director/render',body)
for _ in range(120):
    state=api('/studio/director/status')
    if state['state']!='running':break
    time.sleep(.5)
assert state['state']=='done',state
output=root/'ComfyUI_windows_portable/ComfyUI/output'/state['output']['subfolder']/state['output']['filename']
pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-vn','-ac','1','-ar','24000','-f','s16le','-'])
samples=struct.unpack('<'+'h'*(len(pcm)//2),pcm)
def rms(a,b):
    x=samples[int(a*24000):int(b*24000)];return math.sqrt(sum(n*n for n in x)/len(x))
levels={name:rms(a,b) for name,a,b in [('before',.1,.3),('fade_in',.55,.65),('middle',1.2,1.4),('cut_left',1.85,1.95),('cut_right',2.05,2.15),('fade_out',3.35,3.45),('after',3.7,3.9)]}
assert levels['before']<10 and levels['after']<10,levels
assert 1300<levels['middle']<1700,levels  # Source trim selects loud section; muted duplicate is absent.
assert .9<levels['cut_left']/levels['cut_right']<1.1,levels
assert levels['fade_in']<levels['middle']*.4 and levels['fade_out']<levels['middle']*.4,levels
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,nb_frames','-of','json',str(output)]))
assert any(s.get('nb_frames')=='96' for s in probe['streams']),probe
report={'ok':True,'rms':levels,'probe':probe,'output':str(output),'checked':['cross-shot continuity','start/end silence','source trim','fade in/out','muted clip excluded','96 video frames','invalid requests']}
(root/'reports/studio/director-episode-audio-render-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
