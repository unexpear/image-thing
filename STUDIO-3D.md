# Local static mesh generation

Open http://127.0.0.1:8188/qwen-editor/mesh.html after launching Studio.

The 3D tab uses ComfyUI's native Hunyuan3D-2 multi-view Turbo workflow. It shares the execution queue and memory manager with the existing image/video tools. No additional Python packages or cloud API are required.

Use an isolated object on a plain background. Front is required; left, back and right are optional views of that same object. Start at a 128 grid, 10 sampling steps and 5,000 target triangles. The target is approximate: inspect the exported geometry before using it in a game.

Outputs are static, untextured GLB meshes with polygon reduction and smoothed normals, saved under `ComfyUI_windows_portable/ComfyUI/output/Qwen-Studio/3D`. These are a starting point for asset work, not automatically finished game assets. UVs, materials, collision, scale, topology review and engine validation remain separate steps.

The viewer is a locally bundled copy of Google's model-viewer 4.3.1. Drag to orbit, scroll to zoom and right-drag to pan. Its source license is in simple-editor/vendor/model-viewer-LICENSE.txt.

Model download and SHA256 verification: run download_3d_model.py with the embedded Python. Provenance is in downloads/3d-model-manifest.json. The original Hunyuan model license applies: https://huggingface.co/tencent/Hunyuan3D-2mv/blob/main/LICENSE.

Implementation references:
- https://docs.comfy.org/tutorials/3d/hunyuan3D-2
- Installed official template: comfyui_workflow_templates_json/templates/3d_hunyuan3d_multiview_to_model_turbo.json
- https://modelviewer.dev/docs/

The initial TripoSR source inspection is retained under studio-3d/TripoSR; it is not installed or used at runtime.

Verified on this laptop: 128 grid, 10 sampling steps, 5,000 target triangles, one synthetic cube reference. Generation completed in 16.62 seconds; the exported GLB contained 3,594 triangles and 1,945 vertices, no animations, and loaded in the browser viewer. This is a functional test, not a quality guarantee for arbitrary references.

The cleanup extension now includes 3D file extensions. Its Python change takes effect on the next backend restart; the automatic restart during setup was blocked by approval review.
