import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newProject, validateProject} from '../../simple-editor/director-project.js';
import {
  MAX_VOICE_TAKES,
  buildVoiceTake,
  recordVoiceTake,
  setVoiceTakeStatus,
  findVoiceTake,
  promoteVoiceTake,
  validateVoiceTakes,
  pruneVoiceTakes,
  voiceTakeLabel,
  voiceTakeMediaNames,
  collectVoiceKeepNames,
  orphanVoiceFiles,
  linkOrphanVoiceFile,
  orphanDiscardConfirm,
  summarizeOrphanDiscard,
  crossEpisodeVoiceKeepRefs,
  formatCrossEpisodeKeepNote,
  setVoiceTakeLabel,
  setVoiceTakeNote,
  duplicateVoiceTake,
  defaultDuplicateVoiceTakeLabel,
  MAX_TAKE_LABEL,
  MAX_TAKE_NOTE,
  VOICE_TAKE_FILTERS,
  takeMatchesVoiceTakeFilter,
  listVoiceTakes,
  summarizeVoiceTakes,
  clearRejectedVoiceTakes,
  clearDecidedVoiceTakes,
  clearableRejectedVoiceTakeCount,
  clearableDecidedVoiceTakeCount,
  shotLinkedVoiceNames,
  voiceTakeLinkedToShot,
} from '../../simple-editor/director-voice-takes.js';

const base = buildVoiceTake({
  engine: 'kokoro',
  voice: 'bm_george',
  model: 'kokoro',
  request: 'Hello there.',
  resultText: 'Hello there.',
  targetShotId: 'shot-1',
  sceneId: 'scene-1',
  jobId: 'job-voice-1',
  audio: {name: 'kokoro-aaa.wav', subfolder: 'studio-voices', type: 'input'},
  seconds: 1.25,
  speed: 0.9,
});
assert.equal(base.status, 'library');
assert.match(voiceTakeLabel(base), /kokoro/);
assert.match(voiceTakeLabel(base), /library/);

const p = newProject();
p.scenes[0].id = 'scene-1';
p.scenes[0].shots = [{id: 'shot-1', title: 'Target', seconds: 5, action: '', dialogue: ''}];
recordVoiceTake(p, base);
validateProject(p);
assert.equal(p.voiceTakes.length, 1);
assert.equal(findVoiceTake(p, base.id).audio.name, 'kokoro-aaa.wav');
assert.deepEqual(voiceTakeMediaNames(p), ['kokoro-aaa.wav']);

promoteVoiceTake(p, base.id, 'shot-1');
assert.equal(p.scenes[0].shots[0].audio.name, 'kokoro-aaa.wav');
assert.equal(findVoiceTake(p, base.id).status, 'promoted');
assert.ok(findVoiceTake(p, base.id).promotedAt);
validateProject(p);

setVoiceTakeStatus(p, base.id, 'rejected');
assert.equal(findVoiceTake(p, base.id).status, 'rejected');
assert.ok(findVoiceTake(p, base.id).rejectedAt);
validateProject(p);

const acted = buildVoiceTake({
  engine: 'chatterbox',
  model: 'chatterbox',
  resultText: 'We made it.',
  audio: {name: 'chatterbox-bbb.wav', subfolder: 'studio-voices', type: 'input'},
  seconds: 2.0,
  delivery: 0.8,
  pacing: 0.4,
  jobId: 'job-voice-2',
});
recordVoiceTake(p, acted);
assert.equal(p.voiceTakes[0].id, acted.id); // newest first
validateProject(p);

// Idempotent by jobId
const again = buildVoiceTake({
  engine: 'chatterbox',
  model: 'chatterbox',
  resultText: 'We made it again.',
  audio: {name: 'chatterbox-ccc.wav', subfolder: 'studio-voices', type: 'input'},
  jobId: 'job-voice-2',
});
recordVoiceTake(p, again);
assert.equal(p.voiceTakes.filter(t => t.jobId === 'job-voice-2').length, 1);
assert.equal(findVoiceTake(p, again.id).resultText, 'We made it again.');

// Cap + prune prefers rejected, then library
for (let i = 0; i < MAX_VOICE_TAKES + 5; i++) {
  recordVoiceTake(p, {
    engine: 'kokoro',
    resultText: 'take ' + i,
    jobId: 'bulk-' + i,
    audio: {name: 'bulk-' + i + '.wav', subfolder: 'studio-voices', type: 'input'},
    status: i % 4 === 0 ? 'rejected' : 'library',
  });
}
pruneVoiceTakes(p);
assert.ok(p.voiceTakes.length <= MAX_VOICE_TAKES);
validateProject(p);

assert.throws(() => validateVoiceTakes({voiceTakes: [{id: 'x'}]}), /status|createdAt|resultText|audio/i);
assert.throws(() => {
  const bad = newProject();
  bad.voiceTakes = [{...base, status: 'maybe'}];
  validateProject(bad);
}, /status/);
assert.throws(() => {
  const bad = newProject();
  bad.voiceTakes = [{...base, resultText: 'x'.repeat(2001)}];
  validateProject(bad);
}, /exceeds|2000/);
assert.throws(() => setVoiceTakeStatus(p, 'missing-id', 'promoted'), /no longer/);
assert.throws(() => promoteVoiceTake(p, base.id, 'missing-shot'), /target shot|no longer/i);

// Keep-name collector covers library + shot + drafts
const keepProject = newProject();
keepProject.scenes[0].shots = [{
  id: 's1', title: 'A', seconds: 3, action: '',
  audio: {name: 'shot.wav', subfolder: 'studio-voices', type: 'input'},
}];
keepProject.assistantDrafts = [{
  id: 'd1', kind: 'voice', status: 'pending', createdAt: new Date().toISOString(),
  resultText: 'x', audio: {name: 'draft.wav', subfolder: 'studio-voices', type: 'input'},
}];
recordVoiceTake(keepProject, {
  engine: 'kokoro', resultText: 'lib', audio: {name: 'lib.wav', subfolder: 'studio-voices', type: 'input'},
});
const keep = collectVoiceKeepNames([keepProject]);
assert.ok(keep.includes('shot.wav'));
assert.ok(keep.includes('draft.wav'));
assert.ok(keep.includes('lib.wav'));

// Reload simulation
const reloaded = validateProject(JSON.parse(JSON.stringify(p)));
assert.ok(Array.isArray(reloaded.voiceTakes));
assert.ok(reloaded.voiceTakes.length >= 1);

// Orphan disk listing helpers (link into project / filter against keep-names)
const diskFiles = [
  {name: 'lib.wav', bytes: 10, mtime: 1, subfolder: 'studio-voices', type: 'input'},
  {name: 'orphan-only.wav', bytes: 20, mtime: 2, subfolder: 'studio-voices', type: 'input'},
  {name: 'shot.wav', bytes: 30, mtime: 3, subfolder: 'studio-voices', type: 'input'},
];
const orphaned = orphanVoiceFiles(diskFiles, keep);
assert.deepEqual(orphaned.map(f => f.name), ['orphan-only.wav']);
assert.deepEqual(orphanVoiceFiles([], keep), []);
assert.deepEqual(orphanVoiceFiles(diskFiles, []), diskFiles);

const linkProject = newProject();
linkProject.scenes[0].id = 'scene-link';
linkProject.scenes[0].shots = [{id: 'shot-link', title: 'L', seconds: 3, action: ''}];
const linked = linkOrphanVoiceFile(linkProject, {name: 'orphan-only.wav', subfolder: 'studio-voices', type: 'input'}, {
  targetShotId: 'shot-link', sceneId: 'scene-link', resultText: 'Recovered orphan',
});
assert.equal(linked.status, 'library');
assert.equal(linked.audio.name, 'orphan-only.wav');
assert.equal(linked.engine, 'disk');
assert.equal(linkProject.voiceTakes.length, 1);
validateProject(linkProject);
// Idempotent re-link of same filename
const againLink = linkOrphanVoiceFile(linkProject, {name: 'orphan-only.wav', subfolder: 'studio-voices', type: 'input'});
assert.equal(againLink.id, linked.id);
assert.equal(linkProject.voiceTakes.length, 1);
assert.throws(() => linkOrphanVoiceFile(linkProject, {name: '../escape.wav'}), /invalid|WAV/i);
assert.throws(() => linkOrphanVoiceFile(linkProject, {name: 'nope.mp3'}), /WAV/i);


// Multi-select orphan discard confirm + summary helpers
assert.equal(orphanDiscardConfirm([]), '');
assert.match(orphanDiscardConfirm(['a.wav']), /Discard orphan voice file "a\.wav"/);
const multiConfirm = orphanDiscardConfirm(['a.wav', 'b.wav', 'c.wav']);
assert.match(multiConfirm, /Discard 3 orphan voice files/);
assert.match(multiConfirm, /• a\.wav/);
assert.match(multiConfirm, /• b\.wav/);
assert.match(summarizeOrphanDiscard({deleted: 2, freed: 2048, protected: 1, missing: 0, failed: 0}), /Discarded 2 orphans/);
assert.match(summarizeOrphanDiscard({deleted: 2, freed: 2048, protected: 1, missing: 0, failed: 0}), /Kept 1/);
assert.match(summarizeOrphanDiscard({deleted: 0, protected: 0, missing: 1, failed: 0}, ['gone.wav']), /already gone/);
assert.match(summarizeOrphanDiscard({deleted: 0, protected: 0, missing: 0, failed: 1}), /1 failed/);
assert.equal(summarizeOrphanDiscard({}, ['x.wav']), 'Nothing discarded.');


// Cross-episode keep-ref notes (orphan on current project, still used by another loaded episode)
const epA = newProject();
epA.title = 'Episode A';
epA.id = 'ep-a';
const epB = newProject();
epB.title = 'Episode B';
epB.id = 'ep-b';
const epC = newProject();
epC.title = 'Episode C';
epC.id = 'ep-c';
recordVoiceTake(epB, {
  engine: 'disk', model: 'orphan-link', request: '', resultText: 'shared',
  audio: {name: 'shared-ep.wav', subfolder: 'studio-voices', type: 'input'},
  status: 'library',
});
recordVoiceTake(epC, {
  engine: 'disk', model: 'orphan-link', request: '', resultText: 'shared',
  audio: {name: 'shared-ep.wav', subfolder: 'studio-voices', type: 'input'},
  status: 'library',
});
recordVoiceTake(epC, {
  engine: 'disk', model: 'orphan-link', request: '', resultText: 'solo',
  audio: {name: 'solo-c.wav', subfolder: 'studio-voices', type: 'input'},
  status: 'library',
});
// Current epA does not reference shared-ep.wav → orphan listing would include it
const cross = crossEpisodeVoiceKeepRefs(
  ['shared-ep.wav', 'solo-c.wav', 'true-orphan.wav'],
  epA,
  [epA, epB, epC],
);
assert.ok(cross instanceof Map);
assert.deepEqual(cross.get('shared-ep.wav').map(r => r.title).sort(), ['Episode B', 'Episode C']);
assert.deepEqual(cross.get('solo-c.wav').map(r => r.title), ['Episode C']);
assert.equal(cross.has('true-orphan.wav'), false);
// Current project itself is excluded even if it keeps the name
recordVoiceTake(epA, {
  engine: 'disk', model: 'orphan-link', request: '', resultText: 'mine',
  audio: {name: 'mine-a.wav', subfolder: 'studio-voices', type: 'input'},
  status: 'library',
});
const selfOnly = crossEpisodeVoiceKeepRefs(['mine-a.wav'], epA, [epA, epB]);
assert.equal(selfOnly.has('mine-a.wav'), false);
// Same-id object identity / id match exclude
const epAClone = { ...epA, voiceTakes: epA.voiceTakes };
const byId = crossEpisodeVoiceKeepRefs(['mine-a.wav'], epA, [epAClone]);
assert.equal(byId.has('mine-a.wav'), false);
assert.equal(formatCrossEpisodeKeepNote([]), '');
assert.equal(formatCrossEpisodeKeepNote(null), '');
assert.match(formatCrossEpisodeKeepNote([{ title: 'Episode B' }]), /Episode B/);
assert.match(formatCrossEpisodeKeepNote([{ title: 'Episode B' }]), /Discard blocked/);
const multiNote = formatCrossEpisodeKeepNote([
  { title: 'Episode B' }, { title: 'Episode C' }, { title: 'Episode D' }, { title: 'Episode E' },
]);
assert.match(multiNote, /4 loaded episodes/);
assert.match(multiNote, /\+1 more/);
assert.deepEqual(crossEpisodeVoiceKeepRefs([], epA, [epA, epB]).size, 0);


// Artist label / note curation
const labeled = buildVoiceTake({
  engine: 'kokoro',
  voice: 'af_heart',
  resultText: 'Same line, warmer.',
  audio: {name: 'kokoro-label.wav', subfolder: 'studio-voices', type: 'input'},
  label: 'Mira warm',
  note: 'Use on shot 3 open',
  seconds: 1.1,
});
assert.equal(labeled.label, 'Mira warm');
assert.equal(labeled.note, 'Use on shot 3 open');
assert.match(voiceTakeLabel(labeled), /^Mira warm/);
assert.match(voiceTakeLabel(labeled), /library/);
assert.doesNotMatch(voiceTakeLabel(labeled), /^kokoro/);

const labelProject = newProject();
labelProject.scenes[0].shots = [{id: 'shot-1', title: 'Target', seconds: 5, action: '', dialogue: ''}];
recordVoiceTake(labelProject, labeled);
setVoiceTakeLabel(labelProject, labeled.id, 'Mira cold take 2');
assert.equal(findVoiceTake(labelProject, labeled.id).label, 'Mira cold take 2');
assert.match(voiceTakeLabel(findVoiceTake(labelProject, labeled.id)), /^Mira cold take 2/);
setVoiceTakeNote(labelProject, labeled.id, 'Too breathy — redo');
assert.equal(findVoiceTake(labelProject, labeled.id).note, 'Too breathy — redo');
setVoiceTakeLabel(labelProject, labeled.id, '  ');
assert.equal(findVoiceTake(labelProject, labeled.id).label, undefined);
assert.match(voiceTakeLabel(findVoiceTake(labelProject, labeled.id)), /kokoro/);
setVoiceTakeNote(labelProject, labeled.id, '');
assert.equal(findVoiceTake(labelProject, labeled.id).note, undefined);
validateProject(labelProject);
assert.throws(() => setVoiceTakeLabel(labelProject, labeled.id, 'x'.repeat(MAX_TAKE_LABEL + 1)), /label/i);
assert.throws(() => setVoiceTakeNote(labelProject, labeled.id, 'y'.repeat(MAX_TAKE_NOTE + 1)), /note/i);
assert.throws(() => setVoiceTakeLabel(labelProject, 'missing-id', 'Nope'), /no longer/);
assert.throws(() => validateVoiceTakes({voiceTakes: [{
  id: 'bad-label', status: 'library', createdAt: new Date().toISOString(), resultText: '',
  audio: {name: 'a.wav', subfolder: 'studio-voices', type: 'input'}, label: 12,
}]}), /label/i);


// Status filter + library-first list + summarize + clear rejected (linked-shot safety)
const filterProj = newProject();
filterProj.scenes[0].id = 'scene-f';
filterProj.scenes[0].shots = [{id: 'shot-f', title: 'Filter', seconds: 4, action: '', dialogue: ''}];
const olderLib = buildVoiceTake({
  engine: 'kokoro', resultText: 'old library', jobId: 'vt-old',
  createdAt: '2026-01-01T00:00:00.000Z',
  audio: {name: 'old-lib.wav', subfolder: 'studio-voices', type: 'input'},
});
const newerLib = buildVoiceTake({
  engine: 'kokoro', resultText: 'new library', jobId: 'vt-new',
  createdAt: '2026-06-01T00:00:00.000Z',
  audio: {name: 'new-lib.wav', subfolder: 'studio-voices', type: 'input'},
});
const promotedTake = buildVoiceTake({
  engine: 'kokoro', resultText: 'promoted line', jobId: 'vt-prom',
  createdAt: '2026-03-01T00:00:00.000Z',
  audio: {name: 'prom.wav', subfolder: 'studio-voices', type: 'input'},
});
const rejectedTake = buildVoiceTake({
  engine: 'kokoro', resultText: 'rejected line', jobId: 'vt-rej',
  createdAt: '2026-02-01T00:00:00.000Z',
  audio: {name: 'rej.wav', subfolder: 'studio-voices', type: 'input'},
});
const linkedRejected = buildVoiceTake({
  engine: 'kokoro', resultText: 'still on shot', jobId: 'vt-linked-rej',
  createdAt: '2026-02-15T00:00:00.000Z',
  audio: {name: 'linked-rej.wav', subfolder: 'studio-voices', type: 'input'},
});
recordVoiceTake(filterProj, olderLib);
recordVoiceTake(filterProj, newerLib);
recordVoiceTake(filterProj, promotedTake);
promoteVoiceTake(filterProj, promotedTake.id, 'shot-f');
recordVoiceTake(filterProj, rejectedTake);
setVoiceTakeStatus(filterProj, rejectedTake.id, 'rejected');
recordVoiceTake(filterProj, linkedRejected);
setVoiceTakeStatus(filterProj, linkedRejected.id, 'rejected');
// Attach linked-rejected WAV to another shot so clear must keep it
filterProj.scenes[0].shots.push({
  id: 'shot-link', title: 'Linked', seconds: 3, action: '',
  audio: {name: 'linked-rej.wav', subfolder: 'studio-voices', type: 'input'},
});

assert.ok(VOICE_TAKE_FILTERS.some(f => f.id === 'library'));
assert.equal(takeMatchesVoiceTakeFilter(findVoiceTake(filterProj, promotedTake.id), 'promoted'), true);
assert.equal(takeMatchesVoiceTakeFilter(findVoiceTake(filterProj, promotedTake.id), 'library'), false);
assert.equal(takeMatchesVoiceTakeFilter(findVoiceTake(filterProj, rejectedTake.id), 'rejected'), true);
assert.equal(takeMatchesVoiceTakeFilter(findVoiceTake(filterProj, rejectedTake.id), 'decided'), true);
assert.equal(voiceTakeLinkedToShot(filterProj, findVoiceTake(filterProj, linkedRejected.id)), true);
assert.equal(voiceTakeLinkedToShot(filterProj, findVoiceTake(filterProj, rejectedTake.id)), false);
assert.ok(shotLinkedVoiceNames(filterProj).has('prom.wav'));
assert.ok(shotLinkedVoiceNames(filterProj).has('linked-rej.wav'));

const libraryOnly = listVoiceTakes(filterProj, 'library');
assert.equal(libraryOnly.length, 2);
assert.equal(libraryOnly[0].id, newerLib.id);
assert.equal(libraryOnly[1].id, olderLib.id);

const allListed = listVoiceTakes(filterProj, 'all');
assert.equal(allListed[0].status, 'library');
assert.ok(allListed.findIndex(t => t.status === 'library') < allListed.findIndex(t => t.status === 'promoted'));
assert.ok(allListed.findIndex(t => t.status === 'promoted') < allListed.findIndex(t => t.status === 'rejected'));

const summary = summarizeVoiceTakes(filterProj);
assert.deepEqual(
  {total: summary.total, library: summary.library, promoted: summary.promoted, rejected: summary.rejected, decided: summary.decided, linkedRejected: summary.linkedRejected, linkedPromoted: summary.linkedPromoted, linkedDecided: summary.linkedDecided},
  {total: 5, library: 2, promoted: 1, rejected: 2, decided: 3, linkedRejected: 1, linkedPromoted: 1, linkedDecided: 2},
);
assert.equal(clearableRejectedVoiceTakeCount(summary), 1);
assert.equal(clearableDecidedVoiceTakeCount(summary), 1); // decided 3 - linkedDecided 2 (prom on shot + linked rej)

const removed = clearRejectedVoiceTakes(filterProj);
assert.equal(removed, 1); // unlinked rejected only
assert.equal(findVoiceTake(filterProj, rejectedTake.id), null);
assert.ok(findVoiceTake(filterProj, linkedRejected.id)); // linked rejected kept
assert.equal(findVoiceTake(filterProj, linkedRejected.id).status, 'rejected');
assert.ok(findVoiceTake(filterProj, promotedTake.id)); // promoted kept
assert.equal(filterProj.voiceTakes.length, 4);
validateProject(filterProj);
assert.equal(clearRejectedVoiceTakes(filterProj), 0);
assert.equal(clearableRejectedVoiceTakeCount(summarizeVoiceTakes(filterProj)), 0);

// clearDecided keeps library + any linked decided (promoted on shot + linked rejected)
const decidedProj = newProject();
decidedProj.scenes[0].shots = [{id: 's1', title: 'S', seconds: 3, action: ''}];
const keepLib = buildVoiceTake({
  engine: 'kokoro', resultText: 'keep', jobId: 'cd-lib',
  audio: {name: 'cd-lib.wav', subfolder: 'studio-voices', type: 'input'},
});
const dropProm = buildVoiceTake({
  engine: 'kokoro', resultText: 'drop prom', jobId: 'cd-prom',
  audio: {name: 'cd-prom.wav', subfolder: 'studio-voices', type: 'input'},
});
const keepProm = buildVoiceTake({
  engine: 'kokoro', resultText: 'keep prom', jobId: 'cd-keep-prom',
  audio: {name: 'cd-keep-prom.wav', subfolder: 'studio-voices', type: 'input'},
});
const dropRej = buildVoiceTake({
  engine: 'kokoro', resultText: 'drop rej', jobId: 'cd-rej',
  audio: {name: 'cd-rej.wav', subfolder: 'studio-voices', type: 'input'},
});
recordVoiceTake(decidedProj, keepLib);
recordVoiceTake(decidedProj, dropProm);
setVoiceTakeStatus(decidedProj, dropProm.id, 'promoted'); // promoted but NOT linked
recordVoiceTake(decidedProj, keepProm);
promoteVoiceTake(decidedProj, keepProm.id, 's1'); // linked
recordVoiceTake(decidedProj, dropRej);
setVoiceTakeStatus(decidedProj, dropRej.id, 'rejected');
const clearedDecided = clearDecidedVoiceTakes(decidedProj);
assert.equal(clearedDecided, 2); // dropProm + dropRej
assert.equal(decidedProj.voiceTakes.length, 2);
assert.ok(decidedProj.voiceTakes.some(t => t.id === keepLib.id));
assert.ok(decidedProj.voiceTakes.some(t => t.id === keepProm.id));
validateProject(decidedProj);
assert.equal(clearableDecidedVoiceTakeCount(summarizeVoiceTakes(decidedProj)), 0);
assert.equal(clearDecidedVoiceTakes(decidedProj), 0);

// UI wiring: Clear decided + disabled Clear buttons (draft-inbox parity)
const assistantSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../simple-editor/director-assistant.js'), 'utf8');
assert.ok(assistantSrc.includes('data-clear-decided-takes'), 'Clear decided takes button missing');
assert.ok(assistantSrc.includes('data-clear-rejected-takes'), 'Clear rejected takes button missing');
assert.ok(assistantSrc.includes('clearDecidedVoiceTakes'), 'Clear decided handler not wired');
assert.ok(assistantSrc.includes('clearableRejectedVoiceTakeCount'), 'Clear rejected disabled-state helper missing');
assert.ok(assistantSrc.includes('clearableDecidedVoiceTakeCount'), 'Clear decided disabled-state helper missing');
assert.ok(assistantSrc.includes('clearRej.disabled=!clearableRej'), 'Clear rejected disabled sync missing');
assert.ok(assistantSrc.includes('clearDec.disabled=!clearableDec'), 'Clear decided disabled sync missing');

// Duplicate take: same audio asset, new id + meta (no re-upload); status resets to library
const dupSrc = buildVoiceTake({
  engine: 'kokoro',
  voice: 'af_heart',
  model: 'kokoro',
  request: 'Line one.',
  resultText: 'Line one.',
  targetShotId: 'shot-dup',
  sceneId: 'scene-dup',
  jobId: 'job-dup-src',
  audio: {name: 'kokoro-dup-shared.wav', subfolder: 'studio-voices', type: 'input'},
  seconds: 1.4,
  speed: 0.95,
  label: 'Mira open',
  note: 'Keep for alt delivery notes',
  status: 'library',
});
const dupProj = newProject();
dupProj.scenes[0].id = 'scene-dup';
dupProj.scenes[0].shots = [{id: 'shot-dup', title: 'Dup', seconds: 4, action: '', dialogue: ''}];
recordVoiceTake(dupProj, dupSrc);
promoteVoiceTake(dupProj, dupSrc.id, 'shot-dup');
assert.equal(findVoiceTake(dupProj, dupSrc.id).status, 'promoted');
assert.equal(defaultDuplicateVoiceTakeLabel(findVoiceTake(dupProj, dupSrc.id)), 'Mira open (copy)');
assert.equal(defaultDuplicateVoiceTakeLabel({voice: 'bm_george'}), 'bm_george (copy)');
assert.equal(defaultDuplicateVoiceTakeLabel({engine: 'chatterbox'}), 'chatterbox (copy)');
assert.equal(defaultDuplicateVoiceTakeLabel({}), 'Take (copy)');
assert.equal(defaultDuplicateVoiceTakeLabel({label: 'x'.repeat(MAX_TAKE_LABEL)}).length, MAX_TAKE_LABEL);
assert.match(defaultDuplicateVoiceTakeLabel({label: 'Already (copy)'}), /Already \(copy\)$/);

const copy = duplicateVoiceTake(dupProj, dupSrc.id);
assert.notEqual(copy.id, dupSrc.id);
assert.equal(copy.audio.name, 'kokoro-dup-shared.wav');
assert.equal(copy.audio.subfolder, 'studio-voices');
assert.equal(copy.status, 'library');
assert.equal(copy.promotedAt, undefined);
assert.equal(copy.rejectedAt, undefined);
assert.equal(copy.jobId, undefined); // must not share jobId (upsert collision)
assert.equal(copy.label, 'Mira open (copy)');
assert.equal(copy.note, 'Keep for alt delivery notes');
assert.equal(copy.resultText, 'Line one.');
assert.equal(copy.engine, 'kokoro');
assert.equal(copy.voice, 'af_heart');
assert.equal(copy.targetShotId, 'shot-dup');
assert.equal(copy.seconds, 1.4);
assert.equal(copy.speed, 0.95);
assert.equal(findVoiceTake(dupProj, dupSrc.id).status, 'promoted'); // source unchanged
assert.equal(dupProj.voiceTakes.filter(t => (t.audio?.name || t.audio?.filename) === 'kokoro-dup-shared.wav').length, 2);
assert.equal(dupProj.voiceTakes[0].id, copy.id); // newest first
validateProject(dupProj);

const labeledCopy = duplicateVoiceTake(dupProj, copy.id, {label: 'Mira open alt', note: 'Different note'});
assert.equal(labeledCopy.label, 'Mira open alt');
assert.equal(labeledCopy.note, 'Different note');
assert.equal(labeledCopy.audio.name, 'kokoro-dup-shared.wav');

const clearNote = duplicateVoiceTake(dupProj, dupSrc.id, {note: ''});
assert.equal(clearNote.note, undefined);

assert.throws(() => duplicateVoiceTake(dupProj, 'missing-take-id'), /no longer/);

// Keep-names still only list the shared file once
const keepDup = collectVoiceKeepNames([dupProj]);
assert.equal(keepDup.filter(n => n === 'kokoro-dup-shared.wav').length, 1);


console.log('Voice take library checks passed: record, promote, reject, jobId upsert, prune, keep-names, orphan filter/link, discard confirm/summary, cross-episode keep-ref notes, label/note rename, duplicate (shared audio / new id / library status), status filter, library-first, clear rejected + linked-shot safety, clear decided + clearable counts, Clear decided UI + disabled Clear buttons, validate, reload.');
