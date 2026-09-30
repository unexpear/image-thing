"""Supply a normal-orthogonal fallback only for undefined GLB UV tangents.

Used after Blender export; preserves every valid tangent and all other bytes.
This does not recover missing UV direction and must be reported as a fallback.
"""
import json
import math
import struct
import sys
from pathlib import Path

def repair(path):
    path=Path(path);blob=bytearray(path.read_bytes())
    magic,version,length=struct.unpack_from('<III',blob)
    if magic!=0x46546C67 or version!=2 or length!=len(blob): raise ValueError('Expected GLB 2')
    size,kind=struct.unpack_from('<II',blob,12)
    if kind!=0x4E4F534A: raise ValueError('Expected JSON chunk')
    gltf=json.loads(blob[20:20+size]);binary=28+size
    if struct.unpack_from('<I',blob,24+size)[0]!=0x004E4942: raise ValueError('Expected BIN chunk')
    def address(accessor,index,width):
        if accessor.get('sparse'): raise ValueError('Sparse accessors unsupported')
        view=gltf['bufferViews'][accessor['bufferView']]
        return binary+view.get('byteOffset',0)+accessor.get('byteOffset',0)+index*view.get('byteStride',width)
    repairs=0;seen=set()
    for mesh in gltf['meshes']:
        for primitive in mesh['primitives']:
            attrs=primitive['attributes'];index=attrs.get('TANGENT')
            if index is None or index in seen: continue
            seen.add(index);tangent=gltf['accessors'][index];normal=gltf['accessors'][attrs['NORMAL']]
            if tangent['componentType']!=5126 or normal['componentType']!=5126 or tangent['type']!='VEC4' or normal['type']!='VEC3' or tangent['count']!=normal['count']:
                raise ValueError('Expected matching float tangent/normal accessors')
            for i in range(tangent['count']):
                at=address(tangent,i,16);x,y,z,w=struct.unpack_from('<4f',blob,at)
                if not all(math.isfinite(v) for v in (x,y,z,w)): raise ValueError('Non-finite tangent')
                if x*x+y*y+z*z>=1e-12: continue
                nx,ny,nz=struct.unpack_from('<3f',blob,address(normal,i,12))
                nlength=math.sqrt(nx*nx+ny*ny+nz*nz)
                if not math.isfinite(nlength) or nlength<1e-6: raise ValueError('Invalid normal; cannot supply tangent')
                nx,ny,nz=nx/nlength,ny/nlength,nz/nlength
                t=(0,nz,-ny) if abs(nx)<.9 else (-nz,0,nx)
                length=math.sqrt(sum(v*v for v in t))
                struct.pack_into('<4f',blob,at,*(v/length for v in t),-1 if w<0 else 1)
                repairs+=1
    if repairs: path.write_bytes(blob)
    return repairs

if __name__=='__main__': print('Zero tangent fallbacks:',repair(sys.argv[1]))
