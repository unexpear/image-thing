import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {faceControls,jointsOf,disposeObject} from './director-3d-engine.js';

export const morphKey=c=>c.mesh.userData.studioMorphId+':'+c.index;
// Author a corrective shape in bind space. Bones and bind matrices are untouched.
export function makeStretchShape(source,{joint,axis='y',factor=.75,name='Squash'}){
 if(!Number.isInteger(joint)||joint<0||!['x','y','z'].includes(axis)||!Number.isFinite(factor)||factor<.25||factor>4||typeof name!=='string'||!name.trim()||name.length>60||!/^[\w -]+$/.test(name))throw Error('Choose a joint, axis, scale from .25 to 4 and a short shape name using letters, numbers, spaces or dashes.');
 const root=cloneSkeleton(source);root.traverse(o=>{if(o.geometry)o.geometry=o.geometry.clone();if(o.material)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();if(o.isMesh)o.userData.studioMorphId=o.uuid;if(o.isBone)o.userData.studioBoneId=o.uuid;});
 try{
  const bones=jointsOf(root),bone=bones[joint];if(!bone)throw Error('Select an existing joint.');
  const oldKeys=faceControls(root).map(morphKey),added=[],scale=new THREE.Vector3().setScalar(1/Math.sqrt(factor));scale[axis]=factor;
  let vertices=0;
  root.traverse(mesh=>{
   if(!mesh.isSkinnedMesh)return;const index=mesh.skeleton.bones.indexOf(bone);if(index<0)return;
   const g=mesh.geometry,p=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;if(!p||!indices||!weights)return;
   vertices+=p.count;if(vertices>200000)throw Error('Use a character with at most 200,000 skinned vertices for local shape authoring.');
   if((g.morphAttributes.position||[]).some(a=>a.name===name))throw Error('This mesh already has a shape with that name.');
   const target=p.clone(),bindToBone=mesh.skeleton.boneInverses[index].clone().multiply(mesh.bindMatrix),boneToBind=bindToBone.clone().invert(),v=new THREE.Vector3(),base=new THREE.Vector3();let touched=0;
   for(let i=0;i<p.count;i++){let weight=0;for(let j=0;j<4;j++)if(indices.getComponent(i,j)===index)weight+=weights.getComponent(i,j);if(weight<=0)continue;touched++;base.fromBufferAttribute(p,i);v.copy(base).applyMatrix4(bindToBone).multiply(scale).applyMatrix4(boneToBind).sub(base).multiplyScalar(weight).add(base);target.setXYZ(i,v.x,v.y,v.z);}
   if(!touched)return;
   const normalGeometry=new THREE.BufferGeometry();normalGeometry.setAttribute('position',target.clone());if(g.index)normalGeometry.setIndex(g.index.clone());normalGeometry.computeVertexNormals();const normal=normalGeometry.attributes.normal.clone();normalGeometry.dispose();
   const count=g.morphAttributes.position?.length||0,baseNormal=g.attributes.normal;
   if(baseNormal){g.morphAttributes.normal??=[];while(g.morphAttributes.normal.length<count){const filler=baseNormal.clone();if(g.morphTargetsRelative)filler.array.fill(0);g.morphAttributes.normal.push(filler);}if(g.morphTargetsRelative)for(let i=0;i<normal.count;i++)normal.setXYZ(i,normal.getX(i)-baseNormal.getX(i),normal.getY(i)-baseNormal.getY(i),normal.getZ(i)-baseNormal.getZ(i));normal.name=name;g.morphAttributes.normal.push(normal);}
   if(g.morphTargetsRelative)for(let i=0;i<target.count;i++)target.setXYZ(i,target.getX(i)-p.getX(i),target.getY(i)-p.getY(i),target.getZ(i)-p.getZ(i));
   target.name=name;g.morphAttributes.position??=[];g.morphAttributes.position.push(target);const prior=mesh.morphTargetInfluences?.slice()||[];mesh.updateMorphTargets();prior.forEach((v,i)=>mesh.morphTargetInfluences[i]=v);g.computeBoundingBox();g.computeBoundingSphere();added.push(mesh.userData.studioMorphId+':'+count);
  });
  if(!added.length)throw Error('No skinned vertices are weighted to this joint. Choose a deforming joint.');
  if(faceControls(root).length>256)throw Error('This character would exceed the 256 shape-control limit.');
  return {root,oldKeys,added,boneKeys:bones.map(b=>b.userData.studioBoneId)};
 }catch(e){disposeObject(root,{textures:false});throw e;}
}

export function remapShapeState(rig,oldKeys,newControls,oldBase){
 const next=structuredClone(rig),newKeys=newControls.map(morphKey),map=oldKeys.map(key=>newKeys.indexOf(key));if(map.some(i=>i<0))throw Error('The exported model lost an existing shape. Original character was kept.');
 const values=old=>{const out=newControls.map(c=>c.base);map.forEach((n,i)=>out[n]=old?.[i]??oldBase[i]??0);return out;};
 next.face=values(rig.face);for(const k of next.keys)k.face=values(k.face);for(const k of next.faceKeys||[])k.face=values(k.face);for(const p of next.expressions||[])p.face=values(p.face);for(const p of next.savedPoses||[])p.face=values(p.face);
 for(const field of ['mouthMap','eyeMap'])if(next[field])for(const [role,i] of Object.entries(next[field]))if(i!==null)next[field][role]=map[i];
 for(const c of next.channels||[])if(c.id.startsWith('face:'))c.id='face:'+map[Number(c.id.slice(5))];
 return next;
}
