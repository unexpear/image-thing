import fs from 'fs';

const path = 'simple-editor/director-3d-engine.js';
let s = fs.readFileSync(path, 'utf8');

const startMarker = '/** Exact alpha-contour rings in card UV';
const altStart = '/** Bilinear iso-contour rings in card UV';
const endMarker = 'export function parentDrawingPointInInkContours';

let start = s.indexOf(startMarker);
if (start < 0) start = s.indexOf(altStart);
const end = s.indexOf(endMarker);
if (start < 0 || end < 0 || end <= start) {
  console.error('markers not found', { start, end });
  process.exit(1);
}

const replacement = `/** Bilinear iso-contour rings in card UV (0..1). Marching-squares over the alpha
 *  field with edge crossings at alpha=threshold (linear along each cell edge = the
 *  bilinear patch restricted to that edge). Removes discrete texel stair-steps on
 *  Decal silhouettes. Honest partial — cell-edge iso polylines (not fitted stroke
 *  Bezier / full hyperbolic in-cell curves / recursive subdivision). Null when
 *  unreadable or fully transparent. */
export function parentDrawingInkContoursUV(pixels,threshold=DECAL_PARENT_DRAWING_INK_ALPHA){
 if(!pixels?.data||!(pixels.width>0)||!(pixels.height>0))return null;
 const w=pixels.width,h=pixels.height,data=pixels.data,thr=threshold|0;
 const alphaAt=(x,y)=>{
  if(x<0||y<0||x>=w||y>=h)return 0;
  return data[(y*w+x)*4+3]|0;
 };
 const toUV=(px,py)=>({u:px/w,v:pixels.flipY?1-py/h:py/h});
 const lerpEdge=(x0,y0,a0,x1,y1,a1)=>{
  const denom=(a0-a1)||1e-6;
  let t=(a0-thr)/denom;
  if(t<0)t=0;else if(t>1)t=1;
  return {x:x0+(x1-x0)*t,y:y0+(y1-y0)*t};
 };
 const qKey=(x,y)=>Math.round(x*1e6)+','+Math.round(y*1e6);
 const edgeKey=(x0,y0,x1,y1)=>qKey(x0,y0)+'>'+qKey(x1,y1);
 const edges=new Map();
 const addSeg=(p0,p1)=>{
  if(Math.abs(p0.x-p1.x)<1e-12&&Math.abs(p0.y-p1.y)<1e-12)return;
  edges.set(edgeKey(p0.x,p0.y,p1.x,p1.y),{x0:p0.x,y0:p0.y,x1:p1.x,y1:p1.y});
 };
 let opaque=0,minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(alphaAt(x,y)>thr){
   opaque++;
   if(x<minX)minX=x;if(x>maxX)maxX=x;
   if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
 }
 if(opaque<1||maxX<minX)return null;
 // Padded MS grid: outside samples are alpha 0 so border ink gets a closed contour.
 for(let y=-1;y<h;y++)for(let x=-1;x<w;x++){
  const aSW=alphaAt(x,y),aSE=alphaAt(x+1,y),aNE=alphaAt(x+1,y+1),aNW=alphaAt(x,y+1);
  const code=(aSW>thr?1:0)|(aSE>thr?2:0)|(aNE>thr?4:0)|(aNW>thr?8:0);
  if(code===0||code===15)continue;
  const bot=()=>lerpEdge(x,y,aSW,x+1,y,aSE);
  const rit=()=>lerpEdge(x+1,y,aSE,x+1,y+1,aNE);
  const top=()=>lerpEdge(x,y+1,aNW,x+1,y+1,aNE);
  const lef=()=>lerpEdge(x,y,aSW,x,y+1,aNW);
  // Oriented with ink on the left (CCW around opaque region) for stable rings.
  switch(code){
   case 1:addSeg(lef(),bot());break;
   case 2:addSeg(bot(),rit());break;
   case 3:addSeg(lef(),rit());break;
   case 4:addSeg(rit(),top());break;
   case 5:{
    if((aSW+aSE+aNE+aNW)*0.25>thr){addSeg(lef(),top());addSeg(bot(),rit());}
    else{addSeg(lef(),bot());addSeg(rit(),top());}
    break;
   }
   case 6:addSeg(bot(),top());break;
   case 7:addSeg(lef(),top());break;
   case 8:addSeg(top(),lef());break;
   case 9:addSeg(top(),bot());break;
   case 10:{
    if((aSW+aSE+aNE+aNW)*0.25>thr){addSeg(bot(),lef());addSeg(top(),rit());}
    else{addSeg(bot(),rit());addSeg(top(),lef());}
    break;
   }
   case 11:addSeg(top(),rit());break;
   case 12:addSeg(rit(),lef());break;
   case 13:addSeg(rit(),bot());break;
   case 14:addSeg(bot(),lef());break;
  }
 }
 if(!edges.size)return null;
 const byStart=new Map();
 for(const e of edges.values()){
  const k=qKey(e.x0,e.y0);
  let arr=byStart.get(k);if(!arr){arr=[];byStart.set(k,arr);}arr.push(e);
 }
 const rings=[],used=new Set();
 for(const startE of edges.values()){
  const sk=edgeKey(startE.x0,startE.y0,startE.x1,startE.y1);
  if(used.has(sk))continue;
  const ring=[];
  let e=startE,guard=0;
  const startQ=qKey(startE.x0,startE.y0);
  while(e&&guard++<edges.size+4){
   const ek=edgeKey(e.x0,e.y0,e.x1,e.y1);
   if(used.has(ek))break;
   used.add(ek);
   ring.push(toUV(e.x0,e.y0));
   if(qKey(e.x1,e.y1)===startQ&&ring.length>=3){
    ring.push(toUV(e.x1,e.y1));
    break;
   }
   const cands=byStart.get(qKey(e.x1,e.y1))||[];
   let next=null;
   for(const c of cands){
    if(!used.has(edgeKey(c.x0,c.y0,c.x1,c.y1))){next=c;break;}
   }
   if(!next)break;
   e=next;
  }
  if(ring.length>=4){
   const a=ring[0],b=ring[ring.length-1];
   if(Math.abs(a.u-b.u)>1e-9||Math.abs(a.v-b.v)>1e-9)ring.push({u:a.u,v:a.v});
   rings.push(ring);
  }
 }
 if(!rings.length)return null;
 const u0=minX/w,u1=(maxX+1)/w;
 let v0,v1;
 if(pixels.flipY){v0=1-(maxY+1)/h;v1=1-minY/h;}
 else{v0=minY/h;v1=(maxY+1)/h;}
 if(!(u1>u0)||!(v1>v0))return null;
 const segments=[];
 for(const ring of rings){
  for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1];
   if(Math.abs(a.u-b.u)<1e-12&&Math.abs(a.v-b.v)<1e-12)continue;
   segments.push({u0:a.u,v0:a.v,u1:b.u,v1:b.v});
  }
 }
 return {
  rings,segments,
  footprint:{u0,u1,v0,v1,opaque,width:w,height:h},
  opaque,width:w,height:h,
  mode:'bilinear-iso'
 };
}
`;

s = s.slice(0, start) + replacement + s.slice(end);

// Update comments / mode strings elsewhere in this file
const swaps = [
  [
    ` *  exact alpha-contour (pixel-boundary rings) so thin strokes keep a hard ink edge.\n *  Honest partial — discrete texel contour clip (not bilinear iso / stroke Bezier). */`,
    ` *  bilinear iso-contour (MS edge crossings at alpha=threshold) so thin strokes keep a\n *  hard ink edge without discrete texel stair-steps. Honest partial — cell-edge iso\n *  polylines (not stroke Bezier / full hyperbolic in-cell curves). */`
  ],
  [
    `   mode:inkContours?'alpha-contour':'aabb-ms',`,
    `   mode:inkContours?(inkContours.mode||'bilinear-iso'):'aabb-ms',`
  ],
  [
    ` *  clipped to the exact drawing alpha-contour with edge remesh. Honest partial — discrete\n *  texel contour (not host atlas / bilinear iso / stroke Bezier).\n *  under the card (caller falls back to Conform then flat). */`,
    ` *  clipped to the bilinear drawing iso-contour with edge remesh. Honest partial —\n *  cell-edge iso polylines (not host atlas / stroke Bezier / full hyperbolic cells).\n *  under the card (caller falls back to Conform then flat). */`
  ],
  [
    `   mode:'alpha-contour',`,
    `   mode:inkContoursPlanar.mode||'bilinear-iso',`
  ],
];

for (const [a, b] of swaps) {
  if (!s.includes(a)) {
    console.warn('WARN missing swap pattern:', a.slice(0, 80));
  } else {
    s = s.split(a).join(b);
  }
}

fs.writeFileSync(path, s);
console.log('patched', path, 'bytes', s.length);
