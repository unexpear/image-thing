"""Small, sequential comparison; does not interrupt other jobs."""
import json, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
def get(path):
    return json.load(urllib.request.urlopen('http://127.0.0.1:8188' + path))

results = []
for label, steps, guidance, strength in [('edges4',4,'edges',1), ('source4',4,'source',1), ('source20',20,'source',1), ('source20strong',20,'source',1.2)]:
    while any(get('/queue')[k] for k in ['queue_running','queue_pending']): time.sleep(3)
    g=json.loads((ROOT/'simple-editor/restyle.api.json').read_text())
    g['4']['inputs'].update(file='studio-video/animate_00001_.mp4',frames=17)
    g['9']['inputs'].update(length=17,strength=strength)
    g['6']['inputs']['text']='A blue upholstered sofa in the same room. Keep the sofa shape, pillows, background, lighting and camera motion unchanged.'
    g['14']['inputs'].update(seed=24680,steps=steps)
    g['18']['inputs']['filename_prefix']='Qwen-Studio/Bench/'+label
    if guidance=='source':g['9']['inputs']['control_video']=['4',0];del g['5']
    if steps==20:g['12']['inputs']['model']=['1',0];del g['11'];g['14']['inputs']['cfg']=6
    request=urllib.request.Request('http://127.0.0.1:8188/prompt', data=json.dumps({'prompt':g}).encode(),headers={'Content-Type':'application/json'})
    prompt_id=json.load(urllib.request.urlopen(request))['prompt_id']
    peak=0;start=time.monotonic()
    while True:
        h=get('/history/'+prompt_id)
        device=get('/system_stats')['devices'][0]
        peak=max(peak,device['vram_total']-device['vram_free'])
        if prompt_id in h:break
        if time.monotonic()-start>1200:raise RuntimeError('Benchmark timeout; job remains in ComfyUI.')
        time.sleep(1)
    item=h[prompt_id];messages=item['status']['messages']
    timestamps={kind:data.get('timestamp') for kind,data in messages}
    result={'preset':label,'steps':steps,'guidance':guidance,'strength':strength,'seconds':(timestamps.get('execution_success',int(time.time()*1000))-timestamps['execution_start'])/1000,'peak_device_used_GiB':round(peak/2**30,2),'history':item}
    results.append(result);(ROOT/'logs/video-benchmark.json').write_text(json.dumps(results,indent=2))
    print(label,result['seconds'],result['peak_device_used_GiB'],item['status']['status_str'],flush=True)
    if not item['status']['completed']:break
