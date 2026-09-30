import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {exportRigGLB,readRigGLB,jointsOf} from '../../simple-editor/director-3d-engine.js';
import {saveHandPose,blendHandPose} from '../../simple-editor/director-hands.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};
const root=new THREE.Scene(),bones=[],geometries=[];
function part(name,parent,local,size,color){
 const bone=new THREE.Bone();bone.name=name;bone.position.fromArray(local);(parent<0?root:bones[parent]).add(bone);bones.push(bone);root.updateMatrixWorld(true);
 const index=bones.length-1,position=bone.getWorldPosition(new THREE.Vector3()),g=new THREE.BoxGeometry(...size);g.translate(position.x,position.y+size[1]/2,position.z);
 const indices=[],weights=[],colors=[],c=new THREE.Color(color);for(let i=0;i<g.attributes.position.count;i++){indices.push(index,0,0,0);weights.push(1,0,0,0);colors.push(c.r,c.g,c.b);}
 g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometries.push(g);return index;
}
part('Wrist',-1,[0,.2,0],[.36,.36,.13],'#ceaa81');
for(const [finger,x,length] of [['Index',-.135,.13],['Middle',-.045,.15],['Ring',.045,.14],['Little',.135,.11]]){
 let parent=0;for(let segment=0;segment<3;segment++)parent=part(finger+'_'+(segment+1),parent,segment?[0,length,0]:[x,.36,0],[.075,length*.94,.085],segment===2?'#e2c29e':'#d6b28c');
}
let thumb=part('Thumb_1',0,[-.23,.13,0],[.09,.13,.10],'#d6b28c');part('Thumb_2',thumb,[0,.13,0],[.08,.12,.09],'#e2c29e');
const geometry=mergeGeometries(geometries);geometry.deleteAttribute('uv');geometries.forEach(g=>g.dispose());const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75}));root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
const neutral={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[]},data=await exportRigGLB(root,bones,bones.map(b=>b.quaternion.clone()),neutral,1,bones[0].position.clone(),[]);
assert.equal((await validateBytes(new Uint8Array(data))).issues.numErrors,0);
const loaded=await readRigGLB(data),loadedBones=jointsOf(loaded);assert.deepEqual(loadedBones.map(b=>b.name),neutral.names);
const filename='hand-fixture-'+crypto.randomUUID()+'.glb';await fs.writeFile('ComfyUI_windows_portable/ComfyUI/input/studio-director/'+filename,Buffer.from(data));
let rig={...structuredClone(neutral),model:{name:filename,subfolder:'studio-director',type:'input'}};rig=saveHandPose(rig,loadedBones,0,'Open');
rig.pose.forEach((p,i)=>{if(i)p[0]=i>=13?35:60;});rig=saveHandPose(rig,loadedBones,0,'Curl');rig=blendHandPose(rig,loadedBones,'Open',1);
rig.keys=[{frame:0,pose:structuredClone(rig.pose),easing:'smooth'},{frame:95,pose:structuredClone(rig.pose),easing:'smooth'}];rig.camera={position:[1.1,1.1,2],target:[0,.62,0]};
const project=newProject();project.title='Finger poses · verification';project.style='Synthetic articulated hand for tool testing, not production anatomy.';project.scenes[0].shots=[{id:crypto.randomUUID(),title:'Open → curl → open',seconds:4,action:'Blend Curl into the working pose at frame 48 and save a key. Verify the wrist stays unchanged.',rig3d:rig}];validateProject(project);
await fs.writeFile('reports/studio/fixtures/hand-pose-project.json',JSON.stringify(project,null,2));
console.log('15-joint hand model validated; open/curl partial poses and editable test project saved.');
