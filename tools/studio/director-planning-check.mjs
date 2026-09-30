import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {planningBasis,planningIssues,removeBeat,removeBeatConfirmMessage,clearAllBeats,clearAllBeatsConfirmMessage,storyBeatCount,removePanelConfirmMessage,removeAudioTrackConfirmMessage,reorderBeatOptions,destIndexFromBeatPlace,moveBeat,reorderPanelOptions,destIndexFromPanelPlace,movePanel,ensureAudioTrackIds,reorderAudioTrackOptions,destIndexFromAudioTrackPlace,moveAudioTrack,fitPanels,boardFrames,panelAt,assemblyShots,planningDocument,setShotSeconds,addPanel,setPanelFrames,sceneHasPlan,listScenePlanSources,copyScenePlan,STORY_FIELDS} from '../../simple-editor/director-planning-state.js';
import {deliveryChecks} from '../../simple-editor/director-delivery.js';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const p=newProject(),scene=p.scenes[0],shot={id:'shot',title:'Reaction',seconds:3,action:'Notice then react'};scene.shots.push(shot);
assert.equal(validateProject(p),p);assert.deepEqual(assemblyShots(p),[shot]);
p.story={premise:'A test',beats:[{id:'setup',title:'Signal'},{id:'payoff',title:'Answer',setupId:'setup'}]};
scene.plan={purpose:'Change a decision',beatIds:['setup','payoff'],script:'A signal sounds.'};
p.assets.push({id:'hero',kind:'character',name:'Hero',arc:{want:'Escape',need:'Trust'},readiness:'In progress'});shot.assetIds=['hero'];
assert.ok(planningIssues(p).some(x=>x.message.includes('Waiting for asset')));
shot.planApproval=planningBasis(p,scene,shot);assert.ok(!planningIssues(p).some(x=>x.message.includes('since approval')));
scene.plan.script+=' A reply.';assert.ok(planningIssues(p).some(x=>x.message.includes('since approval')));
shot.planApproval=planningBasis(p,scene,shot);p.assets[0].brief='Changed design';assert.ok(planningIssues(p).some(x=>x.message.includes('since approval')));
removeBeat(p,'setup');assert.equal(p.story.beats[0].setupId,undefined);assert.deepEqual(scene.plan.beatIds,['payoff']);
const file={name:'synthetic.png',type:'input'};
shot.panels=[{id:'a',frames:17,action:'Notice',media:file},{id:'b',frames:31,action:'React',media:file}];shot.visualSource='boards';
assert.ok(deliveryChecks(p).some(x=>x.kind==='Assembly'));fitPanels(shot);assert.equal(boardFrames(shot),72);
assert.equal(panelAt(shot,0).id,'a');assert.equal(panelAt(shot,shot.panels[0].frames/24).id,'b');assert.equal(panelAt(shot,3).id,'b');
const gap={seconds:3,panels:[{id:'a',frames:24},{id:'b',frames:24}]};
assert.equal(panelAt(gap,2).id,'b');assert.equal(panelAt(gap,2.1),null);
const timed={seconds:2,action:'Hold',panels:[{id:'p1',frames:24,action:'A'},{id:'p2',frames:24,action:'B'}]};
setShotSeconds(timed,3);assert.equal(boardFrames(timed),72);addPanel(timed);assert.equal(timed.panels.length,3);assert.equal(boardFrames(timed),72);
setPanelFrames(timed,0,10);assert.equal(timed.panels[0].frames,10);assert.equal(boardFrames(timed),72);
assert.ok(!deliveryChecks(p).some(x=>x.kind==='Assembly'));
shot.audio={name:'voice.wav'};shot.audioTracks=[{kind:'effects',start:1,volume:.4,media:{name:'effect.wav'},notes:'Footstep'}];
const parts=assemblyShots(p);assert.equal(parts.length,2);assert.equal(parts[1].audioOffset,parts[0].seconds);assert.equal(parts.reduce((n,x)=>n+x.frames,0),72);assert.deepEqual(parts[1].audio,shot.audio);
assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);assert.match(planningDocument(p),/Change a decision/);
shot.panels[0].frames=NaN;assert.throws(()=>validateProject(p));shot.panels[0].frames=24;
shot.audioTracks[0].volume=Infinity;assert.throws(()=>validateProject(p));shot.audioTracks[0].volume=.4;
scene.plan.beatIds=['missing'];assert.throws(()=>validateProject(p));scene.plan.beatIds=[];
shot.toolStages={face:'finished'};assert.equal(validateProject(JSON.parse(JSON.stringify(p))).scenes[0].shots[0].toolStages.face,'finished');
shot.toolStages={face:'open'};assert.throws(()=>validateProject(p));shot.toolStages={face:'finished'};
shot.panels[0].media={name:'movie.mp4'};assert.throws(()=>validateProject(p));

// Copy scene plan (fields / beats / isolation)
const srcScene={id:'src',title:'Observatory',plan:{purpose:'Reveal the signal',goal:'Convince Mira',obstacle:'Doubt',turn:'She looks up',outcome:'They leave',script:'A tone fills the dome.',beatIds:['setup','payoff']}};
const emptyScene={id:'dst',title:'Observatory (cont.)',shots:[]};
assert.equal(sceneHasPlan(srcScene),true);
assert.equal(sceneHasPlan(emptyScene),false);
assert.equal(sceneHasPlan({plan:{purpose:'   '}}),false);
assert.equal(sceneHasPlan({plan:{beatIds:['setup']}}),true);
const multi={scenes:[srcScene,emptyScene,{id:'other',title:'Empty too',plan:{}}]};
assert.deepEqual(listScenePlanSources(multi,'dst').map(s=>s.id),['src']);
assert.deepEqual(listScenePlanSources(multi,'src'),[]);
const allTarget={id:'dst',title:'B',plan:{purpose:'old',beatIds:['payoff']}};
const allSummary=copyScenePlan(allTarget,srcScene,'all');
assert.equal(allSummary.mode,'all');
assert.equal(allSummary.fields,6);
assert.equal(allSummary.beats,2);
assert.equal(allTarget.plan.purpose,'Reveal the signal');
assert.equal(allTarget.plan.script,'A tone fills the dome.');
assert.deepEqual(allTarget.plan.beatIds,['setup','payoff']);
const allPlanSnapshot=structuredClone(allTarget.plan);
allTarget.plan.beatIds.push('extra');
assert.deepEqual(srcScene.plan.beatIds,['setup','payoff']);
assert.deepEqual(allPlanSnapshot.beatIds,['setup','payoff']);
const fieldsTarget={id:'dst2',plan:{purpose:'keep-beats-path',beatIds:['payoff']}};
copyScenePlan(fieldsTarget,srcScene,'fields');
assert.equal(fieldsTarget.plan.goal,'Convince Mira');
assert.deepEqual(fieldsTarget.plan.beatIds,['payoff']);
const beatsTarget={id:'dst3',plan:{purpose:'keep-fields',beatIds:['payoff']}};
copyScenePlan(beatsTarget,srcScene,'beats');
assert.equal(beatsTarget.plan.purpose,'keep-fields');
assert.deepEqual(beatsTarget.plan.beatIds,['setup','payoff']);
assert.throws(()=>copyScenePlan(srcScene,srcScene),/different scene/);
assert.throws(()=>copyScenePlan(emptyScene,{id:'x',plan:{purpose:'  '}}),/no plan/);
assert.throws(()=>copyScenePlan(emptyScene,srcScene,'nope'),/all, fields, or beats/);
const round={version:1,id:'t',title:'T',assets:[],scenes:[{id:'a',title:'A',shots:[],plan:structuredClone(srcScene.plan)},{id:'b',title:'B',shots:[],plan:allPlanSnapshot}],story:{beats:[{id:'setup',title:'Signal'},{id:'payoff',title:'Answer',setupId:'setup'}]}};
assert.equal(validateProject(JSON.parse(JSON.stringify(round))).scenes[1].plan.purpose,'Reveal the signal');

// Clickable Planning checks -> jump to shot (Delivery parity).
const jumpProj=newProject();
const jumpScene=jumpProj.scenes[0];
const jumpShot={id:'jump-shot',title:'Jump target',seconds:2,action:'Look'};
jumpScene.shots.push(jumpShot);
jumpProj.story={premise:'x',beats:[{id:'orphan',title:'Unlinked beat'}]};
jumpProj.assets.push({id:'prop',kind:'prop',name:'Box',readiness:'Not started'});
jumpShot.assetIds=['prop'];
const jumpIssues=planningIssues(jumpProj);
const shotIssues=jumpIssues.filter(i=>i.shotId);
const beatIssues=jumpIssues.filter(i=>!i.shotId);
assert.ok(shotIssues.length,'shot-level planning issues expected');
assert.ok(shotIssues.every(i=>i.shotId==='jump-shot'),'shot issues must carry shotId');
assert.ok(beatIssues.some(i=>i.message.includes('Unlinked beat')),'beat notes stay episode-level');
assert.ok(beatIssues.every(i=>i.shotId===undefined),'beat notes must not claim a shot id');

const planningUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.match(planningUi,/refreshPlanningIssues\(parent,project,button,goToShot\)/);
assert.match(planningUi,/issue\.shotId&&typeof button==='function'&&typeof goToShot==='function'/);
assert.match(planningUi,/goToShot\(issue\.shotId\)/);
assert.match(planningUi,/planning-issues/);
assert.match(planningUi,/else rows\.append\(el\('p',label\)\)/);

const directorUi=readFileSync(join(root,'simple-editor/director.js'),'utf8');
assert.match(directorUi,/refreshPlanningIssues\(planningChecks,current,button,id=>showShot\(id,'plan'\)\)/);

const cssUi=readFileSync(join(root,'simple-editor/director.css'),'utf8');
assert.match(cssUi,/\.planning-issues\{/);
assert.match(cssUi,/\.planning-issues>button/);

// Story-beat Place / Reorder (Start / End / After) — shot Reorder-in-scene parity
const beatP={story:{beats:[{id:'b1',title:'Setup'},{id:'b2',title:'Turn'},{id:'b3',title:'Payoff',setupId:'b1'},{id:'b4',title:'Tag'}]}};
const bopts=reorderBeatOptions(beatP,'b3');
assert.ok(bopts.some(o=>o.value==='start'&&o.label==='Start of list'));
assert.ok(bopts.some(o=>o.value==='end'&&o.label==='End of list'));
assert.ok(bopts.some(o=>o.value==='after:b1'&&o.label==='After Setup'));
assert.ok(!bopts.some(o=>o.value==='after:b3'));
assert.equal(destIndexFromBeatPlace(beatP,'b3','start'),0);
assert.equal(destIndexFromBeatPlace(beatP,'b3','end'),undefined);
assert.equal(destIndexFromBeatPlace(beatP,'b3','after:b1'),1);
assert.equal(destIndexFromBeatPlace(beatP,'b3','after:b4'),3);
assert.equal(destIndexFromBeatPlace(beatP,'b3','index:2'),2);
assert.throws(()=>destIndexFromBeatPlace(beatP,'b3','after:b3'),/not in the list/);
assert.throws(()=>destIndexFromBeatPlace(beatP,'b3','middle'),/Unknown beat place/);
moveBeat(beatP,'b1',destIndexFromBeatPlace(beatP,'b1','end'));
assert.deepEqual(beatP.story.beats.map(b=>b.id),['b2','b3','b4','b1']);
moveBeat(beatP,'b1',0);
assert.deepEqual(beatP.story.beats.map(b=>b.id),['b1','b2','b3','b4']);
moveBeat(beatP,'b1',destIndexFromBeatPlace(beatP,'b1','after:b3'));
assert.deepEqual(beatP.story.beats.map(b=>b.id),['b2','b3','b1','b4']);
assert.equal(beatP.story.beats.find(b=>b.id==='b3').setupId,'b1');
assert.throws(()=>moveBeat(beatP,'b1',destIndexFromBeatPlace(beatP,'b1','after:b3')),/already in this position/);
const soloBeat={story:{beats:[{id:'only',title:'Alone'}]}};
assert.throws(()=>moveBeat(soloBeat,'only',0),/at least two story beats/);
assert.deepEqual(reorderBeatOptions(soloBeat,'only'),[]);
assert.throws(()=>moveBeat({story:{beats:[]}},'x',0),/at least two|no longer/);

const planningBeatUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.match(planningBeatUi,/Reorder beat/);
assert.match(planningBeatUi,/reorderBeatOptions\(project,b\.id\)/);
assert.match(planningBeatUi,/destIndexFromBeatPlace\(project,b\.id,place\)/);
assert.match(planningBeatUi,/moveBeat\(project,b\.id,destIndex\)/);
assert.match(planningBeatUi,/Move beat earlier/);
assert.match(planningBeatUi,/Move beat later/);
assert.match(planningBeatUi,/Place beat in story list/);
assert.match(planningBeatUi,/dataset\.beatId=b\.id/);
assert.match(planningBeatUi,/download,tell/);
const directorBeatUi=readFileSync(join(root,'simple-editor/director.js'),'utf8');
assert.match(directorBeatUi,/storyRoom\(storyHost,current,\{field,button,change,download,tell\}\)/);
const cssBeatUi=readFileSync(join(root,'simple-editor/director.css'),'utf8');
assert.match(cssBeatUi,/\.beat-card \.beat-reorder\{/);

// Storyboard panel Place / Reorder (Start / End / After) - beat/shot Place parity
const panelShot={seconds:4,panels:[
  {id:'p1',frames:24,action:'Wide establish'},
  {id:'p2',frames:24,action:'Close on Mira'},
  {id:'p3',frames:24,action:'Insert prop'},
  {id:'p4',frames:24,action:'Tag beat'},
]};
const popts=reorderPanelOptions(panelShot,'p3');
assert.ok(popts.some(o=>o.value==='start'&&o.label==='Start of boards'));
assert.ok(popts.some(o=>o.value==='end'&&o.label==='End of boards'));
assert.ok(popts.some(o=>o.value==='after:p1'&&o.label.includes('After panel 1')));
assert.ok(!popts.some(o=>o.value==='after:p3'));
assert.equal(destIndexFromPanelPlace(panelShot,'p3','start'),0);
assert.equal(destIndexFromPanelPlace(panelShot,'p3','end'),undefined);
assert.equal(destIndexFromPanelPlace(panelShot,'p3','after:p1'),1);
assert.equal(destIndexFromPanelPlace(panelShot,'p3','after:p4'),3);
assert.equal(destIndexFromPanelPlace(panelShot,'p3','index:2'),2);
assert.throws(()=>destIndexFromPanelPlace(panelShot,'p3','after:p3'),/not on this shot/);
assert.throws(()=>destIndexFromPanelPlace(panelShot,'p3','middle'),/Unknown panel place/);
movePanel(panelShot,'p1',destIndexFromPanelPlace(panelShot,'p1','end'));
assert.deepEqual(panelShot.panels.map(p=>p.id),['p2','p3','p4','p1']);
// frames / action stay with their panel ids (order-only move)
assert.equal(panelShot.panels.find(p=>p.id==='p1').frames,24);
assert.equal(panelShot.panels.find(p=>p.id==='p1').action,'Wide establish');
assert.equal(boardFrames(panelShot),96);
movePanel(panelShot,'p1',0);
assert.deepEqual(panelShot.panels.map(p=>p.id),['p1','p2','p3','p4']);
movePanel(panelShot,'p1',destIndexFromPanelPlace(panelShot,'p1','after:p3'));
assert.deepEqual(panelShot.panels.map(p=>p.id),['p2','p3','p1','p4']);
assert.throws(()=>movePanel(panelShot,'p1',destIndexFromPanelPlace(panelShot,'p1','after:p3')),/already in this position/);
const soloPanel={seconds:1,panels:[{id:'only',frames:24,action:'Alone'}]};
assert.throws(()=>movePanel(soloPanel,'only',0),/at least two storyboard panels/);
assert.deepEqual(reorderPanelOptions(soloPanel,'only'),[]);
assert.throws(()=>movePanel({panels:[]},'x',0),/at least two|no longer/);

const planningPanelUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.match(planningPanelUi,/Reorder panel/);
assert.match(planningPanelUi,/reorderPanelOptions\(shot,p\.id\)/);
assert.match(planningPanelUi,/destIndexFromPanelPlace\(shot,p\.id,place\)/);
assert.match(planningPanelUi,/movePanel\(shot,p\.id,destIndex\)/);
assert.match(planningPanelUi,/Panel earlier/);
assert.match(planningPanelUi,/Panel later/);
assert.match(planningPanelUi,/Place panel in storyboard/);
assert.match(planningPanelUi,/dataset\.panelId=p\.id/);
assert.match(planningPanelUi,/attach,tell/);
const directorPanelUi=readFileSync(join(root,'simple-editor/director.js'),'utf8');
assert.match(directorPanelUi,/shotPlanning\(card,current,scene,shot,\{field,button,change,attach,tell\}\)/);
const cssPanelUi=readFileSync(join(root,'simple-editor/director.css'),'utf8');
assert.match(cssPanelUi,/\.board-card \.panel-reorder\{/);


// Sound-track Place / Reorder (Start / End / After) - panel/beat Place parity
const trackShot={seconds:4,audioTracks:[
  {id:'t1',kind:'dialogue',label:'Hero VO',notes:'Line A',start:0,volume:.8},
  {id:'t2',kind:'music',label:'Bed',notes:'',start:0,volume:.3},
  {id:'t3',kind:'effects',label:'Door',notes:'Slam',start:1,volume:.5},
  {id:'t4',kind:'effects',label:'',notes:'Footsteps',start:2,volume:.4},
]};
const topts=reorderAudioTrackOptions(trackShot,'t3');
assert.ok(topts.some(o=>o.value==='start'&&o.label==='Start of list'));
assert.ok(topts.some(o=>o.value==='end'&&o.label==='End of list'));
assert.ok(topts.some(o=>o.value==='after:t1'&&o.label.includes('After Dialogue 1')));
assert.ok(!topts.some(o=>o.value==='after:t3'));
assert.equal(destIndexFromAudioTrackPlace(trackShot,'t3','start'),0);
assert.equal(destIndexFromAudioTrackPlace(trackShot,'t3','end'),undefined);
assert.equal(destIndexFromAudioTrackPlace(trackShot,'t3','after:t1'),1);
assert.equal(destIndexFromAudioTrackPlace(trackShot,'t3','after:t4'),3);
assert.equal(destIndexFromAudioTrackPlace(trackShot,'t3','index:2'),2);
assert.throws(()=>destIndexFromAudioTrackPlace(trackShot,'t3','after:t3'),/not on this shot/);
assert.throws(()=>destIndexFromAudioTrackPlace(trackShot,'t3','middle'),/Unknown sound-track place/);
moveAudioTrack(trackShot,'t1',destIndexFromAudioTrackPlace(trackShot,'t1','end'));
assert.deepEqual(trackShot.audioTracks.map(t=>t.id),['t2','t3','t4','t1']);
// kind / label / start stay with their track ids (order-only move)
assert.equal(trackShot.audioTracks.find(t=>t.id==='t1').kind,'dialogue');
assert.equal(trackShot.audioTracks.find(t=>t.id==='t1').label,'Hero VO');
assert.equal(trackShot.audioTracks.find(t=>t.id==='t1').start,0);
moveAudioTrack(trackShot,'t1',0);
assert.deepEqual(trackShot.audioTracks.map(t=>t.id),['t1','t2','t3','t4']);
moveAudioTrack(trackShot,'t1',destIndexFromAudioTrackPlace(trackShot,'t1','after:t3'));
assert.deepEqual(trackShot.audioTracks.map(t=>t.id),['t2','t3','t1','t4']);
assert.throws(()=>moveAudioTrack(trackShot,'t1',destIndexFromAudioTrackPlace(trackShot,'t1','after:t3')),/already in this position/);
const soloTrack={seconds:1,audioTracks:[{id:'only',kind:'effects',label:'',notes:'',start:0,volume:.5}]};
assert.throws(()=>moveAudioTrack(soloTrack,'only',0),/at least two sound tracks/);
assert.deepEqual(reorderAudioTrackOptions(soloTrack,'only'),[]);
assert.throws(()=>moveAudioTrack({audioTracks:[]},'x',0),/at least two|no longer/);
// Legacy tracks without ids get ids via ensureAudioTrackIds
const legacy={audioTracks:[{kind:'music',label:'Old',notes:'',start:0,volume:.2},{kind:'effects',label:'FX',notes:'',start:1,volume:.4}]};
ensureAudioTrackIds(legacy);
assert.ok(typeof legacy.audioTracks[0].id==='string'&&legacy.audioTracks[0].id);
assert.ok(typeof legacy.audioTracks[1].id==='string'&&legacy.audioTracks[1].id);
assert.notEqual(legacy.audioTracks[0].id,legacy.audioTracks[1].id);
moveAudioTrack(legacy,legacy.audioTracks[0].id,undefined);
assert.equal(legacy.audioTracks[1].label,'Old');

const planningSoundUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.match(planningSoundUi,/Reorder track/);
assert.match(planningSoundUi,/reorderAudioTrackOptions\(shot,t\.id\)/);
assert.match(planningSoundUi,/destIndexFromAudioTrackPlace\(shot,t\.id,place\)/);
assert.match(planningSoundUi,/moveAudioTrack\(shot,t\.id,destIndex\)/);
assert.match(planningSoundUi,/Track earlier/);
assert.match(planningSoundUi,/Track later/);
assert.match(planningSoundUi,/Place sound track in list/);
assert.match(planningSoundUi,/dataset\.trackId=t\.id/);
assert.match(planningSoundUi,/id:crypto\.randomUUID\(\)/);
const cssSoundUi=readFileSync(join(root,'simple-editor/director.css'),'utf8');
assert.match(cssSoundUi,/\.board-card \.sound-reorder\{/);


// Destructive planning confirms (Remove beat / panel / sound track) — Story Room remove confirm parity
assert.match(removeBeatConfirmMessage({title:' Mira '}), /Remove story beat "Mira"/);
assert.match(removeBeatConfirmMessage({title:''}), /Untitled beat/);
assert.match(removeBeatConfirmMessage(null), /Untitled beat/);
assert.match(removeBeatConfirmMessage({title:'X'}), /Scene links[\s\S]*Undo restores/);
assert.match(removePanelConfirmMessage({frames:24,media:{name:'a.png'}},0), /Remove storyboard Panel 1 \(has drawing\) \(24 frames\)/);
assert.match(removePanelConfirmMessage({frames:1},2), /Panel 3 \(1 frame\)/);
assert.match(removePanelConfirmMessage({},0), /Panel 1/);
assert.match(removePanelConfirmMessage({frames:12},0), /redistribute[\s\S]*Undo restores/);
assert.match(removeAudioTrackConfirmMessage({label:' Hero VO ',kind:'dialogue',media:{name:'a.wav'}},0), /Remove "Hero VO" \(dialogue, has audio\)/);
assert.match(removeAudioTrackConfirmMessage({label:'',kind:'music'},3), /Remove "Sound track 4" \(music\)/);
assert.match(removeAudioTrackConfirmMessage(null,0), /Sound track 1.*effects/s);
assert.match(removeAudioTrackConfirmMessage({label:'X',kind:'effects'},0), /Undo restores the track/);

const planningConfirmUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.ok(planningConfirmUi.includes('removeBeatConfirmMessage(b)'), 'Remove beat confirm wired');
assert.ok(planningConfirmUi.includes('removePanelConfirmMessage(p,i)'), 'Remove panel confirm wired');
assert.ok(planningConfirmUi.includes('removeAudioTrackConfirmMessage(t,i)'), 'Remove sound track confirm wired');
assert.match(planningConfirmUi,/tell\?\.\(label\+' removed\. Undo restores\.'\)/);
assert.match(planningConfirmUi,/tell\?\.\('Panel '\+\(i\+1\)\+' removed\. Undo restores\.'\)/);
console.log('Destructive planning confirms: beat/panel/track confirm copy + UI wiring.');

// Clear all beats (Story Room wipe) — confirm + disabled when empty; distinct from episode-audio beat markers
assert.equal(storyBeatCount({story:{beats:[{id:'a'},{id:'b'}]}}), 2);
assert.equal(storyBeatCount({story:{beats:[]}}), 0);
assert.equal(storyBeatCount({}), 0);
assert.equal(storyBeatCount(null), 0);
const clearProj={story:{beats:[{id:'a',title:'Setup'},{id:'b',title:'Payoff',setupId:'a'},{id:'c',title:'Twist'}]},scenes:[{id:'s1',plan:{beatIds:['a','b']}},{id:'s2',plan:{beatIds:['c'],purpose:'x'}},{id:'s3',plan:{purpose:'no-beats'}}]};
assert.match(clearAllBeatsConfirmMessage(clearProj), /Clear all 3 story beats/);
assert.match(clearAllBeatsConfirmMessage(clearProj), /Clears 3 scene beat links/);
assert.match(clearAllBeatsConfirmMessage(clearProj), /Undo restores/);
assert.match(clearAllBeatsConfirmMessage({story:{beats:[{id:'only',title:'Solo'}]},scenes:[]}), /Clear all 1 story beat/);
assert.match(clearAllBeatsConfirmMessage({story:{beats:[{id:'only'}]},scenes:[]}), /Scene links and payoff setup links/);
const clearedN=clearAllBeats(clearProj);
assert.equal(clearedN, 3);
assert.deepEqual(clearProj.story.beats, []);
assert.deepEqual(clearProj.scenes[0].plan.beatIds, []);
assert.deepEqual(clearProj.scenes[1].plan.beatIds, []);
assert.equal(clearProj.scenes[1].plan.purpose, 'x');
assert.equal(clearProj.scenes[2].plan.purpose, 'no-beats');
assert.equal(storyBeatCount(clearProj), 0);
assert.throws(()=>clearAllBeats(null), /Project required/);
assert.equal(clearAllBeats({story:{beats:[]},scenes:[]}), 0);

const clearAllUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.ok(clearAllUi.includes("button('Clear all beats'"), 'Clear all beats button wired');
assert.ok(clearAllUi.includes('clearAllBeatsConfirmMessage(project)'), 'Clear all beats confirm wired');
assert.ok(clearAllUi.includes('clearAllBeats(project)'), 'Clear all beats mutate wired');
assert.ok(clearAllUi.includes('syncClearAllBeatsBtn'), 'Clear all beats disabled sync wired');
assert.ok(clearAllUi.includes('storyBeatCount(project)'), 'storyBeatCount drives disabled');
assert.match(clearAllUi, /cleared\. Undo restores/);
assert.ok(clearAllUi.includes('clearAllBeatsBtn.disabled=!n'), 'disabled when 0 beats');
console.log('Clear all beats: wipe + confirm copy + UI wiring (Story Room; not episode-audio markers).');

import {countWords,parseManuscriptScenes,feedManuscript,MANUSCRIPT_MAX_CHARS,MANUSCRIPT_SHOT_SECONDS} from '../../simple-editor/director-manuscript.js';
assert.ok(!STORY_FIELDS.includes('manuscript'), 'manuscript stays out of STORY_FIELDS');
assert.equal(countWords(''), 0);
assert.equal(countWords('Hello, world!'), 2);
assert.equal(countWords('***'), 0);
assert.equal(countWords('A — B'), 2);
assert.equal(countWords('42 rockets'), 2);
const parsed=parseManuscriptScenes('# Cold open\nHero steps outside.\n\nWind bites.\n***\n# The chase\nThey run.\n');
assert.equal(parsed.length, 2);
assert.equal(parsed[0].title, 'Cold open');
assert.match(parsed[0].script, /Hero steps outside/);
assert.equal(parsed[1].title, 'The chase');
const keep={id:'keep',title:'Already here',shots:[{id:'k1',title:'Hold',seconds:2,action:'Wait'}]};
const feedProj=newProject();
feedProj.scenes=[keep];
feedProj.story={manuscript:'# Cold open\nHero steps outside.\n\nWind bites.\n***\nThey run without a title.\n'};
const beforeN=feedProj.scenes.length;
const fed=feedManuscript(feedProj, feedProj.story.manuscript);
assert.equal(fed.count, 2);
assert.equal(feedProj.scenes.length, beforeN+2);
assert.equal(feedProj.scenes[0], keep);
assert.equal(feedProj.scenes[1].title, 'Cold open');
assert.equal(feedProj.scenes[1].plan.script.includes('Hero steps outside'), true);
assert.equal(feedProj.scenes[1].shots.length, 1);
assert.equal(feedProj.scenes[1].shots[0].seconds, MANUSCRIPT_SHOT_SECONDS);
assert.equal(feedProj.scenes[1].shots[0].action, 'Hero steps outside.');
assert.equal(feedProj.scenes[2].title, 'Scene 2');
assert.match(feedProj.scenes[2].plan.script, /They run/);
feedProj.story.manuscript='x'.repeat(MANUSCRIPT_MAX_CHARS+1);
assert.throws(()=>validateProject(feedProj), /at most/);
feedProj.story.manuscript='ok';
assert.equal(validateProject(JSON.parse(JSON.stringify(feedProj))).story.manuscript, 'ok');
const basis=planningBasis(feedProj, feedProj.scenes[1], feedProj.scenes[1].shots[0]);
assert.ok(!/"manuscript"/.test(basis) && !basis.includes('"'+'x'.repeat(20)), 'planningBasis omits manuscript blob');
const manuscriptUi=readFileSync(join(root,'simple-editor/director-planning.js'),'utf8');
assert.ok(manuscriptUi.includes("button('Feed manuscript'"), 'Feed manuscript button wired');
assert.ok(manuscriptUi.includes('feedManuscript(project'), 'Feed manuscript mutates via change');
assert.match(manuscriptUi, /Undo restores/);
assert.ok(manuscriptUi.includes('countWords'), 'word count shown');
const notice=readFileSync(join(root,'NOTICE-NEO.md'),'utf8');
assert.match(notice, /Copyright \(c\) 2026 Hugh Howey/);
assert.match(notice, /MIT License/);
const msSrc=readFileSync(join(root,'simple-editor/director-manuscript.js'),'utf8');
assert.match(msSrc, /Copyright \(c\) 2026 Hugh Howey/);
assert.match(msSrc, /NOTICE-NEO/);
console.log('Manuscript: parse *** / # Title, feed append, word count, validate cap, UI + NOTICE.');

console.log('Planning checks passed: legacy compatibility, dependency and revision reminders, beat unlinking, exact frame boundaries, panel export/audio offsets, round trip, copy scene plan, jump-to-shot wiring, story-beat Place/Reorder, storyboard panel Place/Reorder, sound-track Place/Reorder, destructive Remove confirms (beat/panel/track), Clear all beats confirm, manuscript feed, and invalid import rejection.');

