import fs from 'fs';

// --- tests ---
{
  const path = 'tools/studio/director-parent-drawing-check.mjs';
  let s = fs.readFileSync(path, 'utf8');
  const oldBlock = `// Exact alpha-contour helpers
{
 const stroke=blobTexture(64,64,(x,y,set)=>{
  // Thin diagonal stroke — AABB is loose; contour should hug the ink.
  if(Math.abs((x-y))<=1 && x>=8 && x<56)set(40,220,90,255);
 });
 const pix=parentDrawingTexturePixels(stroke);
 const cont=parentDrawingInkContoursUV(pix);
 assert.ok(cont&&cont.rings.length>=1,'stroke has contour rings');
 assert.ok(cont.segments.length>=8,'stroke has contour segments');
 assert.equal(cont.mode,'alpha-contour');
 assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');
 assert.ok(!parentDrawingPointInInkContours(cont,0.1,0.9),'far corner outside contour');
 const foot=cont.footprint;
 assert.ok(foot.u1-foot.u0<0.95&&foot.v1-foot.v0<0.95,'contour footprint tighter than full card');
 const cross=parentDrawingSegmentInkCrossing(cont,0.1,0.9,0.5,0.5);
 assert.ok(cross&&cross.t>0&&cross.t<1,'segment crosses contour');
 stroke.dispose();
}`;

  // Try flexible match if emdash differs
  if (!s.includes("assert.equal(cont.mode,'alpha-contour')") && !s.includes("assert.equal(cont.mode,'bilinear-iso')")) {
    console.error('contour test block markers missing');
    process.exit(1);
  }

  s = s.replace("assert.equal(cont.mode,'alpha-contour');", "assert.equal(cont.mode,'bilinear-iso');");
  s = s.replace("assert.equal(sil.mode,'alpha-contour','exact alpha-contour mode');", "assert.equal(sil.mode,'bilinear-iso','bilinear iso-contour mode');");
  s = s.replace('// Exact alpha-contour helpers', '// Bilinear iso-contour helpers');

  // Insert diagonal-segment assert after mode check if not present
  if (!s.includes('diagonal iso segment')) {
    s = s.replace(
      "assert.equal(cont.mode,'bilinear-iso');\n assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');",
      "assert.equal(cont.mode,'bilinear-iso');\n let diag=0;for(const seg of cont.segments){if(Math.abs(seg.u1-seg.u0)>1e-9&&Math.abs(seg.v1-seg.v0)>1e-9)diag++;}\n assert.ok(diag>=1,'diagonal iso segment (not pure texel stair-steps)');\n assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');"
    );
  }

  // Soft-gradient contour placement test
  if (!s.includes('soft-edge bilinear')) {
    const insertAfter = " stroke.dispose();\n}\n\n\n// Silhouette-clipped Decal";
    const softTest = ` stroke.dispose();
}

// Soft-edge bilinear: iso sits between texels (not on integer pixel corners only)
{
 const soft=blobTexture(32,32,(x,y,set)=>{
  // Left half opaque, right half transparent — crossing should be ~threshold lerp, not stair only.
  if(x<16)set(40,220,90,255);
 });
 const pix=parentDrawingTexturePixels(soft);
 const cont=parentDrawingInkContoursUV(pix);
 assert.ok(cont&&cont.mode==='bilinear-iso','soft-edge bilinear mode');
 // Vertical iso near u=16/32=0.5; allow lerp inset toward transparent.
 let nearHalf=0;
 for(const seg of cont.segments){
  const um=(seg.u0+seg.u1)*0.5;
  if(Math.abs(um-0.5)<0.08 && Math.abs(seg.u1-seg.u0)<0.02)nearHalf++;
 }
 assert.ok(nearHalf>=1,'soft-edge vertical iso near half');
 assert.ok(parentDrawingPointInInkContours(cont,0.25,0.5),'ink side inside');
 assert.ok(!parentDrawingPointInInkContours(cont,0.75,0.5),'clear side outside');
 soft.dispose();
}

// Silhouette-clipped Decal`;
    if (s.includes(insertAfter)) s = s.replace(insertAfter, softTest);
    else {
      // try without double newline
      const alt = " stroke.dispose();\n}\n\n// Silhouette-clipped Decal";
      if (s.includes(alt)) s = s.replace(alt, softTest.replace('\n\n// Silhouette', '\n// Silhouette').replace('// Silhouette-clipped Decal', '// Silhouette-clipped Decal'));
      else console.warn('WARN soft-edge insert point missing');
    }
  }

  fs.writeFileSync(path, s);
  console.log('patched tests', path);
}

// --- UX strings ---
function swapFile(path, pairs) {
  let s = fs.readFileSync(path, 'utf8');
  let n = 0;
  for (const [a, b] of pairs) {
    if (s.includes(a)) { s = s.split(a).join(b); n++; }
    else console.warn('WARN missing in', path, ':', a.slice(0, 70));
  }
  fs.writeFileSync(path, s);
  console.log('patched', path, 'swaps', n);
}

swapFile('simple-editor/director-drawing.js', [
  [
    'adaptive card→mesh raycast UVs clipped to the exact drawing alpha-contour (stroke/ink) with edge remesh; planar host-tri fallback is ink-clipped too.',
    'adaptive card→mesh raycast UVs clipped to a bilinear iso-contour of the drawing alpha (stroke/ink) with edge remesh; planar host-tri fallback is ink-clipped too.'
  ],
  [
    'exact alpha-contour clip + edge remesh so thin strokes stay hard (not soft AABB/MS edges)',
    'bilinear iso-contour clip + edge remesh so thin strokes stay hard without texel stair-steps (not soft AABB/MS edges)'
  ],
]);

swapFile('simple-editor/director-3d.js', [
  [
    'exact alpha-contour clip + edge remesh, and host bone weights',
    'bilinear iso-contour clip + edge remesh, and host bone weights'
  ],
]);
