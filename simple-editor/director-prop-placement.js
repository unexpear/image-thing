import {validatePerformance} from './director-performance-state.js';

/**
 * Durable XYZ / yaw / optional uniform scale nudge for a saved stage prop.
 * Edits prop.position, rotation Y, and size only — no GLB re-import.
 * Attachment events and appearance timing stay intact.
 * Offsets are in the prop's current parent axes (Stage root or attached joint).
 */

/** Artist-facing Fine / Medium / Coarse step sizes for one-click axis nudges. */
export const PROP_NUDGE_STEP_PRESETS = Object.freeze([
 Object.freeze({id:'fine',label:'Fine',xyz:0.01,yaw:1}),
 Object.freeze({id:'medium',label:'Medium',xyz:0.1,yaw:5}),
 Object.freeze({id:'coarse',label:'Coarse',xyz:0.5,yaw:15})
]);

export const PROP_NUDGE_STEP_IDS = Object.freeze(PROP_NUDGE_STEP_PRESETS.map(p=>p.id));
export const DEFAULT_PROP_NUDGE_STEP = 'medium';
export const PROP_NUDGE_STEP_STORAGE_KEY = 'studio.propNudgeStep';

/** Normalize a step id to fine|medium|coarse (default medium). */
export function normalizePropNudgeStep(id){
 const key=String(id||'').trim().toLowerCase();
 return PROP_NUDGE_STEP_IDS.includes(key)?key:DEFAULT_PROP_NUDGE_STEP;
}

/** Look up preset by id (always returns a frozen preset). */
export function propNudgeStepPreset(id){
 const key=normalizePropNudgeStep(id);
 return PROP_NUDGE_STEP_PRESETS.find(p=>p.id===key)||PROP_NUDGE_STEP_PRESETS[1];
}

/**
 * Read durable step pref from localStorage when available.
 * Falls back to default when storage is missing or throws (SSR / private mode).
 */
export function readPropNudgeStep(storage){
 try{
  const store=storage??(typeof localStorage!=='undefined'?localStorage:null);
  if(!store||typeof store.getItem!=='function')return DEFAULT_PROP_NUDGE_STEP;
  return normalizePropNudgeStep(store.getItem(PROP_NUDGE_STEP_STORAGE_KEY));
 }catch{
  return DEFAULT_PROP_NUDGE_STEP;
 }
}

/** Persist step pref. No-op when storage is unavailable. Returns normalized id. */
export function writePropNudgeStep(id,storage){
 const key=normalizePropNudgeStep(id);
 try{
  const store=storage??(typeof localStorage!=='undefined'?localStorage:null);
  if(store&&typeof store.setItem==='function')store.setItem(PROP_NUDGE_STEP_STORAGE_KEY,key);
 }catch{ /* private mode / quota — keep in-memory only */ }
 return key;
}

/**
 * Build a one-click nudge payload from an axis button.
 * axis: 'x'|'y'|'z'|'yaw'; sign: +1|-1; stepId: fine|medium|coarse.
 */
export function propNudgeAxisDelta(axis,sign,stepId){
 const s=sign===-1||sign==='-'?-1:1;
 const preset=propNudgeStepPreset(stepId);
 const a=String(axis||'').trim().toLowerCase();
 if(a==='yaw')return {offset:[0,0,0],yaw:s*preset.yaw,scale:1};
 const idx=a==='x'?0:a==='y'?1:a==='z'?2:-1;
 if(idx<0)throw Error('Choose an X, Y, Z, or yaw nudge axis.');
 const offset=[0,0,0];
 offset[idx]=s*preset.xyz;
 return {offset,yaw:0,scale:1};
}

/** Artist-facing keyboard shortcut hint for prop nudge (Body · Stage · prop placement). */
export const PROP_NUDGE_KEYBOARD_HINT = 'Keyboard: \u2190/\u2192 X \u00b7 \u2191/\u2193 Z \u00b7 Shift+\u2191/\u2193 Y \u00b7 Q/E yaw (uses Fine / Medium / Coarse step). Ignored while typing or scrubbing.';

/**
 * Map a keydown to an axis nudge binding, or null when unbound.
 * Arrows: X / Z on the ground plane; Shift+Up/Down lifts on Y; Q/E turns yaw.
 */
export function propNudgeKeyBinding(key,{shiftKey=false}={}){
 const k=String(key||'');
 if(k==='ArrowLeft')return {axis:'x',sign:-1};
 if(k==='ArrowRight')return {axis:'x',sign:1};
 if(k==='ArrowUp')return shiftKey?{axis:'y',sign:1}:{axis:'z',sign:1};
 if(k==='ArrowDown')return shiftKey?{axis:'y',sign:-1}:{axis:'z',sign:-1};
 const letter=k.length===1?k.toLowerCase():'';
 if(letter==='q')return {axis:'yaw',sign:-1};
 if(letter==='e')return {axis:'yaw',sign:1};
 return null;
}

/**
 * Build a nudge payload from a keyboard event key + current step preset.
 * Returns null when the key is not a prop-nudge binding.
 */
export function propNudgeKeyboardDelta(key,stepId,mods={}){
 const binding=propNudgeKeyBinding(key,mods);
 if(!binding)return null;
 return propNudgeAxisDelta(binding.axis,binding.sign,stepId);
}

/**
 * True when focus is in a field that owns arrow / letter keys
 * (text, number, range scrubber, select, contentEditable).
 */
export function isPropNudgeTypingTarget(el){
 if(!el||el.nodeType!==1)return false;
 const tag=el.tagName;
 if(tag==='TEXTAREA'||tag==='SELECT')return true;
 if(el.isContentEditable)return true;
 if(tag==='INPUT'){
  const type=String(el.type||'text').toLowerCase();
  if(['button','submit','reset','checkbox','radio','file','hidden','image','color'].includes(type))return false;
  return true;
 }
 return false;
}
/** Gate for Apply prop placement nudge / +/- axis buttons (needs a selected saved stage prop). */
export function stagePropNudgeGate(rig, propId){
 const props=Array.isArray(rig?.props)?rig.props:[];
 if(!props.length)return{ok:false,reason:'Add a saved stage prop first (import under Stage \u00b7 import a reusable prop, or Continuity).'};
 const id=typeof propId==='string'?propId.trim():'';
 if(!id)return{ok:false,reason:'Select a saved stage prop first.'};
 if(!props.some(p=>p&&p.id===id))return{ok:false,reason:'Select a saved stage prop first.'};
 const prop=props.find(p=>p&&p.id===id);
 const label=(prop&&prop.name)?String(prop.name):'prop';
 return{ok:true,reason:'Nudge '+label+' (XYZ / yaw / scale). Undo restores the previous placement.'};
}
export function nudgeStageProp(rig,propId,{offset=[0,0,0],yaw=0,scale=1}={}){
 if(!rig||typeof propId!=='string'||!propId)throw Error('Select a saved stage prop.');
 if(!Array.isArray(offset)||offset.length!==3||offset.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error('Enter valid XYZ placement offsets.');
 if(!Number.isFinite(yaw)||Math.abs(yaw)>360)throw Error('Enter a turn between \u2212360 and 360 degrees.');
 if(!Number.isFinite(scale)||scale<=0||scale>100)throw Error('Enter a positive uniform scale up to 100.');
 const next=structuredClone(rig);
 const prop=(next.props||[]).find(p=>p.id===propId);
 if(!prop)throw Error('Select a saved stage prop.');
 const position=prop.position.map((v,i)=>v+offset[i]);
 if(position.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error('Resulting prop position is out of range.');
 const rotation=[prop.rotation[0],prop.rotation[1]+yaw,prop.rotation[2]];
 if(rotation.some(v=>!Number.isFinite(v)||Math.abs(v)>360))throw Error('Resulting prop turn is out of range (\u2212360 to 360).');
 const size=prop.size.map(v=>v*scale);
 if(size.some(v=>!Number.isFinite(v)||v<=0||v>100))throw Error('Resulting prop size must stay between 0 and 100.');
 prop.position=position;
 prop.rotation=rotation;
 prop.size=size;
 validatePerformance(next);
 return next;
}
