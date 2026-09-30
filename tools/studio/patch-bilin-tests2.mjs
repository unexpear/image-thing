import fs from 'fs';
const path='tools/studio/director-parent-drawing-check.mjs';
let s=fs.readFileSync(path,'utf8');

// Add diagonal assert after mode check
const modeLine="assert.equal(cont.mode,'bilinear-iso');\r\n assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');";
const modeRepl="assert.equal(cont.mode,'bilinear-iso');\r\n let diag=0;for(const seg of cont.segments){if(Math.abs(seg.u1-seg.u0)>1e-9&&Math.abs(seg.v1-seg.v0)>1e-9)diag++;}\r\n assert.ok(diag>=1,'diagonal iso segment (not pure texel stair-steps)');\r\n assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');";
if(!s.includes('diagonal iso segment')){
  if(!s.includes(modeLine)){console.error('mode line missing'); process.exit(1);}
  s=s.replace(modeLine, modeRepl);
}

const softBlock=`\r\n\r\n// Soft-edge bilinear: iso sits between texels (not on integer pixel corners only)\r\n{\r\n const soft=blobTexture(32,32,(x,y,set)=>{\r\n  // Left half opaque, right half transparent — crossing should be threshold-lerp near half.\r\n  if(x<16)set(40,220,90,255);\r\n });\r\n const pix=parentDrawingTexturePixels(soft);\r\n const cont=parentDrawingInkContoursUV(pix);\r\n assert.ok(cont&&cont.mode==='bilinear-iso','soft-edge bilinear mode');\r\n let nearHalf=0;\r\n for(const seg of cont.segments){\r\n  const um=(seg.u0+seg.u1)*0.5;\r\n  if(Math.abs(um-0.5)<0.08 && Math.abs(seg.u1-seg.u0)<0.02)nearHalf++;\r\n }\r\n assert.ok(nearHalf>=1,'soft-edge vertical iso near half');\r\n assert.ok(parentDrawingPointInInkContours(cont,0.25,0.5),'ink side inside');\r\n assert.ok(!parentDrawingPointInInkContours(cont,0.75,0.5),'clear side outside');\r\n soft.dispose();\r\n}`;

if(!s.includes('soft-edge bilinear')){
  const anchor='\r\n stroke.dispose();\r\n}\r\n\r\n\r\n// Silhouette-clipped Decal';
  if(!s.includes(anchor)){console.error('anchor missing'); console.log(JSON.stringify(s.slice(s.indexOf('stroke.dispose()'), s.indexOf('stroke.dispose()')+80))); process.exit(1);}
  s=s.replace(anchor, '\r\n stroke.dispose();\r\n}'+softBlock+'\r\n\r\n\r\n// Silhouette-clipped Decal');
}

fs.writeFileSync(path,s);
console.log('ok diag', s.includes('diagonal iso segment'), 'soft', s.includes('soft-edge bilinear'));
