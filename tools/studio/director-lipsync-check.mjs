import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  validateLipSync,
  insertMouthCue,
  removeMouthCue,
  replaceMouthCue,
  nudgeMouthCueEdge,
  setMouthCueEdge,
  mouthAt,
  lipSyncEndSeconds,
  firstSpeechCueStart,
  shiftMouthCues,
  fitMouthCuesToDuration,
  speechOnsetFromPeaks,
  alignMouthCuesToOnset,
  mouthCueScrubModel,
  mouthPeakOnsetModel,
  mouthPlayheadModel,
  featureKeysFromMouthCues,
  resolveVoiceAudioSeconds,
  MOUTH_SHAPE_TO_FEATURE,
  FEATURE_TO_MOUTH_SHAPE,
  MOUTH_MAP_KEYS,
  MOUTH_MAP_ROWS,
  validateMouthMap,
  resolveActiveMouth,
  detectMouthMapFromMorphNames,
  applyDetectedMouthMap,
  clearableMouthMapCount,
  applyLipSyncDrawingGate,
  applyLipSyncFaceGate,
  faceWithMouth,
  queueFaceSeek,
  peekPendingFaceSeek,
  takePendingFaceSeek,
  clearPendingFaceSeek,
} from '../../simple-editor/director-lipsync.js';
import {validateFeatures, MOUTH_STYLES} from '../../simple-editor/director-features.js';
import {sampleChannel, validateRig3D} from '../../simple-editor/director-3d-state.js';

const base = {
  mouthCues: [
    {start: 0, end: 0.2, value: 'X'},
    {start: 0.2, end: 0.5, value: 'B'},
    {start: 0.5, end: 0.8, value: 'C'},
    {start: 0.8, end: 1.0, value: 'X'},
  ],
  duration: 1,
};

validateLipSync(base);
assert.equal(mouthAt(base, 0.3), 'B');
assert.equal(lipSyncEndSeconds(base), 1);
assert.equal(firstSpeechCueStart(base), 0.2);

const shifted = shiftMouthCues(base, 0.1);
assert.equal(shifted.mouthCues[0].start, 0.1);
assert.equal(shifted.mouthCues[1].start, 0.3);
assert.equal(shifted.offsetSec, 0.1);
assert.throws(() => shiftMouthCues(base, -0.5), /before 0s/);

const fitted = fitMouthCuesToDuration(base, 2);
assert.equal(fitted.duration, 2);
assert.equal(lipSyncEndSeconds(fitted), 2);
assert.ok(Math.abs(fitted.mouthCues[1].start - 0.4) < 1e-6);

const emptyFit = fitMouthCuesToDuration({mouthCues: []}, 1.5);
assert.equal(emptyFit.mouthCues[0].value, 'X');
assert.equal(emptyFit.mouthCues[0].end, 1.5);

const peaks = Array(100).fill(0.01);
for (let i = 40; i < 70; i++) peaks[i] = 0.8;
const onset = speechOnsetFromPeaks(peaks, 10);
assert.ok(onset >= 3.9 && onset <= 4.1, 'onset=' + onset);
assert.equal(speechOnsetFromPeaks(Array(20).fill(0), 5), 0);

const aligned = alignMouthCuesToOnset(base, 0.5);
assert.ok(Math.abs(firstSpeechCueStart(aligned) - 0.5) < 1e-6);

const scrub = mouthCueScrubModel(base, {fps: 24, lastFrame: 23});
assert.equal(scrub.spans.length, 4);
assert.equal(scrub.marks[1].value, 'B');
assert.ok(scrub.spans[1].start >= 4 && scrub.spans[1].start <= 6);

const withCue = insertMouthCue({mouthCues: [{start: 0, end: 0.2, value: 'X'}]}, {start: 0.2, end: 0.4, value: 'A'});
assert.equal(withCue.mouthCues.length, 2);
const dropped = removeMouthCue(withCue, 0.2);
assert.equal(dropped.mouthCues.length, 1);

const replaced = replaceMouthCue(base, 0.2, {value: 'A', start: 0.2, end: 0.5});
assert.equal(replaced.mouthCues[1].value, 'A');
assert.equal(replaced.mouthCues[1].start, 0.2);
assert.equal(replaced.mouthCues[1].end, 0.5);
const reshaped = replaceMouthCue(base, 0.5, {value: 'H'});
assert.equal(reshaped.mouthCues[2].value, 'H');
assert.equal(reshaped.mouthCues[2].start, 0.5);
assert.equal(reshaped.mouthCues[2].end, 0.8);
assert.throws(() => replaceMouthCue(base, 0.33, {value: 'B'}), /No mouth cue/);
assert.throws(() => replaceMouthCue(base, 0.2, {start: 0.6, end: 0.7, value: 'A'}), /ordered/);

const nudgedEnd = nudgeMouthCueEdge(base, 0.2, 'end', 1/24);
assert.ok(Math.abs(nudgedEnd.mouthCues[1].end - (0.5 + 1/24)) < 1e-6);
assert.ok(Math.abs(nudgedEnd.mouthCues[2].start - (0.5 + 1/24)) < 1e-6, 'abutting next start must move');
assert.equal(nudgedEnd.mouthCues[2].end, 0.8);
const nudgedStart = nudgeMouthCueEdge(base, 0.5, 'start', -1/24);
assert.ok(Math.abs(nudgedStart.mouthCues[2].start - (0.5 - 1/24)) < 1e-6);
assert.ok(Math.abs(nudgedStart.mouthCues[1].end - (0.5 - 1/24)) < 1e-6, 'abutting prev end must move');
const gapped = {
  mouthCues: [
    {start: 0, end: 0.2, value: 'X'},
    {start: 0.4, end: 0.6, value: 'B'},
  ],
};
const gapNudge = nudgeMouthCueEdge(gapped, 0.4, 'start', -0.1);
assert.ok(Math.abs(gapNudge.mouthCues[1].start - 0.3) < 1e-6);
assert.equal(gapNudge.mouthCues[0].end, 0.2, 'non-abutting prev stays put');
assert.throws(() => nudgeMouthCueEdge(base, 0.2, 'middle', 0.1), /Edge must be/);
assert.throws(() => nudgeMouthCueEdge(base, 9, 'end', 0.1), /No mouth cue/);

const setEdge = setMouthCueEdge(base, 0.2, 'end', 0.55);
assert.ok(Math.abs(setEdge.sync.mouthCues[1].end - 0.55) < 1e-6);
assert.ok(Math.abs(setEdge.sync.mouthCues[2].start - 0.55) < 1e-6);
assert.equal(setEdge.atStart, 0.2);
const setStart = setMouthCueEdge(base, 0.5, 'start', 0.35);
assert.ok(Math.abs(setStart.sync.mouthCues[2].start - 0.35) < 1e-6);
assert.ok(Math.abs(setStart.atStart - 0.35) < 1e-6);


const mouthBase = {
  style: 'line', color: '#8d3a3a', scale: 1, spread: 1, height: 0.1, depth: 0.22, linked: true,
};
const rig = {
  version: 1,
  model: null,
  names: ['head'],
  pose: [[0, 0, 0]],
  keys: [],
  features: {
    eyes: {style: 'round', color: '#112233', scale: 1, spread: 0.1, height: 0.08, depth: 0.22, linked: true},
    ears: {style: 'round', color: '#f6c28b', scale: 1, spread: 0.26, height: 0.02, depth: 0, linked: true},
    mouth: {...mouthBase},
    brows: {style: 'straight', color: '#3a2a24', scale: 1, spread: 0.1, height: 0.4, depth: 0.2, linked: true},
  },
  featureKeys: [{frame: 12, eyes: {style: 'round', color: '#112233', scale: 1.2, spread: 0.1, height: 0.08, depth: 0.22, linked: true}}],
};
const keyed = featureKeysFromMouthCues(rig, base, {fps: 24, lastFrame: 47});
validateFeatures(keyed);
const styles = keyed.featureKeys.map(k => k.mouth?.style).filter(Boolean);
assert.ok(styles.includes('smile'));
assert.ok(styles.includes('open'));
assert.ok(styles.includes('line'));
assert.ok(keyed.featureKeys.some(k => k.frame === 12 && k.eyes?.scale === 1.2));
assert.equal(MOUTH_SHAPE_TO_FEATURE.X, 'line');
assert.equal(MOUTH_SHAPE_TO_FEATURE.A, 'closed');
assert.equal(MOUTH_SHAPE_TO_FEATURE.C, 'open');
assert.equal(MOUTH_SHAPE_TO_FEATURE.D, 'wide');
assert.equal(MOUTH_SHAPE_TO_FEATURE.E, 'round');
assert.equal(MOUTH_SHAPE_TO_FEATURE.F, 'bite');
assert.equal(MOUTH_SHAPE_TO_FEATURE.G, 'teeth');
assert.equal(MOUTH_SHAPE_TO_FEATURE.H, 'pucker');
assert.equal(FEATURE_TO_MOUTH_SHAPE.closed, 'A');
assert.equal(FEATURE_TO_MOUTH_SHAPE.frown, undefined);
assert.ok(MOUTH_MAP_KEYS.includes('closed'));
assert.ok(MOUTH_MAP_KEYS.includes('A'));
assert.equal(MOUTH_MAP_ROWS.length, MOUTH_STYLES.length);

const denseCues = {
  mouthCues: [
    {start: 0, end: 0.1, value: 'X'},
    {start: 0.1, end: 0.2, value: 'A'},
    {start: 0.2, end: 0.3, value: 'B'},
    {start: 0.3, end: 0.4, value: 'C'},
    {start: 0.4, end: 0.5, value: 'D'},
    {start: 0.5, end: 0.6, value: 'E'},
    {start: 0.6, end: 0.7, value: 'F'},
    {start: 0.7, end: 0.8, value: 'G'},
    {start: 0.8, end: 0.9, value: 'H'},
    {start: 0.9, end: 1.0, value: 'X'},
  ],
};
const denseKeyed = featureKeysFromMouthCues(rig, denseCues, {fps: 24, lastFrame: 47});
validateFeatures(denseKeyed);
const denseStyles = denseKeyed.featureKeys.map(k => k.mouth?.style).filter(Boolean);
for (const style of ['line', 'closed', 'smile', 'open', 'wide', 'round', 'bite', 'teeth', 'pucker']) {
  assert.ok(denseStyles.includes(style), 'missing Face mouth style ' + style);
}
const mapped = Object.values(MOUTH_SHAPE_TO_FEATURE);
assert.equal(new Set(mapped).size, mapped.length, 'each Rhubarb cue needs its own Face mouth style');

const shot = {
  audio: {name: 'kokoro-aaa.wav', subfolder: 'studio-voices', type: 'input'},
  lipSync: {mouthCues: base.mouthCues},
};
assert.equal(
  resolveVoiceAudioSeconds(shot, [{audio: {name: 'kokoro-aaa.wav'}, seconds: 3.25}]),
  3.25,
);
assert.equal(resolveVoiceAudioSeconds({lipSync: {mouthCues: base.mouthCues, duration: 9}}, []), 9);
assert.equal(resolveVoiceAudioSeconds({lipSync: base}, []), 1);

assert.throws(() => validateLipSync({mouthCues: [{start: 0.2, end: 0.1, value: 'A'}]}), /ordered/);
assert.throws(() => fitMouthCuesToDuration(base, 0), /Duration/);
assert.throws(() => featureKeysFromMouthCues({features: {}}, base), /Face mouth/);

const peakModel = mouthPeakOnsetModel(peaks, 10, {bins: 50});
assert.equal(peakModel.bins, 50);
assert.equal(peakModel.peaks.length, 50);
assert.ok(peakModel.onsetSec >= 3.9 && peakModel.onsetSec <= 4.1, 'peakModel.onset=' + peakModel.onsetSec);
assert.ok(peakModel.onsetRatio >= 0.39 && peakModel.onsetRatio <= 0.41);
const forced = mouthPeakOnsetModel(peaks, 10, {onsetSec: 1.25, bins: 32});
assert.equal(forced.onsetSec, 1.25);
assert.ok(Math.abs(forced.onsetRatio - 0.125) < 1e-6);
assert.throws(() => mouthPeakOnsetModel([], 1), /Peaks are required/);
assert.throws(() => mouthPeakOnsetModel(peaks, 0), /Duration/);

const ph = mouthPlayheadModel(12, {fps: 24, lastFrame: 23, durationSec: 1});
assert.equal(ph.frame, 12);
assert.equal(ph.last, 23);
assert.ok(Math.abs(ph.seconds - 0.5) < 1e-6);
assert.ok(Math.abs(ph.mouthRatio - 12 / 23) < 1e-6);
assert.ok(Math.abs(ph.peakRatio - 0.5) < 1e-6);
const clamped = mouthPlayheadModel(999, {fps: 24, lastFrame: 47});
assert.equal(clamped.frame, 47);
assert.equal(clamped.mouthRatio, 1);
assert.throws(() => mouthPlayheadModel(0, {fps: 0}), /fps/);

assert.equal(peekPendingFaceSeek('shot-a'), null);
assert.equal(queueFaceSeek('shot-a', 12.4), 12);
assert.equal(peekPendingFaceSeek('shot-a'), 12);
assert.equal(queueFaceSeek('shot-a', 24), 24);
assert.equal(takePendingFaceSeek('shot-a'), 24);
assert.equal(peekPendingFaceSeek('shot-a'), null);
assert.equal(takePendingFaceSeek('shot-a'), null);
queueFaceSeek('shot-b', 3);
assert.equal(clearPendingFaceSeek('shot-b'), true);
assert.equal(peekPendingFaceSeek('shot-b'), null);
assert.throws(() => queueFaceSeek('', 1), /shotId/);
assert.throws(() => queueFaceSeek('shot-c', -1), /frame/);
assert.throws(() => queueFaceSeek('shot-c', Number.NaN), /frame/);

// --- mouthMap morph-bridge ---
validateMouthMap({mouthMap: {closed: 0, A: 0, wide: 2, frown: 9}});
assert.throws(() => validateMouthMap({mouthMap: {nope: 0}}), /Invalid 3D mouth mapping/);
assert.throws(() => validateMouthMap({mouthMap: {closed: -1}}), /Invalid 3D mouth mapping/);
validateRig3D({version: 1, model: null, names: ['head'], pose: [[0, 0, 0]], keys: [], mouthMap: {closed: 0, smile: 1}});

const sync = {mouthCues: [{start: 0, end: 0.5, value: 'A'}, {start: 0.5, end: 1, value: 'D'}]};
assert.deepEqual(faceWithMouth({lipSync: sync, mouthMap: {A: 0, D: 1}}, 18, [0.2, 0.2]), [0, 1]);
assert.deepEqual(faceWithMouth({lipSync: sync, mouthMap: {closed: 0, wide: 1}}, 18, [0.2, 0.2]), [0, 1]);
assert.deepEqual(sampleChannel({keys: [], face: [0, 0], lipSync: sync, mouthMap: {closed: 0, wide: 1}}, 18, 'face', [0, 0]), [0, 1]);

const featureRig = {
  version: 1,
  model: null,
  names: ['head'],
  pose: [[0, 0, 0]],
  keys: [],
  face: [0, 0, 0, 0],
  mouthMap: {closed: 1, wide: 3, A: 1, D: 3},
  features: {
    eyes: rig.features.eyes,
    ears: rig.features.ears,
    mouth: {...mouthBase, style: 'closed'},
    brows: rig.features.brows,
  },
  featureKeys: [
    {frame: 0, mouth: {...mouthBase, style: 'closed'}},
    {frame: 24, mouth: {...mouthBase, style: 'wide'}},
  ],
};
assert.deepEqual(resolveActiveMouth(featureRig, 0), {letter: 'A', style: 'closed'});
assert.deepEqual(resolveActiveMouth(featureRig, 24), {letter: 'D', style: 'wide'});
assert.deepEqual(faceWithMouth(featureRig, 0, [0, 0, 0, 0]), [0, 1, 0, 0]);
assert.deepEqual(faceWithMouth(featureRig, 24, [0, 0, 0, 0]), [0, 0, 0, 1]);
assert.deepEqual(sampleChannel(featureRig, 0, 'face', [0, 0, 0, 0]), [0, 1, 0, 0]);
assert.deepEqual(sampleChannel(featureRig, 24, 'face', [0, 0, 0, 0]), [0, 0, 0, 1]);

const names = [
  'Head ? mouth_rest',
  'Head ? mouth_closed',
  'Head ? smile',
  'Head ? mouthOpen',
  'Head ? wide',
  'Head ? viseme_oh',
  'Head ? bite',
  'Head ? teeth',
  'Head ? pucker',
  'Head ? frown',
];
const detected = detectMouthMapFromMorphNames(names);
assert.equal(detected.line, 0);
assert.equal(detected.X, 0);
assert.equal(detected.closed, 1);
assert.equal(detected.A, 1);
assert.equal(detected.open, 3);
assert.equal(detected.frown, 9);
const merged = applyDetectedMouthMap({mouthMap: {smile: 99}}, names, {replace: false});
assert.equal(merged.mouthMap.smile, 2);
assert.throws(() => detectMouthMapFromMorphNames('nope'), /Morph names/);
assert.throws(() => applyDetectedMouthMap({}, ['bone.position'], {replace: true}), /heuristics/);



// --- Write Face mouth-key rewrite hygiene (replace mouth channel) ---
{
  const longCues = {
    mouthCues: [
      {start: 0, end: 0.2, value: 'X'},
      {start: 0.2, end: 0.5, value: 'B'},
      {start: 0.5, end: 0.8, value: 'C'},
      {start: 0.8, end: 1.5, value: 'D'},
      {start: 1.5, end: 2.0, value: 'X'},
    ],
    duration: 2,
  };
  const hygieneRig = {
    ...rig,
    featureKeys: [{
      frame: 12,
      eyes: {style: 'round', color: '#112233', scale: 1.2, spread: 0.1, height: 0.08, depth: 0.22, linked: true},
      ears: structuredClone(rig.features.ears),
      mouth: structuredClone(rig.features.mouth),
      brows: structuredClone(rig.features.brows),
    }],
  };
  const firstWrite = featureKeysFromMouthCues(hygieneRig, longCues, {fps: 24, lastFrame: 47});
  validateFeatures(firstWrite);
  const firstFrames = firstWrite.featureKeys.map(k => k.frame);
  assert.ok(firstFrames.some(f => f >= 19), 'long write should place a mouth key near/after 0.8s');
  assert.ok(firstWrite.featureKeys.some(k => k.frame === 12 && k.eyes?.scale === 1.2), 'eye key survives first write');

  // Fit cues shorter; re-Write must clear mouth-only orphans outside the new cue set.
  const shortCues = fitMouthCuesToDuration(longCues, 1);
  assert.equal(shortCues.duration, 1);
  const withPast = {
    ...firstWrite,
    featureKeys: [
      ...firstWrite.featureKeys,
      {
        frame: 60,
        eyes: structuredClone(rig.features.eyes),
        ears: structuredClone(rig.features.ears),
        mouth: {...structuredClone(rig.features.mouth), style: 'wide'},
        brows: structuredClone(rig.features.brows),
      },
    ],
  };
  const summary = {};
  const rewritten = featureKeysFromMouthCues(withPast, shortCues, {fps: 24, lastFrame: 23, summary});
  validateFeatures(rewritten);
  assert.ok(summary.written >= 2, 'summary.written=' + summary.written);
  assert.ok(summary.cleared >= 1, 'expected stale mouth keys cleared, cleared=' + summary.cleared);
  assert.ok(rewritten.featureKeys.every(k => k.frame <= 23), 'no keys past lastFrame');
  assert.ok(rewritten.featureKeys.some(k => k.frame === 12 && k.eyes?.scale === 1.2), 'preserve non-mouth eye key');
  assert.ok(!rewritten.featureKeys.some(k => k.frame === 60), 'key past lastFrame cleared');

  // Cue edit that drops late speech: re-Write must not leave late wide orphans from firstWrite.
  const editedCues = {
    mouthCues: [
      {start: 0, end: 0.3, value: 'X'},
      {start: 0.3, end: 0.6, value: 'B'},
      {start: 0.6, end: 1.0, value: 'X'},
    ],
    duration: 1,
  };
  const afterEdit = featureKeysFromMouthCues(firstWrite, editedCues, {fps: 24, lastFrame: 47});
  validateFeatures(afterEdit);
  const lateWide = afterEdit.featureKeys.filter(k => k.frame >= 20 && k.mouth?.style === 'wide');
  assert.equal(lateWide.length, 0, 'cue-edit re-Write left late wide orphans at ' + lateWide.map(k => k.frame));
  // Mouth-only frames from firstWrite that are not in the new write must be gone.
  const editSummary = {};
  featureKeysFromMouthCues({...rig, featureKeys: []}, editedCues, {fps: 24, lastFrame: 47, summary: editSummary});
  const newMouthFrames = new Set(
    featureKeysFromMouthCues({...rig, featureKeys: []}, editedCues, {fps: 24, lastFrame: 47}).featureKeys.map(k => k.frame),
  );
  for (const key of afterEdit.featureKeys) {
    if (key.frame === 12) continue;
    if (!newMouthFrames.has(key.frame)) {
      assert.fail('orphan mouth key survived cue-edit re-Write at frame ' + key.frame);
    }
  }
}


// Clear mouth morph map disabled-when-empty (Clear unsaved marks / Clear motion guides parity)
{
  assert.equal(clearableMouthMapCount(null), 0);
  assert.equal(clearableMouthMapCount(undefined), 0);
  assert.equal(clearableMouthMapCount({}), 0);
  assert.equal(clearableMouthMapCount({mouthMap: null}), 0);
  assert.equal(clearableMouthMapCount({mouthMap: []}), 0);
  assert.equal(clearableMouthMapCount({mouthMap: {}}), 0);
  assert.equal(clearableMouthMapCount({mouthMap: {closed: 0}}), 1);
  assert.equal(clearableMouthMapCount({mouthMap: {closed: 0, A: 0, wide: 2}}), 3);
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const srcUi = readFileSync(join(rootDir, 'simple-editor/director-lipsync.js'), 'utf8');
  assert.match(srcUi, /clearableMouthMapCount/);
  assert.match(srcUi, /syncClearMouthMapButton/);
  assert.match(srcUi, /Clear mouth morph map/);
  assert.ok(srcUi.includes('clear.disabled=!clearable'), 'Clear mouth morph map disabled sync');
  assert.ok(srcUi.includes("No mouth morph map entries to clear"), 'empty Clear title / status');
  assert.ok(srcUi.includes('clearableMouthMapCount(typeof getRig'), 'Clear button uses clearable count');
  console.log('Clear mouth morph map disabled-when-empty: clearable count + UI wiring.');
}

// Apply cues to drawing mouth layers / Apply cues to 3D face
{
  const mouthLayers = (...shapes) => ({layers: shapes.map(shape => ({name: 'Mouth ' + shape}))});
  const cues = (...values) => ({mouthCues: values.map((value, index) => ({start: index * 0.2, end: index * 0.2 + 0.2, value}))});
  assert.equal(applyLipSyncDrawingGate({}).ok, false);
  assert.equal(applyLipSyncDrawingGate({lipSync: cues('B'), drawing: mouthLayers('X')}).ok, false);
  assert.match(applyLipSyncDrawingGate({lipSync: cues('B'), drawing: mouthLayers('X')}).reason, /Mouth B/);
  assert.equal(applyLipSyncDrawingGate({lipSync: cues('B'), drawing: mouthLayers('X', 'B')}).ok, true);
  assert.equal(applyLipSyncFaceGate({}).ok, false);
  assert.equal(applyLipSyncFaceGate({lipSync: cues('B'), rig3d: {}}).ok, false);
  assert.match(applyLipSyncFaceGate({lipSync: cues('B'), rig3d: {face: [0], mouthMap: {}}}).reason, /Map mouth B/);
  assert.match(applyLipSyncFaceGate({lipSync: cues('A', 'B'), rig3d: {face: [0, 0], mouthMap: {A: 0, smile: 0}}}).reason, /distinct/);
  assert.equal(applyLipSyncFaceGate({lipSync: cues('A', 'B'), rig3d: {face: [0, 0], mouthMap: {A: 0, smile: 1}}}).ok, true);
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const srcUi = readFileSync(join(rootDir, 'simple-editor/director-lipsync.js'), 'utf8');
  assert.match(srcUi, /applyLipSyncDrawingGate/);
  assert.match(srcUi, /applyLipSyncFaceGate/);
  assert.match(srcUi, /Apply cues to drawing mouth layers/);
  assert.match(srcUi, /Apply cues to 3D face/);
  assert.ok(srcUi.includes('applyDrawingBtn.disabled=!drawingGate.ok'), 'drawing apply gate disables the button');
  assert.ok(srcUi.includes('applyFaceBtn.disabled=!faceGate.ok'), 'face apply gate disables the button');
  console.log('Apply cues to drawing mouth layers and Apply cues to 3D face: gate reasons + UI wiring.');
}
console.log('Lip-sync timing passed: shift, fit-to-duration, peak onset, align, scrub markers, live peak model, mouth/Face playhead map, denser Face mouth keys, mouthMap morph-bridge, voice duration resolve, Face seek queue, replace selected cue, shared-boundary edge nudge, Write Face mouth-key rewrite hygiene, Apply cues to drawing mouth layers, Apply cues to 3D face.');
