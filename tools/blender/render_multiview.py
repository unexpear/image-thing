"""Studio multi-view preview (Blender 4.3, background, CPU only).
Preset studio_preview_v1 (frozen): six 512x512 PNGs + 1536x1024 contact
sheet (front/back/left, right/top/three-quarter). Still images only.
Args (after --): --job ID --staging DIR --params JSON
Params: {source (abs path in staging)}.
Writes view_*.png, contact-sheet.png, preview-report.json, outputs.json.
"""
import hashlib
import json
import math
import os
import sys
import time

SCRIPT_VERSION = '1.0.0'
PRESET = 'studio_preview_v1'
SIZE = 512
SAMPLES = 32
SEED = 0
BACKGROUND = (0.149, 0.161, 0.184, 1.0)
KEY = {'energy': 2.5, 'pos': (4.0, -4.0, 5.0)}
FILL = {'energy': 1.2, 'pos': (-5.0, 3.0, 2.0)}
RIM = {'energy': 1.5, 'pos': (0.0, 5.0, 3.0)}


def log(msg):
    print(f'[render_multiview] {msg}', flush=True)


def parse_argv(argv):
    out, key = {}, None
    for tok in argv:
        if tok == '--':
            continue
        if tok.startswith('--'):
            key = tok[2:].replace('-', '_')
            out[key] = True
        elif key:
            out[key] = tok
            key = None
    return out


def look_at(eye, target, up_hint):
    import mathutils
    fwd = (mathutils.Vector(target) - mathutils.Vector(eye)).normalized()
    up = mathutils.Vector(up_hint)
    if abs(fwd.dot(up)) > 0.999:
        up = mathutils.Vector((0.0, 1.0, 0.0)) if abs(fwd[2]) > 0.999 else mathutils.Vector((0.0, 0.0, 1.0))
    right = fwd.cross(up).normalized()
    up2 = right.cross(fwd).normalized()
    mat = mathutils.Matrix(((right[0], up2[0], -fwd[0], eye[0]),
                            (right[1], up2[1], -fwd[1], eye[1]),
                            (right[2], up2[2], -fwd[2], eye[2]),
                            (0.0, 0.0, 0.0, 1.0)))
    return mat


def main():
    t0 = time.time()
    a = parse_argv(sys.argv[1:])
    staging = a['staging']
    if 'params_file' in a:
        with open(a['params_file']) as f:
            params = json.load(f)
    else:
        params = json.loads(a['params'])
    source = params['source']

    import bpy
    log(f"blender {bpy.app.version_string}, job {a['job']}")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=source)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        raise RuntimeError('no mesh objects after import')
    corners = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    mn = [min(c[i] for c in corners) for i in range(3)]
    mx = [max(c[i] for c in corners) for i in range(3)]
    center = [(mn[i] + mx[i]) / 2 for i in range(3)]
    radius = max((mx[i] - mn[i]) for i in range(3)) / 2 * 1.1

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.seed = SEED
    scene.cycles.use_denoising = False
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    world = bpy.data.worlds.new('StudioWorld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = BACKGROUND
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    scene.world = world

    def lamp(name, kind, energy, pos):
        import mathutils
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = (center[0] + pos[0] * radius, center[1] + pos[1] * radius,
                      center[2] + pos[2] * radius)
        direction = mathutils.Vector(center) - o.location
        o.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        return o

    lamp('Key', 'SUN', KEY['energy'], KEY['pos'])
    lamp('Fill', 'SUN', FILL['energy'], FILL['pos'])
    lamp('Rim', 'SUN', RIM['energy'], RIM['pos'])

    dist = radius / math.tan(math.radians(16.0)) + radius
    views = [
        ('front', (center[0], center[1] - dist, center[2]), 'ORTHO'),
        ('back', (center[0], center[1] + dist, center[2]), 'ORTHO'),
        ('left', (center[0] - dist, center[1], center[2]), 'ORTHO'),
        ('right', (center[0] + dist, center[1], center[2]), 'ORTHO'),
        ('top', (center[0], center[1], center[2] + dist), 'ORTHO'),
        ('three-quarter', (center[0] + dist * 0.577, center[1] - dist * 0.577,
                           center[2] + dist * 0.577), 'PERSP'),
    ]
    import mathutils
    cam_data = bpy.data.cameras.new('StudioCam')
    cam = bpy.data.objects.new('StudioCam', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    scene.camera = cam
    rendered = []
    cam_log = []
    for name, eye, ctype in views:
        cam.matrix_world = look_at(eye, center, (0.0, 0.0, 1.0))
        cam_data.type = ctype
        if ctype == 'ORTHO':
            cam_data.ortho_scale = radius * 2
        else:
            cam_data.lens = 50.0
            cam_data.sensor_width = 36.0
        out = os.path.join(staging, f'view_{name}.png')
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        if not os.path.isfile(out):
            raise RuntimeError(f'missing view {name}')
        rendered.append(out)
        cam_log.append({'view': name, 'type': ctype,
                        'eye': list(eye), 'target': center})

    sheet = bpy.data.images.new('ContactSheet', 1536, 1024, alpha=True)
    px = [BACKGROUND[0], BACKGROUND[1], BACKGROUND[2], 1.0] * (1536 * 1024)
    order = ['front', 'back', 'left', 'right', 'top', 'three-quarter']
    for slot, name in enumerate(order):
        img = bpy.data.images.load(os.path.join(staging, f'view_{name}.png'))
        img.scale(SIZE, SIZE)
        src = list(img.pixels[:])
        ox, oy = (slot % 3) * SIZE, (1 - slot // 3) * SIZE
        for y in range(SIZE):
            for x in range(SIZE):
                si = (y * SIZE + x) * 4
                di = ((oy + y) * 1536 + ox + x) * 4
                sa = src[si + 3]
                px[di] = src[si] * sa + px[di] * (1.0 - sa)
                px[di + 1] = src[si + 1] * sa + px[di + 1] * (1.0 - sa)
                px[di + 2] = src[si + 2] * sa + px[di + 2] * (1.0 - sa)
                px[di + 3] = 1.0
        bpy.data.images.remove(img)
    sheet.pixels = px
    sheet.file_format = 'PNG'
    sheet_path = os.path.join(staging, 'contact-sheet.png')
    sheet.filepath_raw = sheet_path
    sheet.save()

    def sha256(p):
        h = hashlib.sha256()
        with open(p, 'rb') as f:
            for c in iter(lambda: f.read(8 * 1024 * 1024), b''):
                h.update(c)
        return h.hexdigest()

    files = [os.path.basename(p) for p in rendered] + ['contact-sheet.png']
    sizes = {}
    for fn in files:
        p = os.path.join(staging, fn)
        with open(p, 'rb') as f:
            head = f.read(33)
        import struct
        w, h = struct.unpack('>II', head[16:24])
        sizes[fn] = [w, h]
        if [w, h] != ([SIZE, SIZE] if fn != 'contact-sheet.png' else [1536, 1024]):
            raise RuntimeError(f'wrong dimensions {fn}: {[w, h]}')
    report = {'script': 'render_multiview.py', 'script_version': SCRIPT_VERSION,
              'preset': PRESET, 'job': a['job'], 'blender': bpy.app.version_string,
              'device': 'CPU', 'samples': SAMPLES, 'seed': SEED, 'denoising': False,
              'background_rgba': list(BACKGROUND), 'lights': {'key': KEY, 'fill': FILL, 'rim': RIM},
              'world_bounds': [mn, mx], 'center': center, 'radius': radius,
              'cameras': cam_log, 'files': files, 'dimensions': sizes,
              'sha256': {fn: sha256(os.path.join(staging, fn)) for fn in files},
              'seconds': round(time.time() - t0, 2)}
    with open(os.path.join(staging, 'preview-report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    with open(os.path.join(staging, 'outputs.json'), 'w') as f:
        json.dump({'files': files, 'validation': 'dimensions'}, f)
    log(f"done in {report['seconds']}s")


main()
