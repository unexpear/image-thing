import assert from 'node:assert/strict';
import * as THREE from 'three';
import {appendStageActor,shiftSkeletonMotion} from '../../simple-editor/director-stage.js';
import {starterCharacter,jointsOf,faceControls,applyRigFrame,applyChannels,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {validateRig3D} from '../../simple-editor/director-3d-state.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const first=starterCharacter(),firstBones=jointsOf(first),rig={version:1,model:null,names:firstBones.map(b=>b.name),pose:firstBones.map(()=>[0,0,0]),keys:[]};
const stage=await appendStageActor({root:first,rest:firstBones.map(b=>b.quaternion.clone()),baseRoot:firstBones[0].position.clone(),rig,actor:starterCharacter(),name:'Guest',position:[2,0,0],yaw:30});
const root=stage.root,bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),base=bones[0].position.clone(),state=stage.rig,neutral=bones[15].position.clone();
state.channels=[{id:'position:15:0',keys:[{frame:0,value:0,easing:'linear'},{frame:24,value:.08,easing:'linear'}]}];validateRig3D(state);
applyRigFrame(root,bones,rest,base,[],state,0);const original=bones[0].getWorldPosition(new THREE.Vector3()),start=bones[15].getWorldPosition(new THREE.Vector3());
for(const f of [24,0,12,24,0]){applyRigFrame(root,bones,rest,base,[],state,f);assert.ok(bones[0].getWorldPosition(new THREE.Vector3()).distanceTo(original)<1e-6);const expected=neutral.clone().add(new THREE.Vector3(.08*f/24,0,0));assert.ok(bones[15].position.distanceTo(expected)<1e-7);}
applyRigFrame(root,bones,rest,base,[],state,24);const delta=bones[15].getWorldPosition(new THREE.Vector3()).sub(start);assert.ok(Math.abs(delta.x-.08*Math.cos(Math.PI/6))<1e-6);assert.ok(Math.abs(delta.z+.04)<1e-6);
applyChannels(bones,base,[],state);assert.ok(bones[15].position.distanceTo(neutral)<1e-7);
applyRigFrame(root,bones,rest,base,[],state,0);const foot=26;state.contacts=[{id:'guest-plant',joint:foot,start:0,end:24,target:bones[foot].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[foot].getWorldQuaternion(new THREE.Quaternion()).toArray()}];
for(let f=0;f<=24;f++)assert.deepEqual(applyRigFrame(root,bones,rest,base,[],state,f).warnings,[],'contact frame '+f);
const source=JSON.stringify(state),shifted=shiftSkeletonMotion(state,bones,20,[1,0,.5]);assert.equal(JSON.stringify(state),source);
const expectedShift=new THREE.Vector3(1,0,.5).applyMatrix4(bones[15].parent.matrixWorld).sub(new THREE.Vector3().applyMatrix4(bones[15].parent.matrixWorld));
for(const f of [0,12,24]){applyRigFrame(root,bones,rest,base,[],state,f);const old=bones[15].getWorldPosition(new THREE.Vector3());assert.deepEqual(applyRigFrame(root,bones,rest,base,[],shifted,f).warnings,[]);assert.ok(bones[15].getWorldPosition(new THREE.Vector3()).sub(old).distanceTo(expectedShift)<1e-6);assert.ok(bones[0].getWorldPosition(new THREE.Vector3()).distanceTo(original)<1e-6);}
assert.ok(new THREE.Vector3(...shifted.contacts[0].target).sub(new THREE.Vector3(...state.contacts[0].target)).distanceTo(expectedShift)<1e-6);
const mainShift=shiftSkeletonMotion(state,bones,3,[.3,0,0]);assert.equal(mainShift.root[0],.3);assert.deepEqual(mainShift.channels,state.channels);assert.deepEqual(mainShift.contacts,state.contacts);
const invalid=structuredClone(state);invalid.channels[0].enabled=false;assert.throws(()=>shiftSkeletonMotion(invalid,bones,15,[1,0,0]),/ordinary travel/);assert.throws(()=>shiftSkeletonMotion(state,bones,15,[10001,0,0]),/offsets/);
const eventRig=structuredClone(state);eventRig.props=[{joint:20,attachments:[{joint:null}]}];assert.throws(()=>shiftSkeletonMotion(eventRig,bones,15,[1,0,0]),/attachment events/);
applyRigFrame(root,bones,rest,base,[],state,24);
const before=bones[15].getWorldPosition(new THREE.Vector3());
const third=await appendStageActor({root,rest,baseRoot:base,rig:state,actor:starterCharacter(),name:'Third',position:[4,0,0],baseFaces:[]}),thirdBones=jointsOf(third.root);applyRigFrame(third.root,thirdBones,thirdBones.map(b=>b.quaternion.clone()),thirdBones[0].position.clone(),faceControls(third.root),third.rig,24);assert.ok(thirdBones[15].getWorldPosition(new THREE.Vector3()).distanceTo(before)<1e-6,'no baked double travel after adding actor');
const data=await exportRigGLB(root,bones,rest,shifted,2,base,[]),report=await validateBytes(new Uint8Array(data));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
const bytes=Buffer.from(data),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),node=json.nodes.findIndex(n=>n.name===bones[15].name),channel=json.animations[0].channels.find(c=>c.target.node===node&&c.target.path==='translation');assert.ok(channel);
const a=json.accessors[json.animations[0].samplers[channel.sampler].output],v=json.bufferViews[a.bufferView],offset=20+bytes.readUInt32LE(12)+8+(v.byteOffset||0)+(a.byteOffset||0);assert.ok(Math.abs(bytes.readFloatLE(offset+24*12)-neutral.x-1.08)<1e-6);
const bad=structuredClone(state);bad.channels[0].id='position:0:0';assert.throws(()=>validateRig3D(bad),/channel/);
console.log('Actor travel passed: independent/local-axis movement, reverse sampling, working-pose reset, planted second-actor foot, no double travel on third-actor import and decoded GLB translation parity.');

