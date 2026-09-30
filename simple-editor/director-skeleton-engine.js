import * as THREE from 'three';
import {validateSkeleton,compileBoneWeights} from './director-skeleton-state.js';
export function suggestSkeleton(box){
 const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),h=size.y,x=center.x,z=center.z,y=box.min.y;
 const specs=[['Hips',-1,0,.5],['Spine',0,0,.62],['Neck',1,0,.83],['Head',2,0,.91],['Left shoulder',1,.18,.79],['Left elbow',4,.34,.78],['Left hand',5,.46,.77],['Right shoulder',1,-.18,.79],['Right elbow',7,-.34,.78],['Right hand',8,-.46,.77],['Left hip',0,.07,.48],['Left knee',10,.07,.27],['Left foot',11,.07,.06],['Right hip',0,-.07,.48],['Right knee',13,-.07,.27],['Right foot',14,-.07,.06]];
 return specs.map(([name,parent,xx,yy])=>({name,parent,position:[x+xx*size.x,y+yy*h,z]}));
}
export function inspectStaticMesh(source){
 source.updateMatrixWorld(true);const meshes=[];let count=0;
 source.traverse(o=>{if(!o.isMesh)return;if(o.isSkinnedMesh||o.isInstancedMesh||Object.keys(o.geometry.morphAttributes).length)throw Error('Skeleton building needs ordinary static meshes without existing skinning, instances or shape keys.');if(o.matrixWorld.determinant()<=0)throw Error('Apply mirrored or zero-scale transforms in your modeling app before binding this mesh.');const positions=o.geometry.attributes.position;if(!positions?.count)throw Error('The mesh has no vertices to bind.');for(let i=0;i<positions.count;i++)if(![positions.getX(i),positions.getY(i),positions.getZ(i)].every(Number.isFinite))throw Error('The mesh contains invalid vertex positions.');meshes.push(o);count+=positions.count;});
 if(!meshes.length||count>200000)throw Error('Use a static mesh with 1–200,000 vertices for local skeleton binding.');return {meshes,count};
}
export async function bindSkeleton(source,joints,smooth=true,onProgress=()=>{}){
 validateSkeleton(joints);const {meshes,count}=inspectStaticMesh(source);
 const weigh=compileBoneWeights(joints,smooth),root=new THREE.Scene(),bones=joints.map(j=>{const b=new THREE.Bone();b.name=j.name;return b;});
 joints.forEach((j,i)=>{bones[i].position.fromArray(j.position);if(j.parent>=0){bones[i].position.sub(new THREE.Vector3(...joints[j.parent].position));bones[j.parent].add(bones[i]);}else root.add(bones[i]);});root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);let done=0;
 for(const original of meshes){
  const geometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);const positions=geometry.attributes.position,indices=new Uint16Array(positions.count*4),weights=new Float32Array(positions.count*4);
  for(let i=0;i<positions.count;i++){const pairs=weigh([positions.getX(i),positions.getY(i),positions.getZ(i)]);pairs.forEach(([joint,w],k)=>{indices[i*4+k]=joint;weights[i*4+k]=w;});if(i%1000===0){onProgress((done+i)/count);await new Promise(r=>setTimeout(r,0));}}
  done+=positions.count;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));const material=Array.isArray(original.material)?original.material.map(m=>m.clone()):original.material.clone(),mesh=new THREE.SkinnedMesh(geometry,material);mesh.name=original.name;mesh.frustumCulled=false;root.add(mesh);root.updateMatrixWorld(true);mesh.bind(skeleton);
 }onProgress(1);return root;
}
export function paintSkinWeights(mesh,point,joint,radius,strength,mode='add'){
 const positions=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,v=new THREE.Vector3();let touched=0;
 for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);const d=v.distanceTo(point);if(d>=radius)continue;const amount=Math.min(1,Math.max(0,strength*(1-d/radius))),existing=new Map();for(let k=0;k<4;k++){const id=indices.array[i*4+k],w=weights.array[i*4+k];existing.set(id,(existing.get(id)||0)+w);}
  if(amount===0)continue;
  if(mode==='remove'){const original=existing.get(joint)||0;if(original===0)continue;const next=original*(1-amount);existing.set(joint,next);if(original>=.999999){const fallback=mesh.skeleton.bones.findIndex((b,k)=>k!==joint);if(fallback<0)continue;existing.set(fallback,1-next);}else for(const [id,w] of existing)if(id!==joint)existing.set(id,w*(1-next)/(1-original));}
  else{for(const [id,w] of existing)existing.set(id,w*(1-amount));existing.set(joint,(existing.get(joint)||0)+amount);}
  const sorted=[[joint,existing.get(joint)||0],...[...existing].filter(([id])=>id!==joint).sort((a,b)=>b[1]-a[1]).slice(0,3)],sum=sorted.reduce((n,p)=>n+p[1],0);for(let k=0;k<4;k++){indices.array[i*4+k]=sorted[k]?.[0]||0;weights.array[i*4+k]=(sorted[k]?.[1]||0)/sum;}touched++;}
 indices.needsUpdate=weights.needsUpdate=true;return touched;
}
