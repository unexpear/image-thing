import assert from 'node:assert/strict';
import {newDrawing,validateDrawing,MAX_LAYERS,MAX_POINTS} from '../../simple-editor/director-drawing.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {
  pointXY,pointPressure,strokeUsesPressure,validateStrokePoint,validateArtStroke,paintArtStroke,
  paintPressureStroke,pressureWidthScale,pressureOpacityScale,clampOpacityFloor,applyPressureOpacityMaskData,
  clampStabilizer,stabilizerPull,stabilizeStep,stabilizeCatchUp,
} from '../../simple-editor/director-art-tools.js';

const board=newDrawing(),stroke={tool:'brush',color:'#112233',size:6,points:[[0,0],[960,540]]};
board.layers[0].strokes.push(stroke);validateDrawing(board);
const p=newProject();p.scenes[0].shots.push({id:'shot',seconds:2,drawing:board});validateProject(JSON.parse(JSON.stringify(p)));
const invalid=mutate=>{const copy=structuredClone(board);mutate(copy);assert.throws(()=>validateDrawing(copy));};
invalid(b=>b.layers[0].opacity=NaN);invalid(b=>b.layers[0].strokes[0].points=[[961,20]]);invalid(b=>b.layers[0].strokes[0].tool='bad');
invalid(b=>b.layers.push(structuredClone(b.layers[0])));invalid(b=>b.layers=Array(MAX_LAYERS+1).fill(b.layers[0]));
invalid(b=>b.layers[0].strokes[0].points=Array(MAX_POINTS+1).fill([1,1]));invalid(b=>b.layers=[]);
for(const tool of ['line','rectangle','ellipse']){const copy=structuredClone(board);copy.layers[0].strokes[0].tool=tool;copy.layers[0].strokes[0].filled=true;validateDrawing(copy);}
invalid(b=>{b.layers[0].strokes[0].tool='ellipse';b.layers[0].strokes[0].points=[[1,1]];});
invalid(b=>b.layers[0].strokes[0].filled='yes');
board.over3d=true;validateDrawing(board);validateProject(JSON.parse(JSON.stringify(p)));
invalid(b=>b.over3d='yes');board.over3d=false;validateDrawing(board);
// Durable onion prefs on drawing (like over3d / shot.silhouette)
board.onion=true;board.onionDepth=3;validateDrawing(board);validateProject(JSON.parse(JSON.stringify(p)));
invalid(b=>{b.onion='yes';});
invalid(b=>{b.onionDepth=0;});
invalid(b=>{b.onionDepth=1.5;});
delete board.onion;delete board.onionDepth;validateDrawing(board);
console.log('Durable drawing.onion / onionDepth accepted; invalid rejected.');

// Durable Draw correction overlay on drawing (like onion / over3d)
board.correctionOverlay=true;validateDrawing(board);validateProject(JSON.parse(JSON.stringify(p)));
invalid(b=>{b.correctionOverlay='yes';});
delete board.correctionOverlay;validateDrawing(board);
console.log('Durable drawing.correctionOverlay accepted; invalid rejected.');



// Tablet pressure channel: [x,y,pressure] accepted; bad pressure rejected; legacy [x,y] unchanged.
assert.deepEqual(pointXY([12.5,40,0.4]),[12.5,40]);
assert.equal(pointPressure([12.5,40,0.4]),0.4);
assert.equal(pointPressure([12.5,40]),1);
assert.equal(pointPressure([12.5,40,-1]),0);
assert.equal(pointPressure([12.5,40,2]),1);
assert.ok(validateStrokePoint([10,20],960,540));
assert.ok(validateStrokePoint([10,20,0.5],960,540));
assert.equal(validateStrokePoint([10,20,1.5],960,540),false);
assert.equal(validateStrokePoint([10,20,NaN],960,540),false);
assert.equal(validateStrokePoint([10],960,540),false);

const pressured={tool:'brush',color:'#112233',size:10,art:'ink',strength:1,points:[[10,10,0.2],[40,12,0.8],[70,14,1]]};
assert.equal(strokeUsesPressure(pressured),true);
assert.equal(strokeUsesPressure(stroke),false);
board.layers[0].strokes=[pressured];
validateDrawing(board);
validateProject(JSON.parse(JSON.stringify(p)));

const badPressure=structuredClone(board);
badPressure.layers[0].strokes[0].points=[[10,10,1.2],[20,20,0.5]];
assert.throws(()=>validateDrawing(badPressure),/coordinates/);

const eraserPress={tool:'eraser',color:'#000000',size:8,points:[[5,5,0.3],[25,25,0.9]]};
board.layers[0].strokes=[eraserPress];
validateDrawing(board);

// paintArtStroke must accept solid ink when pressure is present (otherwise width would ignore force).
const calls=[];
const fakeCtx={
  save(){calls.push('save');},
  restore(){calls.push('restore');},
  beginPath(){calls.push('begin');},
  moveTo(){calls.push('move');},
  lineTo(){calls.push('line');},
  arc(){calls.push('arc');},
  stroke(){calls.push('stroke');},
  fill(){calls.push('fill');},
  set globalAlpha(v){calls.push('alpha:'+v);},
  set globalCompositeOperation(v){calls.push('comp:'+v);},
  set strokeStyle(v){calls.push('strokeStyle');},
  set fillStyle(v){calls.push('fillStyle');},
  set lineCap(v){},
  set lineJoin(v){},
  set lineWidth(v){calls.push('w:'+v);},
};
assert.equal(paintArtStroke(fakeCtx,pressured),true);
assert.ok(calls.includes('w:2')); // size 10 * pressure 0.2
assert.ok(calls.includes('w:8')); // size 10 * pressure 0.8
assert.ok(calls.includes('w:10')); // size 10 * pressure 1
assert.equal(paintArtStroke(fakeCtx,{tool:'brush',color:'#112233',size:6,art:'ink',strength:1,points:[[0,0],[1,1]]}),false);

for(const art of ['ink','taper','detail','shadow','highlight'])validateArtStroke({art,strength:.5});
assert.throws(()=>validateArtStroke({art:'unknown'}));


// Pressure → opacity: stroke flag scales per-point alpha; width-only legacy stays opaque.
assert.equal(pressureWidthScale({points:[[0,0,0.5]]}, [0,0,0.5]), 0.5);
assert.equal(pressureWidthScale({pressureWidth:false,points:[[0,0,0.5]]}, [0,0,0.5]), 1);
assert.equal(pressureOpacityScale({}, [0,0,0.4]), 1);
assert.equal(pressureOpacityScale({pressureOpacity:true}, [0,0,0.4]), 0.4);
assert.equal(clampOpacityFloor(-1), 0);
assert.equal(clampOpacityFloor(0), 0);
assert.equal(clampOpacityFloor(2), 1);
assert.equal(clampOpacityFloor(0.2), 0.2);
// Floor maps pressure into [floor, 1]: at p=0 -> floor; at p=1 -> 1; at p=0.5 with floor 0.2 -> 0.6.
assert.equal(pressureOpacityScale({pressureOpacity:true,opacityFloor:0.2}, [0,0,0]), 0.2);
assert.equal(pressureOpacityScale({pressureOpacity:true,opacityFloor:0.2}, [0,0,1]), 1);
assert.ok(Math.abs(pressureOpacityScale({pressureOpacity:true,opacityFloor:0.2}, [0,0,0.5]) - 0.6) < 1e-9);
assert.equal(pressureOpacityScale({pressureOpacity:true,opacityFloor:0}, [0,0,0.4]), 0.4);
assert.equal(pressureOpacityScale({pressureOpacity:true}, [0,0,0.4]), 0.4); // omit floor = legacy

const opacityStroke={tool:'brush',color:'#112233',size:10,art:'ink',strength:1,pressureOpacity:true,points:[[10,10,0.25],[40,12,0.5],[70,14,1]]};
validateDrawing({version:1,layers:[{id:'L',name:'S',visible:true,locked:false,opacity:1,strokes:[opacityStroke]}]});
validateArtStroke(opacityStroke);
assert.throws(()=>validateArtStroke({pressureOpacity:'yes'}));
assert.throws(()=>validateArtStroke({pressureWidth:'yes'}));
assert.throws(()=>validateArtStroke({opacityFloor:1.5}));
assert.throws(()=>validateArtStroke({opacityFloor:'x'}));
validateArtStroke({opacityFloor:0.15});
validateArtStroke({pressureOpacity:true,opacityFloor:0});

const alphaCalls=[];
const alphaCtx={
  canvas:{width:0,height:0}, // force direct (no offscreen) path in Node
  get globalAlpha(){return this._a??1;},
  set globalAlpha(v){this._a=v;alphaCalls.push('alpha:'+v);},
  save(){alphaCalls.push('save');}, restore(){alphaCalls.push('restore');}, beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){},
  drawImage(){alphaCalls.push('blit');},
  set globalCompositeOperation(v){},
  set strokeStyle(v){}, set fillStyle(v){}, set lineCap(v){}, set lineJoin(v){},
  set lineWidth(v){alphaCalls.push('w:'+v);},
};
paintPressureStroke(alphaCtx, opacityStroke);
assert.ok(alphaCalls.some(x=>x==='alpha:0.25'));
assert.ok(alphaCalls.some(x=>x==='alpha:0.5'));
assert.ok(alphaCalls.some(x=>x==='alpha:1'));
assert.ok(alphaCalls.includes('w:2.5')); // size 10 * 0.25
assert.ok(alphaCalls.includes('w:5'));
assert.ok(alphaCalls.includes('w:10'));

// Opacity floor: light pressure stays at floor (direct Node path).
const floorStroke={tool:'brush',color:'#112233',size:10,pressureOpacity:true,opacityFloor:0.25,points:[[10,10,0],[40,12,1]]};
const floorCalls=[];
const floorCtx={
  canvas:{width:0,height:0},
  get globalAlpha(){return this._a??1;},
  set globalAlpha(v){this._a=v;floorCalls.push('alpha:'+v);},
  beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){},
  set strokeStyle(v){}, set fillStyle(v){}, set lineCap(v){}, set lineJoin(v){},
  set lineWidth(v){},
};
paintPressureStroke(floorCtx, floorStroke);
assert.ok(floorCalls.some(x=>x==='alpha:0.25'));
assert.ok(floorCalls.some(x=>x==='alpha:1'));
validateDrawing({version:1,layers:[{id:'L',name:'S',visible:true,locked:false,opacity:1,strokes:[floorStroke]}]});

// Opacity-only capture: full width, faded alpha.
const opacityOnly={tool:'brush',color:'#112233',size:8,pressureOpacity:true,pressureWidth:false,points:[[10,10,0.5],[30,30,0.5]]};
const oo=[];
const ooCtx={
  canvas:{width:0,height:0},
  get globalAlpha(){return this._a??1;},
  set globalAlpha(v){this._a=v;oo.push('alpha:'+v);},
  beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){},
  set strokeStyle(v){}, set fillStyle(v){}, set lineCap(v){}, set lineJoin(v){},
  set lineWidth(v){oo.push('w:'+v);},
};
paintPressureStroke(ooCtx, opacityOnly);
assert.ok(oo.includes('w:8'));
assert.ok(oo.every(x=>!x.startsWith('w:')||x==='w:8'));
assert.ok(oo.some(x=>x==='alpha:0.5'));

// Width-only legacy pressured stroke: no alpha modulation.
const widthOnlyCalls=[];
const widthOnlyCtx={
  canvas:{width:0,height:0},
  get globalAlpha(){return 1;},
  set globalAlpha(v){widthOnlyCalls.push('alpha:'+v);},
  beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){}, fill(){},
  set strokeStyle(v){}, set fillStyle(v){}, set lineCap(v){}, set lineJoin(v){},
  set lineWidth(v){widthOnlyCalls.push('w:'+v);},
};
paintPressureStroke(widthOnlyCtx, pressured);
assert.equal(widthOnlyCalls.filter(x=>x.startsWith('alpha:')).length, 0);

assert.equal(paintArtStroke(alphaCtx, opacityStroke), true);

// Stroke stabilizer (lazy mouse): strength 0 snaps; higher strength lags; catch-up ends on tip.
assert.equal(clampStabilizer(-1), 0);
assert.equal(clampStabilizer(0), 0);
assert.equal(clampStabilizer(2), 1);
assert.equal(clampStabilizer(0.5), 0.5);
assert.equal(stabilizerPull(0), 1);
assert.ok(stabilizerPull(1) < 0.2);
assert.ok(stabilizerPull(0.5) > stabilizerPull(1));
const st={x:0,y:0};
assert.deepEqual(stabilizeStep(st, [100,50], 0), [100,50]);
assert.equal(st.x, 100); assert.equal(st.y, 50);
st.x=0; st.y=0;
const mid=stabilizeStep(st, [100,0,0.7], 1);
assert.ok(mid[0] > 0 && mid[0] < 100);
assert.equal(mid[2], 0.7);
assert.ok(st.x < 100);
const catchPts=stabilizeCatchUp(st, [100,0,0.7], 1, 24);
assert.ok(catchPts.length >= 1);
assert.deepEqual(catchPts.at(-1).slice(0,2), [100,0]);
assert.equal(catchPts.at(-1)[2], 0.7);
assert.equal(st.x, 100);
assert.deepEqual(stabilizeCatchUp({x:10,y:10}, [10,10], 0.5, 8), []); // already on tip
assert.deepEqual(stabilizeCatchUp({x:0,y:0}, [5,0], 0, 8), []); // off = no catch-up


// Max-opacity mask helper: gray luminance -> alpha * baseAlpha (no flow pile-up math).
const maskData={data:new Uint8ClampedArray([128,128,128,255, 64,64,64,255, 255,255,255,255])};
applyPressureOpacityMaskData(maskData, 0.5);
assert.equal(maskData.data[0], 255); assert.equal(maskData.data[1], 255); assert.equal(maskData.data[2], 255);
assert.equal(maskData.data[3], 64); // round(128*0.5)
assert.equal(maskData.data[7], 32); // round(64*0.5)
assert.equal(maskData.data[11], 128); // round(255*0.5)

// Offscreen max-opacity path: lighten opacity map + destination-in, single blit (not per-segment alpha on ink).
const maxOps=[];
function mockMaxCtx(label){
  const ops=maxOps;
  return {
    canvas:{width:64,height:64},
    _a:1,
    get globalAlpha(){return this._a;},
    set globalAlpha(v){this._a=v;ops.push(label+':alpha:'+v);},
    get globalCompositeOperation(){return this._c||'source-over';},
    set globalCompositeOperation(v){this._c=v;ops.push(label+':comp:'+v);},
    strokeStyle:'', fillStyle:'', lineCap:'', lineJoin:'', lineWidth:1,
    beginPath(){}, moveTo(){}, lineTo(){}, arc(){}, stroke(){ops.push(label+':stroke');}, fill(){ops.push(label+':fill');},
    fillRect(){ops.push(label+':fillRect');},
    drawImage(){ops.push(label+':drawImage');},
    getImageData(x,y,w,h){ops.push(label+':getImageData'); const data=new Uint8ClampedArray(w*h*4); for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=100;data[i+3]=255;} return {data,width:w,height:h};},
    putImageData(){ops.push(label+':putImageData');},
  };
}
const maxCanvases=[];
const prevDoc=globalThis.document;
globalThis.document={createElement(tag){assert.equal(tag,'canvas'); const c={width:0,height:0,_label:maxCanvases.length===0?'ink':'opac'}; maxCanvases.push(c); c.getContext=()=>mockMaxCtx(c._label); return c;}};
const hostMax=mockMaxCtx('host');
hostMax.canvas={width:64,height:64};
paintPressureStroke(hostMax, {tool:'brush',color:'#112233',size:10,pressureOpacity:true,points:[[8,8,0.3],[24,8,0.3],[40,8,0.6]]});
globalThis.document=prevDoc;
assert.equal(maxCanvases.length, 2);
assert.ok(maxOps.includes('opac:comp:lighten'));
assert.ok(maxOps.includes('ink:comp:destination-in'));
assert.ok(maxOps.includes('opac:getImageData'));
assert.ok(maxOps.includes('opac:putImageData'));
assert.ok(maxOps.includes('ink:drawImage'));
assert.ok(maxOps.includes('host:drawImage'));
assert.ok(maxOps.includes('host:alpha:1'));
assert.ok(!maxOps.some(x=>x.startsWith('ink:alpha:') && x!=='ink:alpha:1'));

console.log('Drawing schema passed: legacy/roundtrip, pressure channel, pressure opacity/width flags, opacity floor, stabilizer lazy-mouse, max-opacity pressure paint, solid-ink pressure paint, invalid strokes/coordinates/layers and size limits.');

