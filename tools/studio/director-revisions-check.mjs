import assert from 'node:assert/strict';
import {saveAnimationRevision,validateRevisions,approveRevision,flipAnimationPass,clearableUnsavedFrameMarkCount} from '../../simple-editor/director-revisions.js';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newDrawing} from '../../simple-editor/director-drawing.js';
import {productionSummary} from '../../simple-editor/director-production.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
const project=newProject(),shot={id:'shot',seconds:3,drawing:newDrawing()};project.scenes[0].shots.push(shot);
const blocking=saveAnimationRevision(shot,'First poses','Blocking');shot.drawing.layers[0].name='Changed';assert.equal(blocking.drawing.layers[0].name,'Sketch');
const polish=saveAnimationRevision(shot,'Final pass','Polish');assert.throws(()=>approveRevision(shot,polish.id),/earlier/);
blocking.notes.push({text:'Lower wrist',frame:7,resolved:false,marks:[[[.1,.2],[.3,.4]]]});blocking.status='Needs changes';validateProject(project);assert.equal(productionSummary(project).notes,1);assert.throws(()=>approveRevision(shot,blocking.id),/Resolve/);
blocking.notes[0].resolved=true;approveRevision(shot,blocking.id);const breakdown=saveAnimationRevision(shot,'Breakdowns','Breakdowns');approveRevision(shot,breakdown.id);approveRevision(shot,polish.id);validateProject(JSON.parse(JSON.stringify(project)));
const bad=structuredClone(shot);bad.animationRevisions[0].notes[0].marks[0][0][0]=2;assert.throws(()=>validateRevisions(bad),/annotation/);bad.animationRevisions[0].notes[0].marks=[];bad.animationRevisions[0].notes[0].frame=72;assert.throws(()=>validateRevisions(bad),/note/);
const frozen=JSON.stringify(shot);assert.throws(()=>saveAnimationRevision(shot,'','Blocking'),/revision/);assert.equal(JSON.stringify(shot),frozen);

assert.throws(()=>flipAnimationPass({id:'x',seconds:1},'Blocking','Approved'),/Save a Blocking revision/);
flipAnimationPass(shot,'Polish','Needs changes');
assert.equal(shot.animationRevisions.find(r=>r.pass==='Polish').status,'Needs changes');
flipAnimationPass(shot,'Breakdowns','Needs changes');
assert.throws(()=>flipAnimationPass(shot,'Polish','Approved'),/earlier animation passes|Approve the earlier/i);

// Clear unsaved frame marks disabled-when-empty (Clear layer / Clear title overrides / Clear decided parity)
{
  assert.equal(clearableUnsavedFrameMarkCount(null, null), 0);
  assert.equal(clearableUnsavedFrameMarkCount(undefined, undefined), 0);
  assert.equal(clearableUnsavedFrameMarkCount([], null), 0);
  assert.equal(clearableUnsavedFrameMarkCount([], []), 0);
  assert.equal(clearableUnsavedFrameMarkCount([[ [0.1,0.2],[0.3,0.4] ]], null), 1);
  assert.equal(clearableUnsavedFrameMarkCount([[ [0.1,0.2] ],[ [0.5,0.6] ]], null), 2);
  assert.equal(clearableUnsavedFrameMarkCount([], [ [0.2,0.3] ]), 1, 'in-progress stroke counts');
  assert.equal(clearableUnsavedFrameMarkCount([[ [0.1,0.2] ]], [ [0.9,0.9] ]), 2);
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const revSrc = readFileSync(join(root, 'simple-editor/director-revisions.js'), 'utf8');
  assert.match(revSrc, /clearableUnsavedFrameMarkCount/);
  assert.match(revSrc, /syncClearUnsavedMarksButton/);
  assert.match(revSrc, /Clear unsaved frame marks/);
  assert.match(revSrc, /No unsaved frame marks to clear/);
  assert.ok(revSrc.includes('clearUnsavedMarksBtn.disabled=!clearable'), 'Clear unsaved marks disabled sync');
  assert.ok(revSrc.includes('clearableUnsavedFrameMarkCount(marks,drawing)'), 'Clear button uses clearable count');
  console.log('Clear unsaved frame marks disabled-when-empty: clearable count + UI wiring.');
}

console.log('Revision checks passed: immutable drawings, frame/annotation validation, ordered pass approvals, unresolved-note gates, production counts, failed-save nonmutation, project backup roundtrip, clear-unsaved-marks-disabled.');
