import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,applyRigFrame,exportRigGLB,faceControls} from '../../simple-editor/director-3d-engine.js';
import {validateRig3D,sampleChannel} from '../../simple-editor/director-3d-state.js';
import {syncProps,validateContactChains} from '../../simple-editor/director-performance-engine.js';
import {characterSetup,addBlink,performanceScrubTracks,mouthCueFrames,PERFORMANCE_SCRUB_LANE_GROUPS,defaultPerformanceScrubLanes,normalizePerformanceScrubLanes,performanceScrubLanesAllOn,shotPerformanceScrubLanes,applyPerformanceScrubLanes,validateShotPerformanceScrubLanes,filterPerformanceScrubTracks,performanceScrubKindVisible} from '../../simple-editor/director-performance-state.js';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProject,newProject} from '../../simple-editor/director-project.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(v=>{this.result='data:'+b.type+';base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),base=bones[0].position.clone();
const pose=bones.map(()=>[0,0,0]),rig={version:1,model:null,names:bones.map(b=>b.name),pose,keys:[{frame:0,easing:'linear',pose:structuredClone(pose),root:[0,0,0]},{frame:24,easing:'linear',pose:structuredClone(pose),root:[.08,-.06,0]}]};
root.updateMatrixWorld(true);rig.contacts=[{id:'foot',joint:11,start:0,end:24,target:bones[11].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[11].getWorldQuaternion(new THREE.Quaternion()).toArray()}];
rig.props=[{id:'prop',name:'Test held box',shape:'box',color:'#ee9933',joint:5,position:[0,-.1,0],rotation:[0,0,20],size:[.2,.3,.1]}];
validateRig3D(rig);validateContactChains(bones,rig.contacts);syncProps(root,bones,rig);const source=JSON.stringify(rig);
for(const f of [0,6,12,24,12,0]){const result=applyRigFrame(root,bones,rest,base,[],rig,f);assert.deepEqual(result.warnings,[]);assert.ok(bones[11].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...rig.contacts[0].target))<.01);assert.ok(bones[11].getWorldQuaternion(new THREE.Quaternion()).angleTo(new THREE.Quaternion(...rig.contacts[0].orientation))<.02);const prop=root.getObjectByName('Test held box');assert.equal(prop.parent,bones[5]);assert.ok(prop.position.distanceTo(new THREE.Vector3(0,-.1,0))<1e-8);}
assert.equal(JSON.stringify(rig),source);
assert.throws(()=>validateContactChains(bones,[...rig.contacts,{...rig.contacts[0],id:'duplicate'}]),/independent/);
const unreachable=structuredClone(rig);unreachable.contacts[0].target=[100,100,100];assert.ok(applyRigFrame(root,bones,rest,base,[],unreachable,12).warnings.length);await assert.rejects(()=>exportRigGLB(root,bones,rest,unreachable,1,base,[]),/Export stopped/);
let mesh;root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const morph=mesh.geometry.attributes.position.clone();morph.name='Blink';mesh.geometry.morphAttributes.position=[morph];mesh.updateMorphTargets();rig.face=[0];rig.expressions=[{name:'Closed',face:[1]}];addBlink(rig,6,0,47);assert.equal(sampleChannel(rig,8,'face',[0])[0],1);assert.equal(sampleChannel(rig,12,'face',[0])[0],0);validateRig3D(rig);assert.throws(()=>addBlink(rig,6,0,47),/empty/);
const reusable=characterSetup(rig);validateRig3D(reusable.rig);assert.equal(reusable.rig.keys.length,0);assert.equal(reusable.rig.contacts,undefined);assert.equal(reusable.rig.faceKeys,undefined);assert.equal(reusable.rig.props.length,1);assert.equal(reusable.rig.expressions.length,1);
const data=await exportRigGLB(root,bones,rest,rig,2,base,faceControls(root)),report=await validateBytes(new Uint8Array(data));assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));const bytes=Buffer.from(data),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.ok(json.nodes.some(n=>n.name==='Test held box'));assert.ok(json.animations[0].channels.some(c=>c.target.path==='weights'));assert.ok(json.animations[0].channels.some(c=>c.target.path==='rotation'&&json.nodes[c.target.node].name==='Left foot'));
const bad=structuredClone(rig);bad.props[0].joint=500;assert.throws(()=>validateRig3D(bad),/prop/);bad.props=[];bad.faceKeys[0].face=[NaN];assert.throws(()=>validateRig3D(bad),/facial/);
console.log('Performance checks passed: persistent joint props, moving-root foot position/orientation, reverse scrubbing, conflicts, unreachable export rejection, separate blink keys, reusable setup and valid animated GLB with props/contact/face tracks.');
const independent={...structuredClone(rig),keys:[],contacts:[],faceKeys:[],channels:[
 {id:'joint:5:2',keys:[{frame:0,value:0,easing:'linear'},{frame:24,value:30,easing:'linear'}]},
 {id:'root:0',keys:[{frame:0,value:0,easing:'linear'},{frame:24,value:.2,easing:'linear'}]},
 {id:'face:0',blendTarget:1,keys:[{frame:0,value:0,easing:'linear'},{frame:24,value:1,easing:'linear'}]}]};
independent.face=[.2];
validateRig3D(independent);
const channelData=await exportRigGLB(root,bones,rest,independent,2,base,faceControls(root));
const channelReport=await validateBytes(new Uint8Array(channelData));assert.equal(channelReport.issues.numErrors,0);
const cb=Buffer.from(channelData),cj=JSON.parse(cb.subarray(20,20+cb.readUInt32LE(12)).toString()),binaryStart=20+cb.readUInt32LE(12)+8;
const track=cj.animations[0].channels.find(c=>c.target.path==='translation');assert.ok(track);
const accessor=cj.accessors[cj.animations[0].samplers[track.sampler].output],bufferView=cj.bufferViews[accessor.bufferView];
assert.ok(Math.abs(cb.readFloatLE(binaryStart+(bufferView.byteOffset||0)+(accessor.byteOffset||0)+12*3*4)-(base.x+.1))<1e-6);
assert.ok(cj.animations[0].channels.some(c=>c.target.path==='weights'));
const weights=cj.animations[0].channels.find(c=>c.target.path==='weights'),wa=cj.accessors[cj.animations[0].samplers[weights.sampler].output],wv=cj.bufferViews[wa.bufferView];assert.ok(Math.abs(cb.readFloatLE(binaryStart+(wv.byteOffset||0)+(wa.byteOffset||0)+12*4)-.6)<1e-6);
assert.ok(cj.animations[0].channels.some(c=>c.target.path==='rotation'&&cj.nodes[c.target.node].name===bones[5].name));
console.log('Channel-only GLB export passed: joint, root and face tracks, sampled root position and glTF validation.');

// Multi-track scrub strip model (contact / attachment / weight)
const scrubEmpty=performanceScrubTracks({version:1,names:rig.names,keys:[{frame:0,easing:'linear',pose:structuredClone(pose),root:[0,0,0]},{frame:24,easing:'linear',pose:structuredClone(pose),root:[0,0,0]}],props:[],contacts:[]},47);
assert.equal(scrubEmpty.tracks.length,0,'default zero roots and no contacts/attachments stay off the strip');

const scrubRig=structuredClone(rig);delete scrubRig.faceKeys;delete scrubRig.featureKeys;delete scrubRig.eyeTracks;delete scrubRig.cameraKeys;delete scrubRig.lipSync;
scrubRig.contacts=[{id:'foot-hold',joint:11,start:4,end:20,target:[0,0,0],orientation:[0,0,0,1]}];
scrubRig.props=[{id:'prop',name:'Device',shape:'box',color:'#ee9933',joint:null,position:[0,0,0],rotation:[0,0,0],size:[.2,.2,.2],firstFrame:8,attachments:[
 {frame:12,joint:5,position:[0,.02,.08],rotation:[0,0,0],size:[.2,.2,.2]},
 {frame:30,joint:null,position:[0,0,0],rotation:[0,0,0],size:[.2,.2,.2]}
]}];
scrubRig.keys=[{frame:0,easing:'linear',pose:structuredClone(pose),root:[0,0,0]},{frame:12,easing:'linear',pose:structuredClone(pose),root:[-.05,-.05,0]},{frame:24,easing:'linear',pose:structuredClone(pose),root:[0,0,0]}];
const scrub=performanceScrubTracks(scrubRig,47);
assert.equal(scrub.last,47);
const kinds=scrub.tracks.map(t=>t.kind);
assert.ok(kinds.includes('contact')&&kinds.includes('attachment')&&kinds.includes('weight'));
assert.equal(kinds.filter(k=>k==='contact'||k==='attachment'||k==='weight').length,3);
const contact=scrub.tracks.find(t=>t.kind==='contact');
assert.equal(contact.spans[0].start,4);assert.equal(contact.spans[0].end,20);
assert.match(contact.name,/foot|11/i);
const attach=scrub.tracks.find(t=>t.kind==='attachment');
assert.ok(attach.marks.some(m=>m.frame===8&&m.label==='appears'));
assert.ok(attach.spans.some(s=>s.start===12&&s.label.includes('hand')||s.start===12));
assert.ok(attach.spans.some(s=>s.start===30&&s.label==='Stage'));
const weight=scrub.tracks.find(t=>t.kind==='weight');
assert.deepEqual(weight.marks.map(m=>m.frame),[0,12,24]);

const channelWeight=performanceScrubTracks({version:1,names:rig.names,keys:[],channels:[{id:'root:1',keys:[{frame:6,value:-.04,easing:'linear'},{frame:18,value:0,easing:'linear'}]}],props:[],contacts:[]},47);
assert.equal(channelWeight.tracks.length,1);
assert.equal(channelWeight.tracks[0].kind,'weight');
assert.deepEqual(channelWeight.tracks[0].marks.map(m=>m.frame),[6,18]);
// Extended scrub lanes: camera / face / feature / eye / mouth
const faceMorph=[0,0,0];
const extended=performanceScrubTracks({
 version:1,
 names:rig.names,
 face:faceMorph,
 keys:[],
 cameraKeys:[{frame:0,position:[0,1,3],target:[0,1,0]},{frame:24,position:[1,1,3],target:[0,1,0],easing:'smooth'}],
 faceKeys:[{frame:6,easing:'smooth',face:[1,0,0]},{frame:18,easing:'linear',face:[0,0,0]}],
 featureKeys:[{frame:10,eyes:{style:'round',size:1,spread:0,height:0},ears:{style:'round',size:1,spread:0,height:0},mouth:{style:'smile',width:1,height:0},brows:{style:'neutral',spread:0,height:0}}],
 eyeTracks:[{id:'eye-L',joint:0,axis:'+Z',start:2,end:14,target:[0,1,3]}],
 lipSync:{mouthCues:[{start:0,end:0.5,value:'X'},{start:0.5,end:1.2,value:'A'},{start:1.2,end:2,value:'X'}]},
 props:[],
 contacts:[]
},47);
assert.deepEqual(extended.tracks.map(t=>t.kind),['camera','face','feature','eye','mouth']);
const cam=extended.tracks.find(t=>t.kind==='camera');
assert.equal(cam.marks.length,2);
assert.equal(cam.marks[1].label,'smooth');
assert.ok(cam.spans.some(sp=>sp.start===0&&sp.end===23));
const face=extended.tracks.find(t=>t.kind==='face');
assert.deepEqual(face.marks.map(m=>m.frame),[6,18]);
const feat=extended.tracks.find(t=>t.kind==='feature');
assert.equal(feat.marks[0].frame,10);
const eye=extended.tracks.find(t=>t.kind==='eye');
assert.equal(eye.spans[0].start,2);assert.equal(eye.spans[0].end,14);
const mouth=extended.tracks.find(t=>t.kind==='mouth');
assert.ok(mouth.spans.some(sp=>sp.label==='Mouth A'));
const mf=mouthCueFrames({mouthCues:[{start:0,end:1,value:'B'}]},23);
assert.equal(mf.spans[0].start,0);
assert.equal(mf.marks[0].label,'B');
assert.throws(()=>mouthCueFrames({},0,{fps:0}),/fps/);
console.log('Performance scrub tracks passed: empty default, contact spans, attachment marks/holds, pose+channel weight, camera/face/feature/eye/mouth lanes.');

// Performance scrub lane filter (durable shot prefs)
assert.deepEqual(PERFORMANCE_SCRUB_LANE_GROUPS.map(g=>g.id),['camera','body','face','expression','eye','mouth']);
assert.ok(performanceScrubLanesAllOn(defaultPerformanceScrubLanes()));
assert.ok(performanceScrubLanesAllOn(normalizePerformanceScrubLanes(undefined)));
assert.ok(performanceScrubLanesAllOn(normalizePerformanceScrubLanes({camera:true})));
const half=normalizePerformanceScrubLanes({camera:false,mouth:false});
assert.equal(half.camera,false);assert.equal(half.mouth,false);assert.equal(half.body,true);assert.equal(half.face,true);
assert.equal(performanceScrubKindVisible(half,'camera'),false);
assert.equal(performanceScrubKindVisible(half,'contact'),true);
assert.equal(performanceScrubKindVisible(half,'attachment'),true);
assert.equal(performanceScrubKindVisible(half,'weight'),true);
assert.equal(performanceScrubKindVisible(half,'mouth'),false);
assert.equal(performanceScrubKindVisible(half,'feature'),true);
const filtered=filterPerformanceScrubTracks(extended.tracks,half);
assert.deepEqual(filtered.map(t=>t.kind),['face','feature','eye']);
const hideBody=filterPerformanceScrubTracks(scrub.tracks,{body:false});
assert.equal(hideBody.length,0);
const shotFilter={id:'scrub-filter-shot'};
assert.ok(performanceScrubLanesAllOn(shotPerformanceScrubLanes(shotFilter)));
applyPerformanceScrubLanes(shotFilter,{camera:false,eye:false});
assert.deepEqual(shotFilter.performanceScrubLanes,{camera:false,body:true,face:true,expression:true,eye:false,mouth:true});
validateShotPerformanceScrubLanes(shotFilter);
applyPerformanceScrubLanes(shotFilter,defaultPerformanceScrubLanes());
assert.equal(shotFilter.performanceScrubLanes,undefined);
assert.throws(()=>validateShotPerformanceScrubLanes({performanceScrubLanes:null}),/object/i);
assert.throws(()=>validateShotPerformanceScrubLanes({performanceScrubLanes:{nope:true}}),/Unknown/i);
assert.throws(()=>validateShotPerformanceScrubLanes({performanceScrubLanes:{camera:'yes'}}),/true or false/i);
assert.throws(()=>applyPerformanceScrubLanes(null,{}),/Shot required/i);
const filterProj=newProject();
filterProj.scenes[0].shots.push({id:'s1',title:'A',action:'',camera:'',dialogue:'',seconds:2,performanceScrubLanes:{camera:false,body:true,face:true,expression:true,eye:true,mouth:true}});
validateProject(filterProj);

const rootDir=join(dirname(fileURLToPath(import.meta.url)),'../..');
const uiSrc=readFileSync(join(rootDir,'simple-editor/director-performance-ui.js'),'utf8');
assert.match(uiSrc,/performance-scrub-filter/);
assert.match(uiSrc,/Show lanes/);
assert.match(uiSrc,/getLanes/);
assert.match(uiSrc,/setLanes/);
assert.match(uiSrc,/filterPerformanceScrubTracks/);
assert.match(uiSrc,/PERFORMANCE_SCRUB_LANE_GROUPS/);
const threeSrc=readFileSync(join(rootDir,'simple-editor/director-3d.js'),'utf8');
assert.match(threeSrc,/shotPerformanceScrubLanes/);
assert.match(threeSrc,/applyPerformanceScrubLanes/);
assert.match(threeSrc,/getLanes:\(\)=>shotPerformanceScrubLanes\(shot\)/);
const projSrc=readFileSync(join(rootDir,'simple-editor/director-project.js'),'utf8');
assert.match(projSrc,/validateShotPerformanceScrubLanes/);
const cssSrc=readFileSync(join(rootDir,'simple-editor/director.css'),'utf8');
assert.match(cssSrc,/performance-scrub-filter-chip/);
console.log('Performance scrub lane filter passed: groups, normalize, durable omit-all, validate, project wiring, UI chips.');

