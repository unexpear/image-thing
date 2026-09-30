import concurrent.futures
import hashlib
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from download_models import download, BASE, ROOT

REPO = 'Comfy-Org/Wan_2.1_ComfyUI_repackaged'
FILES = [(REPO, 'split_files/' + name, name) for name in [
    'diffusion_models/wan2.1_vace_1.3B_fp16.safetensors',
    'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    'vae/wan_2.1_vae.safetensors',
]] + [('Kijai/WanVideo_comfy', 'Wan21_CausVid_bidirect2_T2V_1_3B_lora_rank32.safetensors',
       'loras/Wan21_CausVid_bidirect2_T2V_1_3B_lora_rank32.safetensors')]

def verified(item):
    result = download(item)
    with (BASE / 'models' / result['local']).open('rb') as file:
        digest = hashlib.file_digest(file, 'sha256').hexdigest()
    if digest != result['sha256']:
        raise RuntimeError('SHA256 mismatch: ' + result['local'])
    print('Verified ' + result['local'], flush=True)
    return result

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(verified, FILES))
    (ROOT / 'downloads/video-model-manifest.json').write_text(json.dumps(results, indent=2))
