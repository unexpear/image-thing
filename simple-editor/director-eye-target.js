import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {jointsOf,faceControls,applyRigFrame,disposeObject} from './director-3d-engine.js';
import {sampleRig3D,validateRig3D} from './director-3d-state.js';
import {contactBones,eyeAimDegrees,resolveEyeTarget} from './director-performance-engine.js';

const axes={'+X':[1,0,0],'-X':[-1,0,0],'+Y':[0,1,0],'-Y':[0,-1,0],'+Z':[0,0,1],'-Z':[0,0,-1]};
export function keyEyeTarget({root,rig,rest,baseRoot,joint,target,axis='+Z',frame,lastFrame}){
 if(!Number.isInteger(frame)||!Number.isInteger(lastFrame)||lastFrame>=86400||frame<0||frame>lastFrame||!Object.hasOwn(axes,axis)||!Array.isArray(target)||target.length!==3||target.some(n=>!Number.isFinite(n)||Math.abs(n)>10000))throw Error('Choose a frame inside the shot, a forward axis and valid world target coordinates.');
 const copy=cloneSkeleton(root);copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
 try{
  const bones=jointsOf(copy),bone=bones[joint],faces=faceControls(copy);
  if(!Number.isInteger(joint)||!bone||!bone.parent||bones.length!==rig.names.length||rest.length!==bones.length)throw Error('Select the eye bone to aim.');
  for(let p=bone;p;p=p.parent)if(p.scale.x<=0||Math.abs(p.scale.x-p.scale.y)>1e-5||Math.abs(p.scale.x-p.scale.z)>1e-5)throw Error('Apply nonuniform or mirrored scale before aiming this bone.');
  for(const c of rig.contacts||[])if(frame>=c.start&&frame<=c.end)for(const end of contactBones(bones,c))for(let p=end;p;p=p.parent)if(p===bone)throw Error('A contact hold depends on this bone. Edit the hold before aiming it.');
  for(const c of rig.channels||[])if(c.id.startsWith(`joint:${joint}:`)&&(c.enabled===false||c.blendTarget!==undefined))throw Error('Use ordinary enabled rotation channels for this eye; edit blended or disabled channels first.');
  const state=applyRigFrame(copy,bones,rest,baseRoot,faces,rig,frame);if(state.warnings.length)throw Error(state.warnings.join('; '));
  const resolved=resolveEyeTarget(copy,bone,target),direction=new THREE.Vector3(...resolved.point).sub(bone.getWorldPosition(new THREE.Vector3()));
  if(direction.lengthSq()<1e-10)throw Error('Place the target away from the eye.');direction.normalize();
  const angles=eyeAimDegrees(bone,rest[joint],axis,resolved.point,sampleRig3D(rig,frame)[joint],rig.limits?.[joint]);
  const next=structuredClone(rig),start=sampleRig3D(rig,0)[joint];next.channels??=[];
  angles.forEach((value,i)=>{const id=`joint:${joint}:${i}`;let channel=next.channels.find(c=>c.id===id);
   if(!channel){channel={id,keys:frame>0?[{frame:0,value:start[i],easing:'smooth',kind:'key'}]:[]};next.channels.push(channel);}
   const previous=channel.keys.find(k=>k.frame===frame);channel.keys=[...channel.keys.filter(k=>k.frame!==frame),{...previous,frame,value,easing:previous?.easing||'smooth',kind:previous?.kind||'key'}].sort((a,b)=>a.frame-b.frame);
  });
  validateRig3D(next);
  applyRigFrame(copy,bones,rest,baseRoot,faces,next,frame);
  if(new THREE.Vector3(...axes[axis]).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).angleTo(direction)>.001)throw Error('The current rig could not reach this gaze target. Original kept.');
  return next;
 }finally{disposeObject(copy,{textures:false});}
}
export function addEyeTrack({root,rig,rest,baseRoot,joint,target,axis='+Z',start,end,lastFrame}){
 if(!Number.isInteger(start)||!Number.isInteger(end)||!Number.isInteger(lastFrame)||start<0||end<start||end>lastFrame||lastFrame>=86400)throw Error('Choose a track range inside the shot.');
 const next=structuredClone(rig);next.eyeTracks=[...(next.eyeTracks||[]),{id:crypto.randomUUID(),joint,axis,target:[...target],start,end}];validateRig3D(next);
 const copy=cloneSkeleton(root);copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
 try{
  const bones=jointsOf(copy),bone=bones[joint],faces=faceControls(copy);
  if(!bone?.parent||bones.length!==rig.names.length||rest.length!==bones.length)throw Error('Select the eye bone to aim.');
  for(let p=bone;p;p=p.parent)if(p.scale.x<=0||Math.abs(p.scale.x-p.scale.y)>1e-5||Math.abs(p.scale.x-p.scale.z)>1e-5)throw Error('Apply nonuniform or mirrored scale before aiming this bone.');
  for(const c of rig.contacts||[])if(start<=c.end&&c.start<=end)for(const held of contactBones(bones,c))for(let p=held;p;p=p.parent)if(p===bone)throw Error('A contact hold depends on this bone. Edit the hold before tracking it.');
  for(let frame=start;frame<=end;frame++){const state=applyRigFrame(copy,bones,rest,baseRoot,faces,next,frame);if(state.warnings.some(w=>w.startsWith((rig.names[joint]||'Eye')+':')))throw Error(state.warnings.filter(w=>w.startsWith((rig.names[joint]||'Eye')+':')).join('; '));}
  return next;
 }finally{disposeObject(copy,{textures:false});}
}
export function pickScenePoint(root,camera,x,y){
 if(!root||!camera?.isCamera||![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))throw Error('Click inside the 3D view.');
 const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(x,y),camera);
 const hit=raycaster.intersectObject(root,true).find(item=>item.object?.isMesh);
 if(!hit)throw Error('The ray did not hit a character or prop.');
 return hit.point.toArray();
}
export function isEyeBone(bone){const name=bone?.name||'';return /eye/i.test(name)&&!/brow|lid|lash/i.test(name);}
export function linkedEyeJoints(bones,joint,linked){
 if(!linked)return [joint];
 const eyes=bones.map((bone,index)=>isEyeBone(bone)?index:-1).filter(index=>index>=0);
 if(!eyes.includes(joint))throw Error('Select an eye bone to aim both eyes, or unlink them.');
 if(eyes.length<2)throw Error('Only one eye bone was found. Unlink to aim it alone.');
 return eyes;
}
export function gazeEyes({root,rig,rest,baseRoot,joint,target,axis='+Z',frame,start,end,lastFrame,linked=true,action}){
 const bones=jointsOf(root),joints=linkedEyeJoints(bones,joint,linked);
 let next=structuredClone(rig);next.eyesLinked=!!linked;
 if(action==='remove'){next.eyeTracks=(next.eyeTracks||[]).filter(track=>!joints.includes(track.joint));if(!next.eyeTracks.length)delete next.eyeTracks;validateRig3D(next);return next;}
 if(action==='track'){
  next.eyeTracks=(next.eyeTracks||[]).filter(track=>!(joints.includes(track.joint)&&track.start<=end&&start<=track.end));
  if(next.eyeTracks&&!next.eyeTracks.length)delete next.eyeTracks;
  for(const eye of joints)next=addEyeTrack({root,rig:next,rest,baseRoot,joint:eye,target,axis,start,end,lastFrame});
  next.eyesLinked=!!linked;return next;
 }
 for(const eye of joints)next=keyEyeTarget({root,rig:next,rest,baseRoot,joint:eye,target,axis,frame,lastFrame});
 next.eyesLinked=!!linked;return next;
}
export function removeEyeTracks(rig,joint){
 const next=structuredClone(rig);next.eyeTracks=(next.eyeTracks||[]).filter(t=>t.joint!==joint);if(!next.eyeTracks.length)delete next.eyeTracks;validateRig3D(next);return next;
}
