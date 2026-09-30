import {paintDrawing,newDrawing,setJointProjector,BOARD_WIDTH,BOARD_HEIGHT,drawingDetachFromJointGate,drawingParentToJointGate} from './director-drawing.js';
import {sampleMotion,hasDrawingAnimation} from './director-motion.js';
import {gazeEyes,pickScenePoint} from './director-eye-target.js';
import {makeStretchShape,remapShapeState} from './director-deformation.js';
import {upgradeStarterFingers} from './director-starter-upgrade.js';
import {appendStageActor,appendStaticProp,skeletonGroups,shiftSkeletonMotion,placeStageActor,removeStageActor} from './director-stage.js';
import {motionReviewControls} from './director-motion-review.js';
import {travelGizmo} from './director-path3d.js';
import {extractActor} from './director-actor-library.js';
import {registerLibraryPropHost,loadLibraryPropScene,appendLibraryPropToModel,libraryPropPlacementName,linkShotAsset,isLibraryStagePropGlb,resolveLibraryLinkForImport,hashGlbBytes,libraryPropFile,libraryPropViewUrl,libraryAssetContentHash} from './director-library-prop.js';
import {embedSetKitLibraryMeshes} from './director-set-kit.js';
import {nudgeStageProp,stagePropNudgeGate,PROP_NUDGE_STEP_PRESETS,readPropNudgeStep,writePropNudgeStep,propNudgeStepPreset,propNudgeAxisDelta,propNudgeKeyBinding,PROP_NUDGE_KEYBOARD_HINT,isPropNudgeTypingTarget} from './director-prop-placement.js';
import {makeRigAsset} from './director-rig-library.js';
import {channelControls,rigChannelSpecs,setRigTravelPoint,channelActive} from './director-channels.js';
import {performanceControls,performanceScrubStrip} from './director-performance-ui.js';
import {shotPerformanceScrubLanes,applyPerformanceScrubLanes} from './director-performance-state.js';
import {syncProps,aimFeatureEyes,validateContactChains} from './director-performance-engine.js';
import {applyFeatureSets,featureControls} from './director-features.js';
import {mouthMapControls} from './director-lipsync.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {starterCharacter,jointsOf,readRigGLB,applyPose,exportRigGLB,disposeObject,faceControls,applyChannels,applyRigFrame,applyCameraSample,jointTravel,MAX_PARENT_DRAWING_CELS,MAX_SCREEN_DRAWING_CELS,parentDrawingSampleFrames,parentDrawingHoldAt,parentDrawingWantsLive3dPreview,localParentDrawingTRS,attachParentDrawings,attachScreenDrawings,drawingBlendNeedsSceneColor,createDrawingBlendSceneColorPass,disposeDrawingBlendSceneColorPass,renderWithDrawingBlendSceneColor,DRAWING_BLEND_SCENE_COLOR_MSAA,DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES,normalizeDrawingBlendSceneColorMsaa} from './director-3d-engine.js';
import {hasRigAnimation,sampleRig3D,validateRig3D,MAX_3D_KEYS,limitPose,sampleChannel,listCameraSources,copyCameraFromShot,listActingSources,copyActingFromShot,shotHasReferenceVideo,listReferenceVideoSources,copyReferenceVideoFromShot,referenceVideoTimeAtFrame,REFERENCE_VIDEO_SYNC_EPS,referenceVideoCompareMode,applyReferenceVideoCompare,applyReferenceVideoHidden,referenceVideoIsHidden,referenceVideoStackOrder,applyReferenceVideoStackOrder,REFERENCE_VIDEO_COMPARE_SIDE,REFERENCE_VIDEO_COMPARE_STACK,REFERENCE_VIDEO_COMPARE_OVERLAY,REFERENCE_VIDEO_STACK_REF_FIRST,REFERENCE_VIDEO_STACK_STAGE_FIRST} from './director-3d-state.js';
import {recordCanvas} from './director-recorder.js';
import {createSkeletonBuilder} from './director-skeleton.js';
import {solveRigIK} from './director-ik3d.js';
import {craftControls,EASINGS,DEFAULT_CURVE,easeAt} from './director-animation-craft.js';
import {pictureNote} from './director-planning-state.js';
import {takePendingFaceSeek,clearPendingFaceSeek} from './director-lipsync.js';

export async function createRig3D(body,panel,shot,{change,button,tell,upload,isCurrent,getSetups,saveSetup,getSetKits,saveSetKit,getLibraryProps=()=>[],getProject=null,stage='body'}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const hint=el('p','Start with a simple skinned character, or import a self-contained rigged GLB. Rotate joints, save poses at different frames and play the result. For static characters, use Build skeleton & paint weights below.');hint.className='hint';body.append(hint);
 const controlsBox=el('fieldset');controlsBox.className='rig3d-fields';body.append(controlsBox);
 const toolbar=el('div');toolbar.className='drawing-toolbar';controlsBox.append(toolbar);
 const field=(name,input)=>{const label=el('label',name);label.className='field';input.setAttribute('aria-label',name);label.append(input);toolbar.append(label);return input;};
 const file=field('Import rigged GLB',el('input'));file.type='file';file.accept='.glb';
 const actorFilter=field('Character joints · skeleton',el('select'));
 actorFilter.title='Filter by connected skeleton root. A character with disconnected skeletons may have several entries.';
 const joint=field('3D joint',el('select'));
 let actorGroups=[];
 function filterJoints(){
  const selected=joint.value,group=actorGroups.find(g=>String(g.root)===actorFilter.value);
  const indices=group?.joints||bones.map((_,i)=>i);
  joint.replaceChildren(...indices.map(i=>new Option(rig().names[i],String(i))));
  if(indices.includes(Number(selected))&&selected!=='')joint.value=selected;
 }
 actorFilter.onchange=()=>{filterJoints();joint.onchange();};
 const angles=['X','Y','Z'].map(axis=>{const input=field('Joint rotation '+axis,el('input'));input.type='number';input.min=-360;input.max=360;input.step=5;return input;});
 const frame=field('3D animation frame',el('input'));frame.type='number';frame.min=0;frame.max=shot.seconds*24-1;frame.step=1;frame.value=0;
 const easing=field('3D movement after keyframe',el('select'));for(const [v,t] of EASINGS)easing.add(new Option(t,v));
 const actions=el('div');actions.className='actions';controlsBox.append(actions);
 actions.append(button('Select skeleton root',()=>{const group=actorGroups.find(g=>g.joints.includes(Number(joint.value)));if(!group)return;joint.value=String(group.root);joint.onchange();}));
 const advanced=el('details');advanced.className='settings';advanced.append(el('summary','Joint limits, targets & loops'));const advancedFields=el('div');advancedFields.className='drawing-toolbar';advanced.append(advancedFields);controlsBox.append(advanced);
 function advancedField(label,input){const l=el('label',label);l.className='field';input.setAttribute('aria-label',label);l.append(input);advancedFields.append(l);return input;}
 const rotationMode=advancedField('Pose rotation path',el('select'));rotationMode.add(new Option('Euler angles · existing behavior','euler'));rotationMode.add(new Option('Shortest rotation · quaternion','shortest'));rotationMode.onchange=()=>edit(r=>r.rotationMode=rotationMode.value);
 advanced.append(el('p','Shortest rotation blends full-pose joints without extra spins. Joints with limits or ordinary rotation channels retain Euler behavior; blend channels keep the underlying rotation path. Use Euler angles for intentional revolutions. Review contacts and arcs after switching.'));
 const loop=advancedField('Repeat 3D keyframes',el('input'));loop.type='checkbox';loop.onchange=()=>edit(r=>r.loop=loop.checked);
 const rootFields=['X','Y','Z'].map((axis,i)=>{const input=advancedField('Root movement '+axis,el('input'));input.type='number';input.min=-10000;input.max=10000;input.step=.05;input.onchange=()=>{preview=false;edit(r=>{r.root??=[0,0,0];r.root[i]=Number(input.value);});};return input;});
 const faceSelect=advancedField('Face / shape control',el('select')),faceValue=advancedField('Shape amount (0 rest, 1 full)',el('input'));faceValue.type='number';faceValue.min=-10;faceValue.max=10;faceValue.step=.05;
 const poseName=advancedField('Pose name',el('input'));poseName.maxLength=100;poseName.placeholder='Wave, walk contact, smile…';const savedPoses=advancedField('Saved poses',el('select'));
 advanced.append(button('Save named pose',()=>{const name=poseName.value.trim();if(!name){notify('Give this pose a name first.');return;}edit(r=>{r.face??=morphs.map(c=>c.base);r.savedPoses=(r.savedPoses||[]).filter(p=>p.name!==name);r.savedPoses.push({name,pose:structuredClone(r.pose),root:[...(r.root||[0,0,0])],face:[...r.face]});});}),button('Load named pose',()=>{const p=rig().savedPoses?.[Number(savedPoses.value)];if(!p)return;preview=false;edit(r=>{r.pose=structuredClone(p.pose);r.root=[...p.root];r.face=[...p.face];});}),button('Delete named pose',()=>edit(r=>{r.savedPoses=(r.savedPoses||[]).filter((p,i)=>i!==Number(savedPoses.value));})));
 faceSelect.onchange=()=>faceValue.value=rig().face?.[Number(faceSelect.value)]??morphs[Number(faceSelect.value)]?.base??0;
 faceValue.onchange=()=>{preview=false;edit(r=>{r.face??=morphs.map(c=>c.base);r.face[Number(faceSelect.value)]=Number(faceValue.value);});};
 const limitEnabled=advancedField('Limit selected joint',el('input'));limitEnabled.type='checkbox';limitEnabled.onchange=()=>edit(r=>{r.limits??=r.names.map(()=>null);r.limits[Number(joint.value)]=limitEnabled.checked?[[-180,-180,-180],[180,180,180]]:null;});
 const limitFields=[0,1].map((side)=>['X','Y','Z'].map((axis,i)=>{const input=advancedField((side?'Maximum ':'Minimum ')+axis+' rotation',el('input'));input.type='number';input.min=-360;input.max=360;input.onchange=()=>edit(r=>{r.limits[Number(joint.value)][side][i]=Number(input.value);});return input;}));
 const target=['X','Y','Z'].map(axis=>{const input=advancedField('Limb target '+axis,el('input'));input.type='number';input.step=.05;input.value=0;return input;});
 const poleEnabled=advancedField('Use elbow / knee bend target',el('input'));poleEnabled.type='checkbox';
 const poleFields=['X','Y','Z'].map(axis=>{const input=advancedField('Bend target '+axis,el('input'));input.type='number';input.step=.05;input.value=0;return input;});
 advanced.append(el('p','Limb and bend targets use world coordinates. The bend point chooses the elbow/knee side around the limb axis; it is not a position the joint must reach. Save the resulting pose as a key. This is a pose-authoring control, not an animated pole constraint. Limits may prevent the requested bend.'));
 advanced.append(button('Use current hand / foot position',()=>{draw();const p=bones[Number(joint.value)].getWorldPosition(new THREE.Vector3());target.forEach((t,i)=>t.value=p.toArray()[i].toFixed(3));}),button('Move hand / foot to target',()=>{if(busy)return;stop();preview=false;draw();try{const result=solveRigIK(root,bones,rest,rig(),Number(joint.value),target.map(t=>Number(t.value)),poleEnabled.checked?poleFields.map(t=>Number(t.value)):null);edit(r=>r.pose=result.pose);notify(result.poleLimited?'Bend target conflicts with joint limits. Pose is clamped; review the hand / foot position.':poleEnabled.checked&&!result.poleApplied?'Limb is straight or bend direction is undefined. Choose a nearer limb target to create a bend.':result.distance<.01?'Limb positioned. Save a keyframe to keep this motion.':'Limb moved as close as its reach and joint limits allow.');}catch(e){notify(e.message);}}));
 const eyeTargetPanel=el('details');eyeTargetPanel.className='settings';eyeTargetPanel.append(el('summary','Eye bones · aim at a scene point'),el('p','Both eyes stay linked and converge on one point, as they do in life. Unlink them to aim one eye alone. Each eye casts its own ray from just in front of its eyeball, so it does not look at itself, and the other eyeball or any nearer surface can stop the ray. Click the scene or type the shared point. Key one frame, or track the range. Shape-only eyes use the gaze controls in Character continuity.'));controlsBox.append(eyeTargetPanel);
 function eyeTargetField(label,input){const wrap=el('label',label);wrap.className='field';input.setAttribute('aria-label',label);wrap.append(input);eyeTargetPanel.append(wrap);return input;}
 const eyeForward=eyeTargetField('Eye bone forward axis',el('select'));for(const axis of ['+Z','-Z','+X','-X','+Y','-Y'])eyeForward.add(new Option(axis,axis));
 const eyePoint=['X','Y','Z'].map((axis,i)=>{const input=eyeTargetField('Eye target '+axis,el('input'));input.type='number';input.step=.1;input.value=i===2?3:0;return input;});
 let eyePicking=false;const eyePickLabel=el('label','Set the target by clicking the scene'),eyePick=el('input');eyePickLabel.className='field';eyePick.type='checkbox';eyePick.setAttribute('aria-label','Set the eye target by clicking the scene');eyePick.onchange=()=>{eyePicking=eyePick.checked;};eyePickLabel.append(eyePick);eyeTargetPanel.append(eyePickLabel);
 const eyeLinkLabel=el('label','Link both eyes'),eyeLink=el('input');eyeLinkLabel.className='field';eyeLink.type='checkbox';eyeLink.checked=true;eyeLink.setAttribute('aria-label','Link both eyes');eyeLink.onchange=()=>{if(busy||!isCurrent())return;stop();try{const next=structuredClone(rig());next.eyesLinked=eyeLink.checked;validateRig3D(next);preview=true;edit(r=>Object.assign(r,next));notify(eyeLink.checked?'Both eyes will converge on the next point you key or track.':'The selected eye can aim on its own.');}catch(error){notify(error.message);eyeLink.checked=rig().eyesLinked!==false;}};eyeLinkLabel.append(eyeLink);eyeTargetPanel.append(eyeLinkLabel);
 const eyeStart=eyeTargetField('Eye track start frame',el('input')),eyeEnd=eyeTargetField('Eye track end frame',el('input'));eyeStart.type=eyeEnd.type='number';eyeStart.min=eyeEnd.min=0;eyeStart.step=eyeEnd.step=1;eyeStart.value=0;eyeEnd.value=Math.max(0,shot.seconds*24-1);
 eyeTargetPanel.append(button('Key selected eye toward point',()=>{if(busy||!isCurrent())return;stop();try{const linked=eyeLink.checked,next=gazeEyes({root,rig:rig(),rest,baseRoot,joint:Number(joint.value),target:eyePoint.map(f=>Number(f.value)),axis:eyeForward.value,frame:Number(frame.value),lastFrame:shot.seconds*24-1,linked,action:'key'});preview=true;edit(r=>Object.assign(r,next));notify(linked?'Both eyes keyed toward the same point.':'Selected eye keyed. The other eye was left alone.');}catch(error){notify(error.message);}}));
 eyeTargetPanel.append(button('Track selected eye through this range',()=>{if(busy||!isCurrent())return;stop();try{const linked=eyeLink.checked,next=gazeEyes({root,rig:rig(),rest,baseRoot,joint:Number(joint.value),target:eyePoint.map(f=>Number(f.value)),axis:eyeForward.value,start:Number(eyeStart.value),end:Number(eyeEnd.value),lastFrame:shot.seconds*24-1,linked,action:'track'});preview=true;edit(r=>Object.assign(r,next));notify(linked?'Both eyes track that point. Each keeps its own ray.':'Selected eye tracks that point.');}catch(error){notify(error.message);}}));
 eyeTargetPanel.append(button('Remove tracks on selected eye',()=>{if(busy||!isCurrent())return;stop();try{const linked=eyeLink.checked,next=gazeEyes({root,rig:rig(),rest,baseRoot,joint:Number(joint.value),linked,action:'remove'});preview=true;edit(r=>{Object.assign(r,next);if(!next.eyeTracks)delete r.eyeTracks;});notify(linked?'Tracks removed from both eyes.':'Tracks removed from the selected eye.');}catch(error){notify(error.message);}}));
 featureControls({host:eyeTargetPanel,getRig:()=>rig(),edit:fn=>edit(fn),notify:text=>notify(text),getTarget:()=>eyePoint.map(input=>Number(input.value)),getLinked:()=>eyeLink.checked,getFrame:()=>Number(frame.value),lastFrame:()=>shot.seconds*24-1,isBusy:()=>busy||!isCurrent()});
 const viewport=el('div');viewport.className='rig3d-viewport';body.append(viewport);
 const viewportStage=el('div');viewportStage.className='rig3d-stage';viewport.style.position='relative';viewport.append(viewportStage);
 const composite=el('canvas'),compositeStage=el('canvas'),compositeScratch=el('canvas');composite.width=960;composite.height=540;composite.setAttribute('aria-label','3D preview with drawing effects');composite.style.cssText='position:absolute;inset:0;pointer-events:none;display:none';viewportStage.append(composite);
 const finish=field('Include drawing layers over 3D',el('input'));finish.type='checkbox';finish.checked=!!shot.drawing?.over3d;
 const finishHint=el('p','Paint this shot’s effects in Draw storyboard · layers. Visible layers, cels, opacity and blend modes use the 3D playhead and appear in recorded clips. A layer set to Moves with joint is a depth-tested card on that bone, the same card Download animated GLB writes. Billboard is the screen slide. Other marks stay in screen space. White paper, onion skins and correction guides are excluded. Joint-parented drawings stay in the recorded clip and also export as mesh-aware textured cards on their joints in Download animated GLB (sized from joint/skin bounds, surface-anchored, depth-tested so the mesh can occlude them; optional billboard placement keeps the older screen-FOV size; Conform card style exports a multi-bone skinned planar patch; Decal projects onto host mesh triangles with adaptive card→mesh ray density, fitted Bezier contour (on hyperbolic in-cell iso densify) clip + edge remesh, and host bone weights). Mesh-aware, Conform, and Decal preview as that card in this viewport. Billboard stays a screen slide. Multi-frame cels, pose keys and walk/stroke inbetweens bake as stepped image holds on those planes (up to 48 holds per layer). Screen-space (non-parented) marks export as camera-facing overlay planes on the Shot camera in Download animated GLB (same stepped holds, up to 48). Draw blend modes on those materials: Multiply → MultiplyBlending, Screen → true CustomBlending Screen, Overlay/Soft light → custom shaders (Director auto scene-color multipass against the live 3D scene; Overlay / Soft-light MSAA knob sets the multipass destination samples); glTF keeps opacity + extras only — external viewers Normal-blend. Camera keys are included in the GLB.');finishHint.id='finish-'+shot.id;finish.setAttribute('aria-describedby',finishHint.id);controlsBox.append(finishHint);
 finish.onchange=()=>{if(busy||!isCurrent())return;stop();change(()=>{shot.drawing??=newDrawing();shot.drawing.over3d=finish.checked;},{redraw:false});draw();};
 const msaa=field('Overlay / Soft-light MSAA',el('select'));
 for(const n of DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES){
  const label=n===0?'Off (aliased)':n===DRAWING_BLEND_SCENE_COLOR_MSAA?n+'x (default)':n+'x';
  msaa.add(new Option(label,String(n)));
 }
 msaa.value=String(normalizeDrawingBlendSceneColorMsaa(shot.drawing?.sceneColorMsaa));
 const msaaHint=el('p','MSAA for the Overlay / Soft-light scene-color multipass only (not the main canvas). Default 4x matches the viewport antialias when WebGL2 allows; Off / 2x / 8x trade quality vs cost. WebGL1 or low GPU caps fall back to Off. Saved on the drawing board with the shot.');
 msaaHint.className='hint';msaaHint.id='msaa-'+shot.id;msaa.setAttribute('aria-describedby',msaaHint.id);controlsBox.append(msaaHint);
 msaa.onchange=()=>{if(busy||!isCurrent())return;stop();const n=normalizeDrawingBlendSceneColorMsaa(msaa.value);msaa.value=String(n);change(()=>{shot.drawing??=newDrawing();if(n===DRAWING_BLEND_SCENE_COLOR_MSAA)delete shot.drawing.sceneColorMsaa;else shot.drawing.sceneColorMsaa=n;},{redraw:false});draw();notify(n===0?'Overlay / Soft-light scene-color MSAA off (aliased destination).':'Overlay / Soft-light scene-color MSAA set to '+n+'x (clamped to GPU max when needed).');};
 function syncSceneColorMsaa(){msaa.value=String(normalizeDrawingBlendSceneColorMsaa(shot.drawing?.sceneColorMsaa));}
 function boneScreen(bone){if(!bone||!root)return null;root.updateMatrixWorld(true);camera.updateMatrixWorld(true);const v=bone.getWorldPosition(new THREE.Vector3()).project(camera);if(!Number.isFinite(v.x)||!Number.isFinite(v.y))return null;return [Math.round((v.x*.5+.5)*9600)/10,Math.round((-v.y*.5+.5)*5400)/10];}
 function jointPlaces(board){const places={};if(!board)return places;for(const layer of board.layers){if(!layer.joint)continue;const point=boneScreen(bones.find(bone=>bone.name===layer.joint));if(point)places[layer.id]=point;}return places;}

 function clearLiveSceneColorDrawings(){
  for(const mesh of liveSceneColor.meshes){mesh.parent?.remove(mesh);mesh.geometry?.dispose?.();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats)m?.dispose?.();}
  for(const t of liveSceneColor.textures){t?.dispose?.();}
  liveSceneColor.meshes=[];liveSceneColor.items=[];liveSceneColor.textures=new Set();liveSceneColor.signature='';liveSceneColor.frame=-1;
 }
 function liveSceneColorContentSignature(board){
  if(!board?.over3d)return '';
  const parts=[];
  for(const layer of board.layers||[]){
   if(!layer.visible||!drawingBlendNeedsSceneColor(layer.blend))continue;
   parts.push([layer.id,layer.blend||'',layer.joint||'',layer.placement||'',Number(layer.opacity)||1,(layer.strokes||[]).length,(layer.cels||[]).length,layer.jointAnchor?layer.jointAnchor.join(','):''].join(':'));
  }
  return parts.join('|');
 }
 function rememberLiveDrawingRestScale(meshes){
  const byId=new Map();
  for(const mesh of meshes){
   const id=mesh.userData.studioParentDrawing||mesh.userData.studioScreenDrawing||mesh.uuid;
   if(!byId.has(id))byId.set(id,[]);
   byId.get(id).push(mesh);
  }
  for(const group of byId.values()){
   const live=group.find(m=>m.scale.x||m.scale.y||m.scale.z);
   const rest=live?live.scale.toArray():[1,1,1];
   for(const m of group)m.userData.studioLiveRestScale=rest;
  }
 }
 function applyLiveAttachedDrawingFrame(items,f){
  if(!items?.length)return;
  for(const entry of items){
   const mesh=entry.mesh,item=entry.item;if(!mesh||!item)continue;
   const placement=mesh.userData.studioParentDrawingPlacement;
   const flat=placement==='joint-bounds'||placement==='billboard';
   const cels=item.cels;
   let hidden=false;
   if(cels?.length){
    const hold=parentDrawingHoldAt(cels,f);
    const celFrame=mesh.userData.studioParentDrawingCelFrame??mesh.userData.studioScreenDrawingCelFrame??0;
    hidden=!(hold?.texture&&celFrame===hold.frame);
    if(!flat){
     const rest=mesh.userData.studioLiveRestScale||[1,1,1];
     if(hidden)mesh.scale.set(0,0,0);else mesh.scale.fromArray(rest);
     continue;
    }
   }else if(!flat){
    const tex=item.texture;
    if(tex&&mesh.material?.map!==tex){mesh.material.map=tex;mesh.material.needsUpdate=true;}
   }
   if(!flat)continue;
   const bone=mesh.parent?.isBone?mesh.parent:null;
   if(bone&&camera)localParentDrawingTRS(bone,item,camera,mesh,root);
   if(hidden)mesh.scale.set(0,0,0);
  }
 }
 function applyLiveSceneColorFrame(f){
  applyLiveAttachedDrawingFrame(liveSceneColor.items,f);
  liveSceneColor.frame=f;
 }
 async function syncLiveSceneColorDrawings(f){
  const board=shot.drawing;
  const sig=liveSceneColorContentSignature(board);
  if(sig===liveSceneColor.signature){applyLiveSceneColorFrame(f);return;}
  if(liveSceneColor.syncing)return;
  liveSceneColor.syncing=true;
  try{
   clearLiveSceneColorDrawings();
   if(!sig||!root||!bones?.length||!camera){liveSceneColor.signature=sig;return;}
   const parents=(await prepareParentDrawings(board,f,shot.seconds)).filter(d=>drawingBlendNeedsSceneColor(d.blend));
   const screens=(await prepareScreenDrawings(board,f,shot.seconds)).filter(d=>drawingBlendNeedsSceneColor(d.blend));
   const textures=new Set();
   for(const item of [...parents,...screens]){if(item.texture)textures.add(item.texture);for(const cel of item.cels||[])if(cel.texture)textures.add(cel.texture);}
   const meshes=[],items=[];
   if(parents.length){
    const attached=attachParentDrawings(root,bones,parents,camera);
    for(const mesh of attached){const item=parents.find(d=>d.id===mesh.userData.studioParentDrawing)||parents.find(d=>d.joint===mesh.userData.studioParentDrawingJoint);meshes.push(mesh);items.push({mesh,item});}
   }
   if(screens.length){
    const attached=attachScreenDrawings(camera,screens);
    for(const mesh of attached){const item=screens.find(d=>d.id===mesh.userData.studioScreenDrawing)||screens.find(d=>d.name===mesh.name);meshes.push(mesh);items.push({mesh,item});}
   }
   for(const mesh of meshes)mesh.userData.studioLiveSceneColorDrawing=true;
   rememberLiveDrawingRestScale(meshes);
   liveSceneColor.meshes=meshes;liveSceneColor.items=items;liveSceneColor.textures=textures;liveSceneColor.signature=sig;
   applyLiveSceneColorFrame(f);
   if(meshes.length)queueMicrotask(()=>{if(!disposed&&!rendering)draw();});
  }catch(e){clearLiveSceneColorDrawings();console.warn('Live Overlay/Soft-light scene-color sync failed:',e.message||e);}
  finally{liveSceneColor.syncing=false;}
 }
 function clearLiveConformDecalDrawings(){
  for(const mesh of liveConformDecal.meshes){mesh.parent?.remove(mesh);mesh.geometry?.dispose?.();const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of mats)m?.dispose?.();}
  for(const t of liveConformDecal.textures){t?.dispose?.();}
  liveConformDecal.meshes=[];liveConformDecal.items=[];liveConformDecal.textures=new Set();liveConformDecal.signature='';liveConformDecal.frame=-1;
 }
 function liveConformDecalContentSignature(board){
  if(!board?.over3d)return '';
  const parts=[];
  for(const layer of board.layers||[]){
   if(!layer.visible||!layer.joint||!parentDrawingWantsLive3dPreview(layer))continue;
   if(drawingBlendNeedsSceneColor(layer.blend))continue;
   parts.push([layer.id,layer.blend||'',layer.joint||'',layer.placement||'',Number(layer.opacity)||1,(layer.strokes||[]).length,(layer.cels||[]).length,layer.jointAnchor?layer.jointAnchor.join(','):''].join(':'));
  }
  return parts.join('|');
 }
 function applyLiveConformDecalFrame(f){
  applyLiveAttachedDrawingFrame(liveConformDecal.items,f);
  liveConformDecal.frame=f;
 }
 async function syncLiveConformDecalDrawings(f){
  const board=shot.drawing;
  const sig=liveConformDecalContentSignature(board);
  if(sig===liveConformDecal.signature){applyLiveConformDecalFrame(f);return;}
  if(liveConformDecal.syncing)return;
  liveConformDecal.syncing=true;
  try{
   clearLiveConformDecalDrawings();
   if(!sig||!root||!bones?.length||!camera){liveConformDecal.signature=sig;return;}
   const parents=(await prepareParentDrawings(board,f,shot.seconds)).filter(d=>parentDrawingWantsLive3dPreview(d)&&!drawingBlendNeedsSceneColor(d.blend));
   const textures=new Set();
   for(const item of parents){if(item.texture)textures.add(item.texture);for(const cel of item.cels||[])if(cel.texture)textures.add(cel.texture);}
   const meshes=[],items=[];
   if(parents.length){
    const attached=attachParentDrawings(root,bones,parents,camera);
    for(const mesh of attached){const item=parents.find(d=>d.id===mesh.userData.studioParentDrawing)||parents.find(d=>d.joint===mesh.userData.studioParentDrawingJoint);meshes.push(mesh);items.push({mesh,item});}
   }
   for(const mesh of meshes)mesh.userData.studioLiveConformDecalDrawing=true;
   rememberLiveDrawingRestScale(meshes);
   liveConformDecal.meshes=meshes;liveConformDecal.items=items;liveConformDecal.textures=textures;liveConformDecal.signature=sig;
   applyLiveConformDecalFrame(f);
   if(meshes.length)queueMicrotask(()=>{if(!disposed&&!rendering)draw();});
  }catch(e){clearLiveConformDecalDrawings();console.warn('Live Conform/Decal preview sync failed:',e.message||e);}
  finally{liveConformDecal.syncing=false;}
 }
 function finishFrame(f){const board=shot.drawing,posed=board?sampleMotion(board,f):null,places=posed?jointPlaces(posed):{},notes=[];if(posed)for(const layer of posed.layers){if(!layer.visible||!layer.joint||!layer.jointAnchor||!places[layer.id])continue;notes.push(layer.placement==='billboard'?layer.name+' follows '+layer.joint+' · '+Math.round(places[layer.id][0]-layer.jointAnchor[0])+' px, '+Math.round(places[layer.id][1]-layer.jointAnchor[1])+' px':layer.name+' follows '+layer.joint+' · depth-tested card');}if(followReadout)followReadout.textContent=notes.join(' · ')||'No visible drawing is parented to a joint.';const enabled=!!board?.over3d;composite.style.display=enabled?'block':'none';if(!enabled||!posed)return;paintDrawing(compositeStage,posed,null,compositeScratch,true,renderer.domElement,{places,skipSceneColorBlends:liveSceneColor.meshes.length>0,skipLive3dPlacements:liveConformDecal.meshes.some(m=>m.userData?.studioParentDrawing)||liveSceneColor.meshes.some(m=>m.userData?.studioParentDrawing)});const ctx=composite.getContext('2d');ctx.clearRect(0,0,960,540);ctx.drawImage(compositeStage,0,0);}
 const scrub=el('input');scrub.type='range';scrub.min=0;scrub.max=shot.seconds*24-1;scrub.step=1;scrub.value=0;scrub.setAttribute('aria-label','Scrub 3D animation');controlsBox.append(scrub);
 const status=el('p','Preparing 3D character…');status.setAttribute('role','status');status.className='hint';const progress=el('progress');progress.hidden=true;progress.max=1;const cancel=button('Cancel 3D recording',()=>abort?.abort());cancel.hidden=true;
 const keyButtons=el('div');keyButtons.className='actions motion-keys';body.append(progress,cancel,status,keyButtons);
 const notify=text=>{status.textContent=text;tell(text);};
 let renderer,orbit,helper,root,bones,rest,baseRoot,morphs=[],empty,busy=false,playing=false,preview=false,followCamera=true,rendering=false,raf=0,disposed=false,abort=null,craft,performanceUI,performanceScrub,channelsUI,motionReview,pathDrag,followReadout,cameraReadout,followSelect,parentFollowButton,detachFollowButton,unregisterLibraryPropHost=null;
if(stage==='face')mouthMapControls({host:eyeTargetPanel,getRig:()=>rig(),edit:fn=>edit(fn),notify:text=>notify(text),getMorphNames:()=>morphs.map(c=>c.name)});
 const scene=new THREE.Scene();scene.background=new THREE.Color('#121d2b');const camera=new THREE.PerspectiveCamera(38,16/9,.01,10000);
 let sceneColorPass=createDrawingBlendSceneColorPass();
 let liveSceneColor={signature:'',meshes:[],items:[],textures:new Set(),syncing:false,frame:-1};
 let liveConformDecal={signature:'',meshes:[],items:[],textures:new Set(),syncing:false,frame:-1};
 let onDrawingChanged=null,onDirectorSeek=null;
 scene.add(new THREE.HemisphereLight(0xcfe6ff,0x50505a,2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(3,5,4);scene.add(light);
 const rig=()=>shot.rig3d||empty;
 const travelPanel=el('details');travelPanel.className='settings';travelPanel.append(el('summary','3D travel path · position points'));controlsBox.append(travelPanel);
 travelPanel.append(el('p','At the current animation frame, save all three travel coordinates for the selected joint. Choose an actor’s top joint to move that actor; translating a limb changes its proportions. Values are offsets in the joint’s parent axes, not world positions. Original root uses body travel. Channels hold outside their keys; existing timing is preserved. Use motion-path review below to inspect the resulting trajectory and contacts.'));
 const travelFields=['X','Y','Z'].map(axis=>{const label=el('label','3D travel point '+axis);label.className='field';const input=el('input');input.type='number';input.step=.05;input.min=-10000;input.max=10000;input.value=0;input.setAttribute('aria-label','3D travel point '+axis);label.append(input);travelPanel.append(label);return input;});
 const dragLabel=el('label','Drag 3D travel point in viewport'),dragEnabled=el('input');dragEnabled.type='checkbox';dragEnabled.setAttribute('aria-label','Drag 3D travel point in viewport');dragLabel.append(dragEnabled);travelPanel.append(dragLabel,el('p','Enable the move handles at the selected joint and playhead. Drag an axis or plane; release to save one undoable travel key. Escape cancels. Handles use world axes and convert to the joint’s parent coordinates. Moving a limb can change its proportions. Pinned joints must be edited through their contacts. Handles never appear in recordings or exports.'));
 dragEnabled.onchange=()=>{stop();preview=true;draw();pathDrag?.setEnabled(dragEnabled.checked);draw();};
 travelPanel.append(button('Read 3D travel at playhead',()=>{if(busy||!isCurrent())return;const index=Number(joint.value),f=Number(frame.value),values=index===0?sampleChannel(rig(),f,'root',[0,0,0]):jointTravel(rig(),index,f);travelFields.forEach((input,i)=>input.value=values[i]);}),button('Save 3D travel point',()=>{if(busy||!isCurrent())return;try{const next=setRigTravelPoint(rig(),Number(joint.value),Number(frame.value),travelFields.map(input=>Number(input.value)),shot.seconds*24-1);preview=true;edit(r=>Object.assign(r,next));}catch(error){notify(error.message);}}));
 const craftTarget=field('3D suggestion target',el('select'));craftTarget.add(new Option('Selected joint rotation','joint'));craftTarget.add(new Option('Root travel','root'));
 craft=craftControls({label:'3D',getState:rig,keyName:'keys',getFrame:()=>Number(frame.value),change:next=>{preview=true;edit(r=>Object.assign(r,next));},validate:validateRig3D,notify,beforeEdit:()=>stop(),isBusy:()=>busy||!isCurrent(),lastFrame:()=>shot.seconds*24-1,
  sample:f=>({frame:f,easing:'smooth',pose:sampleRig3D(rig(),f),root:sampleChannel(rig(),f,'root',[0,0,0]),face:sampleChannel(rig(),f,'face',rig().face||morphs.map(c=>c.base))}),
  alter:(key,a,b,factor,lift)=>{if(craftTarget.value==='root'){const p=a.root||[0,0,0],q=b.root||[0,0,0];key.root=p.map((v,i)=>v+(q[i]-v)*factor);key.root[1]+=lift;}else{if(lift)throw Error('Choose Root travel for a spatial arc.');const i=Number(joint.value);key.pose[i]=a.pose[i].map((v,j)=>v+(b.pose[i][j]-v)*factor);const limited=limitPose(rig(),key.pose);if(limited[i].some((v,j)=>Math.abs(v-key.pose[i][j])>1e-6))throw Error('Suggestion exceeds this joint’s limits. Reduce exaggeration.');}}});
 controlsBox.append(el('p','Suggestions target joint rotation or root travel. Inserted full-pose keys may change other channels’ timing; review the whole character and its contacts.'),craft.panel);
 const active=()=>!disposed&&panel.isConnected&&panel.open&&isCurrent()&&!document.hidden;
 const snapshot=()=>JSON.stringify([rig(),shot.seconds,shot.media,shot.drawing?.over3d?shot.drawing:null]);
 function cameraHoldText(){const keys=[...(rig().cameraKeys||[])].sort((a,b)=>a.frame-b.frame),f=Number(frame.value);if(!keys.length)return rig().camera?'Camera uses the saved view.':'Camera has no keys.';const held=keys.filter(key=>key.frame<=f).at(-1);if(!held)return rig().camera?'Camera uses the saved view until the first key.':'Camera hold from frame '+keys[0].frame+'.';const next=keys.find(key=>key.frame>held.frame),easing=held.easing||'hold';if(!next||easing==='hold')return 'Camera hold from frame '+held.frame+'.';const curveNote=easing==='bezier'?' (custom curve)':'';if(f===held.frame)return 'Camera key at frame '+held.frame+' · '+easing+curveNote+' into frame '+next.frame+'.';return 'Camera '+easing+curveNote+' from frame '+held.frame+' to '+next.frame+'.';}
 function shotCameraView(){return (followCamera||playing)&&orbit?{camera,orbit}:null;}
 function publishFrame(){panel.dispatchEvent(new CustomEvent('director-frame',{bubbles:true,detail:{shotId:shot.id,frame:Number(frame.value)}}));}
 function draw(){if(disposed||!root||rendering)return;rendering=true;try{const view=shotCameraView();if(preview){const sampled=applyRigFrame(root,bones,rest,baseRoot,morphs,pathDrag?.draft()||rig(),Number(frame.value),view);if(sampled.warnings.length)status.textContent=sampled.warnings.join('; ');}else{applyPose(bones,rest,limitPose(rig(),rig().pose));applyChannels(bones,baseRoot,morphs,rig());syncProps(root,bones,rig());applyFeatureSets(root,bones,rig());aimFeatureEyes(root,rig());if(view)applyCameraSample(view,rig(),Number(frame.value));}if(cameraReadout)cameraReadout.textContent=cameraHoldText();scene.updateMatrixWorld(true);pathDrag?.sync();const playhead=Number(frame.value);void syncLiveSceneColorDrawings(playhead);void syncLiveConformDecalDrawings(playhead);renderWithDrawingBlendSceneColor(renderer,scene,camera,sceneColorPass,normalizeDrawingBlendSceneColorMsaa(shot.drawing?.sceneColorMsaa));finishFrame(playhead);if(referenceVideo.src&&!referenceVideo.hidden){const t=referenceVideoTimeAtFrame(frame.value,referenceVideo.duration);if(Number.isFinite(t)&&Math.abs(referenceVideo.currentTime-t)>REFERENCE_VIDEO_SYNC_EPS){try{referenceVideo.currentTime=t;}catch(_){}}}}finally{rendering=false;}}
 function stop(){playing=false;cancelAnimationFrame(raf);referenceVideo?.pause();if(play.textContent!=='Play 3D poses')play.textContent='Play 3D poses';}
 function setBusy(value){busy=value;controlsBox.disabled=value;orbit.enabled=!value;pathDrag?.setSuspended(value);keyButtons.querySelectorAll('button').forEach(b=>b.disabled=value);}
 function edit(fn){if(busy||!isCurrent())return false;stop();const candidate=structuredClone(rig());try{fn(candidate);validateRig3D(candidate);validateContactChains(bones,candidate.contacts||[]);candidate.pose=limitPose(candidate,candidate.pose);}catch(e){notify(e.message);refresh();return false;}change(()=>shot.rig3d=candidate,{redraw:false});refresh();panel.dispatchEvent(new CustomEvent('director-exposure',{bubbles:true}));return true;}
 function refresh(){if(disposed||!root)return;syncSilhouetteFromShot();syncSceneColorMsaa();finish.checked=!!shot.drawing?.over3d;const i=Number(joint.value)||0;angles.forEach((a,n)=>a.value=rig().pose[i][n]);rootFields.forEach((input,i)=>input.value=(rig().root||[0,0,0])[i]);faceSelect.onchange();const savedIndex=savedPoses.value;savedPoses.replaceChildren(...(rig().savedPoses||[]).map((p,i)=>new Option(p.name,String(i))));if(savedIndex)savedPoses.value=savedIndex;rotationMode.value=rig().rotationMode||'euler';loop.checked=!!rig().loop;eyeLink.checked=rig().eyesLinked!==false;limitEnabled.checked=!!rig().limits?.[i];limitFields.forEach((row,side)=>row.forEach((input,axis)=>{input.disabled=!limitEnabled.checked;input.value=rig().limits?.[i]?.[side][axis]??(side?180:-180);}));frame.max=scrub.max=shot.seconds*24-1;frame.value=scrub.value=Math.min(Number(frame.value),Number(frame.max));keyButtons.replaceChildren();for(const k of [...rig().keys].sort((a,b)=>a.frame-b.frame)){const b=button('3D frame '+k.frame,()=>seek(k.frame));b.disabled=k.frame>Number(frame.max)||busy;keyButtons.append(b);}syncCameraEase();craft?.refresh();channelsUI?.refresh();motionReview?.refresh();syncProps(root,bones,rig());performanceUI?.refresh();performanceScrub?.refresh();refreshLibraryProps?.();refreshPropPlacement?.();refreshFollow();refreshCameraSources?.();refreshActingSources?.();draw();}
 function seek(value){if(busy)return;stop();preview=true;followCamera=true;frame.value=scrub.value=Math.max(0,Math.min(Number(frame.max),Math.round(Number(value)||0)));const key=rig().keys.find(k=>k.frame===Number(frame.value));if(key)easing.value=key.easing;syncCameraEase();craft?.refresh();status.textContent='Preview frame '+frame.value+' · working pose unchanged. Use preview pose to edit this position.';performanceScrub?.refresh();draw();publishFrame();}
 const play=button('Play 3D poses',()=>{if(playing){stop();return;}if(!hasRigAnimation(rig())&&!(shot.drawing?.over3d&&hasDrawingAnimation(shot.drawing))){notify('Save drawing animation, body keys, facial keys, mouth cues, a contact hold, an eye track, a camera key or a prop attachment event first.');return;}playing=true;preview=true;followCamera=true;play.textContent='Stop 3D preview';if(referenceVideo.src&&!referenceVideo.hidden){try{referenceVideo.currentTime=referenceVideoTimeAtFrame(frame.value,referenceVideo.duration);}catch(_){}referenceVideo.pause();}const start=performance.now();function tick(now){if(!active()){stop();return;}frame.value=scrub.value=Math.min(shot.seconds*24-1,Math.floor((now-start)*24/1000));performanceScrub?.refresh();draw();publishFrame();if(now-start>=shot.seconds*1000){stop();return;}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);});
 function fit(){root.updateMatrixWorld(true);root.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox();});const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length()||2;camera.position.copy(center).add(new THREE.Vector3(size*.8,size*.35,size*1.7));camera.near=Math.max(.001,size/1000);camera.far=Math.max(100,size*100);camera.updateProjectionMatrix();orbit.target.copy(center);orbit.update();}
 let silhouette=false,referenceUrl='';const silhouetteMaterial=new THREE.MeshBasicMaterial({color:0x1c2430});
 const referenceVideo=document.createElement('video');referenceVideo.muted=true;referenceVideo.playsInline=true;referenceVideo.preload='auto';referenceVideo.hidden=true;referenceVideo.className='rig3d-reference-video';referenceVideo.setAttribute('aria-label','Reference video overlay');referenceVideo.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:3;opacity:.4';viewport.append(referenceVideo);
 const reviewPanel=el('details');reviewPanel.className='settings';reviewPanel.append(el('summary','Silhouette & reference review'),el('p','Silhouette flattens character meshes so the pose reads without color or texture. Props stay shaded. A reference video stays locked to the 3D playhead (24 fps) for timing comparison — scrub or play body keys and the reference follows. Choose Overlay (default), Side by side, or Stacked (vertical). In Stacked, Stacked pane order puts 3D or the reference on top. Untick Show reference video to hide the pane without clearing the assignment (Clear still removes it). Copy reference from another shot for continuity (all / layout only / file only). Attach, opacity, compare layout, stack order, hide, and silhouette are saved with the shot. Recording and GLB export use the normal shaded render, without the reference overlay or silhouette flat.'));controlsBox.append(reviewPanel);
 const silhouetteLabel=el('label','Show character silhouette'),silhouetteInput=el('input');silhouetteLabel.className='field';silhouetteInput.type='checkbox';silhouetteInput.setAttribute('aria-label','Show character silhouette');silhouetteInput.checked=!!shot.silhouette;silhouetteInput.onchange=()=>{const on=!!silhouetteInput.checked;if(!isCurrent())return;change(()=>{if(on)shot.silhouette=true;else delete shot.silhouette;},{redraw:false});setSilhouette(on);draw();};silhouetteLabel.append(silhouetteInput);reviewPanel.append(silhouetteLabel);
 const referenceStatus=el('p','No reference video attached.');referenceStatus.className='hint';
 function clearReferenceVideo(){if(referenceUrl){URL.revokeObjectURL(referenceUrl);referenceUrl='';}referenceVideo.pause();referenceVideo.removeAttribute('src');referenceVideo.load();referenceVideo.hidden=true;syncReferenceLayout();}
 function syncReferenceLayout(){const has=!!(shot.referenceVideo&&referenceVideo.getAttribute('src')&&!referenceVideo.hidden);const mode=has?referenceVideoCompareMode(shot.referenceVideo):REFERENCE_VIDEO_COMPARE_OVERLAY;const side=mode===REFERENCE_VIDEO_COMPARE_SIDE;const stack=mode===REFERENCE_VIDEO_COMPARE_STACK;const split=side||stack;viewport.classList.toggle('rig3d-viewport--side-by-side',!!(side&&has));viewport.classList.toggle('rig3d-viewport--stacked',!!(stack&&has));const refFirst=!!(stack&&has&&referenceVideoStackOrder(shot.referenceVideo)===REFERENCE_VIDEO_STACK_REF_FIRST);viewport.classList.toggle('rig3d-viewport--stack-ref-first',refFirst);referenceVideo.classList.toggle('rig3d-reference-video--side',!!(side&&has));referenceVideo.classList.toggle('rig3d-reference-video--stacked',!!(stack&&has));referenceVideo.setAttribute('aria-label',side&&has?'Reference video side by side':stack&&has?(refFirst?'Reference video stacked (reference on top)':'Reference video stacked (3D on top)'):'Reference video overlay');if(split&&has){referenceVideo.style.position='relative';referenceVideo.style.inset='auto';referenceVideo.style.width='100%';referenceVideo.style.height='100%';referenceVideo.style.zIndex='1';referenceVideo.style.opacity='1';}else{referenceVideo.style.position='absolute';referenceVideo.style.inset='0';referenceVideo.style.width='100%';referenceVideo.style.height='100%';referenceVideo.style.zIndex='3';referenceVideo.style.opacity=String(referenceOpacity?.value??.4);}if(referenceOpacityLabel)referenceOpacityLabel.hidden=!!(split&&has);if(referenceStackOrderLabel)referenceStackOrderLabel.hidden=!(stack&&has);}
 function syncReferenceChrome(){const name=shot.referenceVideo?(shot.referenceVideo.name||shot.referenceVideo.filename):'';const mode=referenceVideoCompareMode(shot.referenceVideo);const side=mode===REFERENCE_VIDEO_COMPARE_SIDE;const stack=mode===REFERENCE_VIDEO_COMPARE_STACK;const hidden=referenceVideoIsHidden(shot.referenceVideo);referenceStatus.textContent=name?(hidden?'Attached: '+name+' — hidden (assignment kept; Clear removes it).':side?'Attached: '+name+' — side by side, locked to the 3D playhead (24 fps).':stack?'Attached: '+name+' — stacked ('+(referenceVideoStackOrder(shot.referenceVideo)===REFERENCE_VIDEO_STACK_REF_FIRST?'reference on top':'3D on top')+'), locked to the 3D playhead (24 fps).':'Attached: '+name+' — overlay locked to the 3D playhead (24 fps).'):'No reference video attached.';if(referenceLabel.firstChild)referenceLabel.firstChild.textContent=name?'Replace reference video':'Attach reference video';detachReference.disabled=!name;if(referenceHideInput){referenceHideInput.disabled=!name;referenceHideInput.checked=!!(name&&!hidden);}referenceCompare.value=mode;referenceCompare.disabled=!name;if(referenceStackOrder){referenceStackOrder.value=referenceVideoStackOrder(shot.referenceVideo);referenceStackOrder.disabled=!(name&&stack&&!hidden);}const pct=Math.round(Number(referenceOpacity.value)*100);if(referenceOpacityLabel.firstChild)referenceOpacityLabel.firstChild.textContent='Reference opacity '+pct+'%';syncReferenceLayout();}
 function applyReferenceVideo(ref){clearReferenceVideo();if(!ref){referenceOpacity.value=.4;referenceVideo.style.opacity=.4;referenceCompare.value=REFERENCE_VIDEO_COMPARE_OVERLAY;syncReferenceChrome();return;}const opacity=Number.isFinite(ref.opacity)?ref.opacity:.4;referenceOpacity.value=opacity;referenceVideo.style.opacity=opacity;referenceCompare.value=referenceVideoCompareMode(ref);referenceVideo.src='/view?'+new URLSearchParams({filename:ref.name||ref.filename||'',subfolder:ref.subfolder||'',type:ref.type||'input'});referenceVideo.hidden=referenceVideoIsHidden(ref);try{referenceVideo.currentTime=referenceVideoTimeAtFrame(frame.value,referenceVideo.duration);}catch(_){}referenceVideo.pause();syncReferenceChrome();}
 const referenceLabel=el('label','Attach reference video'),referenceInput=el('input');referenceLabel.className='field';referenceInput.type='file';referenceInput.accept='video/*';referenceInput.setAttribute('aria-label','Attach reference video');referenceInput.onchange=async()=>{const chosen=referenceInput.files?.[0];referenceInput.value='';if(!chosen)return;referenceInput.disabled=true;notify('Uploading reference video…');try{const uploaded=await upload(chosen);if(!active())throw Error('Shot changed during reference upload. Attach it again.');const opacity=Number(referenceOpacity.value);const next={name:uploaded.name||uploaded.filename,subfolder:uploaded.subfolder||'',type:uploaded.type||'input'};if(opacity!==.4)next.opacity=opacity;if(referenceCompare.value===REFERENCE_VIDEO_COMPARE_SIDE)next.compare=REFERENCE_VIDEO_COMPARE_SIDE;else if(referenceCompare.value===REFERENCE_VIDEO_COMPARE_STACK)next.compare=REFERENCE_VIDEO_COMPARE_STACK;if(referenceCompare.value===REFERENCE_VIDEO_COMPARE_STACK&&referenceStackOrder&&referenceStackOrder.value===REFERENCE_VIDEO_STACK_REF_FIRST)next.stackOrder=REFERENCE_VIDEO_STACK_REF_FIRST;change(()=>{shot.referenceVideo=next;},{redraw:false});applyReferenceVideo(shot.referenceVideo);notify('Reference video saved with the shot.');}catch(e){notify(e.message);}finally{referenceInput.disabled=false;}};referenceLabel.append(referenceInput);reviewPanel.append(referenceStatus,referenceLabel);
 const referenceCompareLabel=el('label','Reference compare'),referenceCompare=el('select');referenceCompareLabel.className='field';referenceCompare.setAttribute('aria-label','Reference compare layout');referenceCompare.add(new Option('Overlay on viewport','overlay'));referenceCompare.add(new Option('Side by side','sideBySide'));referenceCompare.add(new Option('Stacked (vertical)','stacked'));referenceCompare.value=referenceVideoCompareMode(shot.referenceVideo);referenceCompare.disabled=!shot.referenceVideo;referenceCompare.onchange=()=>{if(!shot.referenceVideo||!isCurrent()){syncReferenceChrome();return;}const mode=referenceCompare.value===REFERENCE_VIDEO_COMPARE_SIDE?REFERENCE_VIDEO_COMPARE_SIDE:referenceCompare.value===REFERENCE_VIDEO_COMPARE_STACK?REFERENCE_VIDEO_COMPARE_STACK:REFERENCE_VIDEO_COMPARE_OVERLAY;change(()=>{applyReferenceVideoCompare(shot.referenceVideo,{compare:mode});},{redraw:false});syncReferenceChrome();draw();notify(mode===REFERENCE_VIDEO_COMPARE_SIDE?'Reference compare: side by side (saved with the shot).':mode===REFERENCE_VIDEO_COMPARE_STACK?'Reference compare: stacked (saved with the shot).':'Reference compare: overlay (saved with the shot).');};referenceCompareLabel.append(referenceCompare);reviewPanel.append(referenceCompareLabel);
 const referenceStackOrderLabel=el('label','Stacked pane order'),referenceStackOrder=el('select');referenceStackOrderLabel.className='field';referenceStackOrder.setAttribute('aria-label','Stacked pane order');referenceStackOrder.add(new Option('3D on top',REFERENCE_VIDEO_STACK_STAGE_FIRST));referenceStackOrder.add(new Option('Reference on top',REFERENCE_VIDEO_STACK_REF_FIRST));referenceStackOrder.value=referenceVideoStackOrder(shot.referenceVideo);referenceStackOrder.disabled=!(shot.referenceVideo&&referenceVideoCompareMode(shot.referenceVideo)===REFERENCE_VIDEO_COMPARE_STACK&&!referenceVideoIsHidden(shot.referenceVideo));referenceStackOrder.onchange=()=>{if(!shot.referenceVideo||!isCurrent()){syncReferenceChrome();return;}const order=referenceStackOrder.value===REFERENCE_VIDEO_STACK_REF_FIRST?REFERENCE_VIDEO_STACK_REF_FIRST:REFERENCE_VIDEO_STACK_STAGE_FIRST;change(()=>{applyReferenceVideoStackOrder(shot.referenceVideo,{stackOrder:order});},{redraw:false});syncReferenceChrome();draw();notify(order===REFERENCE_VIDEO_STACK_REF_FIRST?'Stacked panes: reference on top (saved with the shot).':'Stacked panes: 3D on top (saved with the shot).');};referenceStackOrderLabel.append(referenceStackOrder);referenceStackOrderLabel.hidden=!(shot.referenceVideo&&referenceVideoCompareMode(shot.referenceVideo)===REFERENCE_VIDEO_COMPARE_STACK&&!referenceVideoIsHidden(shot.referenceVideo));reviewPanel.append(referenceStackOrderLabel);
 const referenceHideLabel=el('label','Show reference video'),referenceHideInput=el('input');referenceHideLabel.className='field';referenceHideInput.type='checkbox';referenceHideInput.setAttribute('aria-label','Show reference video');referenceHideInput.checked=!!(shot.referenceVideo&&!referenceVideoIsHidden(shot.referenceVideo));referenceHideInput.disabled=!shot.referenceVideo;referenceHideInput.onchange=()=>{if(!shot.referenceVideo||!isCurrent()){syncReferenceChrome();return;}const show=!!referenceHideInput.checked;change(()=>{applyReferenceVideoHidden(shot.referenceVideo,{hidden:!show});},{redraw:false});referenceVideo.hidden=!show;syncReferenceChrome();draw();notify(show?'Reference video shown.':'Reference video hidden (assignment kept; Clear removes it).');};referenceHideLabel.append(referenceHideInput);reviewPanel.append(referenceHideLabel);
 const referenceOpacityLabel=el('label','Reference opacity 40%'),referenceOpacity=el('input');referenceOpacityLabel.className='field';referenceOpacity.type='range';referenceOpacity.min=0;referenceOpacity.max=1;referenceOpacity.step=.05;referenceOpacity.value=.4;referenceOpacity.setAttribute('aria-label','Reference video opacity');referenceOpacity.oninput=()=>{referenceVideo.style.opacity=referenceOpacity.value;syncReferenceChrome();};referenceOpacity.onchange=()=>{if(!shot.referenceVideo||!isCurrent())return;const opacity=Number(referenceOpacity.value);change(()=>{if(opacity===.4)delete shot.referenceVideo.opacity;else shot.referenceVideo.opacity=opacity;},{redraw:false});};referenceOpacityLabel.append(referenceOpacity);reviewPanel.append(referenceOpacityLabel);
 const detachReference=button('Clear reference video',()=>{if(!shot.referenceVideo){clearReferenceVideo();syncReferenceChrome();return;}change(()=>{delete shot.referenceVideo;},{redraw:false});clearReferenceVideo();syncReferenceChrome();notify('Reference video cleared.');});detachReference.disabled=!shot.referenceVideo;reviewPanel.append(detachReference);
 const referenceCopyHint=el('p','Copy reference video from another shot for continuity. Copy all replaces the file and layout (opacity, compare, hide, stacked pane order). Layout only keeps this shot\u2019s file. File only keeps this shot\u2019s layout (or defaults). Undo restores.');referenceCopyHint.className='hint';
 const referenceCopyBox=el('div');referenceCopyBox.className='drawing-toolbar reference-video-copy';referenceCopyBox.setAttribute('role','group');referenceCopyBox.setAttribute('aria-label','Copy reference video from another shot');
 const referenceCopyLabel=el('label','Copy reference from shot');referenceCopyLabel.className='field';
 const referenceCopySelect=el('select');referenceCopySelect.setAttribute('aria-label','Copy reference video from shot');referenceCopyLabel.append(referenceCopySelect);
 const referenceCopyModeLabel=el('label','Copy mode');referenceCopyModeLabel.className='field';
 const referenceCopyMode=el('select');referenceCopyMode.setAttribute('aria-label','Reference video copy mode');
 referenceCopyMode.add(new Option('Copy all (file & layout)','all'));
 referenceCopyMode.add(new Option('Layout only (keep local file)','layout'));
 referenceCopyMode.add(new Option('File only (keep local layout)','file'));
 referenceCopyMode.value='all';referenceCopyModeLabel.append(referenceCopyMode);
 function refreshReferenceSources(){
  const sources=(typeof getProject==='function'?listReferenceVideoSources(getProject(),shot.id):[]);
  const prev=referenceCopySelect.value;
  referenceCopySelect.replaceChildren(new Option(sources.length?'Choose a shot with a reference video\u2026':'No other shots with a reference video yet',''));
  for(const s of sources)referenceCopySelect.add(new Option(s.label,s.id));
  if(sources.some(s=>s.id===prev))referenceCopySelect.value=prev;
  referenceCopyBox.hidden=typeof getProject!=='function';
 }
 function runReferenceCopy(){
  if(busy||!isCurrent())return;
  if(typeof getProject!=='function'){notify('Open this shot from an episode to copy reference video between shots.');return;}
  const sourceId=referenceCopySelect.value;if(!sourceId){notify('Choose another shot that already has a reference video.');return;}
  const mode=referenceCopyMode.value||'all';
  const project=getProject();
  let sourceShot=null;for(const scene of project?.scenes||[]){sourceShot=scene.shots?.find(s=>s.id===sourceId);if(sourceShot)break;}
  if(!sourceShot||!shotHasReferenceVideo(sourceShot)){notify('Source shot no longer has a reference video.');refreshReferenceSources();return;}
  let summary=null;
  try{
   change(()=>{summary=copyReferenceVideoFromShot(shot,sourceShot,mode);},{redraw:false});
  }catch(e){notify(e.message);return;}
  applyReferenceVideo(shot.referenceVideo);refreshReferenceSources();
  const title=sourceShot.title||'Untitled shot';
  const bits=mode==='layout'
   ?('Copied reference layout from "'+title+'"; kept this shot\u2019s file')
   :mode==='file'
    ?('Copied reference file "'+(summary?.fileName||'')+'" from "'+title+'"; kept this shot\u2019s layout')
    :('Copied reference video "'+(summary?.fileName||'')+'" from "'+title+'"');
  notify(bits+'. Undo restores this shot\u2019s previous reference.');
 }
 referenceCopyBox.append(referenceCopyLabel,referenceCopyModeLabel,button('Copy reference video',runReferenceCopy));
 reviewPanel.append(referenceCopyHint,referenceCopyBox);refreshReferenceSources();
 applyReferenceVideo(shot.referenceVideo);
 function setSilhouette(on){if(!root||on===silhouette)return;root.traverse(o=>{if(!o.isMesh||o.userData.studioProp)return;if(on){if(!o.userData.studioReviewMaterial)o.userData.studioReviewMaterial=o.material;o.material=silhouetteMaterial;}else if(o.userData.studioReviewMaterial){o.material=o.userData.studioReviewMaterial;delete o.userData.studioReviewMaterial;}});silhouette=on;}
 function syncSilhouetteFromShot(){const want=!!shot.silhouette;silhouetteInput.checked=want;if(!root){silhouette=false;return;}if(want!==silhouette){setSilhouette(want);return;}if(!want)return;root.traverse(o=>{if(!o.isMesh||o.userData.studioProp)return;if(!o.userData.studioReviewMaterial){o.userData.studioReviewMaterial=o.material;o.material=silhouetteMaterial;}});}
 function mount(model,state){
  setSilhouette(false);
  clearLiveSceneColorDrawings();
  clearLiveConformDecalDrawings();
  const nextBones=jointsOf(model);try{validateContactChains(nextBones,state?.contacts||[]);}catch(e){disposeObject(model);throw e;}if(state&&nextBones.length!==state.names.length){disposeObject(model);throw Error('This GLB skeleton no longer matches the saved joint count. Import the intended rig again.');}
  if(helper){scene.remove(helper);helper.dispose();}if(root){scene.remove(root);disposeObject(root);}root=model;bones=nextBones;rest=bones.map(b=>b.quaternion.clone());baseRoot=bones[0].position.clone();morphs=faceControls(root);scene.add(root);
  empty={version:1,model:null,names:bones.map((b,i)=>(b.name||'Joint '+(i+1)).slice(0,200)),pose:bones.map(()=>[0,0,0]),keys:[]};
  actorGroups=skeletonGroups(bones);actorFilter.replaceChildren(new Option('All characters / skeletons',''),...actorGroups.map((g,i)=>new Option((i+1)+'. '+g.name+' · '+g.joints.length+' joints',String(g.root))));
  joint.replaceChildren(...(state||empty).names.map((name,i)=>new Option(name,String(i))));faceSelect.replaceChildren(...morphs.map((c,i)=>new Option(i+': '+c.name,String(i))));faceSelect.disabled=faceValue.disabled=!morphs.length;helper=new THREE.SkeletonHelper(root);helper.visible=false;scene.add(helper);fit();
  if(state?.camera){camera.position.fromArray(state.camera.position);orbit.target.fromArray(state.camera.target);orbit.update();}refresh();syncSilhouetteFromShot();draw();
 }
 joint.onchange=()=>{preview=dragEnabled.checked;refresh();};angles.forEach((input,axis)=>input.onchange=()=>{preview=false;edit(r=>r.pose[Number(joint.value)][axis]=Number(input.value));});
 frame.onchange=()=>seek(frame.value);scrub.oninput=()=>seek(scrub.value);
 performanceScrub=performanceScrubStrip({host:controlsBox,insertAfter:scrub,getRig:rig,getFrame:()=>Number(frame.value),lastFrame:()=>shot.seconds*24-1,seek,busy:()=>busy||!isCurrent(),getLanes:()=>shotPerformanceScrubLanes(shot),setLanes:next=>{if(busy||!isCurrent())return;change(()=>applyPerformanceScrubLanes(shot,next),{redraw:false});}});
 actions.append(button('Reset joint',()=>{preview=false;edit(r=>r.pose[Number(joint.value)]=[0,0,0]);}),button('Show working pose',()=>{stop();preview=false;draw();}),button('Use 3D preview pose',()=>{const f=Number(frame.value),pose=applyRigFrame(root,bones,rest,baseRoot,morphs,rig(),f).pose,travel=sampleChannel(rig(),f,'root',[0,0,0]),face=sampleChannel(rig(),f,'face',morphs.map(c=>c.base));preview=false;edit(r=>{r.pose=pose;r.root=travel;r.face=face;});}),button('Save 3D keyframe',()=>{const f=Number(frame.value);if(!rig().keys.some(k=>k.frame===f)&&rig().keys.length>=MAX_3D_KEYS){notify('Use at most 120 keys per 3D shot.');return;}edit(r=>{const previous=r.keys.find(k=>k.frame===f),curve=previous?.curve,kind=previous?.kind;r.keys=r.keys.filter(k=>k.frame!==f);r.keys.push({frame:f,easing:easing.value,...(kind?{kind}:{}),...(easing.value==='bezier'&&curve?{curve}:{}),pose:structuredClone(r.pose),root:[...(r.root||[0,0,0])],face:[...(r.face||morphs.map(c=>c.base))]});r.face??=morphs.map(c=>c.base);});notify('3D pose saved at frame '+f+'.');}),button('Remove 3D keyframe',()=>edit(r=>r.keys=r.keys.filter(k=>k.frame!==Number(frame.value)))),play);
 const cameraEaseLabel=el('label','Camera ease into next key');cameraEaseLabel.className='field';const cameraEase=el('select');cameraEase.setAttribute('aria-label','Camera ease into next key');for(const [v,t] of EASINGS)cameraEase.add(new Option(v==='hold'?'Hold until next key':t,v));cameraEase.value='hold';cameraEaseLabel.append(cameraEase);const cameraCurveBox=el('div');cameraCurveBox.className='drawing-toolbar';cameraCurveBox.dataset.toolStage='camera';const cameraHandles=['Handle 1 time','Handle 1 progress','Handle 2 time','Handle 2 progress'].map((name,i)=>{const wrap=el('label',name);wrap.className='field';const input=el('input');input.type='number';input.min=0;input.max=1;input.step=.05;input.value=DEFAULT_CURVE[i];input.setAttribute('aria-label','Camera '+name);wrap.append(input);cameraCurveBox.append(wrap);return input;});const cameraCurveGraph=el('canvas');cameraCurveGraph.width=300;cameraCurveGraph.height=150;cameraCurveGraph.setAttribute('aria-label','Camera timing curve preview');cameraCurveGraph.style.maxWidth='100%';cameraCurveBox.append(cameraCurveGraph);function cameraCurveValues(){return cameraHandles.map(input=>Number(input.value));}function drawCameraCurve(){const ctx=cameraCurveGraph.getContext('2d');ctx.clearRect(0,0,300,150);ctx.strokeStyle='#688090';ctx.strokeRect(10,10,280,130);ctx.strokeStyle='#24bba9';ctx.beginPath();const key={easing:cameraEase.value,curve:cameraCurveValues()};for(let i=0;i<=100;i++){const x=10+i*2.8,y=140-easeAt(key,i/100)*130;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();const bezier=cameraEase.value==='bezier';cameraHandles.forEach(input=>input.disabled=!bezier);}function syncCameraEase(){const key=(rig().cameraKeys||[]).find(item=>item.frame===Number(frame.value));cameraEase.value=key?.easing||'hold';cameraHandles.forEach((input,i)=>input.value=(key?.curve||DEFAULT_CURVE)[i]);drawCameraCurve();}function applyCameraEaseToKey(){const f=Number(frame.value);if(!(rig().cameraKeys||[]).some(item=>item.frame===f)){notify('Scrub to a camera key, or Key camera first, then set ease.');syncCameraEase();return;}edit(r=>{const key=r.cameraKeys.find(item=>item.frame===f);if(cameraEase.value==='hold'){delete key.easing;delete key.curve;}else{key.easing=cameraEase.value;if(cameraEase.value==='bezier'){const curve=cameraCurveValues();if(curve.length!==4||!curve.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Camera timing curve handles must be four numbers between 0 and 1.');key.curve=curve;}else delete key.curve;}});drawCameraCurve();}cameraEase.onchange=()=>applyCameraEaseToKey();cameraHandles.forEach(input=>input.oninput=()=>{drawCameraCurve();if(cameraEase.value!=='bezier')return;const f=Number(frame.value);if(!(rig().cameraKeys||[]).some(item=>item.frame===f))return;edit(r=>{const key=r.cameraKeys.find(item=>item.frame===f);if(key?.easing!=='bezier')return;const curve=cameraCurveValues();if(curve.length!==4||!curve.every(v=>Number.isFinite(v)&&v>=0&&v<=1))return;key.curve=curve;});});
 actions.append(button('Frame character',()=>{fit();followCamera=false;draw();}),button('Save camera view',()=>edit(r=>r.camera={position:camera.position.toArray(),target:orbit.target.toArray()})),button('Key camera',()=>{followCamera=true;const f=Number(frame.value),ease=cameraEase.value;if(!edit(r=>{const previous=(r.cameraKeys||[]).find(key=>key.frame===f),next=(r.cameraKeys||[]).filter(key=>key.frame!==f);if(!previous&&next.length>=MAX_3D_KEYS)throw Error('Use at most 120 camera keys.');const key={frame:f,position:camera.position.toArray(),target:orbit.target.toArray()};if(ease!=='hold'){key.easing=ease;if(ease==='bezier'){const curve=cameraCurveValues();if(curve.length!==4||!curve.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Camera timing curve handles must be four numbers between 0 and 1.');key.curve=curve;}}next.push(key);r.cameraKeys=next.sort((a,b)=>a.frame-b.frame);}))return;notify(ease==='hold'?'Camera key holds from frame '+f+' until the next camera key. Undo removes this key.':ease==='bezier'?'Camera key at frame '+f+' uses bezier with the curve handles into the next camera key. Undo removes this key.':'Camera key at frame '+f+' uses '+ease+' into the next camera key. Undo removes this key.');}),button('Remove camera key',()=>edit(r=>{r.cameraKeys=(r.cameraKeys||[]).filter(key=>key.frame!==Number(frame.value));if(!r.cameraKeys.length)delete r.cameraKeys;})),button('Show / hide skeleton',()=>{helper.visible=!helper.visible;draw();}),button('Save 3D animation as shot clip',record),button('Download animated GLB',downloadGLB));
 cameraReadout=el('p','Camera has no keys.');cameraReadout.setAttribute('role','status');const cameraHint=el('p','Key camera stores this position and orbit target on the current frame. Camera ease into next key chooses hold (default, omit on save) or a curve into the next camera key. Choose Custom timing curve to edit the four bezier handles and preview the graph; body craft uses the same timing math. Change ease or handles on an existing key at the playhead. With no camera keys, the saved view stays the default. Orbit to frame a new key; scrubbing follows holds or eases. Camera keys export as a camera node. The single saved view does not.');cameraReadout.dataset.toolStage=cameraEaseLabel.dataset.toolStage=cameraCurveBox.dataset.toolStage=cameraHint.dataset.toolStage='camera';controlsBox.append(cameraReadout,cameraEaseLabel,cameraCurveBox,cameraHint);drawCameraCurve();
 controlsBox.append(cameraReadout,cameraEaseLabel,cameraCurveBox,cameraHint);drawCameraCurve();
 const actingCopyBox=el('div');actingCopyBox.className='drawing-toolbar';actingCopyBox.dataset.toolStage='acting';
 const actingCopyHint=el('p','Copy acting from another shot. All acting replaces body pose/keys, contacts, travel channels, and face/features/gaze on this shot. Body only and Face only keep the other side. Camera, lip-sync, and props stay put. Stretch to shot length remaps key and hold frames from the source duration onto this shot (24 fps); Keep absolute times leaves frame numbers unchanged. Undo restores.');actingCopyHint.className='hint';actingCopyHint.dataset.toolStage='acting';
 const actingCopyLabel=el('label','Copy acting from shot');actingCopyLabel.className='field';actingCopyLabel.dataset.toolStage='acting';
 const actingCopySelect=el('select');actingCopySelect.setAttribute('aria-label','Copy acting from shot');actingCopyLabel.append(actingCopySelect);
 const actingCopyModeLabel=el('label','Copy mode');actingCopyModeLabel.className='field';actingCopyModeLabel.dataset.toolStage='acting';
 const actingCopyMode=el('select');actingCopyMode.setAttribute('aria-label','Acting copy mode');
 actingCopyMode.add(new Option('All acting (body & face)','all'));
 actingCopyMode.add(new Option('Body only (pose, contacts, travel)','body'));
 actingCopyMode.add(new Option('Face only (keys, features, gaze)','face'));
 actingCopyMode.value='all';actingCopyModeLabel.append(actingCopyMode);
 const actingCopyTimingLabel=el('label','Key timing');actingCopyTimingLabel.className='field';actingCopyTimingLabel.dataset.toolStage='acting';
 const actingCopyTiming=el('select');actingCopyTiming.setAttribute('aria-label','Acting key timing when copying');
 actingCopyTiming.add(new Option('Stretch to shot length','stretch'));
 actingCopyTiming.add(new Option('Keep absolute times','absolute'));
 actingCopyTiming.value='stretch';actingCopyTimingLabel.append(actingCopyTiming);
 function refreshActingSources(){
  const sources=(typeof getProject==='function'?listActingSources(getProject(),shot.id):[]);
  const prev=actingCopySelect.value;
  actingCopySelect.replaceChildren(new Option(sources.length?'Choose a shot with acting…':'No other shots with acting yet',''));
  for(const src of sources)actingCopySelect.add(new Option(src.label,src.id));
  if(sources.some(src=>src.id===prev))actingCopySelect.value=prev;
  actingCopyBox.hidden=typeof getProject!=='function';
 }
 function runActingCopy(){
  if(busy||!isCurrent())return;
  if(typeof getProject!=='function'){notify('Open this shot from an episode to copy acting between shots.');return;}
  const sourceId=actingCopySelect.value;if(!sourceId){notify('Choose another shot that already has body or face acting.');return;}
  const mode=actingCopyMode.value||'all';
  const project=getProject();
  let sourceShot=null;for(const scene of project?.scenes||[]){sourceShot=scene.shots?.find(item=>item.id===sourceId);if(sourceShot)break;}
  if(!sourceShot?.rig3d){notify('Source shot no longer has a 3D rig.');refreshActingSources();return;}
  let summary=null;
  const timeMode=actingCopyTiming.value||'stretch';
  const copyOpts={timeMode,sourceSeconds:Number(sourceShot.seconds),targetSeconds:Number(shot.seconds)};
  if(!edit(r=>{summary=copyActingFromShot(r,sourceShot.rig3d,mode,copyOpts);}))return;
  preview=true;seek(Number(frame.value));
  refreshActingSources();
  const title=sourceShot.title||'Untitled shot';
  const timingNote=summary.stretched?' (stretched to this shot length)':(summary.timeMode==='absolute'?' (absolute key times)':'');
  const bits=[];
  if(mode!=='face'){
   if(summary.bodyKeyCount)bits.push(summary.bodyKeyCount+' body key'+(summary.bodyKeyCount===1?'':'s'));
   if(summary.contactCount)bits.push(summary.contactCount+' contact'+(summary.contactCount===1?'':'s'));
   if(summary.bodyChannelCount)bits.push(summary.bodyChannelCount+' body channel'+(summary.bodyChannelCount===1?'':'s'));
  }
  if(mode!=='body'){
   if(summary.faceKeyCount)bits.push(summary.faceKeyCount+' face key'+(summary.faceKeyCount===1?'':'s'));
   if(summary.featureKeyCount)bits.push(summary.featureKeyCount+' feature key'+(summary.featureKeyCount===1?'':'s'));
   if(summary.eyeTrackCount)bits.push(summary.eyeTrackCount+' eye track'+(summary.eyeTrackCount===1?'':'s'));
   if(summary.faceChannelCount)bits.push(summary.faceChannelCount+' face channel'+(summary.faceChannelCount===1?'':'s'));
  }
  const what=bits.length?bits.join(', '):(mode==='body'?'body acting':mode==='face'?'face acting':'acting');
  notify('Copied '+what+' from "'+title+'"'+timingNote+'. Undo restores this shot\u2019s previous acting.');
 }
 actingCopyBox.append(actingCopyLabel,actingCopyModeLabel,actingCopyTimingLabel,button('Copy acting',runActingCopy));
 controlsBox.append(actingCopyBox,actingCopyHint);refreshActingSources();
 const cameraCopyBox=el('div');cameraCopyBox.className='drawing-toolbar';cameraCopyBox.dataset.toolStage='camera';
 const cameraCopyHint=el('p','Copy camera from another shot. Copy all replaces saved view and keys. Keys only keeps this shot\u2019s saved view. Framing only keeps this shot\u2019s camera keys. Stretch to shot length remaps key frames from the source duration onto this shot (24 fps); Keep absolute times leaves frame numbers unchanged. Undo restores.');cameraCopyHint.className='hint';cameraCopyHint.dataset.toolStage='camera';
 const cameraCopyLabel=el('label','Copy camera from shot');cameraCopyLabel.className='field';cameraCopyLabel.dataset.toolStage='camera';
 const cameraCopySelect=el('select');cameraCopySelect.setAttribute('aria-label','Copy camera from shot');cameraCopyLabel.append(cameraCopySelect);
 const cameraCopyModeLabel=el('label','Copy mode');cameraCopyModeLabel.className='field';cameraCopyModeLabel.dataset.toolStage='camera';
 const cameraCopyMode=el('select');cameraCopyMode.setAttribute('aria-label','Camera copy mode');
 cameraCopyMode.add(new Option('Copy all (framing & keys)','all'));
 cameraCopyMode.add(new Option('Keys only (keep local framing)','keys'));
 cameraCopyMode.add(new Option('Framing only (keep local keys)','framing'));
 cameraCopyMode.value='all';cameraCopyModeLabel.append(cameraCopyMode);
 const cameraCopyTimingLabel=el('label','Key timing');cameraCopyTimingLabel.className='field';cameraCopyTimingLabel.dataset.toolStage='camera';
 const cameraCopyTiming=el('select');cameraCopyTiming.setAttribute('aria-label','Camera key timing when copying');
 cameraCopyTiming.add(new Option('Stretch to shot length','stretch'));
 cameraCopyTiming.add(new Option('Keep absolute times','absolute'));
 cameraCopyTiming.value='stretch';cameraCopyTimingLabel.append(cameraCopyTiming);
 function syncCameraCopyTiming(){
  const mode=cameraCopyMode.value||'all';
  const needsTiming=mode==='all'||mode==='keys';
  cameraCopyTiming.disabled=!needsTiming;
  cameraCopyTimingLabel.hidden=!needsTiming;
 }
 cameraCopyMode.addEventListener('change',syncCameraCopyTiming);syncCameraCopyTiming();
 function refreshCameraSources(){
  const sources=(typeof getProject==='function'?listCameraSources(getProject(),shot.id):[]);
  const prev=cameraCopySelect.value;
  cameraCopySelect.replaceChildren(new Option(sources.length?'Choose a shot with camera…':'No other shots with camera yet',''));
  for(const s of sources)cameraCopySelect.add(new Option(s.label,s.id));
  if(sources.some(s=>s.id===prev))cameraCopySelect.value=prev;
  cameraCopyBox.hidden=typeof getProject!=='function';
 }
 function runCameraCopy(){
  if(busy||!isCurrent())return;
  if(typeof getProject!=='function'){notify('Open this shot from an episode to copy camera between shots.');return;}
  const sourceId=cameraCopySelect.value;if(!sourceId){notify('Choose another shot that already has a saved camera view or camera keys.');return;}
  const mode=cameraCopyMode.value||'all';
  const project=getProject();
  let sourceShot=null;for(const scene of project?.scenes||[]){sourceShot=scene.shots?.find(s=>s.id===sourceId);if(sourceShot)break;}
  if(!sourceShot?.rig3d){notify('Source shot no longer has a 3D rig.');refreshCameraSources();return;}
    let summary=null;
  const timeMode=(mode==='framing')?'absolute':(cameraCopyTiming.value||'stretch');
  const copyOpts={timeMode,sourceSeconds:Number(sourceShot.seconds),targetSeconds:Number(shot.seconds)};
  if(!edit(r=>{summary=copyCameraFromShot(r,sourceShot.rig3d,mode,copyOpts);}))return;
  followCamera=true;preview=true;seek(Number(frame.value));
  refreshCameraSources();
  const title=sourceShot.title||'Untitled shot';
  const timingNote=mode==='framing'?'':(summary.stretched?' (stretched to this shot length)':(summary.timeMode==='absolute'?' (absolute key times)':''));
  const bits=mode==='keys'
   ?('Copied '+summary.keyCount+' camera key'+(summary.keyCount===1?'':'s')+' from "'+title+'"'+timingNote+'; kept this shot’s saved view')
   :mode==='framing'
    ?('Copied saved camera view from "'+title+'"; kept this shot’s camera keys')
    :('Copied camera'+(summary.savedView?' saved view':'')+(summary.keyCount?((summary.savedView?' and ':' ')+summary.keyCount+' key'+(summary.keyCount===1?'':'s')):'')+' from "'+title+'"'+timingNote);
  notify(bits+'. Undo restores this shot’s previous camera.');
 }
 cameraCopyBox.append(cameraCopyLabel,cameraCopyModeLabel,cameraCopyTimingLabel,button('Copy camera',runCameraCopy));
 controlsBox.append(cameraCopyBox,cameraCopyHint);refreshCameraSources();
 const followPanel=el('details');followPanel.className='settings';followPanel.append(el('summary','Drawing follows a joint'),el('p','Parent one drawing layer to the selected joint. Preview, recording, and Download animated GLB use the same depth-tested card on that bone. Billboard is the screen slide. Conform bends with nearby bones. Decal sticks to the surface. Screen space stays the default. Hidden layers, onion skins and correction marks stay out of the recording. Layers left in screen space export as camera-facing overlay planes on the Shot camera instead.'));
 const followLabel=el('label','Drawing layer');followLabel.className='field';followSelect=el('select');followSelect.setAttribute('aria-label','Drawing layer');followLabel.append(followSelect);followReadout=el('p','No visible drawing is parented to a joint.');followReadout.setAttribute('role','status');parentFollowButton=button('Parent layer to selected joint',()=>parentDrawing(false));detachFollowButton=button('Detach drawing from joint',()=>parentDrawing(true));followPanel.append(followLabel,followReadout,parentFollowButton,detachFollowButton);controlsBox.append(followPanel);
 followSelect.onchange=()=>syncDetachFollowButton();syncDetachFollowButton();
 function syncDetachFollowButton(){const layer=shot.drawing?.layers?.find(item=>item.id===followSelect?.value)||null;if(detachFollowButton){const gate=drawingDetachFromJointGate(layer);detachFollowButton.disabled=!gate.ok;detachFollowButton.title=gate.reason||'';}if(parentFollowButton){const index=Number(joint?.value),bone=bones?.[index],name=bone?.name||rig()?.names?.[index],point=bone&&name?boneScreen(bone):null;const gate=drawingParentToJointGate(layer,point?name:'');parentFollowButton.disabled=!gate.ok;parentFollowButton.title=gate.reason||'';}}
 function refreshFollow(){if(!followSelect)return;const current=followSelect.value;followSelect.replaceChildren(new Option('Choose a drawing layer',''));for(const layer of shot.drawing?.layers||[])followSelect.add(new Option(layer.name+(layer.joint?' · '+layer.joint:''),layer.id));if([...followSelect.options].some(option=>option.value===current))followSelect.value=current;syncDetachFollowButton();}
 function parentDrawing(detach){if(busy||!isCurrent()||!root)return;const layer=shot.drawing?.layers?.find(item=>item.id===followSelect.value);if(!layer){notify('Choose a drawing layer. Paint it under Draw storyboard first.');syncDetachFollowButton();return;}if(detach){const gate=drawingDetachFromJointGate(layer);if(!gate.ok){notify(gate.reason||'Already in screen space.');syncDetachFollowButton();return;}stop();change(()=>{delete layer.joint;delete layer.jointAnchor;delete layer.placement;},{redraw:false});panel.dispatchEvent(new CustomEvent('director-drawing-refresh',{bubbles:true}));refreshFollow();draw();notify(layer.name+' stays in screen space. Undo can parent it again.');return;}const index=Number(joint.value),bone=bones[index],name=bone?.name||rig().names[index],point=boneScreen(bone);const parentGate=drawingParentToJointGate(layer,name&&point?name:'');if(!parentGate.ok){notify(parentGate.reason||'Choose a joint that is in this view.');syncDetachFollowButton();return;}stop();change(()=>{shot.drawing.over3d=true;layer.joint=name;layer.jointAnchor=point;},{redraw:false});finish.checked=true;panel.dispatchEvent(new CustomEvent('director-drawing-refresh',{bubbles:true}));refreshFollow();draw();notify(layer.name+' follows '+name+'. Visible strokes move with that joint in preview and recording. Download animated GLB embeds this layer as a mesh-aware card on that joint (joint bounds + depth; set GLB card style to Conform or Decal for live 3D bend in this viewport and GLB), with stepped cel holds when the layer has multi-frame ink. Undo restores the previous drawing.');}
 actions.append(button('Use starter character',()=>{if(!isCurrent())return;stop();preview=false;change(()=>delete shot.rig3d,{redraw:false});mount(starterCharacter());notify('Starter character loaded. Undo restores the previous rig.');}));
 actions.append(button('Use starter with articulated fingers',async()=>{
  if(busy||!isCurrent())return;stop();setBusy(true);const before=snapshot();let generated=starterCharacter({fingers:true}),loaded;
  try{const joints=jointsOf(generated),state={version:1,model:null,names:joints.map(b=>b.name),pose:joints.map(()=>[0,0,0]),keys:[]};
   const data=await exportRigGLB(generated,joints,joints.map(b=>b.quaternion.clone()),state,1,joints[0].position.clone(),[]);loaded=await readRigGLB(data);state.names=jointsOf(loaded).map(b=>b.name);
   if(!active()||snapshot()!==before)throw Error('Shot changed. Original rig kept.');state.model=await upload(new File([data],'finger-starter-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||snapshot()!==before)throw Error('Shot changed while saving. Original rig kept.');validateRig3D(state);change(()=>shot.rig3d=state,{redraw:false});preview=false;mount(loaded,state);loaded=null;notify('Finger-capable starter saved. Pose its finger joints and save hand poses. Undo restores the previous rig.');
  }catch(error){notify(error.message);}finally{disposeObject(generated);if(loaded)disposeObject(loaded);if(!disposed)setBusy(false);}
 }));
 actions.append(button('Upgrade starter fingers · keep animation',async()=>{
  if(busy||!isCurrent())return;stop();setBusy(true);const before=snapshot();let result;
  try{status.textContent='Upgrading starter hands and preserving animation…';result=await upgradeStarterFingers({root,rig:rig(),rest,baseRoot,baseFaces:morphs.map(c=>c.base)});
   if(!active()||snapshot()!==before)throw Error('Shot changed. Original rig kept.');result.rig.model=await upload(new File([result.data],'upgraded-starter-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||snapshot()!==before)throw Error('Shot changed while saving. Original rig kept.');validateRig3D(result.rig);change(()=>shot.rig3d=result.rig,{redraw:false});preview=false;mount(result.root,result.rig);result.root=null;notify('Starter fingers added; animation, eyes, props and contacts preserved. Pose the fingers around your prop. Undo restores the previous rig.');
  }catch(error){notify(error.message);}finally{if(result?.root)disposeObject(result.root);if(!disposed)setBusy(false);}
 }));
 file.onchange=async()=>{
  const selected=file.files[0];if(!selected||busy)return;stop();setBusy(true);const before=snapshot();let model;
  try{if(selected.size>50*1024*1024)throw Error('Use a GLB under 50 MB.');model=await readRigGLB(await selected.arrayBuffer());const names=jointsOf(model).map((b,i)=>(b.name||'Joint '+(i+1)).slice(0,200));const uploaded=await upload(new File([selected],'rig-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||snapshot()!==before)throw Error('The shot changed during import. Import again into the intended shot.');
   const state={version:1,model:uploaded,names,pose:names.map(()=>[0,0,0]),keys:[]};validateRig3D(state);change(()=>shot.rig3d=state,{redraw:false});preview=false;mount(model,state);model=null;notify('Rig imported. Original animation clips are not loaded; create shot poses here.');
  }catch(e){notify(e.message);}finally{if(model)disposeObject(model);if(!disposed)setBusy(false);file.value='';}
 };
 async function record(){
  if(busy)return;if(!hasRigAnimation(rig())&&!(shot.drawing?.over3d&&hasDrawingAnimation(shot.drawing))){notify('Save drawing animation, body keys, facial keys, mouth cues, a contact hold, an eye track, a camera key or a prop attachment event first.');return;}stop();followCamera=true;setSilhouette(false);setBusy(true);abort=new AbortController();cancel.hidden=false;progress.hidden=false;progress.value=0;const before=snapshot(),savedHelper=helper.visible;helper.visible=false;motionReview?.setVisible(false);let result;
  try{result=await recordCanvas({canvas:shot.drawing?.over3d?composite:renderer.domElement,seconds:shot.seconds,signal:abort.signal,active:()=>active()&&snapshot()===before,draw:f=>{const sampled=applyRigFrame(root,bones,rest,baseRoot,morphs,rig(),f,{camera,orbit});if(sampled.warnings.length)throw Error('Recording stopped at frame '+f+': '+sampled.warnings.join('; '));scene.updateMatrixWorld(true);void syncLiveSceneColorDrawings(f);renderWithDrawingBlendSceneColor(renderer,scene,camera,sceneColorPass,normalizeDrawingBlendSceneColorMsaa(shot.drawing?.sceneColorMsaa));finishFrame(f);},onProgress:(elapsed,total)=>{progress.value=elapsed/total;status.textContent='Recording 3D '+elapsed.toFixed(1)+' / '+total+' seconds to disk. Keep this window visible.';}});status.textContent='Saving 3D clip…';const uploaded=await upload(result.file,{signal:abort.signal,onProgress:p=>status.textContent="Uploading 3D clip: "+Math.round(p*100)+"%"});if(abort.signal.aborted||!active()||snapshot()!==before)throw Error('3D clip was not attached because the shot changed or recording was cancelled.');change(()=>shot.media=uploaded);notify('3D animation saved as the shot clip. Shot audio is kept.'+pictureNote(shot));}
  catch(e){notify(e.message);}finally{await result?.release().catch(e=>notify('Temporary clip cleanup failed: '+e.message));abort=null;cancel.hidden=true;progress.hidden=true;if(!disposed){helper.visible=savedHelper;motionReview?.setVisible(true);setBusy(false);draw();}}
 }
 async function prepareParentDrawings(board,_playhead,seconds){
  if(!board?.layers?.some(layer=>layer.joint&&layer.visible!==false))return [];
  const lastFrame=Math.max(0,Math.round(Number(seconds)||1)*24-1);
  const playhead=Math.max(0,Math.min(lastFrame,Math.round(Number(_playhead)||0)));
  function inkHash(pixels){
   let h=2166136261>>>0;
   for(let i=3;i<pixels.length;i+=64){h^=pixels[i];h=Math.imul(h,16777619);}
   for(let i=0;i<pixels.length;i+=256){h^=pixels[i];h=Math.imul(h,16777619);h^=pixels[i+1];h=Math.imul(h,16777619);h^=pixels[i+2];h=Math.imul(h,16777619);}
   return h>>>0;
  }
  function sampleFrames(layer){
   return parentDrawingSampleFrames(board,layer,lastFrame,MAX_PARENT_DRAWING_CELS);
  }
  async function paintAt(layerId,frame){
   const posed=sampleMotion(board,frame);
   const layer=posed.layers.find(item=>item.id===layerId);
   if(!layer?.visible||!layer.joint||!layer.jointAnchor)return null;
   const solo={version:1,layers:[{...layer,visible:true,opacity:1,joint:undefined,jointAnchor:undefined,blend:undefined}]};
   const canvas=document.createElement('canvas'),scratch=document.createElement('canvas');
   paintDrawing(canvas,solo,null,scratch,true);
   const pixels=canvas.getContext('2d').getImageData(0,0,BOARD_WIDTH,BOARD_HEIGHT).data;
   let ink=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8){ink=true;break;}
   if(!ink)return {ink:false,joint:layer.joint,jointAnchor:layer.jointAnchor,opacity:layer.opacity??1,blend:layer.blend||'source-over',name:layer.name,hash:0};
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;
   return {ink:true,texture,hash:inkHash(pixels),joint:layer.joint,jointAnchor:layer.jointAnchor,opacity:layer.opacity??1,blend:layer.blend||'source-over',name:layer.name};
  }
  const out=[];
  for(const base of board.layers){
   if(!base.joint||base.visible===false)continue;
   const frames=sampleFrames(base),holds=[];
   let meta=null;
   for(const f of frames){
    if(holds.length>=MAX_PARENT_DRAWING_CELS)break;
    const painted=await paintAt(base.id,f);
    if(!painted)continue;
    meta={joint:painted.joint||base.joint,jointAnchor:painted.jointAnchor||base.jointAnchor,opacity:painted.opacity,blend:painted.blend||base.blend||'source-over',name:painted.name||base.name,placement:base.placement};
    if(!painted.ink){
     if(holds.length&&holds[holds.length-1].texture==null)continue;
     holds.push({frame:f,texture:null,hash:0});
     continue;
    }
    if(holds.length&&holds[holds.length-1].hash===painted.hash)continue;
    holds.push({frame:f,texture:painted.texture,hash:painted.hash});
    if(holds.length%8===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(!meta||!holds.some(h=>h.texture)){for(const h of holds)h.texture?.dispose();continue;}
   const playHold=[...holds].filter(h=>h.frame<=playhead).at(-1)||holds[0];
   const primary=playHold?.texture||holds.find(h=>h.texture).texture;
   const multi=holds.length>1;
   if(!multi){
    for(const h of holds)if(h.texture&&h.texture!==primary)h.texture.dispose();
    out.push({id:base.id,name:meta.name,joint:meta.joint,jointAnchor:meta.jointAnchor,opacity:meta.opacity,blend:meta.blend,placement:meta.placement,width:BOARD_WIDTH,height:BOARD_HEIGHT,texture:primary,displayFrame:playhead});
   }else{
    out.push({id:base.id,name:meta.name,joint:meta.joint,jointAnchor:meta.jointAnchor,opacity:meta.opacity,blend:meta.blend,placement:meta.placement,width:BOARD_WIDTH,height:BOARD_HEIGHT,texture:primary,displayFrame:playhead,cels:holds.map(h=>({frame:h.frame,texture:h.texture}))});
   }
  }
  return out;
 }
 async function prepareScreenDrawings(board,_playhead,seconds){
  if(!board?.over3d)return [];
  if(!board?.layers?.some(layer=>!layer.joint&&layer.visible!==false))return [];
  const lastFrame=Math.max(0,Math.round(Number(seconds)||1)*24-1);
  const playhead=Math.max(0,Math.min(lastFrame,Math.round(Number(_playhead)||0)));
  function inkHash(pixels){
   let h=2166136261>>>0;
   for(let i=3;i<pixels.length;i+=64){h^=pixels[i];h=Math.imul(h,16777619);}
   for(let i=0;i<pixels.length;i+=256){h^=pixels[i];h=Math.imul(h,16777619);h^=pixels[i+1];h=Math.imul(h,16777619);h^=pixels[i+2];h=Math.imul(h,16777619);}
   return h>>>0;
  }
  function sampleFrames(layer){
   return parentDrawingSampleFrames(board,layer,lastFrame,MAX_SCREEN_DRAWING_CELS);
  }
  async function paintAt(layerId,frame){
   const posed=sampleMotion(board,frame);
   const layer=posed.layers.find(item=>item.id===layerId);
   if(!layer?.visible||layer.joint)return null;
   const solo={version:1,layers:[{...layer,visible:true,opacity:1,joint:undefined,jointAnchor:undefined,blend:undefined}]};
   const canvas=document.createElement('canvas'),scratch=document.createElement('canvas');
   paintDrawing(canvas,solo,null,scratch,true);
   const pixels=canvas.getContext('2d').getImageData(0,0,BOARD_WIDTH,BOARD_HEIGHT).data;
   let ink=false;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8){ink=true;break;}
   if(!ink)return {ink:false,opacity:layer.opacity??1,blend:layer.blend||'source-over',name:layer.name,hash:0};
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;
   return {ink:true,texture,hash:inkHash(pixels),opacity:layer.opacity??1,blend:layer.blend||'source-over',name:layer.name};
  }
  const out=[];
  for(const base of board.layers){
   if(base.joint||base.visible===false)continue;
   const frames=sampleFrames(base),holds=[];
   let meta=null;
   for(const f of frames){
    if(holds.length>=MAX_SCREEN_DRAWING_CELS)break;
    const painted=await paintAt(base.id,f);
    if(!painted)continue;
    meta={opacity:painted.opacity,blend:painted.blend||base.blend||'source-over',name:painted.name||base.name};
    if(!painted.ink){
     if(holds.length&&holds[holds.length-1].texture==null)continue;
     holds.push({frame:f,texture:null,hash:0});
     continue;
    }
    if(holds.length&&holds[holds.length-1].hash===painted.hash)continue;
    holds.push({frame:f,texture:painted.texture,hash:painted.hash});
    if(holds.length%8===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(!meta||!holds.some(h=>h.texture)){for(const h of holds)h.texture?.dispose();continue;}
   const playHold=[...holds].filter(h=>h.frame<=playhead).at(-1)||holds[0];
   const primary=playHold?.texture||holds.find(h=>h.texture).texture;
   const multi=holds.length>1;
   if(!multi){
    for(const h of holds)if(h.texture&&h.texture!==primary)h.texture.dispose();
    out.push({id:base.id,name:meta.name,opacity:meta.opacity,blend:meta.blend,width:BOARD_WIDTH,height:BOARD_HEIGHT,texture:primary,displayFrame:playhead});
   }else{
    out.push({id:base.id,name:meta.name,opacity:meta.opacity,blend:meta.blend,width:BOARD_WIDTH,height:BOARD_HEIGHT,texture:primary,displayFrame:playhead,cels:holds.map(h=>({frame:h.frame,texture:h.texture}))});
   }
  }
  return out;
 }
 async function downloadGLB(){
  if(busy)return;stop();setBusy(true);const before=snapshot();status.textContent='Preparing animated GLB…';
  let parentDrawings=[],screenDrawings=[];
  try{
   parentDrawings=await prepareParentDrawings(shot.drawing,Number(frame.value),shot.seconds);
   screenDrawings=await prepareScreenDrawings(shot.drawing,Number(frame.value),shot.seconds);
   const data=await exportRigGLB(root,bones,rest,rig(),shot.seconds,baseRoot,morphs,{parentDrawings,screenDrawings,camera});
   if(!active()||before!==snapshot())throw Error('Shot changed during export. Export again.');
   const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'})),a=el('a');a.href=url;a.download='director-character.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   const notes=[];if(rig().cameraKeys?.length)notes.push('Camera keys are included.');
   if(parentDrawings.length){
    const celCount=parentDrawings.reduce((n,item)=>n+(item.cels?.length||1),0);
    let note=parentDrawings.length+' parent drawing'+(parentDrawings.length===1?'':'s')+' embedded on joint'+(parentDrawings.length===1?'':'s')+' (mesh-aware cards; flat, Conform skinned, or Decal projected';
    if(celCount>parentDrawings.length)note+=', '+celCount+' stepped cel texture holds (walk/inbetween samples collapsed to '+MAX_PARENT_DRAWING_CELS+')';
    notes.push(note+').');
   }
   if(screenDrawings.length){
    const celCount=screenDrawings.reduce((n,item)=>n+(item.cels?.length||1),0);
    let note=screenDrawings.length+' screen-space drawing'+(screenDrawings.length===1?'':'s')+' embedded as camera-facing overlay'+(screenDrawings.length===1?'':'s')+' on the Shot camera';
    if(celCount>screenDrawings.length)note+=', '+celCount+' stepped cel texture holds (walk/inbetween samples collapsed to '+MAX_SCREEN_DRAWING_CELS+')';
    notes.push(note+'.');
   }else if(shot.drawing?.over3d&&!parentDrawings.length)notes.push('No visible drawing ink exported; record a clip for empty or guide-only layers.');
   notify('GLB exported with its skeleton, skin weights and shot animation.'+(notes.length?' '+notes.join(' '):''));
  }catch(e){notify(e.message);}
  finally{const textures=new Set();for(const item of [...parentDrawings,...screenDrawings]){if(item.texture)textures.add(item.texture);for(const cel of item.cels||[])if(cel.texture)textures.add(cel.texture);}for(const texture of textures)texture.dispose();if(!disposed){setBusy(false);draw();}}
 }
 const extraction=el('details');extraction.className='settings';extraction.append(el('summary','Character library · save one actor'),el('p','Choose any joint on the actor, then save its connected skeleton, skinned meshes and bone-attached accessories as a separate library entry. Working pose, matching expressions, poses and limits are retained. Other actors, stage/held props and shot animation are omitted. Original model placement stays; shot travel does not. Unbound static accessories need attachment to the actor’s bones. Meshes shared across skeletons cannot be separated here.'));controlsBox.append(extraction);
 const extractedLabel=el('label','Individual character name'),extractedName=el('input');extractedLabel.className='field';extractedName.maxLength=100;extractedName.setAttribute('aria-label','Individual character name');extractedLabel.append(extractedName);extraction.append(extractedLabel);
 extraction.append(button('Save selected actor to project library',async()=>{
  if(busy||!isCurrent())return;const name=extractedName.value.trim();if(!name||name.length>100){notify('Give the character a name of 1–100 characters.');return;}if(!saveSetup||getSetups().length>=32){notify('The rig library is unavailable or full (32 entries).');return;}
  stop();setBusy(true);const before=snapshot();let result;
  try{status.textContent='Saving the selected character separately…';result=await extractActor({root,rig:rig(),rest,baseRoot,selected:Number(joint.value),baseFaces:morphs.map(c=>c.base)});
   if(!active()||before!==snapshot())throw Error('Shot changed. Character was not added to the library.');result.rig.model=await upload(new File([result.data],'actor-library-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||before!==snapshot()||getSetups().length>=32)throw Error('Shot or library changed. Save the character again.');saveSetup(makeRigAsset(result.rig,name));notify('Individual character saved. Load it from Project rig library in another shot. The current cast is unchanged.');
  }catch(error){notify(error.message);}finally{if(result?.root)disposeObject(result.root);if(!disposed)setBusy(false);}
 }));
 const staging=el('details');staging.className='settings';staging.append(el('summary','Stage · add another character'),el('p','Adds a rigged GLB beside the current cast. Existing shot animation, contacts and props stay editable. The added actor starts in its model pose; imported animation clips are not loaded. Choose its named joints to pose it independently. Root movement controls the original character. For another actor, animate its top joint’s local travel channels under independent channels. These follow its local axes; moving limb joints can change proportions. Combined limit: 128 joints and 256 shape controls.'));controlsBox.append(staging);
 function stageField(name,type,value){const label=el('label',name);label.className='field';const input=el('input');input.type=type;input.value=value;input.setAttribute('aria-label',name);label.append(input);staging.append(label);return input;}
 const placement=el('details');placement.className='settings';placement.append(el('summary','Stage · shift character motion'),el('p','Shift the selected joint’s entire skeleton and travel path in its parent’s local axes. Held props follow; its contact targets move with it. Stage props stay put. Prop switching events require manual staging. This edits shot travel channels, not the reusable model placement. Use preview to see the shifted motion; working pose and library snapshots do not keep secondary-actor travel channels.'));controlsBox.append(placement);
 const shiftFields=['X','Y','Z'].map(axis=>{const label=el('label','Shift character '+axis);label.className='field';const input=el('input');input.type='number';input.step=.1;input.value=0;input.setAttribute('aria-label','Shift character '+axis);label.append(input);placement.append(label);return input;});
 placement.append(button('Shift selected character motion',()=>{if(busy||!isCurrent())return;try{const next=shiftSkeletonMotion(rig(),bones,Number(joint.value),shiftFields.map(f=>Number(f.value)));preview=true;edit(r=>Object.assign(r,next));}catch(error){notify(error.message);}}));
 const modelPlacement=el('details');modelPlacement.className='settings';modelPlacement.append(el('summary','Stage · persistent character placement'),el('p','Move and turn the selected character’s model and whole animation together. Offsets use its current parent axes; turning pivots around the neutral root joint. Placement survives library reuse. Bone-attached accessories and held props follow; unrelated stage objects stay put. Contact targets move too. Shared skins, unsupported scale and prop handoffs require preparation in a 3D editor.'));controlsBox.append(modelPlacement);
 const placeFields=['X','Y','Z','turn degrees'].map(axis=>{const label=el('label','Model placement '+axis);label.className='field';const input=el('input');input.type='number';input.step=axis==='turn degrees'?5:.1;input.value=0;input.setAttribute('aria-label','Model placement '+axis);label.append(input);modelPlacement.append(label);return input;});
 modelPlacement.append(button('Apply persistent character placement',async()=>{
  if(busy||!isCurrent())return;stop();setBusy(true);const before=snapshot(),selected=Number(joint.value);let result;
  try{status.textContent='Saving character placement…';result=await placeStageActor({root,rest,baseRoot,rig:rig(),selected,offset:placeFields.slice(0,3).map(f=>Number(f.value)),yaw:Number(placeFields[3].value),baseFaces:morphs.map(c=>c.base)});
   if(!active()||before!==snapshot())throw Error('Shot changed. Original placement kept.');result.rig.model=await upload(new File([result.data],'placed-cast-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||before!==snapshot())throw Error('Shot changed while saving. Original placement kept.');change(()=>shot.rig3d=result.rig,{redraw:false});preview=true;mount(result.root,result.rig);result.root=null;joint.value=String(selected);placeFields.forEach(f=>f.value=0);refresh();notify('Character placement saved in the model. Animation is retained. Undo restores the previous model.');
  }catch(error){notify(error.message);}finally{if(result?.root)disposeObject(result.root);if(!disposed)setBusy(false);}
 }));
 const removal=el('details');removal.className='settings';removal.append(el('summary','Stage · remove a character'),el('p','Choose any joint on the actor to remove. Removes its connected skeleton, bound meshes, bone-attached accessories and matching animation controls. Other characters and stage objects stay. Detach props and clear handoff events involving that actor first. At least one character must remain. Project Undo restores the previous cast. Uploaded model files and library entries are retained.'));controlsBox.append(removal);
 removal.append(button('Remove selected character from cast',async()=>{
  if(busy||!isCurrent())return;stop();setBusy(true);const before=snapshot(),selected=Number(joint.value);let result;
  try{status.textContent='Preparing cast without the selected character…';result=await removeStageActor({root,rest,baseRoot,rig:rig(),selected,baseFaces:morphs.map(c=>c.base)});
   if(!active()||before!==snapshot())throw Error('Shot changed. Original cast kept.');result.rig.model=await upload(new File([result.data],'reduced-cast-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
   if(!active()||before!==snapshot())throw Error('Shot changed while saving. Original cast kept.');change(()=>shot.rig3d=result.rig,{redraw:false});preview=true;mount(result.root,result.rig);result.root=null;refresh();notify('Character removed from this shot. Remaining animation is retained; Undo restores the cast.');
  }catch(error){notify(error.message);}finally{if(result?.root)disposeObject(result.root);if(!disposed)setBusy(false);}
 }));
 const actorName=stageField('New actor name','text','Second actor');actorName.maxLength=60;
 const actorPosition=['X','Y','Z'].map((axis,i)=>{const input=stageField('New actor stage '+axis,'number',i===0?1.5:0);input.step=.1;return input;});
 const actorYaw=stageField('New actor facing degrees','number',0);actorYaw.min=-360;actorYaw.max=360;
 const actorFile=stageField('Add rigged actor GLB','file','');actorFile.accept='.glb';
 async function addActor(actor){if(busy||!isCurrent()){disposeObject(actor);return;}stop();setBusy(true);const before=snapshot();let result;
  try{status.textContent='Combining stage characters…';result=await appendStageActor({root,rest,baseRoot,rig:rig(),actor,name:actorName.value,position:actorPosition.map(f=>Number(f.value)),yaw:Number(actorYaw.value),baseFaces:morphs.map(c=>c.base)});
   if(!active()||snapshot()!==before)throw Error('Shot changed while building the stage. Original kept.');result.rig.model=await upload(new File([result.data],'stage-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));validateRig3D(result.rig);
   if(!active()||snapshot()!==before)throw Error('Shot changed while saving the stage. Original kept.');change(()=>shot.rig3d=result.rig,{redraw:false});preview=false;mount(result.root,result.rig);result.root=null;joint.value=String(result.firstNewJoint);refresh();notify('Actor added. Select its named joints or shape channels to animate it. Undo restores the previous stage.');
  }catch(e){notify(e.message);}finally{disposeObject(actor);if(result?.root)disposeObject(result.root);if(!disposed)setBusy(false);}
 }
 actorFile.onchange=async()=>{if(busy||!actorFile.files[0])return;const chosen=actorFile.files[0],before=snapshot();try{if(chosen.size>50*1024*1024)throw Error('Use a GLB under 50 MB.');const actor=await readRigGLB(await chosen.arrayBuffer());if(!active()||snapshot()!==before){disposeObject(actor);throw Error('Shot changed during import. Select the actor again.');}await addActor(actor);}catch(e){notify(e.message);}finally{actorFile.value='';}};
 staging.append(button('Add starter actor to stage',()=>addActor(starterCharacter())));
 const propImport=el('details');propImport.className='settings';propImport.append(el('summary','Stage · import a reusable prop'),el('p','Import a self-contained static GLB, under 50 MB and 200,000 vertices, with materials kept. No skeletons or shape keys. Prefer Place from asset library so the prop carries a libraryAssetId for set kits. A raw file import stamps the filename and SHA-256 and auto-links when a unique Props-with-GLB card matches; otherwise use Set layout · Link file meshes to library. Then nudge under Stage · prop placement or attach under Character continuity.'));controlsBox.append(propImport);
 const propNameLabel=el('label','Imported prop name'),propImportName=el('input');propImportName.value='Imported prop';propImportName.maxLength=100;propImportName.setAttribute('aria-label','Imported prop name');propNameLabel.append(propImportName);propImport.append(propNameLabel);
 const propFileLabel=el('label','Import static prop GLB'),propFile=el('input');propFile.type='file';propFile.accept='.glb';propFile.setAttribute('aria-label','Import static prop GLB');propFileLabel.append(propFile);propImport.append(propFileLabel);
 const libraryPropLabel=el('label','Place from asset library'),libraryPropChoice=el('select');libraryPropChoice.setAttribute('aria-label','Place from asset library');libraryPropLabel.append(libraryPropChoice);propImport.append(libraryPropLabel);
 async function placeStaticPropScene(imported,name,{linkAssetId=null,sourceFileName=null,sourceUrl=null,contentHash=null}={}){
  const before=snapshot();let result;
  try{
   let resolved=linkAssetId||null;
   if(!resolved){
    resolved=resolveLibraryLinkForImport({name,sourceFileName,sourceUrl,contentHash},getLibraryProps());
   }
   let fileMeta={sourceFileName,sourceUrl,contentHash};
   if(resolved){
    const asset=getLibraryProps().find(a=>a.id===resolved);
    if(asset){
     try{
      const file=libraryPropFile(asset);
      fileMeta={
       sourceFileName:sourceFileName||mediaNameSafe(file),
       sourceUrl:sourceUrl||libraryPropViewUrl(file),
       contentHash:(typeof contentHash==='string'&&contentHash.trim())?contentHash:libraryAssetContentHash(asset)||null
      };
     }catch{/* keep caller meta */}
    }
   }
   result=await appendLibraryPropToModel({root,rest,baseRoot,rig:rig(),propScene:imported,name,baseFaces:morphs.map(c=>c.base),upload,libraryAssetId:resolved||undefined,sourceFileName:fileMeta.sourceFileName||undefined,sourceUrl:fileMeta.sourceUrl||undefined,contentHash:fileMeta.contentHash||undefined});
   if(!active()||snapshot()!==before)throw Error('Shot changed during import. Original kept.');
   change(()=>{shot.rig3d=result.rig;if(resolved)linkShotAsset(shot,resolved);},{redraw:false});preview=false;mount(result.root,result.rig);result.root=null;refresh();
   notify(resolved?'Imported prop saved and linked to library asset '+resolved+'. Nudge it under Stage · prop placement, or attach it under Character continuity. Undo restores the previous model.':'Imported prop saved (no unique library match). Link later under Set layout · Link file meshes to library, or place from the asset library. Nudge under Stage · prop placement.');
  }finally{if(result?.root)disposeObject(result.root);}
 }
 function mediaNameSafe(file){return file?.name||file?.filename||'';}
 propFile.onchange=async()=>{if(busy||!propFile.files[0])return;const chosen=propFile.files[0],before=snapshot();let imported;stop();setBusy(true);
  try{if(chosen.size>50*1024*1024)throw Error('Use a GLB under 50 MB.');status.textContent='Importing static prop…';const bytes=await chosen.arrayBuffer();const digest=await hashGlbBytes(bytes);imported=await readRigGLB(bytes,{requireRig:false});if(!active()||snapshot()!==before)throw Error('Shot changed during import. Original kept.');
   await placeStaticPropScene(imported,propImportName.value.trim()||chosen.name.replace(/\.glb$/i,''),{sourceFileName:chosen.name,contentHash:digest});
  }catch(error){notify(error.message);}finally{if(imported)disposeObject(imported);propFile.value='';if(!disposed)setBusy(false);}
 };
 propImport.append(button('Place selected library GLB',async()=>{
  if(busy||!isCurrent())return;const asset=getLibraryProps().find(a=>a.id===libraryPropChoice.value);if(!asset){notify('Choose a prop library GLB first.');return;}
  stop();setBusy(true);let imported;
  try{status.textContent='Placing library prop…';imported=await loadLibraryPropScene(asset);if(!active())throw Error('Shot changed during import. Original kept.');
   await placeStaticPropScene(imported,libraryPropPlacementName(asset),{linkAssetId:asset.id});
  }catch(error){notify(error.message);}finally{if(imported)disposeObject(imported);if(!disposed)setBusy(false);}
 }));
 
 async function applySetKitMeshes(meshes){
  if(busy||!isCurrent()||disposed)throw Error('Body stage is busy or closed.');
  stop();setBusy(true);
  try{
   status.textContent='Applying set kit library meshes…';
   const next=await embedSetKitLibraryMeshes(rig(),meshes,{
    resolveLibraryAsset:id=>getLibraryProps().find(a=>a.id===id),
    embed:async(currentRig,asset,{name,libraryAssetId})=>{
     if(!isLibraryStagePropGlb(asset))throw Error('Set kit mesh "'+name+'" needs a prop library GLB.');
     let imported,result;
     try{
      imported=await loadLibraryPropScene(asset);
      if(!active())throw Error('Shot changed during set kit mesh place. Original kept.');
      const before=snapshot();
      const file=libraryPropFile(asset);const hash=libraryAssetContentHash(asset);result=await appendLibraryPropToModel({root,rest,baseRoot,rig:currentRig,propScene:imported,name,baseFaces:morphs.map(c=>c.base),upload,libraryAssetId,sourceFileName:file.name||file.filename||undefined,sourceUrl:libraryPropViewUrl(file),contentHash:hash||undefined});
      if(!active()||snapshot()!==before){if(result?.root)disposeObject(result.root);throw Error('Shot changed during set kit mesh place. Original kept.');}
      change(()=>{shot.rig3d=result.rig;linkShotAsset(shot,libraryAssetId||asset.id);},{redraw:false});preview=false;
      mount(result.root,result.rig);result.root=null;
      return {rig:rig(),propId:result.propId};
     }finally{if(imported)disposeObject(imported);if(result?.root)disposeObject(result.root);}
    }
   });
   if(!active())throw Error('Shot changed during set kit mesh place. Original kept.');
   change(()=>shot.rig3d=next,{redraw:false});preview=false;refresh();
  }finally{if(!disposed)setBusy(false);}
 }

 function refreshLibraryProps(){const previous=libraryPropChoice.value;libraryPropChoice.replaceChildren();const props=getLibraryProps().filter(isLibraryStagePropGlb);for(const asset of props)libraryPropChoice.append(new Option(asset.name,asset.id));if(previous&&[...libraryPropChoice.options].some(o=>o.value===previous))libraryPropChoice.value=previous;else if(props[0])libraryPropChoice.value=props[0].id;}
 refreshLibraryProps();
 const propPlacement=el('details');propPlacement.className='settings';propPlacement.append(el('summary','Stage · prop placement'),el('p','Nudge the selected saved stage prop with one-click Fine / Medium / Coarse steps on \u00b1X / Y / Z / yaw, arrow keys / Q/E (when this panel is open and you are not typing), or type custom XYZ / yaw / uniform scale and Apply. Offsets are in the prop\'s current parent axes (Stage root, or the joint it is attached to). Step size is remembered in this browser. Changes write durable prop placement without re-importing mesh geometry. Attachment events and appearance timing stay intact. Character continuity still handles attach, release and full local Euler / size edits.'));controlsBox.append(propPlacement);
 const propPlaceSelectLabel=el('label','Stage prop to nudge'),propPlaceSelect=el('select');propPlaceSelect.setAttribute('aria-label','Stage prop to nudge');propPlaceSelectLabel.append(propPlaceSelect);propPlacement.append(propPlaceSelectLabel);
 let propNudgeStep=readPropNudgeStep();
 const propNudgeStepRow=el('div');propNudgeStepRow.className='prop-nudge-presets';propNudgeStepRow.setAttribute('role','group');propNudgeStepRow.setAttribute('aria-label','Prop nudge step size');
 const propNudgeStepButtons=[];
 function syncPropNudgeStepUi(){
  const preset=propNudgeStepPreset(propNudgeStep);
  for(const b of propNudgeStepButtons){const on=b.dataset.step===propNudgeStep;b.setAttribute('aria-pressed',String(on));b.classList.toggle('selected',on);}
  propPlaceFields[0].step=propPlaceFields[1].step=propPlaceFields[2].step=preset.xyz;
  propPlaceFields[3].step=preset.yaw;
 }
 for(const preset of PROP_NUDGE_STEP_PRESETS){
  const b=button(preset.label+' ('+preset.xyz+' / '+preset.yaw+'\u00b0)',()=>{
   propNudgeStep=writePropNudgeStep(preset.id);syncPropNudgeStepUi();
   notify('Prop nudge step: '+preset.label+' \u00b7 XYZ '+preset.xyz+' \u00b7 yaw '+preset.yaw+'\u00b0');
  });
  b.dataset.step=preset.id;propNudgeStepButtons.push(b);propNudgeStepRow.append(b);
 }
 propPlacement.append(propNudgeStepRow);
 const propNudgeAxisRow=el('div');propNudgeAxisRow.className='prop-nudge-axes';propNudgeAxisRow.setAttribute('role','group');propNudgeAxisRow.setAttribute('aria-label','Prop nudge axes');
 const propNudgeAxisButtons=[];
 function applyAxisNudge(axis,sign){
  if(busy||!isCurrent())return;
  const id=propPlaceSelect.value;const gate=stagePropNudgeGate(rig(),id);if(!gate.ok){notify(gate.reason);return;}
  const delta=propNudgeAxisDelta(axis,sign,propNudgeStep);
  if(!edit(r=>{const next=nudgeStageProp(r,id,delta);r.props=next.props;}))return;
  const preset=propNudgeStepPreset(propNudgeStep);
  const label=axis==='yaw'?('yaw '+(sign<0?'\u2212':'+')+preset.yaw+'\u00b0'):(axis.toUpperCase()+' '+(sign<0?'\u2212':'+')+preset.xyz);
  notify('Nudged '+label+'. Undo restores the previous placement.');
 }
 for(const [axis,label] of [['x','X'],['y','Y'],['z','Z'],['yaw','Yaw']]){
  const minus=button('\u2212'+label,()=>applyAxisNudge(axis,-1));minus.setAttribute('aria-label','Nudge \u2212'+label);
  const plus=button('+'+label,()=>applyAxisNudge(axis,1));plus.setAttribute('aria-label','Nudge +'+label);
  propNudgeAxisButtons.push(minus,plus);propNudgeAxisRow.append(minus,plus);
 }
 propPlacement.append(propNudgeAxisRow);
 const propNudgeHint=el('p',PROP_NUDGE_KEYBOARD_HINT);propNudgeHint.className='hint prop-nudge-hint';propPlacement.append(propNudgeHint);
 function onPropNudgeKey(e){
  if(disposed||busy||!isCurrent()||e.defaultPrevented)return;
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(!propPlacement.open)return;
  const id=propPlaceSelect.value;if(!id)return;
  const target=e.target||document.activeElement;
  if(isPropNudgeTypingTarget(target))return;
  // Gate: Body / stage prop panel focus, or selected prop with focus still in this Body craft (not timeline elsewhere).
  const focusEl=document.activeElement||target;
  const inPropPanel=propPlacement.contains(target)||propPlacement.contains(focusEl);
  const inBody=body.contains(target)||body.contains(focusEl);
  const onViewport=!!(renderer&&renderer.domElement&&(target===renderer.domElement||focusEl===renderer.domElement));
  if(!inPropPanel&&!inBody&&!onViewport)return;
  const binding=propNudgeKeyBinding(e.key,{shiftKey:!!e.shiftKey});
  if(!binding)return;
  e.preventDefault();
  applyAxisNudge(binding.axis,binding.sign);
 }
 document.addEventListener('keydown',onPropNudgeKey);
 const propPlaceFields=['X','Y','Z','yaw degrees','uniform scale'].map(axis=>{const label=el('label','Prop placement '+axis);label.className='field';const input=el('input');input.type='number';input.step=axis==='yaw degrees'?5:axis==='uniform scale'?.05:.1;input.value=axis==='uniform scale'?1:0;input.setAttribute('aria-label','Prop placement '+axis);label.append(input);propPlacement.append(label);return input;});
 syncPropNudgeStepUi();
 let propNudgeApplyButton=null;
 function syncPropNudgeChrome(){const gate=stagePropNudgeGate(rig(),propPlaceSelect.value);if(propNudgeApplyButton){propNudgeApplyButton.disabled=!gate.ok;propNudgeApplyButton.title=gate.reason||'';}for(const b of propNudgeAxisButtons){b.disabled=!gate.ok;b.title=gate.reason||'';}for(const f of propPlaceFields){f.disabled=!gate.ok;}propPlaceSelect.disabled=!(rig().props||[]).length;propPlaceSelect.title=gate.ok?'Stage prop to nudge':(gate.reason||'');}
propPlaceSelect.onchange=()=>syncPropNudgeChrome();
function refreshPropPlacement(){const previous=propPlaceSelect.value;propPlaceSelect.replaceChildren();const props=rig().props||[];for(const p of props)propPlaceSelect.append(new Option(p.name+(p.joint===null?' · Stage':' · '+(rig().names[p.joint]||'joint'))+(p.shape==='mesh'?' · mesh':''),p.id));if(previous&&[...propPlaceSelect.options].some(o=>o.value===previous))propPlaceSelect.value=previous;else if(props[0])propPlaceSelect.value=props[0].id;syncPropNudgeChrome();}
 propNudgeApplyButton=button('Apply prop placement nudge',()=>{
  if(busy||!isCurrent())return;
  const id=propPlaceSelect.value;const gate=stagePropNudgeGate(rig(),id);if(!gate.ok){notify(gate.reason);return;}
  const offset=propPlaceFields.slice(0,3).map(f=>Number(f.value)),yaw=Number(propPlaceFields[3].value),scale=Number(propPlaceFields[4].value);
  if(!edit(r=>{const next=nudgeStageProp(r,id,{offset,yaw,scale});r.props=next.props;}))return;
  notify('Prop placement updated. Scrub or orbit to check; Undo restores the previous placement.');
});
propPlacement.append(propNudgeApplyButton);
 refreshPropPlacement();
 const deformer=el('details');deformer.className='settings';deformer.append(el('summary','3D squash / stretch · author a shape'),el('p','Creates a new model copy with a deformation shape around the selected joint in bind space. The other two axes compensate volume at full strength. Bones and contact targets stay fixed; blended skin regions and intermediate morph values do not guarantee exact volume. Inspect seams and surface contacts. Separate attached objects are not deformed.'));
 controlsBox.append(deformer);
 function deformField(name,input){const label=el('label',name);label.className='field';input.setAttribute('aria-label',name);label.append(input);deformer.append(label);return input;}
 const deformName=deformField('Deformation shape name',el('input'));deformName.value='Squash';deformName.maxLength=60;
 const deformAxis=deformField('3D stretch axis',el('select'));for(const axis of ['x','y','z'])deformAxis.add(new Option(axis.toUpperCase(),axis));deformAxis.value='y';
 const deformFactor=deformField('3D stretch factor',el('input'));deformFactor.type='number';deformFactor.min=.25;deformFactor.max=4;deformFactor.step=.05;deformFactor.value=.75;
 deformer.append(button('Create editable deformation shape',async()=>{
  if(busy||!isCurrent())return;stop();setBusy(true);const before=snapshot(),state=structuredClone(rig()),base=morphs.map(c=>c.base);let sculpt,loaded;
  try{status.textContent='Authoring deformation on a model copy…';sculpt=makeStretchShape(root,{joint:Number(joint.value),axis:deformAxis.value,factor:Number(deformFactor.value),name:deformName.value.trim()});
   const cb=jointsOf(sculpt.root),controls=faceControls(sculpt.root),neutral={version:1,model:null,names:state.names,pose:cb.map(()=>[0,0,0]),keys:[],face:controls.map(()=>0),props:(state.props||[]).map(p=>{const value=structuredClone(p);delete value.attachments;delete value.firstFrame;return value;})};
   const data=await exportRigGLB(sculpt.root,cb,rest,neutral,1,baseRoot,controls);loaded=await readRigGLB(data);const faces=faceControls(loaded),next=remapShapeState(state,sculpt.oldKeys,faces,base);
   const loadedBones=jointsOf(loaded);if(loadedBones.length!==sculpt.boneKeys.length||loadedBones.some((b,i)=>b.userData.studioBoneId!==sculpt.boneKeys[i]))throw Error('The saved skeleton changed; the original was kept.');next.names=loadedBones.map((b,i)=>b.name||'Joint '+(i+1));
   if(!active()||before!==snapshot())throw Error('Shot changed during shape creation. Original character kept.');
   next.model=await upload(new File([data],'shaped-rig-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));validateRig3D(next);
   if(!active()||before!==snapshot())throw Error('Shot changed while saving the model. Original character kept.');
   change(()=>shot.rig3d=next,{redraw:false});preview=false;mount(loaded,next);loaded=null;notify('Deformation shape saved. Use Face / shape control or an independent shape channel to animate it. The previous model remains available through Undo.');
  }catch(e){notify(e.message);}finally{if(sculpt)disposeObject(sculpt.root,{textures:false});if(loaded)disposeObject(loaded);if(!disposed)setBusy(false);}
 }));
 motionReview=motionReviewControls({host:body,scene,runtime:()=>({root,bones,rest,baseRoot,morphs,joint:Number(joint.value)}),getRig:rig,lastFrame:()=>shot.seconds*24-1,active,isBusy:()=>busy,setBusy,stop,draw,seek,notify});
 channelsUI=channelControls({host:controlsBox,label:'3D',getState:rig,getSpecs:()=>rigChannelSpecs({...rig(),face:rig().face||morphs.map(c=>c.base)}).map(s=>s.id.startsWith('face:')?{...s,label:morphs[Number(s.id.split(':')[1])]?.name||s.label}:s),getFrame:()=>Number(frame.value),lastFrame:()=>shot.seconds*24-1,isBusy:()=>busy||!isCurrent(),beforeEdit:()=>stop(),notify,getValue:(id,f)=>{const [type,index,axis]=id.split(':');return type==='position'?jointTravel(rig(),Number(index),f)[Number(axis)]:type==='joint'?sampleRig3D(rig(),f)[Number(index)][Number(axis)]:sampleChannel(rig(),f,type,type==='face'?morphs.map(c=>c.base):[0,0,0])[Number(index)];},save:next=>{next.face??=morphs.map(c=>c.base);validateRig3D(next);preview=true;edit(r=>Object.assign(r,next));}});
 performanceUI=performanceControls({host:controlsBox,focus:stage==='face'?'face':'body',getSetups,saveSetup,getSetKits,saveSetKit,getLibraryProps,embedSetKitMeshes:applySetKitMeshes,getRig:rig,getRuntime:()=>({root,bones,rest,baseRoot,morphs,joint:Number(joint.value)}),getFrame:()=>Number(frame.value),lastFrame:()=>shot.seconds*24-1,edit,notify,draw,previewFrame:()=>seek(Number(frame.value)),working:()=>{stop();preview=false;},busy:()=>busy||!isCurrent(),loadSetup:async state=>{
  validateRig3D(state);stop();setBusy(true);const before=snapshot();let model;
  try{if(state.model){const f=state.model,response=await fetch('/view?'+new URLSearchParams({filename:f.name,subfolder:f.subfolder,type:f.type}));if(!response.ok)throw Error('The saved character model is missing. Restore its project media first.');model=await readRigGLB(await response.arrayBuffer());}else model=starterCharacter();
   const nextBones=jointsOf(model),faces=faceControls(model);if(nextBones.length!==state.names.length||nextBones.some((b,i)=>(b.name||'Joint '+(i+1)).slice(0,200)!==state.names[i]))throw Error('Character skeleton does not match this setup.');if(state.face&&state.face.length!==faces.length)throw Error('Character face controls do not match this setup.');validateContactChains(nextBones,state.contacts||[]);
   if(!active()||snapshot()!==before)throw Error('Shot changed while loading. Try again in the intended shot.');change(()=>shot.rig3d=structuredClone(state),{redraw:false});preview=false;mount(model,state);model=null;notify('Reusable character and props loaded.');
  }finally{if(model)disposeObject(model);if(!disposed)setBusy(false);}
 }});
 const skeletonBuilder=createSkeletonBuilder(body,{button,notify,upload,active:()=>active()&&!busy,getDraft:()=>shot.skeletonDraft,saveDraft:draft=>{if(isCurrent())change(()=>shot.skeletonDraft=draft,{redraw:false});},onSave:async(ref,buffer)=>{if(!active()||busy)throw Error('Select the original shot before saving its rig.');stop();const model=await readRigGLB(buffer);if(!active()||busy){disposeObject(model);throw Error('Shot changed during rig loading.');}const names=jointsOf(model).map((b,i)=>b.name||'Joint '+(i+1)),state={version:1,model:ref,names,pose:names.map(()=>[0,0,0]),keys:[]};change(()=>shot.rig3d=state,{redraw:false});preview=false;mount(model,state);}});
 let observer;
 function dispose(){if(disposed)return;disposed=true;document.removeEventListener('keydown',onPropNudgeKey);unregisterLibraryPropHost?.();unregisterLibraryPropHost=null;setJointProjector(shot.id,null);abort?.abort();stop();setSilhouette(false);if(referenceUrl)URL.revokeObjectURL(referenceUrl);silhouetteMaterial.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);skeletonBuilder.dispose();motionReview?.dispose();pathDrag?.dispose();orbit?.dispose();helper?.dispose();clearLiveSceneColorDrawings();clearLiveConformDecalDrawings();if(onDrawingChanged)document.removeEventListener('director-drawing-changed',onDrawingChanged);onDrawingChanged=null;if(onDirectorSeek){(panel.parentElement||document).removeEventListener('director-seek',onDirectorSeek);onDirectorSeek=null;}disposeDrawingBlendSceneColorPass(sceneColorPass);disposeObject(root);renderer?.dispose();renderer?.forceContextLoss();}
 function visibility(){if(document.hidden){stop();abort?.abort();}pathDrag?.setSuspended(document.hidden||busy);}
 try{
  renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,540);renderer.domElement.setAttribute('aria-label','3D character viewport');viewportStage.prepend(renderer.domElement);orbit=new OrbitControls(camera,renderer.domElement);orbit.addEventListener('start',()=>{followCamera=false;});orbit.addEventListener('change',()=>draw());
  let eyePointer=null;
  renderer.domElement.addEventListener('pointerdown',event=>{if(!eyePicking||busy||playing||dragEnabled.checked)return;eyePointer={id:event.pointerId,x:event.clientX,y:event.clientY};});
  renderer.domElement.addEventListener('pointerup',event=>{if(!eyePointer||event.pointerId!==eyePointer.id)return;const moved=Math.hypot(event.clientX-eyePointer.x,event.clientY-eyePointer.y);eyePointer=null;if(moved>4||!eyePicking||busy||!root)return;const rect=renderer.domElement.getBoundingClientRect();try{const point=pickScenePoint(root,camera,((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);eyePoint.forEach((input,i)=>input.value=Number(point[i].toFixed(3)));notify('Eye target set where the camera ray hit the scene.');}catch(error){notify(error.message);}});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!disposed){abort?.abort();notify('The 3D graphics context was lost. Close and reopen the page to reload the rig.');}});
  let model;if(shot.rig3d?.model){const f=shot.rig3d.model,response=await fetch('/view?'+new URLSearchParams({filename:f.name,subfolder:f.subfolder,type:f.type}));if(!response.ok)throw Error('The saved rig file could not be loaded.');model=await readRigGLB(await response.arrayBuffer());}else model=starterCharacter();
  if(!panel.isConnected||!isCurrent()){disposeObject(model);dispose();return {refresh(){}};}mount(model,shot.rig3d);setJointProjector(shot.id,name=>boneScreen(bones.find(bone=>bone.name===name)));
  unregisterLibraryPropHost=registerLibraryPropHost(shot.id,{
   busy:()=>busy||!isCurrent()||disposed,
   place:async asset=>{
    if(busy||!isCurrent()||disposed)throw Error('Body stage is busy or closed.');
    stop();setBusy(true);let imported;
    try{status.textContent='Placing library prop…';imported=await loadLibraryPropScene(asset);if(!active())throw Error('Shot changed during import. Original kept.');
     await placeStaticPropScene(imported,libraryPropPlacementName(asset),{linkAssetId:asset.id});
    }finally{if(imported)disposeObject(imported);if(!disposed)setBusy(false);}
   },
   refreshLibraryProps
  });
  pathDrag=travelGizmo({scene,camera,canvas:renderer.domElement,orbit,getContext:()=>({rig:rig(),bones,baseRoot,joint:Number(joint.value),frame:Number(frame.value),lastFrame:shot.seconds*24-1,signature:snapshot(),active:active()&&!busy&&!playing&&preview}),commit:next=>{preview=true;edit(r=>Object.assign(r,next));},draw,notify,onValues:values=>travelFields.forEach((input,i)=>input.value=values[i])});
  onDrawingChanged=(event)=>{if(disposed||event.detail?.shotId!==shot.id)return;draw();};
  document.addEventListener('director-drawing-changed',onDrawingChanged);
  onDirectorSeek=(event)=>{if(disposed||event.detail?.shotId!==shot.id)return;if(!Number.isFinite(Number(event.detail?.frame)))return;clearPendingFaceSeek(shot.id);seek(event.detail.frame);};
  (panel.parentElement||document).addEventListener('director-seek',onDirectorSeek);
  const pendingSeek=takePendingFaceSeek(shot.id);
  if(pendingSeek!=null)seek(pendingSeek);
  observer=new MutationObserver(()=>{if(!panel.isConnected)dispose();else if(!panel.open){stop();abort?.abort();}});observer.observe(document.body,{childList:true,subtree:true});observer.observe(panel,{attributes:true,attributeFilter:['open']});document.addEventListener('visibilitychange',visibility);
  status.textContent=bones.length+' joints · drag to orbit, scroll to zoom. Recording supports up to 3600 seconds per shot. Save camera view to keep your framing.';
  const allow={camera:['camera','shared'],body:['body','shared','channels','acting'],face:['face','shared','channels','acting']}[stage]||['body','shared','channels','acting'];
  const tag=(node,name)=>{if(node)node.dataset.toolStage=name;};
  tag(hint,'body');tag(toolbar,'body');tag(advanced,'body');tag(eyeTargetPanel,'face');tag(travelPanel,'body');tag(craft?.panel,'body');tag(reviewPanel,'body');tag(followPanel,'body');tag(keyButtons,'body');
  for(const node of [extraction,staging,placement,modelPlacement,removal,propImport,propPlacement,deformer,body.querySelector('.skeleton-builder')])tag(node,'body');
  for(const details of [...controlsBox.querySelectorAll('details'),...body.querySelectorAll('details')]){
   const title=details.querySelector(':scope > summary')?.textContent||'';
   if(title.startsWith('3D · independent channels'))details.dataset.toolStage='channels';
   else if(title.startsWith('3D motion paths'))details.dataset.toolStage='body';
   else if(title.startsWith('Face ·'))details.dataset.toolStage='face';
   else if(title.startsWith('Body ·'))details.dataset.toolStage='body';
   else if(title.startsWith('3D · timing'))details.dataset.toolStage='body';
  }
  const cameraButtons=new Set(['Frame character','Save camera view','Key camera','Remove camera key']);
  const sharedButtons=new Set(['Play 3D poses','Stop 3D preview','Save 3D animation as shot clip','Download animated GLB','Cancel 3D recording']);
  for(const control of controlsBox.querySelectorAll('button')){if(control.closest('[data-tool-stage]'))continue;const label=control.textContent;control.dataset.toolStage=cameraButtons.has(label)?'camera':sharedButtons.has(label)?'shared':'body';}
  for(const node of [...controlsBox.querySelectorAll('[data-tool-stage]'),...body.querySelectorAll(':scope > [data-tool-stage]')])if(!allow.includes(node.dataset.toolStage))node.remove();
  return {refresh};
 }catch(e){dispose();throw e;}
}


