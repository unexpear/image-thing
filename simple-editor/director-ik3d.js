import * as THREE from 'three';
import {limitPose} from './director-3d-state.js';
export function solveRigIK(root,bones,rest,rig,index,target,pole=null){
 const end=bones[index],lower=end?.parent,upper=lower?.parent;
 if(!lower?.isBone||!upper?.isBone)throw Error('Select a hand or foot with two parent joints.');
 if(!Array.isArray(target)||target.length!==3||!target.every(Number.isFinite))throw Error('Enter a valid 3D target.');
 if(pole!==null&&(!Array.isArray(pole)||pole.length!==3||!pole.every(Number.isFinite)))throw Error('Enter a valid elbow / knee bend target.');
 root.updateMatrixWorld(true);const scale=new THREE.Vector3();for(const joint of [lower,upper]){joint.getWorldScale(scale);if(Math.abs(scale.x-scale.y)>1e-5||Math.abs(scale.x-scale.z)>1e-5||scale.x<=0)throw Error('Apply non-uniform or mirrored model scale in your 3D editor before using IK.');}
 const destination=new THREE.Vector3(...target),from=new THREE.Vector3(),to=new THREE.Vector3(),q=new THREE.Quaternion();
 // A perfectly straight chain has no angular gradient for a nearer collinear target.
 const start=upper.getWorldPosition(new THREE.Vector3()),middle=lower.getWorldPosition(new THREE.Vector3()),finish=end.getWorldPosition(new THREE.Vector3()),reach=start.distanceTo(middle)+middle.distanceTo(finish);
 if(pole){const axis=destination.clone().sub(start),direction=new THREE.Vector3(...pole).sub(start);if(axis.lengthSq()<1e-12||direction.cross(axis).lengthSq()<1e-12)throw Error('Place the bend target away from the shoulder-to-hand or hip-to-foot line.');}
 let seeded=false;
 if(start.distanceTo(destination)<reach-.001&&new THREE.Vector3().subVectors(middle,start).cross(new THREE.Vector3().subVectors(finish,middle)).length()<1e-6){const axis=end.position.clone().normalize().cross(new THREE.Vector3(1,0,0));if(axis.lengthSq()<1e-6)axis.set(0,1,0);lower.quaternion.multiply(q.setFromAxisAngle(axis.normalize(),.1));seeded=true;}
 for(let iteration=0;iteration<80;iteration++){
  for(const joint of iteration===0&&seeded?[upper,lower]:[lower,upper]){
   root.updateMatrixWorld(true);end.getWorldPosition(from);joint.worldToLocal(from);to.copy(destination);joint.worldToLocal(to);if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)continue;
   q.setFromUnitVectors(from.normalize(),to.normalize());joint.quaternion.multiply(q).normalize();const i=bones.indexOf(joint),limit=rig.limits?.[i];
   if(limit){const relative=rest[i].clone().invert().multiply(joint.quaternion),angles=new THREE.Euler().setFromQuaternion(relative,'XYZ');const values=[angles.x,angles.y,angles.z].map((v,j)=>THREE.MathUtils.degToRad(Math.max(limit[0][j],Math.min(limit[1][j],THREE.MathUtils.radToDeg(v)))));joint.quaternion.copy(rest[i]).multiply(q.setFromEuler(new THREE.Euler(...values,'XYZ')));}
  }
  root.updateMatrixWorld(true);if(end.getWorldPosition(from).distanceTo(destination)<.001)break;
 }
 let poleLimited=false,poleApplied=false;const endOrientation=end.getWorldQuaternion(new THREE.Quaternion());
 if(pole){
  root.updateMatrixWorld(true);
  const axis=end.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
  const bend=lower.getWorldPosition(new THREE.Vector3()).sub(start),wanted=new THREE.Vector3(...pole).sub(start);
  bend.addScaledVector(axis,-bend.dot(axis));wanted.addScaledVector(axis,-wanted.dot(axis));
  if(bend.lengthSq()>1e-12&&wanted.lengthSq()>1e-12){
   bend.normalize();wanted.normalize();const angle=Math.atan2(axis.dot(bend.clone().cross(wanted)),bend.dot(wanted));
   const world=upper.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
   const parent=upper.parent?upper.parent.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();upper.quaternion.copy(parent.invert().multiply(world)).normalize();poleApplied=true;
   root.updateMatrixWorld(true);end.quaternion.copy(end.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(endOrientation));
  }
 }
 const affected=pole?[lower,upper,end]:[lower,upper];
 const pose=structuredClone(rig.pose);for(const joint of affected){const i=bones.indexOf(joint),euler=new THREE.Euler().setFromQuaternion(rest[i].clone().invert().multiply(joint.quaternion),'XYZ');pose[i]=[euler.x,euler.y,euler.z].map(THREE.MathUtils.radToDeg);}
 const limited=limitPose(rig,pose);
 if(pole)for(const joint of affected){const i=bones.indexOf(joint);if(limited[i].some((v,j)=>Math.abs(v-pose[i][j])>1e-6))poleLimited=true;joint.quaternion.copy(rest[i]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...limited[i].map(THREE.MathUtils.degToRad),'XYZ')));}
 root.updateMatrixWorld(true);
 return {pose:limited,distance:end.getWorldPosition(from).distanceTo(destination),poleApplied,poleLimited};
}
