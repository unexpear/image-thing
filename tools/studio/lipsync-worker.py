import asyncio
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

async def analyze(request,emit):
    root=Path(__file__).resolve().parents[2]
    exe=root/'tools/rhubarb/Rhubarb-Lip-Sync-1.14.0-Windows/rhubarb.exe'
    if not exe.is_file():raise ValueError('Rhubarb is not installed.')
    async def run(args):
        proc=await asyncio.create_subprocess_exec(*map(str,args),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            out,err=await proc.communicate()
            if proc.returncode:raise RuntimeError(err.decode('utf-8','replace')[-2000:])
            return out
        finally:
            if proc.returncode is None:proc.kill();await proc.wait()
    with tempfile.TemporaryDirectory(prefix='studio-lipsync-') as temp:
        metadata=json.loads(await run([shutil.which('ffprobe'),'-v','error','-show_entries','format=duration','-of','json',request['audio_file']]))
        if float(metadata['format']['duration'])>300:raise ValueError('Split voice takes longer than five minutes before lip-sync analysis.')
        folder=Path(temp);audio=folder/'voice.wav';dialogue=folder/'dialogue.txt';dialogue.write_text(request.get('text',''),encoding='utf-8')
        emit({'stage':'Preparing a local voice take for mouth timing…'})
        await run([shutil.which('ffmpeg'),'-v','error','-nostdin','-y','-i',request['audio_file'],'-t','300','-ac','1','-ar','16000',audio])
        emit({'stage':'Finding mouth shapes in the voice recording…'})
        raw=await run([exe,'-f','json','-r','pocketSphinx','-d',dialogue,audio])
        data=json.loads(raw);return {'text':json.dumps({'mouthCues':data['mouthCues'],'duration':data['metadata']['duration']})}
