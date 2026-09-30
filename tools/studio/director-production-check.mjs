import assert from 'node:assert/strict';
import {newProject,validateProject,shotBrief} from '../../simple-editor/director-project.js';
import {saveVersion,productionSummary,animationPassStatus,animationPassGateMessages,animationPassLabel,animationPassCompact,shotMatchesAnimationPassFilter,ANIMATION_PASS_FILTERS,PRODUCTION_STATUS_FILTERS,shotMatchesProductionStatusFilter,productionOverviewSceneFilters,shotMatchesProductionSceneFilter,shotHasMedia,shotHasOpenNotes,shotHasNeedsChanges,shotHasReadyForReview,productionOverviewAttention,compareProductionOverviewAttention} from '../../simple-editor/director-production.js';
import {saveAnimationRevision,approveRevision,flipAnimationPass} from '../../simple-editor/director-revisions.js';
const p=newProject(),scene=p.scenes[0],shot={id:crypto.randomUUID(),seconds:5};scene.shots.push(shot);
p.assets=[{id:'hero',kind:'character',name:'Hero'},{id:'villain',kind:'character',name:'Villain'}];
assert.match(shotBrief(p,scene,shot),/Villain/);
shot.assetIds=['hero'];assert.doesNotMatch(shotBrief(p,scene,shot),/Villain/);
shot.assetIds=[];assert.doesNotMatch(shotBrief(p,scene,shot),/Hero/);
shot.assetIds=['missing'];assert.throws(()=>validateProject(p),/asset links/);shot.assetIds=['hero'];
assert.throws(()=>saveVersion(shot),/Attach/);
shot.media={name:'synthetic.png',type:'input'};shot.audio={name:'synthetic.wav',type:'input'};
saveVersion(shot);shot.media.name='replacement.png';assert.equal(shot.versions[0].media.name,'synthetic.png');
shot.production={Animation:'Needs changes',Sound:'Not needed'};
shot.versions[0].notes.push({text:'Adjust pose',frame:23,resolved:false});
assert.equal(productionSummary(p).notes,1);assert.equal(productionSummary(p).changes,1);
validateProject(JSON.parse(JSON.stringify(p)));
shot.versions[0].notes[0].resolved=true;assert.equal(productionSummary(p).notes,0);
shot.production.Animation='invented';assert.throws(()=>validateProject(p),/status/);shot.production.Animation='Approved';
shot.versions[0].notes[0].frame=-1;assert.throws(()=>validateProject(p),/Review notes/);shot.versions[0].notes[0].frame=0;

// Animation-pass gates (Blocking → Breakdowns → Polish)
shot.drawing={version:1,width:960,height:540,background:'#ffffff',onion:false,layers:[{id:'L',name:'Ink',visible:true,opacity:1,blend:'source-over',locked:false,strokes:[]}],keys:[]};
saveAnimationRevision(shot,'Block v1','Blocking');
assert.equal(animationPassStatus(shot).Blocking.status,'Work in progress');
assert.equal(animationPassStatus(shot).Breakdowns.status,'Missing');
assert.match(animationPassLabel(shot),/Blocking: Work in progress/);
assert.ok(animationPassGateMessages(shot).some(m=>/Blocking animation pass is not Approved/.test(m)));
assert.equal(productionSummary(p).passes.gated,1);
approveRevision(shot,shot.animationRevisions[0].id);
assert.equal(animationPassStatus(shot).Blocking.status,'Approved');
assert.equal(productionSummary(p).passes.blocking,1);
saveAnimationRevision(shot,'Break v1','Breakdowns');
assert.ok(animationPassGateMessages(shot).some(m=>/Breakdowns started before Blocking is Approved/.test(m))===false);
// Polish before Breakdowns approved
saveAnimationRevision(shot,'Polish early','Polish');
assert.ok(animationPassGateMessages(shot).some(m=>/Polish started before Breakdowns/.test(m)));
shot.production.Animation='Ready for review';
assert.ok(animationPassGateMessages(shot).some(m=>/Breakdowns pass is not Approved/.test(m)));
shot.production.Animation='Approved';

// Gate polish: always-visible labels, false-complete blocker, filter, trusted flips
assert.match(animationPassLabel(shot),/Breakdowns: /);
assert.match(animationPassLabel(shot),/Polish: /);
assert.match(animationPassCompact(shot),/^B /);
assert.ok(ANIMATION_PASS_FILTERS.some(f=>f.id==='gated'));
assert.equal(shotMatchesAnimationPassFilter(shot,'polish'),true);
assert.equal(shotMatchesAnimationPassFilter(shot,'complete'),false);
const bare={id:'bare',seconds:2,production:{Animation:'Approved'}};
assert.ok(animationPassGateMessages(bare).some(m=>/without saved Blocking/.test(m)));
assert.ok(shotMatchesAnimationPassFilter(bare,'gated'));
assert.throws(()=>flipAnimationPass(bare,'Blocking','Approved'),/Save a Blocking revision/);
flipAnimationPass(shot,'Breakdowns','Needs changes');
assert.equal(animationPassStatus(shot).Breakdowns.status,'Needs changes');
approveRevision(shot,shot.animationRevisions.find(r=>r.pass==='Breakdowns').id);
assert.equal(animationPassStatus(shot).Breakdowns.status,'Approved');
flipAnimationPass(shot,'Polish','Work in progress');
assert.equal(animationPassStatus(shot).Polish.status,'Work in progress');
assert.ok(productionSummary(p).passes.gated>=1);
assert.equal(typeof productionSummary(p).passes.complete,'number');


// Production overview status filters beyond animation-pass gates
assert.ok(PRODUCTION_STATUS_FILTERS.some(f=>f.id==='missing-media'));
assert.ok(PRODUCTION_STATUS_FILTERS.some(f=>f.id==='open-notes'));
assert.equal(shotHasMedia(shot),true);
assert.equal(shotMatchesProductionStatusFilter(shot,'missing-media'),false);
const noMedia={id:'nm',seconds:2};assert.equal(shotHasMedia(noMedia),false);assert.ok(shotMatchesProductionStatusFilter(noMedia,'missing-media'));
assert.equal(shotHasMedia({id:'plan',seconds:2,layout:{drawing:{name:'layout.png'}}}),true);
shot.versions[0].notes[0].resolved=false;
assert.ok(shotHasOpenNotes(shot));
assert.ok(shotMatchesProductionStatusFilter(shot,'open-notes'));
shot.production.Animation='Needs changes';
assert.ok(shotHasNeedsChanges(shot));
assert.ok(shotMatchesProductionStatusFilter(shot,'needs-changes'));
shot.production.Animation='Ready for review';
assert.ok(shotHasReadyForReview(shot));
assert.ok(shotMatchesProductionStatusFilter(shot,'ready-for-review'));
assert.equal(shotMatchesProductionStatusFilter(shot,'all'),true);
const attn=productionOverviewAttention(shot);
assert.equal(attn.review,1);
assert.ok(compareProductionOverviewAttention(productionOverviewAttention(noMedia),attn)<0||compareProductionOverviewAttention(productionOverviewAttention({...noMedia,production:{Animation:'Needs changes'},versions:[{notes:[{resolved:false}]}]}),{gated:0,missing:0,notes:0,changes:0,review:0})<0);
// gated still sorts ahead of missing-only
const gatedAttn={gated:1,missing:0,notes:0,changes:0,review:0},missAttn={gated:0,missing:1,notes:0,changes:0,review:0};
assert.ok(compareProductionOverviewAttention(gatedAttn,missAttn)<0);


// Production overview scene filter (AND with status/gate; session UI only)
const sceneFilters=productionOverviewSceneFilters(p);
assert.ok(sceneFilters.some(f=>f.id==='all'));
assert.ok(sceneFilters.some(f=>f.id===scene.id));
assert.equal(shotMatchesProductionSceneFilter(scene,'all'),true);
assert.equal(shotMatchesProductionSceneFilter(scene,scene.id),true);
assert.equal(shotMatchesProductionSceneFilter(scene,'other-scene'),false);
const scene2={id:crypto.randomUUID(),title:'Scene 2',shots:[{id:crypto.randomUUID(),seconds:3}]};
p.scenes.push(scene2);
const two=productionOverviewSceneFilters(p);
assert.equal(two.filter(f=>f.id!=='all').length,2);
assert.ok(two.some(f=>f.id===scene2.id&&f.label==='Scene 2'));
assert.equal(shotMatchesProductionSceneFilter(scene2,scene.id),false);
assert.equal(shotMatchesProductionSceneFilter(scene2,scene2.id),true);
// Combined AND: scene match alone is not enough when status also narrows
assert.equal(shotMatchesProductionSceneFilter(scene,scene.id)&&shotMatchesProductionStatusFilter(shot,'all')&&shotMatchesAnimationPassFilter(shot,'all'),true);
assert.equal(shotMatchesProductionSceneFilter(scene,scene.id)&&shotMatchesProductionStatusFilter(shot,'missing-media'),false);
p.scenes.pop();

console.log('Production checks passed: legacy briefs, selected/empty/missing assets, immutable media snapshot, backup roundtrip, counts, animation-pass gates, label/filter/flip polish, overview status/scene filters/sort, and invalid status/frame.');
