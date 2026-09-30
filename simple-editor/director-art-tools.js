// Marks remain editable stroke data and use the same renderer for preview/export.
export const ART_MODES=['ink','taper','detail','shadow','highlight'];

/** Canvas XY from a point that may carry optional pressure as [x,y,pressure]. */
export function pointXY(p){
  return [Number(p[0]), Number(p[1])];
}

/** Stylus pressure 0-1 from point[2]; omit / short points = full width/opacity (legacy / mouse). */
export function pointPressure(p, fallback=1){
  if(Array.isArray(p) && p.length>=3 && Number.isFinite(p[2])) return Math.min(1, Math.max(0, p[2]));
  return fallback;
}

/** True when any sample stores a pressure channel. */
export function strokeUsesPressure(s){
  return Array.isArray(s?.points) && s.points.some(p=>Array.isArray(p) && p.length>=3 && Number.isFinite(p[2]));
}

/** Width scale from pressure unless the stroke opted out (opacity-only capture). */
export function pressureWidthScale(s, p){
  if(s?.pressureWidth===false) return 1;
  return pointPressure(p);
}

/** Clamp opacity floor 0-1 (0 = no floor / full pressure fade). */
export function clampOpacityFloor(floor){
  const n=Number(floor);
  if(!Number.isFinite(n)||n<=0) return 0;
  return Math.min(1, n);
}

/**
 * Opacity scale from pressure when the stroke opted in at capture.
 * Optional stroke.opacityFloor (0-1) maps pressure into [floor, 1] so light
 * stylus marks stay visible: alpha = floor + (1-floor)*pressure.
 */
export function pressureOpacityScale(s, p){
  if(!s?.pressureOpacity) return 1;
  const pr=pointPressure(p);
  const floor=clampOpacityFloor(s.opacityFloor);
  if(floor<=0) return pr;
  return floor + (1-floor)*pr;
}

/**
 * Convert a grayscale max-opacity map (RGB luminance, opaque) into an alpha
 * mask: R -> A * baseAlpha, RGB white. Mutates and returns the ImageData.
 * Used so overlapping soft pressure segments keep max(alpha), not flow pile-up.
 */
export function applyPressureOpacityMaskData(imageData, baseAlpha=1){
  const d=imageData?.data;
  if(!d) return imageData;
  const ba=Math.min(1, Math.max(0, Number(baseAlpha)));
  const scale=Number.isFinite(ba) ? ba : 1;
  for(let i=0;i<d.length;i+=4){
    d[i+3]=Math.round(d[i]*scale);
    d[i]=d[i+1]=d[i+2]=255;
  }
  return imageData;
}

/**
 * Round overlapping segments with per-sample width and optional per-sample alpha
 * (tablet pressure and/or art finishes). widthAt(i) / alphaAt(i) return CSS px
 * line width and 0-1 coverage for sample i. When alpha varies, segments build an
 * offscreen stroke bitmap with max-opacity compositing (Photoshop opacity vs
 * flow): overlaps keep max(per-point alpha), then blit once so brush source-over
 * / eraser destination-out see one bitmap. Per-point alpha multiplies any
 * pre-set ctx.globalAlpha (e.g. mark strength). Always on for pressureOpacity
 * strokes (no separate toggle).
 */
export function paintPressureStroke(ctx, s, widthAt, alphaAt){
  const points=s.points;
  if(!points?.length) return;
  const widthFn=typeof widthAt==='function' ? widthAt : (i=>s.size*pressureWidthScale(s, points[i]));
  const alphaFn=typeof alphaAt==='function' ? alphaAt : (s?.pressureOpacity ? (i=>pressureOpacityScale(s, points[i])) : null);
  let baseAlpha=1;
  try{ const g=ctx.globalAlpha; if(Number.isFinite(g)) baseAlpha=g; }catch{}
  let needsAlpha=false;
  if(alphaFn){
    for(let i=0;i<points.length;i++){
      const a=Number(alphaFn(i));
      if(Number.isFinite(a) && a<1-1e-9){ needsAlpha=true; break; }
    }
  }

  const drawGeom=(target, styleAt)=>{
    target.lineCap=target.lineJoin='round';
    for(let i=0;i<points.length;i++){
      styleAt(target, i);
      const w=Math.max(0.5, Number(widthFn(i))||0);
      const [x,y]=pointXY(points[i]);
      target.lineWidth=w;
      target.beginPath();
      if(i){
        const [x0,y0]=pointXY(points[i-1]);
        target.moveTo(x0,y0);
        target.lineTo(x,y);
        target.stroke();
      }else{
        target.arc(x,y,w/2,0,Math.PI*2);
        target.fill();
      }
    }
  };

  const paintFlow=(target, applyAlpha)=>{
    drawGeom(target, (t, i)=>{
      t.strokeStyle=t.fillStyle=s.color;
      if(applyAlpha){
        const a=Math.min(1, Math.max(0, Number(alphaFn(i))||0));
        t.globalAlpha=baseAlpha*a;
      }
    });
    if(applyAlpha) target.globalAlpha=baseAlpha;
  };

  if(!needsAlpha){
    paintFlow(ctx, false);
    return;
  }

  const cw=ctx.canvas?.width|0, ch=ctx.canvas?.height|0;
  const canOffscreen=cw>0 && ch>0 && typeof document!=='undefined' && typeof document.createElement==='function';
  if(!canOffscreen){
    // No bitmap surface (Node unit mocks): fall back to direct per-segment alpha.
    paintFlow(ctx, true);
    return;
  }

  // Max-opacity stroke bitmap (always on when per-point alpha varies):
  // 1) Ink coverage at full opacity in stroke color.
  // 2) Opacity map: gray=pressure via lighten (channel-wise max) on opaque black.
  // 3) Gray -> alpha * baseAlpha; destination-in multiplies ink coverage.
  // Caller composite (source-over / destination-out) then applies once on blit.
  const ink=document.createElement('canvas');
  ink.width=cw; ink.height=ch;
  const ic=ink.getContext('2d');
  paintFlow(ic, false);

  const opac=document.createElement('canvas');
  opac.width=cw; opac.height=ch;
  const oc=opac.getContext('2d');
  oc.fillStyle='#000';
  oc.fillRect(0, 0, cw, ch);
  oc.globalCompositeOperation='lighten';
  drawGeom(oc, (t, i)=>{
    const a=Math.min(1, Math.max(0, Number(alphaFn(i))||0));
    const g=Math.round(a*255);
    t.strokeStyle=t.fillStyle='rgb('+g+','+g+','+g+')';
  });
  const mask=oc.getImageData(0, 0, cw, ch);
  applyPressureOpacityMaskData(mask, baseAlpha);
  oc.putImageData(mask, 0, 0);

  ic.globalCompositeOperation='destination-in';
  ic.drawImage(opac, 0, 0);

  ctx.globalAlpha=1;
  ctx.drawImage(ink, 0, 0);
  ctx.globalAlpha=baseAlpha;
}

/** Validate optional pressure channel on a drawing point (length 2 or 3). */
export function validateStrokePoint(p, boardW, boardH){
  if(!Array.isArray(p) || (p.length!==2 && p.length!==3) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return false;
  if(p[0]<0 || p[0]>boardW || p[1]<0 || p[1]>boardH) return false;
  if(p.length===3 && (!Number.isFinite(p[2]) || p[2]<0 || p[2]>1)) return false;
  return true;
}

export function validateArtStroke(stroke){
  if(stroke.art!==undefined&&!ART_MODES.includes(stroke.art))throw Error('Unknown drawing finish.');
  if(stroke.strength!==undefined&&(!Number.isFinite(stroke.strength)||stroke.strength<.05||stroke.strength>1))throw Error('Mark strength must be between 5% and 100%.');
  if(stroke.pressureOpacity!==undefined&&typeof stroke.pressureOpacity!=='boolean')throw Error('Invalid pressure-opacity flag.');
  if(stroke.pressureWidth!==undefined&&typeof stroke.pressureWidth!=='boolean')throw Error('Invalid pressure-width flag.');
  if(stroke.opacityFloor!==undefined){
    if(!Number.isFinite(stroke.opacityFloor)||stroke.opacityFloor<0||stroke.opacityFloor>1)throw Error('Opacity floor must be between 0 and 1.');
  }
}

export function paintArtStroke(ctx,s){
  if(!s.art||(s.art==='ink'&&(s.strength??1)===1&&!strokeUsesPressure(s))||s.tool!=='brush')return false;
  ctx.save();ctx.globalAlpha=s.strength??1;
  ctx.globalCompositeOperation=['shadow','highlight'].includes(s.art)?'source-atop':'source-over';
  ctx.strokeStyle=ctx.fillStyle=s.color;ctx.lineCap=ctx.lineJoin='round';
  const points=s.points;
  const artScale=i=>s.art==='detail'?.35:s.art==='taper'?.15+.85*Math.sin(Math.PI*(i+.5)/points.length):1;
  const widthAt=i=>s.size*artScale(i)*pressureWidthScale(s, points[i]);
  const alphaAt=s.pressureOpacity ? (i=>pressureOpacityScale(s, points[i])) : null;
  paintPressureStroke(ctx,s,widthAt,alphaAt);
  ctx.restore();return true;
}

/** Clamp stroke-stabilizer strength to 0-1 (0 = off / raw pointer). */
export function clampStabilizer(strength){
  const n=Number(strength);
  if(!Number.isFinite(n)||n<=0) return 0;
  return Math.min(1, n);
}

/** Pull toward the tip each sample: 1 = snap (off), ~0.12 at full strength. */
export function stabilizerPull(strength){
  const s=clampStabilizer(strength);
  if(s<=0) return 1;
  return 1 - s*0.88;
}

/**
 * One lazy-mouse step. Mutates state {x,y}. Returns a new point matching tip
 * shape ([x,y] or [x,y,pressure]). strength 0 snaps to the tip.
 */
export function stabilizeStep(state, tip, strength){
  const pull=stabilizerPull(strength);
  const [tx,ty]=pointXY(tip);
  if(pull>=1-1e-9){
    state.x=tx; state.y=ty;
    return tip.length>=3 ? [tx,ty,tip[2]] : [tx,ty];
  }
  state.x+=(tx-state.x)*pull;
  state.y+=(ty-state.y)*pull;
  const x=Math.round(state.x*10)/10, y=Math.round(state.y*10)/10;
  return tip.length>=3 ? [x,y,tip[2]] : [x,y];
}

/**
 * Drain remaining lag toward tip on pointer-up. Returns extra points to append
 * (does not include points already stored). Ends with a tip snap so the stroke
 * finishes under the stylus.
 */
export function stabilizeCatchUp(state, tip, strength, maxSteps=24){
  const pull=stabilizerPull(strength);
  const out=[];
  if(pull>=1-1e-9||!state) return out;
  const [tx,ty]=pointXY(tip);
  // Already under the tip: nothing to drain (avoid a duplicate end snap).
  if(Math.hypot(tx-state.x, ty-state.y)<0.5) return out;
  const steps=Math.max(0, Math.min(48, Math.floor(Number(maxSteps)||0)));
  for(let i=0;i<steps;i++){
    if(Math.hypot(tx-state.x, ty-state.y)<0.5) break;
    const p=stabilizeStep(state, tip, strength);
    const prev=out.at(-1);
    if(prev && Math.hypot(p[0]-prev[0], p[1]-prev[1])<0.25) continue;
    out.push(p);
  }
  const end=tip.length>=3
    ? [Math.round(tx*10)/10, Math.round(ty*10)/10, tip[2]]
    : [Math.round(tx*10)/10, Math.round(ty*10)/10];
  state.x=tx; state.y=ty;
  const last=out.at(-1);
  if(!last || Math.hypot(end[0]-last[0], end[1]-last[1])>=0.25) out.push(end);
  return out;
}

export function paintValueCheck(canvas){
  const ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){const v=Math.round(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2]);pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
  ctx.putImageData(pixels,0,0);
}