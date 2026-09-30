import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readRigGLB,jointsOf} from '../../simple-editor/director-3d-engine.js';
const read=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
const before=await read('reports/studio/fixtures/individual-actor-reuse-project.json'),after=await read('reports/studio/fixtures/persistent-placement-project.json');
assert.deepEqual(after.scenes[0].shots.slice(0,2),before.scenes[0].shots.slice(0,2));
const old=before.scenes[0].shots[2].rig3d,placed=after.scenes[0].shots[2].rig3d,reused=after.scenes[0].shots[3].rig3d;assert.deepEqual(placed.keys,old.keys);assert.equal(reused.keys.length,0);
const load=async rig=>{const f=rig.model,bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+f.subfolder+'/'+f.name);return readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const roots=await Promise.all([old,placed,reused].map(load));roots.forEach(r=>r.updateMatrixWorld(true));const [ob,pb,rb]=roots.map(jointsOf);assert.equal(rb.length,15);
const parent=ob[0].parent.matrixWorld.clone(),pivot=ob[0].position.clone(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),35*Math.PI/180),pos=pivot.clone().add(new THREE.Vector3(.5,0,0)).sub(pivot.clone().applyQuaternion(q)),delta=parent.clone().multiply(new THREE.Matrix4().compose(pos,q,new THREE.Vector3(1,1,1))).multiply(parent.clone().invert());
for(let i=0;i<15;i++){const expected=ob[i].matrixWorld.clone().premultiply(delta);assert.ok(expected.elements.every((v,j)=>Math.abs(v-pb[i].matrixWorld.elements[j])<1e-5));assert.ok(pb[i].matrixWorld.elements.every((v,j)=>Math.abs(v-rb[i].matrixWorld.elements[j])<1e-5));}
console.log('Actual UI project: first two shots unchanged, animation keys retained, all 15 neutral joints have requested placement, library copy preserves it without shot motion.');
