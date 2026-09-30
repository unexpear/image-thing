import * as THREE from 'three';
import {solveRigIK} from './director-ik3d.js';
import {sampleProp} from './director-performance-state.js';
export function contactBones(bones,contact){const end=bones[contact.joint],lower=end?.parent,upper=lower?.parent;if(!lower?.isBone||!upper?.isBone)throw Error('Contact holds need a hand or foot with two parent joints.');return [upper,lower,end];}
export function validateContactChains(bones,contacts){
 for(let i=0;i<contacts.length;i++){const chain=contactBones(bones,contacts[i]);for(const bone of chain){const s=bone.getWorldScale(new THREE.Vector3());if(s.x<=0||Math.abs(s.x-s.y)>1e-5||Math.abs(s.x-s.z)>1e-5)throw Error('Apply non-uniform or mirrored scale before adding contact holds.');}for(let j=0;j<i;j++){const a=contacts[i],b=contacts[j];if(a.start<=b.end&&b.start<=a.end&&contactBones(bones,b).some(bone=>chain.includes(bone)))throw Error('Overlapping contact holds must use independent limbs.');}}
}
const EYE_AXES={'+X':[1,0,0],'-X':[-1,0,0],'+Y':[0,1,0],'-Y':[0,-1,0],'+Z':[0,0,1],'-Z':[0,0,-1]};
const eyeRaycaster=new THREE.Raycaster();
const underBone=(object,bone)=>{for(let node=object;node;node=node.parent)if(node===bone)return true;return false;};
// Start beyond this eye's own meshes, then stop at the next surface, including the other eyeball.
export function resolveEyeTarget(root,bone,target){
 if(!root||!bone||!Array.isArray(target)||target.length!==3||target.some(n=>!Number.isFinite(n)))throw Error('Place the target away from the eye.');
 const origin=bone.getWorldPosition(new THREE.Vector3()),end=new THREE.Vector3(...target),direction=end.clone().sub(origin),span=direction.length();
 if(span<1e-8)throw Error('Place the target away from the eye.');
 direction.multiplyScalar(1/span);eyeRaycaster.set(origin,direction);eyeRaycaster.near=0;eyeRaycaster.far=span;
 const own=eyeRaycaster.intersectObject(root,true).filter(item=>item.object?.isMesh&&underBone(item.object,bone));
 const near=Math.min(span-1e-4,own.reduce((max,item)=>Math.max(max,item.distance),0)+1e-3);
 if(!(near<eyeRaycaster.far))throw Error('Place the target away from the eye.');
 eyeRaycaster.near=near;
 const hit=eyeRaycaster.intersectObject(root,true).find(item=>item.object?.isMesh&&!underBone(item.object,bone));
 const point=hit?hit.point:end;if(point.distanceTo(origin)<1e-4)throw Error('Place the target away from the eye.');
 return {point:point.toArray(),blocked:!!hit};
}
export function eyeAimDegrees(bone,restQuat,axis,target,current,limits){
 if(!EYE_AXES[axis])throw Error('Choose an eye forward axis.');
 const direction=new THREE.Vector3(...target).sub(bone.getWorldPosition(new THREE.Vector3()));
 if(direction.lengthSq()<1e-10)throw Error('Place the target away from the eye.');direction.normalize();
 const world=bone.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(...EYE_AXES[axis]).applyQuaternion(world).normalize();
 world.premultiply(new THREE.Quaternion().setFromUnitVectors(forward,direction));
 const local=restQuat.clone().invert().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)),euler=new THREE.Euler().setFromQuaternion(local,'XYZ');
 return [euler.x,euler.y,euler.z].map((r,i)=>{
  const degrees=THREE.MathUtils.radToDeg(r),candidates=[degrees-360,degrees,degrees+360].filter(v=>v>=-360&&v<=360&&(!limits||v>=limits[0][i]-1e-5&&v<=limits[1][i]+1e-5));
  if(!candidates.length)throw Error('The gaze target exceeds this bone’s rotation limits. Move the target or adjust the limits.');
  return candidates.sort((a,b)=>Math.abs(a-(current?.[i]||0))-Math.abs(b-(current?.[i]||0)))[0];
 });
}
export function applyEyeTracks(root,bones,rest,rig,frame,pose){
 const tracks=(rig.eyeTracks||[]).filter(t=>frame>=t.start&&frame<=t.end);if(!tracks.length)return {pose,warnings:[]};
 const warnings=[];
 for(const t of tracks){
  const bone=bones[t.joint];if(!bone?.parent){warnings.push('Eye track is missing its bone.');continue;}
  let scaled=false;for(let p=bone;p;p=p.parent)if(p.scale.x<=0||Math.abs(p.scale.x-p.scale.y)>1e-5||Math.abs(p.scale.x-p.scale.z)>1e-5)scaled=true;
  if(scaled){warnings.push((rig.names[t.joint]||'Eye')+': eye track needs uniform scale');continue;}
  try{
   const resolved=resolveEyeTarget(root,bone,t.target),angles=eyeAimDegrees(bone,rest[t.joint],t.axis,resolved.point,pose[t.joint],rig.limits?.[t.joint]);pose[t.joint]=angles;
   bone.quaternion.copy(rest[t.joint]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles.map(THREE.MathUtils.degToRad),'XYZ')));root.updateMatrixWorld(true);
   const direction=new THREE.Vector3(...resolved.point).sub(bone.getWorldPosition(new THREE.Vector3())).normalize(),forward=new THREE.Vector3(...EYE_AXES[t.axis]).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()));
   if(forward.angleTo(direction)>.02)warnings.push((rig.names[t.joint]||'Eye')+': eye track missed its target');
  }catch(e){warnings.push((rig.names[t.joint]||'Eye')+': '+e.message);}
 }
 return {pose,warnings};
}
const featureEye=bone=>/eye/i.test(bone?.name||'')&&!/brow|lid|lash/i.test(bone?.name||'');
export function aimFeatureEyes(root,rig){
 const eyes=rig?.features?.eyes;if(!eyes)return;
 const groups=[];root.traverse(child=>{if(child.userData.studioFeature==='eye')groups.push(child);});
 for(const group of groups){
  if(featureEye(group.parent))continue;
  const look=rig.eyesLinked===false&&eyes[group.userData.featureSide]?.look?eyes[group.userData.featureSide].look:eyes.look;
  if(!look)continue;
  const resolved=resolveEyeTarget(root,group,look),origin=group.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(...resolved.point).sub(origin);
  if(direction.lengthSq()<1e-8)continue;direction.normalize();
  const world=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),direction),parent=group.parent.getWorldQuaternion(new THREE.Quaternion());
  group.quaternion.copy(parent.invert().multiply(world));
 }
}
export function applyContacts(root,bones,rest,rig,frame,pose){
 let result=structuredClone(pose),warnings=[];
 for(const c of rig.contacts||[]){if(frame<c.start||frame>c.end)continue;contactBones(bones,c);const solved=solveRigIK(root,bones,rest,{...rig,pose:result},c.joint,c.target);result=solved.pose;
  const end=bones[c.joint],parentRotation=end.parent.getWorldQuaternion(new THREE.Quaternion()),local=parentRotation.invert().multiply(new THREE.Quaternion(...c.orientation));
  const euler=new THREE.Euler().setFromQuaternion(rest[c.joint].clone().invert().multiply(local),'XYZ');const angles=[euler.x,euler.y,euler.z].map(THREE.MathUtils.radToDeg),limits=rig.limits?.[c.joint];
  result[c.joint]=angles.map((v,j)=>limits?Math.max(limits[0][j],Math.min(limits[1][j],v)):v);
  end.quaternion.copy(rest[c.joint]).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...result[c.joint].map(THREE.MathUtils.degToRad),'XYZ')));root.updateMatrixWorld(true);
  if(solved.distance>.01||end.getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion(...c.orientation))>.02)warnings.push(rig.names[c.joint]+': contact outside reach or joint limits');
 }
 return {pose:result,warnings};
}
export function syncProps(root,bones,rig,frame=null){
 const remove=object=>{object.removeFromParent();object.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])m.dispose();});};
 const existing=[];root.traverse(o=>{if(o.userData.studioProp)existing.push(o);});const props=rig.props||[];
 for(const mesh of existing)if(!props.some(p=>p.id===mesh.userData.studioProp))remove(mesh);
 for(const p of props){let mesh=existing.find(o=>o.userData.studioProp===p.id);if(mesh&&mesh.userData.shape!==p.shape){remove(mesh);mesh=null;}
  if(!mesh&&p.shape==='mesh')throw Error('Imported prop geometry is missing from the saved model. Restore its model file.');
  if(!mesh){const geometry=p.shape==='sphere'?new THREE.SphereGeometry(.5,20,12):p.shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,20):new THREE.BoxGeometry(1,1,1);mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({roughness:.7}));mesh.userData={studioProp:p.id,shape:p.shape};}
  const state=sampleProp(p,frame),parent=state.joint===null?root:bones[state.joint];if(mesh.parent!==parent)parent.add(mesh);mesh.visible=frame===null||frame>=(p.firstFrame??0);mesh.name=p.name;mesh.position.fromArray(state.position);mesh.rotation.set(...state.rotation.map(THREE.MathUtils.degToRad));mesh.scale.fromArray(state.size);if(p.shape!=='mesh')mesh.material.color.set(p.color);
 }
}

// Capture a parent-relative transform without moving the displayed prop.
export function attachmentEvent(root,bones,id,joint,frame){
 let mesh;root.traverse(o=>{if(o.userData.studioProp===id)mesh=o;});const parent=joint===null?root:bones[joint];if(!mesh||!parent)throw Error('Choose a saved prop and an attachment.');root.updateMatrixWorld(true);
 if(Math.abs(parent.matrixWorld.determinant())<1e-10)throw Error('Attachment has a zero scale.');
 const matrix=parent.matrixWorld.clone().invert().multiply(mesh.matrixWorld),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),size=new THREE.Vector3();matrix.decompose(position,rotation,size);
 const rebuilt=new THREE.Matrix4().compose(position,rotation,size);if(matrix.elements.some((v,i)=>Math.abs(v-rebuilt.elements[i])>1e-5)||size.toArray().some(v=>v<=0))throw Error('This attachment would shear or mirror the prop. Apply the character scale first.');
 const e=new THREE.Euler().setFromQuaternion(rotation,'XYZ');return {frame,joint,position:position.toArray(),rotation:[e.x,e.y,e.z].map(THREE.MathUtils.radToDeg),size:size.toArray()};
}
