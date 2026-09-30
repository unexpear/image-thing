import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {addEyeTrack,removeEyeTracks,pickScenePoint,gazeEyes} from '../../simple-editor/director-eye-target.js';
import {resolveEyeTarget} from '../../simple-editor/director-performance-engine.js';
import {characterSetup} from '../../simple-editor/director-performance-state.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const root=starterCharacter(),head=jointsOf(root)[2];
for(const [side,name] of [[-1,'Right eye'],[1,'Left eye']]){const bone=new THREE.Bone();bone.name=name;bone.position.set(side*.1,.29,.21);head.add(bone);
 const geometry=new THREE.SphereGeometry(.03,8,6),count=geometry.attributes.position.count;geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({color:'#337992'}));mesh.position.z=.04;bone.add(mesh);root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([bone]));}
const bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone(),eyes=bones.map((b,i)=>b.name.endsWith('eye')?i:-1).filter(i=>i>=0);
const rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),root:[0,0,0],keys:[{frame:0,easing:'linear',pose:bones.map(()=>[0,0,0])},{frame:24,easing:'linear',pose:bones.map(()=>[0,0,0])}],limits:bones.map((b,i)=>eyes.includes(i)?[[-45,-55,-35],[45,55,35]]:null)};
rig.keys[1].pose[2]=[0,30,0];
const before=JSON.stringify(rig),target=[1,2,3],tracked=addEyeTrack({root,rig,rest,baseRoot,joint:eyes[0],target,axis:'+Z',start:0,end:24,lastFrame:47});
assert.equal(JSON.stringify(rig),before);assert.equal(tracked.channels,undefined);assert.equal(tracked.eyeTracks.length,1);assert.equal(tracked.eyeTracks[0].joint,eyes[0]);
const both=addEyeTrack({root,rig:tracked,rest,baseRoot,joint:eyes[1],target,axis:'+Z',start:0,end:24,lastFrame:47});
assert.equal(both.eyeTracks.length,2);
for(const frame of [0,12,24]){applyRigFrame(root,bones,rest,baseRoot,[],rig,frame);const plain=bones.map(b=>b.matrixWorld.clone());applyRigFrame(root,bones,rest,baseRoot,[],both,frame);for(let i=0;i<bones.length;i++)if(!eyes.includes(i))assert.ok(plain[i].elements.every((v,j)=>Math.abs(v-bones[i].matrixWorld.elements[j])<1e-6),frame+' body drifted');for(const i of eyes){const direction=new THREE.Vector3(...target).sub(bones[i].getWorldPosition(new THREE.Vector3())).normalize(),forward=new THREE.Vector3(0,0,1).applyQuaternion(bones[i].getWorldQuaternion(new THREE.Quaternion()));assert.ok(forward.angleTo(direction)<.02,frame+' eye missed');}}
assert.equal(removeEyeTracks(both,eyes[0]).eyeTracks.length,1);assert.equal(removeEyeTracks(tracked,eyes[0]).eyeTracks,undefined);assert.equal(characterSetup(both).rig.eyeTracks,undefined);
const blocked=structuredClone(rig);blocked.channels=[{id:`joint:${eyes[0]}:1`,keys:[{frame:0,value:0,easing:'linear'}]}];assert.throws(()=>addEyeTrack({root,rig:blocked,rest,baseRoot,joint:eyes[0],target,axis:'+Z',start:0,end:4,lastFrame:47}),/rotation channels/);
assert.throws(()=>addEyeTrack({root,rig:tracked,rest,baseRoot,joint:eyes[0],target,axis:'+Z',start:8,end:16,lastFrame:47}),/overlap/);
const only={...rig,keys:[],eyeTracks:tracked.eyeTracks},data=await exportRigGLB(root,bones,rest,only,1,baseRoot),view=new DataView(data),json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,view.getUint32(12,true))));
assert.equal(json.animations.length,1);assert.ok(json.animations[0].channels.length>=1);assert.equal((await validateBytes(new Uint8Array(data))).issues.numErrors,0);
const linked=gazeEyes({root,rig,rest,baseRoot,joint:eyes[0],target:[1,2,3],axis:'+Z',start:0,end:4,lastFrame:47,linked:true,action:'track'});
assert.equal(linked.eyesLinked,true);assert.equal(linked.eyeTracks.length,2);assert.deepEqual(linked.eyeTracks.map(t=>t.joint).sort(),eyes.slice().sort());assert.deepEqual(linked.eyeTracks[0].target,linked.eyeTracks[1].target);
applyRigFrame(root,bones,rest,baseRoot,[],linked,0);for(const i of eyes){const direction=new THREE.Vector3(1,2,3).sub(bones[i].getWorldPosition(new THREE.Vector3())).normalize(),forward=new THREE.Vector3(0,0,1).applyQuaternion(bones[i].getWorldQuaternion(new THREE.Quaternion()));assert.ok(forward.angleTo(direction)<.02);}
const solo=gazeEyes({root,rig,rest,baseRoot,joint:eyes[0],target:[1,2,3],axis:'+Z',start:0,end:2,lastFrame:47,linked:false,action:'track'});assert.equal(solo.eyesLinked,false);assert.equal(solo.eyeTracks.length,1);assert.equal(solo.eyeTracks[0].joint,eyes[0]);
assert.throws(()=>gazeEyes({root,rig,rest,baseRoot,joint:0,target:[1,2,3],axis:'+Z',start:0,end:1,lastFrame:47,linked:true,action:'track'}),/eye bone/);
const other=bones[eyes[1]].localToWorld(new THREE.Vector3(0,0,.04)),seen=resolveEyeTarget(root,bones[eyes[0]],other.toArray());assert.equal(seen.blocked,true);assert.ok(new THREE.Vector3(...seen.point).distanceTo(bones[eyes[0]].getWorldPosition(new THREE.Vector3()))<bones[eyes[0]].getWorldPosition(new THREE.Vector3()).distanceTo(other)-.005);
applyRigFrame(root,bones,rest,baseRoot,[],rig,0);const origin=bones[eyes[0]].getWorldPosition(new THREE.Vector3()),far=new THREE.Vector3(1,2,3),blocker=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshStandardMaterial());blocker.position.copy(origin).lerp(far,.45);root.add(blocker);root.updateMatrixWorld(true);
const open=resolveEyeTarget(root,bones[eyes[0]],[1,2,3]);assert.equal(open.blocked,true);const miss=resolveEyeTarget(root,bones[eyes[0]],origin.clone().add(new THREE.Vector3(0,3,0)).toArray());assert.equal(miss.blocked,false);
const blockedRig=addEyeTrack({root,rig,rest,baseRoot,joint:eyes[0],target:[1,2,3],axis:'+Z',start:0,end:0,lastFrame:47});
applyRigFrame(root,bones,rest,baseRoot,[],blockedRig,0);const gazeOrigin=bones[eyes[0]].getWorldPosition(new THREE.Vector3()),forward=new THREE.Vector3(0,0,1).applyQuaternion(bones[eyes[0]].getWorldQuaternion(new THREE.Quaternion())),toHit=new THREE.Vector3(...open.point).sub(gazeOrigin).normalize();
assert.ok(new THREE.Vector3(...open.point).distanceTo(origin)<far.distanceTo(origin)-.05);assert.ok(forward.angleTo(toHit)<.02);
const camera=new THREE.PerspectiveCamera(40,16/9,.01,100);camera.position.copy(blocker.position).add(far.clone().sub(origin).normalize());camera.lookAt(blocker.position);camera.updateMatrixWorld(true);const picked=pickScenePoint(root,camera,0,0);assert.ok(new THREE.Vector3(...picked).distanceTo(blocker.position)<.4);assert.throws(()=>pickScenePoint(root,camera,0,2),/3D view/);
console.log('Eye tracks passed: ray hits stop the gaze, clear rays keep the point, camera picking, head-turn isolation, rejection and a validator-clean GLB.');
