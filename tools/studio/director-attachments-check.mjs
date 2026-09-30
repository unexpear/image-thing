import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {attachmentEvent} from '../../simple-editor/director-performance-engine.js';
import {validateRig3D,hasRigAnimation} from '../../simple-editor/director-3d-state.js';
import {characterSetup} from '../../simple-editor/director-performance-state.js';
import {reviewRigMotion} from '../../simple-editor/director-motion-review.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),base=bones[0].position.clone();
const rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],channels:[{id:'root:0',keys:[{frame:0,value:0,easing:'linear'},{frame:47,value:1,easing:'linear'}]}],props:[{id:'box',name:'Pickup box',shape:'box',color:'#00aaaa',joint:null,position:[.36,.72,0],rotation:[10,20,30],size:[.2,.3,.4]}]};
const sample=f=>{applyRigFrame(root,bones,rest,base,[],rig,f);return root.getObjectByName('Pickup box');};
let mesh=sample(6);const before=mesh.matrixWorld.clone();rig.props[0].attachments=[attachmentEvent(root,bones,'box',5,6)];sample(6);assert.ok(before.elements.every((v,i)=>Math.abs(v-mesh.matrixWorld.elements[i])<1e-7));assert.equal(mesh.parent,bones[5]);
sample(24);const release=mesh.matrixWorld.clone();rig.props[0].attachments.push(attachmentEvent(root,bones,'box',null,24));sample(24);assert.ok(release.elements.every((v,i)=>Math.abs(v-mesh.matrixWorld.elements[i])<1e-7));const released=mesh.getWorldPosition(new THREE.Vector3());sample(47);assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(released)<1e-7);
for(const f of [47,6,0,25,12,0]){sample(f);assert.equal(mesh.parent,f>=6&&f<24?bones[5]:root);}
sample(18);const handoff=mesh.matrixWorld.clone();rig.props[0].attachments.push(attachmentEvent(root,bones,'box',8,18));sample(18);assert.equal(mesh.parent,bones[8]);assert.ok(handoff.elements.every((v,i)=>Math.abs(v-mesh.matrixWorld.elements[i])<1e-7));rig.props[0].attachments=rig.props[0].attachments.filter(k=>k.frame!==18);
validateRig3D(rig);assert.ok(hasRigAnimation({...rig,channels:[]}));assert.equal(characterSetup(rig).rig.props[0].attachments,undefined);
sample(12);const parent=mesh.parent,matrix=mesh.matrixWorld.clone();await reviewRigMotion({root,bones,rest,baseRoot:base,morphs:[],rig,joint:5,start:0,end:47});assert.equal(mesh.parent,parent);assert.ok(matrix.elements.every((v,i)=>Math.abs(v-mesh.matrixWorld.elements[i])<1e-7));
const bad=structuredClone(rig);bad.props[0].attachments.push({...bad.props[0].attachments[0]});assert.throws(()=>validateRig3D(bad),/attachment/);
const expected=new Map();for(const f of [0,6,12,24,47]){mesh=sample(f);expected.set(f,mesh.matrixWorld.clone());}
const data=await exportRigGLB(root,bones,rest,rig,2,base,[]),report=await validateBytes(new Uint8Array(data));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
const bytes=Buffer.from(data),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),index=json.nodes.findIndex(n=>n.name==='Pickup box'),channels=json.animations[0].channels.filter(c=>c.target.node===index);assert.equal(channels.length,3);
const binStart=20+bytes.readUInt32LE(12)+8;
function floats(accessor){const a=json.accessors[accessor],v=json.bufferViews[a.bufferView],n={VEC3:3,VEC4:4,SCALAR:1}[a.type],off=binStart+(v.byteOffset||0)+(a.byteOffset||0);return Array.from({length:a.count*n},(_,i)=>bytes.readFloatLE(off+i*4));}
for(const [f,want] of expected){const values=Object.fromEntries(channels.map(c=>[c.target.path,floats(json.animations[0].samplers[c.sampler].output)])),matrix=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(values.translation,f*3),new THREE.Quaternion().fromArray(values.rotation,f*4),new THREE.Vector3().fromArray(values.scale,f*3));assert.ok(want.elements.every((v,i)=>Math.abs(v-matrix.elements[i])<1e-5),'export frame '+f);}
console.log('Attachment checks passed: no-pop pickup/release, moving carrier, held stage release, reverse scrubbing, review restoration, schema, reusable setup and GLB sampled transform parity.');
