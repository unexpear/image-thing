import fs from 'fs';
const path = 'reports/studio/cartoon-engine-status-2026-09-28.md';
const block = `

## Decal bilinear iso-contour (engine pass)

ENGINE ONLY. No toon JSON. No \`D:\\mmathEn\` writes. No commit. No chipzzzd.

Ran ~2026-09-29 00:25 ET. Node v24.15.0. \`npm run check:director\` -> **24 PASS / 0 FAIL**.

### Ranked drawing gaps

1. **Bilinear iso-contour for Decal edges** - Prior exact alpha-contour was a discrete texel pixel-boundary walk (axis-aligned stair-steps at extreme zoom). **-> Fixed this pass:** marching-squares over the alpha field with edge crossings at \`alpha=threshold\` (linear along each cell edge = bilinear patch edge restriction); shared by live + export.
2. Optional leftovers: waveform polish if any gap remains; Overlay/Soft-light MSAA already shipped.
3. Optional: fitted stroke Bezier / full hyperbolic in-cell iso curves if cell-edge polylines still look coarse on ultra-zoomed soft brushes.

### What shipped

| Piece | Path |
|---|---|
| \`parentDrawingInkContoursUV\` -> bilinear MS iso rings (\`mode:'bilinear-iso'\`); padded outside=0; saddle asymptotic decider | \`simple-editor/director-3d-engine.js\` |
| Ray-grid + planar Decal silhouette metadata use contour \`mode\` (\`bilinear-iso\`) | same |
| Toast / Draw hint / Finish hint mention bilinear iso-contour | \`simple-editor/director-drawing.js\`, \`director-3d.js\` |
| Contour helper + silhouette mode asserts; diagonal-segment + soft-edge half-plane checks | \`tools/studio/director-parent-drawing-check.mjs\` |
| Deploy list | \`Deploy-Editor.ps1\` (already listed \`director-3d-engine.js\` / drawing / 3d) |

**Strategy:** Sample texel alphas on a padded grid (outside = 0). For each 2x2 cell, extract the \`alpha=threshold\` isoline with marching squares; place vertices by linear interpolation along cell edges (the bilinear field restricted to that edge). Chain directed segments into closed rings. Even-odd point-in + segment crossing unchanged. Live Conform/Decal preview and Download animated GLB still share \`buildDecalParentDrawingMesh\` / \`buildDecalRayGridMesh\`.

**Honest partial:** Cell-edge iso polylines — not fitted stroke Bezier, not full hyperbolic curves inside each cell, not recursive sub-pixel subdivision. HTMLImage textures still unreadable (DataTexture / canvas only). Diagonal MS pairs still skipped in the ray-grid remesh (contour crossings still improve thin-stroke tips). Soft alpha gradients get a smooth-ish edge; binary ink sits near the opaque/clear texel boundary with diagonals through corner cells (no stair-only silhouette).

**UX:** No new controls. Draw storyboard -> Moves with joint -> **GLB card style -> Decal** (+ Include drawing layers over 3D for live). Thin / diagonal ink edges should stair-step less at extreme zoom in the live viewport and in Download animated GLB. Toast/hint note bilinear iso-contour clip.

**Deploy:** Ran \`Deploy-Editor.ps1\` (JS under \`/qwen-editor/\`, including \`director-3d-engine.js\`, \`director-drawing.js\`, \`director-3d.js\`). Reload Director (Ctrl+R). **No ComfyUI restart** - JS only.

### Still open / next

1. Decal bilinear iso-contour - **kept** (just shipped; cell-edge MS honest partial).
2. Optional leftovers: waveform polish if any gap remains.
3. Optional: stroke Bezier fit / hyperbolic in-cell iso if ultra-zoom soft brushes still look faceted.

Recommend next engine pass: **waveform polish** if that gap is still open, or live craft review of zoomed Decal sticker edges.
`;

fs.appendFileSync(path, block);
console.log('appended', path, 'bytes now', fs.statSync(path).size);
