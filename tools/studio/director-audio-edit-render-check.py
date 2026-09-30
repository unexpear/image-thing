"""Check streamed peaks and the music component of an exported ducked mix."""
import json
import math
from pathlib import Path
import struct
import subprocess
import time
import urllib.request
import urllib.error

root=Path(__file__).resolve().parents[2]
def file(name):return {'name':name,'subfolder':'studio-episode-audio-test','type':'input'}
def api(route,body=None):
    req=urllib.request.Request('http://127.0.0.1:8188'+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=200) as r:return json.load(r)
for _ in range(90):
    try:status=api('/studio/director/status');break
    except OSError:time.sleep(1)
assert status['state']!='running'
wave=api('/studio/director/waveform',{'media':file('score.wav')})
assert len(wave['peaks'])==1800 and abs(wave['duration']-6)<.01,wave['duration']
assert max(wave['peaks'][:200])<.02 and max(wave['peaks'][400:])>.17
for media in [file('../../../../not-an-audio-file.wav'),file('missing.wav')]:
    try:api('/studio/director/waveform',{'media':media})
    except urllib.error.HTTPError as e:assert e.code==400
    else:raise AssertionError('Unsafe or missing file accepted')
track={'id':'score','label':'Score','kind':'music','media':file('score.wav'),'start':0,'sourceStart':1,'duration':4,'volume':.5,'fadeIn':0,'fadeOut':0,'muted':False}
body={'width':640,'shots':[{'seconds':1,'media':file('board.png')} for _ in range(4)],'episodeAudio':[track],'ducking':{'enabled':True,'level':.25,'attack':.2,'release':.5},'dialogueWindows':[[1,2]]}
try:api('/studio/director/render',{**body,'ducking':{**body['ducking'],'attack':0}})
except urllib.error.HTTPError as e:assert e.code==400
else:raise AssertionError('Invalid ducking accepted')
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
levels=[rms(.3,.6),rms(1.3,1.6),rms(2.8,3.1)]
assert .22<levels[1]/levels[0]<.28,levels
assert .95<levels[2]/levels[0]<1.05,levels
report={'ok':True,'waveform_bins':1800,'source_seconds':wave['duration'],'rms_before_during_after':levels,'duck_ratio':levels[1]/levels[0],'output':str(output)}
(root/'reports/studio/director-audio-edit-render-check.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
