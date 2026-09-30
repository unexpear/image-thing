import assert from 'node:assert/strict';
import {sampleMotion,validateMotion,hasDrawingAnimation} from '../../simple-editor/director-motion.js';
import {retimeKeys} from '../../simple-editor/director-animation-craft.js';
const board={layers:[{id:'light',name:'Creation light',opacity:.7,blend:'screen',strokes:[]},{id:'body',name:'Body',opacity:1,strokes:[]}],channels:[{id:'layer:light:opacity',keys:[{frame:0,value:0,easing:'linear'},{frame:12,value:1,easing:'linear'},{frame:24,value:0,easing:'linear'}]}]};
validateMotion(board);assert.ok(hasDrawingAnimation(board));
const original=structuredClone(board);
for(const [frame,expected] of [[0,0],[6,.5],[12,1],[18,.5],[24,0],[48,0],[6.5,6.5/12]]){
 const sampled=sampleMotion(board,frame);assert.equal(sampled.layers[0].opacity,expected);assert.equal(sampled.layers[0].blend,'screen');assert.equal(sampled.layers[1].opacity,1);assert.equal(sampled.layers[0].rig.x,0);
}
assert.deepEqual(board,original);
board.channels[0].enabled=false;assert.equal(sampleMotion(board,12).layers[0].opacity,.7);board.channels[0].enabled=true;
board.channels[0].keys=retimeKeys(board.channels[0].keys,{start:0,end:24,offset:24,lastFrame:119});assert.equal(sampleMotion(board,36).layers[0].opacity,1);assert.equal(sampleMotion(board,12).layers[0].opacity,0);
board.channels[0].keys[0].easing='hold';assert.equal(sampleMotion(board,35).layers[0].opacity,0);
for(const invalid of [-.01,1.01,NaN,Infinity]){const bad=structuredClone(board);bad.channels[0].keys[0].value=invalid;assert.throws(()=>validateMotion(bad),/value/);}
delete board.channels;assert.equal(sampleMotion(board,12).layers[0].opacity,.7);
console.log('Opacity channels passed: isolated light fade, fractional sampling, reverse access, endpoint holds, retiming, stepped timing, disabled fallback, immutable source and invalid values.');
