import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {jointsOf,faceControls,applyPose,applyChannels,exportRigGLB,readRigGLB,disposeObject} from './director-3d-engine.js';
import {morphKey,remapShapeState} from './director-deformation.js';
import {validateRig3D} from './director-3d-state.js';

// Keep original indices: animation, contacts and props refer to this joint order.
export function skeletonGroups(bones){
 const indices=new Map(bones.map((bone,i)=>[bone,i])),groups=new Map();
 bones.forEach((bone,i)=>{
  let root=bone;
  for(let parent=bone.parent;parent;parent=parent.parent)if(indices.has(parent))root=parent;
  const rootIndex=indices.get(root);
  if(!groups.has(rootIndex))groups.set(rootIndex,{root:rootIndex,name:root.name||'Unnamed root',joints:[]});
  groups.get(rootIndex).joints.push(i);
 });
 return [...groups.values()];
}

export function shiftSkeletonMotion(rig,bones,selected,offset){
 const group=skeletonGroups(bones).find(g=>g.joints.includes(selected));
 if(!group||!Array.isArray(offset)||offset.length!==3||offset.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))throw Error('Select a skeleton and valid XYZ offsets.');
 const members=new Set(group.joints),next=structuredClone(rig),index=group.root;
 for(const p of rig.props||[])if(p.attachments?.length&&[p,...p.attachments].some(k=>members.has(k.joint)))throw Error('This character participates in prop attachment events. Adjust the handoff staging manually before shifting its motion.');
 bones[index].updateWorldMatrix(true,false);
 const origin=new THREE.Vector3(),delta=new THREE.Vector3(...offset),parent=bones[index].parent;
 if(parent){origin.applyMatrix4(parent.matrixWorld);delta.applyMatrix4(parent.matrixWorld).sub(origin);}
 for(const c of next.contacts||[])if(members.has(c.joint))c.target=c.target.map((v,i)=>v+delta.getComponent(i));
 if(index===0){next.root=(next.root||[0,0,0]).map((v,i)=>v+offset[i]);for(const key of next.keys)key.root=(key.root||[0,0,0]).map((v,i)=>v+offset[i]);}
 next.channels??=[];
 offset.forEach((amount,axis)=>{
  if(!amount)return;
  const id=index===0?`root:${axis}`:`position:${index}:${axis}`;let channel=next.channels.find(c=>c.id===id);
  if(channel?.enabled===false||channel?.blendTarget!==undefined)throw Error('Enable ordinary travel channels before shifting this skeleton. Blended travel needs manual editing.');
  if(channel?.keys.length)channel.keys.forEach(k=>k.value+=amount);
  else if(index!==0){if(!channel){channel={id,keys:[]};next.channels.push(channel);}channel.keys=[{frame:0,value:amount,easing:'linear'}];}
 });
 validateRig3D(next);return next;
}

function ownedClone(source){const copy=cloneSkeleton(source);copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.isMesh)o.userData.studioMorphId=o.uuid;if(o.isBone)o.userData.studioBoneId=o.uuid;});return copy;}

export async function removeStageActor({root,rest,baseRoot,rig,selected,baseFaces}){
 const copy=ownedClone(root);let loaded;
 try{
  const oldBones=jointsOf(copy),oldFaces=faceControls(copy),groups=skeletonGroups(oldBones),group=groups.find(g=>g.joints.includes(selected));
  if(!group||oldBones.length!==rig.names.length||rest.length!==oldBones.length)throw Error('Choose a joint on the character to remove.');
  if(groups.length<2)throw Error('Keep at least one character in this rig. Replace the rig to start over.');
  const removed=new Set(group.joints),members=new Set(group.joints.map(i=>oldBones[i])),base=baseFaces||oldFaces.map(c=>c.base);
  for(const prop of rig.props||[])if([prop,...prop.attachments||[]].some(p=>removed.has(p.joint)))throw Error('Detach props and remove attachment events involving this actor before removing it.');
  applyPose(oldBones,rest,oldBones.map(()=>[0,0,0]));applyChannels(oldBones,baseRoot,oldFaces,{root:[0,0,0],face:base});copy.updateMatrixWorld(true);
  const cut=new Set([oldBones[group.root]]),inside=(node,ancestor)=>{for(let p=node;p;p=p.parent)if(p===ancestor)return true;return false;};
  copy.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.some(b=>members.has(b))){if(o.skeleton.bones.some(b=>!members.has(b)))throw Error('A skin is shared across skeletons. Separate it before removing this actor.');cut.add(o);}});
  for(const node of cut){
   if(oldBones.some(b=>!members.has(b)&&inside(b,node)))throw Error('The actor mesh contains another skeleton. Separate its containers before removing it.');
   node.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.some(b=>!members.has(b)))throw Error('Another actor’s mesh is attached to this character. Separate it before removal.');});
  }
  for(const node of [...cut].filter(n=>![...cut].some(other=>other!==n&&inside(n,other)))){node.removeFromParent();disposeObject(node,{textures:false});}
  const bones=jointsOf(copy),faces=faceControls(copy),indices=bones.map(b=>oldBones.indexOf(b)),jointMap=new Map(indices.map((old,i)=>[old,i])),oldFaceIds=oldFaces.map(morphKey),faceIndices=faces.map(c=>oldFaceIds.indexOf(morphKey(c))),faceMap=new Map(faceIndices.map((old,i)=>[old,i]));
  if(indices.some(i=>i<0)||faceIndices.some(i=>i<0))throw Error('Remaining controls could not be identified. Original kept.');
  const next=structuredClone(rig),pose=p=>indices.map(i=>[...p[i]]),face=p=>faceIndices.map(i=>p?.[i]??base[i]),promoted=indices[0]!==0;
  next.names=bones.map(b=>b.name);next.pose=pose(rig.pose);next.face=face(rig.face);
  if(promoted)next.root=[0,0,0];
  for(const key of [...next.keys,...next.savedPoses||[]]){key.pose=pose(key.pose);if(key.face!==undefined)key.face=face(key.face);if(promoted)key.root=[0,0,0];}
  for(const key of [...next.faceKeys||[],...next.expressions||[]])key.face=face(key.face);
  if(next.limits)next.limits=indices.map(i=>next.limits[i]);
  if(next.contacts)next.contacts=next.contacts.filter(c=>jointMap.has(c.joint)).map(c=>({...c,joint:jointMap.get(c.joint)}));
  if(next.eyeTracks)next.eyeTracks=next.eyeTracks.filter(t=>jointMap.has(t.joint)).map(t=>({...t,joint:jointMap.get(t.joint)}));
  for(const prop of next.props||[])for(const p of [prop,...prop.attachments||[]])if(p.joint!==null)p.joint=jointMap.get(p.joint);
  if(next.handPoses)next.handPoses=next.handPoses.filter(p=>jointMap.has(p.wrist)&&p.joints.every(i=>jointMap.has(i))).map(p=>({...p,wrist:jointMap.get(p.wrist),joints:p.joints.map(i=>jointMap.get(i))}));
  for(const field of ['mouthMap','eyeMap'])if(next[field]){next[field]=Object.fromEntries(Object.entries(next[field]).filter(([,i])=>faceMap.has(i)).map(([key,i])=>[key,faceMap.get(i)]));if(!Object.keys(next[field]).length)delete next[field];}
  if(!next.mouthMap)delete next.lipSync;
  if(next.channels)next.channels=next.channels.flatMap(c=>{
   const parts=c.id.split(':'),index=Number(parts[1]);
   if(parts[0]==='root')return promoted?[]:[c];
   if(parts[0]==='face')return faceMap.has(index)?[{...c,id:'face:'+faceMap.get(index)}]:[];
   if(!jointMap.has(index))return [];
   const joint=jointMap.get(index);return [{...c,id:parts[0]==='position'&&joint===0?'root:'+parts[2]:`${parts[0]}:${joint}:${parts[2]}`}];
  });
  validateRig3D(next);
  const neutral={...structuredClone(next),pose:bones.map(()=>[0,0,0]),root:[0,0,0],keys:[],face:face(base),props:(next.props||[]).map(p=>{const value=structuredClone(p);delete value.attachments;delete value.firstFrame;return value;})};
  for(const field of ['channels','contacts','eyeTracks','faceKeys','lipSync','loop'])delete neutral[field];
  const data=await exportRigGLB(copy,bones,indices.map(i=>rest[i]),neutral,1,bones[0].position.clone(),faces);
  loaded=await readRigGLB(data);const resultBones=jointsOf(loaded);
  if(resultBones.length!==bones.length||resultBones.some((b,i)=>b.userData.studioBoneId!==bones[i].userData.studioBoneId))throw Error('Export changed remaining joints. Original kept.');
  const resultRig=remapShapeState(next,faces.map(morphKey),faceControls(loaded),face(base));validateRig3D(resultRig);
  const result={root:loaded,rig:resultRig,data};loaded=null;return result;
 }finally{disposeObject(copy,{textures:false});if(loaded)disposeObject(loaded);}
}

export async function placeStageActor({root,rest,baseRoot,rig,selected,offset,yaw=0,baseFaces}){
 if(!Array.isArray(offset)||offset.length!==3||offset.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||!Number.isFinite(yaw)||Math.abs(yaw)>360)throw Error('Enter valid placement offsets and a turn between −360 and 360 degrees.');
 const copy=ownedClone(root);let loaded;
 try{
  const bones=jointsOf(copy),faces=faceControls(copy),group=skeletonGroups(bones).find(g=>g.joints.includes(selected)),base=baseFaces||faces.map(c=>c.base),oldKeys=faces.map(morphKey);
  if(!group||bones.length!==rig.names.length||rest.length!==bones.length)throw Error('Select a character joint and reopen the shot if its skeleton changed.');
  const members=new Set(group.joints.map(i=>bones[i])),indices=new Set(group.joints);
  for(const p of rig.props||[])if(p.attachments?.length&&[p,...p.attachments].some(k=>indices.has(k.joint)))throw Error('This character participates in prop attachment events. Restage its handoffs before changing model placement.');
  applyPose(bones,rest,bones.map(()=>[0,0,0]));applyChannels(bones,baseRoot,faces,{root:[0,0,0],face:base});copy.updateMatrixWorld(true);
  const actor=bones[group.root],parent=actor.parent,meshes=[];
  if(!parent)throw Error('The character needs a model parent.');
  for(let p=parent;p;p=p.parent)if(p.scale.x<=0||Math.abs(p.scale.x-p.scale.y)>1e-6||Math.abs(p.scale.x-p.scale.z)>1e-6)throw Error('Apply nonuniform or mirrored parent scale in a 3D editor before placing this character.');
  copy.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.some(b=>members.has(b))){if(o.skeleton.bones.some(b=>!members.has(b)))throw Error('A skin is shared across skeletons. Separate it before changing character placement.');meshes.push(o);}});
  if(!meshes.length)throw Error('No skinned character mesh belongs to this skeleton.');
  const inside=(node,ancestor)=>{for(let p=node;p;p=p.parent)if(p===ancestor)return true;return false;};
  const external=meshes.filter(m=>!inside(m,actor));
  for(const mesh of external)if(inside(actor,mesh)||bones.some(b=>inside(b,mesh)))throw Error('This mesh contains skeleton roots. Separate the mesh and skeleton containers in a 3D editor first.');
  const wrapper=new THREE.Group();wrapper.name='Character placement';const slot=parent.children.indexOf(actor),parentWorld=parent.matrixWorld.clone();
  parent.add(wrapper);parent.children.splice(parent.children.indexOf(wrapper),1);parent.children.splice(slot,0,wrapper);wrapper.add(actor);copy.updateMatrixWorld(true);
  for(const mesh of external.filter(m=>!external.some(other=>other!==m&&inside(m,other)))){
   const local=wrapper.matrixWorld.clone().invert().multiply(mesh.matrixWorld),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();local.decompose(position,quaternion,scale);
   const rebuilt=new THREE.Matrix4().compose(position,quaternion,scale);
   if(scale.toArray().some(n=>n<=0)||local.elements.some((v,i)=>Math.abs(v-rebuilt.elements[i])>1e-5))throw Error('Character placement would lose a mesh transform. Apply mesh scale first.');
   wrapper.add(mesh);mesh.position.copy(position);mesh.quaternion.copy(quaternion);mesh.scale.copy(scale);
  }
  // Rotate around the neutral root, in its original parent's coordinates.
  wrapper.rotation.y=THREE.MathUtils.degToRad(yaw);wrapper.position.copy(actor.position).add(new THREE.Vector3(...offset)).sub(actor.position.clone().applyQuaternion(wrapper.quaternion));wrapper.updateMatrix();
  const delta=parentWorld.clone().multiply(wrapper.matrix).multiply(parentWorld.clone().invert()),rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(delta)),next=structuredClone(rig);
  for(const contact of next.contacts||[])if(indices.has(contact.joint)){contact.target=new THREE.Vector3(...contact.target).applyMatrix4(delta).toArray();contact.orientation=rotation.clone().multiply(new THREE.Quaternion(...contact.orientation)).normalize().toArray();}
  const neutral={...structuredClone(next),pose:bones.map(()=>[0,0,0]),keys:[],root:[0,0,0],face:base,props:(next.props||[]).map(p=>{const value=structuredClone(p);delete value.attachments;delete value.firstFrame;return value;})};
  for(const field of ['channels','contacts','eyeTracks','faceKeys','lipSync','loop'])delete neutral[field];
  if(jointsOf(copy).some((b,i)=>b!==bones[i]))throw Error('Placement changed joint ordering. Original kept.');
  const data=await exportRigGLB(copy,bones,rest,neutral,1,baseRoot,faces);if(data.byteLength>50*1024*1024)throw Error('The placed model exceeds 50 MB.');
  loaded=await readRigGLB(data);const resultBones=jointsOf(loaded);
  if(resultBones.length!==bones.length||resultBones.some((b,i)=>b.userData.studioBoneId!==bones[i].userData.studioBoneId))throw Error('Export changed character controls. Original kept.');
  const resultRig=remapShapeState(next,oldKeys,faceControls(loaded),base);validateRig3D(resultRig);
  const result={root:loaded,rig:resultRig,data};loaded=null;return result;
 }finally{disposeObject(copy,{textures:false});if(loaded)disposeObject(loaded);}
}

export async function appendStaticProp({root,rest,baseRoot,rig,prop,name,baseFaces,libraryAssetId,sourceFileName,sourceUrl,contentHash}){
 let vertices=0,meshes=0;
 prop.traverse(o=>{if(o.isBone||o.isSkinnedMesh||o.morphTargetInfluences?.length)throw Error('Import a static prop without skeletons or shape keys.');if(o.isMesh){meshes++;vertices+=o.geometry.getAttribute('position')?.count||0;}});
 if(!meshes||vertices>200000)throw Error('Use a static prop with at most 200,000 vertices.');
 const entry={id:crypto.randomUUID(),name,shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]};
 if(libraryAssetId!==undefined&&libraryAssetId!==null&&libraryAssetId!==''){
  if(typeof libraryAssetId!=='string'||!libraryAssetId.trim()||libraryAssetId.length>100||/[\\/]/.test(libraryAssetId))throw Error('Invalid library prop link on the stage mesh.');
  entry.libraryAssetId=libraryAssetId.trim();
 }
 if(typeof sourceFileName==='string'&&sourceFileName.trim()){
  const fileName=sourceFileName.trim();
  if(fileName.length>200||/[\\/]/.test(fileName))throw Error('Invalid source file name on the stage mesh.');
  entry.sourceFileName=fileName;
 }
 if(typeof sourceUrl==='string'&&sourceUrl.trim()){
  const url=sourceUrl.trim();
  if(url.length>500||!url.startsWith('/view?'))throw Error('Invalid source media URL on the stage mesh.');
  entry.sourceUrl=url;
 }
 if(typeof contentHash==='string'&&contentHash.trim()){
  if(!/^[0-9a-f]{64}$/i.test(contentHash.trim()))throw Error('Invalid GLB content hash on the stage mesh.');
  entry.contentHash=contentHash.trim().toLowerCase();
 }
 const next=structuredClone(rig);next.props=[...(next.props||[]),entry];validateRig3D(next);
 const copy=ownedClone(root),container=new THREE.Group();let loaded;
 try{
  const imported=ownedClone(prop);imported.traverse(o=>{delete o.userData.studioProp;});container.userData={studioProp:entry.id,shape:'mesh'};container.add(imported);copy.add(container);
  const bones=jointsOf(copy),faces=faceControls(copy),oldKeys=faces.map(morphKey),base=baseFaces||faces.map(c=>c.base);
  if(bones.length!==rig.names.length)throw Error('The skeleton changed. Reopen the shot.');
  const neutral={...structuredClone(next),pose:bones.map(()=>[0,0,0]),keys:[],root:[0,0,0],face:base,props:next.props.map(p=>{const value=structuredClone(p);delete value.attachments;delete value.firstFrame;return value;})};
  for(const key of ['channels','contacts','eyeTracks','faceKeys','lipSync','loop'])delete neutral[key];
  const data=await exportRigGLB(copy,bones,rest,neutral,1,baseRoot,faces);if(data.byteLength>50*1024*1024)throw Error('Combined model exceeds 50 MB. Simplify the prop.');
  loaded=await readRigGLB(data);const resultBones=jointsOf(loaded);
  if(resultBones.length!==bones.length||resultBones.some((b,i)=>b.userData.studioBoneId!==bones[i].userData.studioBoneId))throw Error('Prop import changed joint ordering; original kept.');
  const resultRig=remapShapeState(next,oldKeys,faceControls(loaded),base);validateRig3D(resultRig);
  const result={root:loaded,rig:resultRig,data,propId:entry.id};loaded=null;return result;
 }finally{disposeObject(copy,{textures:false});if(loaded)disposeObject(loaded);}
}

// Append a neutral actor; retain all existing bone indices and shot animation.
export async function appendStageActor({root,rest,baseRoot,rig,actor,name,position,yaw=0,baseFaces}){
 if(typeof name!=='string'||!name.trim()||name.length>60||!Array.isArray(position)||position.length!==3||position.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)||!Number.isFinite(yaw)||Math.abs(yaw)>360)throw Error('Give the actor a short name and valid stage placement.');
 const stage=new THREE.Scene();let loaded;
 try{
  const first=ownedClone(root),second=ownedClone(actor);stage.add(first);const placement=new THREE.Group();placement.name=name.trim();placement.position.fromArray(position);placement.rotation.y=THREE.MathUtils.degToRad(yaw);placement.add(second);stage.add(placement);
  const oldBones=jointsOf(first),newBones=jointsOf(second);if(oldBones.length!==rig.names.length||rest.length!==oldBones.length)throw Error('The current skeleton changed. Reopen the shot.');
  // Imported clips are not applied. Remove embedded Studio prop bookkeeping from
  // the added actor, so it cannot collide with this shot's managed prop IDs.
  second.traverse(o=>{delete o.userData.studioProp;if(o.isBone||o.isMesh)o.name=(name.trim()+' / '+(o.name||'Joint')).slice(0,190);});
  applyPose(oldBones,rest,oldBones.map(()=>[0,0,0]));oldBones[0].position.copy(baseRoot);
  const oldFaces=faceControls(first),oldKeys=oldFaces.map(morphKey),oldBase=baseFaces||oldFaces.map(c=>c.base),bones=jointsOf(stage),faces=faceControls(stage);if(faces.length>256)throw Error('The stage supports at most 256 shape controls.');
  const allRest=bones.map(b=>b.quaternion.clone()),neutral={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],face:faces.map((c,i)=>i<oldBase.length?oldBase[i]:c.base),props:(rig.props||[]).map(p=>{const copy=structuredClone(p);delete copy.attachments;delete copy.firstFrame;return copy;})};
  const data=await exportRigGLB(stage,bones,allRest,neutral,1,baseRoot,faces);loaded=await readRigGLB(data);const loadedBones=jointsOf(loaded),loadedFaces=faceControls(loaded);
  if(loadedBones.length!==bones.length||loadedBones.some((b,i)=>b.userData.studioBoneId!==bones[i].userData.studioBoneId))throw Error('Actor import changed joint ordering; original shot kept.');
  const next=remapShapeState(rig,oldKeys,loadedFaces,oldBase),extend=p=>[...p.map(v=>[...v]),...newBones.map(()=>[0,0,0])];next.pose=extend(next.pose);for(const k of next.keys)k.pose=extend(k.pose);for(const p of next.savedPoses||[])p.pose=extend(p.pose);if(next.limits)next.limits.push(...newBones.map(()=>null));next.names=loadedBones.map(b=>b.name);delete next.camera;validateRig3D(next);
  const result={root:loaded,rig:next,data,firstNewJoint:oldBones.length};loaded=null;return result;
 }finally{disposeObject(stage,{textures:false});if(loaded)disposeObject(loaded);}
}
