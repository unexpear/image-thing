"""Scoped startup fix for the installed ComfyUI frontend 1.49.6."""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'ComfyUI_windows_portable/python_embeded/Lib/site-packages/comfyui_frontend_package/static'
USER = ROOT / 'ComfyUI_windows_portable/ComfyUI/user/default'
BACKUP = ROOT / 'backups/frontend-startup-1.49.6'
ASSET = STATIC / 'assets/settingStore-CwkLtSKP.js'
BEFORE = 'mt(()=>$.rootGraph?.events,`configured`,resetSelectedToWorkflow)'
AFTER = 'mt(()=>$.isGraphReady?$.rootGraph.events:void 0,`configured`,resetSelectedToWorkflow)'

def main():
    content = ASSET.read_text(encoding='utf-8')
    if BEFORE in content:
        if content.count(BEFORE) != 1:
            raise RuntimeError('Unexpected frontend; refusing ambiguous patch')
        BACKUP.mkdir(parents=True, exist_ok=True)
        backup = BACKUP / ASSET.name
        if not backup.exists():
            shutil.copy2(ASSET, backup)
        ASSET.write_text(content.replace(BEFORE, AFTER), encoding='utf-8')
        (BACKUP / 'patch.json').write_text(json.dumps({
            'asset': str(ASSET), 'before': BEFORE, 'after': AFTER,
            'original_sha256': hashlib.sha256(backup.read_bytes()).hexdigest(),
            'patched_sha256': hashlib.sha256(ASSET.read_bytes()).hexdigest(),
            'source': 'src/stores/appModeStore.ts useEventListener target getter',
        }, indent=2), encoding='utf-8')
        print('Added graph readiness guard to app-mode listener')
    elif AFTER not in content:
        raise RuntimeError('Frontend version changed; review the new source before applying')
    # The packaged default is Z-Image, whose weights are not installed here.
    # Replace only that default constant; blank/new and saved graphs stay intact.
    content = ASSET.read_text(encoding='utf-8')
    start = content.index('Lu=') + len('Lu=')
    end = content.index(',Ru=JSON.stringify(Lu)', start)
    current = content[start:end]
    if 'z_image_turbo_bf16.safetensors' in current:
        workflow = json.loads((ROOT / 'workflows/Qwen Edit 2511 - Fast 4-step.json').read_text(encoding='utf-8'))
        replacement = json.dumps(workflow, ensure_ascii=True, separators=(',', ':'))
        ASSET.write_text(content[:start] + replacement + content[end:], encoding='utf-8')
        manifest = json.loads((BACKUP / 'patch.json').read_text(encoding='utf-8'))
        manifest['default_workflow'] = 'Qwen Edit 2511 - Fast 4-step.json'
        manifest['patched_sha256'] = hashlib.sha256(ASSET.read_bytes()).hexdigest()
        (BACKUP / 'patch.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print('Set the installed Qwen workflow as the fresh-session default')
    elif 'qwen-image-edit-2511-Q2_K.gguf' not in current:
        raise RuntimeError('Unexpected default workflow; refusing to replace it')
    elif any(label in current for label in ('leather_sofa.png', '1 · Upload your image', r'1 \u00b7 Upload your image')):
        replacement = current.replace('leather_sofa.png', '').replace('1 · Upload your image', '1 · Choose or upload your image (required)').replace(r'1 \u00b7 Upload your image', r'1 \u00b7 Choose or upload your image (required)')
        ASSET.write_text(content[:start] + replacement + content[end:], encoding='utf-8')
        manifest = json.loads((BACKUP / 'patch.json').read_text(encoding='utf-8'))
        manifest['patched_sha256'] = hashlib.sha256(ASSET.read_bytes()).hexdigest()
        (BACKUP / 'patch.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
        print('Removed the deleted sample from the default Qwen workflow')
    (USER / 'subgraphs').mkdir(exist_ok=True)
    for path, initial in [(USER / 'user.css', '/* Optional user styles. */\n'),
                          (STATIC / 'user.css', '/* Optional legacy user styles. */\n'),
                          (USER / 'comfy.templates.json', '[]\n')]:
        if not path.exists():
            path.write_text(initial, encoding='utf-8')
            print(f'Initialized {path.name}')

if __name__ == '__main__':
    main()
