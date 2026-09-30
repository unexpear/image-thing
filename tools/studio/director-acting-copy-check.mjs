import assert from 'node:assert/strict';
import {
  validateRig3D,
  shotHasActing,
  listActingSources,
  copyActingFromShot,
  remapSpanTimes,
  remapCameraKeyTimes,
} from '../../simple-editor/director-3d-state.js';

const names = ['root', 'spine', 'head'];
const pose = names.map(() => [0, 0, 0]);
const face = [0, 0.2, 0];
const baseRig = () => ({ version: 1, model: null, names: [...names], pose: structuredClone(pose), keys: [], face: [...face] });

// Empty shot has no acting.
assert.equal(shotHasActing({ rig3d: baseRig() }), false);

const bodySource = baseRig();
bodySource.keys = [
  { frame: 0, easing: 'smooth', pose: structuredClone(pose), root: [0, 0, 0] },
  { frame: 23, easing: 'smooth', pose: names.map(() => [10, 0, 0]), root: [1, 0, 0] },
];
bodySource.contacts = [{ id: 'c1', joint: 0, start: 0, end: 10, target: [0, 0, 0], orientation: [0, 0, 0, 1] }];
bodySource.channels = [{ id: 'root:0', keys: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 23, value: 2, easing: 'linear' }] }];
assert.equal(shotHasActing({ rig3d: bodySource }), true);

const faceSource = baseRig();
faceSource.faceKeys = [
  { frame: 0, easing: 'smooth', face: [0, 0, 0] },
  { frame: 12, easing: 'linear', face: [1, 0.5, 0] },
];
faceSource.featureKeys = [{ frame: 6, mouth: { style: 'smile', color: '#ffaa00', scale: 1, spread: 0.2, height: 0, depth: 0 } }];
faceSource.features = { mouth: { style: 'smile', color: '#ffaa00', scale: 1, spread: 0.2, height: 0, depth: 0 } };
faceSource.eyeTracks = [{ id: 'e1', joint: 2, axis: '+Z', start: 0, end: 20, target: [0, 1, 2] }];
faceSource.eyesLinked = true;
assert.equal(shotHasActing({ rig3d: faceSource }), true);

const allSource = structuredClone(bodySource);
Object.assign(allSource, {
  faceKeys: structuredClone(faceSource.faceKeys),
  featureKeys: structuredClone(faceSource.featureKeys),
  features: structuredClone(faceSource.features),
  eyeTracks: structuredClone(faceSource.eyeTracks),
  eyesLinked: true,
  channels: [
    ...bodySource.channels,
    { id: 'face:0', keys: [{ frame: 0, value: 0, easing: 'linear' }, { frame: 12, value: 1, easing: 'linear' }] },
  ],
});
validateRig3D(allSource);

const project = {
  scenes: [{
    id: 'sc1', title: 'Act 1',
    shots: [
      { id: 'a', title: 'Take A', seconds: 2, rig3d: allSource },
      { id: 'b', title: 'Take B', seconds: 4, rig3d: baseRig() },
      { id: 'c', title: 'Empty', seconds: 2, rig3d: baseRig() },
      { id: 'd', title: 'Cam only', seconds: 2, rig3d: { ...baseRig(), camera: { position: [0, 1, 5], target: [0, 1, 0] } } },
    ],
  }],
};
const sources = listActingSources(project, 'b');
assert.equal(sources.length, 1);
assert.equal(sources[0].id, 'a');
assert.ok(sources[0].hasBody && sources[0].hasFace);
assert.ok(sources[0].label.includes('Take A'));
assert.deepEqual(listActingSources(project, 'a').map(s => s.id), []); // only a has acting; exclude a
assert.equal(listActingSources(project, 'c').length, 1);

// Body-only copy keeps face side, replaces body.
const bodyTarget = baseRig();
bodyTarget.faceKeys = [{ frame: 3, easing: 'smooth', face: [0.1, 0, 0] }];
bodyTarget.camera = { position: [9, 9, 9], target: [0, 1, 0] };
bodyTarget.cameraKeys = [{ frame: 1, position: [9, 9, 9], target: [0, 1, 0] }];
const bodySummary = copyActingFromShot(bodyTarget, allSource, 'body', { timeMode: 'absolute', sourceSeconds: 2, targetSeconds: 4 });
assert.equal(bodySummary.mode, 'body');
assert.equal(bodySummary.bodyKeyCount, 2);
assert.equal(bodySummary.contactCount, 1);
assert.equal(bodySummary.bodyChannelCount, 1);
assert.equal(bodySummary.faceKeyCount, 0);
assert.deepEqual(bodyTarget.keys, allSource.keys);
assert.deepEqual(bodyTarget.contacts, allSource.contacts);
assert.deepEqual(bodyTarget.faceKeys, [{ frame: 3, easing: 'smooth', face: [0.1, 0, 0] }]); // kept
assert.deepEqual(bodyTarget.camera, { position: [9, 9, 9], target: [0, 1, 0] }); // camera untouched
assert.ok(bodyTarget.channels.every(c => !String(c.id).startsWith('face:') || false));
assert.equal(bodyTarget.channels.filter(c => c.id.startsWith('face:')).length, 0);
assert.equal(bodyTarget.channels.some(c => c.id === 'root:0'), true);
validateRig3D(bodyTarget);

// Face-only copy keeps body keys, replaces face.
const faceTarget = baseRig();
faceTarget.keys = [{ frame: 5, easing: 'hold', pose: structuredClone(pose) }];
faceTarget.contacts = [{ id: 'keep', joint: 1, start: 1, end: 2, target: [1, 0, 0], orientation: [0, 0, 0, 1] }];
const faceSummary = copyActingFromShot(faceTarget, allSource, 'face', { timeMode: 'absolute', sourceSeconds: 2, targetSeconds: 2 });
assert.equal(faceSummary.mode, 'face');
assert.equal(faceSummary.faceKeyCount, 2);
assert.equal(faceSummary.featureKeyCount, 1);
assert.equal(faceSummary.eyeTrackCount, 1);
assert.equal(faceSummary.bodyKeyCount, 0);
assert.equal(faceTarget.keys.length, 1);
assert.equal(faceTarget.keys[0].frame, 5);
assert.equal(faceTarget.contacts[0].id, 'keep');
assert.equal(faceTarget.faceKeys.length, 2);
assert.ok(faceTarget.features);
assert.equal(faceTarget.eyesLinked, true);
validateRig3D(faceTarget);

// All acting replaces both sides; still leaves camera alone.
const allTarget = baseRig();
allTarget.camera = { position: [1, 2, 3], target: [0, 1, 0] };
allTarget.keys = [{ frame: 9, easing: 'hold', pose: structuredClone(pose) }];
allTarget.faceKeys = [{ frame: 1, easing: 'hold', face: [0, 0, 0] }];
const allSummary = copyActingFromShot(allTarget, allSource, 'all', { timeMode: 'stretch', sourceSeconds: 2, targetSeconds: 4 });
assert.equal(allSummary.mode, 'all');
assert.equal(allSummary.stretched, true);
assert.equal(allSummary.bodyKeyCount, 2);
const expected = Math.round(23 * 95 / 47); // srcLast=47, tgtLast=95
assert.equal(allTarget.keys[1].frame, expected);
assert.deepEqual(allTarget.camera, { position: [1, 2, 3], target: [0, 1, 0] });
validateRig3D(allTarget);

// Span remap stretch / absolute / invalid.
const spans = [{ id: 'x', joint: 0, start: 0, end: 23, target: [0, 0, 0], orientation: [0, 0, 0, 1] }];
const stretchSpans = remapSpanTimes(spans, { sourceSeconds: 2, targetSeconds: 4, timeMode: 'stretch' });
assert.equal(stretchSpans.stretched, true);
assert.equal(stretchSpans.spans[0].end, expected);
assert.equal(remapSpanTimes(spans, { timeMode: 'absolute' }).timeMode, 'absolute');
assert.throws(() => remapSpanTimes(spans, { timeMode: 'nope' }), /time mode must be/);

// Reuse camera remap helper unchanged for body keys.
const keyRemap = remapCameraKeyTimes(allSource.keys, { sourceSeconds: 2, targetSeconds: 4, timeMode: 'stretch' });
assert.equal(keyRemap.keys[1].frame, expected);

// Errors
assert.throws(() => copyActingFromShot(null, allSource), /Target needs/);
assert.throws(() => copyActingFromShot(baseRig(), allSource, 'nope'), /mode must be all/);
assert.throws(() => copyActingFromShot(baseRig(), baseRig(), 'all'), /no body or face acting/);
assert.throws(() => copyActingFromShot(baseRig(), faceSource, 'body'), /no body acting/);
assert.throws(() => copyActingFromShot(baseRig(), bodySource, 'face'), /no face acting/);
const mismatch = baseRig();
mismatch.names = ['root', 'other', 'head'];
assert.throws(() => copyActingFromShot(mismatch, bodySource, 'body'), /same joint names/);
const faceMismatch = baseRig();
faceMismatch.face = [0, 0];
assert.throws(() => copyActingFromShot(faceMismatch, faceSource, 'face'), /same face controls/);

// All from face-only source keeps local body keys.
const keepBody = baseRig();
keepBody.keys = [{ frame: 7, easing: 'hold', pose: structuredClone(pose) }];
copyActingFromShot(keepBody, faceSource, 'all', { timeMode: 'absolute', sourceSeconds: 2, targetSeconds: 2 });
assert.equal(keepBody.keys[0].frame, 7);
assert.equal(keepBody.faceKeys.length, 2);
validateRig3D(keepBody);

// Default mode is all
const defTarget = baseRig();
assert.equal(copyActingFromShot(defTarget, allSource).mode, 'all');

console.log('Acting-copy checks passed: list sources, body/face/all modes, leave camera+lip-sync, duration remap via shared camera key helper + span remap, compatibility rejects.');
