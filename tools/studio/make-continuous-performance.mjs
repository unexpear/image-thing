// Editable blocking test using the app's own rig, IK, attachment and export paths.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readRigGLB,jointsOf,faceControls,applyPose,applyChannels,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {appendStaticProp} from '../../simple-editor/director-stage.js';
import {addRoomLayout} from '../../simple-editor/director-room.js';
import {solveRigIK} from '../../simple-editor/director-ik3d.js';
import {attachmentEvent,syncProps} from '../../simple-editor/director-performance-engine.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const bytes=await fs.readFile('reports/studio/fixtures/facial-acting.glb');
let root=await readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),base=bones[0].position.clone(),faces=faceControls(root);
let rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],face:faces.map(()=>0)};
const gun=new THREE.Group();
for(const [size,pos,color] of [[[.13,.12,.34],[0,0,.10],'#e6b352'],[[.10,.16,.10],[0,-.10,0],'#45556b'],[[.14,.13,.025],[0,0,.28],'#5bded1']]){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:.65}));m.position.fromArray(pos);gun.add(m);}
const added=await appendStaticProp({root,rest,baseRoot:base,rig,prop:gun,name:'Creation device · blocking'});
root=added.root;rig=added.rig;bones=jointsOf(root);rest=bones.map(b=>b.quaternion.clone());base=bones[0].position.clone();faces=faceControls(root);
const modelName='performance-blocking-'+crypto.randomUUID()+'.glb';
await fs.writeFile('ComfyUI_windows_portable/ComfyUI/input/studio-director/'+modelName,Buffer.from(added.data));
rig.model={name:modelName,type:'input',subfolder:'studio-director'};
rig=addRoomLayout(rig,{name:'Discovery room',width:6,depth:5,height:3,doorWidth:1.2,doorHeight:2.2});
const prop=rig.props.find(p=>p.id===added.propId);prop.position=[.4,1.25,.4];
rig.props.push({id:crypto.randomUUID(),name:'Pedestal',shape:'box',joint:null,position:[.4,.52,.4],rotation:[0,0,0],size:[.4,1.04,.45],color:'#8d969e'});
const neutral=bones.map(()=>[0,0,0]);
function key(frame,head,spine,target,kind='key'){
 let pose=structuredClone(neutral);pose[2]=head;pose[1]=spine;
 applyPose(bones,rest,pose);applyChannels(bones,base,faces,{...rig,pose});root.updateMatrixWorld(true);
 if(target){const solved=solveRigIK(root,bones,rest,{...rig,pose},5,target);assert.ok(solved.distance<.002,'reach at '+frame);pose=solved.pose;}
 rig.keys.push({frame,pose,root:[0,0,0],face:faces.map(()=>0),easing:'smooth',kind});
}
key(0,[0,0,0],[0,0,0]);key(20,[8,18,-3],[0,0,0]);key(38,[13,24,-5],[0,0,0]);
key(52,[8,15,2],[-4,0,0],[.32,.93,-.06],'extreme');
key(72,[17,24,-4],[3,0,-2],[.43,1.25,.16],'breakdown');
key(96,[18,24,-3],[4,0,-2],[.4,1.25,.4]);key(104,[18,24,-3],[4,0,-2],[.4,1.25,.4]);
key(132,[-5,15,5],[-2,0,0],[.32,1.52,.31],'extreme');
key(154,[2,20,-5],[1,0,0],[.36,1.36,.36],'breakdown');key(180,[5,18,-2],[0,0,0],[.34,1.4,.34]);key(191,[5,18,-2],[0,0,0],[.34,1.4,.34]);
rig.channels=[0,1].map(i=>({id:'face:'+i,keys:[{frame:40,value:0,easing:'smooth'},{frame:43,value:1,easing:'smooth'},{frame:47,value:0,easing:'smooth'},{frame:139,value:0,easing:'smooth'},{frame:142,value:1,easing:'smooth'},{frame:146,value:0,easing:'smooth'}]}));
applyRigFrame(root,bones,rest,base,faces,rig,96);syncProps(root,bones,rig,96);
const grip=bones[5].getWorldPosition(new THREE.Vector3());assert.ok(grip.distanceTo(new THREE.Vector3(...prop.position))<.002);
prop.attachments=[attachmentEvent(root,bones,prop.id,5,96)];
applyRigFrame(root,bones,rest,base,faces,rig,0);
rig.contacts=[11,14].map(joint=>({id:crypto.randomUUID(),joint,start:0,end:191,target:bones[joint].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[joint].getWorldQuaternion(new THREE.Quaternion()).toArray()}));
let maxFootError=0,maxGripError=0;
for(let f=0;f<192;f++){
 assert.deepEqual(applyRigFrame(root,bones,rest,base,faces,rig,f).warnings,[],'frame '+f);
 for(const c of rig.contacts)maxFootError=Math.max(maxFootError,bones[c.joint].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...c.target)));
 if(f>=96){let object;root.traverse(o=>{if(o.userData.studioProp===prop.id)object=o;});maxGripError=Math.max(maxGripError,object.getWorldPosition(new THREE.Vector3()).distanceTo(bones[5].getWorldPosition(new THREE.Vector3())));}
}
assert.ok(maxFootError<.002);assert.ok(maxGripError<.002);
rig.camera={position:[3.2,2.4,5.4],target:[.1,1.1,.2]};
const project=newProject();project.title='Continuous performance · blocking review';project.style='Technical blocking pass; replace block art after acting review.';
project.synopsis='A memoryless adult notices a creation device, hesitates, reaches, picks it up, reacts and settles. No language or learned gun-handling behavior.';
project.scenes[0].shots=[{id:crypto.randomUUID(),title:'Notice → grasp → settle',seconds:8,action:'Frames 0–38 notice; 52 anticipation; 72 reach breakdown; 96 contact/pickup; 104 pause; 132 reaction; 154–191 settle. Review arcs, silhouette, weight and grip. Block hands have no fingers.',camera:'Three-quarter medium full shot',dialogue:'No dialogue.',rig3d:rig}];validateProject(project);
await fs.writeFile('reports/studio/fixtures/continuous-performance.json',JSON.stringify(project,null,2));
const glb=await exportRigGLB(root,bones,rest,rig,8,base,faces),report=await validateBytes(new Uint8Array(glb));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
await fs.writeFile('reports/studio/fixtures/continuous-performance.glb',Buffer.from(glb));
await fs.writeFile('reports/studio/fixtures/continuous-performance-check.json',JSON.stringify({frames:192,maxFootError,maxGripError,validatorErrors:report.issues.numErrors,limits:'Blocking fixture only; no finger articulation, automatic balance, finished art or approved acting. Browser review required.'},null,2));
console.log('Continuous blocking project and GLB saved; 192 frames checked.',{maxFootError,maxGripError});
