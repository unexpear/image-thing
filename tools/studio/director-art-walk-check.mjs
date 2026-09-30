import assert from 'node:assert/strict';
import {validateWalk,sampleWalk,footStep} from '../../simple-editor/director-walk.js';
import {validateArtStroke,pointXY,pointPressure,strokeUsesPressure,validateStrokePoint,pressureWidthScale,pressureOpacityScale,clampOpacityFloor,applyPressureOpacityMaskData} from '../../simple-editor/director-art-tools.js';
import {layerMatrix,transformPoint} from '../../simple-editor/director-rig.js';
const part=(id,parent,x,y)=>({id,name:id,locked:false,rig:{parent,pivotX:x,pivotY:y,x:0,y:0,angle:0}});
const board={layers:[part('body',null,300,200),part('lu','body',300,220),part('ll','lu',320,260),part('lf','ll',300,300),part('ru','body',315,220),part('rl','ru',335,260),part('rf','rl',315,300)],walk:{root:'body',left:'lf',right:'rf',stride:20,lift:8,period:48}};
validateWalk(board);const original=JSON.stringify(board);
for(let f=0;f<150;f++){
 const posed=sampleWalk(board,f);assert.equal(posed.walkClamped,false);
 for(const [id,offset] of [['lf',0],['rf',.5]]){
  const foot=posed.layers.find(l=>l.id===id),initial=board.layers.find(l=>l.id===id),p=transformPoint(layerMatrix(posed.layers,foot),[foot.rig.pivotX,foot.rig.pivotY]),step=footStep(f/48+offset,20,8);
  assert.ok(Math.abs(p[0]-initial.rig.pivotX-step.x)<1e-7);assert.ok(Math.abs(p[1]-initial.rig.pivotY-step.y)<1e-7);
 }
}
assert.equal(JSON.stringify(board),original);
const scaled=structuredClone(board);scaled.layers.find(l=>l.id==='lu').rig.stretch=1.1;scaled.layers.find(l=>l.id==='ru').rig.stretch=1.1;
for(let f=0;f<72;f++){
 const posed=sampleWalk(scaled,f);assert.equal(posed.walkClamped,false);
 for(const [id,offset] of [['lf',0],['rf',.5]]){const foot=posed.layers.find(l=>l.id===id),initial=scaled.layers.find(l=>l.id===id),anchor=transformPoint(layerMatrix(scaled.layers,initial),[initial.rig.pivotX,initial.rig.pivotY]),m=layerMatrix(posed.layers,foot),p=transformPoint(m,[foot.rig.pivotX,foot.rig.pivotY]),step=footStep(f/48+offset,20,8);assert.ok(Math.hypot(p[0]-anchor[0]-step.x,p[1]-anchor[1]-step.y)<.5);assert.ok(Math.abs(m[1])<1e-8);}
}
assert.equal(footStep(.1,20,8).x,footStep(.59,20,8).x);
assert.ok(footStep(.8,20,8).y<0);
assert.throws(()=>validateWalk({...board,walk:{...board.walk,right:'lf'}}));
assert.throws(()=>validateWalk({...board,walk:{...board.walk,period:NaN}}));
for(const art of ['ink','taper','detail','shadow','highlight'])validateArtStroke({art,strength:.5});
assert.throws(()=>validateArtStroke({art:'unknown'}));assert.throws(()=>validateArtStroke({art:'ink',strength:0}));
assert.deepEqual(pointXY([3,4,0.25]),[3,4]);
assert.equal(pointPressure([3,4,0.25]),0.25);
assert.equal(strokeUsesPressure({points:[[1,1,0.5]]}),true);
assert.ok(validateStrokePoint([1,2,0],960,540));
assert.equal(validateStrokePoint([1,2,2],960,540),false);
assert.equal(pressureWidthScale({pressureWidth:false},[0,0,0.2]),1);
assert.equal(pressureOpacityScale({pressureOpacity:true},[0,0,0.2]),0.2);
assert.equal(pressureOpacityScale({},[0,0,0.2]),1);
assert.equal(clampOpacityFloor(0.3),0.3);
assert.ok(Math.abs(pressureOpacityScale({pressureOpacity:true,opacityFloor:0.2},[0,0,0.5])-0.6)<1e-9);
assert.throws(()=>validateArtStroke({pressureOpacity:1}));
assert.throws(()=>validateArtStroke({opacityFloor:2}));
const mask={data:new Uint8ClampedArray([100,100,100,255])};applyPressureOpacityMaskData(mask,0.5);assert.equal(mask.data[3],50);assert.equal(mask.data[0],255);
console.log('Art and walk checks passed: stationary stance anchors, lifted swing, exact IK endpoints over 150 frames, immutable source, pressure width/opacity helpers, max-opacity mask helper and invalid settings.');
