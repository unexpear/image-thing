// Synthetic QA asset, not final character artwork.
import fs from 'node:fs/promises';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {starterCharacter,jointsOf,faceControls,exportRigGLB} from '../../simple-editor/director-3d-engine.js';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(v=>{this.result='data:'+b.type+';base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
const root=starterCharacter(),bones=jointsOf(root),parts=[],tags=[];
for(const side of [-1,1])for(const pupil of [false,true]){
 const g=new THREE.SphereGeometry(pupil?.031:.068,16,12);g.scale(1,pupil?1:1.2,pupil?.3:.4);g.translate(side*.10,.29,pupil?.232:.207);const color=new THREE.Color(pupil?'#152435':'#fff5df'),colors=[];
 for(let i=0;i<g.attributes.position.count;i++){colors.push(color.r,color.g,color.b);tags.push({side,pupil});}g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));parts.push(g);
}
const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const base=geometry.attributes.position;
geometry.morphAttributes.position=['blinkLeft','blinkRight','lookLeft','lookRight','lookUp','lookDown'].map(name=>{const attr=base.clone();attr.name=name;for(let i=0;i<attr.count;i++){const {side,pupil}=tags[i];if(name==='blinkLeft'&&side===1||name==='blinkRight'&&side===-1)attr.setY(i,.29+(attr.getY(i)-.29)*.035);if(pupil){if(name==='lookLeft')attr.setX(i,attr.getX(i)+.025);if(name==='lookRight')attr.setX(i,attr.getX(i)-.025);if(name==='lookUp')attr.setY(i,attr.getY(i)+.025);if(name==='lookDown')attr.setY(i,attr.getY(i)-.025);}}return attr;});
const face=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7}));face.name='QA eyes';bones[2].add(face);
const mouth=new THREE.Mesh(new THREE.BoxGeometry(.14,.015,.018),new THREE.MeshStandardMaterial({color:'#733d38'}));mouth.position.set(0,.13,.202);bones[2].add(mouth);
const controls=faceControls(root),rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[],face:controls.map(()=>0)};
const glb=await exportRigGLB(root,bones,bones.map(b=>b.quaternion.clone()),rig,1,bones[0].position.clone(),controls);
await fs.mkdir('reports/studio/fixtures',{recursive:true});await fs.writeFile('reports/studio/fixtures/facial-acting.glb',Buffer.from(glb));
console.log('Synthetic facial rig saved with six eye shapes:',controls.map(c=>c.name).join(', '));
