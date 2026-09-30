import assert from 'node:assert/strict';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {STAGES} from '../../simple-editor/director-production.js';
import {deliveryChecks,shotListCSV,subtitlesSRT,softMuxCaptionsPayload,softMuxAfterExportBody,normalizeCaptionsLanguage,DEFAULT_CAPTIONS_LANGUAGE,CAPTION_LANGUAGES,assembleReadyGate,assembleLoudnessGate} from '../../simple-editor/director-delivery.js';
import fs from 'node:fs';
const p=newProject();assert.equal(deliveryChecks(p)[0].kind,'Assembly');
const s={id:'shot-a',title:'=SUM(1,2)',seconds:2,action:'A "robot", waves\nthen bows',subtitle:'Hello\n\nworld',dialogue:'DO NOT SUBTITLE THIS'};
p.scenes[0].shots.push(s,{id:'shot-b',seconds:3},{id:'shot-c',seconds:2,subtitle:'Goodbye'});
assert.equal(subtitlesSRT(p),'1\n00:00:00,000 --> 00:00:02,000\nHello\nworld\n\n2\n00:00:05,000 --> 00:00:07,000\nGoodbye\n\n');
assert.deepEqual(softMuxCaptionsPayload(p,false),{softMuxCaptions:false});
assert.equal(softMuxCaptionsPayload(p,true).softMuxCaptions,true);
assert.equal(softMuxCaptionsPayload(p,true).captionsSrt,subtitlesSRT(p));
assert.equal(softMuxCaptionsPayload(p,true).captionsLanguage,DEFAULT_CAPTIONS_LANGUAGE);
assert.equal(softMuxCaptionsPayload(p,true,'SPA').captionsLanguage,'spa');
assert.equal(softMuxCaptionsPayload(p,true,'jpn').captionsLanguage,'jpn');
assert.equal(normalizeCaptionsLanguage(''),DEFAULT_CAPTIONS_LANGUAGE);
assert.equal(normalizeCaptionsLanguage(null),DEFAULT_CAPTIONS_LANGUAGE);
assert.throws(()=>normalizeCaptionsLanguage('en'),/3-letter/i);
assert.throws(()=>normalizeCaptionsLanguage('zzz'),/Unsupported/i);
assert.throws(()=>normalizeCaptionsLanguage(12),/must be text/i);
assert.ok(CAPTION_LANGUAGES.some(x=>x.code==='eng'));
const empty=newProject();assert.throws(()=>softMuxCaptionsPayload(empty,true),/subtitle text/i);
assert.ok(shotListCSV(p).includes('"\'=SUM(1,2)"'));
assert.ok(shotListCSV(p).includes('A ""robot"", waves\nthen bows'));
assert.equal(deliveryChecks(p).filter(x=>x.kind==='Assembly').length,3);
p.scenes[0].shots=[s];s.media={name:'fixture.png'};s.production=Object.fromEntries(STAGES.map(x=>[x,'Not needed']));assert.equal(deliveryChecks(p).length,0);
s.production.Animation='Needs changes';s.versions=[{id:'v',label:'v1',created:'today',media:{name:'fixture.png'},notes:[{frame:0,text:'Fix',resolved:false}]}];assert.equal(deliveryChecks(p).filter(x=>x.kind==='Review').length,2);
s.animationRevisions=[{id:'r1',label:'Block',pass:'Blocking',status:'Work in progress',created:'today',seconds:2,drawing:{version:1,width:960,height:540,background:'#ffffff',onion:false,layers:[{id:'L',name:'Ink',visible:true,opacity:1,blend:'source-over',locked:false,strokes:[]}],keys:[]},notes:[]}];
assert.ok(deliveryChecks(p).some(x=>x.kind==='Animation passes'&&/Blocking animation pass is not Approved/.test(x.message)));
s.animationRevisions[0].status='Approved';s.animationRevisions.push({id:'r2',label:'Polish early',pass:'Polish',status:'Work in progress',created:'today',seconds:2,drawing:structuredClone(s.animationRevisions[0].drawing),notes:[]});
assert.ok(deliveryChecks(p).some(x=>x.kind==='Animation passes'&&/Polish started before Breakdowns/.test(x.message)));
validateProject(p);

// False-complete: Animation Approved without craft revisions still reminds
s.animationRevisions=undefined;s.production.Animation='Approved';
assert.ok(deliveryChecks(p).some(x=>x.kind==='Animation passes'&&/without saved Blocking/.test(x.message)));
s.production.Animation='Not needed';
assert.ok(!deliveryChecks(p).some(x=>x.kind==='Animation passes'&&/without saved Blocking/.test(x.message)));
assert.ok(shotListCSV(p).includes('Blocking pass'));
assert.ok(shotListCSV(p).includes('Missing'));

const after=softMuxAfterExportBody(p,'spa',{filename:'episode-fixture.mp4',subfolder:'Qwen-Studio/Director',type:'output'});
assert.equal(after.softMuxCaptions,true);
assert.equal(after.captionsLanguage,'spa');
assert.equal(after.captionsSrt,subtitlesSRT(p));
assert.deepEqual(after.source,{filename:'episode-fixture.mp4',type:'output',subfolder:'Qwen-Studio/Director'});
assert.throws(()=>softMuxAfterExportBody(p,'eng',null),/Assemble an episode first/i);
assert.throws(()=>softMuxAfterExportBody(p,'eng',{}),/Assemble an episode first/i);
assert.throws(()=>softMuxAfterExportBody(p,'eng',{filename:'x.mp4',type:'temp'}),/Studio media file/i);
assert.throws(()=>softMuxAfterExportBody(empty,'eng',{filename:'episode-fixture.mp4',type:'output'}),/subtitle text/i);
s.subtitle=12;assert.throws(()=>validateProject(p),/Subtitle/);


// Assemble export gates: Assemble MP4 disabled until Assembly checks pass; loudness disabled without export
{
  const emptyGate = assembleReadyGate(newProject());
  assert.equal(emptyGate.ok, false);
  assert.match(emptyGate.reason, /Add at least one shot|Attach/i);
  assert.ok(emptyGate.missing >= 1);

  const readyProj = newProject();
  const readyShot = {id:'assemble-ready', title:'Ready', seconds:2, media:{name:'fixture.png', type:'input'}};
  readyProj.scenes[0].shots = [readyShot];
  const readyGate = assembleReadyGate(readyProj);
  assert.equal(readyGate.ok, true, readyGate.reason);
  assert.equal(readyGate.missing, 0);

  const missingMedia = newProject();
  missingMedia.scenes[0].shots = [{id:'bare', title:'Bare', seconds:2}];
  const missGate = assembleReadyGate(missingMedia);
  assert.equal(missGate.ok, false);
  assert.match(missGate.reason, /Attach/i);

  const boardProj = newProject();
  boardProj.scenes[0].shots = [{id:'board', title:'Board', seconds:1, visualSource:'boards', panels:[{id:'p1', frames:24}]}];
  const boardGate = assembleReadyGate(boardProj);
  assert.equal(boardGate.ok, false);
  assert.match(boardGate.reason, /storyboard|panel|Attach/i);

  assert.equal(assembleLoudnessGate(null).ok, false);
  assert.match(assembleLoudnessGate(null).reason, /Assemble an episode first/i);
  assert.equal(assembleLoudnessGate({state:'idle'}).ok, false);
  assert.equal(assembleLoudnessGate({state:'running', output:{filename:'ep.mp4', type:'output'}}).ok, false);
  assert.match(assembleLoudnessGate({state:'running', output:{filename:'ep.mp4', type:'output'}}).reason, /Wait for Assemble/i);
  assert.equal(assembleLoudnessGate({state:'done', output:{filename:'ep.mp4', type:'output'}}).ok, true);
  assert.equal(assembleLoudnessGate({state:'done', output:{name:'ep.mp4', type:'output'}}).ok, true);
  assert.equal(assembleLoudnessGate({state:'done', output:{filename:'  ', type:'output'}}).ok, false);

  const directorSrc = fs.readFileSync(new URL('../../simple-editor/director.js', import.meta.url), 'utf8');
  assert.ok(directorSrc.includes('assembleReadyGate'), 'Assemble ready gate import/use missing');
  assert.ok(directorSrc.includes('assembleLoudnessGate'), 'Assemble loudness gate import/use missing');
  assert.ok(directorSrc.includes('syncAssembleExportButtons'), 'Assemble export button sync missing');
  assert.ok(directorSrc.includes("ready=assembleReadyGate(current)"), 'Assemble MP4 click/sync gate missing');
  assert.ok(directorSrc.includes('assemble-loudness-check'), 'Loudness button class marker missing');
  assert.ok(directorSrc.includes('syncAssembleExportButtons(job)'), 'poll must sync assemble buttons from job');
  assert.ok(directorSrc.includes("typeof syncAssembleExportButtons==='function'") || directorSrc.includes('typeof syncAssembleExportButtons===\'function\''), 'updateCounts should re-sync assemble gates');
}

console.log('Delivery checks passed: empty/missing shots, reminders, CSV quoting/formula protection, independent subtitles, soft-mux captions payload + language + after-export body, timing gaps, animation-pass gates, false-complete blocker and invalid input, assembleReadyGate + assembleLoudnessGate + UI wiring.');
