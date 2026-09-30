import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
def node(kind, **inputs):
    return {'class_type': kind, 'inputs': inputs}

def graph(mode):
    g = {
        '1': node('UNETLoader', unet_name='wan2.1_vace_1.3B_fp16.safetensors', weight_dtype='default'),
        '2': node('CLIPLoader', clip_name='umt5_xxl_fp8_e4m3fn_scaled.safetensors', type='wan', device='default'),
        '3': node('VAELoader', vae_name='wan_2.1_vae.safetensors'),
        '6': node('CLIPTextEncode', clip=['2', 0], text='A gentle cinematic camera move around a blue sofa, soft natural lighting.'),
        '7': node('CLIPTextEncode', clip=['2', 0], text='blurry, distorted, flickering, text, watermark'),
        '9': node('WanVaceToVideo', positive=['6', 0], negative=['7', 0], vae=['3', 0], width=384, height=384, length=33, batch_size=1, strength=1.0, control_video=['4', 0]),
        '11': node('LoraLoaderModelOnly', model=['1', 0], lora_name='Wan21_CausVid_bidirect2_T2V_1_3B_lora_rank32.safetensors', strength_model=0.7),
        '12': node('ModelSamplingSD3', model=['11', 0], shift=8.0),
        '14': node('KSampler', model=['12', 0], positive=['9', 0], negative=['9', 1], latent_image=['9', 2], seed=42, steps=4, cfg=1.0, sampler_name='uni_pc', scheduler='simple', denoise=1.0),
        '15': node('TrimVideoLatent', samples=['14', 0], trim_amount=['9', 3]),
        '16': node('VAEDecodeTiled', samples=['15', 0], vae=['3', 0], tile_size=256, overlap=64, temporal_size=16, temporal_overlap=4),
        '17': node('CreateVideo', images=['16', 0], fps=16.0),
        '18': node('SaveVideo', video=['17', 0], filename_prefix='Qwen-Studio/Video/' + mode, format='mp4', codec='h264'),
    }
    if mode == 'animate':
        g['4'] = node('LoadImage', image='')
        g['5'] = node('SolidMask', value=0.0, width=384, height=384)
        g['9']['inputs']['control_masks'] = ['5', 0]
    else:
        g['4'] = node('StudioVideoInput', file='studio-test.mp4', width=384, height=384, frames=33, start_seconds=0.0)
        g['5'] = node('Canny', image=['4', 0], low_threshold=0.2, high_threshold=0.6)
        g['9']['inputs']['control_video'] = ['5', 0]
    g['18']['inputs']['format.codec'] = 'h264'
    del g['18']['inputs']['codec']
    return g

if __name__ == '__main__':
    for mode in ['animate', 'restyle']:
        (ROOT / 'simple-editor' / (mode + '.api.json')).write_text(json.dumps(graph(mode), indent=2))
