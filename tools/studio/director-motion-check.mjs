import assert from 'node:assert/strict';
import {defaultRig,solveLimb,layerMatrix,transformPoint} from '../../simple-editor/director-rig.js';
import {validateMotion,capturePose,sampleMotion} from '../../simple-editor/director-motion.js';
const part=(id,x,y,parent=null)=>({id,rig:{...defaultRig(),pivotX:x,pivotY:y,parent}});
for(const bend of [1,-1])for(const target of [[220,180],[100,100],[400,100],[150,80]]){
 const layers=[part('body',50,50),part('upper',100,100,'body'),part('lower',200,100,'upper'),part('hand',300,100,'lower')];
 const result=solveLimb(layers,'hand',target,bend);for(const p of result.poses)layers.find(l=>l.id===p.id).rig.angle=p.angle;
 const actual=transformPoint(layerMatrix(layers,layers[3]),[300,100]),distance=Math.hypot(target[0]-100,target[1]-100);
 if(distance<=200)assert.ok(Math.hypot(actual[0]-target[0],actual[1]-target[1])<1e-7);else{assert.equal(result.clamped,true);assert.ok(Math.abs(Math.hypot(actual[0]-100,actual[1]-100)-200)<1e-7);}
}
const layers=[part('body',50,50),part('upper',100,100,'body'),part('lower',170,130,'upper'),part('hand',230,100,'lower')];
layers[0].rig.angle=65;layers[0].rig.x=20;layers[1].rig.x=9;layers[2].rig.y=8;layers[3].rig.x=3;
const target=transformPoint(layerMatrix(layers,layers[0]),[180,160]);
for(const p of solveLimb(layers,'hand',target).poses)layers.find(l=>l.id===p.id).rig.angle=p.angle;
const actual=transformPoint(layerMatrix(layers,layers[3]),[230,100]);assert.ok(Math.hypot(actual[0]-target[0],actual[1]-target[1])<1e-7);
layers[1].locked=true;assert.throws(()=>solveLimb(layers,'hand',target),/Unlock/);layers[1].locked=false;
assert.throws(()=>solveLimb(layers,'upper',target),/Select/);
const board={layers:[part('a',0,0)]};board.keyframes=[{frame:0,easing:'linear',poses:capturePose(board)},{frame:24,easing:'smooth',poses:[{id:'a',x:100,y:50,angle:360}]}];validateMotion(board);
assert.equal(sampleMotion(board,12).layers[0].rig.angle,180);assert.equal(sampleMotion(board,-10).layers[0].rig.angle,0);assert.equal(sampleMotion(board,50).layers[0].rig.angle,360);assert.equal(board.layers[0].rig.angle,0);
board.keyframes[0].easing='hold';assert.equal(sampleMotion(board,23).layers[0].rig.angle,0);assert.equal(sampleMotion(board,24).layers[0].rig.angle,360);
board.keyframes[0].easing='smooth';assert.equal(sampleMotion(board,6).layers[0].rig.x,15.625);
const bad=structuredClone(board);bad.keyframes[1].frame=0;assert.throws(()=>validateMotion(bad),/Invalid/);bad.keyframes[1].frame=24;bad.keyframes[1].poses[0].id='missing';assert.throws(()=>validateMotion(bad),/Invalid/);
console.log('Motion checks passed: both IK bend directions, reach clamping, ancestor transforms, translations, locks, pose interpolation/hold/full-turn, schema and non-mutation.');
