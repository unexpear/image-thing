import json
from pathlib import Path
import time
import urllib.request
root=Path(__file__).resolve().parents[2]
def api(route,body=None,timeout=60):
    req=urllib.request.Request('http://127.0.0.1:8188'+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)
job=(root/'reports/studio/vision-review-test-job.txt').read_text().strip()
for _ in range(180):
    review=api('/studio/assistant/'+job)
    if review['state'] not in ('running','cancelling'):break
    time.sleep(5)
else:raise RuntimeError('Vision job did not settle.')
(root/'reports/studio/vision-review-check.json').write_text(json.dumps(review,indent=2))
print('Vision review:',review['state'],flush=True)
def file(name):return {'name':name,'subfolder':'studio-episode-audio-test','type':'input'}
body={'width':640,'shots':[{'seconds':2,'media':file('board.png'),'audio':file('score.wav')} for _ in range(2)],'masterAudio':True}
def render():
    api('/studio/director/render',body)
    for _ in range(90):
        state=api('/studio/director/status')
        if state['state']!='running':break
        time.sleep(1)
    assert state['state']=='done',state
    return state
first=render();cache=root/'studio-data/director-render-cache';before={str(p):p.stat().st_mtime_ns for p in cache.glob('*/shot*.mp4') if '.part.' not in p.name}
second=render();after={str(p):p.stat().st_mtime_ns for p in cache.glob('*/shot*.mp4') if '.part.' not in p.name};assert before==after and before
levels=api('/studio/director/loudness',second['output']);assert float(levels['truePeak'])<0
assert abs(float(levels['integrated'])+16)<1,levels
(root/'reports/studio/director-finishing-check.json').write_text(json.dumps({'cacheReuse':True,'loudness':levels,'output':second['output']},indent=2))
print('Export checkpoint reuse and loudness passed:',levels,flush=True)
for model,text in [('nimble','Mira wants to save her stranded brother. She repairs the radio despite a storm, but its battery dies. She chooses to climb the tower to signal rescuers.'),('laya','The footsteps slip across the floor during the walk. Fix the foot contact.')]:
    job=api('/studio/assistant',{'kind':'review','model':model,'text':text})['id']
    for _ in range(180):
        state=api('/studio/assistant/'+job)
        if state['state'] not in ('running','cancelling'):break
        time.sleep(5)
    (root/f'reports/studio/{model}-review-check.json').write_text(json.dumps(state,indent=2))
    print(model,state['state'],state.get('message'),flush=True)
    assert state['state']=='done',state
