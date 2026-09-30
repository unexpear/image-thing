import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,readRigGLB,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {appendStageActor,removeStageActor} from '../../simple-editor/director-stage.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const bytes=await fs.readFile('reports/studio/fixtures/facial-acting.glb'),root=await readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone();
const rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],face:faceControls(root).map(()=>0),eyeMap:{blinkLeft:0,blinkRight:1}};
const stage=await appendStageActor({root,rig,rest,baseRoot,actor:starterCharacter(),name:'Guest',position:[1.5,0,.3],yaw:20});
const sb=jointsOf(stage.root),sr=sb.map(b=>b.quaternion.clone()),base=sb[0].position.clone(),sf=faceControls(stage.root);
stage.rig.root=[.1,0,0];stage.rig.keys=[{frame:0,easing:'linear',pose:structuredClone(stage.rig.pose),root:[.1,0,0],face:sf.map(()=>0)},{frame:47,easing:'linear',pose:structuredClone(stage.rig.pose),root:[.3,0,0],face:sf.map(()=>.3)}];stage.rig.keys[1].pose[17]=[0,35,0];stage.rig.keys[1].pose[4]=[20,0,0];stage.rig.rotationMode='shortest';stage.rig.limits=sb.map(()=>null);
stage.rig.channels=[{id:'position:15:0',keys:[{frame:0,value:.15,easing:'linear'},{frame:47,value:.3,easing:'smooth'}]},{id:'joint:17:2',keys:[{frame:0,value:10,easing:'linear'}]},{id:'face:0',keys:[{frame:0,value:.1,easing:'linear'}]}];
stage.rig.savedPoses=[{name:'Pose',pose:structuredClone(stage.rig.pose),root:[.1,0,0],face:sf.map(()=>0)}];stage.rig.expressions=[{name:'Expression',face:sf.map(()=>.2)}];
const before=JSON.stringify(stage.rig);
for(const selected of [0,15]){
 const source=structuredClone(stage.rig),first=selected===0?15:0;
 source.props=[{id:'held',name:'Held',shape:'box',joint:first+5,position:[.1,0,0],rotation:[0,0,0],size:[.1,.1,.1],color:'#ffffff'},{id:'room',name:'Room',shape:'box',joint:null,position:[3,0,0],rotation:[0,0,0],size:[1,1,1],color:'#ffffff'}];
 applyRigFrame(stage.root,sb,sr,base,sf,source,0);source.contacts=[14,29].map(joint=>({id:'foot-'+joint,joint,start:0,end:0,target:sb[joint].getWorldPosition(new THREE.Vector3()).toArray(),orientation:sb[joint].getWorldQuaternion(new THREE.Quaternion()).toArray()}));
 const result=await removeStageActor({root:stage.root,rig:source,rest:sr,baseRoot:base,selected});const rb=jointsOf(result.root),rr=rb.map(b=>b.quaternion.clone()),rbase=rb[0].position.clone(),rf=faceControls(result.root);
 assert.equal(result.rig.contacts.length,1);assert.equal(result.rig.contacts[0].joint,14);assert.equal(rb.length,15);assert.equal(rf.length,selected===0?0:6);assert.equal(JSON.stringify(stage.rig),before);assert.equal(result.rig.props[0].joint,5);
 for(let frame=0;frame<48;frame++){
  applyRigFrame(stage.root,sb,sr,base,sf,source,frame);applyRigFrame(result.root,rb,rr,rbase,rf,result.rig,frame);
  for(let i=0;i<15;i++)assert.ok(sb[first+i].matrixWorld.elements.every((v,j)=>Math.abs(v-rb[i].matrixWorld.elements[j])<1e-5),'survivor joint drift');
  let a,b;stage.root.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.includes(sb[first]))a=o;});result.root.traverse(o=>{if(o.isSkinnedMesh)b=o;});for(let i=0;i<a.geometry.attributes.position.count;i++)assert.ok(a.localToWorld(a.getVertexPosition(i,new THREE.Vector3())).distanceTo(b.localToWorld(b.getVertexPosition(i,new THREE.Vector3())))<1e-5,'skin drift');
  for(const id of ['held','room']){let a,b;stage.root.traverse(o=>{if(o.userData.studioProp===id)a=o;});result.root.traverse(o=>{if(o.userData.studioProp===id)b=o;});assert.ok(a.matrixWorld.elements.every((v,j)=>Math.abs(v-b.matrixWorld.elements[j])<1e-5),'prop drift');}
  if(rf.length)assert.deepEqual(rf.map(c=>c.mesh.morphTargetInfluences[c.index]),sf.map(c=>c.mesh.morphTargetInfluences[c.index]));
 }
 assert.equal((await validateBytes(new Uint8Array(result.data))).issues.numErrors,0);const animated=await exportRigGLB(result.root,rb,rr,result.rig,2,rbase,rf);assert.equal((await validateBytes(new Uint8Array(animated))).issues.numErrors,0);
 await assert.rejects(removeStageActor({root:result.root,rig:result.rig,rest:rr,baseRoot:rbase,selected:0}),/at least one/);
 await assert.rejects(removeStageActor({root:stage.root,rig:source,rest:sr,baseRoot:base,selected:first}),/Detach props/);
}
console.log('Removal passed for original and secondary actors over 48 frames: preserved survivor joints, skin, root/local travel, facial channels, held/stage props, saved state; valid neutral/animated GLBs; last-actor/attached-prop rejection.');
