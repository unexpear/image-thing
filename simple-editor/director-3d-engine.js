import {channelActive,sampleScalar} from './director-channels.js';
import {applyContacts,applyEyeTracks,aimFeatureEyes,validateContactChains,contactBones,syncProps} from './director-performance-engine.js';
import {applyFeatureSets,removeFeatureMeshes,sampleFeatures} from './director-features.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {sampleRig3D,sampleChannel,sampleCamera,MAX_3D_JOINTS} from './director-3d-state.js';
export function starterCharacter({fingers=false}={}){
 const root=new THREE.Scene(),bones=[],geometries=[];
 // Joint world positions, parent index, solid block dimensions and center offset.
 const parts=[
  ['Hips',-1,[0,1.05,0],[.48,.24,.3],[0,0,0]],['Spine',0,[0,1.17,0],[.55,.55,.3],[0,.27,0]],['Head',1,[0,1.72,0],[.42,.45,.38],[0,.23,0]],
  ['Left shoulder',1,[.36,1.62,0],[.22,.42,.23],[0,-.21,0]],['Left elbow',3,[.36,1.2,0],[.19,.38,.2],[0,-.19,0]],['Left hand',4,[.36,.82,0],[.21,.19,.24],[0,-.095,0]],
  ['Right shoulder',1,[-.36,1.62,0],[.22,.42,.23],[0,-.21,0]],['Right elbow',6,[-.36,1.2,0],[.19,.38,.2],[0,-.19,0]],['Right hand',7,[-.36,.82,0],[.21,.19,.24],[0,-.095,0]],
  ['Left hip',0,[.15,.94,0],[.23,.43,.26],[0,-.215,0]],['Left knee',9,[.15,.51,0],[.21,.4,.23],[0,-.2,0]],['Left foot',10,[.15,.11,0],[.25,.18,.4],[0,-.02,.09]],
  ['Right hip',0,[-.15,.94,0],[.23,.43,.26],[0,-.215,0]],['Right knee',12,[-.15,.51,0],[.21,.4,.23],[0,-.2,0]],['Right foot',13,[-.15,.11,0],[.25,.18,.4],[0,-.02,.09]]
 ];
 if(fingers)for(const [side,wrist,sign] of [['Left',5,1],['Right',8,-1]]){
  parts[wrist][3]=[.19,.095,.10];parts[wrist][4]=[0,-.0475,0];const x=parts[wrist][2][0];
  for(const [digit,dx,length] of [['Index',-.067,.042],['Middle',-.022,.047],['Ring',.022,.044],['Little',.067,.035]]){
   let parent=wrist;for(let n=0;n<3;n++){const position=[x+dx*sign,.725-n*length,0];parts.push([side+' '+digit+' '+(n+1),parent,position,[.038,length*.94,.047],[0,-length*.47,0]]);parent=parts.length-1;}
  }
  let parent=wrist;for(let n=0;n<2;n++){parts.push([side+' Thumb '+(n+1),parent,[x-.115*sign,.79-n*.045,.015],[.045,.042,.05],[0,-.021,0]]);parent=parts.length-1;}
 }
 for(const [i,[name,parent,position,size,offset]] of parts.entries()){
  const bone=new THREE.Bone();bone.name=name;bone.position.fromArray(position);if(parent>=0)bone.position.sub(new THREE.Vector3(...parts[parent][2]));bone.userData.studioRestPosition=bone.position.toArray();bones.push(bone);(parent>=0?bones[parent]:root).add(bone);
  const g=new THREE.BoxGeometry(...size);g.translate(...position.map((v,j)=>v+offset[j]));const count=g.attributes.position.count,indices=[],weights=[],colors=[],color=new THREE.Color(i===2||i===5||i===8||i>=15?'#f6c28b':i>=9?'#47577e':'#56bfc0');
  for(let n=0;n<count;n++){indices.push(i,0,0,0);weights.push(1,0,0,0);colors.push(color.r,color.g,color.b);}g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometries.push(g);
 }
 const geometry=mergeGeometries(geometries);geometry.deleteAttribute('uv');geometries.forEach(g=>g.dispose());const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85}));root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));mesh.frustumCulled=false;return root;
}
export function jointsOf(root){const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)o.frustumCulled=false;});if(!bones.length)throw Error('This model has no skeleton. Import a rigged GLB, or use the starter character.');if(bones.length>MAX_3D_JOINTS)throw Error('Use a rig with no more than 128 joints on this laptop.');return bones;}
export async function readRigGLB(buffer,{requireRig=true}={}){
 if(buffer.byteLength>50*1024*1024)throw Error('Use a GLB under 50 MB.');
 const view=new DataView(buffer);if(buffer.byteLength<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw Error('Choose a valid GLB 2.0 file.');
 const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!/^(blob:|data:)/.test(url))throw Error('Use a self-contained GLB with embedded textures.');return url;});
 const gltf=await new GLTFLoader(manager).parseAsync(buffer,'');try{gltf.scene.traverse(o=>{if(o.isBone)o.userData.studioRestPosition=o.position.toArray();});if(requireRig)jointsOf(gltf.scene);return gltf.scene;}catch(e){disposeObject(gltf.scene);throw e;}
}
export function applyPose(bones,rest,pose){const q=new THREE.Quaternion();bones.forEach((b,i)=>b.quaternion.copy(rest[i]).multiply(q.setFromEuler(new THREE.Euler(...pose[i].map(THREE.MathUtils.degToRad),'XYZ'))));}
export function faceControls(root){const controls=[];root.traverse(mesh=>{if(mesh.morphTargetInfluences)for(const [name,index] of Object.entries(mesh.morphTargetDictionary||{}))controls.push({mesh,index,name:(mesh.name||'Mesh')+' · '+name,base:mesh.morphTargetInfluences[index]});});return controls;}
export function jointTravel(rig,index,frame){return [0,1,2].map(axis=>frame===null?0:sampleScalar(rig.channels,`position:${index}:${axis}`,frame,0));}
function restPosition(bone){const p=bone.userData.studioRestPosition;if(!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)))bone.userData.studioRestPosition=bone.position.toArray();return bone.userData.studioRestPosition;}
export function applyChannels(bones,baseRoot,controls,rig,frame=null){bones.forEach((bone,i)=>{if(i)bone.position.fromArray(restPosition(bone)).add(new THREE.Vector3(...jointTravel(rig,i,frame)));});bones[0].position.copy(baseRoot).add(new THREE.Vector3(...(frame===null?(rig.root||[0,0,0]):sampleChannel(rig,frame,'root',[0,0,0]))));const fallback=controls.map(c=>c.base),face=frame===null?(rig.face||fallback):sampleChannel(rig,frame,'face',fallback);controls.forEach((c,i)=>c.mesh.morphTargetInfluences[c.index]=face[i]??c.base);}
export function applyCameraSample(view,rig,frame){
 const camera=sampleCamera(rig,frame);
 if(view?.camera&&camera&&rig?.cameraKeys?.length){view.camera.position.fromArray(camera.position);if(view.orbit){view.orbit.target.fromArray(camera.target);view.orbit.update();}}
 return camera;
}
export function applyRigFrame(root,bones,rest,baseRoot,controls,rig,frame,view=null){const pose=sampleRig3D(rig,frame);applyPose(bones,rest,pose);applyChannels(bones,baseRoot,controls,rig,frame);const result=applyContacts(root,bones,rest,rig,frame,pose);const eyes=applyEyeTracks(root,bones,rest,rig,frame,result.pose);syncProps(root,bones,rig,frame);const shown={...rig,features:sampleFeatures(rig,frame)};applyFeatureSets(root,bones,shown);aimFeatureEyes(root,shown);root.updateMatrixWorld(true);return {pose:eyes.pose,warnings:[...result.warnings,...eyes.warnings],camera:applyCameraSample(view,rig,frame)};}
function bakeCameraTracks(output,rig,seconds,tracks){
 if(!rig.cameraKeys?.length)return;
 const ordered=[...rig.cameraKeys].sort((a,b)=>a.frame-b.frame),last=seconds*24;
 let frames=ordered.map(key=>key.frame).filter(frame=>frame>=0&&frame<=last);
 if(!frames.length)return;
 // Hold-only stays sparse; any non-hold ease bakes every frame so GLB matches preview curves.
 if(ordered.some(key=>(key.easing??'hold')!=='hold'))frames=Array.from({length:last+1},(_,frame)=>frame);
 else{if(frames[0]>0)frames.unshift(0);if(frames.at(-1)<last)frames.push(last);}
 const shotCamera=new THREE.PerspectiveCamera(38,16/9,.01,10000);shotCamera.name='Shot camera';output.add(shotCamera);
 const times=new Float32Array(frames.map(frame=>frame/24)),positions=new Float32Array(frames.length*3),quats=new Float32Array(frames.length*4),stand=new THREE.PerspectiveCamera();
 frames.forEach((frame,index)=>{const view=sampleCamera(rig,frame);stand.position.fromArray(view.position);stand.lookAt(new THREE.Vector3(...view.target));stand.position.toArray(positions,index*3);stand.quaternion.toArray(quats,index*4);});
 tracks.push(new THREE.VectorKeyframeTrack(shotCamera.uuid+'.position',times,positions,THREE.InterpolateDiscrete),new THREE.QuaternionKeyframeTrack(shotCamera.uuid+'.quaternion',times,quats,THREE.InterpolateDiscrete));
}
// Parent drawings ride as textured planes on their joints. glTF has no 2D image
// track; a bone child with an embedded texture is the durable equivalent.
// Default placement is mesh-aware: sized from joint/skinned bounds, anchored on
// nearby weighted surface verts, camera-facing, with depthWrite so the mesh can
// occlude the card. item.placement='billboard' restores screen-FOV sizing;
// item.placement='conform' exports a subdivided multi-bone SkinnedMesh card
// (weighted to the joint + nearby bones) that bends with the skeleton instead of
// camera-facing TRS bake; item.placement='decal' clones nearby host triangles with
// host bone weights and denser card→mesh raycast UVs when samples hit (planar
// host-tri UV fallback; honest partial — not host UV atlas / full texel bake);
// item.occlusion='overlay' disables depthWrite.
// Motion/camera shots bake per-frame local TRS for flat cards. Multi-frame ink
// becomes stepped sibling planes (zero scale holds). Sample list capped at
// MAX_PARENT_DRAWING_CELS.
export const MAX_PARENT_DRAWING_CELS=48;
/** Exposure-sheet anchors: cel / pose-key / layer-channel / mouth-cue change points. */
export function parentDrawingChangeFrames(board,layer,lastFrame){
 const last=Math.max(0,Math.round(Number(lastFrame)||0));
 const frames=new Set([0,last]);
 if(!board||!layer)return frames;
 for(const c of layer.cels||[])if(Number.isInteger(c.frame)&&c.frame>=0&&c.frame<=last)frames.add(c.frame);
 for(const k of board.keyframes||[])if(Number.isInteger(k.frame)&&k.frame>=0&&k.frame<=last)frames.add(k.frame);
 for(const c of board.channels||[]){
  if(!channelActive(c)||typeof c.id!=='string'||!c.id.startsWith('layer:'+layer.id+':'))continue;
  for(const k of c.keys||[])if(Number.isInteger(k.frame)&&k.frame>=0&&k.frame<=last)frames.add(k.frame);
 }
 if(board.lipSync?.mouthCues&&/^Mouth [A-HX]$/.test(layer.name||'')){
  for(const cue of board.lipSync.mouthCues){
   const f=Math.round(cue.start*24);
   if(Number.isInteger(f)&&f>=0&&f<=last)frames.add(f);
  }
 }
 return frames;
}
/** Evenly pick up to n items from a sorted list (keeps endpoints when n>=2). */
export function evenPickFrames(list,n){
 if(n<=0||!list?.length)return [];
 if(list.length<=n)return [...list];
 if(n===1)return [list[Math.floor((list.length-1)/2)]];
 const out=[];
 for(let i=0;i<n;i++)out.push(list[Math.round(i*(list.length-1)/(n-1))]);
 return [...new Set(out)].sort((a,b)=>a-b);
}
/** Prefer exposure anchors, then spread remaining budget across denser samples. */
export function collapseParentDrawingFrames(frames,anchors,maxCels=MAX_PARENT_DRAWING_CELS){
 const max=Math.max(1,Math.round(Number(maxCels)||MAX_PARENT_DRAWING_CELS));
 const list=frames instanceof Set? [...frames]:(frames||[]); const sorted=[...new Set(list.filter(f=>Number.isInteger(f)))].sort((a,b)=>a-b);
 if(sorted.length<=max)return sorted;
 const anchorSet=anchors instanceof Set?anchors:new Set(anchors||[]);
 const keep=sorted.filter(f=>anchorSet.has(f));
 const fill=sorted.filter(f=>!anchorSet.has(f));
 if(keep.length>=max)return evenPickFrames(keep,max);
 const room=max-keep.length;
 return [...new Set([...keep,...evenPickFrames(fill,room)])].sort((a,b)=>a-b);
}
function densifyInterval(into,start,end,step,last){
 const a=Math.max(0,start),b=Math.min(last,end);
 if(!(b>a))return;
 const stride=Math.max(1,Math.round(Number(step)||1));
 for(let f=a+stride;f<b;f+=stride)into.add(f);
}
/** Sample frames for parented ink bake: change-points plus denser walk / pose / channel inbetweens, collapsed to maxCels. */
export function parentDrawingSampleFrames(board,layer,lastFrame,maxCels=MAX_PARENT_DRAWING_CELS){
 const last=Math.max(0,Math.round(Number(lastFrame)||0));
 const anchors=parentDrawingChangeFrames(board,layer,last);
 const dense=new Set(anchors);
 const step=Math.max(1,[1,2,3].includes(board?.exposure)?board.exposure:1);
 // Procedural walk moves parented ink every frame between keys.
 if(board?.walk)for(let f=0;f<=last;f+=step)dense.add(f);
 // Pose blends (non-hold) re-rasterize stroke placement between keys.
 const keys=[...(board?.keyframes||[])].filter(k=>Number.isInteger(k?.frame)).sort((a,b)=>a.frame-b.frame);
 for(let i=0;i<keys.length-1;i++){
  const a=keys[i],b=keys[i+1];
  if(a.easing==='hold'||a.frame>=b.frame)continue;
  densifyInterval(dense,a.frame,b.frame,step,last);
 }
 // Layer channel curves (opacity / rig axes) interpolate between their keys.
 for(const c of board?.channels||[]){
  if(!channelActive(c)||typeof c.id!=='string'||!c.id.startsWith('layer:'+layer.id+':'))continue;
  const ckeys=[...(c.keys||[])].filter(k=>Number.isInteger(k?.frame)).sort((a,b)=>a.frame-b.frame);
  for(let i=0;i<ckeys.length-1;i++){
   const a=ckeys[i],b=ckeys[i+1];
   if(a.easing==='hold'||a.frame>=b.frame)continue;
   densifyInterval(dense,a.frame,b.frame,step,last);
  }
 }
 return collapseParentDrawingFrames(dense,anchors,maxCels);
}

function parentDrawingAnchor(item){
 const w=item.width||960,h=item.height||540;
 const ax=Array.isArray(item.jointAnchor)&&item.jointAnchor.length===2?item.jointAnchor[0]:w/2;
 const ay=Array.isArray(item.jointAnchor)&&item.jointAnchor.length===2?item.jointAnchor[1]:h/2;
 return {w,h,ax,ay};
}
function shotCameraForDrawing(rig,frame,fallback){
 const cam=fallback.clone();
 if(rig?.cameraKeys?.length){
  const view=sampleCamera(rig,frame);
  cam.position.fromArray(view.position);
  cam.up.set(0,1,0);
  cam.lookAt(new THREE.Vector3(...view.target));
 }
 cam.updateMatrixWorld(true);
 return cam;
}
/** Exposure-sheet hold active at frame (sorted cels; holds until the next). */
export function parentDrawingHoldAt(cels,frame){
 if(!cels?.length)return null;
 let hold=cels[0];
 for(const cel of cels){if(cel.frame>frame)break;hold=cel;}
 return hold;
}
function parentDrawingSkins(item){
 if(item.cels?.length)return item.cels.filter(cel=>cel?.texture);
 return item.texture?[{frame:0,texture:item.texture}]:[];
}
/** Bone-local radius for a parent-drawing card: child/parent spans, expanded by
 *  skinned verts weighted to this bone when a SkinnedMesh is present. */
export function parentDrawingJointExtent(bone, root=null){
 let extent=0.06;
 for(const child of bone.children){
  if(child.isBone)extent=Math.max(extent,child.position.length()*0.55);
 }
 if(bone.parent?.isBone)extent=Math.max(extent,bone.position.length()*0.45);
 if(!root)return extent;
 const boneWorld=bone.getWorldPosition(new THREE.Vector3());
 const maxR=Math.max(0.35,extent*3);
 root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.skeleton||!mesh.geometry?.attributes?.position)return;
  const bi=mesh.skeleton.bones.indexOf(bone);if(bi<0)return;
  const pos=mesh.geometry.attributes.position;
  const skinIndex=mesh.geometry.attributes.skinIndex;
  const skinWeight=mesh.geometry.attributes.skinWeight;
  if(!skinIndex||!skinWeight)return;
  const tmp=new THREE.Vector3(),raw=new THREE.Vector3();
  if(typeof mesh.applyBoneTransform==='function')mesh.skeleton.update();
  const step=Math.max(1,Math.floor(pos.count/500));
  for(let i=0;i<pos.count;i+=step){
   let w=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===bi)w+=skinWeight.getComponent(i,k);
   if(w<0.35)continue;
   let world=null;
   if(typeof mesh.applyBoneTransform==='function'){
    mesh.applyBoneTransform(i,tmp);
    if(tmp.lengthSq()>1e-8)world=tmp.applyMatrix4(mesh.matrixWorld);
   }
   if(!world){raw.fromBufferAttribute(pos,i);world=raw.clone().applyMatrix4(mesh.matrixWorld);}
   const d=world.distanceTo(boneWorld);
   if(d>maxR)continue;
   extent=Math.max(extent,d*0.65);
  }
 });
 return extent;
}
/** World anchor on/near the skinned surface for this bone (weighted verts), else bone + toward-camera nudge.
 *  applyBoneTransform is preferred; when a bind yields a degenerate point (starter boxes), fall back to
 *  authored geometry positions and keep only samples near the bone. */
export function parentDrawingSurfaceAnchor(bone,root,camera){
 const boneWorld=bone.getWorldPosition(new THREE.Vector3());
 camera.updateMatrixWorld(true);
 const toward=camera.position.clone().sub(boneWorld);
 if(!Number.isFinite(toward.x)||toward.lengthSq()<1e-8)toward.set(0,0,1);else toward.normalize();
 const invBone=bone.matrixWorld.clone().invert();
 let sumLocal=new THREE.Vector3(),weightSum=0;
 const tmp=new THREE.Vector3(),raw=new THREE.Vector3();
 const maxR=Math.max(0.45,parentDrawingJointExtent(bone,null)*4);
 if(root)root.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!mesh.skeleton||!mesh.geometry?.attributes?.position)return;
  const bi=mesh.skeleton.bones.indexOf(bone);if(bi<0)return;
  const pos=mesh.geometry.attributes.position;
  const skinIndex=mesh.geometry.attributes.skinIndex;
  const skinWeight=mesh.geometry.attributes.skinWeight;
  if(!skinIndex||!skinWeight)return;
  if(typeof mesh.applyBoneTransform==='function')mesh.skeleton.update();
  const step=Math.max(1,Math.floor(pos.count/500));
  for(let i=0;i<pos.count;i+=step){
   let w=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===bi)w+=skinWeight.getComponent(i,k);
   if(w<0.35)continue;
   let world=null;
   if(typeof mesh.applyBoneTransform==='function'){
    mesh.applyBoneTransform(i,tmp);
    if(tmp.lengthSq()>1e-8)world=tmp.clone().applyMatrix4(mesh.matrixWorld);
   }
   if(!world){raw.fromBufferAttribute(pos,i);world=raw.clone().applyMatrix4(mesh.matrixWorld);}
   if(world.distanceTo(boneWorld)>maxR)continue;
   sumLocal.addScaledVector(tmp.copy(world).applyMatrix4(invBone),w);weightSum+=w;
  }
 });
 if(weightSum>1e-6){
  const point=bone.localToWorld(sumLocal.multiplyScalar(1/weightSum));
  point.addScaledVector(toward,0.014);
  return {point,toward,fromMesh:true};
 }
 const extent=parentDrawingJointExtent(bone,root);
 return {point:boneWorld.clone().addScaledVector(toward,Math.max(0.02,extent*0.35)),toward,fromMesh:false};
}
/** Occlusion for parent drawing cards: mesh participates in depth; overlay keeps HUD-like no depthWrite. */
export function parentDrawingOcclusion(item){
 const key=item?.occlusion==='overlay'?'overlay':'mesh';
 return key==='overlay'
  ?{key,depthWrite:false,depthTest:true,note:'Overlay (no depthWrite)'}
  :{key,depthWrite:true,depthTest:true,note:'Mesh (depthWrite + depthTest)'};
}
/** GLB card placement: joint-bounds (default mesh-aware flat), billboard (FOV), conform (planar skinned), or decal (host-mesh patch). */
export function parentDrawingPlacement(item){
 const key=item?.placement;
 if(key==='billboard'||key==='conform'||key==='decal')return key;
 return 'joint-bounds';
}
/** True when a parented layer should preview as the same 3D card the GLB exports. Billboard stays a screen slide. */
export function parentDrawingWantsLive3dPreview(item){
 return parentDrawingPlacement(item)!=='billboard';
}
/** Bones that should pull a conforming card: primary, parent, grandparent, children. */
export function parentDrawingInfluenceBones(bone){
 const out=[];
 const add=b=>{if(b?.isBone&&!out.includes(b))out.push(b);};
 add(bone);add(bone?.parent);add(bone?.parent?.parent);
 if(bone)for(const c of bone.children)add(c);
 return out;
}
/** Pack up to 4 unique joint indices + normalized weights (glTF forbids duplicate joints). */
export function packParentDrawingSkin(scores,boneCount,primaryBi=0){
 const seen=new Set(),unique=[];
 for(const s of scores||[]){
  const bi=s?.bi,w=s?.w;
  if(!(w>0)||!Number.isInteger(bi)||bi<0||bi>=boneCount||seen.has(bi))continue;
  seen.add(bi);unique.push({bi,w});if(unique.length===4)break;
 }
 if(!unique.length){
  const bi=Number.isInteger(primaryBi)&&primaryBi>=0&&primaryBi<boneCount?primaryBi:0;
  unique.push({bi,w:1});seen.add(bi);
 }
 let sum=unique.reduce((a,s)=>a+s.w,0)||1;
 const indices=[0,0,0,0],weights=[0,0,0,0];
 unique.forEach((s,i)=>{indices[i]=s.bi;weights[i]=s.w/sum;});
 let filler=0;
 for(let i=unique.length;i<4;i++){
  while(filler<boneCount&&seen.has(filler))filler++;
  if(filler>=boneCount){indices[i]=indices[0];weights[i]=0;}
  else{indices[i]=filler;seen.add(filler);filler++;weights[i]=0;}
 }
 const used=new Set();
 for(let i=0;i<4;i++){
  if(used.has(indices[i])){
   weights[i]=0;let f=0;while(f<boneCount&&used.has(f))f++;
   if(f<boneCount){indices[i]=f;used.add(f);}
  }else used.add(indices[i]);
 }
 const wsum=weights[0]+weights[1]+weights[2]+weights[3];
 if(wsum>1e-8)for(let i=0;i<4;i++)weights[i]/=wsum;
 else{weights[0]=1;weights[1]=weights[2]=weights[3]=0;}
 weights[0]=1-(weights[1]+weights[2]+weights[3]);
 return {indices,weights};
}
/** Inverse-square falloff to influence bones (multi-bone bend without mesh topology). */
export function parentDrawingBoneProximityWeights(worldPoint,bone,skeletonBones){
 const bones=skeletonBones||[];
 const primaryBi=bones.indexOf(bone);
 const scores=[];
 const bw=new THREE.Vector3();
 for(const b of parentDrawingInfluenceBones(bone)){
  const bi=bones.indexOf(b);if(bi<0)continue;
  b.getWorldPosition(bw);
  const d=Math.max(1e-4,worldPoint.distanceTo(bw));
  scores.push({bi,w:1/(d*d)});
 }
 scores.sort((a,b)=>b.w-a.w);
 return packParentDrawingSkin(scores,bones.length,primaryBi);
}
/** Prefer a skinned host that includes this bone (for shared joint list / export). */
export function parentDrawingHostSkinnedMesh(root,bone){
 let host=null;
 if(root)root.traverse(mesh=>{
  if(host||!mesh.isSkinnedMesh||!mesh.skeleton?.bones?.length)return;
  if(mesh.skeleton.bones.includes(bone))host=mesh;
 });
 return host;
}
export const CONFORM_PARENT_DRAWING_SEGMENTS=8;
/** Build a subdivided SkinnedMesh card in world space, weighted to nearby bones.
 *  Uses a fresh Skeleton sharing the host bones so host boneInverses stay intact.
 *  Geometry is authored at the current pose (identity bindMatrix). Returns null if
 *  no skinned host exists (caller should fall back to flat joint-bounds). */
export function buildConformParentDrawingMesh(bone,item,camera,root,material){
 const host=parentDrawingHostSkinnedMesh(root,bone);
 if(!host)return null;
 camera.updateMatrixWorld(true);bone.updateMatrixWorld(true);root.updateMatrixWorld(true);
 const flatItem=item?.placement==='conform'?{...item,placement:undefined}:item;
 const trs=localParentDrawingTRS(bone,flatItem,camera,null,root);
 const localMat=new THREE.Matrix4().compose(trs.position,trs.quaternion,trs.scale);
 const worldMat=bone.matrixWorld.clone().multiply(localMat);
 const segs=CONFORM_PARENT_DRAWING_SEGMENTS;
 const geometry=new THREE.PlaneGeometry(1,1,segs,segs);
 const pos=geometry.attributes.position;
 const skinIndex=[],skinWeight=[];
 const v=new THREE.Vector3();
 const skeletonBones=host.skeleton.bones;
 for(let i=0;i<pos.count;i++){
  v.fromBufferAttribute(pos,i).applyMatrix4(worldMat);
  pos.setXYZ(i,v.x,v.y,v.z);
  const packed=parentDrawingBoneProximityWeights(v,bone,skeletonBones);
  skinIndex.push(...packed.indices);skinWeight.push(...packed.weights);
 }
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeight,4));
 geometry.computeVertexNormals();
 const cardSkeleton=new THREE.Skeleton(skeletonBones);
 const mesh=new THREE.SkinnedMesh(geometry,material);
 mesh.bind(cardSkeleton,new THREE.Matrix4());
 mesh.frustumCulled=false;
 mesh.userData.studioParentDrawingPlacement='conform';
 mesh.userData.studioParentDrawingSkinning=true;
 return mesh;
}
export const MAX_DECAL_PARENT_DRAWING_TRIS=2048;
export const DECAL_PARENT_DRAWING_PAD=0.12;
export const DECAL_PARENT_DRAWING_LIFT=0.01;
/** Reference ray-grid cells for DECAL_PARENT_DRAWING_RAY_REF_SPAN world units (adaptive scales from this). */
export const DECAL_PARENT_DRAWING_RAY_GRID=16;
/** Adaptive ray-grid floor / ceiling (cells per axis) — caps live preview + export cost. */
export const DECAL_PARENT_DRAWING_RAY_GRID_MIN=8;
export const DECAL_PARENT_DRAWING_RAY_GRID_MAX=32;
/** World span (card UV window axis) that maps to DECAL_PARENT_DRAWING_RAY_GRID cells. */
export const DECAL_PARENT_DRAWING_RAY_REF_SPAN=0.15;
/** Ray starts this fraction of max(planeW,planeH) along +card normal before the plane. */
export const DECAL_PARENT_DRAWING_RAY_NEAR=0.35;
/** Ray searches this fraction of max(planeW,planeH) along -card normal past the plane. */
export const DECAL_PARENT_DRAWING_RAY_FAR=1.25;
/** Prefer ray-grid mesh when at least this many card samples hit host tris. */
export const DECAL_PARENT_DRAWING_MIN_RAY_HITS=4;
/** Alpha (0–255) above which a drawing texel counts as ink for Decal silhouette clip. Matches paintAt ink check. */
export const DECAL_PARENT_DRAWING_INK_ALPHA=8;
/** Read RGBA bytes from a Three texture when available (DataTexture / canvas). Honest partial — no HTMLImage decode. */
export function parentDrawingTexturePixels(texture){
 if(!texture?.image)return null;
 const img=texture.image;
 const flipY=texture.flipY!==false;
 if(img.data&&img.width>0&&img.height>0)return {data:img.data,width:img.width|0,height:img.height|0,flipY};
 if(typeof img.getContext==='function'&&img.width>0&&img.height>0){
  try{
   const ctx=img.getContext('2d');
   if(!ctx?.getImageData)return null;
   const id=ctx.getImageData(0,0,img.width,img.height);
   return {data:id.data,width:id.width,height:id.height,flipY};
  }catch{return null;}
 }
 return null;
}
/** Sample texture alpha at card UV. Missing pixels source → 255 (treat as opaque / no clip). */
export function parentDrawingInkAlphaAt(pixels,u,v){
 if(!pixels?.data||!(pixels.width>0)||!(pixels.height>0))return 255;
 const w=pixels.width,h=pixels.height;
 const uu=Math.min(1,Math.max(0,Number(u)||0)),vv=Math.min(1,Math.max(0,Number(v)||0));
 const x=Math.min(w-1,Math.max(0,Math.floor(uu*w)));
 const yImg=pixels.flipY?(1-vv):vv;
 const y=Math.min(h-1,Math.max(0,Math.floor(yImg*h)));
 return pixels.data[(y*w+x)*4+3]|0;
}
/** Opaque-texel AABB in card UV (0..1). Null when unreadable or fully transparent. */
export function parentDrawingInkFootprintUV(pixels,threshold=DECAL_PARENT_DRAWING_INK_ALPHA){
 if(!pixels?.data||!(pixels.width>0)||!(pixels.height>0))return null;
 const w=pixels.width,h=pixels.height,data=pixels.data,thr=threshold|0;
 let minX=w,minY=h,maxX=-1,maxY=-1,opaque=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if((data[(y*w+x)*4+3]|0)>thr){
   opaque++;
   if(x<minX)minX=x;if(x>maxX)maxX=x;
   if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
 }
 if(opaque<1||maxX<minX)return null;
 const u0=minX/w,u1=(maxX+1)/w;
 let v0,v1;
 if(pixels.flipY){v0=1-(maxY+1)/h;v1=1-minY/h;}
 else{v0=minY/h;v1=(maxY+1)/h;}
 if(!(u1>u0)||!(v1>v0))return null;
 return {u0,u1,v0,v1,opaque,width:w,height:h};
}

/** Ink contour rings in card UV (0..1) for Decal/Conform silhouette clip.
 *  1) Marching-squares over alpha with edge crossings at alpha=threshold (bilinear edge
 *     restriction), then densify each cell chord by sampling the true bilinear isoline
 *     (hyperbola when the cross-term is nonzero) — hyperbolic in-cell iso.
 *  2) Fit each closed ring to piecewise cubic Beziers (Catmull-Rom→Bezier through
 *     curvature/chord keypoints) and densely resample so ultra-zoom Decal edges stay
 *     smooth after hyperbolic densify still feels coarse.
 *  Shared by live Conform/Decal preview and Download animated GLB. Honest partial —
 *  fitted stroke Bezier polylines (not recursive sub-pixel subdivision / host atlas).
 *  Null when unreadable or fully transparent. */
export const DECAL_PARENT_DRAWING_HYPERBOLIC_ISO_MAX_SAMPLES=4;
/** Interior samples per fitted cubic span (excluding endpoints). */
export const DECAL_PARENT_DRAWING_BEZIER_FIT_SAMPLES=8;
/** Keep a hyperbolic vertex as a Bezier keypoint when turning angle (rad) exceeds this. */
export const DECAL_PARENT_DRAWING_BEZIER_FIT_CORNER_RAD=0.12;
/** Force a keypoint when UV chord from the last kept point exceeds this. */
export const DECAL_PARENT_DRAWING_BEZIER_FIT_MAX_CHORD=0.04;
function evalParentDrawingCubicUV(p0,p1,p2,p3,t){
 const u=1-t;
 const a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
 return {u:a*p0.u+b*p1.u+c*p2.u+d*p3.u,v:a*p0.v+b*p1.v+c*p2.v+d*p3.v};
}
/** Fit a closed UV ring (first≈last) to piecewise cubics; return denser closed ring. */
export function fitParentDrawingInkContourRingBezier(ring,{
 samples=DECAL_PARENT_DRAWING_BEZIER_FIT_SAMPLES,
 cornerRad=DECAL_PARENT_DRAWING_BEZIER_FIT_CORNER_RAD,
 maxChord=DECAL_PARENT_DRAWING_BEZIER_FIT_MAX_CHORD
}={}){
 if(!ring||ring.length<4)return ring;
 const raw=ring.slice(0,-1);
 const n=raw.length;
 if(n<3)return ring;
 const keep=[0];
 let lastKept=0;
 for(let i=1;i<n;i++){
  const prev=raw[(i-1+n)%n],cur=raw[i],next=raw[(i+1)%n];
  const ax=cur.u-prev.u,ay=cur.v-prev.v;
  const bx=next.u-cur.u,by=next.v-cur.v;
  const la=Math.hypot(ax,ay)||1e-12,lb=Math.hypot(bx,by)||1e-12;
  const cos=Math.max(-1,Math.min(1,(ax*bx+ay*by)/(la*lb)));
  const turn=Math.acos(cos);
  const chord=Math.hypot(cur.u-raw[lastKept].u,cur.v-raw[lastKept].v);
  const isLast=i===n-1;
  if(turn>=cornerRad||chord>=maxChord||isLast){
   if(keep[keep.length-1]!==i)keep.push(i);
   lastKept=i;
  }
 }
 if(keep.length<3){
  keep.length=0;
  const step=Math.max(1,Math.floor(n/Math.max(8,Math.min(24,n))));
  for(let i=0;i<n;i+=step)keep.push(i);
  if(keep[keep.length-1]!==n-1)keep.push(n-1);
 }
 // Ensure first/last not duplicated oddly when lastKept forced n-1 and 0 is near.
 if(keep.length>=2&&keep[0]===0&&keep[keep.length-1]===n-1){
  const a=raw[0],b=raw[n-1];
  if(Math.hypot(a.u-b.u,a.v-b.v)<1e-9)keep.pop();
 }
 if(keep.length<3)return ring;
 const keys=keep.map(i=>raw[i]);
 const kn=keys.length;
 const out=[];
 const nSamp=Math.max(2,samples|0);
 for(let i=0;i<kn;i++){
  const p0=keys[(i-1+kn)%kn];
  const p1=keys[i];
  const p2=keys[(i+1)%kn];
  const p3=keys[(i+2)%kn];
  const b0=p1;
  const b1={u:p1.u+(p2.u-p0.u)/6,v:p1.v+(p2.v-p0.v)/6};
  const b2={u:p2.u-(p3.u-p1.u)/6,v:p2.v-(p3.v-p1.v)/6};
  const b3=p2;
  if(i===0)out.push({u:b0.u,v:b0.v});
  const chord=Math.hypot(b3.u-b0.u,b3.v-b0.v);
  const spanSamples=Math.max(2,Math.min(nSamp,Math.round(nSamp*(0.5+chord/Math.max(maxChord,1e-6)))));
  for(let s=1;s<=spanSamples;s++){
   const t=s/(spanSamples+1);
   out.push(evalParentDrawingCubicUV(b0,b1,b2,b3,t));
  }
  out.push({u:b3.u,v:b3.v});
 }
 const a0=out[0];
 if(Math.abs(out[out.length-1].u-a0.u)>1e-12||Math.abs(out[out.length-1].v-a0.v)>1e-12){
  out.push({u:a0.u,v:a0.v});
 }
 return out.length>=4?out:ring;
}
export function parentDrawingInkContoursUV(pixels,threshold=DECAL_PARENT_DRAWING_INK_ALPHA,opts){
 if(!pixels?.data||!(pixels.width>0)||!(pixels.height>0))return null;
 const fitBezier=opts?.fitBezier!==false;
 const w=pixels.width,h=pixels.height,data=pixels.data,thr=threshold|0;
 const alphaAt=(x,y)=>{
  if(x<0||y<0||x>=w||y>=h)return 0;
  return data[(y*w+x)*4+3]|0;
 };
 const toUV=(px,py)=>({u:px/w,v:pixels.flipY?1-py/h:py/h});
 const lerpEdge=(x0,y0,a0,x1,y1,a1)=>{
  const denom=(a0-a1)||1e-6;
  let t=(a0-thr)/denom;
  if(t<0)t=0;else if(t>1)t=1;
  return {x:x0+(x1-x0)*t,y:y0+(y1-y0)*t};
 };
 const qKey=(x,y)=>Math.round(x*1e6)+','+Math.round(y*1e6);
 const edgeKey=(x0,y0,x1,y1)=>qKey(x0,y0)+'>'+qKey(x1,y1);
 const edges=new Map();
 const addSeg=(p0,p1)=>{
  if(Math.abs(p0.x-p1.x)<1e-12&&Math.abs(p0.y-p1.y)<1e-12)return;
  edges.set(edgeKey(p0.x,p0.y,p1.x,p1.y),{x0:p0.x,y0:p0.y,x1:p1.x,y1:p1.y});
 };
 /** Sample the bilinear isoline (hyperbola) between two edge hits inside one MS cell. */
 const addHyperbolicSeg=(p0,p1,cellX,cellY,aSW,aSE,aNE,aNW)=>{
  const A=aSW,B=aSE-aSW,C=aNW-aSW,D=aSW-aSE-aNW+aNE;
  const curv=Math.abs(D)/(Math.abs(B)+Math.abs(C)+Math.abs(D)+1e-6);
  if(curv<0.04){addSeg(p0,p1);return;}
  const lx0=p0.x-cellX,ly0=p0.y-cellY,lx1=p1.x-cellX,ly1=p1.y-cellY;
  const useX=Math.abs(lx1-lx0)>=Math.abs(ly1-ly0);
  // Asymptote of the hyperbola must not sit between the endpoints.
  if(useX){
   if(Math.abs(D)>1e-9){
    const ax=-C/D;
    const lo=Math.min(lx0,lx1),hi=Math.max(lx0,lx1);
    if(ax>lo+1e-6&&ax<hi-1e-6){addSeg(p0,p1);return;}
   }
  }else if(Math.abs(D)>1e-9){
   const ay=-B/D;
   const lo=Math.min(ly0,ly1),hi=Math.max(ly0,ly1);
   if(ay>lo+1e-6&&ay<hi-1e-6){addSeg(p0,p1);return;}
  }
  const nMax=DECAL_PARENT_DRAWING_HYPERBOLIC_ISO_MAX_SAMPLES;
  const n=curv>0.35?nMax:Math.max(2,Math.round(nMax*0.5));
  const pts=[p0];
  for(let i=1;i<=n;i++){
   const t=i/(n+1);
   let lx,ly;
   if(useX){
    lx=lx0+(lx1-lx0)*t;
    const den=C+D*lx;
    if(Math.abs(den)<1e-8)continue;
    ly=(thr-A-B*lx)/den;
    if(ly<-0.05||ly>1.05)continue;
    ly=ly<0?0:ly>1?1:ly;
   }else{
    ly=ly0+(ly1-ly0)*t;
    const den=B+D*ly;
    if(Math.abs(den)<1e-8)continue;
    lx=(thr-A-C*ly)/den;
    if(lx<-0.05||lx>1.05)continue;
    lx=lx<0?0:lx>1?1:lx;
   }
   pts.push({x:cellX+lx,y:cellY+ly});
  }
  pts.push(p1);
  if(pts.length<3){addSeg(p0,p1);return;}
  for(let i=0;i<pts.length-1;i++)addSeg(pts[i],pts[i+1]);
 };
 let opaque=0,minX=w,minY=h,maxX=-1,maxY=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(alphaAt(x,y)>thr){
   opaque++;
   if(x<minX)minX=x;if(x>maxX)maxX=x;
   if(y<minY)minY=y;if(y>maxY)maxY=y;
  }
 }
 if(opaque<1||maxX<minX)return null;
 // Padded MS grid: outside samples are alpha 0 so border ink gets a closed contour.
 for(let y=-1;y<h;y++)for(let x=-1;x<w;x++){
  const aSW=alphaAt(x,y),aSE=alphaAt(x+1,y),aNE=alphaAt(x+1,y+1),aNW=alphaAt(x,y+1);
  const code=(aSW>thr?1:0)|(aSE>thr?2:0)|(aNE>thr?4:0)|(aNW>thr?8:0);
  if(code===0||code===15)continue;
  const bot=()=>lerpEdge(x,y,aSW,x+1,y,aSE);
  const rit=()=>lerpEdge(x+1,y,aSE,x+1,y+1,aNE);
  const top=()=>lerpEdge(x,y+1,aNW,x+1,y+1,aNE);
  const lef=()=>lerpEdge(x,y,aSW,x,y+1,aNW);
  const hyp=(p0,p1)=>addHyperbolicSeg(p0,p1,x,y,aSW,aSE,aNE,aNW);
  // Oriented with ink on the left (CCW around opaque region) for stable rings.
  switch(code){
   case 1:hyp(lef(),bot());break;
   case 2:hyp(bot(),rit());break;
   case 3:hyp(lef(),rit());break;
   case 4:hyp(rit(),top());break;
   case 5:{
    if((aSW+aSE+aNE+aNW)*0.25>thr){hyp(lef(),top());hyp(bot(),rit());}
    else{hyp(lef(),bot());hyp(rit(),top());}
    break;
   }
   case 6:hyp(bot(),top());break;
   case 7:hyp(lef(),top());break;
   case 8:hyp(top(),lef());break;
   case 9:hyp(top(),bot());break;
   case 10:{
    if((aSW+aSE+aNE+aNW)*0.25>thr){hyp(bot(),lef());hyp(top(),rit());}
    else{hyp(bot(),rit());hyp(top(),lef());}
    break;
   }
   case 11:hyp(top(),rit());break;
   case 12:hyp(rit(),lef());break;
   case 13:hyp(rit(),bot());break;
   case 14:hyp(bot(),lef());break;
  }
 }
 if(!edges.size)return null;
 const byStart=new Map();
 for(const e of edges.values()){
  const k=qKey(e.x0,e.y0);
  let arr=byStart.get(k);if(!arr){arr=[];byStart.set(k,arr);}arr.push(e);
 }
 const rings=[],used=new Set();
 for(const startE of edges.values()){
  const sk=edgeKey(startE.x0,startE.y0,startE.x1,startE.y1);
  if(used.has(sk))continue;
  const ring=[];
  let e=startE,guard=0;
  const startQ=qKey(startE.x0,startE.y0);
  while(e&&guard++<edges.size+4){
   const ek=edgeKey(e.x0,e.y0,e.x1,e.y1);
   if(used.has(ek))break;
   used.add(ek);
   ring.push(toUV(e.x0,e.y0));
   if(qKey(e.x1,e.y1)===startQ&&ring.length>=3){
    ring.push(toUV(e.x1,e.y1));
    break;
   }
   const cands=byStart.get(qKey(e.x1,e.y1))||[];
   let next=null;
   for(const c of cands){
    if(!used.has(edgeKey(c.x0,c.y0,c.x1,c.y1))){next=c;break;}
   }
   if(!next)break;
   e=next;
  }
  if(ring.length>=4){
   const a=ring[0],b=ring[ring.length-1];
   if(Math.abs(a.u-b.u)>1e-9||Math.abs(a.v-b.v)>1e-9)ring.push({u:a.u,v:a.v});
   rings.push(ring);
  }
 }
 if(!rings.length)return null;
 const u0=minX/w,u1=(maxX+1)/w;
 let v0,v1;
 if(pixels.flipY){v0=1-(maxY+1)/h;v1=1-minY/h;}
 else{v0=minY/h;v1=(maxY+1)/h;}
 if(!(u1>u0)||!(v1>v0))return null;
 const finalRings=fitBezier?rings.map(r=>fitParentDrawingInkContourRingBezier(r)):rings;
 const segments=[];
 for(const ring of finalRings){
  for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1];
   if(Math.abs(a.u-b.u)<1e-12&&Math.abs(a.v-b.v)<1e-12)continue;
   segments.push({u0:a.u,v0:a.v,u1:b.u,v1:b.v});
  }
 }
 return {
  rings:finalRings,segments,
  footprint:{u0,u1,v0,v1,opaque,width:w,height:h},
  opaque,width:w,height:h,
  mode:fitBezier?'fitted-bezier':'hyperbolic-iso',
  sourceMode:'hyperbolic-iso'
 };
}
export function parentDrawingPointInInkContours(contours,u,v){
 if(!contours?.segments?.length)return false;
 const uu=Number(u),vv=Number(v);
 if(!Number.isFinite(uu)||!Number.isFinite(vv))return false;
 let inside=false;
 for(const s of contours.segments){
  const x0=s.u0,y0=s.v0,x1=s.u1,y1=s.v1;
  if(((y0>vv)!==(y1>vv))&&(uu<(x1-x0)*(vv-y0)/((y1-y0)||1e-30)+x0))inside=!inside;
 }
 return inside;
}
/** First UV crossing of segment (u0,v0)->(u1,v1) with ink contour edges, t in (0,1). */
export function parentDrawingSegmentInkCrossing(contours,u0,v0,u1,v1){
 if(!contours?.segments?.length)return null;
 const ax=Number(u0),ay=Number(v0),bx=Number(u1),by=Number(v1);
 const abx=bx-ax,aby=by-ay;
 let best=null;
 for(const s of contours.segments){
  const cx=s.u0,cy=s.v0,cdx=s.u1-cx,cdy=s.v1-cy;
  const den=abx*cdy-aby*cdx;
  if(Math.abs(den)<1e-14)continue;
  const t=((cx-ax)*cdy-(cy-ay)*cdx)/den;
  const uu=((cx-ax)*aby-(cy-ay)*abx)/den;
  if(t<=1e-6||t>=1-1e-6)continue;
  if(uu<-1e-6||uu>1+1e-6)continue;
  if(!best||t<best.t)best={t,u:ax+abx*t,v:ay+aby*t};
 }
 return best;
}

/** Adaptive card→host ray density: scale nx/ny by UV-window world span (coarser on tiny
 *  stickers, denser on large cards), anisotropic for non-square footprints, slight bump
 *  when many host tris sit under the card. Caps keep (nx+1)*(ny+1) ray casts bounded.
 *  Shared by export (buildDecalParentDrawingMesh) and live Conform/Decal preview. */
export function decalRayGridDims(frame,uvBounds={u0:0,u1:1,v0:0,v1:1},candidateCount=0){
 const min=DECAL_PARENT_DRAWING_RAY_GRID_MIN,max=DECAL_PARENT_DRAWING_RAY_GRID_MAX,ref=DECAL_PARENT_DRAWING_RAY_GRID;
 const planeW=Math.max(1e-6,frame?.planeW||1),planeH=Math.max(1e-6,frame?.planeH||1);
 const u0=Number(uvBounds?.u0),u1=Number(uvBounds?.u1),v0=Number(uvBounds?.v0),v1=Number(uvBounds?.v1);
 const uFrac=Math.max(1e-6,(Number.isFinite(u1)&&Number.isFinite(u0))?(u1-u0):1);
 const vFrac=Math.max(1e-6,(Number.isFinite(v1)&&Number.isFinite(v0))?(v1-v0):1);
 const worldU=uFrac*planeW,worldV=vFrac*planeH;
 const span=Math.max(1e-6,DECAL_PARENT_DRAWING_RAY_REF_SPAN);
 // Constant-ish world sample spacing: larger UV windows / cards → more cells; tiny stickers floor at MIN.
 let nx=Math.round(ref*(worldU/span)),ny=Math.round(ref*(worldV/span));
 const nCand=Math.max(0,candidateCount|0);
 if(nCand>24){nx+=2;ny+=2;}
 if(nCand>64){nx+=2;ny+=2;}
 nx=Math.max(min,Math.min(max,nx||min));
 ny=Math.max(min,Math.min(max,ny||min));
 return {nx,ny,cells:nx*ny};
}
/** World card frame (center/axes/size) from joint-bounds TRS — shared by Conform sizing and Decal UV projection. */
export function parentDrawingCardFrame(bone,item,camera,root){
 const flatItem=(item?.placement==='conform'||item?.placement==='decal')?{...item,placement:undefined}:item;
 const trs=localParentDrawingTRS(bone,flatItem,camera,null,root);
 const localMat=new THREE.Matrix4().compose(trs.position,trs.quaternion,trs.scale);
 const worldMat=bone.matrixWorld.clone().multiply(localMat);
 const center=new THREE.Vector3(),quat=new THREE.Quaternion(),scl=new THREE.Vector3();
 worldMat.decompose(center,quat,scl);
 const right=new THREE.Vector3(1,0,0).applyQuaternion(quat);
 const up=new THREE.Vector3(0,1,0).applyQuaternion(quat);
 const normal=new THREE.Vector3(0,0,1).applyQuaternion(quat);
 return {center,right,up,normal,quat,planeW:Math.max(1e-6,Math.abs(scl.x)),planeH:Math.max(1e-6,Math.abs(scl.y))};
}
/** Planar UV of a world point onto the card frame (u/v in plane units; 0..1 covers the card). */
export function parentDrawingProjectToCardUV(worldPoint,frame){
 const to=worldPoint.clone().sub(frame.center);
 return {u:to.dot(frame.right)/frame.planeW+0.5,v:to.dot(frame.up)/frame.planeH+0.5,depth:to.dot(frame.normal)};
}
/** World point on the card plane for card UV (u,v). */
export function parentDrawingCardPoint(u,v,frame,target=null){
 const out=target||new THREE.Vector3();
 return out.copy(frame.center)
  .addScaledVector(frame.right,(u-0.5)*frame.planeW)
  .addScaledVector(frame.up,(v-0.5)*frame.planeH);
}
/** Möller–Trumbore ray×triangle. Returns {t,b0,b1,b2,point} or null. */
export function parentDrawingRayTriangle(origin,dir,w0,w1,w2){
 const e1=new THREE.Vector3().subVectors(w1,w0);
 const e2=new THREE.Vector3().subVectors(w2,w0);
 const pvec=new THREE.Vector3().crossVectors(dir,e2);
 const det=e1.dot(pvec);
 if(Math.abs(det)<1e-10)return null;
 const inv=1/det;
 const tvec=new THREE.Vector3().subVectors(origin,w0);
 const u=tvec.dot(pvec)*inv;
 if(u<0||u>1)return null;
 const qvec=new THREE.Vector3().crossVectors(tvec,e1);
 const v=dir.dot(qvec)*inv;
 if(v<0||u+v>1)return null;
 const t=e2.dot(qvec)*inv;
 if(t<0)return null;
 return {t,b0:1-u-v,b1:u,b2:v,point:origin.clone().addScaledVector(dir,t)};
}
/** Cast from card UV along −card normal into candidate host triangles (closest hit). */
export function parentDrawingCardRaycastUV(u,v,frame,candidates,{nearFrac=DECAL_PARENT_DRAWING_RAY_NEAR,farFrac=DECAL_PARENT_DRAWING_RAY_FAR}={}){
 if(!frame||!candidates?.length)return null;
 const span=Math.max(frame.planeW,frame.planeH);
 const near=Math.max(1e-4,span*nearFrac);
 const far=Math.max(near+1e-4,span*farFrac);
 const origin=parentDrawingCardPoint(u,v,frame).addScaledVector(frame.normal,near);
 const dir=frame.normal.clone().multiplyScalar(-1);
 let best=null;
 for(const tri of candidates){
  const hit=parentDrawingRayTriangle(origin,dir,tri.w0,tri.w1,tri.w2);
  if(!hit||hit.t>near+far)continue;
  if(!best||hit.t<best.t)best={...hit,i0:tri.i0,i1:tri.i1,i2:tri.i2,u,v};
 }
 return best;
}
function blendDecalHostSkin(skinIndex,skinWeight,i0,i1,i2,b0,b1,b2,boneCount,primaryBi){
 const acc=new Map();
 const add=(vi,b)=>{
  if(!(b>0))return;
  for(let k=0;k<4;k++){
   const bi=skinIndex.getComponent(vi,k),w=skinWeight.getComponent(vi,k)*b;
   if(w>0)acc.set(bi,(acc.get(bi)||0)+w);
  }
 };
 add(i0,b0);add(i1,b1);add(i2,b2);
 const scores=[...acc.entries()].map(([bi,w])=>({bi,w})).sort((a,b)=>b.w-a.w);
 return packParentDrawingSkin(scores,boneCount,primaryBi);
}
/** Build denser SkinnedMesh from card UV ray-grid hits onto candidate host tris.
 *  Clips the sample window to the drawing ink footprint and remeshes cell edges at the
 *  hyperbolic in-cell iso + fitted stroke Bezier contour so thin strokes keep a
 *  hard ink edge without discrete texel stair-steps. Honest partial — fitted
 *  Bezier polylines on hyperbolic densify (not recursive sub-pixel subdivision). */
function buildDecalRayGridMesh(candidates,frame,skinIndex,skinWeight,skeletonBones,primaryBi,material){
 if(!candidates.length)return null;
 let uMin=Infinity,uMax=-Infinity,vMin=Infinity,vMax=-Infinity;
 for(const tri of candidates){
  for(const uv of [tri.uv0,tri.uv1,tri.uv2]){
   uMin=Math.min(uMin,uv.u);uMax=Math.max(uMax,uv.u);
   vMin=Math.min(vMin,uv.v);vMax=Math.max(vMax,uv.v);
  }
 }
 if(!(uMax>uMin)||!(vMax>vMin))return null;
 const pad=0.02;
 let uu0=Math.max(0,uMin-pad),uu1=Math.min(1,uMax+pad);
 let vv0=Math.max(0,vMin-pad),vv1=Math.min(1,vMax+pad);
 if(!(uu1>uu0)||!(vv1>vv0))return null;
 const inkPixels=parentDrawingTexturePixels(material?.map);
 const inkContours=inkPixels?parentDrawingInkContoursUV(inkPixels):null;
 const inkFoot=inkContours?.footprint||(inkPixels?parentDrawingInkFootprintUV(inkPixels):null);
 let silhouetteClipped=false;
 if(inkFoot){
  const nu0=Math.max(uu0,inkFoot.u0),nu1=Math.min(uu1,inkFoot.u1);
  const nv0=Math.max(vv0,inkFoot.v0),nv1=Math.min(vv1,inkFoot.v1);
  if(!(nu1>nu0)||!(nv1>nv0))return null;
  if(nu0>uu0+1e-6||nu1<uu1-1e-6||nv0>vv0+1e-6||nv1<vv1-1e-6)silhouetteClipped=true;
  uu0=nu0;uu1=nu1;vv0=nv0;vv1=nv1;
 }
 const {nx,ny}=decalRayGridDims(frame,{u0:uu0,u1:uu1,v0:vv0,v1:vv1},candidates.length);
 if(nx<2||ny<2)return null;
 const rayHits=new Array((nx+1)*(ny+1)).fill(null);
 const inkOn=new Array(rayHits.length).fill(false);
 let hits=0;
 const thr=DECAL_PARENT_DRAWING_INK_ALPHA;
 function sampleInk(u,v){
  if(inkContours)return parentDrawingPointInInkContours(inkContours,u,v)?255:0;
  return inkPixels?parentDrawingInkAlphaAt(inkPixels,u,v):255;
 }
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const u=uu0+(uu1-uu0)*(i/nx),v=vv0+(vv1-vv0)*(j/ny);
  const hit=parentDrawingCardRaycastUV(u,v,frame,candidates);
  if(!hit)continue;
  const si=j*(nx+1)+i;
  rayHits[si]=hit;
  const a=sampleInk(hit.u,hit.v);
  if(a>thr){inkOn[si]=true;hits++;}
  else silhouetteClipped=true;
 }
 if(hits<DECAL_PARENT_DRAWING_MIN_RAY_HITS)return null;
 const positions=[],uvs=[],sIdx=[],sW=[],indices=[];
 const vertAt=new Array(rayHits.length).fill(-1);
 const edgeCache=new Map();
 let remeshedEdges=0;
 let contourCrossings=0;
 function pushVertFromHit(hit){
  const lifted=hit.point.clone().addScaledVector(frame.normal,DECAL_PARENT_DRAWING_LIFT);
  const ni=positions.length/3;
  positions.push(lifted.x,lifted.y,lifted.z);
  uvs.push(hit.u,hit.v);
  const packed=blendDecalHostSkin(skinIndex,skinWeight,hit.i0,hit.i1,hit.i2,hit.b0,hit.b1,hit.b2,skeletonBones.length,primaryBi);
  sIdx.push(...packed.indices);sW.push(...packed.weights);
  return ni;
 }
 function ensureInkVert(si){
  if(vertAt[si]>=0)return vertAt[si];
  if(!inkOn[si]||!rayHits[si])return -1;
  const ni=pushVertFromHit(rayHits[si]);
  vertAt[si]=ni;return ni;
 }
 function alphaAt(si){
  const hit=rayHits[si];
  if(!hit)return 0;
  return sampleInk(hit.u,hit.v);
 }
 function hitAtUV(u,v,h0,h1,t){
  let hit=parentDrawingCardRaycastUV(u,v,frame,candidates);
  if(!hit&&h0&&h1){
   hit={
    point:h0.point.clone().lerp(h1.point,t),
    u,v,
    i0:h0.i0,i1:h0.i1,i2:h0.i2,
    b0:h0.b0+(h1.b0-h0.b0)*t,b1:h0.b1+(h1.b1-h0.b1)*t,b2:h0.b2+(h1.b2-h0.b2)*t
   };
  }
  return hit;
 }
 function ensureEdge(si0,si1){
  const lo=Math.min(si0,si1),hi=Math.max(si0,si1),key=lo+':'+hi;
  if(edgeCache.has(key))return edgeCache.get(key);
  const h0=rayHits[si0],h1=rayHits[si1];
  const a0=alphaAt(si0),a1=alphaAt(si1);
  let ni=-1;
  if(h0&&h1&&((a0>thr)!==(a1>thr))){
   let u,v,t;
   const cross=inkContours?parentDrawingSegmentInkCrossing(inkContours,h0.u,h0.v,h1.u,h1.v):null;
   if(cross){u=cross.u;v=cross.v;t=cross.t;contourCrossings++;}
   else{
    const denom=(a0-a1)||1e-6;
    t=Math.min(1,Math.max(0,(a0-thr)/denom));
    u=h0.u+(h1.u-h0.u)*t;v=h0.v+(h1.v-h0.v)*t;
   }
   const hit=hitAtUV(u,v,h0,h1,t);
   if(hit){ni=pushVertFromHit(hit);remeshedEdges++;}
  }else{
   ni=ensureInkVert(inkOn[si0]?si0:si1);
  }
  edgeCache.set(key,ni);return ni;
 }
 function contourEdgeVert(si0,si1){
  const lo=Math.min(si0,si1),hi=Math.max(si0,si1),key='c:'+lo+':'+hi;
  if(edgeCache.has(key))return edgeCache.get(key);
  const h0=rayHits[si0],h1=rayHits[si1];
  if(!h0||!h1||!inkContours){edgeCache.set(key,-1);return -1;}
  const cross=parentDrawingSegmentInkCrossing(inkContours,h0.u,h0.v,h1.u,h1.v);
  if(!cross){edgeCache.set(key,-1);return -1;}
  const hit=hitAtUV(cross.u,cross.v,h0,h1,cross.t);
  if(!hit){edgeCache.set(key,-1);return -1;}
  const ni=pushVertFromHit(hit);remeshedEdges++;contourCrossings++;
  edgeCache.set(key,ni);return ni;
 }
 let triCount=0;
 const pushIdx=(ia,ib,ic)=>{
  if(ia<0||ib<0||ic<0||ia===ib||ib===ic||ia===ic)return;
  indices.push(ia,ib,ic);triCount++;
 };
 for(let j=0;j<ny&&triCount<MAX_DECAL_PARENT_DRAWING_TRIS;j++){
  for(let i=0;i<nx&&triCount<MAX_DECAL_PARENT_DRAWING_TRIS;i++){
   const a=j*(nx+1)+i,b=a+1,c=a+(nx+1),d=c+1;
   const ha=inkOn[a],hb=inkOn[b],hc=inkOn[c],hd=inkOn[d];
   const count=(ha?1:0)+(hb?1:0)+(hc?1:0)+(hd?1:0);
   if(count===4){
    pushIdx(ensureInkVert(a),ensureInkVert(c),ensureInkVert(b));
    pushIdx(ensureInkVert(b),ensureInkVert(c),ensureInkVert(d));
   }else if(count===3){
    silhouetteClipped=true;
    if(!ha){
     const eB=ensureEdge(a,b),eC=ensureEdge(a,c);
     pushIdx(eB,ensureInkVert(b),ensureInkVert(d));
     pushIdx(eB,ensureInkVert(d),eC);
     pushIdx(eC,ensureInkVert(d),ensureInkVert(c));
    }else if(!hb){
     const eA=ensureEdge(b,a),eD=ensureEdge(b,d);
     pushIdx(ensureInkVert(a),eA,ensureInkVert(c));
     pushIdx(eA,ensureInkVert(d),ensureInkVert(c));
     pushIdx(eA,eD,ensureInkVert(d));
    }else if(!hc){
     const eA=ensureEdge(c,a),eD=ensureEdge(c,d);
     pushIdx(ensureInkVert(a),ensureInkVert(b),eA);
     pushIdx(eA,ensureInkVert(b),ensureInkVert(d));
     pushIdx(eA,ensureInkVert(d),eD);
    }else{
     const eB=ensureEdge(d,b),eC=ensureEdge(d,c);
     pushIdx(ensureInkVert(a),ensureInkVert(c),ensureInkVert(b));
     pushIdx(ensureInkVert(b),ensureInkVert(c),eC);
     pushIdx(ensureInkVert(b),eC,eB);
    }
   }else if(count===2){
    silhouetteClipped=true;
    if(ha&&hb&&!hc&&!hd){
     const eA=ensureEdge(a,c),eB=ensureEdge(b,d);
     pushIdx(ensureInkVert(a),eA,ensureInkVert(b));
     pushIdx(ensureInkVert(b),eA,eB);
    }else if(hc&&hd&&!ha&&!hb){
     const eC=ensureEdge(c,a),eD=ensureEdge(d,b);
     pushIdx(eC,ensureInkVert(c),eD);
     pushIdx(eD,ensureInkVert(c),ensureInkVert(d));
    }else if(ha&&hc&&!hb&&!hd){
     const eA=ensureEdge(a,b),eC=ensureEdge(c,d);
     pushIdx(ensureInkVert(a),ensureInkVert(c),eA);
     pushIdx(ensureInkVert(c),eC,eA);
    }else if(hb&&hd&&!ha&&!hc){
     const eB=ensureEdge(b,a),eD=ensureEdge(d,c);
     pushIdx(eB,eD,ensureInkVert(b));
     pushIdx(ensureInkVert(b),eD,ensureInkVert(d));
    }
   }else if(inkContours&&count<=1){
    const edgePairs=[[a,b],[b,d],[d,c],[c,a]];
    const crosses=[];
    for(const [s0,s1] of edgePairs){
     let ni=-1;
     if((inkOn[s0]?1:0)!==(inkOn[s1]?1:0))ni=ensureEdge(s0,s1);
     else ni=contourEdgeVert(s0,s1);
     if(ni>=0)crosses.push(ni);
    }
    if(count===1){
     const inkSi=ha?a:hb?b:hc?c:d;
     const inkV=ensureInkVert(inkSi);
     if(inkV>=0&&crosses.length>=2){
      silhouetteClipped=true;
      pushIdx(inkV,crosses[0],crosses[1]);
      for(let k=1;k<crosses.length-1&&triCount<MAX_DECAL_PARENT_DRAWING_TRIS;k++){
       pushIdx(inkV,crosses[k],crosses[k+1]);
      }
     }
    }else if(crosses.length>=2&&rayHits[a]&&rayHits[d]){
     const cu=(rayHits[a].u+rayHits[d].u)*0.5,cv=(rayHits[a].v+rayHits[d].v)*0.5;
     if(parentDrawingPointInInkContours(inkContours,cu,cv)){
      const mid=hitAtUV(cu,cv,rayHits[a],rayHits[d],0.5);
      if(mid){
       silhouetteClipped=true;
       const midV=pushVertFromHit(mid);
       pushIdx(crosses[0],crosses[1],midV);
       for(let k=1;k<crosses.length-1&&triCount<MAX_DECAL_PARENT_DRAWING_TRIS;k++){
        pushIdx(midV,crosses[k],crosses[k+1]);
       }
      }
     }else if(crosses.length>=3){
      silhouetteClipped=true;
      for(let k=1;k<crosses.length-1&&triCount<MAX_DECAL_PARENT_DRAWING_TRIS;k++){
       pushIdx(crosses[0],crosses[k],crosses[k+1]);
      }
     }
    }
   }
  }
 }
 if(triCount<1||positions.length<9)return null;
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(sIdx,4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sW,4));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 const cardSkeleton=new THREE.Skeleton(skeletonBones);
 const mesh=new THREE.SkinnedMesh(geometry,material);
 mesh.bind(cardSkeleton,new THREE.Matrix4());
 mesh.frustumCulled=false;
 mesh.userData.studioParentDrawingPlacement='decal';
 mesh.userData.studioParentDrawingSkinning=true;
 mesh.userData.studioParentDrawingDecalMode='ray-grid';
 mesh.userData.studioParentDrawingDecalRays=hits;
 mesh.userData.studioParentDrawingDecalTris=triCount;
 mesh.userData.studioParentDrawingDecalRayGrid={nx,ny};
 mesh.userData.studioParentDrawingDecalUVBounds={u0:uu0,u1:uu1,v0:vv0,v1:vv1};
 if(inkFoot||inkContours||silhouetteClipped||remeshedEdges>0){
  mesh.userData.studioParentDrawingDecalSilhouette={
   clipped:!!(silhouetteClipped||remeshedEdges>0),
   mode:inkContours?(inkContours.mode||'fitted-bezier'):'aabb-ms',
   remeshedEdges,
   contourCrossings,
   contourRings:inkContours?inkContours.rings.length:0,
   contourSegments:inkContours?inkContours.segments.length:0,
   alpha:DECAL_PARENT_DRAWING_INK_ALPHA,
   footprint:inkFoot?{u0:inkFoot.u0,u1:inkFoot.u1,v0:inkFoot.v0,v1:inkFoot.v1,opaque:inkFoot.opaque}:null
  };
 }
 if(material){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}
 return mesh;
}

/** Clone nearby host triangles as a SkinnedMesh decal: host skin weights +
 *  adaptive card→mesh raycast UVs when the sample grid hits (planar host-tri UV fallback),
 *  clipped to the fitted Bezier drawing contour (on hyperbolic iso densify) with edge remesh. Honest partial —
 *  fitted Bezier polylines (not host atlas / recursive sub-pixel subdivision).
 *  under the card (caller falls back to Conform then flat). */
export function buildDecalParentDrawingMesh(bone,item,camera,root,material){
 const host=parentDrawingHostSkinnedMesh(root,bone);
 if(!host?.geometry?.attributes?.position)return null;
 camera.updateMatrixWorld(true);bone.updateMatrixWorld(true);root.updateMatrixWorld(true);
 if(typeof host.applyBoneTransform==='function')host.skeleton.update();
 const frame=parentDrawingCardFrame(bone,item,camera,root);
 const skeletonBones=host.skeleton.bones;
 const primaryBi=skeletonBones.indexOf(bone);
 if(primaryBi<0)return null;
 const pos=host.geometry.attributes.position;
 const skinIndex=host.geometry.attributes.skinIndex;
 const skinWeight=host.geometry.attributes.skinWeight;
 if(!skinIndex||!skinWeight)return null;
 const indexAttr=host.geometry.index;
 const triCount=indexAttr?Math.floor(indexAttr.count/3):Math.floor(pos.count/3);
 if(triCount<1)return null;
 const posed=new Map();
 const tmp=new THREE.Vector3(),raw=new THREE.Vector3();
 function posedWorld(i){
  if(posed.has(i))return posed.get(i);
  let world=null;
  if(typeof host.applyBoneTransform==='function'){
   host.applyBoneTransform(i,tmp);
   if(tmp.lengthSq()>1e-8)world=tmp.clone().applyMatrix4(host.matrixWorld);
  }
  if(!world){raw.fromBufferAttribute(pos,i);world=raw.clone().applyMatrix4(host.matrixWorld);}
  posed.set(i,world);return world;
 }
 function boneW(i){
  let w=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===primaryBi)w+=skinWeight.getComponent(i,k);
  return w;
 }
 const pad=DECAL_PARENT_DRAWING_PAD;
 const selected=[];
 const e1=new THREE.Vector3(),e2=new THREE.Vector3(),fn=new THREE.Vector3();
 for(let t=0;t<triCount&&selected.length<MAX_DECAL_PARENT_DRAWING_TRIS;t++){
  const i0=indexAttr?indexAttr.getX(t*3):t*3;
  const i1=indexAttr?indexAttr.getX(t*3+1):t*3+1;
  const i2=indexAttr?indexAttr.getX(t*3+2):t*3+2;
  const w0=posedWorld(i0),w1=posedWorld(i1),w2=posedWorld(i2);
  const uv0=parentDrawingProjectToCardUV(w0,frame);
  const uv1=parentDrawingProjectToCardUV(w1,frame);
  const uv2=parentDrawingProjectToCardUV(w2,frame);
  const cu=(uv0.u+uv1.u+uv2.u)/3,cv=(uv0.v+uv1.v+uv2.v)/3;
  if(cu<-pad||cu>1+pad||cv<-pad||cv>1+pad)continue;
  const hit=p=>p.u>=-pad&&p.u<=1+pad&&p.v>=-pad&&p.v<=1+pad;
  if(!hit(uv0)&&!hit(uv1)&&!hit(uv2))continue;
  if(Math.max(boneW(i0),boneW(i1),boneW(i2))<0.12)continue;
  e1.subVectors(w1,w0);e2.subVectors(w2,w0);fn.crossVectors(e1,e2);
  if(fn.dot(frame.normal)<=1e-8)continue; // skip back-faces and edge-on (unraycastable)
  selected.push({i0,i1,i2,uv0,uv1,uv2,w0,w1,w2});
 }
 if(!selected.length)return null;
 const rayMesh=buildDecalRayGridMesh(selected,frame,skinIndex,skinWeight,skeletonBones,primaryBi,material);
 if(rayMesh)return rayMesh;
 // Planar host-tri fallback (same topology clone as before), ink-clipped when contours readable.
 const inkPixelsPlanar=parentDrawingTexturePixels(material?.map);
 const inkContoursPlanar=inkPixelsPlanar?parentDrawingInkContoursUV(inkPixelsPlanar):null;
 const planarTris=inkContoursPlanar?selected.filter(tri=>{
  const cu=(tri.uv0.u+tri.uv1.u+tri.uv2.u)/3,cv=(tri.uv0.v+tri.uv1.v+tri.uv2.v)/3;
  return parentDrawingPointInInkContours(inkContoursPlanar,cu,cv)
   ||parentDrawingPointInInkContours(inkContoursPlanar,tri.uv0.u,tri.uv0.v)
   ||parentDrawingPointInInkContours(inkContoursPlanar,tri.uv1.u,tri.uv1.v)
   ||parentDrawingPointInInkContours(inkContoursPlanar,tri.uv2.u,tri.uv2.v);
 }):selected;
 if(!planarTris.length)return null;
 const vertMap=new Map();
 const positions=[],uvs=[],sIdx=[],sW=[],indices=[];
 function addVert(hostI,uv,world){
  if(vertMap.has(hostI))return vertMap.get(hostI);
  const lifted=world.clone().addScaledVector(frame.normal,DECAL_PARENT_DRAWING_LIFT);
  const ni=positions.length/3;
  positions.push(lifted.x,lifted.y,lifted.z);
  uvs.push(uv.u,uv.v);
  const scores=[];
  for(let k=0;k<4;k++){
   const bi=skinIndex.getComponent(hostI,k),w=skinWeight.getComponent(hostI,k);
   if(w>0)scores.push({bi,w});
  }
  const packed=packParentDrawingSkin(scores,skeletonBones.length,primaryBi);
  sIdx.push(...packed.indices);sW.push(...packed.weights);
  vertMap.set(hostI,ni);return ni;
 }
 for(const tri of planarTris){
  indices.push(addVert(tri.i0,tri.uv0,tri.w0),addVert(tri.i1,tri.uv1,tri.w1),addVert(tri.i2,tri.uv2,tri.w2));
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
 geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(sIdx,4));
 geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sW,4));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 const cardSkeleton=new THREE.Skeleton(skeletonBones);
 const mesh=new THREE.SkinnedMesh(geometry,material);
 mesh.bind(cardSkeleton,new THREE.Matrix4());
 mesh.frustumCulled=false;
 mesh.userData.studioParentDrawingPlacement='decal';
 mesh.userData.studioParentDrawingSkinning=true;
 mesh.userData.studioParentDrawingDecalMode='planar';
 mesh.userData.studioParentDrawingDecalTris=planarTris.length;
 if(inkContoursPlanar){
  mesh.userData.studioParentDrawingDecalSilhouette={
   clipped:planarTris.length<selected.length,
   mode:inkContoursPlanar.mode||'fitted-bezier',
   remeshedEdges:0,
   contourCrossings:0,
   contourRings:inkContoursPlanar.rings.length,
   contourSegments:inkContoursPlanar.segments.length,
   alpha:DECAL_PARENT_DRAWING_INK_ALPHA,
   footprint:inkContoursPlanar.footprint?{u0:inkContoursPlanar.footprint.u0,u1:inkContoursPlanar.footprint.u1,v0:inkContoursPlanar.footprint.v0,v1:inkContoursPlanar.footprint.v1,opaque:inkContoursPlanar.footprint.opaque}:null
  };
 }
 if(material){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}
 return mesh;
}
/** Bone-local TRS for a 1x1 plane sized from joint/mesh bounds, anchored on the
 *  nearby skinned surface (fallback: bone + toward-camera), facing the shot camera.
 *  jointAnchor still maps the drawing pixel onto the card. Optional item.placement
 *  'billboard' restores the older screen-sized FOV match. Conform cards call this
 *  with placement cleared to reuse joint-bounds sizing before skinning. */
export function localParentDrawingTRS(bone,item,camera,target=null,root=null){
 const {w,h,ax,ay}=parentDrawingAnchor(item);
 camera.updateMatrixWorld(true);bone.updateMatrixWorld(true);
 const camQuat=camera.quaternion.clone();
 const right=new THREE.Vector3(1,0,0).applyQuaternion(camQuat);
 const up=new THREE.Vector3(0,1,0).applyQuaternion(camQuat);
 const billboard=item?.placement==='billboard';
 let centerWorld,planeW,planeH;
 if(billboard){
  const boneWorld=bone.getWorldPosition(new THREE.Vector3());
  const dist=Math.max(1e-3,camera.position.distanceTo(boneWorld));
  const worldH=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5)*dist;
  const px=worldH/h;
  const toward=camera.position.clone().sub(boneWorld);if(toward.lengthSq()<1e-8)toward.set(0,0,1);else toward.normalize();
  centerWorld=boneWorld.clone().addScaledVector(right,(w*.5-ax)*px).addScaledVector(up,(ay-h*.5)*px).addScaledVector(toward,px*2);
  planeW=w*px;planeH=h*px;
 }else{
  const extent=Math.max(0.05,parentDrawingJointExtent(bone,root))*1.35;
  const aspect=w/Math.max(1e-6,h);
  planeH=extent;planeW=extent*aspect;
  const pxW=planeW/w,pxH=planeH/h;
  const anchor=parentDrawingSurfaceAnchor(bone,root,camera);
  centerWorld=anchor.point.clone().addScaledVector(right,(w*.5-ax)*pxW).addScaledVector(up,(ay-h*.5)*pxH);
 }
 const world=new THREE.Matrix4().compose(centerWorld,camQuat,new THREE.Vector3(planeW,planeH,1));
 const local=bone.matrixWorld.clone().invert().multiply(world);
 const pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scl=new THREE.Vector3();
 local.decompose(pos,quat,scl);
 if(target){target.position.copy(pos);target.quaternion.copy(quat);target.scale.copy(scl);}
 return {position:pos,quaternion:quat,scale:scl};
}
/** Draw canvas blend (globalCompositeOperation) → Three.js parent/screen overlay materials.
 *  Solo ink is still rasterized with Normal so the texture carries straight color+alpha;
 *  compositing against the mesh uses material.blending and/or a custom fragment patch.
 *
 *  Runtime (Three.js):
 *   - source-over → NormalBlending
 *   - multiply → MultiplyBlending (premultipliedAlpha)
 *   - screen → CustomBlending ONE / ONE_MINUS_SRC_COLOR (true Screen; premultipliedAlpha)
 *   - overlay / soft-light → MeshBasicMaterial + onBeforeCompile implementing W3C/Canvas
 *     formulas against optional tSceneColor (auto-bound by renderWithDrawingBlendSceneColor in
 *     Director, or manually via setDrawingBlendSceneColor). Without a scene-color map the
 *     shader path stays off and compositing is NormalBlending.
 *
 *  glTF portability (Download animated GLB):
 *   - Spec has no Photoshop/canvas blend modes. Exporter writes alphaMode=BLEND + opacity
 *     and material.userData → extras (studioDrawingBlend*). CustomBlending factors and
 *     onBeforeCompile GLSL do NOT survive GLTFExporter / external viewers (Blender,
 *     model-viewer, Windows 3D Viewer all show Normal alpha blend).
 *   - Re-open in Studio Three.js: extras name the Draw blend; rebuild via drawingOverlayMaterial
 *     and Director's renderWithDrawingBlendSceneColor (or setDrawingBlendSceneColor) for true Overlay/Soft-light/Screen.
 */
/** GLSL helpers shared by Overlay / Soft-light onBeforeCompile patches. */
export const DRAW_BLEND_SHADER_GLSL = {
 overlay: `vec3 studioBlendOverlay(vec3 base, vec3 blend){
  return mix(2.0*base*blend, 1.0-2.0*(1.0-base)*(1.0-blend), step(0.5, base));
}`,
 softLight: `vec3 studioBlendSoftLight(vec3 base, vec3 blend){
  vec3 dark = base-(1.0-2.0*blend)*base*(1.0-base);
  vec3 light = base+(2.0*blend-1.0)*(sqrt(max(base,vec3(0.0)))-base);
  return mix(dark, light, step(0.5, blend));
}`,
};
/** Human-readable glTF / viewer limits for Draw blend extras and docs. */
export const DRAW_BLEND_GLTF_LIMITS =
 'glTF has no canvas blend modes: only alphaMode=BLEND + baseColor/opacity travel. Multiply, Screen (CustomBlending), Overlay and Soft-light live on the Three.js material (and material extras for Studio). External viewers composite as Normal. Studio Director auto-binds tSceneColor via scene-color multipass when Overlay/Soft-light materials are in the viewport.';

export const DRAW_BLEND_TO_THREE = {
 'source-over': {
  blending: THREE.NormalBlending,
  three: 'NormalBlending',
  note: 'Normal',
  shader: null,
  needsSceneColor: false,
  gltf: 'alphaMode=BLEND; Normal in external viewers',
 },
 'multiply': {
  blending: THREE.MultiplyBlending,
  three: 'MultiplyBlending',
  note: 'Multiply',
  shader: null,
  needsSceneColor: false,
  premultipliedAlpha: true,
  gltf: 'Not in glTF; extras.studioDrawingBlend=multiply; viewers see Normal',
 },
 'screen': {
  blending: THREE.CustomBlending,
  three: 'CustomBlending(Screen)',
  note: 'Screen (CustomBlending ONE / ONE_MINUS_SRC_COLOR)',
  shader: 'screen-fixed',
  needsSceneColor: false,
  premultipliedAlpha: true,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcColorFactor,
  blendEquation: THREE.AddEquation,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  blendEquationAlpha: THREE.AddEquation,
  gltf: 'Not in glTF; extras keep screen; CustomBlending lost in exporters/viewers',
 },
 'overlay': {
  blending: THREE.NormalBlending,
  three: 'ShaderOverlay',
  note: 'Overlay (custom shader; Director auto scene-color multipass)',
  shader: 'overlay',
  needsSceneColor: true,
  gltf: 'Not in glTF; extras.studioDrawingBlend=overlay; Studio multipass binds scene color',
 },
 'soft-light': {
  blending: THREE.NormalBlending,
  three: 'ShaderSoftLight',
  note: 'Soft light (custom shader; Director auto scene-color multipass)',
  shader: 'soft-light',
  needsSceneColor: true,
  gltf: 'Not in glTF; extras.studioDrawingBlend=soft-light; Studio multipass binds scene color',
 },
};

export function drawingMaterialBlend(blend) {
 const key = blend && Object.hasOwn(DRAW_BLEND_TO_THREE, blend) ? blend : 'source-over';
 return { key, ...DRAW_BLEND_TO_THREE[key] };
}

/** Patch MeshBasicMaterial fragment shader for Overlay / Soft-light vs optional tSceneColor. */
export function applyDrawingBlendShader(mat, info) {
 if (!info?.shader || (info.shader !== 'overlay' && info.shader !== 'soft-light')) return mat;
 const mode = info.shader === 'overlay' ? 1 : 2;
 const helper = info.shader === 'overlay' ? DRAW_BLEND_SHADER_GLSL.overlay : DRAW_BLEND_SHADER_GLSL.softLight;
 mat.userData.studioDrawingBlendShader = info.shader;
 mat.userData.studioDrawingBlendNeedsSceneColor = true;
 mat.onBeforeCompile = (shader) => {
  shader.uniforms.tSceneColor = mat.userData._drawingBlendSceneColorUniform || { value: null };
  shader.uniforms.uSceneColorSize = mat.userData._drawingBlendSceneColorSize || { value: new THREE.Vector2(1, 1) };
  shader.uniforms.uDrawingBlendMode = { value: mode };
  mat.userData._drawingBlendSceneColorUniform = shader.uniforms.tSceneColor;
  mat.userData._drawingBlendSceneColorSize = shader.uniforms.uSceneColorSize;
  shader.fragmentShader = shader.fragmentShader
   .replace(
    'void main() {',
    `uniform sampler2D tSceneColor;
uniform vec2 uSceneColorSize;
uniform int uDrawingBlendMode;
${helper}
void main() {`
   )
   .replace(
    '#include <opaque_fragment>',
    `#include <opaque_fragment>
 if (uDrawingBlendMode > 0 && uSceneColorSize.x > 1.0 && uSceneColorSize.y > 1.0) {
  vec2 sceneUv = gl_FragCoord.xy / uSceneColorSize;
  vec3 base = texture2D(tSceneColor, sceneUv).rgb;
  vec3 blendColor = diffuseColor.rgb;
  vec3 mixed = uDrawingBlendMode == 1
   ? studioBlendOverlay(base, blendColor)
   : studioBlendSoftLight(base, blendColor);
  float a = diffuseColor.a;
  outgoingLight = mix(base, mixed, a);
  diffuseColor.a = 1.0;
 }`
   );
 };
 mat.customProgramCacheKey = () => 'studioDrawingBlend:' + info.shader;
 return mat;
}

/** Bind a scene-color render target texture so Overlay / Soft-light shaders can read the destination. */
export function setDrawingBlendSceneColor(mat, texture, width = 0, height = 0) {
 if (!mat?.userData) return mat;
 const w = width || texture?.image?.width || texture?.source?.data?.width || 0;
 const h = height || texture?.image?.height || texture?.source?.data?.height || 0;
 if (!mat.userData._drawingBlendSceneColorUniform) {
  mat.userData._drawingBlendSceneColorUniform = { value: texture || null };
  mat.userData._drawingBlendSceneColorSize = { value: new THREE.Vector2(Math.max(0, w), Math.max(0, h)) };
 } else {
  mat.userData._drawingBlendSceneColorUniform.value = texture || null;
  mat.userData._drawingBlendSceneColorSize.value.set(Math.max(0, w), Math.max(0, h));
 }
 if (texture && w > 1 && h > 1) {
  // Fully replace FB color with shader-composited result (already includes scene).
  mat.blending = THREE.NoBlending;
  mat.userData.studioDrawingBlendSceneBound = true;
 } else {
  mat.blending = THREE.NormalBlending;
  mat.userData.studioDrawingBlendSceneBound = false;
 }
 mat.needsUpdate = true;
 return mat;
}


/** True when a Draw blend needs a scene-color map for its Three.js shader path. */
export function drawingBlendNeedsSceneColor(blend) {
 return !!drawingMaterialBlend(blend).needsSceneColor;
}

/** Collect materials tagged studioDrawingBlendNeedsSceneColor under a root. */
export function collectDrawingBlendSceneColorMaterials(root) {
 const mats = [];
 if (!root?.traverse) return mats;
 root.traverse(o => {
  const list = Array.isArray(o.material) ? o.material : [o.material];
  for (const mat of list) {
   if (mat?.userData?.studioDrawingBlendNeedsSceneColor) mats.push({ object: o, material: mat });
  }
 });
 return mats;
}

/** Fast check: any Overlay / Soft-light drawing materials in the graph? */
export function drawingBlendSceneNeedsMultipass(root) {
 return collectDrawingBlendSceneColorMaterials(root).length > 0;
}

/** Preferred MSAA sample count for Overlay/Soft-light scene-color multipass (WebGL2). */
export const DRAWING_BLEND_SCENE_COLOR_MSAA = 4;
/** Artist-facing MSAA choices for the scene-color multipass (0 = off / aliased). */
export const DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES = Object.freeze([0, 2, 4, 8]);

/**
 * Normalize a durable / UI MSAA preference.
 * Allowed: 0, 2, 4, 8. Undefined/null/'' -> fallback (default 4). Invalid -> fallback.
 * Pure helper -- safe to unit-test without a real GL context.
 */
export function normalizeDrawingBlendSceneColorMsaa(value, fallback = DRAWING_BLEND_SCENE_COLOR_MSAA) {
 const fb = DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES.includes(fallback) ? fallback : DRAWING_BLEND_SCENE_COLOR_MSAA;
 if (value === undefined || value === null || value === '') return fb;
 const n = Math.floor(Number(value));
 if (!Number.isFinite(n)) return fb;
 return DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES.includes(n) ? n : fb;
}

/**
 * Resolve MSAA samples for the scene-color RT.
 * WebGL2 + maxSamples>=2 -> clamp preferred count; otherwise 0 (no MSAA / WebGL1 fallback).
 * Pure helper -- safe to unit-test without a real GL context.
 */
export function drawingBlendSceneColorSampleCount(renderer, preferred = DRAWING_BLEND_SCENE_COLOR_MSAA) {
 const caps = renderer?.capabilities;
 if (!caps) return 0;
 if (caps.isWebGL2 === false) return 0;
 const max = Math.max(0, Number(caps.maxSamples) || 0);
 if (max < 2) return 0;
 const want = Math.max(0, Math.floor(Number(preferred) || 0));
 if (want < 2) return 0;
 return Math.min(want, max);
}

/** Allocate / resize the offscreen color target used by the multipass (MSAA when WebGL allows).
 *  preferred: artist knob (0/2/4/8); falls back to pass.preferred then default 4. */
export function ensureDrawingBlendSceneColorTarget(renderer, pass, width, height, preferred) {
 if (!pass || !renderer) return null;
 const w = Math.max(2, Math.floor(width || renderer.domElement?.width || 2));
 const h = Math.max(2, Math.floor(height || renderer.domElement?.height || 2));
 const wantPreferred = normalizeDrawingBlendSceneColorMsaa(
  preferred !== undefined ? preferred : pass.preferred
 );
 pass.preferred = wantPreferred;
 const samples = drawingBlendSceneColorSampleCount(renderer, wantPreferred);
 if (pass.target && pass.width === w && pass.height === h && (pass.samples ?? 0) === samples && (pass.preferred ?? DRAWING_BLEND_SCENE_COLOR_MSAA) === wantPreferred) return pass.target;
 pass.target?.dispose?.();
 let allocated = samples;
 try {
  pass.target = new THREE.WebGLRenderTarget(w, h, {
   depthBuffer: true,
   stencilBuffer: false,
   samples: allocated,
  });
 } catch (err) {
  // Graceful fallback when MSAA RT allocation fails (driver / context quirks).
  if (allocated > 0) {
   allocated = 0;
   pass.target = new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: true,
    stencilBuffer: false,
    samples: 0,
   });
  } else {
   throw err;
  }
 }
 pass.target.texture.colorSpace = renderer.outputColorSpace || THREE.SRGBColorSpace;
 pass.width = w;
 pass.height = h;
 pass.samples = allocated;
 return pass.target;
}

/** Create a reusable multipass state (RT + last bind list). */
export function createDrawingBlendSceneColorPass() {
 return { target: null, width: 0, height: 0, samples: 0, preferred: DRAWING_BLEND_SCENE_COLOR_MSAA, lastMaterials: [], active: false };
}

/** Dispose the multipass render target. */
export function disposeDrawingBlendSceneColorPass(pass) {
 if (!pass) return;
 for (const mat of pass.lastMaterials || []) setDrawingBlendSceneColor(mat, null, 0, 0);
 pass.lastMaterials = [];
 pass.target?.dispose?.();
 pass.target = null;
 pass.width = 0;
 pass.height = 0;
 pass.samples = 0;
 pass.preferred = DRAWING_BLEND_SCENE_COLOR_MSAA;
 pass.active = false;
}

/**
 * Render scene with automatic Overlay / Soft-light scene-color bind.
 * Perf: single renderer.render when no needsSceneColor materials are present.
 * Otherwise: hide those meshes -> render scene to MSAA RT (when WebGL2 allows) -> bind tSceneColor -> show -> render to screen.
 * preferred: optional artist MSAA knob (0/2/4/8); omit to use pass.preferred / default 4.
 */
export function renderWithDrawingBlendSceneColor(renderer, scene, camera, pass, preferred) {
 if (!renderer || !scene || !camera) return { multipass: false, materials: 0, samples: 0 };
 const entries = collectDrawingBlendSceneColorMaterials(scene);
 if (!entries.length) {
  if (pass?.active) {
   for (const mat of pass.lastMaterials || []) setDrawingBlendSceneColor(mat, null, 0, 0);
   if (pass) { pass.lastMaterials = []; pass.active = false; }
  }
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  return { multipass: false, materials: 0, samples: 0 };
 }
 const state = pass || createDrawingBlendSceneColorPass();
 const size = new THREE.Vector2();
 renderer.getDrawingBufferSize(size);
 const target = ensureDrawingBlendSceneColorTarget(renderer, state, size.x, size.y, preferred);
 const hidden = [];
 for (const { object } of entries) {
  if (object.visible) { object.visible = false; hidden.push(object); }
 }
 const prevTarget = renderer.getRenderTarget();
 const prevAutoClear = renderer.autoClear;
 renderer.setRenderTarget(target);
 renderer.autoClear = true;
 renderer.render(scene, camera);
 for (const object of hidden) object.visible = true;
 const mats = [];
 for (const { material } of entries) {
  setDrawingBlendSceneColor(material, target.texture, state.width, state.height);
  mats.push(material);
 }
 state.lastMaterials = mats;
 state.active = true;
 renderer.setRenderTarget(prevTarget);
 renderer.autoClear = prevAutoClear;
 renderer.render(scene, camera);
 return { multipass: true, materials: mats.length, samples: state.samples || 0 };
}
function drawingOverlayMaterial(texture, opacity, blend, { depthTest = true, depthWrite = false } = {}) {
 const info = drawingMaterialBlend(blend);
 const mat = new THREE.MeshBasicMaterial({
  map: texture,
  transparent: true,
  depthWrite: !!depthWrite,
  depthTest,
  side: THREE.DoubleSide,
  opacity,
  blending: info.blending,
  premultipliedAlpha: !!info.premultipliedAlpha,
 });
 if (info.blendSrc != null) {
  mat.blendSrc = info.blendSrc;
  mat.blendDst = info.blendDst;
  mat.blendEquation = info.blendEquation;
  mat.blendSrcAlpha = info.blendSrcAlpha;
  mat.blendDstAlpha = info.blendDstAlpha;
  mat.blendEquationAlpha = info.blendEquationAlpha;
 }
 if (info.shader === 'overlay' || info.shader === 'soft-light') applyDrawingBlendShader(mat, info);
 mat.userData.studioDrawingBlend = info.key;
 mat.userData.studioDrawingBlendThree = info.three;
 mat.userData.studioDrawingBlendNote = info.note;
 mat.userData.studioDrawingBlendGltf = info.gltf || DRAW_BLEND_GLTF_LIMITS;
 mat.userData.studioDrawingBlendNeedsSceneColor = !!info.needsSceneColor;
 mat.userData.studioDrawingBlendShader = info.shader || null;
 return { mat, info };
}

export function attachParentDrawings(output,bones,parentDrawings,camera){
 if(!parentDrawings?.length)return [];
 if(!camera)throw Error('Parent drawing export needs the shot camera for placement.');
 output.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const attached=[];
 for(const item of parentDrawings){
  if(typeof item?.joint!=='string'||!item.joint)continue;
  const skins=parentDrawingSkins(item);if(!skins.length)continue;
  const bone=bones.find(b=>b.isBone&&b.name===item.joint);if(!bone)continue;
  const opacity=Number.isFinite(item.opacity)?Math.min(1,Math.max(0,item.opacity)):1;
  const multi=skins.length>1||(item.cels?.length>1);
  const open=item.cels?.length?parentDrawingHoldAt(item.cels,item.displayFrame??0):skins[0];
  const openFrame=open?.texture?open.frame:skins[0].frame;
  const occ=parentDrawingOcclusion(item);
  const placement=parentDrawingPlacement(item);
  const wantConform=placement==='conform';
  const wantDecal=placement==='decal';
  for(const cel of skins){
   const {mat,info}=drawingOverlayMaterial(cel.texture,opacity,item.blend,{depthTest:occ.depthTest,depthWrite:occ.depthWrite});
   let mesh=null;
   if(wantDecal||wantConform){
    if(wantDecal)mesh=buildDecalParentDrawingMesh(bone,item,camera,output,mat);
    if(!mesh&&wantConform)mesh=buildConformParentDrawingMesh(bone,item,camera,output,mat);
    if(!mesh&&wantDecal)mesh=buildConformParentDrawingMesh(bone,{...item,placement:'conform'},camera,output,mat);
    if(!mesh){
     // No host patch / skinned host — honest fall back to flat mesh-aware card.
     mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
     mesh.userData.studioParentDrawingPlacement='joint-bounds';
     mesh.userData.studioParentDrawingConformFallback='flat';
     if(wantDecal)mesh.userData.studioParentDrawingDecalFallback='flat';
     localParentDrawingTRS(bone,{...item,placement:undefined},camera,mesh,output);
     bone.add(mesh);
    }else{
     if(wantDecal&&mesh.userData.studioParentDrawingPlacement==='conform')mesh.userData.studioParentDrawingDecalFallback='conform';
     mesh.userData.studioParentDrawingOcclusion=occ.key;
     output.add(mesh);
    }
   }else{
    // Unit plane; joint-bounds (or billboard) size lives in local scale so bake can update per frame.
    mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
    mesh.userData.studioParentDrawingPlacement=placement==='billboard'?'billboard':'joint-bounds';
    localParentDrawingTRS(bone,item,camera,mesh,output);
    bone.add(mesh);
   }
   mesh.userData.studioDrawingBlend=info.key;
   mesh.userData.studioDrawingBlendThree=info.three;
   mesh.userData.studioDrawingBlendNote=info.note;
   mesh.userData.studioParentDrawingOcclusion=occ.key;
   const baseName=String(item.name||'Drawing');
   mesh.name=(multi?baseName+' · f'+cel.frame:baseName).slice(0,64);
   mesh.userData.studioParentDrawing=item.id||true;
   mesh.userData.studioParentDrawingJoint=item.joint;
   mesh.userData.studioParentDrawingCelFrame=cel.frame;
   // Inactive holds start hidden; bake writes discrete scale tracks when multi-frame.
   if(multi&&cel.frame!==openFrame)mesh.scale.set(0,0,0);
   attached.push(mesh);
  }
 }
 return attached;
}

function parentDrawingNeedsBake(rig,parentDrawings){
 if(parentDrawings?.some(d=>(d.cels?.length||0)>1))return true;
 return !!(rig.cameraKeys?.length||rig.keys?.length||rig.lipSync||rig.contacts?.length||rig.faceKeys?.length||rig.eyeTracks?.length||rig.channels?.some(channelActive));
}
/** Per-frame bone-local TRS so parent drawings keep facing the shot camera.
 *  Multi-cel items also step scale to zero when that hold is not exposed. */
export async function bakeParentDrawingBillboards(root,bones,rest,baseRoot,controls,rig,seconds,attached,parentDrawings,camera,tracks){
 if(!attached?.length||!parentDrawings?.length||!camera||!parentDrawingNeedsBake(rig,parentDrawings))return false;
 const frameCount=seconds*24;
 const times=Float32Array.from({length:frameCount+1},(_,f)=>f/24);
 const bakers=[];
 const conformScalers=[];
 for(const mesh of attached){
  const item=parentDrawings.find(d=>d&&(d.id||true)===mesh.userData.studioParentDrawing&&d.joint===mesh.userData.studioParentDrawingJoint)
   ||parentDrawings.find(d=>d&&d.joint===mesh.userData.studioParentDrawingJoint);
  if(!item)continue;
  const bone=bones.find(b=>b.isBone&&b.name===item.joint);if(!bone)continue;
  if(mesh.userData.studioParentDrawingPlacement==='conform'||mesh.userData.studioParentDrawingPlacement==='decal'||mesh.isSkinnedMesh){
   // Skinned cards follow skeleton animation; only stepped cel scale needs tracks.
   if(item.cels?.length)conformScalers.push({mesh,item,celFrame:mesh.userData.studioParentDrawingCelFrame??0,scale:new Float32Array((frameCount+1)*3),live:mesh.scale.clone()});
   continue;
  }
  bakers.push({mesh,item,bone,celFrame:mesh.userData.studioParentDrawingCelFrame??0,position:new Float32Array((frameCount+1)*3),rotation:new Float32Array((frameCount+1)*4),scale:new Float32Array((frameCount+1)*3)});
 }
 if(!bakers.length&&!conformScalers.length)return false;
 for(let f=0;f<=frameCount;f++){
  const frame=Math.min(f,Math.max(0,frameCount-1));
  if(bakers.length){
   const sampled=applyRigFrame(root,bones,rest,baseRoot,controls,rig,frame);
   if(sampled.warnings.length)throw Error('Export stopped at frame '+f+': '+sampled.warnings.join('; '));
   const shot=shotCameraForDrawing(rig,frame,camera);
   for(const bake of bakers){
    const local=localParentDrawingTRS(bake.bone,bake.item,shot,null,root);
    if(bake.item.cels?.length){
     const hold=parentDrawingHoldAt(bake.item.cels,frame);
     if(!hold?.texture||hold.frame!==bake.celFrame)local.scale.set(0,0,0);
    }
    local.position.toArray(bake.position,f*3);
    local.quaternion.toArray(bake.rotation,f*4);
    local.scale.toArray(bake.scale,f*3);
   }
  }
  for(const bake of conformScalers){
   const hold=parentDrawingHoldAt(bake.item.cels,frame);
   if(!hold?.texture||hold.frame!==bake.celFrame){bake.scale[f*3]=0;bake.scale[f*3+1]=0;bake.scale[f*3+2]=0;}
   else bake.live.toArray(bake.scale,f*3);
  }
  if(f%240===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 for(const bake of bakers){
  bake.mesh.position.fromArray(bake.position,0);
  bake.mesh.quaternion.fromArray(bake.rotation,0);
  bake.mesh.scale.fromArray(bake.scale,0);
  tracks.push(
   new THREE.VectorKeyframeTrack(bake.mesh.uuid+'.position',times,bake.position,THREE.InterpolateDiscrete),
   new THREE.QuaternionKeyframeTrack(bake.mesh.uuid+'.quaternion',times,bake.rotation,THREE.InterpolateDiscrete),
   new THREE.VectorKeyframeTrack(bake.mesh.uuid+'.scale',times,bake.scale,THREE.InterpolateDiscrete)
  );
 }
 for(const bake of conformScalers){
  bake.mesh.scale.fromArray(bake.scale,0);
  tracks.push(new THREE.VectorKeyframeTrack(bake.mesh.uuid+'.scale',times,bake.scale,THREE.InterpolateDiscrete));
 }
 return true;
}

// Screen-space (non-parented) drawings: camera-child overlay planes that fill the
// shot view. glTF has no 2D HUD channel; parenting textured planes to the Shot
// camera keeps them screen-locked as the camera moves. Multi-frame ink reuses
// the same stepped sibling planes + discrete zero-scale holds as parent drawings
// (capped at MAX_PARENT_DRAWING_CELS). Local TRS is camera-space (no per-frame
// billboard bake). Draw blend modes via drawingMaterialBlend (Multiply; Screen=
// true CustomBlending; Overlay/Soft-light custom shaders + optional tSceneColor). White paper / onion / correction guides stay out of export.
export const MAX_SCREEN_DRAWING_CELS=MAX_PARENT_DRAWING_CELS;
export function localScreenDrawingTRS(camera,item,target=null){
 const w=item.width||960,h=item.height||540;
 const dist=Math.max((camera.near||0.01)*4,0.25);
 const fov=Number.isFinite(camera.fov)?camera.fov:38;
 const aspect=Number.isFinite(camera.aspect)&&camera.aspect>0?camera.aspect:w/h;
 const worldH=2*Math.tan(THREE.MathUtils.degToRad(fov)*.5)*dist;
 const worldW=worldH*aspect;
 const boardAspect=w/h;
 let planeW=worldW,planeH=worldH;
 if(boardAspect>aspect){planeH=worldW/boardAspect;planeW=worldW;}
 else{planeW=worldH*boardAspect;planeH=worldH;}
 const pos=new THREE.Vector3(0,0,-dist),quat=new THREE.Quaternion(),scl=new THREE.Vector3(planeW,planeH,1);
 if(target){target.position.copy(pos);target.quaternion.copy(quat);target.scale.copy(scl);}
 return {position:pos,quaternion:quat,scale:scl};
}
function findShotCamera(output){
 let cam=null;output.traverse(o=>{if(o.isCamera&&o.name==='Shot camera')cam=o;});return cam;
}
/** Prefer the camera baked from shot keys; otherwise add a static Shot camera from the export view. */
export function ensureShotCamera(output,fallbackCamera){
 const existing=findShotCamera(output);if(existing)return existing;
 if(!fallbackCamera)throw Error('Screen drawing export needs the shot camera for overlay placement.');
 const shot=new THREE.PerspectiveCamera(
  Number.isFinite(fallbackCamera.fov)?fallbackCamera.fov:38,
  Number.isFinite(fallbackCamera.aspect)&&fallbackCamera.aspect>0?fallbackCamera.aspect:16/9,
  .01,10000
 );
 shot.name='Shot camera';
 fallbackCamera.updateMatrixWorld(true);
 shot.position.copy(fallbackCamera.getWorldPosition(new THREE.Vector3()));
 shot.quaternion.copy(fallbackCamera.getWorldQuaternion(new THREE.Quaternion()));
 output.add(shot);
 return shot;
}
export function attachScreenDrawings(shotCamera,screenDrawings){
 if(!screenDrawings?.length)return [];
 if(!shotCamera)throw Error('Screen drawing export needs the shot camera for overlay placement.');
 shotCamera.updateMatrixWorld(true);
 const attached=[];
 for(const item of screenDrawings){
  if(typeof item?.joint==='string'&&item.joint)continue;
  const skins=parentDrawingSkins(item);if(!skins.length)continue;
  const opacity=Number.isFinite(item.opacity)?Math.min(1,Math.max(0,item.opacity)):1;
  const multi=skins.length>1||(item.cels?.length>1);
  const open=item.cels?.length?parentDrawingHoldAt(item.cels,item.displayFrame??0):skins[0];
  const openFrame=open?.texture?open.frame:skins[0].frame;
  for(const cel of skins){
   const {mat,info}=drawingOverlayMaterial(cel.texture,opacity,item.blend,{depthTest:false});
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),mat);
   mesh.userData.studioDrawingBlend=info.key;
   mesh.userData.studioDrawingBlendThree=info.three;
   mesh.userData.studioDrawingBlendNote=info.note;
   const baseName=String(item.name||'Screen drawing');
   mesh.name=(multi?baseName+' · f'+cel.frame:baseName).slice(0,64);
   mesh.userData.studioScreenDrawing=item.id||true;
   mesh.userData.studioScreenDrawingCelFrame=cel.frame;
   localScreenDrawingTRS(shotCamera,item,mesh);
   if(multi&&cel.frame!==openFrame)mesh.scale.set(0,0,0);
   shotCamera.add(mesh);attached.push(mesh);
  }
 }
 return attached;
}
/** Stepped scale holds for multi-cel screen overlays (camera-local TRS stays fixed). */
export async function bakeScreenDrawingOverlays(seconds,attached,screenDrawings,tracks){
 if(!attached?.length||!screenDrawings?.length)return false;
 if(!screenDrawings.some(d=>(d.cels?.length||0)>1))return false;
 const frameCount=seconds*24;
 const times=Float32Array.from({length:frameCount+1},(_,f)=>f/24);
 let wrote=false;
 for(const mesh of attached){
  const item=screenDrawings.find(d=>d&&(d.id||true)===mesh.userData.studioScreenDrawing)
   ||screenDrawings.find(d=>d&&!d.joint&&(d.name===mesh.name||mesh.name?.startsWith(String(d.name||'')+' ')));
  if(!item?.cels?.length)continue;
  const cam=mesh.parent;if(!cam)continue;
  const live=localScreenDrawingTRS(cam,item);
  const celFrame=mesh.userData.studioScreenDrawingCelFrame??0;
  const scale=new Float32Array((frameCount+1)*3);
  for(let f=0;f<=frameCount;f++){
   const frame=Math.min(f,Math.max(0,frameCount-1));
   const hold=parentDrawingHoldAt(item.cels,frame);
   if(!hold?.texture||hold.frame!==celFrame){scale[f*3]=0;scale[f*3+1]=0;scale[f*3+2]=0;}
   else live.scale.toArray(scale,f*3);
  }
  mesh.scale.fromArray(scale,0);
  tracks.push(new THREE.VectorKeyframeTrack(mesh.uuid+'.scale',times,scale,THREE.InterpolateDiscrete));
  wrote=true;
  if(attached.indexOf(mesh)%8===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return wrote;
}
export async function exportRigGLB(root,bones,rest,rig,seconds,baseRoot=bones[0].position.clone(),controls=faceControls(root),options={}){
 validateContactChains(bones,rig.contacts||[]);syncProps(root,bones,rig);
 const contactSet=new Set((rig.contacts||[]).flatMap(c=>contactBones(bones,c)));
 const tracks=[],frameCount=seconds*24;
 // Bake joint rotations at the same sampling rate as preview, including held poses.
 // Only animated joints get tracks, bounding both output size and export memory.
 if(rig.keys.length||rig.lipSync||rig.contacts?.length||rig.faceKeys?.length||rig.eyeTracks?.length||rig.channels?.some(channelActive)){const times=Float32Array.from({length:frameCount+1},(_,f)=>f/24),animated=bones.map((bone,i)=>({bone,i})).filter(({bone,i})=>contactSet.has(bone)||(rig.eyeTracks||[]).some(t=>t.joint===i)||rig.channels?.some(c=>channelActive(c)&&c.id.startsWith(`joint:${i}:`))||rig.keys.some(k=>k.pose[i].some((v,j)=>v!==rig.pose[i][j]))),values=animated.map(()=>new Float32Array((frameCount+1)*4)),q=new THREE.Quaternion(),offset=new THREE.Quaternion();
  for(let f=0;f<=frameCount;f++){const sampled=applyRigFrame(root,bones,rest,baseRoot,controls,rig,Math.min(f,frameCount-1));if(sampled.warnings.length)throw Error('Export stopped at frame '+f+': '+sampled.warnings.join('; '));const pose=sampled.pose;animated.forEach(({i},n)=>{q.copy(rest[i]).multiply(offset.setFromEuler(new THREE.Euler(...pose[i].map(THREE.MathUtils.degToRad),'XYZ')));q.toArray(values[n],f*4);});if(f%240===0)await new Promise(resolve=>setTimeout(resolve,0));}
  animated.forEach(({bone},n)=>tracks.push(new THREE.QuaternionKeyframeTrack(bone.uuid+'.quaternion',times,values[n],THREE.InterpolateDiscrete)));
  if(rig.channels?.some(c=>channelActive(c)&&c.id.startsWith('root:'))||rig.keys.some(k=>(k.root||[0,0,0]).some((v,i)=>v!==(rig.root||[0,0,0])[i]))){const values=new Float32Array((frameCount+1)*3);for(let f=0;f<=frameCount;f++)new THREE.Vector3(...sampleChannel(rig,Math.min(f,frameCount-1),'root',[0,0,0])).add(baseRoot).toArray(values,f*3);tracks.push(new THREE.VectorKeyframeTrack(bones[0].uuid+'.position',times,values,THREE.InterpolateDiscrete));}
  bones.forEach((bone,i)=>{if(!i||!rig.channels?.some(c=>channelActive(c)&&c.id.startsWith(`position:${i}:`)))return;const values=new Float32Array((frameCount+1)*3),base=new THREE.Vector3(...restPosition(bone));for(let f=0;f<=frameCount;f++)new THREE.Vector3(...jointTravel(rig,i,Math.min(f,frameCount-1))).add(base).toArray(values,f*3);tracks.push(new THREE.VectorKeyframeTrack(bone.uuid+'.position',times,values,THREE.InterpolateDiscrete));});
  const meshes=[...new Set(controls.map(c=>c.mesh))];for(const mesh of meshes){if(!rig.keys.some(k=>k.face)&&!rig.lipSync&&!rig.faceKeys?.length&&!rig.channels?.some(c=>channelActive(c)&&c.id.startsWith('face:')))continue;const values=new Float32Array((frameCount+1)*mesh.morphTargetInfluences.length),fallback=controls.map(c=>c.base);for(let f=0;f<=frameCount;f++){const face=sampleChannel(rig,Math.min(f,frameCount-1),'face',fallback);controls.forEach((c,i)=>{if(c.mesh===mesh)values[f*mesh.morphTargetInfluences.length+c.index]=face[i];});if(f%240===0)await new Promise(resolve=>setTimeout(resolve,0));}tracks.push(new THREE.NumberKeyframeTrack(mesh.uuid+'.morphTargetInfluences',times,values,THREE.InterpolateDiscrete));}
 }
 // Animated attachments are baked in stage space: glTF cannot animate parenting.
 const animatedProps=[];
 for(const p of rig.props||[]){if(!p.attachments?.length)continue;let mesh;root.traverse(o=>{if(o.userData.studioProp===p.id)mesh=o;});animatedProps.push({id:p.id,uuid:mesh.uuid,position:new Float32Array((frameCount+1)*3),rotation:new Float32Array((frameCount+1)*4),scale:new Float32Array((frameCount+1)*3)});}
 if(animatedProps.length){const times=Float32Array.from({length:frameCount+1},(_,f)=>f/24);
  for(let f=0;f<=frameCount;f++){const result=applyRigFrame(root,bones,rest,baseRoot,controls,rig,Math.min(f,frameCount-1));if(result.warnings.length)throw Error('Export stopped at frame '+f+': '+result.warnings.join('; '));const inverse=root.matrixWorld.clone().invert();
   for(const p of animatedProps){let mesh;root.traverse(o=>{if(o.userData.studioProp===p.id)mesh=o;});const matrix=inverse.clone().multiply(mesh.matrixWorld),v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(v,q,s);const rebuilt=new THREE.Matrix4().compose(v,q,s);if(matrix.elements.some((x,i)=>Math.abs(x-rebuilt.elements[i])>1e-5))throw Error('Prop export would lose shear. Apply character scale first.');v.toArray(p.position,f*3);q.toArray(p.rotation,f*4);if(!mesh.visible)s.set(0,0,0);s.toArray(p.scale,f*3);}
   if(f%240===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  for(const p of animatedProps)tracks.push(new THREE.VectorKeyframeTrack(p.uuid+'.position',times,p.position,THREE.InterpolateDiscrete),new THREE.QuaternionKeyframeTrack(p.uuid+'.quaternion',times,p.rotation,THREE.InterpolateDiscrete),new THREE.VectorKeyframeTrack(p.uuid+'.scale',times,p.scale,THREE.InterpolateDiscrete));
 }
 // glTF has no visibility channel: a stepped zero scale hides a static creation.
 // Keep these sparse and parent-local so long shots do not bake static props.
 const appearingProps=[];
 for(const p of rig.props||[])if(p.firstFrame>0&&!p.attachments?.length){let mesh;root.traverse(o=>{if(o.userData.studioProp===p.id)mesh=o;});appearingProps.push(mesh.uuid);const appears=p.firstFrame<frameCount;
  tracks.push(new THREE.VectorKeyframeTrack(mesh.uuid+'.scale',appears?[0,p.firstFrame/24,seconds]:[0,seconds],appears?[0,0,0,...p.size,...p.size]:[0,0,0,0,0,0],THREE.InterpolateDiscrete));
 }
 applyPose(bones,rest,rig.pose);applyChannels(bones,baseRoot,controls,rig);syncProps(root,bones,rig);removeFeatureMeshes(root);root.updateMatrixWorld(true);
 // Export a detached skeleton clone. Identity GLB wrapper groups can be omitted,
 // making skinned meshes scene roots without changing any bind or pose transforms.
 let output=cloneSkeleton(root);const originals=[],copies=[];root.traverse(o=>originals.push(o));output.traverse(o=>copies.push(o));copies.forEach((o,i)=>o.uuid=originals[i].uuid);
 for(const id of appearingProps)copies.find(o=>o.uuid===id).scale.set(0,0,0);
 for(const p of animatedProps){const mesh=copies.find(o=>o.uuid===p.uuid);output.add(mesh);mesh.position.fromArray(p.position,0);mesh.quaternion.fromArray(p.rotation,0);mesh.scale.fromArray(p.scale,0);}
 if(!output.isScene&&output.position.lengthSq()===0&&output.quaternion.equals(new THREE.Quaternion())&&output.scale.equals(new THREE.Vector3(1,1,1))){const scene=new THREE.Scene();scene.add(...output.children);output=scene;}
 bakeCameraTracks(output,rig,seconds,tracks);
 // Parent drawings: bone-parented flat cards (TRS bake) or conforming/decal SkinnedMesh cards.
 const parentMeshes=attachParentDrawings(output,copies.filter(o=>o.isBone),options.parentDrawings,options.camera);
 if(parentMeshes.length)await bakeParentDrawingBillboards(root,bones,rest,baseRoot,controls,rig,seconds,parentMeshes,options.parentDrawings,options.camera,tracks);
 // Screen-space drawings: camera-facing overlay planes (Shot camera children).
 if(options.screenDrawings?.length){
  const shotCam=ensureShotCamera(output,options.camera);
  const screenMeshes=attachScreenDrawings(shotCam,options.screenDrawings);
  if(screenMeshes.length)await bakeScreenDrawingOverlays(seconds,screenMeshes,options.screenDrawings,tracks);
 }
 return new GLTFExporter().parseAsync(output,{binary:true,trs:true,onlyVisible:false,maxTextureSize:2048,animations:tracks.length?[new THREE.AnimationClip('Director shot',seconds,tracks)]:[]});
}
export function disposeObject(root,{textures=true}={}){const maps=new Set();root?.traverse(o=>{o.geometry?.dispose();o.skeleton?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){for(const value of Object.values(m))if(value?.isTexture)maps.add(value);m.dispose();}});if(textures)for(const t of maps){t.source?.data?.close?.();t.dispose();}}
