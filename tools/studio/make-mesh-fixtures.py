"""Synthetic mesh fixtures for Phase-2 validation (stdlib only)."""
import json
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), '..', 'reports', 'studio', 'mesh-fixtures')
OUT = os.path.normpath(OUT)


def png_2x2():
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    raw = b''.join(b'\x00\xff\x00\x00\xff\x00\xff\x00\x00' for _ in range(2))
    ihdr = struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def grid(nx, ny, tangents=False, uvs=True):
    pos, nrm, uv, idx = [], [], [], []
    for j in range(ny + 1):
        for i in range(nx + 1):
            pos += [i / nx, j / ny, 0.0]
            nrm += [0.0, 0.0, 1.0]
            if uvs:
                uv += [i / nx, j / ny]
    for j in range(ny):
        for i in range(nx):
            a, b = j * (nx + 1) + i, j * (nx + 1) + i + 1
            c, d = (j + 1) * (nx + 1) + i, (j + 1) * (nx + 1) + i + 1
            idx += [a, c, b, b, c, d]
    tan = [0.0, 0.0, 0.0, 1.0] * ((nx + 1) * (ny + 1)) if tangents else None
    return pos, nrm, uv, idx, tan


def box(cx, cy, cz, sx, sy, sz):
    import itertools
    pos, nrm, uv, idx = [], [], [], []
    faces = [((1, 0, 0), [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)]),
             ((-1, 0, 0), [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)]),
             ((0, 1, 0), [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)]),
             ((0, -1, 0), [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)]),
             ((0, 0, 1), [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]),
             ((0, 0, -1), [(-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)])]
    base = 0
    for n, quad in faces:
        for v in quad:
            pos += [cx + v[0] * sx / 2, cy + v[1] * sy / 2, cz + v[2] * sz / 2]
            nrm += list(n)
            uv += [0.0, 0.0]
        idx += [base, base + 1, base + 2, base, base + 2, base + 3]
        base += 4
    return pos, nrm, uv, idx


def build_glb(meshes, nodes=None, materials=None, images_bin=None, extra_json=None):
    blob = bytearray()
    views, accs = [], []
    jmeshes = []

    def push(data):
        off = len(blob)
        blob.extend(data)
        while len(blob) % 4:
            blob.append(0)
        return off

    for m in meshes:
        prims = []
        for prim in m['primitives']:
            attrs = {}
            p = prim['pos']
            off = push(struct.pack(f'<{len(p)}f', *p))
            n = len(p) // 3
            mn = [min(p[0::3]), min(p[1::3]), min(p[2::3])]
            mx = [max(p[0::3]), max(p[1::3]), max(p[2::3])]
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(p) * 4})
            accs.append({'bufferView': len(views) - 1, 'componentType': 5126,
                         'count': n, 'type': 'VEC3', 'min': mn, 'max': mx})
            attrs['POSITION'] = len(accs) - 1
            for key, arr, w, t in (('NORMAL', prim.get('nrm'), 3, 'VEC3'),
                                   ('TEXCOORD_0', prim.get('uv'), 2, 'VEC2'),
                                   ('TANGENT', prim.get('tan'), 4, 'VEC4')):
                if arr is None:
                    continue
                off = push(struct.pack(f'<{len(arr)}f', *arr))
                views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(arr) * 4})
                accs.append({'bufferView': len(views) - 1, 'componentType': 5126,
                             'count': len(arr) // w, 'type': t})
                attrs[key] = len(accs) - 1
            idx = prim['idx']
            maxv = max(idx)
            fmt, ct = ('<H', 5123) if maxv < 65536 else ('<I', 5125)
            raw = struct.pack(f'<{len(idx)}{fmt[1]}', *idx)
            off = push(raw)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)})
            accs.append({'bufferView': len(views) - 1, 'componentType': ct,
                         'count': len(idx), 'type': 'SCALAR'})
            pjson = {'attributes': attrs, 'indices': len(accs) - 1, 'mode': 4}
            if prim.get('material') is not None:
                pjson['material'] = prim['material']
            prims.append(pjson)
        jmeshes.append({'primitives': prims})
    jimages = []
    if images_bin:
        for mime, data in images_bin:
            off = push(data)
            views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
            jimages.append({'bufferView': len(views) - 1, 'mimeType': mime})
    js = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes or [{'mesh': 0}])))}],
          'nodes': nodes or [{'mesh': 0}], 'meshes': jmeshes, 'accessors': accs,
          'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
    if materials is not None:
        js['materials'] = materials
    if jimages:
        js['images'] = jimages
        js['samplers'] = [{}]
        js['textures'] = [{'source': 0, 'sampler': 0}]
        for m in js['materials']:
            m['pbrMetallicRoughness'] = {'baseColorTexture': {'index': 0}}
    if extra_json:
        js.update(extra_json)
    jraw = json.dumps(js, separators=(',', ':')).encode()
    while len(jraw) % 4:
        jraw += b' '
    total = 12 + 8 + len(jraw) + 8 + len(blob)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(jraw), 0x4E4F534A) + jraw
    out += struct.pack('<II', len(blob), 0x004E4942) + bytes(blob)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    pos, nrm, uv, idx, _ = grid(1, 1)
    small = {'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx}
    with open(os.path.join(OUT, 'valid-small.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [small]}]))
    with open(os.path.join(OUT, 'malformed.glb'), 'wb') as f:
        f.write(b'NOTG' + os.urandom(100))
    with open(os.path.join(OUT, 'truncated.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [small]}])[:60])
    pos, nrm, uv, idx, _ = grid(550, 546)
    with open(os.path.join(OUT, 'over-target.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [{'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx}]}]))
    raw = bytearray(build_glb([{'primitives': [small]}]))
    size = struct.unpack_from('<I', raw, 12)[0]
    js = json.loads(raw[20:20 + size])
    js['accessors'][0]['count'] = 3000000
    jraw = json.dumps(js, separators=(',', ':')).encode()
    while len(jraw) % 4:
        jraw += b' '
    bin_off = 20 + size + 8
    bindata = bytes(raw[bin_off:])
    total = 12 + 8 + len(jraw) + 8 + len(bindata)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(jraw), 0x4E4F534A) + jraw
    out += struct.pack('<II', len(bindata), 0x004E4942) + bindata
    with open(os.path.join(OUT, 'over-cap-declared.glb'), 'wb') as f:
        f.write(out)
    pos, nrm, uv, idx, tan = grid(10, 10, tangents=True)
    with open(os.path.join(OUT, 'zero-tangent.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [{'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx, 'tan': tan}]}]))
    pos, nrm, uv, idx, _ = grid(4, 4)
    with open(os.path.join(OUT, 'textured.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [{'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx, 'material': 0}]}],
                          materials=[{}], images_bin=[('image/png', png_2x2())]))
    pos, nrm, uv, idx, _ = grid(4, 4)
    with open(os.path.join(OUT, 'multi-object.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [{'pos': pos, 'nrm': nrm, 'uv': uv, 'idx': idx}]}],
                          nodes=[{'mesh': 0}, {'mesh': 0, 'translation': [2.0, 0.0, 0.0]}]))
    big = box(0.0, 0.0, 0.0, 2.0, 2.0, 2.0)
    bump = box(0.0, 0.0, 1.25, 1.0, 1.0, 0.5)
    bp, bn, bu, bi = big
    qp, qn, qu, qi = bump
    qi = [v + len(bp) // 3 for v in qi]
    with open(os.path.join(OUT, 'asymmetric.glb'), 'wb') as f:
        f.write(build_glb([{'primitives': [{'pos': bp + qp, 'nrm': bn + qn,
                                            'uv': bu + qu, 'idx': bi + qi}]}]))
    for name in sorted(os.listdir(OUT)):
        print(name, os.path.getsize(os.path.join(OUT, name)))


if __name__ == '__main__':
    main()
