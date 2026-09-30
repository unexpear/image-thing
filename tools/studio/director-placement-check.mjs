import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {appendStageActor,placeStageActor} from '../../simple-editor/director-stage.js';
import {extractActor} from '../../simple-editor/director-actor-library.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone();
const rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[]};
const stage=await appendStageActor({root,rig,rest,baseRoot,actor:starterCharacter(),name:'Guest',position:[1.5,0,.3],yaw:20});
const sb=jointsOf(stage.root),sr=sb.map(b=>b.quaternion.clone()),base=sb[0].position.clone();
stage.rig.keys=[{frame:0,easing:'linear',pose:structuredClone(stage.rig.pose)},{frame:47,easing:'linear',pose:structuredClone(stage.rig.pose)}];stage.rig.keys[1].pose[17]=[0,35,0];stage.rig.keys[1].pose[4]=[20,0,0];
stage.rig.channels=[{id:'position:15:0',keys:[{frame:0,value:0,easing:'linear'},{frame:47,value:.3,easing:'linear'}]}];
stage.rig.props=[{id:'held',name:'Held',shape:'box',joint:20,position:[.1,0,0],rotation:[0,0,0],size:[.1,.1,.1],color:'#ffffff'},{id:'room',name:'Room',shape:'box',joint:null,position:[3,0,0],rotation:[0,0,0],size:[.1,.1,.1],color:'#ffffff'}];
const before=JSON.stringify(stage.rig),offset=[.5,0,-.2],yaw=35;
// Derive expected world transform from the original, neutral parent/pivot.
stage.root.updateMatrixWorld(true);const parent=sb[15].parent.matrixWorld.clone(),pivot=sb[15].position.clone(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(yaw)),pos=pivot.clone().add(new THREE.Vector3(...offset)).sub(pivot.clone().applyQuaternion(q));
const delta=parent.clone().multiply(new THREE.Matrix4().compose(pos,q,new THREE.Vector3(1,1,1))).multiply(parent.clone().invert());
const placed=await placeStageActor({root:stage.root,rig:stage.rig,rest:sr,baseRoot:base,selected:20,offset,yaw});assert.equal(JSON.stringify(stage.rig),before);
const pb=jointsOf(placed.root),pr=pb.map(b=>b.quaternion.clone());
let max=0;for(let frame=0;frame<48;frame++){
 applyRigFrame(stage.root,sb,sr,base,faceControls(stage.root),stage.rig,frame);applyRigFrame(placed.root,pb,pr,pb[0].position.clone(),faceControls(placed.root),placed.rig,frame);
 for(let i=0;i<30;i++){const a=sb[i].matrixWorld.clone();if(i>=15)a.premultiply(delta);const error=Math.max(...a.elements.map((v,j)=>Math.abs(v-pb[i].matrixWorld.elements[j])));max=Math.max(max,error);assert.ok(error<1e-5,'Joint transform mismatch '+i);}
 for(const joint of [0,15]){let a,b;stage.root.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.includes(sb[joint]))a=o;});placed.root.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton.bones.includes(pb[joint]))b=o;});for(let i=0;i<a.geometry.attributes.position.count;i++){const av=a.localToWorld(a.getVertexPosition(i,new THREE.Vector3()));if(joint===15)av.applyMatrix4(delta);const bv=b.localToWorld(b.getVertexPosition(i,new THREE.Vector3()));assert.ok(av.distanceTo(bv)<1e-5,'Skin transform mismatch');}}
 for(const id of ['held','room']){let a,b;stage.root.traverse(o=>{if(o.userData.studioProp===id)a=o;});placed.root.traverse(o=>{if(o.userData.studioProp===id)b=o;});const expected=a.matrixWorld.clone();if(id==='held')expected.premultiply(delta);assert.ok(expected.elements.every((v,i)=>Math.abs(v-b.matrixWorld.elements[i])<1e-5),id+' mismatch');}
}
assert.equal((await validateBytes(new Uint8Array(placed.data))).issues.numErrors,0);
const extracted=await extractActor({root:placed.root,rig:placed.rig,rest:pr,baseRoot:pb[0].position.clone(),selected:20});assert.equal(jointsOf(extracted.root).length,15);
const again=await placeStageActor({root:placed.root,rig:placed.rig,rest:pr,baseRoot:pb[0].position.clone(),selected:20,offset:[0,0,0],yaw:0});assert.equal((await validateBytes(new Uint8Array(again.data))).issues.numErrors,0);
console.log({ok:true,frames:48,maxJointError:max,checks:'Both actors, skin vertices, held/stage props, extraction, repeated placement, valid GLB and source immutability'});


// Contact targets and orientations follow the same rigid placement.
applyRigFrame(stage.root,sb,sr,base,faceControls(stage.root),stage.rig,0);
const contactRig=structuredClone(stage.rig);contactRig.channels=[];
contactRig.contacts=[{id:'foot',joint:29,start:0,end:47,target:sb[29].getWorldPosition(new THREE.Vector3()).toArray(),orientation:sb[29].getWorldQuaternion(new THREE.Quaternion()).toArray()}];
const contactPlaced=await placeStageActor({root:stage.root,rig:contactRig,rest:sr,baseRoot:base,selected:20,offset,yaw});
const cBones=jointsOf(contactPlaced.root),cRest=cBones.map(b=>b.quaternion.clone()),cBase=cBones[0].position.clone();
for(let frame=0;frame<48;frame++){const state=applyRigFrame(contactPlaced.root,cBones,cRest,cBase,faceControls(contactPlaced.root),contactPlaced.rig,frame);assert.deepEqual(state.warnings,[]);assert.ok(cBones[29].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...contactPlaced.rig.contacts[0].target))<.01);}
const animated=await exportRigGLB(contactPlaced.root,cBones,cRest,contactPlaced.rig,2,cBase);assert.equal((await validateBytes(new Uint8Array(animated))).issues.numErrors,0);
const eventRig=structuredClone(stage.rig);eventRig.props[0].attachments=[{frame:10,joint:null,position:[0,0,0],rotation:[0,0,0],size:[.1,.1,.1]}];
await assert.rejects(placeStageActor({root:stage.root,rig:eventRig,rest:sr,baseRoot:base,selected:20,offset,yaw}),/attachment events/);
await assert.rejects(placeStageActor({root:stage.root,rig:stage.rig,rest:sr,baseRoot:base,selected:20,offset:[NaN,0,0],yaw}),/valid placement/);
sb[15].parent.scale.x=2;await assert.rejects(placeStageActor({root:stage.root,rig:stage.rig,rest:sr,baseRoot:base,selected:20,offset,yaw}),/parent scale/);sb[15].parent.scale.x=1;
console.log('Planted foot/orientation, animated GLB, attachment event, invalid offset and nonuniform scale checks passed.');
