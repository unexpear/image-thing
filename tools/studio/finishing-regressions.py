"""Synthetic tests; never reads personal input or output media."""
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
COMFY = ROOT / 'ComfyUI_windows_portable/ComfyUI'
sys.path.insert(0, str(COMFY))
import torch
import numpy as np
from PIL import Image
from comfy_api.latest import Types
from comfy_extras.nodes_save_3d import save_glb
from comfy_extras.nodes_mesh_postprocess import _uv_unwrap, ApplyTextureToMesh, MeshSmoothNormals
from comfy_extras.nodes_mask import composite
spec = importlib.util.spec_from_file_location('studio_finishing', COMFY/'custom_nodes/studio_finishing/__init__.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FinishingTests(unittest.TestCase):
    def test_cartoon_material_export(self):
        mesh=self.mesh()
        flat=module.StudioMeshStyle().style(mesh,'flat','#ff8040',0)[0]
        self.assertFalse(mesh.unlit)
        data=save_glb(flat.vertices[0],flat.faces[0],unlit=flat.unlit,vertex_colors=flat.vertex_colors[0])
        length=struct.unpack_from('<I',data,12)[0]
        doc=json.loads(data[20:20+length])
        self.assertIn('KHR_materials_unlit',doc['extensionsUsed'])
        mesh.texture=torch.tensor([[[[.1,.4,.9]]]])
        matte=module.StudioMeshStyle().style(mesh,'matte','#ffffff',4)[0]
        self.assertTrue(torch.allclose(matte.texture,torch.tensor([[[[0,1/3,1]]]])))
        self.assertTrue(torch.allclose(mesh.texture,torch.tensor([[[[.1,.4,.9]]]])))
        with self.assertRaises(ValueError):module.StudioMeshStyle().style(mesh,'flat','#ffffff',0)
    def mesh(self):
        v = torch.tensor([[0,0,0],[1,0,0],[0,1,0],[0,0,1]], dtype=torch.float32)
        f = torch.tensor([[0,2,1],[0,1,3],[0,3,2],[1,2,3]], dtype=torch.int64)
        return Types.MESH(v[None], f[None])

    def test_checks_and_box(self):
        result = module.StudioMeshExportCheck().check(self.mesh())
        report = result['ui']['studio_mesh_report'][0]
        self.assertEqual(report['boundary_edges'], 0)
        self.assertEqual(report['nonmanifold_edges'], 0)
        box = result['result'][1]
        self.assertEqual(tuple(box.faces.shape), (1,12,3))
        box_report = module.StudioMeshExportCheck().check(box)['ui']['studio_mesh_report'][0]
        self.assertEqual(box_report['degenerate_triangles'], 0)
        self.assertEqual(box_report['boundary_edges'], 0)

    def test_reject_corrupt_mesh(self):
        mesh=self.mesh();mesh.faces[0,0,0]=999
        with self.assertRaises(ValueError): module.StudioMeshExportCheck().check(mesh)
        mesh=self.mesh();mesh.vertices[0,0,0]=float('nan')
        with self.assertRaises(ValueError): module.StudioMeshExportCheck().check(mesh)

    def test_uv_texture_glb(self):
        mesh=self.mesh()
        mapping, faces, uv = _uv_unwrap(mesh.vertices[0],mesh.faces[0],'adaptive',1024,2,0)
        textured=Types.MESH(mesh.vertices[:,mapping],torch.from_numpy(faces.astype(np.int64))[None],uvs=torch.from_numpy(uv.astype(np.float32))[None])
        textured=MeshSmoothNormals.execute(textured,60)[0]
        self.assertEqual(textured.uvs.shape[1],textured.vertices.shape[1])
        self.assertTrue(torch.isfinite(textured.normals).all())
        result=ApplyTextureToMesh.execute(textured,torch.ones((1,8,8,3))*0.5)
        textured=result[0]
        report=module.StudioMeshExportCheck().check(textured)['ui']['studio_mesh_report'][0]
        self.assertTrue(report['uvs']);self.assertTrue(report['texture'])
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'synthetic.glb'
            save_glb(textured.vertices[0],textured.faces[0],str(path),uvs=textured.uvs[0],normals=textured.normals[0],texture_image=Image.new('RGB',(8,8),(128,128,128)))
            data=path.read_bytes()
            self.assertEqual(struct.unpack_from('<4sII',data), (b'glTF',2,len(data)))
            length, kind=struct.unpack_from('<II',data,12)
            self.assertEqual(kind,0x4e4f534a)
            doc=json.loads(data[20:20+length])
            self.assertIn('TEXCOORD_0',doc['meshes'][0]['primitives'][0]['attributes'])
            self.assertIn('NORMAL',doc['meshes'][0]['primitives'][0]['attributes'])
            self.assertTrue(doc['images']);self.assertTrue(doc['materials'])

    def test_mask_preserves_unpainted_pixels(self):
        original=torch.full((1,3,32,32),0.25)
        generated=torch.full_like(original,0.75)
        mask=torch.zeros((1,16,16));mask[:,4:12,4:12]=1
        edited=composite(original.clone(),generated,0,0,mask,multiplier=1)
        self.assertTrue(torch.equal(edited[:,:,:4,:],original[:,:,:4,:]))
        self.assertTrue(torch.all(edited[:,:,12:20,12:20]==0.75))


if __name__ == '__main__': unittest.main()
