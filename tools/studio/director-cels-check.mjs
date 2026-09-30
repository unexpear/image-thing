import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCel,celStrokes,sampleCels,editableStrokes,clearableEditableStrokeCount,retimeCels,inbetweenCel,clampOnionDepth,onionNeighborCels,onionGuideAlpha,ONION_DEPTH_MAX,drawingWantsOnion,drawingOnionDepth,validateDrawingOnion,applyDrawingOnionPrefs,drawingWantsCorrectionOverlay,validateDrawingCorrectionOverlay,applyDrawingCorrectionOverlay} from '../../simple-editor/director-cels.js';
import {validateDrawing, drawingLayerRemoveGate, drawingLayerAddGate, drawingDetachFromJointGate, drawingParentToJointGate, MAX_LAYERS} from '../../simple-editor/director-drawing.js';
import {sampleMotion} from '../../simple-editor/director-motion.js';
const stroke=x=>({tool:'line',color:'#112233',size:3,points:[[x,10],[x+10,20]]});
const layer={id:'a',name:'Character',visible:true,locked:false,opacity:1,strokes:[stroke(0)]},board={version:1,layers:[layer]};
createCel(layer,0);createCel(layer,10);layer.cels[1].strokes=[stroke(100)];layer.cels[0].corrections=[stroke(50)];validateDrawing(board);
assert.deepEqual(celStrokes(layer,9),[stroke(0)]);assert.deepEqual(celStrokes(layer,10),[stroke(100)]);
assert.throws(()=>editableStrokes(layer,3),/Create a cel/);
const mid=inbetweenCel(layer,0);assert.equal(mid.frame,5);assert.deepEqual(mid.strokes,[stroke(50)]);assert.deepEqual(mid.corrections,[]);layer.cels.push(mid);validateDrawing(board);
const original=JSON.stringify(board);assert.deepEqual(sampleMotion(board,5).layers[0].strokes,[stroke(50)]);assert.equal(JSON.stringify(board),original);
createCel(layer,12,true);assert.deepEqual(sampleMotion(board,100).layers[0].strokes,[]);
const shift=retimeCels(layer,5,10,1,1,100);assert.deepEqual(shift.map(c=>c.frame),[0,6,11,12]);assert.throws(()=>retimeCels(layer,5,10,2,1,100),/Invalid drawing cel/);assert.throws(()=>retimeCels(layer,0,12,-1,1,100),/outside/);
const bad=structuredClone(board);bad.layers[0].cels[0].corrections[0].points[0][0]=-1;assert.throws(()=>validateDrawing(bad),/coordinates/);
layer.locked=true;assert.throws(()=>createCel(layer,20),/Unlock/);assert.throws(()=>editableStrokes(layer,0),/Unlock/);layer.locked=false;
assert.equal(sampleCels(board,5).layers[0].strokes.length,1);assert.equal(layer.cels[0].corrections.length,1);
const unlike=structuredClone(layer);unlike.cels.find(c=>c.frame===5).strokes[0].size=5;assert.throws(()=>inbetweenCel(unlike,0),/matching/);

assert.equal(clampOnionDepth(1),1);assert.equal(clampOnionDepth(ONION_DEPTH_MAX),ONION_DEPTH_MAX);assert.equal(clampOnionDepth(0),1);assert.equal(clampOnionDepth(99),ONION_DEPTH_MAX);assert.equal(clampOnionDepth(undefined),1);assert.equal(clampOnionDepth('3'),3);
const onionLayer={id:'o',name:'Onion',visible:true,locked:false,opacity:1,strokes:[stroke(0)],cels:[
 {frame:0,kind:'key',strokes:[stroke(0)],corrections:[]},
 {frame:10,kind:'key',strokes:[stroke(10)],corrections:[]},
 {frame:20,kind:'key',strokes:[stroke(20)],corrections:[]},
 {frame:30,kind:'key',strokes:[stroke(30)],corrections:[]},
 {frame:40,kind:'key',strokes:[stroke(40)],corrections:[]},
]};
let neigh=onionNeighborCels(onionLayer.cels,20,1);
assert.deepEqual(neigh.previous.map(c=>c.frame),[10]);
assert.deepEqual(neigh.next.map(c=>c.frame),[30]);
neigh=onionNeighborCels(onionLayer.cels,20,3);
assert.deepEqual(neigh.previous.map(c=>c.frame),[10,0]);
assert.deepEqual(neigh.next.map(c=>c.frame),[30,40]);
// Held frame inside cel at 10 (playhead 15): exclude covering cel from previous; next after playhead
neigh=onionNeighborCels(onionLayer.cels,15,2);
assert.deepEqual(neigh.previous.map(c=>c.frame),[0]);
assert.deepEqual(neigh.next.map(c=>c.frame),[20,30]);
neigh=onionNeighborCels(onionLayer.cels,0,2);
assert.deepEqual(neigh.previous.map(c=>c.frame),[]);
assert.deepEqual(neigh.next.map(c=>c.frame),[10,20]);
assert.ok(Math.abs(onionGuideAlpha(0,1)-0.25)<1e-9);
assert.ok(onionGuideAlpha(0,3)>onionGuideAlpha(1,3));
assert.ok(onionGuideAlpha(1,3)>onionGuideAlpha(2,3));
assert.equal(onionGuideAlpha(-1,2),onionGuideAlpha(0,2));

assert.equal(drawingWantsOnion({}),false);
assert.equal(drawingWantsOnion({onion:true}),true);
assert.equal(drawingWantsOnion({onion:false}),false);
assert.equal(drawingOnionDepth({}),1);
assert.equal(drawingOnionDepth({onionDepth:3}),3);
assert.equal(drawingOnionDepth({onionDepth:99}),ONION_DEPTH_MAX);
validateDrawingOnion({});
validateDrawingOnion({onion:false});
validateDrawingOnion({onion:true,onionDepth:2});
assert.throws(()=>validateDrawingOnion({onion:'yes'}),/onion/);
assert.throws(()=>validateDrawingOnion({onionDepth:0}),/onion depth/);
assert.throws(()=>validateDrawingOnion({onionDepth:1.5}),/onion depth/);
assert.throws(()=>validateDrawingOnion({onionDepth:ONION_DEPTH_MAX+1}),/onion depth/);
const prefBoard={version:1,onion:true,onionDepth:3};
applyDrawingOnionPrefs(prefBoard,{onion:false,onionDepth:1});
assert.equal(prefBoard.onion,undefined);
assert.equal(prefBoard.onionDepth,undefined);
applyDrawingOnionPrefs(prefBoard,{onion:true,onionDepth:4});
assert.equal(prefBoard.onion,true);
assert.equal(prefBoard.onionDepth,4);

assert.equal(drawingWantsCorrectionOverlay({}),false);
assert.equal(drawingWantsCorrectionOverlay({correctionOverlay:true}),true);
assert.equal(drawingWantsCorrectionOverlay({correctionOverlay:false}),false);
validateDrawingCorrectionOverlay({});
validateDrawingCorrectionOverlay({correctionOverlay:false});
validateDrawingCorrectionOverlay({correctionOverlay:true});
assert.throws(()=>validateDrawingCorrectionOverlay({correctionOverlay:'yes'}),/correction overlay/);
const corrBoard={version:1,correctionOverlay:true};
applyDrawingCorrectionOverlay(corrBoard,false);
assert.equal(corrBoard.correctionOverlay,undefined);
applyDrawingCorrectionOverlay(corrBoard,true);
assert.equal(corrBoard.correctionOverlay,true);

// Clear selected layer clearable count (disabled-empty hygiene)
assert.equal(clearableEditableStrokeCount(null, 0), 0);
assert.equal(clearableEditableStrokeCount({locked:true,strokes:[stroke(0)]}, 0), 0);
assert.equal(clearableEditableStrokeCount({strokes:[stroke(0),stroke(1)]}, 0), 2);
assert.equal(clearableEditableStrokeCount({strokes:[]}, 0), 0);
const clearLayer = {id:'cl',name:'Clear',visible:true,locked:false,opacity:1,strokes:[stroke(0)],cels:[
 {frame:0,kind:'key',strokes:[stroke(0),stroke(1)],corrections:[stroke(9)]},
 {frame:10,kind:'key',strokes:[stroke(10)],corrections:[]},
]};
assert.equal(clearableEditableStrokeCount(clearLayer, 0, false), 2);
assert.equal(clearableEditableStrokeCount(clearLayer, 0, true), 1);
assert.equal(clearableEditableStrokeCount(clearLayer, 10, false), 1);
assert.equal(clearableEditableStrokeCount(clearLayer, 10, true), 0);
assert.equal(clearableEditableStrokeCount(clearLayer, 5, false), 0); // held frame, no cel start
clearLayer.locked = true;
assert.equal(clearableEditableStrokeCount(clearLayer, 0, false), 0);
clearLayer.locked = false;

// UI wiring: Clear selected layer disabled when nothing clearable
const drawingSrc = fs.readFileSync(new URL('../../simple-editor/director-drawing.js', import.meta.url), 'utf8');
assert.ok(drawingSrc.includes('clearableEditableStrokeCount'), 'Clear selected layer clearable helper missing from drawing UI');
assert.ok(drawingSrc.includes('clearLayerButton.disabled=!clearable') || drawingSrc.includes('clearLayerButton.disabled = !clearable') || drawingSrc.includes('syncClearLayerButton'), 'Clear selected layer disabled sync missing');
assert.ok(drawingSrc.includes('onCelViewChange:syncClearLayerButton'), 'Clear selected layer cel-view sync missing');
assert.ok(drawingSrc.includes("clearable=clearableEditableStrokeCount(layer,f,corr)"), 'Clear selected layer handler clearable guard missing');

// UI wiring: Clear this cel's corrections disabled when nothing clearable
const celsSrc = fs.readFileSync(new URL('../../simple-editor/director-cels.js', import.meta.url), 'utf8');
assert.ok(celsSrc.includes('syncClearCorrectionsButton'), 'Clear this cel corrections sync missing');
assert.ok(celsSrc.includes('clearCorrectionsButton.disabled=!clearable') || celsSrc.includes('clearCorrectionsButton.disabled = !clearable'), 'Clear this cel corrections disabled sync missing');
assert.ok(celsSrc.includes('syncClearCorrectionsButton();onCelViewChange') || celsSrc.includes('syncClearCorrectionsButton(); onCelViewChange'), 'Clear this cel corrections refresh sync missing');
assert.ok(celsSrc.includes('clearable=clearableEditableStrokeCount(layer,f,true)'), 'Clear this cel corrections clearable guard missing');
assert.ok(celsSrc.includes("No corrections to clear on this cel"), 'Clear this cel corrections empty title missing');


// Remove selected layer gate (disabled when not removable)
assert.equal(drawingLayerRemoveGate(null, {id:'a'}).ok, false);
assert.equal(drawingLayerRemoveGate({layers:[]}, {id:'a'}).ok, false);
const solo = {layers:[{id:'only',name:'Sketch',locked:false}]};
assert.equal(drawingLayerRemoveGate(solo, solo.layers[0]).ok, false);
assert.match(drawingLayerRemoveGate(solo, solo.layers[0]).reason, /Keep at least one layer/);
const two = {layers:[{id:'a',name:'A',locked:false},{id:'b',name:'B',locked:false}]};
assert.equal(drawingLayerRemoveGate(two, two.layers[0]).ok, true);
assert.match(drawingLayerRemoveGate(two, two.layers[0]).reason, /Undo restores/);
two.layers[0].locked = true;
assert.equal(drawingLayerRemoveGate(two, two.layers[0]).ok, false);
assert.match(drawingLayerRemoveGate(two, two.layers[0]).reason, /Unlock/);
two.layers[0].locked = false;
two.layers[1].rig = {parent:'a'};
assert.equal(drawingLayerRemoveGate(two, two.layers[0]).ok, false);
assert.match(drawingLayerRemoveGate(two, two.layers[0]).reason, /child layers/);
two.layers[1].rig = {parent:'b'};
assert.equal(drawingLayerRemoveGate(two, two.layers[0]).ok, true);
assert.equal(drawingLayerRemoveGate(two, {id:'missing'}).ok, false);

// UI wiring: Remove selected layer disabled when not removable
assert.ok(drawingSrc.includes('drawingLayerRemoveGate'), 'Remove selected layer gate helper missing from drawing UI');
assert.ok(drawingSrc.includes('syncRemoveLayerButton'), 'Remove selected layer sync missing');
assert.ok(drawingSrc.includes('removeLayerButton.disabled=!gate.ok') || drawingSrc.includes('removeLayerButton.disabled = !gate.ok'), 'Remove selected layer disabled sync missing');
assert.ok(drawingSrc.includes('syncClearLayerButton();syncRemoveLayerButton()') || drawingSrc.includes('syncRemoveLayerButton();rigUI'), 'Remove selected layer refresh sync missing');
assert.ok(drawingSrc.includes("gate=drawingLayerRemoveGate(board(),selected())"), 'Remove selected layer handler gate guard missing');

// Add / Duplicate layer gate (disabled at MAX_LAYERS)
assert.equal(drawingLayerAddGate(null).ok, false);
assert.equal(drawingLayerAddGate({layers:[]}).ok, true);
assert.match(drawingLayerAddGate({layers:[{id:'a'}]}).reason, /Add or duplicate/);
const full={layers:Array.from({length:MAX_LAYERS},(_,i)=>({id:'L'+i}))};
assert.equal(drawingLayerAddGate(full).ok, false);
assert.match(drawingLayerAddGate(full).reason, /already has/);
assert.equal(drawingLayerAddGate({layers:Array.from({length:MAX_LAYERS-1},(_,i)=>({id:'L'+i}))}).ok, true);

// UI wiring: Add / Duplicate layer disabled at MAX_LAYERS
assert.ok(drawingSrc.includes('drawingLayerAddGate'), 'Add/Duplicate layer gate helper missing from drawing UI');
assert.ok(drawingSrc.includes('syncAddLayerButtons'), 'Add/Duplicate layer sync missing');
assert.ok(drawingSrc.includes('addLayerButton.disabled=!gate.ok') || drawingSrc.includes('addLayerButton.disabled = !gate.ok'), 'Add layer disabled sync missing');
assert.ok(drawingSrc.includes('duplicateLayerButton.disabled=!gate.ok') || drawingSrc.includes('duplicateLayerButton.disabled = !gate.ok'), 'Duplicate layer disabled sync missing');
assert.ok(drawingSrc.includes('syncRemoveLayerButton();syncAddLayerButtons()') || drawingSrc.includes('syncAddLayerButtons();rigUI'), 'Add/Duplicate layer refresh sync missing');
assert.ok(drawingSrc.includes("gate=drawingLayerAddGate(board())"), 'Add/Duplicate layer handler gate guard missing');

// Detach drawing-from-joint gate (disabled when nothing parented)
assert.equal(drawingDetachFromJointGate(null).ok, false);
assert.match(drawingDetachFromJointGate(null).reason, /Choose a drawing layer/);
assert.equal(drawingDetachFromJointGate({}).ok, false);
assert.match(drawingDetachFromJointGate({}).reason, /already in screen space/);
assert.equal(drawingDetachFromJointGate({joint:''}).ok, false);
assert.equal(drawingDetachFromJointGate({joint:'   '}).ok, false);
assert.equal(drawingDetachFromJointGate({joint:'Left hand',name:'FX'}).ok, true);
assert.match(drawingDetachFromJointGate({joint:'Left hand'}).reason, /Detach from Left hand/);

// Boards Moves-with-joint None guard + title sync
assert.ok(drawingSrc.includes('drawingDetachFromJointGate'), 'Detach-from-joint gate helper missing from drawing UI');
assert.ok(drawingSrc.includes('drawingDetachFromJointGate(selected())'), 'Boards Moves-with-joint None detach guard missing');
assert.ok(drawingSrc.includes('detachGate=drawingDetachFromJointGate(active)'), 'Boards joint select title sync missing');

// 3D Detach drawing from joint disabled + sync
const d3Src=fs.readFileSync(new URL('../../simple-editor/director-3d.js', import.meta.url), 'utf8');
assert.ok(d3Src.includes('drawingDetachFromJointGate'), '3D detach gate import missing');
assert.ok(d3Src.includes('syncDetachFollowButton'), '3D Detach sync missing');
assert.ok(d3Src.includes('detachFollowButton.disabled=!gate.ok') || d3Src.includes('detachFollowButton.disabled = !gate.ok'), '3D Detach disabled sync missing');
assert.ok(d3Src.includes("gate=drawingDetachFromJointGate(layer)"), '3D Detach handler gate guard missing');
assert.ok(d3Src.includes('Detach drawing from joint'), '3D Detach button label missing');

// Parent drawing-to-joint gate (disabled when no layer or joint chosen)
assert.equal(drawingParentToJointGate(null,'Left hand').ok, false);
assert.match(drawingParentToJointGate(null,'Left hand').reason, /Choose a drawing layer/);
assert.equal(drawingParentToJointGate({name:'FX'},'').ok, false);
assert.match(drawingParentToJointGate({name:'FX'},'').reason, /Choose a joint/);
assert.equal(drawingParentToJointGate({name:'FX'},'   ').ok, false);
assert.equal(drawingParentToJointGate({name:'FX'},'Left hand').ok, true);
assert.match(drawingParentToJointGate({name:'FX'},'Left hand').reason, /Parent FX to Left hand/);

// Boards Moves-with-joint attach guard
assert.ok(drawingSrc.includes('drawingParentToJointGate'), 'Parent-to-joint gate helper missing from drawing UI');
assert.ok(drawingSrc.includes('drawingParentToJointGate(selected(),name)'), 'Boards Moves-with-joint attach guard missing');

// 3D Parent layer to selected joint disabled + sync
assert.ok(d3Src.includes('drawingParentToJointGate'), '3D parent gate import missing');
assert.ok(d3Src.includes('parentFollowButton'), '3D Parent button ref missing');
assert.ok(d3Src.includes('parentFollowButton.disabled=!gate.ok') || d3Src.includes('parentFollowButton.disabled = !gate.ok'), '3D Parent disabled sync missing');
assert.ok(d3Src.includes('drawingParentToJointGate(layer,point?name') || d3Src.includes('drawingParentToJointGate(layer, point?name'), '3D Parent sync gate missing');
assert.ok(d3Src.includes('drawingParentToJointGate(layer,name&&point') || d3Src.includes('drawingParentToJointGate(layer, name&&point'), '3D Parent handler gate guard missing');
assert.ok(d3Src.includes('Parent layer to selected joint'), '3D Parent button label missing');

console.log('Cel checks passed: held/blank drawings, editable starts, matching-stroke inbetweens, correction validation, retiming collisions/bounds, locks, nonmutation, motion sampler integration, multi-level onion neighbors/alphas, durable drawing onion prefs, durable correction overlay, clearableEditableStrokeCount + Clear selected layer disabled + Clear this cel corrections disabled + drawingLayerRemoveGate + Remove selected layer disabled + drawingLayerAddGate + Add/Duplicate layer disabled at MAX_LAYERS + drawingDetachFromJointGate + Detach drawing-from-joint disabled when nothing parented + drawingParentToJointGate + Parent drawing-to-joint disabled when no layer or joint chosen.');
