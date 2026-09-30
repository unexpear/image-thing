import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
 nudgeStageProp,
 stagePropNudgeGate,
 PROP_NUDGE_STEP_PRESETS,
 PROP_NUDGE_STEP_IDS,
 DEFAULT_PROP_NUDGE_STEP,
 PROP_NUDGE_STEP_STORAGE_KEY,
 normalizePropNudgeStep,
 propNudgeStepPreset,
 readPropNudgeStep,
 writePropNudgeStep,
 propNudgeAxisDelta,
 propNudgeKeyBinding,
 propNudgeKeyboardDelta,
 isPropNudgeTypingTarget,
 PROP_NUDGE_KEYBOARD_HINT
} from '../../simple-editor/director-prop-placement.js';
import {validatePerformance} from '../../simple-editor/director-performance-state.js';
import {validateRig3D} from '../../simple-editor/director-3d-state.js';

const base = {
 version:1,
 model:null,
 names:['Root','Hand'],
 pose:[[0,0,0],[0,0,0]],
 keys:[],
 props:[
  {id:'table',name:'Table',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,10,0],size:[1,1,1],attachments:[{frame:12,joint:1,position:[0,.1,0],rotation:[0,0,0],size:[1,1,1]}]},
  {id:'cup',name:'Cup',shape:'box',color:'#ffaa00',joint:1,position:[.2,0,0],rotation:[0,0,0],size:[.1,.1,.1]}
 ]
};
const before = JSON.stringify(base);

const moved = nudgeStageProp(base, 'table', {offset:[.5,-.25,.75], yaw:35, scale:1.5});
assert.equal(JSON.stringify(base), before);
assert.deepEqual(moved.props.find(p=>p.id==='table').position, [.5,-.25,.75]);
assert.deepEqual(moved.props.find(p=>p.id==='table').rotation, [0,45,0]);
assert.deepEqual(moved.props.find(p=>p.id==='table').size, [1.5,1.5,1.5]);
assert.deepEqual(moved.props.find(p=>p.id==='table').attachments, base.props[0].attachments);
assert.deepEqual(moved.props.find(p=>p.id==='cup'), base.props[1]);
validatePerformance(moved);
validateRig3D(moved);

const held = nudgeStageProp(base, 'cup', {offset:[0,.05,0], yaw:-15, scale:2});
assert.deepEqual(held.props.find(p=>p.id==='cup').position, [.2,.05,0]);
assert.deepEqual(held.props.find(p=>p.id==='cup').rotation, [0,-15,0]);
assert.deepEqual(held.props.find(p=>p.id==='cup').size, [.2,.2,.2]);
assert.equal(JSON.stringify(base), before);

assert.throws(()=>nudgeStageProp(base, '', {offset:[1,0,0]}), /Select a saved stage prop/);
assert.throws(()=>nudgeStageProp(base, 'missing', {offset:[1,0,0]}), /Select a saved stage prop/);
assert.throws(()=>nudgeStageProp(base, 'table', {offset:[1,0]}), /XYZ/);
assert.throws(()=>nudgeStageProp(base, 'table', {offset:[0,0,20000]}), /XYZ|out of range/);
assert.throws(()=>nudgeStageProp(base, 'table', {yaw:400}), /turn/);
assert.throws(()=>nudgeStageProp(base, 'table', {yaw:400}), /360/);
assert.throws(()=>nudgeStageProp(base, 'table', {scale:0}), /scale/);
assert.throws(()=>nudgeStageProp(base, 'table', {scale:-1}), /scale/);
assert.throws(()=>nudgeStageProp(base, 'table', {yaw:355}), /out of range|turn/);

const identity = nudgeStageProp(base, 'table', {});
assert.deepEqual(identity.props.find(p=>p.id==='table').position, [0,0,0]);
assert.deepEqual(identity.props.find(p=>p.id==='table').rotation, [0,10,0]);
assert.deepEqual(identity.props.find(p=>p.id==='table').size, [1,1,1]);

assert.deepEqual(PROP_NUDGE_STEP_IDS, ['fine','medium','coarse']);
assert.equal(DEFAULT_PROP_NUDGE_STEP, 'medium');
assert.equal(PROP_NUDGE_STEP_STORAGE_KEY, 'studio.propNudgeStep');
assert.equal(PROP_NUDGE_STEP_PRESETS.length, 3);
assert.equal(normalizePropNudgeStep('FINE'), 'fine');
assert.equal(normalizePropNudgeStep('nope'), 'medium');
assert.equal(normalizePropNudgeStep(null), 'medium');
assert.equal(propNudgeStepPreset('fine').xyz, 0.01);
assert.equal(propNudgeStepPreset('fine').yaw, 1);
assert.equal(propNudgeStepPreset('medium').xyz, 0.1);
assert.equal(propNudgeStepPreset('medium').yaw, 5);
assert.equal(propNudgeStepPreset('coarse').xyz, 0.5);
assert.equal(propNudgeStepPreset('coarse').yaw, 15);

const mem = new Map();
const fakeStorage = {
 getItem(k){ return mem.has(k) ? mem.get(k) : null; },
 setItem(k,v){ mem.set(k, String(v)); }
};
assert.equal(readPropNudgeStep(fakeStorage), 'medium');
assert.equal(writePropNudgeStep('coarse', fakeStorage), 'coarse');
assert.equal(readPropNudgeStep(fakeStorage), 'coarse');
assert.equal(writePropNudgeStep('bogus', fakeStorage), 'medium');
assert.equal(readPropNudgeStep(fakeStorage), 'medium');
assert.equal(readPropNudgeStep(null), 'medium');
assert.equal(writePropNudgeStep('fine', null), 'fine');

assert.deepEqual(propNudgeAxisDelta('x', 1, 'fine'), {offset:[0.01,0,0],yaw:0,scale:1});
assert.deepEqual(propNudgeAxisDelta('y', -1, 'medium'), {offset:[0,-0.1,0],yaw:0,scale:1});
assert.deepEqual(propNudgeAxisDelta('z', '+', 'coarse'), {offset:[0,0,0.5],yaw:0,scale:1});
assert.deepEqual(propNudgeAxisDelta('yaw', -1, 'fine'), {offset:[0,0,0],yaw:-1,scale:1});
assert.deepEqual(propNudgeAxisDelta('yaw', 1, 'coarse'), {offset:[0,0,0],yaw:15,scale:1});
assert.throws(()=>propNudgeAxisDelta('w', 1, 'fine'), /axis/);

const axisNudged = nudgeStageProp(base, 'table', propNudgeAxisDelta('x', 1, 'medium'));
assert.deepEqual(axisNudged.props.find(p=>p.id==='table').position, [0.1,0,0]);
assert.deepEqual(axisNudged.props.find(p=>p.id==='table').attachments, base.props[0].attachments);
assert.equal(JSON.stringify(base), before);

assert.deepEqual(propNudgeKeyBinding('ArrowLeft'), {axis:'x',sign:-1});
assert.deepEqual(propNudgeKeyBinding('ArrowRight'), {axis:'x',sign:1});
assert.deepEqual(propNudgeKeyBinding('ArrowUp'), {axis:'z',sign:1});
assert.deepEqual(propNudgeKeyBinding('ArrowDown'), {axis:'z',sign:-1});
assert.deepEqual(propNudgeKeyBinding('ArrowUp',{shiftKey:true}), {axis:'y',sign:1});
assert.deepEqual(propNudgeKeyBinding('ArrowDown',{shiftKey:true}), {axis:'y',sign:-1});
assert.deepEqual(propNudgeKeyBinding('q'), {axis:'yaw',sign:-1});
assert.deepEqual(propNudgeKeyBinding('E'), {axis:'yaw',sign:1});
assert.equal(propNudgeKeyBinding(' '), null);
assert.equal(propNudgeKeyBinding('Escape'), null);
assert.deepEqual(propNudgeKeyboardDelta('ArrowRight','fine'), {offset:[0.01,0,0],yaw:0,scale:1});
assert.deepEqual(propNudgeKeyboardDelta('ArrowUp','medium',{shiftKey:true}), {offset:[0,0.1,0],yaw:0,scale:1});
assert.deepEqual(propNudgeKeyboardDelta('e','coarse'), {offset:[0,0,0],yaw:15,scale:1});
assert.equal(propNudgeKeyboardDelta('Tab','fine'), null);
assert.ok(typeof PROP_NUDGE_KEYBOARD_HINT === 'string' && PROP_NUDGE_KEYBOARD_HINT.includes('Q/E'));
assert.equal(isPropNudgeTypingTarget(null), false);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'DIV',isContentEditable:false}), false);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'TEXTAREA',isContentEditable:false}), true);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'SELECT',isContentEditable:false}), true);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'INPUT',type:'text',isContentEditable:false}), true);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'INPUT',type:'number',isContentEditable:false}), true);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'INPUT',type:'range',isContentEditable:false}), true);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'INPUT',type:'checkbox',isContentEditable:false}), false);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'BUTTON',isContentEditable:false}), false);
assert.equal(isPropNudgeTypingTarget({nodeType:1,tagName:'DIV',isContentEditable:true}), true);

const keyNudged = nudgeStageProp(base, 'table', propNudgeKeyboardDelta('ArrowLeft','medium'));
assert.deepEqual(keyNudged.props.find(p=>p.id==='table').position, [-0.1,0,0]);
assert.equal(JSON.stringify(base), before);


// Gate: Apply prop placement nudge / +/- axes disabled when no prop selected
assert.equal(stagePropNudgeGate(null, 'table').ok, false);
assert.match(stagePropNudgeGate(null, 'table').reason, /Add a saved stage prop/);
assert.equal(stagePropNudgeGate({props:[]}, '').ok, false);
assert.match(stagePropNudgeGate({props:[]}, '').reason, /Add a saved stage prop/);
assert.equal(stagePropNudgeGate(base, '').ok, false);
assert.match(stagePropNudgeGate(base, '').reason, /Select a saved stage prop/);
assert.equal(stagePropNudgeGate(base, 'missing').ok, false);
assert.match(stagePropNudgeGate(base, 'missing').reason, /Select a saved stage prop/);
assert.equal(stagePropNudgeGate(base, 'table').ok, true);
assert.match(stagePropNudgeGate(base, 'table').reason, /Nudge Table/);
assert.equal(stagePropNudgeGate(base, 'cup').ok, true);
assert.match(stagePropNudgeGate(base, 'cup').reason, /Nudge Cup/);

// UI wiring: Apply prop placement nudge / axis buttons disable when nothing selected
const d3Src = fs.readFileSync(new URL('../../simple-editor/director-3d.js', import.meta.url), 'utf8');
assert.ok(d3Src.includes('stagePropNudgeGate'), '3D prop nudge gate import missing');
assert.ok(d3Src.includes('syncPropNudgeChrome'), 'Prop nudge chrome sync missing');
assert.ok(d3Src.includes('propNudgeApplyButton.disabled=!gate.ok') || d3Src.includes('propNudgeApplyButton.disabled = !gate.ok'), 'Apply prop placement disabled sync missing');
assert.ok(d3Src.includes('propNudgeAxisButtons'), 'Prop nudge axis button list missing');
assert.ok(d3Src.includes('stagePropNudgeGate(rig(),id)'), 'Prop nudge handler gate guard missing');
assert.ok(d3Src.includes('syncPropNudgeChrome();'), 'refreshPropPlacement sync call missing');
assert.ok(d3Src.includes("propPlaceSelect.onchange=()=>syncPropNudgeChrome()") || d3Src.includes('propPlaceSelect.onchange = () => syncPropNudgeChrome()'), 'Prop select onchange sync missing');
assert.ok(d3Src.includes('Apply prop placement nudge'), 'Apply prop placement button label missing');

console.log('Prop placement nudges passed: XYZ/yaw/scale, Fine/Medium/Coarse step presets, durable step pref, axis deltas, keyboard bindings (arrows/Q/E + typing gate), stagePropNudgeGate (empty/missing/selected) + Apply/axis disable UI wiring, attachment preservation, held+mesh props, validation rejections, source immutability.');
