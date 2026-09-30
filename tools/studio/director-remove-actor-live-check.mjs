import fs from 'node:fs/promises';import assert from 'node:assert/strict';import * as THREE from 'three';
import {readRigGLB,jointsOf,faceControls,applyRigFrame} from '../../simple-editor/director-3d-engine.js';
// Transform-only check. The browser and decoded recording verify real textures.
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});globalThis.ProgressEvent=class{constructor(type,p){Object.assign(this,{type},p);}};
const read=async f=>JSON.parse((await fs.readFile(f,'utf8')).replace(/^\uFEFF/,''));const before=await read('reports/studio/fixtures/persistent-placement-project.json'),after=await read('reports/studio/fixtures/actor-removal-project.json');
for(const shot of before.scenes[0].shots)assert.deepEqual(after.scenes[0].shots.find(s=>s.id===shot.id),shot);
const source=before.scenes[0].shots[1].rig3d,reduced=after.scenes[0].shots.find(s=>s.title==='Actor removal · verification').rig3d;
const load=async r=>{const bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+r.model.subfolder+'/'+r.model.name);return readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const [a,b]=await Promise.all([source,reduced].map(load)),ab=jointsOf(a),bb=jointsOf(b),ar=ab.map(b=>b.quaternion.clone()),br=bb.map(b=>b.quaternion.clone()),ap=ab[0].position.clone(),bp=bb[0].position.clone();assert.equal(bb.length,15);
for(let frame=0;frame<120;frame++){applyRigFrame(a,ab,ar,ap,faceControls(a),source,frame);applyRigFrame(b,bb,br,bp,faceControls(b),reduced,frame);for(let i=0;i<15;i++)assert.ok(ab[15+i].matrixWorld.elements.every((v,j)=>Math.abs(v-bb[i].matrixWorld.elements[j])<1e-5));for(const prop of source.props||[]){let x,y;a.traverse(o=>{if(o.userData.studioProp===prop.id)x=o;});b.traverse(o=>{if(o.userData.studioProp===prop.id)y=o;});assert.ok(x&&y);assert.ok(x.matrixWorld.elements.every((v,j)=>Math.abs(v-y.matrixWorld.elements[j])<1e-5));}}
console.log('Actual reduced cast: guest world motion and every stage prop unchanged across 120 frames; all four pre-existing shots unchanged.');
