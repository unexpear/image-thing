import {validatePerformance,sampleFace} from './director-performance-state.js';
import {validateLipSync,faceWithMouth,validateMouthMap} from './director-lipsync.js';
import {motionInterval,validateTiming,easeAt,EASINGS} from './director-animation-craft.js';
import {validateChannels,rigChannelSpecs,sampleScalar,channelActive} from './director-channels.js';
import {shortestRotation} from './director-rotation.js';
export const MAX_3D_JOINTS=128,MAX_3D_KEYS=120;
export const hasRigAnimation=rig=>!!(rig.keys.length||rig.lipSync||rig.faceKeys?.length||rig.contacts?.length||rig.eyeTracks?.length||rig.featureKeys?.length||rig.channels?.some(channelActive)||rig.props?.some(p=>p.attachments?.length||p.firstFrame>0)||rig.cameraKeys?.length);
const vector=(v,max)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=max);
export function validateRig3D(rig){
 if(rig===undefined)return;
 validateLipSync(rig?.lipSync);
 validateMouthMap(rig);
 if(!rig||rig.version!==1||!Array.isArray(rig.names)||!rig.names.length||rig.names.length>MAX_3D_JOINTS||!rig.names.every(n=>typeof n==='string'&&n.length<=200))throw Error('A 3D rig needs 1–128 named joints.');
 const pose=p=>Array.isArray(p)&&p.length===rig.names.length&&p.every(v=>vector(v,360));
 if(!pose(rig.pose)||!Array.isArray(rig.keys)||rig.keys.length>MAX_3D_KEYS)throw Error('Invalid 3D pose or too many keyframes.');
 if(rig.loop!==undefined&&typeof rig.loop!=='boolean')throw Error('Invalid animation loop setting.');
 if(rig.rotationMode!==undefined&&!['euler','shortest'].includes(rig.rotationMode))throw Error('Invalid pose rotation mode.');
 if(rig.root!==undefined&&!vector(rig.root,10000))throw Error('Root movement must be a valid 3D position.');
 const face=v=>Array.isArray(v)&&v.length<=256&&v.every(n=>Number.isFinite(n)&&n>=-10&&n<=10);
 if(rig.face!==undefined&&!face(rig.face))throw Error('Face controls must be between -10 and 10.');
 if(rig.savedPoses!==undefined&&(!Array.isArray(rig.savedPoses)||rig.savedPoses.length>32||rig.savedPoses.some(p=>!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!pose(p.pose)||!vector(p.root,10000)||!face(p.face)||p.face.length!==(rig.face?.length||0))))throw Error('A rig can keep 32 named poses with matching joints and face controls.');
 if(rig.limits!==undefined&&(!Array.isArray(rig.limits)||rig.limits.length!==rig.names.length||rig.limits.some(l=>l!==null&&(!Array.isArray(l)||l.length!==2||!vector(l[0],360)||!vector(l[1],360)||l[0].some((v,i)=>v>l[1][i])))))throw Error('Joint limits need minimum and maximum rotations.');
 const frames=new Set();for(const k of rig.keys){if(!k||!Number.isInteger(k.frame)||k.frame<0||k.frame>=86400||frames.has(k.frame)||!pose(k.pose)||(k.root!==undefined&&!vector(k.root,10000))||(k.face!==undefined&&(!face(k.face)||k.face.length!==(rig.face?.length||0))))throw Error('Invalid 3D keyframe.');frames.add(k.frame);}
 validateTiming(rig,rig.keys);validatePerformance(rig);validateChannels(rig.channels,rigChannelSpecs(rig));
 if(rig.model!==null&&(!rig.model||typeof rig.model.name!=='string'||!rig.model.name.toLowerCase().endsWith('.glb')||/[\\/]/.test(rig.model.name)||rig.model.type!=='input'||typeof rig.model.subfolder!=='string'||rig.model.subfolder.split(/[\\/]/).includes('..')))throw Error('Invalid local GLB reference.');
 if(rig.camera!==undefined&&(!rig.camera||!vector(rig.camera.position,1e6)||!vector(rig.camera.target,1e6)||Math.hypot(...rig.camera.position.map((v,i)=>v-rig.camera.target[i]))<0.001))throw Error('Invalid 3D camera.');
 if(rig.cameraKeys!==undefined){
  if(!Array.isArray(rig.cameraKeys)||rig.cameraKeys.length>MAX_3D_KEYS)throw Error('Use at most 120 camera keys.');
  const seen=new Set();
  for(const key of rig.cameraKeys){
   if(!key||!Number.isInteger(key.frame)||key.frame<0||key.frame>=86400||seen.has(key.frame)||!vector(key.position,1e6)||!vector(key.target,1e6)||Math.hypot(...key.position.map((v,i)=>v-key.target[i]))<0.001)throw Error('Invalid camera key.');
   if(key.easing!==undefined&&!EASINGS.some(([id])=>id===key.easing))throw Error('Invalid camera easing.');
   if(key.curve!==undefined&&(key.easing!=='bezier'||!Array.isArray(key.curve)||key.curve.length!==4||!key.curve.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Camera timing curve handles must be four numbers between 0 and 1 for bezier easing.');
   seen.add(key.frame);
  }
 }
}
export function sampleCamera(rig,frame){
 const keys=[...(rig?.cameraKeys||[])].sort((a,b)=>a.frame-b.frame);
 if(!keys.length)return rig?.camera?{position:[...rig.camera.position],target:[...rig.camera.target]}:null;
 const a=keys.filter(key=>key.frame<=frame).at(-1);
 if(!a){
  if(rig.camera)return {position:[...rig.camera.position],target:[...rig.camera.target]};
  return {position:[...keys[0].position],target:[...keys[0].target]};
 }
 const b=keys.find(key=>key.frame>frame),easing=a.easing??'hold';
 if(!b||easing==='hold')return {position:[...a.position],target:[...a.target]};
 const t=easeAt({easing,curve:a.curve},(frame-a.frame)/(b.frame-a.frame));
 return {position:a.position.map((v,i)=>v+(b.position[i]-v)*t),target:a.target.map((v,i)=>v+(b.target[i]-v)*t)};
}
export function sampleRig3D(rig,frame){
 const interval=motionInterval(rig,rig.keys,frame);
 const base=interval?interval.a.pose.map((p,i)=>rig.rotationMode==='shortest'&&!rig.limits?.[i]&&!rig.channels?.some(c=>channelActive(c)&&c.blendTarget===undefined&&c.id.startsWith(`joint:${i}:`))?shortestRotation(p,interval.b.pose[i],interval.t):p.map((v,j)=>v+(interval.b.pose[i][j]-v)*interval.t)):rig.pose;
 return limitPose(rig,base.map((p,i)=>p.map((v,j)=>sampleScalar(rig.channels,`joint:${i}:${j}`,frame,v))));
}
export const limitPose=(rig,pose)=>pose.map((p,i)=>p.map((v,j)=>rig.limits?.[i]?Math.max(rig.limits[i][0][j],Math.min(rig.limits[i][1][j],v)):v));
export function sampleChannel(rig,frame,key,fallback){
 const mouthFrame=frame,finish=value=>{const base=key==='face'?sampleFace(rig,mouthFrame,value):value,channels=base.map((v,i)=>sampleScalar(rig.channels,`${key}:${i}`,frame,v));return key==='face'?faceWithMouth(rig,mouthFrame,channels):channels;};
 const interval=motionInterval(rig,rig.keys,frame);if(!interval)return finish(rig[key]||fallback);
 const {a,b,t}=interval;
 const start=a[key]||fallback,end=b[key]||fallback;return finish(start.map((v,i)=>v+(end[i]-v)*t));
}
// Load the 3D engine only when requested, keeping ordinary project opening lightweight.
/** Durable reference-video overlay on a shot (3D review). Same media shape as shot.media / episode audio. */
export const REFERENCE_VIDEO_FPS=24;
export const REFERENCE_VIDEO_SYNC_EPS=.04;
export const REFERENCE_VIDEO_COMPARE_OVERLAY='overlay';
export const REFERENCE_VIDEO_COMPARE_SIDE='sideBySide';
export const REFERENCE_VIDEO_COMPARE_STACK='stacked';
export const REFERENCE_VIDEO_STACK_STAGE_FIRST='stageFirst';
export const REFERENCE_VIDEO_STACK_REF_FIRST='referenceFirst';
/** Durable reference compare layout on shot.referenceVideo (omit/overlay = over viewport; sideBySide = beside 3D; stacked = above/below for narrow layouts). Optional stackOrder (stageFirst/referenceFirst) swaps pane order when stacked. */
export function referenceVideoCompareMode(ref){
 if(ref?.compare===REFERENCE_VIDEO_COMPARE_SIDE)return REFERENCE_VIDEO_COMPARE_SIDE;
 if(ref?.compare===REFERENCE_VIDEO_COMPARE_STACK)return REFERENCE_VIDEO_COMPARE_STACK;
 return REFERENCE_VIDEO_COMPARE_OVERLAY;
}
export function shotWantsReferenceSideBySide(shot){return referenceVideoCompareMode(shot?.referenceVideo)===REFERENCE_VIDEO_COMPARE_SIDE;}
export function shotWantsReferenceStacked(shot){return referenceVideoCompareMode(shot?.referenceVideo)===REFERENCE_VIDEO_COMPARE_STACK;}
export function applyReferenceVideoCompare(ref,{compare}={}){
 if(!ref||typeof ref!=='object')return ref;
 if(compare===REFERENCE_VIDEO_COMPARE_SIDE){ref.compare=REFERENCE_VIDEO_COMPARE_SIDE;return ref;}
 if(compare===REFERENCE_VIDEO_COMPARE_STACK){ref.compare=REFERENCE_VIDEO_COMPARE_STACK;return ref;}
 delete ref.compare;
 return ref;
}
/** Durable hide-without-clear on shot.referenceVideo (true = pane muted; assignment kept). Omit/false = shown. */
export function referenceVideoIsHidden(ref){return !!ref?.hidden;}
export function shotWantsReferenceHidden(shot){return referenceVideoIsHidden(shot?.referenceVideo);}
export function applyReferenceVideoHidden(ref,{hidden}={}){
 if(!ref||typeof ref!=='object')return ref;
 if(hidden){ref.hidden=true;return ref;}
 delete ref.hidden;
 return ref;
}
/** Durable stacked pane order on shot.referenceVideo (omit/stageFirst = 3D on top; referenceFirst = reference on top). Only affects stacked compare. */
export function referenceVideoStackOrder(ref){
 if(ref?.stackOrder===REFERENCE_VIDEO_STACK_REF_FIRST)return REFERENCE_VIDEO_STACK_REF_FIRST;
 return REFERENCE_VIDEO_STACK_STAGE_FIRST;
}
export function shotWantsReferenceStackRefFirst(shot){
 return referenceVideoCompareMode(shot?.referenceVideo)===REFERENCE_VIDEO_COMPARE_STACK
  && referenceVideoStackOrder(shot?.referenceVideo)===REFERENCE_VIDEO_STACK_REF_FIRST;
}
export function applyReferenceVideoStackOrder(ref,{stackOrder}={}){
 if(!ref||typeof ref!=='object')return ref;
 if(stackOrder===REFERENCE_VIDEO_STACK_REF_FIRST){ref.stackOrder=REFERENCE_VIDEO_STACK_REF_FIRST;return ref;}
 delete ref.stackOrder;
 return ref;
}
/** Map a 3D playhead frame to reference-video seconds (clamped to duration when known). */
export function referenceVideoTimeAtFrame(frame,duration,fps=REFERENCE_VIDEO_FPS){
 const t=Math.max(0,(Number(frame)||0)/fps);
 if(Number.isFinite(duration)&&duration>=0)return Math.min(t,duration);
 return t;
}
export function referenceVideoViewURL(file){
 return '/view?'+new URLSearchParams({filename:file.name||file.filename||'',subfolder:file.subfolder||'',type:file.type||'input'});
}
export function validateShotReferenceVideo(shot){
 if(!shot||shot.referenceVideo===undefined)return;
 const ref=shot.referenceVideo;
 if(!ref||typeof ref!=='object'||Array.isArray(ref))throw Error('Invalid reference video.');
 const name=ref.name||ref.filename;
 if(typeof name!=='string'||!name||/[\\/]/.test(name)||!/\.(mp4|webm|mov|mkv|m4v)$/i.test(name))throw Error('Reference video must be a local mp4, webm, mov, mkv or m4v file.');
 if(!['input','output'].includes(ref.type||'input'))throw Error('Invalid reference video media type.');
 if(ref.subfolder!==undefined&&(typeof ref.subfolder!=='string'||ref.subfolder.split(/[\\/]/).includes('..')))throw Error('Invalid reference video path.');
 if(ref.opacity!==undefined&&(!Number.isFinite(ref.opacity)||ref.opacity<0||ref.opacity>1))throw Error('Reference video opacity must be 0-1.');
 if(ref.compare!==undefined&&ref.compare!==REFERENCE_VIDEO_COMPARE_OVERLAY&&ref.compare!==REFERENCE_VIDEO_COMPARE_SIDE&&ref.compare!==REFERENCE_VIDEO_COMPARE_STACK)throw Error('Reference video compare must be overlay, sideBySide or stacked.');
 if(ref.hidden!==undefined&&ref.hidden!==true&&ref.hidden!==false)throw Error('Reference video hidden must be true or false.');
 if(ref.stackOrder!==undefined&&ref.stackOrder!==REFERENCE_VIDEO_STACK_STAGE_FIRST&&ref.stackOrder!==REFERENCE_VIDEO_STACK_REF_FIRST)throw Error('Reference video stackOrder must be stageFirst or referenceFirst.');
}
/** True when shot has a durable referenceVideo file assignment. */
export function shotHasReferenceVideo(shot){
 const ref=shot?.referenceVideo;
 if(!ref||typeof ref!=='object'||Array.isArray(ref))return false;
 const name=ref.name||ref.filename;
 return typeof name==='string'&&!!name;
}

/** Other episode shots that already have a reference video (for continuity copy). */
export function listReferenceVideoSources(project, excludeShotId){
 const out=[];
 for(const scene of project?.scenes||[]){
  for(const shot of scene.shots||[]){
   if(shot.id===excludeShotId||!shotHasReferenceVideo(shot))continue;
   const ref=shot.referenceVideo;
   const fileName=ref.name||ref.filename;
   const sceneTitle=scene.title||'Scene';
   const shotTitle=shot.title||'Untitled shot';
   const bits=[sceneTitle+' / '+shotTitle,fileName];
   const mode=referenceVideoCompareMode(ref);
   if(mode===REFERENCE_VIDEO_COMPARE_SIDE)bits.push('side by side');
   else if(mode===REFERENCE_VIDEO_COMPARE_STACK)bits.push('stacked');
   if(referenceVideoIsHidden(ref))bits.push('hidden');
   if(Number.isFinite(ref.opacity)&&ref.opacity!==.4)bits.push(Math.round(ref.opacity*100)+'%');
   out.push({id:shot.id,sceneId:scene.id,sceneTitle,shotTitle,fileName,label:bits.join(' · ')});
  }
 }
 return out;
}

function referenceFileFields(ref){
 return {
  name:ref.name||ref.filename,
  subfolder:ref.subfolder||'',
  type:ref.type||'input',
 };
}

function referenceLayoutFields(ref){
 const next={};
 if(Number.isFinite(ref?.opacity)&&ref.opacity!==.4)next.opacity=ref.opacity;
 if(ref?.compare===REFERENCE_VIDEO_COMPARE_SIDE||ref?.compare===REFERENCE_VIDEO_COMPARE_STACK)next.compare=ref.compare;
 if(ref?.hidden===true)next.hidden=true;
 if(ref?.stackOrder===REFERENCE_VIDEO_STACK_REF_FIRST)next.stackOrder=REFERENCE_VIDEO_STACK_REF_FIRST;
 return next;
}

function referenceCopySummary(ref, mode){
 return {
  mode,
  fileName:ref.name||ref.filename,
  compare:referenceVideoCompareMode(ref),
  hidden:referenceVideoIsHidden(ref),
  opacity:Number.isFinite(ref.opacity)?ref.opacity:.4,
  stackOrder:referenceVideoStackOrder(ref),
 };
}

/**
 * Copy reference video from sourceShot onto targetShot.
 * mode 'all' (default): replace file + layout (opacity / compare / hide / stack order).
 * mode 'layout': copy layout only; keep local file (target must already have a reference).
 * mode 'file': copy file only; keep local layout (or defaults when target has none).
 * Mutates targetShot; validates. Caller should wrap in change()/Undo.
 */
export function copyReferenceVideoFromShot(targetShot, sourceShot, mode='all'){
 if(!targetShot||typeof targetShot!=='object'||Array.isArray(targetShot))throw Error('Target shot is required.');
 if(!shotHasReferenceVideo(sourceShot))throw Error('Source shot has no reference video to copy.');
 const m=mode==null||mode===''?'all':mode;
 if(m!=='all'&&m!=='layout'&&m!=='file')throw Error('Reference video copy mode must be all, layout, or file.');
 const src=sourceShot.referenceVideo;
 if(m==='layout'){
  if(!shotHasReferenceVideo(targetShot))throw Error('This shot needs a reference video before copying layout settings.');
  targetShot.referenceVideo={...referenceFileFields(targetShot.referenceVideo),...referenceLayoutFields(src)};
  validateShotReferenceVideo(targetShot);
  return referenceCopySummary(targetShot.referenceVideo,'layout');
 }
 if(m==='file'){
  const next={...referenceFileFields(src)};
  if(shotHasReferenceVideo(targetShot))Object.assign(next,referenceLayoutFields(targetShot.referenceVideo));
  targetShot.referenceVideo=next;
  validateShotReferenceVideo(targetShot);
  return referenceCopySummary(targetShot.referenceVideo,'file');
 }
 targetShot.referenceVideo={...referenceFileFields(src),...referenceLayoutFields(src)};
 validateShotReferenceVideo(targetShot);
 return referenceCopySummary(targetShot.referenceVideo,'all');
}

/** True when a shot rig has a saved camera view and/or keyed camera moves. */
export function shotHasCamera(shot){
 const rig=shot?.rig3d;
 if(!rig)return false;
 if(rig.camera)return true;
 return Array.isArray(rig.cameraKeys)&&rig.cameraKeys.length>0;
}

/** Other episode shots that already have camera framing or keys (for continuity copy). */
export function listCameraSources(project, excludeShotId){
 const out=[];
 for(const scene of project?.scenes||[]){
  for(const shot of scene.shots||[]){
   if(shot.id===excludeShotId||!shotHasCamera(shot))continue;
   const keys=Array.isArray(shot.rig3d?.cameraKeys)?shot.rig3d.cameraKeys.length:0;
   const savedView=!!shot.rig3d?.camera;
   const sceneTitle=scene.title||'Scene';
   const shotTitle=shot.title||'Untitled shot';
   const bits=[sceneTitle+' / '+shotTitle];
   if(keys)bits.push(keys+' camera key'+(keys===1?'':'s'));
   if(savedView)bits.push('saved view');
   out.push({id:shot.id,sceneId:scene.id,sceneTitle,shotTitle,keyCount:keys,savedView,label:bits.join(' · ')});
  }
 }
 return out;
}

/**
 * Camera keys use integer frame indices at 24 fps (same as scrub / sampleCamera), not seconds and not 0-1 normalized.
 * Remap key frames from source shot length to target shot length.
 * timeMode 'stretch': scale so source last frame (seconds*24-1) maps to target last frame; frame 0 stays 0.
 * timeMode 'absolute': keep frame numbers unchanged (keys past a shorter target remain valid authoring data).
 * Edge: sourceSeconds<=0 or targetSeconds<=0 (or non-finite) cannot stretch — returns absolute clone.
 * Edge: single key still remaps that key's frame (0 stays 0).
 * Colliding remapped frames: later source key wins. Stretch clamps to [0, targetLast].
 */
export function remapCameraKeyTimes(keys, {sourceSeconds, targetSeconds, timeMode='stretch'}={}){
 const list=Array.isArray(keys)?keys:[];
 const wantStretch=timeMode==null||timeMode===''||timeMode==='stretch';
 if(timeMode!=null&&timeMode!==''&&timeMode!=='stretch'&&timeMode!=='absolute')throw Error('Camera key time mode must be stretch or absolute.');
 const srcOk=Number.isFinite(sourceSeconds)&&sourceSeconds>0;
 const tgtOk=Number.isFinite(targetSeconds)&&targetSeconds>0;
 const stretch=wantStretch&&srcOk&&tgtOk;
 if(!stretch)return {keys:structuredClone(list),timeMode:'absolute',stretched:false};
 const srcLast=Math.max(0,Math.round(sourceSeconds*24)-1);
 const tgtLast=Math.max(0,Math.round(targetSeconds*24)-1);
 const byFrame=new Map();
 for(const key of [...list].sort((a,b)=>a.frame-b.frame)){
  const next=structuredClone(key);
  let frame=srcLast===0?0:Math.round(key.frame*tgtLast/srcLast);
  if(!Number.isFinite(frame))frame=0;
  next.frame=Math.max(0,Math.min(tgtLast,frame));
  byFrame.set(next.frame,next);
 }
 return {keys:[...byFrame.values()].sort((a,b)=>a.frame-b.frame),timeMode:'stretch',stretched:true};
}

/**
 * Copy camera data from sourceRig onto targetRig.
 * mode 'all' (default): replace saved view + cameraKeys (clear sides source lacks).
 * mode 'keys': copy cameraKeys only; keep local saved view.
 * mode 'framing': copy saved view only; keep local cameraKeys.
 * options.timeMode 'stretch' (default when copying keys) or 'absolute'; stretch needs sourceSeconds + targetSeconds.
 * Mutates targetRig; caller should validateRig3D.
 */
export function copyCameraFromShot(targetRig, sourceRig, mode='all', options={}){
 if(!targetRig||typeof targetRig!=='object'||Array.isArray(targetRig))throw Error('Target needs a 3D rig.');
 if(!sourceRig||typeof sourceRig!=='object'||Array.isArray(sourceRig))throw Error('Source shot needs a 3D rig.');
 const m=mode==null||mode===''?'all':mode;
 if(m!=='all'&&m!=='keys'&&m!=='framing')throw Error('Camera copy mode must be all, keys, or framing.');
 const opts=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
 const hasView=!!sourceRig.camera;
 const hasKeys=Array.isArray(sourceRig.cameraKeys)&&sourceRig.cameraKeys.length>0;
 const applyKeys=()=>{
  const remapped=remapCameraKeyTimes(sourceRig.cameraKeys,{sourceSeconds:opts.sourceSeconds,targetSeconds:opts.targetSeconds,timeMode:opts.timeMode??'stretch'});
  targetRig.cameraKeys=remapped.keys;
  return remapped;
 };
 if(m==='keys'){
  if(!hasKeys)throw Error('Source shot has no camera keys to copy.');
  const remapped=applyKeys();
  return {mode:'keys',savedView:false,keyCount:remapped.keys.length,timeMode:remapped.timeMode,stretched:remapped.stretched};
 }
 if(m==='framing'){
  if(!hasView)throw Error('Source shot has no saved camera view to copy.');
  targetRig.camera=structuredClone(sourceRig.camera);
  return {mode:'framing',savedView:true,keyCount:0,timeMode:'absolute',stretched:false};
 }
 if(!hasView&&!hasKeys)throw Error('Source shot has no saved camera view or camera keys.');
 if(hasView)targetRig.camera=structuredClone(sourceRig.camera);
 else delete targetRig.camera;
 let remapped={keys:[],timeMode:'absolute',stretched:false};
 if(hasKeys)remapped=applyKeys();
 else delete targetRig.cameraKeys;
 return {mode:'all',savedView:hasView,keyCount:hasKeys?remapped.keys.length:0,timeMode:hasKeys?remapped.timeMode:'absolute',stretched:!!remapped.stretched};
}

/** True when a shot rig has body pose/contacts/travel or face/features/gaze acting (not camera, not lip-sync, not props). */
export function shotHasActing(shot){
 const rig=shot?.rig3d;if(!rig)return false;
 return shotHasBodyActing(rig)||shotHasFaceActing(rig);
}
function shotHasBodyActing(rig){
 if(!rig)return false;
 if(Array.isArray(rig.keys)&&rig.keys.length)return true;
 if(Array.isArray(rig.contacts)&&rig.contacts.length)return true;
 return (rig.channels||[]).some(c=>channelActive(c)&&!String(c.id||'').startsWith('face:'));
}
function shotHasFaceActing(rig){
 if(!rig)return false;
 if(Array.isArray(rig.faceKeys)&&rig.faceKeys.length)return true;
 if(Array.isArray(rig.featureKeys)&&rig.featureKeys.length)return true;
 if(Array.isArray(rig.eyeTracks)&&rig.eyeTracks.length)return true;
 if(Array.isArray(rig.expressions)&&rig.expressions.length)return true;
 if(Array.isArray(rig.featureExpressions)&&rig.featureExpressions.length)return true;
 if(rig.features)return true;
 return (rig.channels||[]).some(c=>channelActive(c)&&String(c.id||'').startsWith('face:'));
}
function actingSourceBits(rig){
 const bits=[];
 const bodyKeys=Array.isArray(rig?.keys)?rig.keys.length:0;
 const contacts=Array.isArray(rig?.contacts)?rig.contacts.length:0;
 const faceKeys=Array.isArray(rig?.faceKeys)?rig.faceKeys.length:0;
 const featureKeys=Array.isArray(rig?.featureKeys)?rig.featureKeys.length:0;
 const eyeTracks=Array.isArray(rig?.eyeTracks)?rig.eyeTracks.length:0;
 const bodyChannels=(rig?.channels||[]).filter(c=>channelActive(c)&&!String(c.id||'').startsWith('face:')).length;
 const faceChannels=(rig?.channels||[]).filter(c=>channelActive(c)&&String(c.id||'').startsWith('face:')).length;
 if(bodyKeys)bits.push(bodyKeys+' body key'+(bodyKeys===1?'':'s'));
 if(contacts)bits.push(contacts+' contact'+(contacts===1?'':'s'));
 if(bodyChannels)bits.push(bodyChannels+' body channel'+(bodyChannels===1?'':'s'));
 if(faceKeys)bits.push(faceKeys+' face key'+(faceKeys===1?'':'s'));
 if(featureKeys)bits.push(featureKeys+' feature key'+(featureKeys===1?'':'s'));
 if(eyeTracks)bits.push(eyeTracks+' eye track'+(eyeTracks===1?'':'s'));
 if(faceChannels)bits.push(faceChannels+' face channel'+(faceChannels===1?'':'s'));
 if(rig?.features&&!featureKeys)bits.push('features');
 if((rig?.expressions||[]).length)bits.push(rig.expressions.length+' expression'+(rig.expressions.length===1?'':'s'));
 return bits;
}
/** Other episode shots that already have body/face acting (for continuity copy). */
export function listActingSources(project, excludeShotId){
 const out=[];
 for(const scene of project?.scenes||[]){
  for(const shot of scene.shots||[]){
   if(shot.id===excludeShotId||!shotHasActing(shot))continue;
   const sceneTitle=scene.title||'Scene';
   const shotTitle=shot.title||'Untitled shot';
   const bits=[sceneTitle+' / '+shotTitle,...actingSourceBits(shot.rig3d)];
   out.push({id:shot.id,sceneId:scene.id,sceneTitle,shotTitle,hasBody:shotHasBodyActing(shot.rig3d),hasFace:shotHasFaceActing(shot.rig3d),label:bits.join(' · ')});
  }
 }
 return out;
}
/**
 * Remap start/end spans (contacts, eye tracks) with the same stretch/absolute rules as remapCameraKeyTimes.
 * Does not change remapCameraKeyTimes. Stretch clamps to [0, targetLast]; end is raised to start if inverted.
 */
export function remapSpanTimes(spans, {sourceSeconds, targetSeconds, timeMode='stretch'}={}){
 const list=Array.isArray(spans)?spans:[];
 const wantStretch=timeMode==null||timeMode===''||timeMode==='stretch';
 if(timeMode!=null&&timeMode!==''&&timeMode!=='stretch'&&timeMode!=='absolute')throw Error('Acting span time mode must be stretch or absolute.');
 const srcOk=Number.isFinite(sourceSeconds)&&sourceSeconds>0;
 const tgtOk=Number.isFinite(targetSeconds)&&targetSeconds>0;
 const stretch=wantStretch&&srcOk&&tgtOk;
 if(!stretch)return {spans:structuredClone(list),timeMode:'absolute',stretched:false};
 const srcLast=Math.max(0,Math.round(sourceSeconds*24)-1);
 const tgtLast=Math.max(0,Math.round(targetSeconds*24)-1);
 const mapFrame=frame=>{
  let next=srcLast===0?0:Math.round(Number(frame)*tgtLast/srcLast);
  if(!Number.isFinite(next))next=0;
  return Math.max(0,Math.min(tgtLast,next));
 };
 const out=[];
 for(const span of list){
  const next=structuredClone(span);
  let start=mapFrame(span.start),end=mapFrame(span.end);
  if(end<start)end=start;
  next.start=start;next.end=end;
  out.push(next);
 }
 return {spans:out,timeMode:'stretch',stretched:true};
}
function splitActingChannels(channels){
 const face=[],body=[];
 for(const c of channels||[]){
  if(String(c.id||'').startsWith('face:'))face.push(c);
  else body.push(c);
 }
 return {face,body};
}
function remapChannelList(channels, opts){
 let stretched=false,timeMode='absolute';
 const out=channels.map(channel=>{
  const next=structuredClone(channel);
  const remapped=remapCameraKeyTimes(next.keys||[],opts);
  next.keys=remapped.keys;
  if(remapped.stretched)stretched=true;
  timeMode=remapped.timeMode;
  return next;
 });
 return {channels:out,timeMode,stretched};
}
function assertActingCompatible(targetRig, sourceRig, {wantBody, wantFace}){
 if(wantBody){
  const tn=targetRig.names||[],sn=sourceRig.names||[];
  if(tn.length!==sn.length||tn.some((n,i)=>n!==sn[i]))throw Error('Source and current shot need the same joint names to copy body acting.');
  if((sourceRig.keys||[]).some(k=>k.face!==undefined)&&(targetRig.face?.length||0)!==(sourceRig.face?.length||0))throw Error('Source and current shot need the same face controls to copy body keys that carry face weights.');
 }
 if(wantFace){
  const hasMorphActing=(sourceRig.faceKeys||[]).length||(sourceRig.expressions||[]).length||sourceRig.face||(sourceRig.channels||[]).some(c=>String(c.id||'').startsWith('face:'));
  if(hasMorphActing&&(targetRig.face?.length||0)!==(sourceRig.face?.length||0))throw Error('Source and current shot need the same face controls to copy facial acting.');
  if((sourceRig.eyeTracks||[]).length){
   const tn=targetRig.names||[],sn=sourceRig.names||[];
   if(tn.length!==sn.length||tn.some((n,i)=>n!==sn[i]))throw Error('Source and current shot need the same joint names to copy eye tracks.');
  }
 }
}
/**
 * Copy body/face acting from sourceRig onto targetRig (not camera; not lip-sync; not props/set-kit).
 * mode 'all' (default): body + face acting.
 * mode 'body': pose keys, contacts, body/travel channels, resting pose/root.
 * mode 'face': faceKeys, featureKeys/features/expressions, eyeTracks, face channels, resting face.
 * options.timeMode 'stretch' (default) or 'absolute'; stretch needs sourceSeconds + targetSeconds.
 * Reuses remapCameraKeyTimes for frame keys without changing camera-copy.
 * Mutates targetRig; caller should validateRig3D.
 */
export function copyActingFromShot(targetRig, sourceRig, mode='all', options={}){
 if(!targetRig||typeof targetRig!=='object'||Array.isArray(targetRig))throw Error('Target needs a 3D rig.');
 if(!sourceRig||typeof sourceRig!=='object'||Array.isArray(sourceRig))throw Error('Source shot needs a 3D rig.');
 const m=mode==null||mode===''?'all':mode;
 if(m!=='all'&&m!=='body'&&m!=='face')throw Error('Acting copy mode must be all, body, or face.');
 const opts=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
 const wantBody=m==='all'||m==='body';
 const wantFace=m==='all'||m==='face';
 const hasBody=shotHasBodyActing(sourceRig);
 const hasFace=shotHasFaceActing(sourceRig);
 if(m==='body'&&!hasBody)throw Error('Source shot has no body acting to copy.');
 if(m==='face'&&!hasFace)throw Error('Source shot has no face acting to copy.');
 if(m==='all'&&!hasBody&&!hasFace)throw Error('Source shot has no body or face acting to copy.');
 assertActingCompatible(targetRig,sourceRig,{wantBody:wantBody&&hasBody,wantFace:wantFace&&hasFace});
 const timeOpts={sourceSeconds:opts.sourceSeconds,targetSeconds:opts.targetSeconds,timeMode:opts.timeMode??'stretch'};
 let timeMode='absolute',stretched=false;
 const note=remapped=>{if(remapped.stretched)stretched=true;if(remapped.timeMode)timeMode=remapped.timeMode;};
 let bodyKeyCount=0,contactCount=0,bodyChannelCount=0,faceKeyCount=0,featureKeyCount=0,eyeTrackCount=0,faceChannelCount=0;
 const localSplit=splitActingChannels(targetRig.channels);
 let nextBodyChannels=localSplit.body;
 let nextFaceChannels=localSplit.face;
 const applyBody=wantBody&&(m==='body'||hasBody);
 const applyFace=wantFace&&(m==='face'||hasFace);
 if(applyBody){
  const keyMap=remapCameraKeyTimes(sourceRig.keys||[],timeOpts);note(keyMap);
  targetRig.keys=keyMap.keys;bodyKeyCount=keyMap.keys.length;
  const contactMap=remapSpanTimes(sourceRig.contacts||[],timeOpts);note(contactMap);
  if(contactMap.spans.length)targetRig.contacts=contactMap.spans;else delete targetRig.contacts;
  contactCount=contactMap.spans.length;
  targetRig.pose=structuredClone(sourceRig.pose);
  if(sourceRig.root!==undefined)targetRig.root=structuredClone(sourceRig.root);else delete targetRig.root;
  const srcSplit=splitActingChannels(sourceRig.channels);
  const bodyMap=remapChannelList(srcSplit.body,timeOpts);note(bodyMap);
  nextBodyChannels=bodyMap.channels;bodyChannelCount=bodyMap.channels.length;
 }
 if(applyFace){
  const faceMap=remapCameraKeyTimes(sourceRig.faceKeys||[],timeOpts);note(faceMap);
  if(faceMap.keys.length)targetRig.faceKeys=faceMap.keys;else delete targetRig.faceKeys;
  faceKeyCount=faceMap.keys.length;
  const featureMap=remapCameraKeyTimes(sourceRig.featureKeys||[],timeOpts);note(featureMap);
  if(featureMap.keys.length)targetRig.featureKeys=featureMap.keys;else delete targetRig.featureKeys;
  featureKeyCount=featureMap.keys.length;
  const eyeMap=remapSpanTimes(sourceRig.eyeTracks||[],timeOpts);note(eyeMap);
  if(eyeMap.spans.length)targetRig.eyeTracks=eyeMap.spans;else delete targetRig.eyeTracks;
  eyeTrackCount=eyeMap.spans.length;
  if(sourceRig.features)targetRig.features=structuredClone(sourceRig.features);else delete targetRig.features;
  if(sourceRig.featureExpressions?.length)targetRig.featureExpressions=structuredClone(sourceRig.featureExpressions);else delete targetRig.featureExpressions;
  if(sourceRig.expressions?.length)targetRig.expressions=structuredClone(sourceRig.expressions);else delete targetRig.expressions;
  if(sourceRig.eyesLinked!==undefined)targetRig.eyesLinked=sourceRig.eyesLinked;else delete targetRig.eyesLinked;
  if(sourceRig.face!==undefined)targetRig.face=structuredClone(sourceRig.face);
  const srcSplit=splitActingChannels(sourceRig.channels);
  const faceMapCh=remapChannelList(srcSplit.face,timeOpts);note(faceMapCh);
  nextFaceChannels=faceMapCh.channels;faceChannelCount=faceMapCh.channels.length;
 }
 if(applyBody||applyFace){
  const nextChannels=[...nextBodyChannels,...nextFaceChannels];
  if(nextChannels.length)targetRig.channels=nextChannels;else delete targetRig.channels;
 }
 return {mode:m,bodyKeyCount,contactCount,bodyChannelCount,faceKeyCount,featureKeyCount,eyeTrackCount,faceChannelCount,timeMode,stretched};
}

/** Durable character-silhouette review flag on a shot (3D Body/Face/Camera panel). Omit or false = shaded. */
export function shotWantsSilhouette(shot){return !!shot?.silhouette;}
export function validateShotSilhouette(shot){
 if(!shot||shot.silhouette===undefined)return;
 if(shot.silhouette!==true&&shot.silhouette!==false)throw Error('Shot silhouette must be true or false.');
}
export function rig3DControls(card,shot,options){
 const panel=document.createElement('details');panel.className='settings rig3d-controls';panel.dataset.shotId=shot.id;
 const summary=document.createElement('summary');summary.textContent=options.stage==='camera'?'Camera · holds and framing':options.stage==='face'?'Face · expression and gaze':'Body · pose, contacts and travel';const body=document.createElement('div');panel.append(summary,body);card.append(panel);
 let loading=false,loaded=false,controller;
 panel.ontoggle=async()=>{if(!panel.open)return;if(loaded){controller?.refresh();return;}if(loading)return;loading=true;body.textContent='Loading 3D workspace…';try{const {createRig3D}=await import('./director-3d.js');if(!panel.isConnected||!options.isCurrent())return;body.replaceChildren();controller=await createRig3D(body,panel,shot,options);loaded=true;}catch(e){body.textContent='3D workspace could not open: '+e.message;}finally{loading=false;}};
}
