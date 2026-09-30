import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readRigGLB,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const load=async name=>JSON.parse((await fs.readFile('reports/studio/fixtures/'+name,'utf8')).replace(/^\uFEFF/,''));
const old=(await load('continuous-performance-fingers.json')).scenes[0].shots[0].rig3d,rig=(await load('continuous-performance-grip.json')).scenes[0].shots[0].rig3d;
assert.deepEqual(rig.keys,old.keys);assert.deepEqual(rig.contacts,old.contacts);assert.deepEqual(rig.props,old.props);assert.deepEqual(rig.eyeMap,old.eyeMap);
const bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+rig.model.subfolder+'/'+rig.model.name),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const a=await readRigGLB(buffer),b=await readRigGLB(buffer),ab=jointsOf(a),bb=jointsOf(b),ar=ab.map(b=>b.quaternion.clone()),br=bb.map(b=>b.quaternion.clone()),base=ab[0].position.clone(),af=faceControls(a),bf=faceControls(b),fingers=new Set(rig.handPoses[0].joints);
let maxBodyDelta=0;
for(let f=0;f<192;f++){
 assert.deepEqual(applyRigFrame(a,ab,ar,base,af,old,f).warnings,[]);assert.deepEqual(applyRigFrame(b,bb,br,base,bf,rig,f).warnings,[]);
 for(let i=0;i<ab.length;i++)if(!fingers.has(i))ab[i].matrixWorld.elements.forEach((v,j)=>maxBodyDelta=Math.max(maxBodyDelta,Math.abs(v-bb[i].matrixWorld.elements[j])));
 if(f>=96)assert.ok(bb[6].quaternion.angleTo(br[6])>.5,'Finger must close');
}
assert.equal(maxBodyDelta,0);const glb=await exportRigGLB(b,bb,br,rig,8,base,bf);const report=await validateBytes(new Uint8Array(glb));assert.equal(report.issues.numErrors,0);
await fs.writeFile('reports/studio/fixtures/continuous-performance-grip.glb',Buffer.from(glb));
console.log('Authored grip: all 192 frames preserve non-finger transforms, zero contact warnings, finger closes, unchanged body keys/props/eyes, validator-clean animated GLB. Visual handle alignment still requires review.');
