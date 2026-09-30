// Author one Blank Slate creation-gun beat on the existing persistence shot.
// Uses Character continuity tools: firstFrame appearance, attachment events, body keys + IK.
// Does not touch the trailer, continuous-performance review, or Animation approval.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {starterCharacter,jointsOf,faceControls,applyPose,applyChannels,applyRigFrame} from '../../simple-editor/director-3d-engine.js';
import {attachmentEvent,syncProps} from '../../simple-editor/director-performance-engine.js';
import {solveRigIK} from '../../simple-editor/director-ik3d.js';
import {validateRig3D,hasRigAnimation} from '../../simple-editor/director-3d-state.js';
import {createHash,randomUUID} from 'node:crypto';

const PROJECT_DIR='studio-data/director-projects/a9407dddd356503d6c601377a33846388d5f6dfb74ebbfe068d0c8b4bcb3a1e4';
const latestPath=path.join(PROJECT_DIR,'latest.json');
const project=JSON.parse(await fs.readFile(latestPath,'utf8'));
assert.equal(project.title,'Blank Slate · story production test');
const shot=project.scenes[0].shots.find(s=>s.title==='Two creations · persistence check');
assert.ok(shot,'persistence shot');
const ball=shot.rig3d.props.find(p=>p.name==='First creation — ball');
const block=shot.rig3d.props.find(p=>p.name==='Second creation — block');
assert.equal(ball?.firstFrame,24);
assert.equal(block?.firstFrame,48);

const HAND=5; // Left hand
const root=starterCharacter();
const bones=jointsOf(root);
const rest=bones.map(b=>b.quaternion.clone());
const base=bones[0].position.clone();
const faces=faceControls(root);
const neutral=bones.map(()=>[0,0,0]);

const GUN_ID='bs-prop-gun-held-0001';
const gun={
  id:GUN_ID,
  name:'Creation gun — held stub',
  shape:'box',
  color:'#6b7c8a',
  joint:null,
  position:[0.42,1.05,0.22],
  rotation:[0,-20,0],
  size:[0.45,0.12,0.18],
};

// Replace floor-stub gun on this shot with held gun (same Continuity prop tools).
shot.rig3d.props=shot.rig3d.props.filter(p=>p.id!==GUN_ID&&p.id!=='bs-prop-gun-stub-0001'&&!String(p.name).includes('Creation gun'));
assert.ok(shot.rig3d.props.length<24,'prop budget');
shot.rig3d.props.push(gun);
shot.rig3d.keys=[];

function poseToward(frame,rootOffset,head,spine,target,kind='key'){
  let pose=structuredClone(neutral);
  pose[2]=head;
  pose[1]=spine;
  applyPose(bones,rest,pose);
  applyChannels(bones,base,faces,{...shot.rig3d,pose,root:rootOffset});
  root.updateMatrixWorld(true);
  if(target){
    const solved=solveRigIK(root,bones,rest,{...shot.rig3d,pose,root:rootOffset},HAND,target);
    assert.ok(solved.distance<0.05,'reach at frame '+frame+' dist='+solved.distance);
    pose=solved.pose;
  }
  shot.rig3d.keys.push({frame,pose,root:rootOffset,face:faces.map(()=>0),easing:'smooth',kind});
}

const holdReady=[0.38,1.05,0.28];
const aimBall=[0.48,1.2,0.35];
const aimBlock=[0.22,1.18,0.42];

poseToward(0,[0.08,0,0.3],[6,12,-4],[2,0,4],holdReady);
poseToward(12,[0.02,0,0.28],[10,18,-6],[4,0,6],[0.45,1.12,0.32],'breakdown');
poseToward(20,[-0.12,0,0.22],[14,22,-4],[6,0,8],aimBall,'extreme');
poseToward(24,[-0.16,0,0.2],[16,20,-2],[5,0,6],aimBall);
poseToward(36,[-0.02,0,0.26],[10,6,4],[3,0,2],[0.35,1.12,0.38],'breakdown');
poseToward(44,[0.12,0,0.24],[12,-4,8],[4,0,-4],aimBlock,'extreme');
poseToward(48,[0.16,0,0.22],[14,-8,10],[5,0,-5],aimBlock);
poseToward(72,[0.04,0,0.28],[8,4,2],[2,0,2],[0.4,1.12,0.3],'breakdown');
poseToward(96,[0.06,0,0.3],[6,8,-2],[1,0,3],holdReady);
poseToward(119,[0.06,0,0.3],[5,6,0],[0,0,2],holdReady);

applyRigFrame(root,bones,rest,base,faces,shot.rig3d,0);
syncProps(root,bones,shot.rig3d,0);
gun.attachments=[attachmentEvent(root,bones,GUN_ID,HAND,0)];

for(const f of [0,23,24,47,48,119]){
  const state=applyRigFrame(root,bones,rest,base,faces,shot.rig3d,f);
  assert.deepEqual(state.warnings,[],'warnings @'+f);
  let gunMesh,ballMesh,blockMesh;
  root.traverse(o=>{
    if(o.userData.studioProp===GUN_ID)gunMesh=o;
    if(o.userData.studioProp===ball.id)ballMesh=o;
    if(o.userData.studioProp===block.id)blockMesh=o;
  });
  assert.equal(ballMesh.visible,f>=24,'ball @'+f);
  assert.equal(blockMesh.visible,f>=48,'block @'+f);
  assert.equal(gunMesh.visible,true,'gun @'+f);
  assert.equal(gunMesh.parent,bones[HAND],'gun parent @'+f);
}
assert.ok(hasRigAnimation(shot.rig3d));
validateRig3D(shot.rig3d);
assert.ok(shot.rig3d.props.length<=24);

shot.action='Creation-gun acted beat (First joyful creations): adult holds Creation gun — held stub (Left hand attachment from frame 0). Raise/aim → ball firstFrame 24 and remains; re-aim → block firstFrame 48 while ball stays. One object per use; appearance via Continuity firstFrame — no spawn FX replacing acting. Cream arrival room + furniture blockout unchanged. Synthetic starter; grip/weight/face not finished. Animation Needs changes — not acceptance.';
shot.camera='Three-quarter from +Z into cream room; hold both creation spawn zones and doorway −Z; gun in left hand readable.';
shot.production={...(shot.production||{}),Animation:'Needs changes'};
if(!Array.isArray(shot.assetIds))shot.assetIds=[];
if(!shot.assetIds.includes('bs-asset-gun-0004'))shot.assetIds.push('bs-asset-gun-0004');

const plan=project.scenes[0].plan;
if(plan){
  plan.obstacle='Synthetic starter and furniture blockout are not approved production art; discovery/favorites/child acting keys remain stubs; creation-gun use on persistence shot is authored but not continuous-performance quality.';
  plan.script='Beat map: (1) Discovery — empty room + gun stub (find stubs only). (2) Technical — CREATION-GUN ACTED: gun held, ball f24 stays, block f48 with ball remaining. (3) Favorites — ball+block always present + clutter. (4) Child — prior creations remain; child footing at arrival mark. No dialogue. Not finished acceptance.';
  plan.outcome='Scene carries discovery stubs, first-joy creation-gun acted persistence, favorites, and child shots with shared cream room + furniture blockout. Creation-gun acting authored on technical shot only. Animation Needs changes. Not Blank Slate acceptance.';
}

const data=JSON.stringify(project,null,2);
const versionName=String(process.hrtime.bigint())+'-creation-gun-'+randomUUID().replace(/-/g,'').slice(0,16)+'.json';
await fs.writeFile(path.join(PROJECT_DIR,versionName),data,'utf8');
const tmp=path.join(PROJECT_DIR,randomUUID().replace(/-/g,'')+'.tmp');
await fs.writeFile(tmp,data,'utf8');
await fs.rename(tmp,latestPath);

const key=createHash('sha256').update(project.id).digest('hex');
assert.equal(key,'a9407dddd356503d6c601377a33846388d5f6dfb74ebbfe068d0c8b4bcb3a1e4');
console.log(JSON.stringify({
  ok:true,
  shot:shot.title,
  animation:shot.production.Animation,
  propCount:shot.rig3d.props.length,
  gunAttachments:gun.attachments.map(a=>({frame:a.frame,joint:a.joint})),
  ballFirstFrame:ball.firstFrame,
  blockFirstFrame:block.firstFrame,
  keys:shot.rig3d.keys.map(k=>k.frame),
  snapshot:versionName,
},null,2));
