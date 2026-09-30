"""Verify the completed synthetic hour recording and assemble it through Director."""
import json
from pathlib import Path
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / 'reports/studio/director-hour-final-check.json'
CAPTURE = ROOT / 'reports/studio/director-one-hour-check.json'


def command(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=600,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode or result.stderr.strip():
        raise RuntimeError(result.stderr or f'Command failed: {result.returncode}')
    return result.stdout


def request(route, body=None):
    req = urllib.request.Request('http://127.0.0.1:8188' + route,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'X-Studio-Director': '1'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def moving_sample(path, second):
    output = command(['ffmpeg', '-v', 'error', '-nostdin', '-threads', '2',
        '-ss', str(second), '-i', str(path), '-t', '2', '-map', '0:v:0',
        '-f', 'framemd5', '-'])
    frames = [line.split(',')[-1].strip() for line in output.splitlines()
              if line.strip() and not line.startswith('#')]
    assert len(frames) >= 12 and len(set(frames)) >= 6, (second, len(frames), len(set(frames)))
    return {'startSecond': second, 'decodedFrames': len(frames), 'uniqueFrames': len(set(frames))}


def main():
    capture = json.loads(CAPTURE.read_text())
    if capture['state'] != 'recorded':
        raise RuntimeError('The one-hour capture has not completed successfully; leave its process running.')
    ref = capture['file']
    input_root = (ROOT / 'ComfyUI_windows_portable/ComfyUI/input').resolve()
    path = (input_root / ref['subfolder'] / ref['name']).resolve()
    assert path.is_relative_to(input_root) and path.stat().st_size == capture['bytes']
    assert capture['bytes'] > 64 * 1024 * 1024, 'Fixture did not exercise the chunked upload path.'
    result = {'state': 'checking', 'source': str(path), 'bytes': capture['bytes']}
    REPORT.write_text(json.dumps(result, indent=2))
    packets = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_packets', '-show_entries', 'packet=pts_time,duration_time', '-of', 'json', str(path)]))['packets']
    first = min(float(p['pts_time']) for p in packets)
    last = max(float(p['pts_time']) + float(p.get('duration_time', 0)) for p in packets)
    # This endurance fixture predates the start-event timing correction.
    # Keep its measured startup hold visible instead of claiming exact raw duration.
    startup_hold = float(packets[1]['pts_time']) - first
    animation_duration = last - float(packets[1]['pts_time'])
    assert 3599 <= animation_duration <= 3601, (first, last, startup_hold)
    result.update(packetCount=len(packets), recordedDuration=last-first,
                  startupHold=startup_hold, animationDuration=animation_duration,
                  sourceSamples=[moving_sample(path, 3), moving_sample(path, 3597)])
    status = request('/studio/director/status')
    if status['state'] == 'running':
        raise RuntimeError('Another assembly is running; retry verification after it finishes.')
    request('/studio/director/render', {'width': 640, 'shots': [{'seconds': 3600, 'media': ref}]})
    started = time.monotonic()
    while True:
        status = request('/studio/director/status')
        result.update(state='assembling', assembly=status, assemblySeconds=time.monotonic()-started)
        REPORT.write_text(json.dumps(result, indent=2))
        if status['state'] != 'running':
            break
        if time.monotonic()-started > 1800:
            raise RuntimeError('Assembly observation timed out; inspect the existing backend job before retrying.')
        time.sleep(5)
    assert status['state'] == 'done', status
    ref = status['output']
    output_root = (ROOT / 'ComfyUI_windows_portable/ComfyUI/output').resolve()
    output = (output_root / ref['subfolder'] / ref['filename']).resolve()
    assert output.is_relative_to(output_root)
    probe = json.loads(command(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type,width,height,nb_frames', '-of', 'json', str(output)]))
    assert abs(float(probe['format']['duration'])-3600) < .1, probe
    assert any(s.get('nb_frames') == '86400' for s in probe['streams']), probe
    assert any(s.get('codec_type') == 'audio' for s in probe['streams']), probe
    result.update(state='passed', output=str(output), outputProbe=probe,
                  outputSamples=[moving_sample(output, 3), moving_sample(output, 3597)])
    REPORT.write_text(json.dumps(result, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        REPORT.write_text(json.dumps({'state': 'error', 'message': str(error)}, indent=2))
        raise
