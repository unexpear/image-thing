"""Run installed local-model helpers in their isolated bridge environment."""
import asyncio
import audioop
import base64
import json
import math
from pathlib import Path
import sys
import subprocess
import urllib.request
import wave

sys.path.insert(0, r'D:\ai\Local-Models')
import local_models_mcp as bridge

# The slowest supported path is a cold Occamy load (up to 240 seconds) followed
# by a full-length reply (up to 480), so the budget has to clear 720.
BUDGET = 900


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


class Progress:
    async def report_progress(self, **data):
        emit({'stage': data.get('message', 'Working locally…')})


def normalize(path, target_dbfs=-3.0, deadband_db=0.5):
    """Bring a take to a normal dialogue level, in either direction.

    The two engines fail opposite ways. Kokoro writes at roughly -25 dB mean
    and -9 dB peak, about ten decibels under where spoken dialogue sits, which
    sounds thin and distant under a shot. Chatterbox writes hot enough to touch
    0 dB, which clips. Peak-normalising to a fixed ceiling fixes both without
    touching the performance, and a small deadband avoids rewriting a file that
    is already close enough.
    """
    with wave.open(path, 'rb') as source:
        params = source.getparams()
        frames = source.readframes(params.nframes)
    if params.sampwidth != 2 or not frames:
        return None
    peak = audioop.max(frames, 2)
    if peak <= 0:
        return None
    ceiling = 32767 * (10 ** (target_dbfs / 20))
    factor = ceiling / peak
    if abs(20 * math.log10(factor)) < deadband_db:
        return None                     # Already within half a decibel of target.
    with wave.open(path, 'wb') as out:
        out.setparams(params)
        out.writeframes(audioop.mul(frames, 2, factor))
    return round(20 * math.log10(factor), 1)


ENGINES = {
    'kokoro': (r'D:\ai\Local-Models\kokoro-runtime\Scripts\python.exe',
               r'D:\ai\Local-Models\run_kokoro.py',
               'Generating speech locally on CPU…'),
    'chatterbox': (r'D:\ai\Local-Models\chatterbox-runtime\Scripts\python.exe',
                   r'D:\ai\Local-Models\run_chatterbox.py',
                   'Performing the line locally on CPU. This engine runs about ten times slower than the audio it makes…'),
}


async def speak(request):
    runtime, script, stage = ENGINES[request['model']]
    emit({'stage': stage})
    proc = await asyncio.create_subprocess_exec(
        runtime, script, '--request-json',
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE, creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        out, error = await proc.communicate(json.dumps(request).encode())
        if proc.returncode:
            raise RuntimeError(error.decode('utf-8', 'replace')[-2500:])
        result = json.loads(out.decode().strip().splitlines()[-1])
        lifted = normalize(result['file'])
        return {**result, 'text': request['text'], 'audio': request['audio'], 'gain_db': lifted}
    except BaseException:
        if proc.returncode is None:
            proc.kill()
            await proc.wait()
        raise


async def chat_endpoint(request):
    """OpenAI-compatible chat on this computer: Ollama, LM Studio, llama.cpp, or a custom server."""
    emit({'stage': 'Asking the model on this computer…'})
    content = request['prompt']
    image_file = request.get('image_file')
    if image_file:
        path = Path(image_file)
        mime = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'}.get(path.suffix.lower())
        if not path.is_file() or not mime:
            raise RuntimeError('The review image must be a local PNG, JPEG, or WebP.')
        encoded = base64.b64encode(path.read_bytes()).decode('ascii')
        content = [{'type': 'text', 'text': request['prompt']}, {'type': 'image_url', 'image_url': {'url': 'data:' + mime + ';base64,' + encoded}}]
    payload = json.dumps({
        'model': request['chat_model'],
        'messages': [{'role': 'user', 'content': content}],
        'max_tokens': int(request.get('max_tokens') or 512),
        'temperature': 0.7,
    }).encode()
    def post():
        call = urllib.request.Request(request['endpoint'], data=payload, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(call, timeout=180) as response:
            return json.load(response)
    try:
        data = await asyncio.to_thread(post)
    except Exception as error:
        raise RuntimeError('The local chat server did not answer. Start Ollama, LM Studio, or your custom server, and check the model name. ' + str(error)) from error
    try:
        text = data['choices'][0]['message']['content']
        if isinstance(text, list):
            text = ''.join(part.get('text', '') if isinstance(part, dict) else str(part) for part in text)
    except (KeyError, IndexError, TypeError):
        raise RuntimeError('The local chat server replied in an unexpected shape.')
    if not isinstance(text, str) or not text.strip():
        raise RuntimeError('The local chat server returned an empty reply.')
    return {'text': text}


async def main():
    request = json.load(sys.stdin)
    marker = Path(sys.argv[1])
    if request.get('model') in ('vision','rhubarb'):
        import importlib.util
        vision=request['model']=='vision'
        spec=importlib.util.spec_from_file_location('local_review',Path(__file__).with_name('vision-review.py' if vision else 'lipsync-worker.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        work=module.review(request,emit) if vision else module.analyze(request,emit)
    else:work=chat_endpoint(request) if request.get('model')=='endpoint' else speak(request) if request.get('model') in ENGINES else bridge.run_local_model(ctx=Progress(), **request)
    task = asyncio.create_task(work)
    async def cancellation():
        while not task.done():
            if marker.exists():
                task.cancel()
                return
            await asyncio.sleep(.3)
    watcher = asyncio.create_task(cancellation())
    try:
        result = await asyncio.wait_for(task, BUDGET)
        emit({'result': result})
    except asyncio.CancelledError:
        emit({'cancelled': True})
    except TimeoutError:
        emit({'error': f'The local model did not reply within {BUDGET // 60} minutes and was stopped. '
                       'Try a shorter request, or start the model once from its own launcher first.'})
    except Exception as error:
        emit({'error': str(error) or type(error).__name__})
    finally:
        watcher.cancel()


if __name__ == '__main__':
    asyncio.run(main())
