import assert from 'node:assert/strict';
import {draftHandGrip,saveHandPose} from '../../simple-editor/director-hands.js';
import {sampleRig3D,validateRig3D} from '../../simple-editor/director-3d-state.js';
const body={},wrist={parent:body},finger={parent:wrist},other={parent:body},bones=[body,wrist,finger,other];
let rig={version:1,model:null,names:['Body','Wrist','Finger','Other'],rotationMode:'shortest',pose:[[0,0,0],[0,0,0],[70,25,15],[0,0,0]],keys:[],face:[.4]};
rig=saveHandPose(rig,bones,1,'Grip');rig.pose[2]=[0,0,0];rig.keys=[{frame:0,pose:structuredClone(rig.pose),easing:'smooth'},{frame:100,pose:[[5,10,15],[20,15,0],[-100,60,130],[45,0,0]],easing:'smooth'}];
const before=JSON.stringify(rig),gripped=draftHandGrip(rig,bones,'Grip',{start:20,close:8,hold:12,release:8,lastFrame:100});validateRig3D(gripped);assert.equal(JSON.stringify(rig),before);assert.deepEqual(gripped.keys,rig.keys);assert.deepEqual(gripped.face,rig.face);
for(let f=0;f<=100;f++){
 const a=sampleRig3D(rig,f),b=sampleRig3D(gripped,f);
 for(const i of [0,1,3])assert.deepEqual(a[i],b[i]);
 if(f<=20||f>=48)assert.deepEqual(a[2],b[2],`Underlying shortest rotation changed at ${f}`);
 if(f>=28&&f<=40)b[2].forEach((v,i)=>assert.ok(Math.abs(v-[70,25,15][i])<1e-10));
}
const retained=draftHandGrip(rig,bones,'Grip',{start:20,close:8,hold:0,release:0,lastFrame:100});assert.deepEqual(sampleRig3D(retained,100)[2],[70,25,15]);
assert.throws(()=>draftHandGrip(gripped,bones,'Grip',{start:22,close:2,hold:0,release:2,lastFrame:100}),/overlaps/);
assert.throws(()=>draftHandGrip(retained,bones,'Grip',{start:60,close:2,hold:0,release:2,lastFrame:100}),/overlaps/);
assert.throws(()=>draftHandGrip(gripped,bones,'Grip',{start:0,close:2,hold:0,release:0,lastFrame:100}),/overlaps/);
const repeated=draftHandGrip(gripped,bones,'Grip',{start:60,close:2,hold:0,release:2,lastFrame:100});validateRig3D(repeated);assert.equal(repeated.channels.length,3);assert.equal(repeated.channels[0].keys.length,7);
const incompatible=structuredClone(rig);incompatible.channels=[{id:'joint:2:0',keys:[{frame:0,value:0}]}];assert.throws(()=>draftHandGrip(incompatible,bones,'Grip',{start:20,close:8,hold:0,release:8,lastFrame:100}),/incompatible/);
assert.throws(()=>draftHandGrip(rig,bones,'Grip',{start:99,close:8,hold:0,release:0,lastFrame:100}),/inside/);
console.log('Grip timing passed: close/hold/release, indefinite hold, body/face/key isolation, shortest-path preservation outside gesture, repeated gestures, overlap/incompatible/range rejection.');
