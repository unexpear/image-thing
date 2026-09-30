import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readRigGLB,jointsOf,faceControls,applyRigFrame,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
import {upgradeStarterFingers,remapJointState} from '../../simple-editor/director-starter-upgrade.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const project=JSON.parse((await fs.readFile('reports/studio/fixtures/continuous-performance-gaze.json','utf8')).replace(/^\uFEFF/,''));
const rig=project.scenes[0].shots[0].rig3d,before=JSON.stringify(rig),bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+rig.model.subfolder+'/'+rig.model.name);
const root=await readRigGLB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone(),faces=faceControls(root);
const result=await upgradeStarterFingers({root,rig,rest,baseRoot,baseFaces:faces.map(c=>c.base)}),after=jointsOf(result.root),afterRest=after.map(b=>b.quaternion.clone()),afterFaces=faceControls(result.root);
assert.equal(after.length,43);assert.equal(afterFaces.length,faces.length);assert.equal(JSON.stringify(rig),before);
let maxDelta=0;
for(let f=0;f<192;f++){
 assert.deepEqual(applyRigFrame(root,bones,rest,baseRoot,faces,rig,f).warnings,[]);
 assert.deepEqual(applyRigFrame(result.root,after,afterRest,baseRoot,afterFaces,result.rig,f).warnings,[]);
 for(const b of bones){const matching=after.find(a=>a.name===b.name);assert.ok(matching);b.matrixWorld.elements.forEach((v,i)=>maxDelta=Math.max(maxDelta,Math.abs(v-matching.matrixWorld.elements[i])));}
 for(const prop of rig.props){let oldMesh,newMesh;root.traverse(o=>{if(o.userData.studioProp===prop.id)oldMesh=o;});result.root.traverse(o=>{if(o.userData.studioProp===prop.id)newMesh=o;});assert.ok(oldMesh&&newMesh);oldMesh.matrixWorld.elements.forEach((v,i)=>maxDelta=Math.max(maxDelta,Math.abs(v-newMesh.matrixWorld.elements[i])));}
 assert.deepEqual(afterFaces.map(c=>c.mesh.morphTargetInfluences[c.index]),faces.map(c=>c.mesh.morphTargetInfluences[c.index]));
}
assert.ok(maxDelta<1e-5,`Motion drift ${maxDelta}`);
const glb=await exportRigGLB(result.root,after,afterRest,result.rig,8,baseRoot,afterFaces);assert.equal((await validateBytes(new Uint8Array(glb))).issues.numErrors,0);
await assert.rejects(upgradeStarterFingers({root:result.root,rig:result.rig,rest:afterRest,baseRoot,baseFaces:afterFaces.map(c=>c.base)}),/15-joint/);
const sample=structuredClone(rig);sample.limits=bones.map(()=>null);sample.limits[8]=[[-45,-45,-45],[45,45,45]];sample.savedPoses=[{name:'Saved',pose:sample.pose,root:[0,0,0],face:sample.face}];sample.channels.push({id:'joint:8:0',keys:[{frame:0,value:20,easing:'linear'}]},{id:'position:8:2',keys:[{frame:0,value:.02,easing:'linear'}]});sample.handPoses=[{name:'Partial subset',wrist:3,joints:[4,5],pose:[[1,2,3],[4,5,6]]}];
const mapped=remapJointState(sample,bones.map(b=>b.name),after.map(b=>({name:b.name,userData:{studioBoneId:b.name}}))),index=after.findIndex(b=>b.name===bones[8].name);
assert.deepEqual(mapped.limits[index],sample.limits[8]);assert.equal(mapped.savedPoses[0].pose.length,43);assert.ok(mapped.channels.some(c=>c.id===`joint:${index}:0`));assert.ok(mapped.channels.some(c=>c.id===`position:${index}:2`));assert.equal(mapped.handPoses[0].wrist,after.findIndex(b=>b.name===bones[3].name));
let body;root.traverse(o=>{if(o.isSkinnedMesh)body=o;});body.geometry.attributes.position.setX(0,999);
await assert.rejects(upgradeStarterFingers({root,rig,rest,baseRoot,baseFaces:faces.map(c=>c.base)}),/geometry was edited/);
console.log('Starter upgrade: 192-frame body/prop/eye parity, contacts, 43 joints, immutable source, repeat rejection and valid animated GLB.',{maxDelta});
