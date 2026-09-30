import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {applyRigFrame,jointsOf,faceControls,disposeObject} from './director-3d-engine.js';
import {solveRigIK} from './director-ik3d.js';
import {contactBones} from './director-performance-engine.js';
import {sampleRig3D,sampleChannel,validateRig3D,MAX_3D_KEYS} from './director-3d-state.js';
import {channelActive} from './director-channels.js';

// Author a pickup key and attachment together, preserving the prop's world pose.
export function keyPropGrip({root,rest,baseRoot,rig,frame,lastFrame,propId,joint,position,rotation}){
 if(!Number.isInteger(frame)||!Number.isInteger(lastFrame)||lastFrame>=86400||frame<0||frame>lastFrame||![position,rotation].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||position.some(v=>Math.abs(v)>10000)||rotation.some(v=>Math.abs(v)>360))throw Error('Choose a frame inside the shot and valid grip position / rotation.');
 if(!rig.keys.some(k=>k.frame===frame)&&rig.keys.length>=MAX_3D_KEYS)throw Error('Use at most 120 keys per 3D shot.');
 const copy=cloneSkeleton(root);copy.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
 try{
  const bones=jointsOf(copy),controls=faceControls(copy),chain=contactBones(bones,{joint}),indices=chain.map(b=>bones.indexOf(b));
  if((rig.contacts||[]).some(c=>frame>=c.start&&frame<=c.end&&contactBones(bones,c).some(b=>chain.includes(b))))throw Error('This arm has an active contact hold. Edit the hold before authoring a pickup.');
  if(rig.channels?.some(c=>channelActive(c)&&indices.some(i=>c.id.startsWith(`joint:${i}:`))))throw Error('Arm rotation channels would override this pose. Edit or disable them first.');
  const state=applyRigFrame(copy,bones,rest,baseRoot,controls,rig,frame);if(state.warnings.length)throw Error(state.warnings.join('; '));
  let object;copy.traverse(o=>{if(o.userData.studioProp===propId)object=o;});if(!object)throw Error('Select an existing stage prop.');
  const matrix=object.matrixWorld.clone(),scale=object.getWorldScale(new THREE.Vector3());
  if(scale.x<=0||Math.abs(scale.x-scale.y)>1e-5||Math.abs(scale.x-scale.z)>1e-5)throw Error('Apply non-uniform or mirrored prop scale before aligning a grip.');
  const target=new THREE.Vector3(...position).applyMatrix4(matrix),orientation=object.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation.map(THREE.MathUtils.degToRad),'XYZ')));
  const start=chain[0].getWorldPosition(new THREE.Vector3()),elbow=chain[1].getWorldPosition(new THREE.Vector3()),axis=target.clone().sub(start);
  const pole=elbow.clone().sub(start).cross(axis).lengthSq()>1e-12?elbow.toArray():null;
  const solved=solveRigIK(copy,bones,rest,{...rig,pose:state.pose},joint,target.toArray(),pole),hand=bones[joint];
  const local=rest[joint].clone().invert().multiply(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation)),e=new THREE.Euler().setFromQuaternion(local,'XYZ');
  solved.pose[joint]=[e.x,e.y,e.z].map(THREE.MathUtils.radToDeg);
  const limits=rig.limits?.[joint];if(limits&&solved.pose[joint].some((v,i)=>v<limits[0][i]-1e-5||v>limits[1][i]+1e-5))throw Error('Grip orientation exceeds wrist limits. Adjust the grip or limits.');
  hand.quaternion.copy(rest[joint]).multiply(local);copy.updateMatrixWorld(true);
  if(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)>.01||hand.getWorldQuaternion(new THREE.Quaternion()).angleTo(orientation)>.02)throw Error('Grip is outside reach or joint limits. Move the body or prop first.');
  const relative=hand.matrixWorld.clone().invert().multiply(matrix),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();relative.decompose(p,q,s);
  if(s.toArray().some(v=>v<=0)||new THREE.Matrix4().compose(p,q,s).elements.some((v,i)=>Math.abs(v-relative.elements[i])>1e-5))throw Error('This grip would shear or mirror the prop. Apply scale first.');
  const angles=new THREE.Euler().setFromQuaternion(q,'XYZ'),next=structuredClone(rig),previous=next.keys.find(k=>k.frame===frame);
  const underlying={...rig,channels:[],faceKeys:[],lipSync:undefined},pose=previous?structuredClone(previous.pose):sampleRig3D(underlying,frame);
  for(const i of indices)pose[i]=solved.pose[i];
  const key={...(previous||{root:sampleChannel(underlying,frame,'root',[0,0,0]),face:sampleChannel(underlying,frame,'face',controls.map(c=>c.base))}),frame,easing:previous?.easing||'smooth',pose};
  next.keys=[...next.keys.filter(k=>k.frame!==frame),key].sort((a,b)=>a.frame-b.frame);
  const prop=next.props.find(p=>p.id===propId);prop.attachments=[...(prop.attachments||[]).filter(k=>k.frame!==frame),{frame,joint,position:p.toArray(),rotation:[angles.x,angles.y,angles.z].map(THREE.MathUtils.radToDeg),size:s.toArray()}].sort((a,b)=>a.frame-b.frame);
  validateRig3D(next);return next;
 }finally{disposeObject(copy,{textures:false});}
}
