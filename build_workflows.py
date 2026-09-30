"""Build a small editable UI workflow from the running ComfyUI node schemas."""
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
COMFY = ROOT / 'ComfyUI_windows_portable' / 'ComfyUI'
MODEL = 'qwen-image-edit-2511-Q2_K.gguf'
ENCODER = 'Qwen2.5-VL-7B-Instruct-UD-Q4_K_XL.gguf'
LORA = 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'

def make_graph(lightning):
    graph = {}
    def node(i, kind, title, **inputs):
        graph[str(i)] = {'class_type': kind, 'inputs': inputs, '_meta': {'title': title}}
    node(1, 'UnetLoaderGGUF', 'Qwen Edit 2511 · Q2 GGUF', unet_name=MODEL)
    node(2, 'CLIPLoaderGGUF', 'Qwen vision + text · Q4 GGUF', clip_name=ENCODER, type='qwen_image')
    node(3, 'VAELoader', 'Qwen image VAE', vae_name='qwen_image_vae.safetensors')
    node(4, 'LoadImage', '1 · Choose or upload your image (required)', image='')
    node(5, 'ImageScaleToTotalPixels', '2 · Output size: 0.25 MP (about 512 square)', image=['4', 0], upscale_method='area', megapixels=0.25, resolution_steps=8)
    # Keep the reference latent at the output size. Supplying a VAE to the
    # text node forces a 1MP reference and causes framing drift at 512px.
    node(6, 'TextEncodeQwenImageEditPlus', '3 · Describe your edit', clip=['2', 0], image1=['5', 0], prompt='Change the sofa upholstery to deep blue. Keep the sofa shape, room, lighting, and camera angle unchanged.')
    node(7, 'TextEncodeQwenImageEditPlus', 'Negative prompt (optional)', clip=['2', 0], image1=['5', 0], prompt='')
    node(17, 'ReferenceLatent', 'Reference image · positive', conditioning=['6', 0], latent=['10', 0])
    node(18, 'ReferenceLatent', 'Reference image · negative', conditioning=['7', 0], latent=['10', 0])
    node(8, 'FluxKontextMultiReferenceLatentMethod', '2511 reference method · positive', conditioning=['17', 0], reference_latents_method='index_timestep_zero')
    node(9, 'FluxKontextMultiReferenceLatentMethod', '2511 reference method · negative', conditioning=['18', 0], reference_latents_method='index_timestep_zero')
    node(10, 'VAEEncode', 'Encode source image', pixels=['5', 0], vae=['3', 0])
    model = ['1', 0]
    if lightning:
        node(11, 'LoraLoaderModelOnly', 'Lightning · 4 steps', model=model, lora_name=LORA, strength_model=1.0)
        model = ['11', 0]
    node(12, 'ModelSamplingAuraFlow', 'Qwen sampling shift', model=model, shift=3.1)
    node(13, 'CFGNorm', 'Guidance normalization', model=['12', 0], strength=1.0)
    node(14, 'KSampler', '4 · Run edit', model=['13', 0], positive=['8', 0], negative=['9', 0], latent_image=['10', 0], seed=42, steps=4 if lightning else 40, cfg=1.0 if lightning else 4.0, sampler_name='euler', scheduler='simple', denoise=1.0)
    node(15, 'VAEDecodeTiled', 'Decode with reduced memory', samples=['14', 0], vae=['3', 0], tile_size=256, overlap=64, temporal_size=64, temporal_overlap=8)
    node(16, 'SaveImage', '5 · Saved output', images=['15', 0], filename_prefix='Qwen-Edit-2511/' + ('Lightning' if lightning else 'Standard'))
    return graph

POSITIONS = {1:(0,0),2:(0,260),3:(0,520),4:(390,0),5:(390,480),6:(780,0),7:(780,370),17:(1190,0),18:(1190,260),8:(1570,0),9:(1570,260),10:(780,760),11:(0,780),12:(390,780),13:(1190,760),14:(1950,0),15:(1950,430),16:(2330,0)}

def make_ui(graph, schemas):
    nodes, links, lookup = [], [], {}
    for order, (key, spec) in enumerate(graph.items()):
        schema = schemas[spec['class_type']]
        node = {'id':int(key), 'type':spec['class_type'], 'title':spec['_meta']['title'], 'pos':list(POSITIONS[int(key)]), 'size':[340, 310 if key in ('6','7') else 220], 'flags':{}, 'order':order, 'mode':0, 'inputs':[], 'outputs':[], 'properties':{'Node name for S&R':spec['class_type']}, 'widgets_values':[]}
        for group in ('required','optional'):
            for name, desc in schema['input'].get(group, {}).items():
                value = spec['inputs'].get(name)
                typ = desc[0]
                opts = desc[1] if len(desc) > 1 else {}
                is_widget = isinstance(typ, list) or typ in ('INT','FLOAT','STRING','BOOLEAN','COMBO')
                if is_widget:
                    if name not in spec['inputs']:
                        value = opts.get('default', typ[0] if isinstance(typ,list) else None)
                    node['widgets_values'].append(value)
                    if opts.get('control_after_generate'):
                        node['widgets_values'].append('fixed')
                else:
                    node['inputs'].append({'name':name,'type':typ,'link':None})
        if spec['class_type'] == 'LoadImage':
            node['widgets_values'].append('image')
            node['size'] = [340, 430]
        for slot, typ in enumerate(schema.get('output', [])):
            names = schema.get('output_name', [])
            node['outputs'].append({'name': names[slot] if slot < len(names) else typ, 'type':typ,'links':[],'slot_index':slot})
        if key == '16': node['size'] = [500, 550]
        nodes.append(node)
        lookup[key] = node
    for key, spec in graph.items():
        for slot, inp in enumerate(lookup[key]['inputs']):
            value = spec['inputs'].get(inp['name'])
            if isinstance(value, list):
                link_id = len(links) + 1
                source, out_slot = value
                links.append([link_id, int(source), out_slot, int(key), slot, inp['type']])
                inp['link'] = link_id
                lookup[source]['outputs'][out_slot]['links'].append(link_id)
    return {'last_node_id':18,'last_link_id':len(links),'nodes':nodes,'links':links,'groups':[],'config':{},'extra':{'ds':{'scale':0.7,'offset':[120,170]}},'version':0.4}

if __name__ == '__main__':
    with urlopen('http://127.0.0.1:8188/object_info') as response:
        schemas = json.load(response)
    (ROOT/'downloads'/'node-schemas.json').write_text(json.dumps(schemas))
    destination = COMFY / 'user' / 'default' / 'workflows'
    destination.mkdir(parents=True, exist_ok=True)
    (ROOT/'workflows').mkdir(exist_ok=True)
    for lightning in (True, False):
        name = 'Qwen Edit 2511 - ' + ('Fast 4-step' if lightning else 'Standard 40-step')
        graph = make_graph(lightning)
        ui = make_ui(graph, schemas)
        (ROOT/'workflows'/f'{name}.api.json').write_text(json.dumps(graph, indent=2))
        for folder in (destination, ROOT/'workflows'):
            (folder/f'{name}.json').write_text(json.dumps(ui, indent=2))
        print(f'Created {name}')
