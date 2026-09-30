import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from download_video_models import verified
import json
from pathlib import Path
result=verified(('tencent/Hunyuan3D-2mv','hunyuan3d-dit-v2-mv-turbo/model.fp16.safetensors','checkpoints/hunyuan3d-dit-v2-mv-turbo.safetensors'))
Path('downloads/3d-model-manifest.json').write_text(json.dumps(result,indent=2))

