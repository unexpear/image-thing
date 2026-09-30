import json
from urllib.request import urlopen
from build_workflows import ROOT, COMFY, POSITIONS, make_graph, make_ui

NAME = 'Qwen Edit 2511 - Quality 8-step'
LORA8 = 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors'
graph = make_graph(True)
graph['11']['inputs']['lora_name'] = LORA8
graph['11']['_meta']['title'] = 'Lightning LoRA - 8 steps'
graph['14']['inputs']['steps'] = 8
graph['16']['inputs']['filename_prefix'] = 'Qwen-Edit-2511/Quality8'
# A separate zero-strength loader passes the model through unchanged. Users can
# choose another compatible 2511 LoRA and then set its recommended strength.
graph['19'] = {'class_type': 'LoraLoaderModelOnly', '_meta': {'title': 'Additional LoRA - OFF at strength 0'},
               'inputs': {'model': ['1', 0], 'lora_name': LORA8, 'strength_model': 0.0}}
graph['11']['inputs']['model'] = ['19', 0]
POSITIONS[19] = (0, 1040)
with urlopen('http://127.0.0.1:8188/object_info') as response:
    schemas = json.load(response)
ui = make_ui(graph, schemas)
ui['last_node_id'] = 19
ui['extra']['qwen_local_preset'] = 'quality8-v1'
for folder in (ROOT / 'workflows', COMFY / 'user/default/workflows'):
    (folder / f'{NAME}.json').write_text(json.dumps(ui, indent=2), encoding='utf-8')
(ROOT / 'workflows' / f'{NAME}.api.json').write_text(json.dumps(graph, indent=2), encoding='utf-8')
print(NAME)
