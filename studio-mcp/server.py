"""Studio MCP server (stdio). Thin authenticated HTTP client of studio_jobs.
Reads config from environment: STUDIO_BASE (literal loopback URL),
STUDIO_CREDENTIAL_FILE (path to local credential file). Stdout carries
protocol messages only; diagnostics go to stderr.
"""
import json
import os
import subprocess
import sys
import urllib.request

from mcp.server.mcpserver import MCPServer

BASE = os.environ.get('STUDIO_BASE', 'http://127.0.0.1:8188')
CRED_FILE = os.environ.get('STUDIO_CREDENTIAL_FILE', '')

mcp = MCPServer('studio')


def _token():
    with open(CRED_FILE) as f:
        return f.read().strip()


def _call(method, path, body=None):
    req = urllib.request.Request(
        BASE + path, method=method,
        headers={'Authorization': 'Bearer ' + _token(),
                 'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}')
        except ValueError:
            return e.code, {}


def _start(kind, parameters, idempotency_key):
    st, status = _call('GET', '/studio/status')
    if st != 200:
        return {'error': 'backend-unavailable', 'http': st, 'detail': status}
    epoch = status.get('epoch')
    st, res = _call('POST', '/studio/jobs',
                    {'schema_version': 1, 'kind': kind,
                     'expected_epoch': epoch, 'idempotency_key': idempotency_key,
                     'parameters': parameters})
    if st not in (200, 202):
        return {'error': 'start-rejected', 'http': st, 'detail': res}
    job = res.get('job', {})
    return {'job_id': job.get('job_id'), 'state': job.get('state'),
            'replay': res.get('replay', False),
            'note': 'Accepted, not finished. Poll job_status, then job_result.'}


@mcp.tool()
def generate_image(workflow_id: str, prompt: str, image_artifact_id: str,
                   seed: int | None = None, idempotency_key: str = '') -> dict:
    """Start a registered image workflow. Returns accepted job metadata; poll job_status."""
    params = {'workflow_id': workflow_id, 'prompt': prompt, 'image': image_artifact_id}
    if seed is not None:
        params['seed'] = seed
    return _start('generate_image', params, idempotency_key or f'img-{workflow_id}')


@mcp.tool()
def generate_video(mode: str, description: str, asset_artifact_id: str,
                   seed: int | None = None, start: float = 0.0,
                   idempotency_key: str = '') -> dict:
    """Start animate (photo) or restyle (clip) video mode. Returns accepted job metadata."""
    wf = 'video-animate' if mode == 'animate' else 'video-restyle'
    params = {'workflow_id': wf, 'description': description, 'seed': seed,
              ('photo' if mode == 'animate' else 'clip'): asset_artifact_id,
              'start': start}
    return _start('generate_video', {k: v for k, v in params.items() if v is not None},
                  idempotency_key or f'vid-{mode}')


@mcp.tool()
def generate_mesh(front_artifact_id: str, detail: int = 128, faces: int = 5000,
                  steps: int = 10, seed: int | None = None,
                  idempotency_key: str = '') -> dict:
    """Start the Hunyuan mesh workflow (studio_mesh metadata included). Returns accepted job metadata."""
    params = {'workflow_id': 'mesh-hunyuan', 'front': front_artifact_id,
              'detail': detail, 'faces': faces, 'steps': steps}
    if seed is not None:
        params['seed'] = seed
    return _start('generate_mesh', params, idempotency_key or 'mesh-1')


@mcp.tool()
def blender_post(source_artifact_id: str, preset: str = 'preserve',
                 decimate_target: int | None = None, recenter: bool = False,
                 apply_scale: bool = False, uv_replace: bool = False,
                 idempotency_key: str = '') -> dict:
    """Start selected Blender mesh operations on a registered GLB. Destructive options are explicit."""
    ops: dict = {}
    if decimate_target:
        ops['decimate_target'] = decimate_target
    if recenter:
        ops['recenter'] = True
    if apply_scale:
        ops['apply_scale'] = True
    if uv_replace:
        ops['uv_replace'] = True
    return _start('blender_post',
                  {'source_artifact_id': source_artifact_id, 'preset': preset, 'ops': ops},
                  idempotency_key or 'post-1')


@mcp.tool()
def blender_render(source_artifact_id: str, idempotency_key: str = '') -> dict:
    """Start the fixed multi-view preview (6 PNGs + contact sheet) on a registered GLB."""
    return _start('blender_render', {'source_artifact_id': source_artifact_id},
                  idempotency_key or 'render-1')


@mcp.tool()
def parametric_mesh(recipe_id: str, parameters: dict | None = None,
                    idempotency_key: str = '') -> dict:
    """Generate a registered procedural recipe (box/sphere/cylinder/plane/display_plinth). Deterministic headless geometry."""
    return _start('parametric_mesh',
                  {'recipe_id': recipe_id, 'parameters': parameters or {}},
                  idempotency_key or 'param-1')


@mcp.tool()
def job_status(job_id: str) -> dict:
    """Read one managed job (state, stage, error)."""
    st, res = _call('GET', f'/studio/jobs/{job_id}')
    return {'http': st, 'job': res.get('job')}


@mcp.tool()
def job_result(job_id: str) -> dict:
    """Read terminal result metadata + registered artifact references. 409 while not terminal: poll again, never resubmit."""
    st, res = _call('GET', f'/studio/jobs/{job_id}/result')
    return {'http': st, 'job': res.get('job'), 'detail': res if st != 200 else None}


@mcp.tool()
def job_cancel(job_id: str) -> dict:
    """Request cancellation of one exact job (idempotent)."""
    st, res = _call('POST', f'/studio/jobs/{job_id}/cancel')
    return {'http': st, 'result': res}


def _director(method, path, body=None):
    """Call an assistant route. These are guarded by the Director header rather
    than the jobs credential; the real boundary is the loopback bind."""
    req = urllib.request.Request(
        BASE + path, method=method,
        headers={'X-Studio-Director': '1', 'Content-Type': 'application/json'})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or '{}')
        except ValueError:
            return e.code, {}


@mcp.tool()
def generate_speech(text: str, engine: str = 'kokoro', voice: str = 'bm_george',
                    speed: float = 0.9, delivery: float = 0.5, pacing: float = 0.5) -> dict:
    """Start a spoken line. Returns an accepted job; poll speech_status.

    engine 'kokoro' reads evenly at about 2.4x realtime and uses voice and speed.
    engine 'chatterbox' acts the line at about 10x realtime and uses delivery
    (0.0 flat to 1.5 theatrical) and pacing (0.1 to 1.0; lower tightens a fast
    line). Both run on the CPU, so Studio image and video jobs keep running.
    Text is limited to 1,000 characters.
    """
    body = {'kind': 'voice', 'text': text, 'engine': engine,
            'voice': voice, 'speed': speed, 'delivery': delivery, 'pacing': pacing}
    st, res = _director('POST', '/studio/assistant', body)
    if st != 200:
        return {'error': 'speech-rejected', 'http': st, 'detail': res}
    return {'job_id': res.get('id'), 'engine': engine,
            'note': 'Accepted, not finished. Poll speech_status for the audio reference.'}


@mcp.tool()
def speech_status(job_id: str) -> dict:
    """Progress or result of a speech job, including the audio reference to attach."""
    st, res = _director('GET', f'/studio/assistant/{job_id}')
    return {'http': st, 'state': res.get('state'), 'message': res.get('message'),
            'elapsed': res.get('elapsed'), 'result': res.get('result')}


@mcp.tool()
def speech_cancel(job_id: str) -> dict:
    """Cancel one speech or assistant job. The take is discarded."""
    st, res = _director('POST', f'/studio/assistant/{job_id}/cancel')
    return {'http': st, 'result': res}


@mcp.tool()
def list_voices() -> dict:
    """Every installed Kokoro voice, with its accent, and the default."""
    st, res = _director('GET', '/studio/assistant/voices')
    return {'http': st, 'default': res.get('default'), 'voices': res.get('voices', [])}


@mcp.tool()
def verify_models(full: bool = False) -> dict:
    """Re-check installed models against their manifests.

    Confirms every weight file is present at its recorded size, that the Qwen
    text encoder still pairs with its vision projector, that each workflow
    resolves, and that the speech runtimes are intact. full=True also re-hashes
    about 30 GB, which takes roughly a minute and is the only pass that catches
    a file whose bytes changed without its size changing.
    """
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script = os.path.join(root, 'verify_models.py')
    python = os.path.join(root, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe')
    if not os.path.isfile(script) or not os.path.isfile(python):
        return {'error': 'verifier-missing', 'detail': script}
    command = [python, script, '--quiet']
    if full:
        command.insert(2, '--full')
    done = subprocess.run(command, cwd=root, capture_output=True, text=True,
                          timeout=900 if full else 120)
    summary = (done.stdout or done.stderr).strip().splitlines()
    return {'passed': done.returncode == 0, 'hashed': full,
            'summary': summary[-1] if summary else 'No output.'}


@mcp.tool()
def studio_status() -> dict:
    """Readiness, effective process profile, epoch, active work, capability summary."""
    st, res = _call('GET', '/studio/status')
    return {'http': st, 'status': res}


@mcp.tool()
def studio_catalog(section: str = 'workflows') -> dict:
    """Discover workflows, profiles, or recipes with bounded pagination."""
    st, res = _call('GET', f'/studio/catalog?section={section}')
    return {'http': st, 'catalog': res}


if __name__ == '__main__':
    if not CRED_FILE or not os.path.isfile(CRED_FILE):
        print('STUDIO_CREDENTIAL_FILE must point at the local credential file', file=sys.stderr)
        raise SystemExit(2)
    if not BASE.startswith('http://127.0.0.1:'):
        print('STUDIO_BASE must be a literal 127.0.0.1 URL', file=sys.stderr)
        raise SystemExit(2)
    mcp.run()
