import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readRigGLB,jointsOf,faceControls,applyRigFrame} from '../../simple-editor/director-3d-engine.js';
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
// Transform-only check; texture appearance is checked in the real browser.
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const load=async name=>JSON.parse((await fs.readFile('reports/studio/fixtures/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
const before=await load('secondary-drag-before'),after=await load('secondary-drag-after'),old=before.scenes[0].shots[1].rig3d,next=after.scenes[0].shots[1].rig3d;
assert.deepEqual(before.scenes[0].shots[0],after.scenes[0].shots[0]);assert.deepEqual(old.keys,next.keys);assert.deepEqual(old.props,next.props);
const bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+old.model.subfolder+'/'+old.model.name),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),a=await readRigGLB(buffer),b=await readRigGLB(buffer),ab=jointsOf(a),bb=jointsOf(b),ar=ab.map(b=>b.quaternion.clone()),br=bb.map(b=>b.quaternion.clone()),base=ab[0].position.clone(),af=faceControls(a),bf=faceControls(b);
let delta=0;
for(let f=0;f<120;f++){
 applyRigFrame(a,ab,ar,base,af,old,f);applyRigFrame(b,bb,br,base,bf,next,f);
 for(let i=0;i<15;i++)assert.ok(ab[i].matrixWorld.elements.every((v,j)=>Math.abs(v-bb[i].matrixWorld.elements[j])<1e-10),'Main actor moved');
 if(f===0)assert.ok(ab[15].matrixWorld.elements.every((v,j)=>Math.abs(v-bb[15].matrixWorld.elements[j])<1e-10),'Guest opening pose changed');
 if(f===48)delta=ab[15].getWorldPosition(new THREE.Vector3()).distanceTo(bb[15].getWorldPosition(new THREE.Vector3()));
}
assert.ok(delta>.05);console.log('Live secondary drag verified: first shot unchanged, main actor unchanged across 120 frames, body poses/props retained, guest moved at frame 48.',{delta});
