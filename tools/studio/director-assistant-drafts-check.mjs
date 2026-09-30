import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newProject, validateProject} from '../../simple-editor/director-project.js';
import {
  MAX_ASSISTANT_DRAFTS,
  buildAssistantDraft,
  recordAssistantDraft,
  setAssistantDraftStatus,
  findAssistantDraft,
  validateAssistantDrafts,
  pruneAssistantDrafts,
  assistantDraftLabel,
  ASSISTANT_DRAFT_FILTERS,
  draftMatchesAssistantDraftFilter,
  listAssistantDrafts,
  summarizeAssistantDrafts,
  clearDecidedAssistantDrafts,
  clearableDecidedAssistantDraftCount,
  assistantTextApplyGate,
  assistantShotApplyGate,
  assistantAudioApplyGate,
  assistantScriptApplyGate,
} from '../../simple-editor/director-assistant-drafts.js';

const base = buildAssistantDraft({
  kind: 'write',
  model: 'bonsai',
  skill: 'general',
  request: 'Tighten Mira dialogue.',
  resultText: 'Mira: We made it.',
  targetShotId: 'shot-1',
  sceneId: 'scene-1',
  jobId: 'job-1',
});
assert.equal(base.status, 'pending');
assert.match(assistantDraftLabel(base), /write · bonsai · general · pending/);

const p = newProject();
p.scenes[0].shots = [{id: 'shot-1', title: 'Target', seconds: 5, action: '', dialogue: ''}];
recordAssistantDraft(p, base);
validateProject(p);
assert.equal(p.assistantDrafts.length, 1);
assert.equal(findAssistantDraft(p, base.id).resultText, 'Mira: We made it.');

setAssistantDraftStatus(p, base.id, 'accepted');
assert.equal(findAssistantDraft(p, base.id).status, 'accepted');
assert.ok(findAssistantDraft(p, base.id).decidedAt);
validateProject(p);

setAssistantDraftStatus(p, base.id, 'rejected');
assert.equal(findAssistantDraft(p, base.id).status, 'rejected');
validateProject(p);

const shotDraft = buildAssistantDraft({
  kind: 'shot',
  model: 'bonsai',
  request: 'Character: Mira. Setting: Lab. Action: waves. Duration: 6 seconds.',
  resultText: 'Mira waves.',
  shot: {character: 'Mira', setting: 'Lab', duration_seconds: 6, action: 'Mira waves.'},
  jobId: 'job-shot',
});
recordAssistantDraft(p, shotDraft);
assert.equal(p.assistantDrafts[0].id, shotDraft.id); // newest first
validateProject(p);

const voice = buildAssistantDraft({
  kind: 'voice',
  model: 'kokoro',
  resultText: 'Hello there.',
  audio: {name: 'take.wav', subfolder: 'studio-director', type: 'input'},
  jobId: 'job-voice',
});
recordAssistantDraft(p, voice);
validateProject(p);

// Idempotent by jobId
const again = buildAssistantDraft({
  kind: 'voice',
  model: 'kokoro',
  resultText: 'Hello again.',
  audio: {name: 'take2.wav', subfolder: 'studio-director', type: 'input'},
  jobId: 'job-voice',
});
recordAssistantDraft(p, again);
assert.equal(p.assistantDrafts.filter(d => d.jobId === 'job-voice').length, 1);
assert.equal(findAssistantDraft(p, again.id).resultText, 'Hello again.');

// Cap + prune
for (let i = 0; i < MAX_ASSISTANT_DRAFTS + 5; i++) {
  recordAssistantDraft(p, {
    kind: 'write',
    model: 'bonsai',
    resultText: 'draft ' + i,
    jobId: 'bulk-' + i,
    status: i % 3 === 0 ? 'accepted' : 'pending',
  });
}
pruneAssistantDrafts(p);
assert.ok(p.assistantDrafts.length <= MAX_ASSISTANT_DRAFTS);
validateProject(p);

assert.throws(() => validateAssistantDrafts({assistantDrafts: [{id: 'x'}]}), /kind|status|createdAt|resultText/i);
assert.throws(() => {
  const bad = newProject();
  bad.assistantDrafts = [{...base, status: 'maybe'}];
  validateProject(bad);
}, /status/);
assert.throws(() => {
  const bad = newProject();
  bad.assistantDrafts = [{...base, resultText: 'x'.repeat(6001)}];
  validateProject(bad);
}, /exceeds|6000/);
assert.throws(() => setAssistantDraftStatus(p, 'missing-id', 'accepted'), /no longer/);

// Reload simulation: JSON round-trip keeps inbox
const reloaded = validateProject(JSON.parse(JSON.stringify(p)));
assert.ok(Array.isArray(reloaded.assistantDrafts));
assert.ok(reloaded.assistantDrafts.length >= 1);

// Filter + pending-first list + summarize + clear decided
const filterProj = newProject();
const older = buildAssistantDraft({
  kind: 'write', model: 'bonsai', resultText: 'old pending', jobId: 'f-old',
  createdAt: '2026-01-01T00:00:00.000Z',
});
const newer = buildAssistantDraft({
  kind: 'shot', model: 'bonsai', resultText: 'new pending', jobId: 'f-new',
  createdAt: '2026-06-01T00:00:00.000Z',
  shot: {character: 'Mira', setting: 'Lab', action: 'waves', duration_seconds: 6},
});
const accepted = buildAssistantDraft({
  kind: 'voice', model: 'kokoro', resultText: 'accepted line', jobId: 'f-acc',
  createdAt: '2026-03-01T00:00:00.000Z',
  audio: {name: 'a.wav', subfolder: 'studio-voices', type: 'input'},
});
recordAssistantDraft(filterProj, older);
recordAssistantDraft(filterProj, newer);
recordAssistantDraft(filterProj, accepted);
setAssistantDraftStatus(filterProj, accepted.id, 'accepted');
const rejected = buildAssistantDraft({
  kind: 'transcribe', model: 'r2t2', resultText: 'nope', jobId: 'f-rej',
  createdAt: '2026-02-01T00:00:00.000Z',
});
recordAssistantDraft(filterProj, rejected);
setAssistantDraftStatus(filterProj, rejected.id, 'rejected');

assert.ok(ASSISTANT_DRAFT_FILTERS.some(f => f.id === 'pending'));
const acceptedRow = findAssistantDraft(filterProj, accepted.id);
const rejectedRow = findAssistantDraft(filterProj, rejected.id);
const newerRow = findAssistantDraft(filterProj, newer.id);
assert.equal(acceptedRow.status, 'accepted');
assert.equal(draftMatchesAssistantDraftFilter(acceptedRow, 'accepted'), true);
assert.equal(draftMatchesAssistantDraftFilter(acceptedRow, 'pending'), false);
assert.equal(draftMatchesAssistantDraftFilter(newerRow, 'shot'), true);
assert.equal(draftMatchesAssistantDraftFilter(newerRow, 'voice'), false);
assert.equal(draftMatchesAssistantDraftFilter(rejectedRow, 'rejected'), true);
assert.equal(draftMatchesAssistantDraftFilter(rejectedRow, 'decided'), true);

const pendingOnly = listAssistantDrafts(filterProj, 'pending');
assert.equal(pendingOnly.length, 2);
assert.equal(pendingOnly[0].id, newer.id); // newer pending first within band
assert.equal(pendingOnly[1].id, older.id);

const allListed = listAssistantDrafts(filterProj, 'all');
assert.equal(allListed[0].status, 'pending');
assert.ok(allListed.findIndex(d => d.status === 'pending') < allListed.findIndex(d => d.status === 'accepted'));

const summary = summarizeAssistantDrafts(filterProj);
assert.deepEqual(
  {total: summary.total, pending: summary.pending, accepted: summary.accepted, rejected: summary.rejected, decided: summary.decided},
  {total: 4, pending: 2, accepted: 1, rejected: 1, decided: 2},
);

assert.equal(clearableDecidedAssistantDraftCount(summary), 2);
assert.equal(clearableDecidedAssistantDraftCount({decided: 0}), 0);
assert.equal(clearableDecidedAssistantDraftCount(null), 0);


const removed = clearDecidedAssistantDrafts(filterProj);
assert.equal(removed, 2);
assert.equal(filterProj.assistantDrafts.length, 2);
assert.ok(filterProj.assistantDrafts.every(d => d.status === 'pending'));
validateProject(filterProj);
assert.equal(clearDecidedAssistantDrafts(filterProj), 0);
assert.equal(clearableDecidedAssistantDraftCount(summarizeAssistantDrafts(filterProj)), 0);


// UI wiring: Clear decided drafts disabled when nothing clearable (voice Clear decided parity)
const assistantSrc = fs.readFileSync(new URL('../../simple-editor/director-assistant.js', import.meta.url), 'utf8');
assert.ok(assistantSrc.includes("data-clear-decided-drafts"), 'Clear decided drafts button missing');
assert.ok(assistantSrc.includes('clearableDecidedAssistantDraftCount'), 'Clear decided drafts disabled-state helper missing');
assert.ok(assistantSrc.includes('clearDrafts.disabled=!clearableDrafts'), 'Clear decided drafts disabled sync missing');
assert.ok(assistantSrc.includes("clearable=clearableDecidedAssistantDraftCount(counts)"), 'Clear decided drafts handler clearable guard missing');


// Apply gates: disabled when empty / wrong project / missing target (set-kit Apply parity)
const emptyText = assistantTextApplyGate({ text: '  ', ownerProjectId: 'p1', currentProjectId: 'p1' });
assert.equal(emptyText.ok, false);
assert.match(emptyText.reason, /empty/i);
const okText = assistantTextApplyGate({ text: 'Mira waves.', ownerProjectId: 'p1', currentProjectId: 'p1' });
assert.equal(okText.ok, true);
const staleProj = assistantTextApplyGate({ text: 'x', ownerProjectId: 'old', currentProjectId: 'new' });
assert.equal(staleProj.ok, false);
assert.match(staleProj.reason, /original project/i);
const needTarget = assistantTextApplyGate({ text: 'x', ownerProjectId: 'p1', currentProjectId: 'p1', requireTarget: true, targetShotId: '', targetShotExists: false });
assert.equal(needTarget.ok, false);
assert.match(needTarget.reason, /target/i);
const missingShot = assistantTextApplyGate({ text: 'x', ownerProjectId: 'p1', currentProjectId: 'p1', requireTarget: true, targetShotId: 'gone', targetShotExists: false });
assert.equal(missingShot.ok, false);
assert.match(missingShot.reason, /missing/i);

assert.equal(assistantShotApplyGate({ title: '', seconds: 6, action: 'wave', ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);
assert.equal(assistantShotApplyGate({ title: 'A', seconds: 6.5, action: 'wave', ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);
assert.equal(assistantShotApplyGate({ title: 'A', seconds: 6, action: 'wave', ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, true);

assert.equal(assistantAudioApplyGate({ hasAudio: false, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);
assert.equal(assistantAudioApplyGate({ hasAudio: true, targetShotId: '', targetShotExists: false, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);
assert.equal(assistantAudioApplyGate({ hasAudio: true, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, true);

assert.equal(assistantScriptApplyGate({ text: 'smile', hasRig: false, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);
assert.match(assistantScriptApplyGate({ text: 'smile', hasRig: false, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).reason, /eye shape/i);
assert.equal(assistantScriptApplyGate({ text: 'smile', hasRig: true, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, true);
assert.equal(assistantScriptApplyGate({ text: '', hasRig: true, targetShotId: 's1', targetShotExists: true, ownerProjectId: 'p1', currentProjectId: 'p1' }).ok, false);

assert.ok(assistantSrc.includes('syncApplyButtons'), 'Apply disabled sync missing');
assert.ok(assistantSrc.includes('assistantTextApplyGate'), 'Text apply gate wiring missing');
assert.ok(assistantSrc.includes('assistantShotApplyGate'), 'Shot apply gate wiring missing');
assert.ok(assistantSrc.includes('assistantAudioApplyGate'), 'Audio apply gate wiring missing');
assert.ok(assistantSrc.includes('assistantScriptApplyGate'), 'Script apply gate wiring missing');
assert.ok(assistantSrc.includes("output.addEventListener('input',()=>syncApplyButtons())"), 'Editable result input sync missing');
assert.ok(assistantSrc.includes('if(!value)syncApplyButtons()'), 'lock unlock should re-sync Apply disabled state');

console.log('Assistant draft inbox checks passed: record, accept/reject, jobId upsert, prune, validate, reload, filter, pending-first, clear decided + clearable count, Clear decided disabled sync, apply gates + syncApplyButtons.');
