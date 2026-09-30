import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readRigGLB,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {keyPropGrip} from '../../simple-editor/director-grip-target.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const project=JSON.parse((await fs.readFile('reports/studio/fixtures/continuous-performance-grip.json','utf8')).replace(/^\uFEFF/,'')),rig=project.scenes[0].shots[0].rig3d,bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+rig.model.subfolder+'/'+rig.model.name),root=await readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone(),faces=faceControls(root),joint=rig.names.indexOf('Left_hand'),propId=rig.props[0].id;
applyRigFrame(root,bones,rest,baseRoot,faces,rig,96);let prop;root.traverse(o=>{if(o.userData.studioProp===propId)prop=o;});const original=prop.matrixWorld.clone(),target=new THREE.Vector3(0,-.02,-.08).applyMatrix4(original),orientation=prop.getWorldQuaternion(new THREE.Quaternion()),before=JSON.stringify(rig),poseBefore=bones.map(b=>b.quaternion.toArray());
const args={root,rest,baseRoot,rig,frame:96,lastFrame:191,propId,joint,position:[0,-.02,-.08],rotation:[0,0,0]},next=keyPropGrip(args);
assert.equal(JSON.stringify(rig),before);assert.deepEqual(bones.map(b=>b.quaternion.toArray()),poseBefore);assert.deepEqual(next.channels,rig.channels);assert.deepEqual(next.faceKeys,rig.faceKeys);assert.deepEqual(next.contacts,rig.contacts);
const oldKey=rig.keys.find(k=>k.frame===96),newKey=next.keys.find(k=>k.frame===96);for(let i=0;i<bones.length;i++)if(![3,4,5].includes(i))assert.deepEqual(newKey.pose[i],oldKey.pose[i]);
applyRigFrame(root,bones,rest,baseRoot,faces,next,96);assert.ok(bones[joint].getWorldPosition(new THREE.Vector3()).distanceTo(target)<.01);assert.ok(bones[joint].getWorldQuaternion(new THREE.Quaternion()).angleTo(orientation)<.0001);assert.ok(original.elements.every((v,i)=>Math.abs(v-prop.matrixWorld.elements[i])<1e-5));
const pickup=prop.matrixWorld.clone();applyRigFrame(root,bones,rest,baseRoot,faces,next,95);const beforePickup=prop.matrixWorld.clone();applyRigFrame(root,bones,rest,baseRoot,faces,rig,95);assert.ok(beforePickup.elements.every((v,i)=>Math.abs(v-prop.matrixWorld.elements[i])<1e-5));const pickupDelta=Math.max(...pickup.elements.map((v,i)=>Math.abs(v-beforePickup.elements[i])));assert.ok(pickupDelta<.001,'Existing sub-millimeter pickup tolerance');
assert.throws(()=>keyPropGrip({...args,position:[99,99,99]}),/outside reach/);assert.throws(()=>keyPropGrip({...args,frame:192}),/inside/);
const restricted=structuredClone(rig);restricted.limits=rig.names.map(()=>null);restricted.limits[joint]=[[0,0,0],[0,0,0]];assert.throws(()=>keyPropGrip({...args,rig:restricted}),/wrist limits/);
const overridden=structuredClone(rig);overridden.channels.push({id:'joint:3:0',keys:[{frame:0,value:0}]});assert.throws(()=>keyPropGrip({...args,rig:overridden}),/override/);
const held=structuredClone(rig);held.contacts.push({id:'hand-hold',joint,start:96,end:104,target:[.4,1.25,.4],orientation:[0,0,0,1]});assert.throws(()=>keyPropGrip({...args,rig:held}),/active contact/);
const scaled=structuredClone(rig);scaled.props[0].attachments[0].size=[1,2,1];assert.throws(()=>keyPropGrip({...args,rig:scaled}),/non-uniform/);
for(let f=0;f<192;f++)assert.deepEqual(applyRigFrame(root,bones,rest,baseRoot,faces,next,f).warnings,[]);
const glb=await exportRigGLB(root,bones,rest,next,8,baseRoot,faces);assert.equal((await validateBytes(new Uint8Array(glb))).issues.numErrors,0);
console.log('Grip target: matching wrist position/orientation, prop transform preserved at pickup, source/runtime isolation, finger/body-key preservation, reach/limit/channel rejection and valid 192-frame export. Neighboring acting still needs visual review.');


