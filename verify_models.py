"""Re-verify every installed model after the fact.

Downloads are checksummed once, while they are being fetched. Nothing checks
them again, so a bad shutdown or a failing disk can leave a corrupted weight
file that loads without complaint and quietly produces garbage output. This
walks all four manifests and reports what no longer matches.

    python verify_models.py             # sizes, pairing and references, seconds
    python verify_models.py --full      # also re-hashes every file, several minutes
    python verify_models.py --full --json reports/studio/model-verification.json

Exit code 0 when everything passes, 1 when anything fails.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / 'ComfyUI_windows_portable/ComfyUI/ComfyUI/models'
if not MODELS.is_dir():
    MODELS = ROOT / 'ComfyUI_windows_portable/ComfyUI/models'
MANIFESTS = ('model-manifest.json', 'video-model-manifest.json',
             '3d-model-manifest.json', 'lightning8-manifest.json')
LOCAL_MODELS_CONFIG = Path(r'D:\ai\Local-Models\model-paths.json')
WEIGHT_SUFFIXES = ('.gguf', '.safetensors', '.sft', '.ckpt', '.pt')


def entries(manifest):
    """Yield (local path, declared size, sha256) from either manifest shape."""
    data = json.loads(manifest.read_text(encoding='utf-8'))
    for entry in (data if isinstance(data, list) else [data]):
        if 'file' in entry:  # lightning8-manifest keeps the raw Hugging Face record
            yield 'loras/' + entry['file']['rfilename'], entry['file']['size'], entry['file']['lfs']['sha256']
        else:
            yield entry['local'], entry['size'], entry['sha256']


def digest(path, on_progress=None):
    read = 0
    sha = hashlib.sha256()
    with path.open('rb') as handle:
        while chunk := handle.read(16 * 1024 * 1024):
            sha.update(chunk)
            read += len(chunk)
            if on_progress:
                on_progress(read)
    return sha.hexdigest()


def check_weights(full, log):
    """Every manifest entry against the file on disk."""
    results = []
    for name in MANIFESTS:
        manifest = ROOT / 'downloads' / name
        if not manifest.is_file():
            results.append({'check': 'manifest', 'name': name, 'ok': False,
                            'detail': 'Manifest is missing; cannot verify what it covered.'})
            continue
        for local, size, sha in entries(manifest):
            target = MODELS / local
            row = {'check': 'weight', 'manifest': name, 'file': local, 'ok': False}
            if not target.is_file():
                row['detail'] = 'File is missing. Re-download it.'
                results.append(row)
                continue
            actual = target.stat().st_size
            row['size'] = actual
            if actual != size:
                row['detail'] = f'Size is {actual:,} bytes; the manifest recorded {size:,}. Re-download it.'
                results.append(row)
                continue
            if not full:
                row['ok'] = True
                row['detail'] = f'Present, {actual:,} bytes (not hashed; use --full).'
                results.append(row)
                continue
            log(f'  hashing {local} ({actual / 1024**3:.2f} GiB)...')
            started = time.monotonic()
            found = digest(target)
            row['seconds'] = round(time.monotonic() - started, 1)
            row['ok'] = found == sha
            row['detail'] = ('SHA-256 matches the manifest.' if row['ok'] else
                             f'SHA-256 is {found}; the manifest recorded {sha}. The file is corrupt; re-download it.')
            results.append(row)
    return results


def strip_quant_suffix(name):
    """Same rule ComfyUI-GGUF uses when it pairs a text encoder with its mmproj."""
    match = re.search(r'[-_]?(?:ud-)?i?q[0-9]_[a-z0-9_\-]{1,8}$', name, re.IGNORECASE)
    return name[:match.start()] if match else name


def check_mmproj(log):
    """Qwen-Image-Edit needs a vision projector that nothing references explicitly.

    ComfyUI-GGUF finds it by matching filenames, so renaming the text encoder
    breaks image editing with only a line in the backend log.
    """
    results = []
    encoders = [p for p in (MODELS / 'text_encoders').glob('*.gguf')
                if 'mmproj' not in p.stem.lower() and 'qwen' in p.stem.lower()]
    for encoder in encoders:
        stem = strip_quant_suffix(encoder.stem.lower())
        matches = [p.name for p in encoder.parent.glob('*.gguf')
                   if 'mmproj' in p.stem.lower() and stem in p.stem.lower()]
        row = {'check': 'mmproj', 'file': encoder.name, 'matches': matches, 'ok': len(matches) == 1}
        if not matches:
            row['detail'] = (f"No mmproj matches '{stem}'. Qwen-Image-Edit will load but produce "
                             'broken edits. Restore the projector or rename it to match the encoder.')
        elif len(matches) > 1:
            row['detail'] = f'{len(matches)} projectors match; ComfyUI-GGUF silently uses the first. Remove the extras.'
        else:
            row['detail'] = f"Paired with '{matches[0]}'."
        results.append(row)
    if not encoders:
        results.append({'check': 'mmproj', 'ok': False,
                        'detail': 'No Qwen text encoder found to pair with a projector.'})
    return results


def check_references(log):
    """Every model filename the shipped workflows ask ComfyUI to load."""
    def walk(node, out):
        if isinstance(node, dict):
            for key, value in node.items():
                if isinstance(value, str) and value.endswith(WEIGHT_SUFFIXES):
                    out.add(value)
                else:
                    walk(value, out)
        elif isinstance(node, list):
            for item in node:
                walk(item, out)

    results = []
    sources = sorted((ROOT / 'workflows').glob('*.json'))
    sources += [ROOT / 'simple-editor/animate.api.json', ROOT / 'simple-editor/restyle.api.json']
    for source in sources:
        if not source.is_file():
            results.append({'check': 'reference', 'workflow': source.name, 'ok': False,
                            'detail': 'Workflow file is missing.'})
            continue
        wanted = set()
        walk(json.loads(source.read_text(encoding='utf-8')), wanted)
        for filename in sorted(wanted):
            found = next(MODELS.rglob(filename), None)
            results.append({'check': 'reference', 'workflow': source.name, 'file': filename,
                            'ok': found is not None,
                            'detail': 'Resolves.' if found else 'No such model file. This workflow cannot run.'})
    return results


def check_local_models(log):
    """Paths the local-model bridge hands to Director for speech, writing and transcription."""
    if not LOCAL_MODELS_CONFIG.is_file():
        return [{'check': 'local-model', 'ok': False,
                 'detail': f'{LOCAL_MODELS_CONFIG} is missing; Director assistants cannot run.'}]
    data = json.loads(LOCAL_MODELS_CONFIG.read_text(encoding='utf-8'))
    results = []
    for key, model in data.get('models', {}).items():
        missing = [f'{field}={value}' for field in
                   ('directory', 'weights', 'runtime', 'python', 'runner', 'start_script',
                    'adapter_weights', 'base_model_directory')
                   if (value := model.get(field)) and not Path(value).exists()]
        results.append({'check': 'local-model', 'file': key, 'ok': not missing,
                        'detail': 'All declared paths exist.' if not missing
                                  else 'Missing: ' + '; '.join(missing)})
    shared = data.get('shared_mcp', {})
    bridge = [p for p in [shared.get('command'), *shared.get('args', [])] if p]
    gone = [p for p in bridge if not Path(p).exists()]
    results.append({'check': 'local-model', 'file': 'shared_mcp', 'ok': not gone,
                    'detail': 'Bridge runtime present.' if not gone else 'Missing: ' + '; '.join(gone)})
    return results


def check_speech_runtimes(log):
    """Confirm each speech runtime has what it needs to actually produce audio.

    Chatterbox fails in a way nothing else catches: resemble-perth imports
    pkg_resources, and when that is missing the package swallows the error and
    sets its watermarker to None, so generation dies later with a confusing
    TypeError instead of a missing-dependency message. setuptools 81 removed
    pkg_resources, so a routine upgrade reintroduces it.
    """
    results = []
    if not LOCAL_MODELS_CONFIG.is_file():
        return results
    data = json.loads(LOCAL_MODELS_CONFIG.read_text(encoding='utf-8'))
    for key in ('kokoro', 'chatterbox'):
        model = data.get('models', {}).get(key)
        if not model:
            continue
        python = Path(model.get('python', ''))
        packages = python.parent.parent / 'Lib' / 'site-packages'
        row = {'check': 'speech-runtime', 'file': key, 'ok': packages.is_dir()}
        if not row['ok']:
            row['detail'] = f'No site-packages under {python.parent.parent}; the runtime is incomplete.'
            results.append(row)
            continue
        if key == 'chatterbox':
            if not (packages / 'pkg_resources').is_dir():
                row['ok'] = False
                row['detail'] = ('pkg_resources is missing, so resemble-perth will silently disable its '
                                 'watermarker and generation will fail. Install setuptools<81 into '
                                 f'{python}.')
            else:
                row['detail'] = 'Runtime present with pkg_resources for the watermarker.'
        else:
            row['detail'] = 'Runtime present.'
        results.append(row)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--full', action='store_true',
                        help='re-hash every weight file; several minutes and heavy disk reads')
    parser.add_argument('--json', metavar='PATH', help='also write the full report here')
    parser.add_argument('--quiet', action='store_true', help='print only the summary')
    args = parser.parse_args()

    def log(message):
        if not args.quiet:
            print(message, flush=True)

    if not MODELS.is_dir():
        print(f'Model folder not found: {MODELS}', file=sys.stderr)
        return 2

    started = time.monotonic()
    log(f'Verifying models in {MODELS}')
    log('Hashing every weight file. This reads about 30 GiB and takes a few minutes.'
        if args.full else 'Checking sizes, pairing and references. Use --full to re-hash the files.')

    results = []
    log('\nWeight files')
    results += check_weights(args.full, log)
    log('Vision projector pairing')
    results += check_mmproj(log)
    log('Workflow model references')
    results += check_references(log)
    log('Local-model bridge')
    results += check_local_models(log)
    log('Speech runtimes')
    results += check_speech_runtimes(log)

    failed = [r for r in results if not r['ok']]
    elapsed = round(time.monotonic() - started, 1)
    summary = (f'{len(results) - len(failed)} of {len(results)} checks passed in {elapsed}s'
               + (f'; {len(failed)} FAILED' if failed else '; everything matches'))

    if not args.quiet:
        for row in failed:
            print(f"\nFAILED  {row.get('file', row.get('name', row['check']))}\n        {row['detail']}")
    print('\n' + summary)

    if args.json:
        report = Path(args.json)
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps({
            'checked_at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'models_dir': str(MODELS),
            'hashed': args.full, 'elapsed_seconds': elapsed, 'passed': len(results) - len(failed),
            'total': len(results), 'summary': summary, 'results': results}, indent=2), encoding='utf-8')
        log(f'Report written to {report}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
