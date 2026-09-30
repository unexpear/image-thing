import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile
import uuid

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('store', root / 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/project_store.py')
store = importlib.util.module_from_spec(spec)

# Stub folder_paths before exec
class _FP:
    def __init__(self, base):
        self.base = base
        (base / 'input').mkdir(parents=True, exist_ok=True)
        (base / 'output').mkdir(parents=True, exist_ok=True)
    def get_input_directory(self):
        return str(self.base / 'input')
    def get_output_directory(self):
        return str(self.base / 'output')

with tempfile.TemporaryDirectory() as temp:
    base = Path(temp)
    fp = _FP(base)
    import sys
    sys.modules['folder_paths'] = fp
    spec.loader.exec_module(store)
    store.ROOT = base / 'projects'
    media = base / 'input' / 'studio-director' / 'image.png'
    media.parent.mkdir(parents=True, exist_ok=True)
    media.write_bytes(b'synthetic fixture')
    project = {'version': 1, 'id': 'test-id', 'title': 'Test', 'scenes': [{'shots': [{'media': {'name': 'image.png', 'subfolder': 'studio-director', 'type': 'input'}}]}]}

    def local(ref):
        root_dir = base / ('input' if ref.get('type', 'input') == 'input' else 'output')
        path = (root_dir / ref.get('subfolder', '') / (ref.get('name') or ref.get('filename'))).resolve()
        if not path.is_file():
            raise ValueError('Missing')
        return path

    store.snapshot(project)
    store.snapshot(project)
    assert len(list(store.ROOT.glob('*/*.json'))) == 2
    project['title'] = 'Revision'
    store.snapshot(project)
    assert len(list(store.ROOT.glob('*/*.json'))) == 3
    package = store.package(project, local)
    with zipfile.ZipFile(package) as archive:
        assert json.loads(archive.read('project.json'))['title'] == 'Revision'
        assert archive.read('media/00000/image.png') == b'synthetic fixture'
        manifest = json.loads(archive.read('media-map.json'))
        assert manifest[0].get('ref', {}).get('name') == 'image.png'
    media.unlink()
    assert len(store.inspect(project, local)[1]) == 1
    try:
        store.package(project, local)
    except ValueError:
        pass
    else:
        raise AssertionError('Missing file was silently packaged')

    # --- ZIP one-click import ---
    # Media gone; restore from package with replace (same id)
    result = store.restore(package, local, collision='replace')
    assert result['missing'] == 0
    assert result['files'] == 1
    assert result['project']['id'] == 'test-id'
    assert result['archivedId'] == 'test-id'
    assert result['project']['title'] == 'Revision'
    restored_path = local(result['project']['scenes'][0]['shots'][0]['media'])
    assert restored_path.read_bytes() == b'synthetic fixture'

    # Import again as new copy
    result2 = store.restore(package, local, collision='new')
    assert result2['project']['id'] != 'test-id'
    assert result2['archivedId'] == 'test-id'
    assert result2['project']['title'].endswith('(imported)')
    assert result2['files'] == 1
    # reused or written ok
    assert result2['reused'] + result2['restored'] + result2['renamed'] >= 1

    # Confirm-replace orphan cleanup: collision=new left a temp-id folder; discard it, keep archived id.
    orphan = result2['project']
    orphan_key = store.project_key(orphan)
    archived_key = store.project_key({'version': 1, 'id': 'test-id', 'scenes': []})
    assert (store.ROOT / orphan_key).is_dir()
    assert (store.ROOT / archived_key).is_dir()
    discarded = store.discard(orphan)
    assert discarded['discarded'] is True
    assert discarded['id'] == orphan['id']
    assert not (store.ROOT / orphan_key).exists()
    assert (store.ROOT / archived_key).is_dir()
    # Missing discard is a safe no-op
    again = store.discard(orphan)
    assert again['discarded'] is False
    assert again.get('reason') == 'missing'
    # Debris sweep: plant a .tmp under a throwaway snapshot then discard
    debris_proj = {'version': 1, 'id': 'debris-id', 'title': 'Debris', 'scenes': []}
    store.snapshot(debris_proj)
    debris_dir = store.ROOT / store.project_key(debris_proj)
    (debris_dir / 'leftover.tmp').write_text('x', encoding='utf-8')
    (debris_dir / 'leftover.part').write_text('y', encoding='utf-8')
    assert store.discard(debris_proj)['discarded'] is True
    assert not debris_dir.exists()

    # Collision rename: different bytes at preferred path
    clash = base / 'input' / 'studio-director' / 'other.png'
    # Build a zip whose preferred restore path already has different content
    other_media = base / 'input' / 'studio-director' / 'clip.mp4'
    other_media.write_bytes(b'AAAA')
    proj2 = {'version': 1, 'id': 'other-id', 'title': 'Other', 'scenes': [{'shots': [{'media': {'name': 'clip.mp4', 'subfolder': 'studio-director', 'type': 'input'}}]}]}
    pack2 = store.package(proj2, local)
    # Occupy preferred name with different bytes after delete+replace path simulation:
    other_media.write_bytes(b'DIFFERENT')
    result3 = store.restore(pack2, local, collision='replace')
    media_ref = result3['project']['scenes'][0]['shots'][0]['media']
    assert media_ref['name'] != 'clip.mp4' or result3['renamed'] == 0
    # If renamed, ref must point at the new unique file with original bytes
    assert local(media_ref).read_bytes() == b'AAAA'
    assert result3['missing'] == 0

    # Reject unsafe member
    bad = base / 'bad.zip'
    with zipfile.ZipFile(bad, 'w') as z:
        z.writestr('project.json', json.dumps(project))
        z.writestr('media-map.json', json.dumps([{'original': 'x', 'archive': '../evil.bin'}]))
        z.writestr('../evil.bin', b'nope')
    try:
        store.restore(bad, local, collision='new')
    except ValueError:
        pass
    else:
        raise AssertionError('Unsafe archive member accepted')

print('Disk snapshot, revision, deduplication, archive contents, missing-file, ZIP import restore/new/rename/unsafe, orphan discard checks passed.')
