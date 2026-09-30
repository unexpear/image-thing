import {validateEyeMap} from './director-facial-acting.js';
import {validateFeatures} from './director-features.js';
import {validateHandPoses} from './director-hands.js';
import {motionInterval,validateTiming} from './director-animation-craft.js';
const vec=(v,n,max)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=max);
const frame=n=>Number.isInteger(n)&&n>=0&&n<86400;
const name=n=>typeof n==='string'&&n.trim()&&n.length<=100;
export function validatePerformance(rig){
 validateEyeMap(rig);validateFeatures(rig);
 validateHandPoses(rig);
 for(const p of rig.props||[])if(p.firstFrame!==undefined&&!frame(p.firstFrame))throw Error('Prop appearance must use a frame from 0 to 86399.');
 const props=rig.props||[],contacts=rig.contacts||[],expressions=rig.expressions||[],keys=rig.faceKeys||[];
 if(!Array.isArray(props)||props.length>24)throw Error('Use at most 24 stage props.');
 const ids=new Set();for(const p of props){if(!p||!name(p.id)||ids.has(p.id)||!name(p.name)||!['box','sphere','cylinder','mesh'].includes(p.shape)||!/^#[0-9a-f]{6}$/i.test(p.color)||!(p.joint===null||Number.isInteger(p.joint)&&p.joint>=0&&p.joint<rig.names.length)||!vec(p.position,3,10000)||!vec(p.rotation,3,360)||!vec(p.size,3,100)||p.size.some(n=>n<=0))throw Error('Invalid saved prop.');ids.add(p.id);}
 for(const p of props){const keys=p.attachments||[],seen=new Set();if(!Array.isArray(keys)||keys.length>64)throw Error('Use at most 64 attachment events per prop.');for(const k of keys){if(!k||!frame(k.frame)||seen.has(k.frame)||!(k.joint===null||Number.isInteger(k.joint)&&k.joint>=0&&k.joint<rig.names.length)||!vec(k.position,3,10000)||!vec(k.rotation,3,360)||!vec(k.size,3,100)||k.size.some(n=>n<=0))throw Error('Invalid prop attachment event.');seen.add(k.frame);}}
 if(rig.eyesLinked!==undefined&&typeof rig.eyesLinked!=='boolean')throw Error('Invalid eye link setting.');
 const tracks=rig.eyeTracks||[];
 if(rig.eyeTracks!==undefined&&!Array.isArray(tracks))throw Error('Invalid eye tracks.');
 if(tracks.length>8)throw Error('Use at most 8 eye tracks.');
 const ranges=[];
 for(const t of tracks){if(!t||!name(t.id)||ids.has(t.id)||!Number.isInteger(t.joint)||t.joint<0||t.joint>=rig.names.length||!['+X','-X','+Y','-Y','+Z','-Z'].includes(t.axis)||!frame(t.start)||!frame(t.end)||t.end<t.start||!vec(t.target,3,10000))throw Error('Invalid eye track.');if(ranges.some(o=>o.joint===t.joint&&o.start<=t.end&&t.start<=o.end))throw Error('Eye tracks on the same bone cannot overlap.');if((rig.channels||[]).some(c=>c.enabled!==false&&c.id.startsWith('joint:'+t.joint+':')))throw Error('Remove this eye’s rotation channels before tracking it.');if(Array.isArray(rig.contacts)&&rig.contacts.some(c=>c.joint===t.joint&&c.start<=t.end&&t.start<=c.end))throw Error('A contact hold uses this eye bone.');ids.add(t.id);ranges.push(t);}
 if(!Array.isArray(contacts)||contacts.length>64)throw Error('Use at most 64 contact holds.');
 for(const c of contacts){if(!c||!name(c.id)||ids.has(c.id)||!Number.isInteger(c.joint)||c.joint<0||c.joint>=rig.names.length||!frame(c.start)||!frame(c.end)||c.end<c.start||!vec(c.target,3,10000)||!vec(c.orientation,4,1)||Math.abs(Math.hypot(...c.orientation)-1)>.001)throw Error('Invalid contact hold.');ids.add(c.id);}
 const face=v=>Array.isArray(v)&&v.length===(rig.face?.length||0)&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=10);
 if(!Array.isArray(expressions)||expressions.length>32||expressions.some(p=>!p||!name(p.name)||!face(p.face))||new Set(expressions.map(p=>p.name)).size!==expressions.length)throw Error('Use up to 32 named expressions matching this face.');
 if(!Array.isArray(keys)||keys.length>240)throw Error('Use at most 240 facial keys.');
 const frames=new Set();for(const k of keys){if(!k||!frame(k.frame)||frames.has(k.frame)||!face(k.face))throw Error('Invalid facial key.');frames.add(k.frame);}validateTiming({},keys);
}
export function sampleFace(rig,frame,fallback){const interval=motionInterval({},rig.faceKeys||[],frame);if(!interval)return fallback;const {a,b,t}=interval;return a.face.map((v,i)=>v+(b.face[i]-v)*t);}
export function addBlink(rig,start,index,lastFrame){
 if(!Number.isInteger(index)||index<0||index>=(rig.face?.length||0))throw Error('Choose a mapped eyelid shape on a model with facial controls.');
 if(!frame(start)||start+6>lastFrame)throw Error('Leave six frames for this blink.');
 const keys=rig.faceKeys||[];if(keys.some(k=>k.frame>=start&&k.frame<=start+6))throw Error('Move the blink to an empty six-frame facial interval.');
 const base=sampleFace(rig,start,rig.face),closed=[...base];closed[index]=1;
 rig.faceKeys=[...keys,{frame:start,easing:'smooth',face:[...base]},{frame:start+2,easing:'smooth',face:closed},{frame:start+6,easing:'smooth',face:[...base]}].sort((a,b)=>a.frame-b.frame);
 validatePerformance(rig);
}
export function characterSetup(rig){const copy=structuredClone(rig);copy.keys=[];for(const p of copy.props||[]){delete p.attachments;delete p.firstFrame;}delete copy.channels;delete copy.faceKeys;delete copy.contacts;delete copy.eyeTracks;delete copy.featureKeys;delete copy.lipSync;delete copy.loop;delete copy.camera;delete copy.cameraKeys;return {format:'studio-character',version:1,rig:copy};}

export function sampleProp(prop,frame){let result=prop;if(frame!==null)for(const key of prop.attachments||[])if(key.frame<=frame&&(result===prop||key.frame>result.frame))result=key;return result;}

/** Mouth-cue spans/marks in frames (24 fps). Inline so performance-state stays free of lipsync/audio imports. */
export function mouthCueFrames(sync,lastFrame,{fps=24}={}){
 const last=Math.max(0,Number.isInteger(lastFrame)?lastFrame:0);
 if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('fps must be a positive number.');
 const spans=[],marks=[];
 for(const cue of sync?.mouthCues||[]){
  if(!cue||!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.end<=cue.start)continue;
  const start=Math.max(0,Math.min(last,Math.round(cue.start*fps)));
  const end=Math.max(start,Math.min(last,Math.max(0,Math.ceil(cue.end*fps)-1)));
  const value=typeof cue.value==='string'&&cue.value?cue.value:'X';
  spans.push({start,end,label:'Mouth '+value});
  marks.push({frame:start,label:value});
 }
 return {spans,marks};
}

/**
 * Build manual performance scrub lanes for Body/Face/Camera stages:
 * camera keys, contact holds, prop attachments, body-travel weight,
 * facial keys, expression (feature) keys, eye tracks, and lip-sync mouth cues.
 */
export function performanceScrubTracks(rig,lastFrame){
 const last=Math.max(0,Number.isInteger(lastFrame)?lastFrame:0),names=rig?.names||[],tracks=[];
 const cameraKeys=[...(rig?.cameraKeys||[])].filter(k=>k&&Number.isInteger(k.frame)).sort((a,b)=>a.frame-b.frame);
 if(cameraKeys.length){
  const marks=cameraKeys.map(k=>{
   const ease=k.easing&&k.easing!=='hold'?String(k.easing):'hold';
   return {frame:Math.min(k.frame,last),label:ease};
  });
  const spans=[];
  for(let i=0;i<cameraKeys.length;i++){
   const start=Math.min(cameraKeys[i].frame,last);
   const end=i+1<cameraKeys.length?Math.max(start,Math.min(cameraKeys[i+1].frame-1,last)):last;
   const ease=cameraKeys[i].easing&&cameraKeys[i].easing!=='hold'?String(cameraKeys[i].easing):'hold';
   spans.push({start,end,label:ease+' @'+cameraKeys[i].frame});
  }
  tracks.push({id:'camera',kind:'camera',name:'Camera',spans,marks});
 }
 for(const c of rig?.contacts||[]){
  if(!c||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.end<c.start)continue;
  tracks.push({id:'contact:'+c.id,kind:'contact',name:'Contact · '+(names[c.joint]||('joint '+c.joint)),spans:[{start:c.start,end:Math.min(c.end,last),label:c.start+'-'+c.end}],marks:[{frame:c.start,label:'start'},{frame:Math.min(c.end,last),label:'end'}]});
 }
 for(const p of rig?.props||[]){
  if(!p)continue;
  const attachments=[...(p.attachments||[])].filter(k=>k&&Number.isInteger(k.frame)).sort((a,b)=>a.frame-b.frame);
  const marks=[],spans=[];
  if(Number.isInteger(p.firstFrame)&&p.firstFrame>0)marks.push({frame:p.firstFrame,label:'appears'});
  for(let i=0;i<attachments.length;i++){
   const key=attachments[i],jointName=key.joint===null?'Stage':(names[key.joint]||('joint '+key.joint));
   const end=i+1<attachments.length?Math.max(key.frame,attachments[i+1].frame-1):last;
   marks.push({frame:key.frame,label:jointName});
   spans.push({start:key.frame,end,label:jointName});
  }
  if(!marks.length&&!spans.length)continue;
  tracks.push({id:'attach:'+p.id,kind:'attachment',name:'Attach · '+p.name,spans,marks});
 }
 const weightFrames=new Map();
 const poseRoots=(rig?.keys||[]).filter(k=>k&&Number.isInteger(k.frame)&&Array.isArray(k.root)&&k.root.length===3);
 const rootAuthored=poseRoots.some(k=>k.root.some(v=>Number.isFinite(v)&&Math.abs(v)>1e-8))||poseRoots.some((k,i)=>i&&k.root.some((v,j)=>Math.abs((v||0)-(poseRoots[0].root[j]||0))>1e-8));
 if(rootAuthored)for(const key of poseRoots)weightFrames.set(key.frame,'pose');
 for(const axis of [0,1,2]){
  const channel=(rig?.channels||[]).find(c=>c&&c.id==='root:'+axis&&c.enabled!==false&&Array.isArray(c.keys)&&c.keys.length);
  if(!channel)continue;
  for(const key of channel.keys)if(key&&Number.isInteger(key.frame))weightFrames.set(key.frame,weightFrames.has(key.frame)?'pose+channel':'channel');
 }
 if(weightFrames.size){
  const marks=[...weightFrames.entries()].sort((a,b)=>a[0]-b[0]).map(([frame,source])=>({frame,label:source}));
  tracks.push({id:'weight:root',kind:'weight',name:'Weight · body travel',spans:[],marks});
 }
 const faceKeys=[...(rig?.faceKeys||[])].filter(k=>k&&Number.isInteger(k.frame)).sort((a,b)=>a.frame-b.frame);
 if(faceKeys.length){
  const marks=faceKeys.map(k=>({frame:Math.min(k.frame,last),label:k.easing||'face'}));
  tracks.push({id:'face',kind:'face',name:'Face keys',spans:[],marks});
 }
 const featureKeys=[...(rig?.featureKeys||[])].filter(k=>k&&Number.isInteger(k.frame)).sort((a,b)=>a.frame-b.frame);
 if(featureKeys.length){
  const marks=featureKeys.map(k=>({frame:Math.min(k.frame,last),label:'expr'}));
  tracks.push({id:'feature',kind:'feature',name:'Expression keys',spans:[],marks});
 }
 for(const t of rig?.eyeTracks||[]){
  if(!t||!Number.isInteger(t.start)||!Number.isInteger(t.end)||t.end<t.start)continue;
  tracks.push({id:'eye:'+t.id,kind:'eye',name:'Eye · '+(names[t.joint]||('joint '+t.joint)),spans:[{start:t.start,end:Math.min(t.end,last),label:t.start+'-'+t.end}],marks:[{frame:t.start,label:'start'},{frame:Math.min(t.end,last),label:'end'}]});
 }
 const mouth=mouthCueFrames(rig?.lipSync,last);
 if(mouth.spans.length){
  tracks.push({id:'mouth',kind:'mouth',name:'Mouth cues',spans:mouth.spans,marks:mouth.marks});
 }
 return {last,tracks};
}

/** Lane groups for the shared performance scrub strip (Camera / Body / Face). */
export const PERFORMANCE_SCRUB_LANE_GROUPS = [
 {id:'camera',label:'Camera',kinds:['camera']},
 {id:'body',label:'Body',kinds:['contact','attachment','weight']},
 {id:'face',label:'Face',kinds:['face']},
 {id:'expression',label:'Expression',kinds:['feature']},
 {id:'eye',label:'Eye',kinds:['eye']},
 {id:'mouth',label:'Mouth',kinds:['mouth']}
];

/** Default: every lane group visible. */
export function defaultPerformanceScrubLanes(){
 return Object.fromEntries(PERFORMANCE_SCRUB_LANE_GROUPS.map(g=>[g.id,true]));
}

/** Coerce raw prefs to a full {group:boolean} map. Missing keys = shown. */
export function normalizePerformanceScrubLanes(raw){
 const base=defaultPerformanceScrubLanes();
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return base;
 for(const g of PERFORMANCE_SCRUB_LANE_GROUPS){
  if(raw[g.id]===false)base[g.id]=false;
  else if(raw[g.id]===true)base[g.id]=true;
 }
 return base;
}

export function performanceScrubLanesAllOn(lanes){
 const n=normalizePerformanceScrubLanes(lanes);
 return PERFORMANCE_SCRUB_LANE_GROUPS.every(g=>n[g.id]);
}

/** Durable shot prefs (omit = all shown). Same Undo path as silhouette / onion. */
export function shotPerformanceScrubLanes(shot){
 return normalizePerformanceScrubLanes(shot?.performanceScrubLanes);
}

/** Persist filter on shot; omit field when all groups are on. */
export function applyPerformanceScrubLanes(shot,next){
 if(!shot||typeof shot!=='object')throw Error('Shot required for performance scrub lanes.');
 const n=normalizePerformanceScrubLanes(next);
 if(performanceScrubLanesAllOn(n))delete shot.performanceScrubLanes;
 else shot.performanceScrubLanes=Object.fromEntries(PERFORMANCE_SCRUB_LANE_GROUPS.map(g=>[g.id,!!n[g.id]]));
 return shot;
}

export function validateShotPerformanceScrubLanes(shot){
 if(!shot||shot.performanceScrubLanes===undefined)return;
 const raw=shot.performanceScrubLanes;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Shot performance scrub lanes must be an object.');
 const allowed=new Set(PERFORMANCE_SCRUB_LANE_GROUPS.map(g=>g.id));
 for(const key of Object.keys(raw)){
  if(!allowed.has(key))throw Error('Unknown performance scrub lane group: '+key);
  if(raw[key]!==true&&raw[key]!==false)throw Error('Performance scrub lane flags must be true or false.');
 }
}

export function performanceScrubKindVisible(lanes,kind){
 const n=normalizePerformanceScrubLanes(lanes);
 const group=PERFORMANCE_SCRUB_LANE_GROUPS.find(g=>g.kinds.includes(kind));
 if(!group)return true;
 return !!n[group.id];
}

/** Filter scrub track list by durable/session lane prefs. */
export function filterPerformanceScrubTracks(tracks,lanes){
 return (tracks||[]).filter(t=>performanceScrubKindVisible(lanes,t?.kind));
}

