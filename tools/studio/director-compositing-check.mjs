import assert from 'node:assert/strict';
import {LAYER_BLENDS,validateDrawing,paintDrawing} from '../../simple-editor/director-drawing.js';
import {sampleMotion} from '../../simple-editor/director-motion.js';
const layer={id:'base',name:'Base',visible:true,locked:false,opacity:1,strokes:[]};
const legacy={version:1,layers:[layer]};validateDrawing(legacy);
for(const blend of Object.keys(LAYER_BLENDS)){
 const board={version:1,layers:[layer,{...layer,id:'finish',blend,opacity:.4}]};
 validateDrawing(board);const copy=JSON.parse(JSON.stringify(board));assert.equal(sampleMotion(copy,20).layers[1].blend,blend);
 const calls=[],stack=[];
 const ctx={globalAlpha:1,globalCompositeOperation:'source-over',fillRect(){},transform(){},save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);},restore(){[this.globalAlpha,this.globalCompositeOperation]=stack.pop();},drawImage(){calls.push([this.globalCompositeOperation,this.globalAlpha]);}};
 paintDrawing({getContext:()=>ctx},board,null,{getContext:()=>({clearRect(){}})});
 assert.deepEqual(calls,[['source-over',1],[blend,.4]]);assert.equal(ctx.globalCompositeOperation,'source-over');assert.equal(ctx.globalAlpha,1);
}
for(const blend of ['destination-out','copy','toString',null,7])assert.throws(()=>validateDrawing({version:1,layers:[{...layer,blend}]}),/blend mode/);
const ink={version:1,layers:[layer,{...layer,id:'ink',ink:true}]};validateDrawing(ink);assert.throws(()=>validateDrawing({version:1,layers:[{...layer,ink:'yes'}]}),/ink/);
const shown=[],hidden=[];
paintDrawing({getContext:()=>({globalAlpha:1,globalCompositeOperation:'source-over',fillRect(){},transform(){},save(){},restore(){},drawImage(){shown.push(1);}})},ink,null,{getContext:()=>({clearRect(){}})});
paintDrawing({getContext:()=>({globalAlpha:1,globalCompositeOperation:'source-over',fillRect(){},transform(){},save(){},restore(){},drawImage(){hidden.push(1);}})},ink,null,{getContext:()=>({clearRect(){}})},false,null,{skipInk:true});
assert.deepEqual(shown,[1,1]);assert.deepEqual(hidden,[1]);
console.log('Compositing checks passed: legacy default, allowed modes, project serialization and sampled state, per-layer blend/opacity routing and canvas state restoration. Pixel results require browser verification.');
