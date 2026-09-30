import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {starterCharacter,jointsOf,faceControls,applyPose,applyChannels,exportRigGLB,readRigGLB,disposeObject} from './director-3d-engine.js';
import {morphKey,remapShapeState} from './director-deformation.js';
import {validateRig3D} from './director-3d-state.js';

// Index changes must follow bone identity, never a coincidentally matching name.
export function remapJointState(rig,oldIds,bones){
 const ids=bones.map(b=>b.userData.studioBoneId),map=oldIds.map(id=>ids.indexOf(id));
 if(oldIds.length!==rig.names.length||new Set(oldIds).size!==oldIds.length||oldIds.some(id=>!id)||ids.some(id=>!id)||map.some(i=>i<0)||map[0]!==0||new Set(ids).size!==ids.length)throw Error('Existing joints could not be preserved. Original kept.');
 const next=structuredClone(rig),pose=value=>{const out=bones.map(()=>[0,0,0]);map.forEach((n,i)=>out[n]=[...value[i]]);return out;};
 next.names=bones.map(b=>b.name);next.pose=pose(next.pose);
 for(const key of [...next.keys,...next.savedPoses||[]])key.pose=pose(key.pose);
 if(next.limits){const limits=bones.map(()=>null);map.forEach((n,i)=>limits[n]=next.limits[i]);next.limits=limits;}
 for(const c of next.contacts||[])c.joint=map[c.joint];
 for(const p of next.props||[])for(const entry of [p,...p.attachments||[]])if(entry.joint!==null)entry.joint=map[entry.joint];
 for(const p of next.handPoses||[]){p.wrist=map[p.wrist];p.joints=p.joints.map(i=>map[i]);}
 for(const c of next.channels||[])c.id=c.id.replace(/^(joint|position):(\d+):/,(_,kind,i)=>`${kind}:${map[Number(i)]}:`);
 validateRig3D(next);return next;
}

const normalized=name=>name.replaceAll(' ','_');
const near=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1e-5);
export async function upgradeStarterFingers({root,rig,rest,baseRoot,baseFaces}){
 const copy=cloneSkeleton(root),plain=starterCharacter(),template=starterCharacter({fingers:true});let loaded;
 copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.isBone)o.userData.studioBoneId=o.uuid;if(o.isMesh)o.userData.studioMorphId=o.uuid;});
 try{
  const oldBones=jointsOf(copy),reference=jointsOf(plain),full=jointsOf(template),oldIds=oldBones.map(b=>b.userData.studioBoneId);
  if(oldBones.length!==15||oldBones.some((b,i)=>normalized(b.name)!==normalized(reference[i].name)))throw Error('This upgrade needs the original 15-joint Studio starter. Imported or already articulated characters are kept unchanged.');
  applyPose(oldBones,rest,oldBones.map(()=>[0,0,0]));applyChannels(oldBones,baseRoot,faceControls(copy),{pose:rig.pose,root:[0,0,0],face:baseFaces});copy.updateMatrixWorld(true);
  for(let i=0;i<15;i++)if(!near(oldBones[i].matrixWorld.elements,reference[i].matrixWorld.elements))throw Error('The starter rest skeleton was changed. Original kept.');
  let body,referenceBody,newBody;plain.traverse(o=>{if(o.isSkinnedMesh)referenceBody=o;});template.traverse(o=>{if(o.isSkinnedMesh)newBody=o;});
  copy.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.length===15){if(body)throw Error('The starter body is ambiguous. Original kept.');body=o;}});
  if(!body||Object.keys(body.geometry.morphAttributes).length||!near(body.matrixWorld.elements,referenceBody.matrixWorld.elements)||!near(body.bindMatrix.elements,referenceBody.bindMatrix.elements))throw Error('Use an unchanged starter body; separate eye shapes are supported.');
  if(body.geometry.getAttribute('uv')||!body.geometry.index||!near(Array.from(body.geometry.index.array),Array.from(referenceBody.geometry.index.array)))throw Error('Starter topology or UVs were edited. Original kept.');
  for(const attr of ['position','normal','skinIndex','skinWeight','color']){
   const a=body.geometry.getAttribute(attr),b=referenceBody.geometry.getAttribute(attr);
   if(!a||a.count!==b.count||a.itemSize!==b.itemSize)throw Error('Starter geometry was edited. Original kept.');
   for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)if(Math.abs(a.getComponent(i,j)-b.getComponent(i,j))>1e-5)throw Error('Starter geometry was edited. Original kept.');
  }
  if(body.skeleton.bones.some((b,i)=>normalized(b.name)!==normalized(referenceBody.skeleton.bones[i].name)))throw Error('Starter skin binding changed. Original kept.');
  if(body.skeleton.boneInverses.some((matrix,i)=>!near(matrix.elements,referenceBody.skeleton.boneInverses[i].elements)))throw Error('Starter inverse bind transforms changed. Original kept.');
  const lookup=new Map(oldBones.map(b=>[normalized(b.name),b]));
  for(const b of full)if(!lookup.has(normalized(b.name))){const added=new THREE.Bone();added.name=normalized(b.name);added.position.copy(b.position);added.quaternion.copy(b.quaternion);added.userData={studioBoneId:added.uuid,studioRestPosition:added.position.toArray()};lookup.get(normalized(b.parent.name)).add(added);lookup.set(normalized(b.name),added);}
  body.geometry.dispose();body.geometry=newBody.geometry.clone();body.skeleton.dispose();copy.updateMatrixWorld(true);body.bind(new THREE.Skeleton(newBody.skeleton.bones.map(b=>lookup.get(normalized(b.name)))),body.bindMatrix);
  const bones=jointsOf(copy),faces=faceControls(copy),shapeIds=faces.map(morphKey),base=baseFaces||faces.map(c=>c.base);
  let next=remapJointState(rig,oldIds,bones);
  const neutral={...structuredClone(next),pose:bones.map(()=>[0,0,0]),root:[0,0,0],keys:[],face:base,props:(next.props||[]).map(p=>{const value=structuredClone(p);delete value.attachments;delete value.firstFrame;return value;})};
  for(const field of ['channels','contacts','faceKeys','lipSync','loop'])delete neutral[field];
  const data=await exportRigGLB(copy,bones,bones.map(b=>b.quaternion.clone()),neutral,1,baseRoot,faces);
  loaded=await readRigGLB(data);next=remapJointState(next,bones.map(b=>b.userData.studioBoneId),jointsOf(loaded));next=remapShapeState(next,shapeIds,faceControls(loaded),base);validateRig3D(next);
  const result={root:loaded,rig:next,data};loaded=null;return result;
 }finally{disposeObject(copy,{textures:false});disposeObject(plain);disposeObject(template);if(loaded)disposeObject(loaded);}
}
