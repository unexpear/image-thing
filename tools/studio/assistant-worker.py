"""Run installed local-model helpers in their isolated bridge environment."""
import asyncio
import audioop
import json
import math
from pathlib import Path
import sys
import subprocess
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


async def main():
    request = json.load(sys.stdin)
    marker = Path(sys.argv[1])
    if request.get('model') in ('vision','rhubarb'):
        import importlib.util
        vision=request['model']=='vision'
        spec=importlib.util.spec_from_file_location('local_review',Path(__file__).with_name('vision-review.py' if vision else 'lipsync-worker.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        work=module.review(request,emit) if vision else module.analyze(request,emit)
    else:work=speak(request) if request.get('model') in ENGINES else bridge.run_local_model(ctx=Progress(), **request)
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
