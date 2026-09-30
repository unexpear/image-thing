import concurrent.futures
import json
import pathlib
import subprocess
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
BASE = ROOT / 'ComfyUI_windows_portable' / 'ComfyUI'
FILES = [
 ('unsloth/Qwen-Image-Edit-2511-GGUF', 'qwen-image-edit-2511-Q2_K.gguf', 'unet/qwen-image-edit-2511-Q2_K.gguf'),
 ('unsloth/Qwen2.5-VL-7B-Instruct-GGUF', 'Qwen2.5-VL-7B-Instruct-UD-Q4_K_XL.gguf', 'text_encoders/Qwen2.5-VL-7B-Instruct-UD-Q4_K_XL.gguf'),
 ('unsloth/Qwen2.5-VL-7B-Instruct-GGUF', 'mmproj-BF16.gguf', 'text_encoders/Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf'),
 ('Comfy-Org/Qwen-Image_ComfyUI', 'split_files/vae/qwen_image_vae.safetensors', 'vae/qwen_image_vae.safetensors'),
 ('lightx2v/Qwen-Image-Edit-2511-Lightning', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', 'loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'),
]

def download(item):
    repo, remote, local = item
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{repo}?blobs=true') as response:
        info = json.load(response)
    entry = next(x for x in info['siblings'] if x['rfilename'] == remote)
    target = BASE / 'models' / local
    target.parent.mkdir(parents=True, exist_ok=True)
    url = f'https://huggingface.co/{repo}/resolve/{info["sha"]}/{remote}'
    print(f'Downloading {local}', flush=True)
    subprocess.run(['curl.exe', '-f', '-L', '--retry', '3', '-C', '-', '-s', '-S', '-o', str(target), url], check=True)
    size = entry.get('size', entry.get('lfs', {}).get('size'))
    if size is not None and target.stat().st_size != size:
        raise RuntimeError(f'Size mismatch: {target}')
    print(f'Complete {local}: {target.stat().st_size} bytes', flush=True)
    return {'repo': repo, 'revision': info['sha'], 'remote': remote, 'local': local, 'size': size, 'sha256': entry.get('lfs', {}).get('sha256')}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        result = list(pool.map(download, FILES))
    (ROOT / 'downloads' / 'model-manifest.json').write_text(json.dumps(result, indent=2))
