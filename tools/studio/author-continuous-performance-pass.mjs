// Offline authoring pass for Continuous performance · blocking review.
// Uses the app's own keyPropGrip, solveRigIK, applyRigFrame, reviewRigMotion, validateRig3D.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {readRigGLB,jointsOf,faceControls,applyRigFrame,applyPose,applyChannels} from '../../simple-editor/director-3d-engine.js';
import {solveRigIK} from '../../simple-editor/director-ik3d.js';
import {keyPropGrip} from '../../simple-editor/director-grip-target.js';
import {reviewRigMotion} from '../../simple-editor/director-motion-review.js';
import {validateRig3D,sampleChannel} from '../../simple-editor/director-3d-state.js';
import {validateProject} from '../../simple-editor/director-project.js';
import {validateFeatures} from '../../simple-editor/director-features.js';

globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};

const LIVE='studio-data/director-projects/ccb41fd7e831d97f2239fb674e0337debff17e35e72c6eb41e678a4891a01d63/latest.json';
const FIXTURE='reports/studio/fixtures/continuous-eye-overlap-project.json';

const project=JSON.parse((await fs.readFile(LIVE,'utf8')).replace(/^\uFEFF/,''));
const shot=project.scenes[0].shots.find(s=>s.id==='397f835c-4984-45f2-be66-7b07048537fb');
if(!shot)throw Error('Shot missing');
let rig=structuredClone(shot.rig3d);

const bytes=await fs.readFile('ComfyUI_windows_portable/ComfyUI/input/'+rig.model.subfolder+'/'+rig.model.name);
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const root=await readRigGLB(buffer);
const bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone(),morphs=faceControls(root);

const keyAt=frame=>{const key=rig.keys.find(k=>k.frame===frame);if(!key)throw Error('Missing key '+frame);return key;};
const lerp3=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const shortestEuler=(a,b,t)=>a.map((x,i)=>{let d=b[i]-x;while(d>180)d-=360;while(d<-180)d+=360;return x+d*t;});
const handAt=frame=>{applyRigFrame(root,bones,rest,baseRoot,morphs,rig,frame);return bones[5].getWorldPosition(new THREE.Vector3()).toArray();};

// --- Weight ---
const weight={
 52:{root:[-0.12,-0.105,-0.04],spine:[-6,4,-2],hips:[0,10,-5],Rsh:[8,-12,-6],Rel:[0,0,18]},
 72:{root:[0.09,-0.135,0.11],spine:[5,-3,-4],hips:[5,-8,4],Rsh:[18,-22,-12],Rel:[0,0,32]},
 84:{root:[0.10,-0.11,0.085],spine:[5.2,-4,-3.5],hips:[4,-9,3],Rsh:[20,-24,-14],Rel:[0,0,36]},
 96:{root:[0.12,-0.09,0.07],spine:[6,-5,-3],hips:[3,-11,2],Rsh:[22,-28,-16],Rel:[0,0,40]},
 104:{root:[0.11,-0.07,0.055],spine:[5.5,-4,-2.5],hips:[2,-10,2],Rsh:[20,-26,-14],Rel:[0,0,38]},
 132:{root:[-0.12,-0.11,-0.095],spine:[-4,6,-2],hips:[-4,12,-6],Rsh:[12,-18,-10],Rel:[0,0,24]},
 154:{root:[0.085,-0.055,0.015],spine:[2,2,0],hips:[1,4,-2],Rsh:[6,-10,-5],Rel:[0,0,12]},
};
for(const [frame,w] of Object.entries(weight)){
 const key=keyAt(+frame);
 key.root=w.root;key.pose[0]=w.hips;key.pose[1]=w.spine;key.pose[20]=w.Rsh;key.pose[21]=w.Rel;
}

// Strip prior approach breakdowns; keep structural keys for clean chord baking.
const keep=new Set([0,20,38,52,72,84,96,104,132,154,180,191]);
rig.keys=rig.keys.filter(k=>keep.has(k.frame));

// Slight forward bias on anticipation hand so the reach chord is shorter after the stronger root.
{
 const k52=keyAt(52),target=lerp3(handAt(52),handAt(72),0.12);
 applyPose(bones,rest,k52.pose);applyChannels(bones,baseRoot,morphs,{...rig,pose:k52.pose,root:k52.root,channels:[]});root.updateMatrixWorld(true);
 const elbow=bones[4].getWorldPosition(new THREE.Vector3()),start=bones[3].getWorldPosition(new THREE.Vector3());
 const axis=new THREE.Vector3(...target).sub(start);
 const pole=elbow.clone().sub(start).cross(axis).lengthSq()>1e-12?elbow.toArray():null;
 const solved=solveRigIK(root,bones,rest,{...rig,pose:k52.pose},5,target,pole);
 k52.pose[3]=solved.pose[3];k52.pose[4]=solved.pose[4];k52.pose[5]=solved.pose[5];
}

const h38=handAt(38),h52=handAt(52),h72=handAt(72),h96=handAt(96);
function bake(frame,fromFrame,toFrame,handFrom,handTo,handT,armT,rootT){
 const from=keyAt(fromFrame),to=keyAt(toFrame);
 const pose=structuredClone(from.pose);
 pose[0]=lerp3(from.pose[0],to.pose[0],rootT);pose[1]=lerp3(from.pose[1],to.pose[1],rootT);
 pose[20]=lerp3(from.pose[20],to.pose[20],rootT*0.75);pose[21]=lerp3(from.pose[21],to.pose[21],rootT*0.75);
 pose[3]=shortestEuler(from.pose[3],to.pose[3],armT);pose[4]=shortestEuler(from.pose[4],to.pose[4],armT);pose[5]=shortestEuler(from.pose[5],to.pose[5],armT);
 const rootPos=lerp3(from.root,to.root,rootT);
 const face=lerp3(from.face,to.face,(frame-fromFrame)/(toFrame-fromFrame));
 const target=lerp3(handFrom,handTo,handT);
 applyPose(bones,rest,pose);applyChannels(bones,baseRoot,morphs,{...rig,pose,root:rootPos,channels:[]});root.updateMatrixWorld(true);
 const elbow=bones[4].getWorldPosition(new THREE.Vector3()),start=bones[3].getWorldPosition(new THREE.Vector3());
 const axis=new THREE.Vector3(...target).sub(start);
 const pole=elbow.clone().sub(start).cross(axis).lengthSq()>1e-12?elbow.toArray():null;
 const solved=solveRigIK(root,bones,rest,{...rig,pose},5,target,pole);
 pose[3]=solved.pose[3];pose[4]=solved.pose[4];pose[5]=solved.pose[5];
 rig.keys=[...rig.keys.filter(k=>k.frame!==frame),{frame,pose,root:rootPos,face,easing:'smooth',kind:'breakdown'}].sort((a,b)=>a.frame-b.frame);
}

bake(42,38,52,h38,h52,0.34,0.34,0.30);
bake(48,38,52,h38,h52,0.76,0.60,0.70);
bake(54,52,72,h52,h72,0.12,0.12,0.14);
bake(56,52,72,h52,h72,0.22,0.20,0.25);
bake(60,52,72,h52,h72,0.40,0.36,0.42);
bake(64,52,72,h52,h72,0.58,0.54,0.58);
bake(68,52,72,h52,h72,0.78,0.74,0.78);
bake(80,72,96,h72,h96,0.35,0.32,0.40);
bake(84,72,96,h72,h96,0.55,0.52,0.58);
bake(88,72,96,h72,h96,0.72,0.68,0.75);

// Restore authored weight roots / torso after bake lerps.
for(const [frame,w] of Object.entries(weight)){
 const key=keyAt(+frame);
 key.root=w.root;key.pose[0]=w.hips;key.pose[1]=w.spine;key.pose[20]=w.Rsh;key.pose[21]=w.Rel;
}

// --- Grip ---
const propId=rig.props.find(p=>/creation device/i.test(p.name)).id;
for(const frame of [96,104]){
 rig=keyPropGrip({root,rest,baseRoot,rig,frame,lastFrame:191,propId,joint:5,position:[0,-0.078,-0.008],rotation:[14,6,-18]});
}

// --- Face ---
const mouth=(style,extra={})=>({style,color:'#6b2a2a',scale:1.55,spread:1.3,height:0.015,depth:0.36,linked:true,...extra});
const brows=(style,extra={})=>({style,color:'#2b1d18',scale:1.25,spread:0.115,height:0.44,depth:0.24,linked:true,...extra});
rig.features={snap:true,mouth:mouth('line',{scale:1.7,height:0.01,depth:0.38}),brows:brows('straight',{scale:1.3,height:0.43})};
rig.featureExpressions=[
 {name:'notice',mouth:mouth('smile',{scale:1.55,height:0.035,depth:0.37}),brows:brows('raised',{height:0.5})},
 {name:'hesitate',mouth:mouth('frown',{scale:1.5,height:0.02,depth:0.36}),brows:brows('angled',{scale:1.3,spread:0.125,height:0.37})},
 {name:'reach',mouth:mouth('line',{scale:1.45,height:0.005,depth:0.35}),brows:brows('angled',{height:0.35,scale:1.28})},
 {name:'contact',mouth:mouth('open',{scale:1.7,height:-0.005,depth:0.4}),brows:brows('raised',{height:0.5,scale:1.28})},
 {name:'react',mouth:mouth('open',{scale:1.85,height:-0.015,depth:0.42,spread:1.35}),brows:brows('thick',{style:'thick',height:0.52,scale:1.35})},
];
const byName=Object.fromEntries(rig.featureExpressions.map(e=>[e.name,e]));
rig.featureKeys=[
 {frame:20,mouth:structuredClone(byName.notice.mouth),brows:structuredClone(byName.notice.brows)},
 {frame:52,mouth:structuredClone(byName.hesitate.mouth),brows:structuredClone(byName.hesitate.brows)},
 {frame:72,mouth:structuredClone(byName.reach.mouth),brows:structuredClone(byName.reach.brows)},
 {frame:96,mouth:structuredClone(byName.contact.mouth),brows:structuredClone(byName.contact.brows)},
 {frame:104,mouth:mouth('open',{scale:1.65,height:0,depth:0.39}),brows:brows('raised',{height:0.48})},
 {frame:132,mouth:structuredClone(byName.react.mouth),brows:structuredClone(byName.react.brows)},
];

validateFeatures(rig);validateRig3D(rig);

const prop=rig.props.find(p=>p.id===propId);
const gripSamples={};
for(const f of [96,104]){
 applyRigFrame(root,bones,rest,baseRoot,morphs,rig,f);
 const hand=bones[5].getWorldPosition(new THREE.Vector3());
 let object;root.traverse(o=>{if(o.userData.studioProp===prop.id)object=o;});
 gripSamples[f]=object.worldToLocal(hand.clone()).toArray().map(v=>+v.toFixed(4));
}
const motion=await reviewRigMotion({root,bones,rest,baseRoot,morphs,rig,joint:5,start:0,end:191});
if(motion.issueFrames!==0)throw Error('Contact issues');
if(motion.maxContactError>0.01)throw Error('Contact error exceeds tolerance');

shot.rig3d=rig;
shot.production={Animation:'Needs changes'};
shot.action='Frames 0–38 notice; 52 anticipation; 64–90 uneven eyelid squint during hesitant reach; 96 contact/pickup and eyes reopen; 104 pause and three-frame prop glint; 132 reaction; 154–191 settle. Weight/grip/face keys re-authored for blocking review; visual scrub still required. Animation is still Needs changes.';
const rev=shot.animationRevisions?.find(r=>r.pass==='Blocking');
if(rev){
 rev.status='Needs changes';
 rev.rig3d=structuredClone(rig);
 const note=rev.notes?.find(n=>n.frame===72);
 if(note){
  note.resolved=true;
  note.text='Weight roots/hips/spine + light right-arm counter strengthened; grip retargeted deeper on handle via keyPropGrip; mouth/brow featureKeys at 20/52/72/96/104/132 (frown on hesitate; larger overlays — baked head line may still show). Arm breakdowns rebaked with solveRigIK after root push. Offline reviewRigMotion contact ok; visual approval still required in-app.';
 }
}
validateProject(project);

const json=JSON.stringify(project,null,2);
await fs.writeFile(LIVE,json);
await fs.writeFile(FIXTURE,json);
const sha=crypto.createHash('sha256').update(json).digest('hex');
console.log(JSON.stringify({
 sha256:sha,
 production:shot.production,
 roots:Object.fromEntries([52,72,84,96,104,132].map(f=>[f,sampleChannel(rig,f,'root',[0,0,0])])),
 gripSamples,
 featureKeyFrames:rig.featureKeys.map(k=>k.frame+':'+k.mouth.style+'/'+k.brows.style),
 motion:{issueFrames:motion.issueFrames,maxContactError:+motion.maxContactError.toFixed(4),maxStep:+motion.maxStep.toFixed(4),maxStepFrame:motion.maxStepFrame},
 keyFrames:rig.keys.map(k=>k.frame+':'+k.kind),
},null,2));
