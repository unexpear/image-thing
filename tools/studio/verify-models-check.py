"""Check that verify_models.py actually catches a damaged installation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('verify_models', ROOT / 'verify_models.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class VerifyChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.models = self.root / 'models'
        (self.models / 'unet').mkdir(parents=True)
        (self.models / 'text_encoders').mkdir(parents=True)
        (self.root / 'downloads').mkdir()
        (self.root / 'workflows').mkdir()
        (self.root / 'simple-editor').mkdir()
        verify.ROOT, verify.MODELS = self.root, self.models
        verify.MANIFESTS = ('test-manifest.json',)
        verify.LOCAL_MODELS_CONFIG = self.root / 'model-paths.json'

    def tearDown(self):
        self.temp.cleanup()

    def manifest(self, rows):
        (self.root / 'downloads' / 'test-manifest.json').write_text(json.dumps(rows), encoding='utf-8')

    def weights(self, full=True):
        return {row.get('file'): row for row in verify.check_weights(full, lambda _: None)}

    def test_good_file_passes_and_damage_is_caught(self):
        good, swapped = b'intact-weights', b'swapped-weight'  # same length, different bytes
        self.assertEqual(len(good), len(swapped))
        (self.models / 'unet/good.gguf').write_bytes(good)
        (self.models / 'unet/corrupt.gguf').write_bytes(swapped)
        (self.models / 'unet/short.gguf').write_bytes(good[:4])
        self.manifest([
            {'local': 'unet/good.gguf', 'size': len(good), 'sha256': sha(good)},
            {'local': 'unet/corrupt.gguf', 'size': len(good), 'sha256': sha(good)},
            {'local': 'unet/short.gguf', 'size': len(good), 'sha256': sha(good)},
            {'local': 'unet/absent.gguf', 'size': len(good), 'sha256': sha(good)},
        ])
        rows = self.weights()
        self.assertTrue(rows['unet/good.gguf']['ok'])
        # Right size, wrong bytes: only the hash can see this one.
        self.assertFalse(rows['unet/corrupt.gguf']['ok'])
        self.assertIn('corrupt', rows['unet/corrupt.gguf']['detail'])
        self.assertFalse(rows['unet/short.gguf']['ok'])
        self.assertIn('Size is', rows['unet/short.gguf']['detail'])
        self.assertFalse(rows['unet/absent.gguf']['ok'])
        self.assertIn('missing', rows['unet/absent.gguf']['detail'])

    def test_quick_pass_cannot_see_corruption(self):
        good, swapped = b'intact-weights', b'swapped-weight'
        (self.models / 'unet/corrupt.gguf').write_bytes(swapped)
        self.manifest([{'local': 'unet/corrupt.gguf', 'size': len(good), 'sha256': sha(good)}])
        self.assertTrue(self.weights(full=False)['unet/corrupt.gguf']['ok'])
        self.assertFalse(self.weights(full=True)['unet/corrupt.gguf']['ok'])

    def test_lightning_manifest_shape(self):
        data = b'lora'
        (self.models / 'loras').mkdir()
        (self.models / 'loras/L.safetensors').write_bytes(data)
        self.manifest({'file': {'rfilename': 'L.safetensors', 'size': len(data),
                                'lfs': {'sha256': sha(data)}}})
        self.assertTrue(self.weights()['loras/L.safetensors']['ok'])

    def test_missing_manifest_is_reported(self):
        self.assertFalse(verify.check_weights(False, lambda _: None)[0]['ok'])

    def test_projector_pairing(self):
        encoders = self.models / 'text_encoders'
        (encoders / 'Qwen2.5-VL-7B-Instruct-UD-Q4_K_XL.gguf').write_bytes(b'e')
        # No projector yet: image editing would break with only a log line.
        self.assertFalse(verify.check_mmproj(lambda _: None)[0]['ok'])
        (encoders / 'Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf').write_bytes(b'p')
        row = verify.check_mmproj(lambda _: None)[0]
        self.assertTrue(row['ok'])
        self.assertEqual(row['matches'], ['Qwen2.5-VL-7B-Instruct-mmproj-BF16.gguf'])
        # A second match is silently resolved by ComfyUI-GGUF, so flag it.
        (encoders / 'Qwen2.5-VL-7B-Instruct-mmproj-F16.gguf').write_bytes(b'p')
        self.assertFalse(verify.check_mmproj(lambda _: None)[0]['ok'])

    def test_workflow_reference_must_resolve(self):
        (self.root / 'workflows/w.json').write_text(json.dumps(
            {'1': {'inputs': {'unet_name': 'absent.gguf'}}}), encoding='utf-8')
        for name in ('animate.api.json', 'restyle.api.json'):
            (self.root / 'simple-editor' / name).write_text('{}', encoding='utf-8')
        rows = [r for r in verify.check_references(lambda _: None) if r.get('file')]
        self.assertEqual(len(rows), 1)
        self.assertFalse(rows[0]['ok'])
        (self.models / 'unet/absent.gguf').write_bytes(b'x')
        self.assertTrue([r for r in verify.check_references(lambda _: None) if r.get('file')][0]['ok'])

    def test_local_model_paths(self):
        self.assertFalse(verify.check_local_models(lambda _: None)[0]['ok'])
        present = self.root / 'runner.py'
        present.write_text('', encoding='utf-8')
        verify.LOCAL_MODELS_CONFIG.write_text(json.dumps({'models': {
            'here': {'runner': str(present)},
            'gone': {'weights': str(self.root / 'nope.gguf')}}}), encoding='utf-8')
        rows = {row['file']: row for row in verify.check_local_models(lambda _: None)}
        self.assertTrue(rows['here']['ok'])
        self.assertFalse(rows['gone']['ok'])


unittest.main()
