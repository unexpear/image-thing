"""Studio mesh post-processing (Blender 4.3, background mode).
Fixed entry point for managed blender_post jobs. Args (after --):
  --job ID --staging DIR --params JSON --validator PATH --node EXE --python EXE
Params: {source (abs path in staging), preset, ops:{weld, decimate_target,
  recenter, apply_scale, uv_replace, tangent_fallback}, threads}
Presets: preserve (no geometry/UV/material change; byte-identical copy path
  is taken by the caller convention below when no op is requested... NOTE:
  this script always re-exports; true byte-identical no_op is handled by the
  backend without launching Blender. This script runs only when >=1 op or
  the hunyuan_cleanup_unwrap preset is selected.)
Order: validate/snapshot -> scale baking -> topology cleanup -> decimate ->
UV -> normal/tangent handling -> recenter -> export -> output validation.
Writes <stem>_post.glb, mesh-report.json, outputs.json into staging.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

SCRIPT_VERSION = '1.0.0'


def log(msg):
    print(f'[post_mesh] {msg}', flush=True)


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(8 * 1024 * 1024), b''):
            h.update(c)
    return h.hexdigest()


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


def main():
    t0 = time.time()
    a = parse_argv(sys.argv[1:])
    staging = a['staging']
    if 'params_file' in a:
        with open(a['params_file']) as f:
            params = json.load(f)
    else:
        params = json.loads(a['params'])
    validator = a['validator']
    node_exe = a['node']
    source = params['source']
    ops = params.get('ops', {})
    warnings = []

    import bpy
    log(f"blender {bpy.app.version_string}, job {a['job']}")
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    before = {'source_sha256': sha256(source),
              'source_bytes': os.path.getsize(source)}

    bpy.ops.import_scene.gltf(filepath=source)
    objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objs:
        raise RuntimeError('no mesh objects after import')
    before['objects'] = len(objs)
    before['materials'] = len(bpy.data.materials)
    before['tris_unique'] = sum(len(m.data.loop_triangles) if hasattr(m.data, 'loop_triangles') else 0 for m in objs)
    for o in objs:
        o.data.calc_loop_triangles()
    before['tris_unique'] = sum(len(o.data.loop_triangles) for o in objs)
    before['verts'] = sum(len(o.data.vertices) for o in objs)
    corners = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    before['bounds'] = [[min(c[i] for c in corners), max(c[i] for c in corners)] for i in range(3)]
    before['uv_layers'] = sorted({l.name for o in objs for l in o.data.uv_layers})
    before['tangent_layers'] = sorted({l.name for o in objs for l in o.data.attributes
                                       if l.data_type == 'FLOAT_VECTOR' and 'tangent' in l.name.lower()})

    weld = bool(ops.get('weld'))
    if params.get('preset') == 'hunyuan_cleanup_unwrap':
        weld = True
    diag = max(before['bounds'][i][1] - before['bounds'][i][0] for i in range(3)) or 1.0
    weld_dist = 1e-6 * diag

    if ops.get('apply_scale'):
        for o in objs:
            o.scale = (o.scale[0], o.scale[1], o.scale[2])
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    if weld:
        for o in objs:
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.remove_doubles(threshold=weld_dist)
            bpy.ops.mesh.delete_loose()
            bpy.ops.object.mode_set(mode='OBJECT')
            o.select_set(False)

    decimate_target = ops.get('decimate_target')
    if decimate_target:
        current = sum(len(o.data.polygons) for o in objs)
        if current > decimate_target:
            ratio = decimate_target / current
            for o in objs:
                mod = o.modifiers.new('StudioDecimate', 'DECIMATE')
                mod.ratio = max(ratio, 0.001)
                mod.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.modifier_apply(modifier=mod.name)

    uv_replace = bool(ops.get('uv_replace'))
    uv_create_allowed = params.get('preset') == 'hunyuan_cleanup_unwrap'
    uv_created = []
    for o in objs:
        has_uv = len(o.data.uv_layers) > 0
        if has_uv and not uv_replace:
            continue
        if not has_uv and not uv_create_allowed:
            continue
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.1519173063162575, island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
        o.select_set(False)
        uv_created.append(o.name)

    topology_changed = weld or bool(decimate_target) or bool(ops.get('apply_scale'))
    tangents_stripped = []
    if topology_changed or uv_replace or uv_created:
        for o in objs:
            for attr in [x for x in o.data.attributes
                         if x.data_type == 'FLOAT_VECTOR' and 'tangent' in x.name.lower()]:
                o.data.attributes.remove(attr)
                tangents_stripped.append(f'{o.name}.{attr.name}')

    if ops.get('recenter'):
        cx = [(before['bounds'][i][0] + before['bounds'][i][1]) / 2 for i in range(3)]
        for o in objs:
            o.location = (o.location[0] - cx[0], o.location[1] - cx[1], o.location[2] - cx[2])
        recenter_vec = [-cx[0], -cx[1], -cx[2]]
    else:
        recenter_vec = [0.0, 0.0, 0.0]

    stem = os.path.splitext(os.path.basename(source))[0]
    out_glb = os.path.join(staging, stem + '_post.glb')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB',
                              use_selection=True, export_yup=True,
                              export_tangents=bool(before['tangent_layers']) and not tangents_stripped)
    after = {'bytes': os.path.getsize(out_glb), 'sha256': sha256(out_glb),
             'objects': len(objs)}
    for o in objs:
        o.data.calc_loop_triangles()
    after['tris_unique'] = sum(len(o.data.loop_triangles) for o in objs)
    after['verts'] = sum(len(o.data.vertices) for o in objs)
    corners = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    after['bounds'] = [[min(c[i] for c in corners), max(c[i] for c in corners)] for i in range(3)]
    after['uv_layers'] = sorted({l.name for o in objs for l in o.data.uv_layers})

    repaired = 0
    if ops.get('tangent_fallback'):
        r = subprocess.run([a['python'], os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'repair-zero-tangents.py'), out_glb],
                           capture_output=True, text=True, timeout=120)
        log('repair: ' + (r.stdout.strip() or r.stderr.strip()))
        try:
            repaired = int(r.stdout.strip().split(':')[-1])
        except (ValueError, IndexError):
            repaired = -1
        after['bytes'] = os.path.getsize(out_glb)
        after['sha256'] = sha256(out_glb)

    vrep = os.path.join(staging, 'validation.json')
    v = subprocess.run([node_exe, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'validate-glb.mjs'), '--in', out_glb,
                        '--target-tris', str(decimate_target or 2000000),
                        '--json', vrep],
                       capture_output=True, text=True, timeout=300)
    vdoc = json.load(open(vrep))
    if v.returncode != 0 or vdoc.get('verdict') != 'pass':
        if not (decimate_target and any(f.get('code') == 'TRIANGLE_TARGET_UNMET'
                                        for f in vdoc.get('findings', []))):
            raise RuntimeError(f"output validation failed: {vdoc.get('findings')}")
        raise RuntimeError(f"TRIANGLE_TARGET_UNMET: {vdoc['triangles']}")

    report = {'script': 'post_mesh.py', 'script_version': SCRIPT_VERSION,
              'job': a['job'], 'blender': bpy.app.version_string,
              'preset': params.get('preset'), 'ops_resolved': {
                  'weld': weld, 'weld_distance_m': weld_dist,
                  'decimate_target': decimate_target, 'recenter': bool(ops.get('recenter')),
                  'recenter_vector': recenter_vec, 'apply_scale': bool(ops.get('apply_scale')),
                  'uv_created': uv_created, 'uv_replace': uv_replace,
                  'tangents_stripped': tangents_stripped, 'tangent_fallback_repairs': repaired},
              'before': before, 'after': after,
              'smart_uv': {'angle_limit_rad': 1.1519173063162575, 'island_margin': 0.02,
                           'margin_method': 'FRACTION'},
              'coordinate_note': 'default glTF exporter conversion (Y-up); world placement preserved unless recenter',
              'seconds': round(time.time() - t0, 2), 'warnings': warnings}
    with open(os.path.join(staging, 'mesh-report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    with open(os.path.join(staging, 'outputs.json'), 'w') as f:
        json.dump({'files': [os.path.basename(out_glb), 'mesh-report.json'],
                   'validation': 'pass'}, f)
    log(f'done in {report["seconds"]}s -> {out_glb}')


main()
