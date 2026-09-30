"""Synthetic requests only, through the deployed Studio assistant API."""
import json
from pathlib import Path
import shutil
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
report=ROOT/'reports/studio/director-assistant-live-check.json'
results=[]
def api(path,body=None):
    request=urllib.request.Request('http://127.0.0.1:8188'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json','X-Studio-Director':'1'})
    with urllib.request.urlopen(request,timeout=20) as response:return json.load(response)
def wait(key):
    start=time.monotonic()
    while time.monotonic()-start<360:
        job=api('/studio/assistant/'+key)
        report.write_text(json.dumps({'state':'running','current':job,'results':results},indent=2))
        if job['state'] not in ('running','cancelling'):return job
        time.sleep(2)
    raise RuntimeError('Observation timed out; inspect the existing assistant job before retrying.')
try:
    for body in [{'kind':'shot','text':'Mira waves in the observatory for 6 seconds.'},{'kind':'write','model':'bonsai','text':'Write one short action sentence for a silent cartoon robot named Mira fixing a telescope. No dialogue.'}]:
        key=api('/studio/assistant',body)['id'];job=wait(key);results.append(job)
        assert job['state']=='done',job
    source=Path(r'D:\ai\Local-Models\test-speech.wav')
    dest=ROOT/'ComfyUI_windows_portable/ComfyUI/input/studio-director-test/assistant-synthetic-speech.wav'
    dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
    key=api('/studio/assistant',{'kind':'transcribe','audio':{'name':dest.name,'subfolder':'studio-director-test','type':'input'}})['id'];job=wait(key);results.append(job)
    assert job['state']=='done' and 'local speech model' in job['result']['text'].lower(),job
    key=api('/studio/assistant',{'kind':'write','model':'bonsai','text':'Write a detailed cartoon episode outline in twelve paragraphs.'})['id']
    api('/studio/assistant/'+key+'/cancel',{});job=wait(key);results.append(job)
    assert job['state']=='cancelled',job
    report.write_text(json.dumps({'state':'passed','results':results},indent=2))
except Exception as error:
    report.write_text(json.dumps({'state':'error','error':str(error),'results':results},indent=2));raise
