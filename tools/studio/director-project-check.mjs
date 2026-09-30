import assert from 'node:assert/strict';
import {newProject,validateProject,duration} from '../../simple-editor/director-project.js';
const p=newProject();p.scenes[0].shots=Array.from({length:24},()=>({id:crypto.randomUUID(),seconds:600}));
assert.equal(duration(validateProject(p)),14400);
p.scenes[0].shots.push({id:crypto.randomUUID(),seconds:1});assert.throws(()=>validateProject(p),/4 hours/);
p.scenes[0].shots.pop();p.scenes[0].shots[0].seconds=NaN;assert.throws(()=>validateProject(p));
p.scenes[0].shots[0].seconds=600;p.scenes[0].shots[1].id=p.scenes[0].shots[0].id;assert.throws(()=>validateProject(p));
console.log('Project checks passed: exact four hours, overflow, invalid duration, duplicate shot IDs.');
const malformed=newProject();delete malformed.scenes[0].id;assert.throws(()=>validateProject(malformed),/IDs/);
const badAsset=newProject();badAsset.assets=[null];assert.throws(()=>validateProject(badAsset),/IDs/);
console.log('Malformed scene and asset records rejected.');

import {validateShotReferenceVideo,validateShotSilhouette,shotWantsSilhouette,referenceVideoTimeAtFrame,REFERENCE_VIDEO_FPS,REFERENCE_VIDEO_SYNC_EPS,referenceVideoCompareMode,shotWantsReferenceSideBySide,shotWantsReferenceStacked,applyReferenceVideoCompare,applyReferenceVideoHidden,referenceVideoIsHidden,shotWantsReferenceHidden,referenceVideoStackOrder,shotWantsReferenceStackRefFirst,applyReferenceVideoStackOrder,shotHasReferenceVideo,listReferenceVideoSources,copyReferenceVideoFromShot,REFERENCE_VIDEO_COMPARE_SIDE,REFERENCE_VIDEO_COMPARE_STACK,REFERENCE_VIDEO_COMPARE_OVERLAY,REFERENCE_VIDEO_STACK_STAGE_FIRST,REFERENCE_VIDEO_STACK_REF_FIRST} from '../../simple-editor/director-3d-state.js';
const withRef=newProject();withRef.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,referenceVideo:{name:'acting-ref.mp4',subfolder:'studio-director',type:'input',opacity:.55}}];
validateProject(JSON.parse(JSON.stringify(withRef)));
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'../secret.mp4',type:'input',subfolder:''}}),/Reference video/);
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'notes.txt',type:'input',subfolder:'studio-director'}}),/Reference video/);
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'acting-ref.mp4',type:'input',subfolder:'studio-director',opacity:2}}),/opacity/);
console.log('Durable reference video accepted; path traversal, non-video and bad opacity rejected.');
assert.equal(referenceVideoCompareMode(undefined), REFERENCE_VIDEO_COMPARE_OVERLAY);
assert.equal(referenceVideoCompareMode({}), REFERENCE_VIDEO_COMPARE_OVERLAY);
assert.equal(referenceVideoCompareMode({compare:'overlay'}), REFERENCE_VIDEO_COMPARE_OVERLAY);
assert.equal(referenceVideoCompareMode({compare:'sideBySide'}), REFERENCE_VIDEO_COMPARE_SIDE);
assert.equal(referenceVideoCompareMode({compare:'stacked'}), REFERENCE_VIDEO_COMPARE_STACK);
assert.equal(shotWantsReferenceSideBySide({}), false);
assert.equal(shotWantsReferenceSideBySide({referenceVideo:{name:'a.mp4',type:'input'}}), false);
assert.equal(shotWantsReferenceSideBySide({referenceVideo:{name:'a.mp4',type:'input',compare:'sideBySide'}}), true);
assert.equal(shotWantsReferenceStacked({}), false);
assert.equal(shotWantsReferenceStacked({referenceVideo:{name:'a.mp4',type:'input',compare:'sideBySide'}}), false);
assert.equal(shotWantsReferenceStacked({referenceVideo:{name:'a.mp4',type:'input',compare:'stacked'}}), true);
const sideRef={name:'acting-ref.mp4',subfolder:'studio-director',type:'input'};
applyReferenceVideoCompare(sideRef,{compare:'sideBySide'});
assert.equal(sideRef.compare, REFERENCE_VIDEO_COMPARE_SIDE);
applyReferenceVideoCompare(sideRef,{compare:'stacked'});
assert.equal(sideRef.compare, REFERENCE_VIDEO_COMPARE_STACK);
assert.equal(shotWantsReferenceSideBySide({referenceVideo:sideRef}), false);
assert.equal(shotWantsReferenceStacked({referenceVideo:sideRef}), true);
applyReferenceVideoCompare(sideRef,{compare:'overlay'});
assert.equal(sideRef.compare, undefined);
const withSide=newProject();withSide.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,referenceVideo:{name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'sideBySide',opacity:.7}}];
validateProject(JSON.parse(JSON.stringify(withSide)));
const withStack=newProject();withStack.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,referenceVideo:{name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'stacked',opacity:.7}}];
validateProject(JSON.parse(JSON.stringify(withStack)));
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'acting-ref.mp4',type:'input',subfolder:'studio-director',compare:'split'}}),/compare/);
console.log('Durable referenceVideo.compare sideBySide/stacked/overlay accepted; invalid compare rejected.');
assert.equal(referenceVideoIsHidden(undefined), false);
assert.equal(referenceVideoIsHidden({}), false);
assert.equal(referenceVideoIsHidden({hidden:true}), true);
assert.equal(shotWantsReferenceHidden({}), false);
assert.equal(shotWantsReferenceHidden({referenceVideo:{name:'a.mp4',type:'input'}}), false);
assert.equal(shotWantsReferenceHidden({referenceVideo:{name:'a.mp4',type:'input',hidden:true}}), true);
const hideRef={name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'stacked',opacity:.7};
applyReferenceVideoHidden(hideRef,{hidden:true});
assert.equal(hideRef.hidden, true);
assert.equal(hideRef.compare, 'stacked');
assert.equal(hideRef.opacity, .7);
assert.equal(hideRef.name, 'acting-ref.mp4');
applyReferenceVideoHidden(hideRef,{hidden:false});
assert.equal(hideRef.hidden, undefined);
assert.equal(hideRef.compare, 'stacked');
const withHidden=newProject();withHidden.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,referenceVideo:{name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'sideBySide',hidden:true,opacity:.5}}];
validateProject(JSON.parse(JSON.stringify(withHidden)));
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'acting-ref.mp4',type:'input',subfolder:'studio-director',hidden:'yes'}}),/hidden/);
console.log('Durable referenceVideo.hidden hide-without-clear accepted; invalid hidden rejected; compare/opacity/name kept.');
assert.equal(referenceVideoStackOrder(undefined), REFERENCE_VIDEO_STACK_STAGE_FIRST);
assert.equal(referenceVideoStackOrder({}), REFERENCE_VIDEO_STACK_STAGE_FIRST);
assert.equal(referenceVideoStackOrder({stackOrder:'stageFirst'}), REFERENCE_VIDEO_STACK_STAGE_FIRST);
assert.equal(referenceVideoStackOrder({stackOrder:'referenceFirst'}), REFERENCE_VIDEO_STACK_REF_FIRST);
assert.equal(shotWantsReferenceStackRefFirst({}), false);
assert.equal(shotWantsReferenceStackRefFirst({referenceVideo:{name:'a.mp4',type:'input',compare:'stacked'}}), false);
assert.equal(shotWantsReferenceStackRefFirst({referenceVideo:{name:'a.mp4',type:'input',compare:'stacked',stackOrder:'referenceFirst'}}), true);
assert.equal(shotWantsReferenceStackRefFirst({referenceVideo:{name:'a.mp4',type:'input',compare:'sideBySide',stackOrder:'referenceFirst'}}), false);
const stackOrdRef={name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'stacked',opacity:.7};
applyReferenceVideoStackOrder(stackOrdRef,{stackOrder:'referenceFirst'});
assert.equal(stackOrdRef.stackOrder, REFERENCE_VIDEO_STACK_REF_FIRST);
assert.equal(stackOrdRef.compare, 'stacked');
assert.equal(stackOrdRef.opacity, .7);
applyReferenceVideoStackOrder(stackOrdRef,{stackOrder:'stageFirst'});
assert.equal(stackOrdRef.stackOrder, undefined);
assert.equal(stackOrdRef.compare, 'stacked');
const withStackRefFirst=newProject();withStackRefFirst.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,referenceVideo:{name:'acting-ref.mp4',subfolder:'studio-director',type:'input',compare:'stacked',stackOrder:'referenceFirst',opacity:.6}}];
validateProject(JSON.parse(JSON.stringify(withStackRefFirst)));
assert.throws(()=>validateShotReferenceVideo({referenceVideo:{name:'acting-ref.mp4',type:'input',subfolder:'studio-director',stackOrder:'top'}}),/stackOrder/);
console.log('Durable referenceVideo.stackOrder stageFirst/referenceFirst accepted; invalid rejected; compare/opacity kept.');
import fs from 'node:fs';
const director3d=fs.readFileSync(new URL('../../simple-editor/director-3d.js', import.meta.url), 'utf8');
assert.ok(director3d.includes('Stacked pane order'));
assert.ok(director3d.includes('referenceStackOrder'));
assert.ok(director3d.includes('rig3d-viewport--stack-ref-first'));
assert.ok(director3d.includes("el('label','Show reference video')"));
assert.ok(director3d.includes('applyReferenceVideoStackOrder'));
const directorCss=fs.readFileSync(new URL('../../simple-editor/director.css', import.meta.url), 'utf8');
assert.ok(directorCss.includes('rig3d-viewport--stack-ref-first'));
console.log('Stacked pane-order UI + Show reference video checkbox wired; CSS stack-ref-first present.');

assert.equal(shotHasReferenceVideo(undefined), false);
assert.equal(shotHasReferenceVideo({}), false);
assert.equal(shotHasReferenceVideo({referenceVideo:{}}), false);
assert.equal(shotHasReferenceVideo({referenceVideo:{name:'acting-ref.mp4',type:'input'}}), true);
const copyProject=newProject();
const srcId=crypto.randomUUID(), dstId=crypto.randomUUID(), otherId=crypto.randomUUID();
copyProject.scenes[0].title='Act 1';
copyProject.scenes[0].shots=[
 {id:srcId,title:'Hero',seconds:2,referenceVideo:{name:'hero-ref.mp4',subfolder:'studio-director',type:'input',compare:'stacked',stackOrder:'referenceFirst',opacity:.7,hidden:true}},
 {id:dstId,title:'Follow',seconds:3,referenceVideo:{name:'local-ref.webm',subfolder:'studio-director',type:'input',opacity:.3}},
 {id:otherId,title:'Bare',seconds:2},
];
const sources=listReferenceVideoSources(copyProject, dstId);
assert.deepEqual(sources.map(s=>s.id),[srcId]);
assert.match(sources[0].label,/Hero/);
assert.match(sources[0].label,/hero-ref\.mp4/);
assert.match(sources[0].label,/stacked/);
assert.match(sources[0].label,/hidden/);
assert.deepEqual(listReferenceVideoSources(copyProject, srcId).map(s=>s.id),[dstId]);
assert.deepEqual(listReferenceVideoSources(copyProject, 'missing').map(s=>s.id).sort(),[srcId,dstId].sort());

const allDst={id:dstId,title:'Follow',seconds:3,referenceVideo:{name:'local-ref.webm',subfolder:'studio-director',type:'input',opacity:.3}};
const allSrc=copyProject.scenes[0].shots[0];
const allSummary=copyReferenceVideoFromShot(allDst, allSrc, 'all');
assert.equal(allSummary.mode,'all');
assert.equal(allDst.referenceVideo.name,'hero-ref.mp4');
assert.equal(allDst.referenceVideo.compare,'stacked');
assert.equal(allDst.referenceVideo.stackOrder,'referenceFirst');
assert.equal(allDst.referenceVideo.hidden,true);
assert.equal(allDst.referenceVideo.opacity,.7);
assert.equal(allSummary.fileName,'hero-ref.mp4');
validateShotReferenceVideo(allDst);

const layoutDst={id:dstId,title:'Follow',seconds:3,referenceVideo:{name:'local-ref.webm',subfolder:'studio-director',type:'input',opacity:.3}};
const layoutSummary=copyReferenceVideoFromShot(layoutDst, allSrc, 'layout');
assert.equal(layoutSummary.mode,'layout');
assert.equal(layoutDst.referenceVideo.name,'local-ref.webm');
assert.equal(layoutDst.referenceVideo.compare,'stacked');
assert.equal(layoutDst.referenceVideo.stackOrder,'referenceFirst');
assert.equal(layoutDst.referenceVideo.hidden,true);
assert.equal(layoutDst.referenceVideo.opacity,.7);
validateShotReferenceVideo(layoutDst);

const fileDst={id:dstId,title:'Follow',seconds:3,referenceVideo:{name:'local-ref.webm',subfolder:'studio-director',type:'input',opacity:.3,compare:'sideBySide'}};
const fileSummary=copyReferenceVideoFromShot(fileDst, allSrc, 'file');
assert.equal(fileSummary.mode,'file');
assert.equal(fileDst.referenceVideo.name,'hero-ref.mp4');
assert.equal(fileDst.referenceVideo.compare,'sideBySide');
assert.equal(fileDst.referenceVideo.opacity,.3);
assert.equal(fileDst.referenceVideo.hidden,undefined);
assert.equal(fileDst.referenceVideo.stackOrder,undefined);
validateShotReferenceVideo(fileDst);

const bareDst={id:otherId,title:'Bare',seconds:2};
const bareSummary=copyReferenceVideoFromShot(bareDst, allSrc, 'file');
assert.equal(bareSummary.mode,'file');
assert.equal(bareDst.referenceVideo.name,'hero-ref.mp4');
assert.equal(bareDst.referenceVideo.compare,undefined);
assert.equal(bareDst.referenceVideo.opacity,undefined);
validateShotReferenceVideo(bareDst);

assert.throws(()=>copyReferenceVideoFromShot(bareDst, {id:'x',seconds:1}, 'all'), /no reference video/i);
assert.throws(()=>copyReferenceVideoFromShot({id:'y',seconds:1}, allSrc, 'layout'), /needs a reference video/i);
assert.throws(()=>copyReferenceVideoFromShot(allDst, allSrc, 'nope'), /all, layout, or file/i);
assert.throws(()=>copyReferenceVideoFromShot(null, allSrc), /Target shot/i);
validateProject(JSON.parse(JSON.stringify(copyProject)));
console.log('Reference video copy helpers: list/filter, all/layout/file modes, empty-source rejects.');

assert.ok(director3d.includes('copyReferenceVideoFromShot'));
assert.ok(director3d.includes('listReferenceVideoSources'));
assert.ok(director3d.includes('Copy reference from shot'));
assert.ok(director3d.includes('reference-video-copy'));
assert.ok(director3d.includes('refreshReferenceSources'));
assert.ok(director3d.includes("Copy all (file & layout)"));
assert.ok(director3d.includes("Layout only (keep local file)"));
assert.ok(director3d.includes("File only (keep local layout)"));
console.log('Reference video copy UI wired in Silhouette & reference review.');





assert.equal(REFERENCE_VIDEO_FPS,24);
assert.equal(REFERENCE_VIDEO_SYNC_EPS,.04);
assert.equal(referenceVideoTimeAtFrame(0,10),0);
assert.equal(referenceVideoTimeAtFrame(24,10),1);
assert.equal(referenceVideoTimeAtFrame(48,1.5),1.5);
assert.equal(referenceVideoTimeAtFrame(-3,undefined),0);
assert.equal(referenceVideoTimeAtFrame(12,NaN),0.5);
console.log('Reference video playhead time maps frame/24 and clamps to duration.');

const withSil=newProject();withSil.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,silhouette:true}];
validateProject(JSON.parse(JSON.stringify(withSil)));
assert.equal(shotWantsSilhouette(withSil.scenes[0].shots[0]),true);
assert.equal(shotWantsSilhouette({}),false);
assert.equal(shotWantsSilhouette({silhouette:false}),false);
validateShotSilhouette({});
validateShotSilhouette({silhouette:false});
assert.throws(()=>validateShotSilhouette({silhouette:'yes'}),/silhouette/);
assert.throws(()=>validateShotSilhouette({silhouette:1}),/silhouette/);
const badSil=newProject();badSil.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,silhouette:'on'}];
assert.throws(()=>validateProject(JSON.parse(JSON.stringify(badSil))),/silhouette/);
console.log('Durable shot.silhouette accepted; non-boolean rejected.');

const withOnion=newProject();withOnion.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,drawing:{version:1,onion:true,onionDepth:3,layers:[{id:'L',name:'Ink',visible:true,locked:false,opacity:1,strokes:[]}]}}];
validateProject(JSON.parse(JSON.stringify(withOnion)));
const badOnion=newProject();badOnion.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,drawing:{version:1,onion:'on',layers:[{id:'L',name:'Ink',visible:true,locked:false,opacity:1,strokes:[]}]}}];
assert.throws(()=>validateProject(JSON.parse(JSON.stringify(badOnion))),/onion/);
console.log('Durable drawing.onion / onionDepth accepted on project validate; invalid rejected.');

const withCorr=newProject();withCorr.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,drawing:{version:1,correctionOverlay:true,layers:[{id:'L',name:'Ink',visible:true,locked:false,opacity:1,strokes:[]}]}}];
validateProject(JSON.parse(JSON.stringify(withCorr)));
const badCorr=newProject();badCorr.scenes[0].shots=[{id:crypto.randomUUID(),seconds:2,drawing:{version:1,correctionOverlay:'on',layers:[{id:'L',name:'Ink',visible:true,locked:false,opacity:1,strokes:[]}]}}];
assert.throws(()=>validateProject(JSON.parse(JSON.stringify(badCorr))),/correction overlay/);
console.log('Durable drawing.correctionOverlay accepted on project validate; invalid rejected.');



import {recordAssistantDraft} from '../../simple-editor/director-assistant-drafts.js';
const withDrafts=newProject();
recordAssistantDraft(withDrafts,{kind:'write',model:'bonsai',skill:'continuity',request:'Check names.',resultText:'Names match.',jobId:'proj-check-1'});
validateProject(JSON.parse(JSON.stringify(withDrafts)));
assert.equal(withDrafts.assistantDrafts[0].status,'pending');
console.log('Durable assistantDrafts accepted on project validate/reload.');

import {findShotLocation,otherScenesForShot,moveShotToScene,copyShotToScene,cloneShotRecord,destIndexFromPlace,placeAfterOptions,splitSceneAtShot,joinSceneWithNext,canSplitSceneAtShot,canJoinSceneWithNext,canRemoveScene,removeShotConfirmMessage,removeSceneConfirmMessage,joinSceneConfirmMessage,countAssetLinkedShots,removeAssetConfirmMessage,defaultSplitSceneTitle,moveShotInScene,reorderInSceneOptions,destIndexFromReorderPlace,findShotsByQuery,normalizeShotFindQuery,shotMatchesFindQuery,shotFindMatchFields,SHOT_FIND_TEXT_FIELDS} from '../../simple-editor/director-project.js';
import {followShots} from '../../simple-editor/director-links.js';

function shot(id, seconds, title){return {id, seconds, title};}
function scene(id, title, shots){return {id, title, shots};}
const moveP=newProject();
moveP.scenes=[
  scene('scA','Act 1',[shot('s1',5,'Open'),shot('s2',3,'Turn'),shot('s3',4,'Close')]),
  scene('scB','Act 2',[shot('s4',10,'Later')]),
  scene('scC','Empty',[]),
];
assert.equal(findShotLocation(moveP,'s2').scene.id,'scA');
assert.equal(findShotLocation(moveP,'s2').shotIndex,1);
assert.equal(findShotLocation(moveP,'missing'),null);
assert.deepEqual(otherScenesForShot(moveP,'s2').map(s=>s.id),['scB','scC']);
assert.equal(otherScenesForShot(moveP,'s2')[0].shotCount,1);
assert.equal(otherScenesForShot(moveP,'nope').length,0);

const moved=moveShotToScene(moveP,'s2','scB');
assert.equal(moved.toScene.id,'scB');
assert.equal(moved.index,1);
assert.deepEqual(moveP.scenes[0].shots.map(s=>s.id),['s1','s3']);
assert.deepEqual(moveP.scenes[1].shots.map(s=>s.id),['s4','s2']);
assert.equal(moveP.scenes[1].shots[1].title,'Turn');
assert.equal(findShotLocation(moveP,'s2').scene.id,'scB');
validateProject(JSON.parse(JSON.stringify(moveP)));

moveShotToScene(moveP,'s2','scC',0);
assert.deepEqual(moveP.scenes[1].shots.map(s=>s.id),['s4']);
assert.deepEqual(moveP.scenes[2].shots.map(s=>s.id),['s2']);
assert.equal(moveP.scenes[0].shots.length,2);

moveShotToScene(moveP,'s1','scB',99);
assert.deepEqual(moveP.scenes[1].shots.map(s=>s.id),['s4','s1']);
moveShotToScene(moveP,'s3','scB',-3);
assert.deepEqual(moveP.scenes[1].shots.map(s=>s.id),['s3','s4','s1']);
assert.throws(()=>moveShotToScene(moveP,'s3','scB'),/already in this scene/);
assert.throws(()=>moveShotToScene(moveP,'s3','missing'),/scene is no longer/);
assert.throws(()=>moveShotToScene(moveP,'gone','scC'),/shot is no longer/);
assert.throws(()=>moveShotToScene(moveP,'s3','scC',1.5),/whole number/);
assert.throws(()=>moveShotToScene(null,'s3','scC'),/project/);
console.log('Cross-scene shot move: append, start, clamp, same-scene reject, identity kept.');

const audioP=newProject();
audioP.scenes=[
  scene('scA','A',[shot('a',5,'A'),shot('b',3,'B')]),
  scene('scB','B',[shot('c',10,'C')]),
];
audioP.episodeAudio=[{id:'clip1',kind:'music',label:'bed',muted:false,start:5,sourceStart:0,duration:2,fadeIn:0,fadeOut:0,volume:1,anchorShot:'b'}];
validateProject(audioP);
const beforeAudio=structuredClone(audioP);
moveShotToScene(audioP,'b','scB');
followShots(beforeAudio,audioP);
assert.equal(audioP.episodeAudio[0].anchorShot,'b');
assert.equal(audioP.episodeAudio[0].start,15);
assert.deepEqual(audioP.scenes[0].shots.map(s=>s.id),['a']);
assert.deepEqual(audioP.scenes[1].shots.map(s=>s.id),['c','b']);
validateProject(JSON.parse(JSON.stringify(audioP)));

console.log('Follow-shot episode audio remaps start when the anchored shot changes scene.');

// Copy shot to another scene (new id; original stays)
const copyP=newProject();
copyP.scenes=[
  scene('scA','Act 1',[shot('c1',5,'Open'),shot('c2',3,'Turn')]),
  scene('scB','Act 2',[shot('c3',10,'Later')]),
  scene('scC','Empty',[]),
];
copyP.scenes[0].shots[1].action='Pivot';
copyP.scenes[0].shots[1].panels=[{id:'panel-keep',frames:72,action:'board'}];
const cloned=cloneShotRecord(copyP.scenes[0].shots[1]);
assert.notEqual(cloned.id,'c2');
assert.equal(cloned.title,'Turn');
assert.equal(cloned.panels[0].id,'panel-keep');
assert.throws(()=>cloneShotRecord(null),/Choose a shot/);

const copied=copyShotToScene(copyP,'c2','scB');
assert.equal(copied.toScene.id,'scB');
assert.equal(copied.index,1);
assert.equal(copied.source.id,'c2');
assert.notEqual(copied.shot.id,'c2');
assert.equal(copied.shot.title,'Turn');
assert.equal(copied.shot.action,'Pivot');
assert.deepEqual(copyP.scenes[0].shots.map(s=>s.id),['c1','c2']);
assert.equal(copyP.scenes[0].shots[1].action,'Pivot');
assert.deepEqual(copyP.scenes[1].shots.map(s=>s.id),['c3',copied.shot.id]);
assert.equal(copyP.scenes[1].shots[1].panels[0].action,'board');
copied.shot.action='Edited copy';
assert.equal(copyP.scenes[0].shots[1].action,'Pivot');
validateProject(JSON.parse(JSON.stringify(copyP)));

copyShotToScene(copyP,'c1','scC',0);
assert.equal(copyP.scenes[0].shots.map(s=>s.id).includes('c1'),true);
assert.equal(copyP.scenes[2].shots.length,1);
assert.notEqual(copyP.scenes[2].shots[0].id,'c1');
assert.equal(copyP.scenes[2].shots[0].title,'Open');

copyShotToScene(copyP,'c2','scB',99);
assert.equal(copyP.scenes[1].shots.at(-1).title,'Turn');
copyShotToScene(copyP,'c2','scB',-2);
assert.equal(copyP.scenes[1].shots[0].title,'Turn');

assert.throws(()=>copyShotToScene(copyP,'c2','scA'),/already in this scene/);
assert.throws(()=>copyShotToScene(copyP,'c2','missing'),/scene is no longer/);
assert.throws(()=>copyShotToScene(copyP,'gone','scC'),/shot is no longer/);
assert.throws(()=>copyShotToScene(copyP,'c2','scC',1.5),/whole number/);
assert.throws(()=>copyShotToScene(null,'c2','scC'),/project/);

// Follow-shot stays on original id; copy does not steal the anchor
const copyAudio=newProject();
copyAudio.scenes=[
  scene('scA','A',[shot('a',5,'A'),shot('b',3,'B')]),
  scene('scB','B',[shot('c',10,'C')]),
];
copyAudio.episodeAudio=[{id:'clip1',kind:'music',label:'bed',muted:false,start:5,sourceStart:0,duration:2,fadeIn:0,fadeOut:0,volume:1,anchorShot:'b'}];
validateProject(copyAudio);
const beforeCopyAudio=structuredClone(copyAudio);
const copyResult=copyShotToScene(copyAudio,'b','scB');
followShots(beforeCopyAudio,copyAudio);
assert.equal(copyAudio.episodeAudio[0].anchorShot,'b');
assert.equal(copyAudio.episodeAudio[0].start,5);
assert.deepEqual(copyAudio.scenes[0].shots.map(s=>s.id),['a','b']);
assert.equal(copyAudio.scenes[1].shots.length,2);
assert.equal(copyAudio.scenes[1].shots[1].id,copyResult.shot.id);
validateProject(JSON.parse(JSON.stringify(copyAudio)));
console.log('Copy shot to scene: append, start, clamp, isolation, same-scene reject, Follow-shot stays on original.');

// Place insert-at-index (Start / End / After shot N / index:N)
assert.equal(destIndexFromPlace('end'), undefined);
assert.equal(destIndexFromPlace(''), undefined);
assert.equal(destIndexFromPlace(null), undefined);
assert.equal(destIndexFromPlace(undefined), undefined);
assert.equal(destIndexFromPlace('start'), 0);
assert.equal(destIndexFromPlace('after:0'), 1);
assert.equal(destIndexFromPlace('after:2'), 3);
assert.equal(destIndexFromPlace('index:0'), 0);
assert.equal(destIndexFromPlace('index:5'), 5);
assert.throws(()=>destIndexFromPlace('after:-1'),/whole shot index/);
assert.throws(()=>destIndexFromPlace('after:1.5'),/whole shot index/);
assert.throws(()=>destIndexFromPlace('index:1.5'),/whole number/);
assert.throws(()=>destIndexFromPlace('middle'),/Unknown Place/);
assert.throws(()=>destIndexFromPlace(3),/Place must be text/);

const placeP=newProject();
placeP.scenes=[
  scene('scA','Act 1',[shot('p1',5,'Open'),shot('p2',3,'Turn'),shot('p3',4,'Close')]),
  scene('scB','Act 2',[shot('q1',10,'First'),shot('q2',8,'Second'),shot('q3',6,'Third')]),
  scene('scC','Empty',[]),
];
const afterOpts=placeAfterOptions(placeP,'scB');
assert.equal(afterOpts.length,3);
assert.deepEqual(afterOpts.map(o=>o.placeValue),['after:0','after:1','after:2']);
assert.deepEqual(afterOpts.map(o=>o.destIndex),[1,2,3]);
assert.equal(afterOpts[0].title,'First');
assert.equal(afterOpts[2].title,'Third');
assert.deepEqual(placeAfterOptions(placeP,'scC'),[]);
assert.deepEqual(placeAfterOptions(placeP,''),[]);
assert.deepEqual(placeAfterOptions(placeP,'missing'),[]);
assert.deepEqual(placeAfterOptions(null,'scB'),[]);

// Move: After shot 1 (First) → insert at index 1 between First and Second
const midMove=moveShotToScene(placeP,'p2','scB',destIndexFromPlace('after:0'));
assert.equal(midMove.index,1);
assert.deepEqual(placeP.scenes[1].shots.map(s=>s.id),['q1','p2','q2','q3']);
assert.deepEqual(placeP.scenes[0].shots.map(s=>s.id),['p1','p3']);

// Copy: After shot 2 (now p2) → insert at index 2
const midCopy=copyShotToScene(placeP,'p1','scB',destIndexFromPlace('after:1'));
assert.equal(midCopy.index,2);
assert.deepEqual(placeP.scenes[1].shots.map(s=>s.id),['q1','p2',midCopy.shot.id,'q2','q3']);
assert.equal(placeP.scenes[0].shots.map(s=>s.id).includes('p1'),true);

// index:N path + clamp still holds via move/copy
moveShotToScene(placeP,'p3','scC',destIndexFromPlace('index:99'));
assert.deepEqual(placeP.scenes[2].shots.map(s=>s.id),['p3']);
moveShotToScene(placeP,'p3','scB',destIndexFromPlace('index:-4'));
assert.equal(placeP.scenes[1].shots[0].id,'p3');
validateProject(JSON.parse(JSON.stringify(placeP)));
console.log('Place insert-at-index: Start/End/After/index resolve, mid insert move+copy, clamp kept.');

// Split scene at shot / join with next scene
const splitP=newProject();
splitP.scenes=[
  scene('scA','Act 1',[shot('a1',5,'Open'),shot('a2',3,'Turn'),shot('a3',4,'Close')]),
  scene('scB','Act 2',[shot('b1',10,'Later')]),
];
assert.equal(canSplitSceneAtShot(splitP,'a1'),false);
assert.equal(canSplitSceneAtShot(splitP,'a2'),true);
assert.equal(canJoinSceneWithNext(splitP,'scA'),true);
assert.equal(canJoinSceneWithNext(splitP,'scB'),false);
assert.throws(()=>splitSceneAtShot(splitP,'a1'),/later shot/);
const split=splitSceneAtShot(splitP,'a2');
assert.equal(split.fromScene.id,'scA');
assert.notEqual(split.toScene.id,'scA');
assert.equal(split.toScene.title,'Act 1 (cont.)');
assert.equal(split.index,0);
assert.equal(split.shot.id,'a2');
assert.deepEqual(splitP.scenes[0].shots.map(s=>s.id),['a1']);
assert.deepEqual(splitP.scenes[1].shots.map(s=>s.id),['a2','a3']);
assert.equal(splitP.scenes[1].id,split.toScene.id);
assert.deepEqual(splitP.scenes[2].shots.map(s=>s.id),['b1']);
assert.equal(findShotLocation(splitP,'a2').scene.id,split.toScene.id);
validateProject(JSON.parse(JSON.stringify(splitP)));
assert.throws(()=>splitSceneAtShot(splitP,'a1'),/later shot/);
assert.throws(()=>splitSceneAtShot(splitP,'gone'),/shot is no longer/);
assert.throws(()=>splitSceneAtShot(null,'a2'),/project/);

const joinP=newProject();
joinP.scenes=[
  scene('scA','Act 1',[shot('j1',5,'Open'),shot('j2',3,'Turn')]),
  scene('scB','Act 2',[shot('j3',10,'Later')]),
  scene('scC','Empty',[]),
];
joinP.scenes[1].plan={purpose:'Act 2 purpose'};
const joined=joinSceneWithNext(joinP,'scA');
assert.equal(joined.scene.id,'scA');
assert.equal(joined.absorbed.id,'scB');
assert.equal(joined.index,2);
assert.equal(joined.absorbedCount,1);
assert.deepEqual(joinP.scenes.map(s=>s.id),['scA','scC']);
assert.deepEqual(joinP.scenes[0].shots.map(s=>s.id),['j1','j2','j3']);
assert.equal(joinP.scenes[0].plan,undefined);
assert.equal(findShotLocation(joinP,'j3').scene.id,'scA');
validateProject(JSON.parse(JSON.stringify(joinP)));
joinSceneWithNext(joinP,'scA');
assert.deepEqual(joinP.scenes.map(s=>s.id),['scA']);
assert.deepEqual(joinP.scenes[0].shots.map(s=>s.id),['j1','j2','j3']);
assert.throws(()=>joinSceneWithNext(joinP,'scA'),/last scene/);
assert.throws(()=>joinSceneWithNext(joinP,'missing'),/scene is no longer/);
assert.throws(()=>joinSceneWithNext(null,'scA'),/project/);

// Follow-shot stays linked across split/join (ids unchanged; start remaps via followShots)
const sjAudio=newProject();
sjAudio.scenes=[
  scene('scA','A',[shot('x',5,'X'),shot('y',3,'Y'),shot('z',4,'Z')]),
];
sjAudio.episodeAudio=[{id:'clip1',kind:'music',label:'bed',muted:false,start:5,sourceStart:0,duration:2,fadeIn:0,fadeOut:0,volume:1,anchorShot:'y'}];
validateProject(sjAudio);
const beforeSplitAudio=structuredClone(sjAudio);
const splitAudio=splitSceneAtShot(sjAudio,'y');
followShots(beforeSplitAudio,sjAudio);
assert.equal(sjAudio.episodeAudio[0].anchorShot,'y');
assert.equal(sjAudio.episodeAudio[0].start,5);
assert.equal(findShotLocation(sjAudio,'y').scene.id,splitAudio.toScene.id);
const beforeJoinAudio=structuredClone(sjAudio);
joinSceneWithNext(sjAudio,sjAudio.scenes[0].id);
followShots(beforeJoinAudio,sjAudio);
assert.equal(sjAudio.episodeAudio[0].anchorShot,'y');
assert.equal(sjAudio.episodeAudio[0].start,5);
assert.deepEqual(sjAudio.scenes[0].shots.map(s=>s.id),['x','y','z']);
validateProject(JSON.parse(JSON.stringify(sjAudio)));

// Rename-after-split defaults + options.title override
assert.equal(defaultSplitSceneTitle({title:'Act 1'},1),'Act 1 (cont.)');
assert.equal(defaultSplitSceneTitle({title:'  '},2),'Scene 3');
assert.equal(defaultSplitSceneTitle({title:''},0),'Scene 1');
assert.equal(defaultSplitSceneTitle(null,4),'Scene 5');
assert.equal(defaultSplitSceneTitle({title:'Forest (cont.)'},1),'Forest (cont.)');
assert.equal(defaultSplitSceneTitle({title:'Forest (CONT.)'},1),'Forest (CONT.)');
const renameP=newProject();
renameP.scenes=[scene('scA','Hall',[shot('h1',2,'A'),shot('h2',2,'B'),shot('h3',2,'C')])];
const renamed=splitSceneAtShot(renameP,'h2',{title:'  Hall B  '});
assert.equal(renamed.toScene.title,'Hall B');
assert.deepEqual(renameP.scenes.map(s=>s.title),['Hall','Hall B']);
const blankTitleP=newProject();
blankTitleP.scenes=[scene('scA','',[shot('z1',2,'A'),shot('z2',2,'B')]),scene('scB','Keep',[shot('z3',2,'C')])];
const blankSplit=splitSceneAtShot(blankTitleP,'z2');
assert.equal(blankSplit.toScene.title,'Scene 2');
validateProject(JSON.parse(JSON.stringify(blankTitleP)));
console.log('Rename-after-split: (cont.) / Scene N defaults, options.title override, no double cont.');
// Destructive Story Room confirms + Remove scene disabled gate
assert.equal(canRemoveScene(null), false);
assert.equal(canRemoveScene({scenes:[]}), false);
assert.equal(canRemoveScene({scenes:[{id:'only'}]}), false);
assert.equal(canRemoveScene({scenes:[{id:'a'},{id:'b'}]}), true);
assert.match(removeShotConfirmMessage({title:' Mira '}), /Remove shot "Mira"/);
assert.match(removeShotConfirmMessage({title:''}), /Untitled shot/);
assert.match(removeShotConfirmMessage(null), /Untitled shot/);
assert.match(removeShotConfirmMessage({title:'X'}), /Undo restores the shot/);
assert.match(removeSceneConfirmMessage({title:' Act 2 ',shots:[{},{}]}), /Remove scene "Act 2" and its 2 shots/);
assert.match(removeSceneConfirmMessage({title:'Solo',shots:[{}]}), /1 shot/);
assert.match(removeSceneConfirmMessage({title:'  ',shots:[]}), /this scene.*0 shots/s);
assert.match(joinSceneConfirmMessage({title:'Act 2',shots:[{},{},{}]}), /Join 3 shots from "Act 2"/);
assert.match(joinSceneConfirmMessage({title:'Tail',shots:[{}]}), /Join 1 shot from "Tail"/);
assert.match(joinSceneConfirmMessage({title:'',shots:[]}), /this scene/);
assert.match(joinSceneConfirmMessage({title:'N',shots:[]}), /plan[\s\S]*Undo restores/);
const dirSrc=fs.readFileSync(new URL('../../simple-editor/director.js', import.meta.url),'utf8');
assert.ok(dirSrc.includes('removeShotConfirmMessage(shot)'), 'Remove shot confirm wired');
assert.ok(dirSrc.includes('removeSceneConfirmMessage(sc)'), 'Remove scene confirm wired');
assert.ok(dirSrc.includes('joinSceneConfirmMessage(next)'), 'Join confirm wired');
assert.ok(dirSrc.includes('removeSceneBtn.disabled=!canRemove') || dirSrc.includes('removeScene.disabled=!canRemoveScene(current)'), 'Remove scene disabled when sole scene');
assert.ok(dirSrc.includes('canRemoveScene'), 'canRemoveScene imported/used in director.js');
console.log('Destructive Story Room confirms: canRemoveScene, confirm copy, Remove/Join UI wiring.');

// Remove asset confirm (set kits / linked shots high-blast)
assert.equal(countAssetLinkedShots(null, 'a'), 0);
assert.equal(countAssetLinkedShots({scenes:[]}, 'a'), 0);
assert.equal(countAssetLinkedShots({scenes:[{shots:[{assetIds:['a']},{assetIds:['b']},{assetIds:['a','c']}]}]}, 'a'), 2);
assert.equal(countAssetLinkedShots({scenes:[{shots:[{assetIds:['a']}]},{shots:[{assetIds:['a']}]}]}, 'a'), 2);
assert.match(removeAssetConfirmMessage({name:' Mira ',kind:'character'}, {scenes:[]}), /Remove character "Mira"/);
assert.match(removeAssetConfirmMessage({name:'',kind:'prop'}, null), /Remove prop "Untitled asset"/);
assert.match(removeAssetConfirmMessage(null, null), /Remove asset "Untitled asset"/);
assert.match(removeAssetConfirmMessage({name:'X',kind:'set'}, {scenes:[]}), /Undo restores the asset/);
assert.match(removeAssetConfirmMessage({name:'Observatory',kind:'set',setKit:{props:[{},{},{}]}}, {scenes:[]}), /Set kit with 3 stage props/);
assert.match(removeAssetConfirmMessage({name:'Solo kit',kind:'set',setKit:{props:[{}]}}, {scenes:[]}), /1 stage prop/);
assert.match(removeAssetConfirmMessage({name:'Observatory',kind:'set',setKit:{props:[{},{}]},id:'kit1'}, {scenes:[{shots:[{assetIds:['kit1']},{assetIds:['kit1','other']}]}]}), /Unlinks from 2 shots/);
assert.match(removeAssetConfirmMessage({name:'Hero',kind:'character',rigSetup:{rig:{names:['a']}},id:'r1'}, {scenes:[{shots:[{assetIds:['r1']}]}]}), /Reusable rig setup[\s\S]*Unlinks from 1 shot[\s\S]*Undo restores the asset and shot links/);
assert.ok(dirSrc.includes('removeAssetConfirmMessage(asset,current)'), 'Remove asset confirm wired');
assert.ok(dirSrc.includes('countAssetLinkedShots(current,asset.id)'), 'Remove asset linked-shot count wired');
console.log('Remove asset confirm: set kit / rig / linked-shot copy + UI wiring.');


console.log('Split/join scene: keep-before, new scene, join absorb, empty next, Follow-shot ids stay.');

// In-scene reorder to index (Earlier/Later jump)
const reorderP=newProject();
reorderP.scenes=[scene('scR','Room',[shot('r1',2,'One'),shot('r2',2,'Two'),shot('r3',2,'Three'),shot('r4',2,'Four')])];
validateProject(reorderP);
const ropts=reorderInSceneOptions(reorderP,'r3');
assert.equal(ropts[0].value,'start');
assert.equal(ropts[1].value,'end');
assert.ok(ropts.some(o=>o.value==='after:r1'));
assert.ok(ropts.some(o=>o.value==='after:r2'));
assert.ok(ropts.some(o=>o.value==='after:r4'));
assert.ok(!ropts.some(o=>o.value==='after:r3'));
assert.equal(destIndexFromReorderPlace(reorderP,'r3','start'),0);
assert.equal(destIndexFromReorderPlace(reorderP,'r3','end'),undefined);
assert.equal(destIndexFromReorderPlace(reorderP,'r3','after:r1'),1);
assert.equal(destIndexFromReorderPlace(reorderP,'r3','after:r4'),3);
assert.equal(destIndexFromReorderPlace(reorderP,'r3','index:2'),2);
assert.throws(()=>destIndexFromReorderPlace(reorderP,'r3','after:r3'),/not in this scene/);
assert.throws(()=>destIndexFromReorderPlace(reorderP,'r3','middle'),/Unknown reorder/);
// Move r1 to end
moveShotInScene(reorderP,'r1',destIndexFromReorderPlace(reorderP,'r1','end'));
assert.deepEqual(reorderP.scenes[0].shots.map(s=>s.id),['r2','r3','r4','r1']);
// Move r1 (now last) to start
moveShotInScene(reorderP,'r1',0);
assert.deepEqual(reorderP.scenes[0].shots.map(s=>s.id),['r1','r2','r3','r4']);
// After r3 → becomes index 3 among remaining? remove r1, others=[r2,r3,r4], after r3 => 2, insert => [r2,r3,r1,r4]
moveShotInScene(reorderP,'r1',destIndexFromReorderPlace(reorderP,'r1','after:r3'));
assert.deepEqual(reorderP.scenes[0].shots.map(s=>s.id),['r2','r3','r1','r4']);
// No-op: already after r3 means fromIndex after remove equals insertAt
assert.throws(()=>moveShotInScene(reorderP,'r1',destIndexFromReorderPlace(reorderP,'r1','after:r3')),/already in this position/);
assert.deepEqual(reorderP.scenes[0].shots.map(s=>s.id),['r2','r3','r1','r4']);
// Single-shot scene rejects
const solo=newProject();solo.scenes=[scene('scS','Solo',[shot('s1',2,'Only')])];
assert.throws(()=>moveShotInScene(solo,'s1',0),/at least two shots/);
assert.deepEqual(reorderInSceneOptions(solo,'s1'),[]);
// Follow-shot id stays across reorder
const reorderAudio=newProject();
reorderAudio.scenes=[scene('scA','A',[shot('a',2,'A'),shot('b',2,'B'),shot('c',2,'C')])];
reorderAudio.episodeAudio=[{id:'clip1',kind:'music',label:'bed',muted:false,start:2,sourceStart:0,duration:2,fadeIn:0,fadeOut:0,volume:1,anchorShot:'b'}];
validateProject(reorderAudio);
const beforeReorderAudio=structuredClone(reorderAudio);
moveShotInScene(reorderAudio,'b',0);
followShots(beforeReorderAudio,reorderAudio);
assert.equal(reorderAudio.episodeAudio[0].anchorShot,'b');
assert.deepEqual(reorderAudio.scenes[0].shots.map(s=>s.id),['b','a','c']);
validateProject(JSON.parse(JSON.stringify(reorderAudio)));
console.log('In-scene reorder: start/end/after id, no-op reject, Follow-shot ids stay.');

// Find-shot across episode (title / id / action / camera / dialogue)
{
  const findP=newProject();
  const scene=findP.scenes[0];
  scene.title='Kitchen';
  scene.shots=[
    {id:'abc-1111-shot',title:'Wide establishing',seconds:2,action:'Pan across counters',camera:'Wide',dialogue:'Morning light.'},
    {id:'def-2222-shot',title:'Close-up coffee',seconds:3,action:'Steam rises',camera:'Tight CU',dialogue:'Need caffeine.'},
  ];
  findP.scenes.push({id:crypto.randomUUID(),title:'Garden',shots:[
    {id:'ghi-3333-shot',title:'Wide garden path',seconds:2,action:'Bee drifts',camera:'Tracking',dialogue:''},
    {id:'jkl-4444-shot',title:'Close-up bee',seconds:2,action:'Lands on flower',camera:'Macro',dialogue:'Buzz.'},
  ]});
  validateProject(findP);
  assert.deepEqual(SHOT_FIND_TEXT_FIELDS,['title','action','camera','dialogue']);
  assert.equal(normalizeShotFindQuery('  Wide  '),'wide');
  assert.equal(normalizeShotFindQuery(''),'');
  assert.equal(normalizeShotFindQuery(null),'');
  assert.equal(shotMatchesFindQuery(scene.shots[0],'wide'),true);
  assert.equal(shotMatchesFindQuery(scene.shots[0],'abc-1111'),true);
  assert.equal(shotMatchesFindQuery(scene.shots[0],'missing'),false);
  assert.equal(shotMatchesFindQuery(scene.shots[0],''),false);
  assert.equal(shotMatchesFindQuery(scene.shots[0],'  '),false);
  assert.deepEqual(shotFindMatchFields(scene.shots[0],'wide'),['title','camera']);
  assert.deepEqual(shotFindMatchFields(scene.shots[0],'abc-1111'),['id']);
  assert.deepEqual(shotFindMatchFields(scene.shots[0],'counters'),['action']);
  assert.deepEqual(shotFindMatchFields(scene.shots[0],'Morning'),['dialogue']);
  assert.deepEqual(shotFindMatchFields(scene.shots[0],''),[]);
  const byTitle=findShotsByQuery(findP,'wide');
  assert.equal(byTitle.length,2);
  assert.equal(byTitle[0].shot.id,'abc-1111-shot');
  assert.equal(byTitle[0].sceneIndex,0);
  assert.equal(byTitle[0].shotIndex,0);
  assert.deepEqual(byTitle[0].fields,['title','camera']);
  assert.equal(byTitle[1].shot.id,'ghi-3333-shot');
  assert.equal(byTitle[1].sceneIndex,1);
  assert.ok(byTitle[1].fields.includes('title'));
  const byId=findShotsByQuery(findP,'jkl-4444');
  assert.equal(byId.length,1);
  assert.equal(byId[0].shot.title,'Close-up bee');
  assert.deepEqual(byId[0].fields,['id']);
  const byDialogue=findShotsByQuery(findP,'caffeine');
  assert.equal(byDialogue.length,1);
  assert.equal(byDialogue[0].shot.id,'def-2222-shot');
  assert.deepEqual(byDialogue[0].fields,['dialogue']);
  const byAction=findShotsByQuery(findP,'Steam');
  assert.equal(byAction.length,1);
  assert.deepEqual(byAction[0].fields,['action']);
  const byCamera=findShotsByQuery(findP,'Macro');
  assert.equal(byCamera.length,1);
  assert.deepEqual(byCamera[0].fields,['camera']);
  assert.deepEqual(findShotsByQuery(findP,''),[]);
  assert.deepEqual(findShotsByQuery(findP,'   '),[]);
  assert.deepEqual(findShotsByQuery(findP,'nope-nope'),[]);
  assert.deepEqual(findShotsByQuery(null,'wide'),[]);
  console.log('Find-shot across episode: title/id/action/camera/dialogue + field labels, multi-scene order, empty query.');
}
