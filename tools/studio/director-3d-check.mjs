import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateRig3D,sampleRig3D} from '../../simple-editor/director-3d-state.js';
import {validateProject,newProject} from '../../simple-editor/director-project.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
const rig={version:1,model:null,names:['Root'],pose:[[0,0,0]],keys:[{frame:0,easing:'linear',pose:[[0,0,0]]},{frame:14399,easing:'hold',pose:[[360,-180,90]]}]};validateRig3D(rig);assert.deepEqual(sampleRig3D(rig,14399/2),[[180,-90,45]]);assert.deepEqual(sampleRig3D(rig,-1),[[0,0,0]]);assert.deepEqual(sampleRig3D(rig,15000),[[360,-180,90]]);
const project=newProject();project.scenes[0].shots=[{id:'rig',seconds:600,rig3d:rig}];validateProject(JSON.parse(JSON.stringify(project)));
for(const modify of [r=>r.pose[0][0]=NaN,r=>r.keys[1].frame=0,r=>r.keys[1].frame=86400,r=>r.names=[],r=>r.model={name:'../../file.glb',type:'input',subfolder:''},r=>r.camera={position:[0,0,0],target:[0,0,0]}]){const bad=structuredClone(rig);modify(bad);assert.throws(()=>validateRig3D(bad));}
const path='output/playwright/director-starter-animated.glb',bytes=fs.readFileSync(path),report=await validateBytes(new Uint8Array(bytes),{maxIssues:50});
assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok(json.skins.length&&json.animations.length);assert.equal(json.skins[0].joints.length,15);assert.ok(json.meshes[0].primitives[0].attributes.WEIGHTS_0!==undefined);
console.log(JSON.stringify({schema:'passed',tenMinuteTimeline:'passed',skinJoints:json.skins[0].joints.length,animationChannels:json.animations[0].channels.length,validation:report.issues}));
