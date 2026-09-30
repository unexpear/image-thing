import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {skeletonGroups} from './director-stage.js';
import {jointsOf,faceControls,applyPose,applyChannels,exportRigGLB,readRigGLB,disposeObject} from './director-3d-engine.js';
import {morphKey} from './director-deformation.js';
import {validateRig3D} from './director-3d-state.js';

export async function extractActor({root,rig,rest,baseRoot,selected,baseFaces}){
 const copy=cloneSkeleton(root);let loaded;
 copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.isMesh)o.userData.studioMorphId=o.uuid;if(o.isBone)o.userData.studioBoneId=o.uuid;});
 try{
  const oldBones=jointsOf(copy),oldFaces=faceControls(copy),group=skeletonGroups(oldBones).find(g=>g.joints.includes(selected));
  if(!group||oldBones.length!==rig.names.length||rest.length!==oldBones.length)throw Error('Choose a joint on the character to save.');
  const indices=group.joints,member=new Set(indices.map(i=>oldBones[i])),base=baseFaces||oldFaces.map(c=>c.base);
  applyPose(oldBones,rest,oldBones.map(()=>[0,0,0]));applyChannels(oldBones,baseRoot,oldFaces,{root:[0,0,0],face:base});copy.updateMatrixWorld(true);
  const propRoots=[];copy.traverse(o=>{if(o.userData.studioProp)propRoots.push(o);});
  for(const prop of propRoots){prop.removeFromParent();disposeObject(prop,{textures:false});}
  const keep=new Set([copy]),meshes=[];
  const include=o=>{for(let p=o;p;p=p.parent)keep.add(p);};
  for(const bone of member)include(bone);
  copy.traverse(o=>{
   if(!o.isMesh)return;
   if(o.isSkinnedMesh){const belongs=o.skeleton.bones.some(b=>member.has(b));if(!belongs)return;if(o.skeleton.bones.some(b=>!member.has(b)))throw Error('A mesh is bound to more than one skeleton. Separate its skin in a 3D editor before extracting this actor.');}
   else{let belongs=false;for(let p=o.parent;p;p=p.parent)if(member.has(p))belongs=true;if(!belongs)return;}
   meshes.push(o);include(o);
  });
  if(!meshes.length)throw Error('No character meshes belong to the selected skeleton.');
  function prune(parent){for(const child of [...parent.children])if(!keep.has(child)){parent.remove(child);disposeObject(child,{textures:false});}else prune(child);}
  prune(copy);
  const bones=jointsOf(copy),faces=faceControls(copy),jointIds=bones.map(b=>b.userData.studioBoneId),faceIds=faces.map(morphKey),oldFaceIds=oldFaces.map(morphKey),faceIndices=faceIds.map(id=>oldFaceIds.indexOf(id));
  if(bones.length!==indices.length||bones.some((b,i)=>b!==oldBones[indices[i]])||faceIndices.some(i=>i<0))throw Error('Character identity changed during extraction. Original kept.');
  const neutral={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],face:faceIndices.map(i=>base[i])};
  const data=await exportRigGLB(copy,bones,indices.map(i=>rest[i]),neutral,1,bones[0].position.clone(),faces);
  loaded=await readRigGLB(data);const newBones=jointsOf(loaded),newFaces=faceControls(loaded);
  if(newBones.length!==bones.length||newBones.some((b,i)=>b.userData.studioBoneId!==jointIds[i])||newFaces.length!==faces.length||newFaces.some((f,i)=>morphKey(f)!==faceIds[i]))throw Error('Export changed character controls. Original kept.');
  const jointMap=new Map(indices.map((old,i)=>[old,i])),faceMap=new Map(faceIndices.map((old,i)=>[old,i])),pose=p=>indices.map(i=>[...p[i]]),face=p=>faceIndices.map(i=>p?.[i]??base[i]);
  const next={version:1,model:null,names:newBones.map(b=>b.name),pose:pose(rig.pose),root:[0,0,0],keys:[],face:face(rig.face)};
  if(rig.limits)next.limits=indices.map(i=>structuredClone(rig.limits[i]));
  if(rig.rotationMode)next.rotationMode=rig.rotationMode;
  if(rig.savedPoses)next.savedPoses=rig.savedPoses.map(p=>({name:p.name,pose:pose(p.pose),root:[0,0,0],face:face(p.face)}));
  if(newFaces.length&&rig.expressions)next.expressions=rig.expressions.map(p=>({name:p.name,face:face(p.face)}));
  for(const field of ['eyeMap','mouthMap'])if(rig[field]){const map={};for(const [key,i] of Object.entries(rig[field]))if(faceMap.has(i))map[key]=faceMap.get(i);if(Object.keys(map).length)next[field]=map;}
  if(rig.handPoses)next.handPoses=rig.handPoses.filter(p=>jointMap.has(p.wrist)&&p.joints.every(i=>jointMap.has(i))).map(p=>({...structuredClone(p),wrist:jointMap.get(p.wrist),joints:p.joints.map(i=>jointMap.get(i))}));
  validateRig3D(next);const result={root:loaded,rig:next,data};loaded=null;return result;
 }finally{disposeObject(copy,{textures:false});if(loaded)disposeObject(loaded);}
}
