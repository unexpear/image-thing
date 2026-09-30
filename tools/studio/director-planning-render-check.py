"""Synthetic panel/audio integration check; never reads personal media."""
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
media=root/'ComfyUI_windows_portable/ComfyUI/input/studio-planning-test'
media.mkdir(exist_ok=True)
for name,color in [('red.png',(210,30,30)),('blue.png',(30,30,210))]:
    Image.new('RGB',(320,180),color).save(media/name)
with wave.open(str(media/'tone.wav'),'wb') as out:
    out.setparams((1,2,24000,0,'NONE','not compressed'))
    # The base voice becomes louder after one second; restarted audio is detectable.
    out.writeframes(b''.join(struct.pack('<h',int((1000 if i<24000 else 3000)*math.sin(2*math.pi*440*i/24000))) for i in range(72000)))
def file(name):return {'name':name,'subfolder':'studio-planning-test','type':'input'}
def api(route,body=None):
    req=urllib.request.Request('http://127.0.0.1:8188'+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
for i in range(60):
    try:
        status=api('/studio/director/status');break
    except OSError:time.sleep(1)
assert status['state']!='running','Did not interrupt existing assembly'
for invalid in [dict(frames=0),dict(audioOffset=-1),dict(audioTracks=[{'start':0,'volume':2}])]:
    try:api('/studio/director/render',{'width':640,'shots':[{'seconds':1,'media':file('red.png'),**invalid}]})
    except urllib.error.HTTPError as e:assert e.code==400
    else:raise AssertionError('Invalid render accepted')
shots=[{'seconds':25/24,'frames':25,'audioOffset':0,'media':file('red.png'),'audio':file('tone.wav')},
       {'seconds':47/24,'frames':47,'audioOffset':25/24,'media':file('blue.png'),'audio':file('tone.wav'),'audioTracks':[{'kind':'effects','start':2,'volume':.25,'media':file('tone.wav')}]}]
api('/studio/director/render',{'width':640,'shots':shots})
for i in range(120):
    state=api('/studio/director/status')
    if state['state']!='running':break
    time.sleep(.5)
assert state['state']=='done',state
output=root/'ComfyUI_windows_portable/ComfyUI/output'/state['output']['subfolder']/state['output']['filename']
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,nb_frames','-of','json',str(output)]))
assert abs(float(probe['format']['duration'])-3)<.1,probe
assert any(s.get('nb_frames')=='72' for s in probe['streams']),probe
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-vf','scale=1:1','-pix_fmt','rgb24','-f','rawvideo','-an','-'])
assert raw[3*10]>raw[3*10+2]+100 and raw[3*40+2]>raw[3*40]+100,'Panel order mismatch'
pcm=subprocess.check_output(['ffmpeg','-v','error','-i',str(output),'-vn','-ac','1','-ar','24000','-f','s16le','-'])
samples=struct.unpack('<'+'h'*(len(pcm)//2),pcm)
def rms(start,end):
    segment=samples[int(start*24000):int(end*24000)]
    return math.sqrt(sum(s*s for s in segment)/len(segment))
levels=[rms(.3,.7),rms(1.3,1.7),rms(2.3,2.7)]
assert levels[1]>levels[0]*2,'Voice restarted at panel cut'
assert levels[2]>levels[1]*1.03,'Delayed effects track missing'
report={'ok':True,'probe':probe,'audio_rms':levels,'output':str(output),'checked':['invalid requests','panel order','72 frames','continuous voice','delayed effects mix']}
(root/'reports/studio/director-planning-render-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
