import assert from 'node:assert/strict';
import fs from 'node:fs';
import {clipFitSeconds,
  audioFitSeconds,
  fitShotToClip,
  fitShotToAudio,
  clipFitSecondsWithHold,
  mediaTrim,
  setMediaTrim,
  clearMediaTrim,
  trimmedClipSeconds,
  validateMediaTrim,
  shotHoldSeconds,
  setShotHoldSeconds,
  clearShotHoldSeconds,
  clampShotHoldSeconds,
  shotHoldPreview,
  SHOT_HOLD_PRESETS,
  validateShotHold,
  shotPlaybackSpeed,
  setShotPlaybackSpeed,
  clearShotPlaybackSpeed,
  validateShotPlaybackSpeed,
  clampShotPlaybackSpeed,
  shotPlaybackSpeedPreview,
  SHOT_PLAYBACK_SPEED_PRESETS,
  playbackSpeedsEqual,
  movingClipSeconds,
  mediaPlaybackWindow,
  scrubOutHandleSeconds,
  scrubHandlesToTrim,
  mediaPeaksKey,
  MEDIA_PEAKS_BINS,
  MEDIA_PEAKS_SILENT_MAX,
  isSilentPeaks,
  peaksFromSamples,
  luminanceEnergy,
  normalizePeaks,
  RULES,
  shotMediaIsVideo,
  listVideoClipFitShots,
  bulkFitHeldFrameNote,
  fitShotsToClips,
  shotTransition, setShotTransition, clearShotTransition, validateShotTransition, transitionOverlapSeconds, transitionOverlaps, transitionXfadeName, SHOT_TRANSITION_OPTIONS, SHOT_TRANSITION_XFADE, shotHasTransition, listTransitionSources, copyTransitionFromShot} from '../../simple-editor/director-timing.js';
import {boardFrames, addPanel} from '../../simple-editor/director-planning-state.js';
import {validateProject} from '../../simple-editor/director-project.js';

assert.equal(clipFitSeconds(2.1), 2);
assert.equal(clipFitSeconds(2.9), 2);
assert.equal(clipFitSeconds(3), 3);
assert.equal(clipFitSeconds(0.4), 1);
assert.equal(clipFitSeconds(3600.9), 3600);
assert.throws(() => clipFitSeconds(0));
assert.throws(() => clipFitSeconds(-1));
assert.throws(() => clipFitSeconds(NaN));

assert.equal(audioFitSeconds(2.1), 3);
assert.equal(audioFitSeconds(5), 5);
assert.equal(audioFitSeconds(0.2), 1);
assert.throws(() => audioFitSeconds(0));

const shot = {id: 'a', title: 'Hold', seconds: 7, action: '', camera: 'wide', dialogue: ''};
assert.equal(fitShotToClip(shot, 2.06), 2);
assert.equal(shot.seconds, 2);

const long = {id: 'b', title: 'Line', seconds: 2, action: '', camera: 'close', dialogue: 'hello'};
assert.equal(fitShotToAudio(long, 5.65), 6);
assert.equal(long.seconds, 6);

const boarded = {id: 'c', title: 'Boards', seconds: 5, action: '', camera: 'wide', dialogue: '', visualSource: 'boards', panels: []};
addPanel(boarded, {action: 'A'});
addPanel(boarded, {action: 'B'});
assert.equal(boardFrames(boarded), 120);
fitShotToClip(boarded, 3.2);
assert.equal(boarded.seconds, 3);
assert.equal(boardFrames(boarded), 72);

const same = {id: 'd', title: 'Exact', seconds: 4, action: '', camera: '', dialogue: ''};
assert.equal(fitShotToClip(same, 4.0), 4);
assert.equal(same.seconds, 4);

assert.ok(RULES.holdLimit > 0);
assert.ok(RULES.holdShare > 0);

const project = {
  version: 1,
  id: 'timing-fit-project',
  title: 'Timing fit',
  style: '',
  synopsis: '',
  assets: [],
  scenes: [{id: 'scene-1', title: 'Scene', shots: [{id: 'shot-1', title: 'Hold', seconds: 7, action: '', camera: 'wide', dialogue: ''}]}],
};
validateProject(project);
fitShotToClip(project.scenes[0].shots[0], 2.5);
validateProject(project);
assert.equal(project.scenes[0].shots[0].seconds, 2);

const media = {name: 'take.mp4', type: 'input'};
assert.deepEqual(mediaTrim(media), {sourceIn: 0, sourceOut: null});
setMediaTrim(media, 1.5, 4.25);
assert.deepEqual(mediaTrim(media), {sourceIn: 1.5, sourceOut: 4.25});
assert.equal(trimmedClipSeconds(10, media), 2.75);
assert.equal(clipFitSeconds(trimmedClipSeconds(10, media)), 2);
assert.equal(trimmedClipSeconds(3, media), 1.5); // capped by remaining file after sourceIn
assert.throws(() => setMediaTrim(media, 5, 4));
assert.throws(() => setMediaTrim(media, -1, 2));
assert.throws(() => validateMediaTrim({name: 'x.mp4', type: 'input', sourceIn: 3, sourceOut: 3}));

const fitMedia = {name: 'hold.mp4', type: 'input', sourceIn: 0.5, sourceOut: 2.6};
const holdShot = {id: 'trim-fit', title: 'Trim fit', seconds: 9, action: '', camera: 'wide', dialogue: '', media: fitMedia};
assert.equal(fitShotToClip(holdShot, trimmedClipSeconds(8, fitMedia)), 2);
assert.equal(holdShot.seconds, 2);

clearMediaTrim(fitMedia);
assert.deepEqual(mediaTrim(fitMedia), {sourceIn: 0, sourceOut: null});
validateMediaTrim(fitMedia);

const projectTrim = {
  version: 1,
  id: 'timing-trim-project',
  title: 'Timing trim',
  style: '',
  synopsis: '',
  assets: [],
  scenes: [{id: 'scene-1', title: 'Scene', shots: [{
    id: 'shot-1', title: 'Clip', seconds: 5, action: '', camera: 'wide', dialogue: '',
    media: {name: 'clip.mp4', type: 'input', sourceIn: 1, sourceOut: 3.5},
  }]}],
};
validateProject(projectTrim);
assert.equal(trimmedClipSeconds(20, projectTrim.scenes[0].shots[0].media), 2.5);
fitShotToClip(projectTrim.scenes[0].shots[0], trimmedClipSeconds(20, projectTrim.scenes[0].shots[0].media));
assert.equal(projectTrim.scenes[0].shots[0].seconds, 2);
validateProject(projectTrim);

assert.deepEqual(shotTransition({}), {type:'cut', durationSec:0});
setShotTransition(projectTrim.scenes[0].shots[0], 'dissolve', 0.5);
assert.deepEqual(shotTransition(projectTrim.scenes[0].shots[0]), {type:'dissolve', durationSec:0.5});
validateProject(projectTrim);
assert.equal(transitionOverlapSeconds(projectTrim.scenes[0].shots), 0); // single shot
const tA={id:'ta',title:'A',seconds:5,action:'',camera:'',dialogue:''};
const tB={id:'tb',title:'B',seconds:5,action:'',camera:'',dialogue:''};
setShotTransition(tA,'dissolve',1);
assert.equal(transitionOverlapSeconds([tA,tB]),1);
assert.throws(()=>setShotTransition(tA,'dissolve',5));
assert.throws(()=>validateShotTransition({seconds:3,transition:{type:'dissolve',durationSec:3}}));
clearShotTransition(tA);
assert.deepEqual(shotTransition(tA),{type:'cut',durationSec:0});
assert.ok(SHOT_TRANSITION_OPTIONS.some(o=>o.type==='wipe-left'));
assert.equal(transitionXfadeName('dissolve'),'fade');
assert.equal(transitionXfadeName('wipe-left'),'wipeleft');
assert.equal(transitionXfadeName('slide-right'),'slideright');
assert.equal(transitionXfadeName('fade-black'),'fadeblack');
assert.equal(transitionXfadeName('circle-open'),'circleopen');
assert.equal(transitionXfadeName('cut'),null);
assert.equal(transitionOverlaps('wipe-up'),true);
assert.equal(transitionOverlaps('cut'),false);
setShotTransition(tA,'wipe-left',1);
assert.deepEqual(shotTransition(tA),{type:'wipe-left',durationSec:1});
assert.equal(transitionOverlapSeconds([tA,tB]),1);
setShotTransition(tA,'slide-down',0.5);
assert.equal(shotTransition(tA).type,'slide-down');
setShotTransition(tA,'fade-white',1);
assert.equal(transitionXfadeName(shotTransition(tA).type),'fadewhite');
setShotTransition(tA,'circle-close',1);
assert.equal(Object.keys(SHOT_TRANSITION_XFADE).length,SHOT_TRANSITION_OPTIONS.filter(o=>o.type!=='cut').length);
assert.throws(()=>setShotTransition(tA,'iris',1));
clearShotTransition(tA);
assert.deepEqual(shotTransition(tA),{type:'cut',durationSec:0});


// Explicit hold last-frame N seconds (intentional frozen tail).
assert.equal(shotHoldSeconds({}), 0);
assert.equal(shotHoldSeconds({holdSeconds: 0}), 0);
const holdOnly = {id: 'hold-n', title: 'Hold N', seconds: 7, action: '', camera: 'wide', dialogue: ''};
assert.equal(setShotHoldSeconds(holdOnly, 2), 2);
assert.equal(holdOnly.holdSeconds, 2);
assert.equal(clipFitSecondsWithHold(2.06, 2), 4);
assert.equal(fitShotToClip(holdOnly, 2.06), 4);
assert.equal(holdOnly.seconds, 4);
assert.equal(holdOnly.holdSeconds, 2);
assert.throws(() => setShotHoldSeconds(holdOnly, -1));
assert.throws(() => setShotHoldSeconds(holdOnly, 3601));
assert.throws(() => setShotHoldSeconds(holdOnly, 1.5));
assert.throws(() => validateShotHold({holdSeconds: NaN}));
clearShotHoldSeconds(holdOnly);
assert.equal(shotHoldSeconds(holdOnly), 0);
assert.equal('holdSeconds' in holdOnly, false);
assert.equal(fitShotToClip(holdOnly, 2.06), 2); // back to no-hold fit

// Hold polish: clamp UI input, presets, preview summary (integer model unchanged).
assert.deepEqual([...SHOT_HOLD_PRESETS], [0, 1, 2, 3]);
assert.equal(clampShotHoldSeconds(-3), 0);
assert.equal(clampShotHoldSeconds(2.4), 2);
assert.equal(clampShotHoldSeconds(2.6), 3);
assert.equal(clampShotHoldSeconds(99999), 3600);
assert.equal(clampShotHoldSeconds(''), 0);
assert.equal(clampShotHoldSeconds(NaN), 0);
assert.equal(shotHoldPreview({seconds: 5}).hold, 0);
assert.match(shotHoldPreview({seconds: 5}).text, /No intentional hold/);
assert.equal(shotHoldPreview({seconds: 5, holdSeconds: 2}).moving, 3);
assert.match(shotHoldPreview({seconds: 5, holdSeconds: 2}).text, /Hold 2s/);
assert.equal(setShotHoldSeconds(holdOnly, clampShotHoldSeconds(2.6)), 3);
assert.equal(holdOnly.holdSeconds, 3);
clearShotHoldSeconds(holdOnly);


const holdTrimMedia = {name: 'hold-trim.mp4', type: 'input', sourceIn: 0.5, sourceOut: 2.6};
const holdTrimShot = {id: 'hold-trim', title: 'Hold trim', seconds: 9, action: '', camera: 'wide', dialogue: '', media: holdTrimMedia};
setShotHoldSeconds(holdTrimShot, 1);
assert.equal(trimmedClipSeconds(8, holdTrimMedia), 2.1);
assert.equal(fitShotToClip(holdTrimShot, trimmedClipSeconds(8, holdTrimMedia)), 3); // floor(2.1)+1
assert.equal(holdTrimShot.seconds, 3);
assert.equal(holdTrimShot.holdSeconds, 1);

const projectHold = {
  version: 1,
  id: 'timing-hold-project',
  title: 'Timing hold',
  style: '',
  synopsis: '',
  assets: [],
  scenes: [{id: 'scene-1', title: 'Scene', shots: [{
    id: 'shot-1', title: 'Clip', seconds: 5, action: '', camera: 'wide', dialogue: '',
    holdSeconds: 2,
    media: {name: 'clip.mp4', type: 'input', sourceIn: 1, sourceOut: 3.5},
  }]}],
};
validateProject(projectHold);
fitShotToClip(projectHold.scenes[0].shots[0], trimmedClipSeconds(20, projectHold.scenes[0].shots[0].media));
assert.equal(projectHold.scenes[0].shots[0].seconds, 4); // floor(2.5)+2
assert.equal(projectHold.scenes[0].shots[0].holdSeconds, 2);
validateProject(projectHold);
setShotHoldSeconds(projectHold.scenes[0].shots[0], 0);
assert.equal('holdSeconds' in projectHold.scenes[0].shots[0], false);
validateProject(projectHold);

// Playback speed (0.5x-2x) with trim + hold + fit + media window.
assert.equal(shotPlaybackSpeed({}), 1);
assert.equal(shotPlaybackSpeed({playbackSpeed: 1}), 1);
assert.equal(movingClipSeconds(4, 2), 2);
assert.equal(movingClipSeconds(4, 0.5), 8);
assert.throws(() => setShotPlaybackSpeed({}, 0.49));
assert.throws(() => setShotPlaybackSpeed({}, 2.01));
assert.throws(() => validateShotPlaybackSpeed({playbackSpeed: NaN}));

const speedShot = {id: 'speed-1', title: 'Speed', seconds: 9, action: '', camera: 'wide', dialogue: ''};
assert.equal(setShotPlaybackSpeed(speedShot, 2), 2);
assert.equal(speedShot.playbackSpeed, 2);
assert.equal(fitShotToClip(speedShot, 4.2), 2); // floor(4.2/2)=2
assert.equal(speedShot.seconds, 2);
setShotHoldSeconds(speedShot, 1);
assert.equal(fitShotToClip(speedShot, 4.2), 3); // floor(2.1)+1
assert.equal(speedShot.seconds, 3);
assert.equal(speedShot.holdSeconds, 1);
assert.equal(speedShot.playbackSpeed, 2);

const slow = {id: 'speed-slow', title: 'Slow', seconds: 2, action: '', camera: '', dialogue: ''};
setShotPlaybackSpeed(slow, 0.5);
assert.equal(fitShotToClip(slow, 3.9), 7); // floor(7.8)=7
assert.equal(slow.seconds, 7);

const win = mediaPlaybackWindow(1, {sourceIn: 2, sourceOut: 6, speed: 2, fileDuration: 10});
assert.equal(win.usableSource, 4);
assert.equal(win.usableWall, 2);
assert.equal(win.target, 4); // 2 + 1*2
const winHold = mediaPlaybackWindow(3, {sourceIn: 2, sourceOut: 6, speed: 2, fileDuration: 10});
assert.equal(winHold.target, 6); // clamped at sourceOut
assert.ok(winHold.usableWall < 3);

const trimSpeedMedia = {name: 'speed-trim.mp4', type: 'input', sourceIn: 1, sourceOut: 5};
const trimSpeedShot = {id: 'speed-trim', title: 'Trim speed', seconds: 20, action: '', camera: 'wide', dialogue: '', media: trimSpeedMedia};
setShotPlaybackSpeed(trimSpeedShot, 2);
setShotHoldSeconds(trimSpeedShot, 1);
assert.equal(trimmedClipSeconds(20, trimSpeedMedia), 4);
assert.equal(fitShotToClip(trimSpeedShot, trimmedClipSeconds(20, trimSpeedMedia)), 3); // floor(4/2)+1
assert.equal(trimSpeedShot.seconds, 3);

const projectSpeed = {
  version: 1,
  id: 'timing-speed-project',
  title: 'Timing speed',
  style: '',
  synopsis: '',
  assets: [],
  scenes: [{id: 'scene-1', title: 'Scene', shots: [{
    id: 'shot-1', title: 'Clip', seconds: 5, action: '', camera: 'wide', dialogue: '',
    playbackSpeed: 0.5,
    holdSeconds: 1,
    media: {name: 'clip.mp4', type: 'input', sourceIn: 0, sourceOut: 4},
  }]}],
};
validateProject(projectSpeed);
fitShotToClip(projectSpeed.scenes[0].shots[0], trimmedClipSeconds(20, projectSpeed.scenes[0].shots[0].media));
assert.equal(projectSpeed.scenes[0].shots[0].seconds, 9); // floor(4/0.5)+1
assert.equal(projectSpeed.scenes[0].shots[0].playbackSpeed, 0.5);
validateProject(projectSpeed);
setShotPlaybackSpeed(projectSpeed.scenes[0].shots[0], 1);
assert.equal('playbackSpeed' in projectSpeed.scenes[0].shots[0], false);
clearShotPlaybackSpeed(projectSpeed.scenes[0].shots[0]);
validateProject(projectSpeed);

// Playback speed polish: clamp UI input, presets, preview summary (model range unchanged).
assert.deepEqual([...SHOT_PLAYBACK_SPEED_PRESETS], [0.5, 0.75, 1, 1.25, 1.5, 2]);
assert.equal(clampShotPlaybackSpeed(-1), 0.5);
assert.equal(clampShotPlaybackSpeed(3), 2);
assert.equal(clampShotPlaybackSpeed(1.24), 1.25);
assert.equal(clampShotPlaybackSpeed(1.26), 1.25);
assert.equal(clampShotPlaybackSpeed(''), 1);
assert.equal(clampShotPlaybackSpeed(NaN), 1);
assert.ok(playbackSpeedsEqual(1, 1));
assert.ok(playbackSpeedsEqual(0.5, clampShotPlaybackSpeed(0.5)));
assert.equal(playbackSpeedsEqual(1, 1.05), false);
assert.match(shotPlaybackSpeedPreview({seconds: 5}).text, /Normal speed/);
assert.equal(shotPlaybackSpeedPreview({seconds: 5, playbackSpeed: 2}, 4).speed, 2);
assert.match(shotPlaybackSpeedPreview({seconds: 5, playbackSpeed: 2, holdSeconds: 1}, 4).text, /2x/);
assert.match(shotPlaybackSpeedPreview({seconds: 5, playbackSpeed: 2, holdSeconds: 1}, 4).text, /Fit/);
const polishSpeed = {id: 'speed-polish', title: 'Speed polish', seconds: 9, action: '', camera: 'wide', dialogue: ''};
assert.equal(setShotPlaybackSpeed(polishSpeed, clampShotPlaybackSpeed(2.04)), 2);
assert.equal(polishSpeed.playbackSpeed, 2);
assert.equal(setShotPlaybackSpeed(polishSpeed, clampShotPlaybackSpeed(0.9)), 0.9);
assert.equal(polishSpeed.playbackSpeed, 0.9);
clearShotPlaybackSpeed(polishSpeed);
assert.equal('playbackSpeed' in polishSpeed, false);



const scrubOpen = scrubHandlesToTrim(1.5, 10, 10);
assert.deepEqual(scrubOpen, {sourceIn: 1.5, sourceOut: null});
assert.equal(scrubOutHandleSeconds(null, 10), 10);
assert.equal(scrubOutHandleSeconds(8.25, 10), 8.25);
const scrubClosed = scrubHandlesToTrim(2, 7.5, 10);
assert.deepEqual(scrubClosed, {sourceIn: 2, sourceOut: 7.5});
const scrubMedia = {name: 'scrub.mp4', type: 'input'};
setMediaTrim(scrubMedia, scrubClosed.sourceIn, scrubClosed.sourceOut);
assert.deepEqual(mediaTrim(scrubMedia), {sourceIn: 2, sourceOut: 7.5});
const scrubOpenApplied = scrubHandlesToTrim(0.5, 9.98, 10);
setMediaTrim(scrubMedia, scrubOpenApplied.sourceIn, scrubOpenApplied.sourceOut);
assert.deepEqual(mediaTrim(scrubMedia), {sourceIn: 0.5, sourceOut: null});
assert.throws(() => scrubHandlesToTrim(0, 1, 0));
assert.throws(() => scrubOutHandleSeconds(1, -2));

assert.equal(mediaPeaksKey({name: 'clip.mp4', type: 'input', subfolder: 'a'}), 'input:a:clip.mp4');
assert.equal(mediaPeaksKey({filename: 'x.webm', type: 'output'}), 'output::x.webm');
assert.throws(() => mediaPeaksKey({}));
assert.equal(MEDIA_PEAKS_BINS, 1800);
assert.equal(isSilentPeaks([0, 0.01, 0]), true);
assert.equal(isSilentPeaks([0, MEDIA_PEAKS_SILENT_MAX, 0.5]), false);
assert.equal(isSilentPeaks([]), true);
const built = peaksFromSamples([0, 0, 1, -1, 0.25, 0.25], 3);
assert.equal(built.length, 3);
assert.ok(built[1] >= 0.99);
assert.throws(() => peaksFromSamples([], 8));
assert.ok(Math.abs(luminanceEnergy(255, 255, 255) - 1) < 1e-9);
assert.ok(luminanceEnergy(0, 0, 0) === 0);
assert.ok(luminanceEnergy(0, 255, 0) > luminanceEnergy(255, 0, 0));
const norm = normalizePeaks([0, 0.2, 0.4]);
assert.equal(norm.length, 3);
assert.ok(Math.abs(norm[2] - 1) < 1e-9);
assert.ok(norm[1] > 0.4 && norm[1] < 0.6);


// Bulk Fit held-frame notes: fit selected/all video shots keeping holdSeconds + moving vs hold summary.
assert.equal(shotMediaIsVideo({name: 'a.mp4'}), true);
assert.equal(shotMediaIsVideo({filename: 'still.png'}), false);
assert.equal(shotMediaIsVideo({name: 'x.webm'}), true);

const bulkProject = {
  version: 1,
  id: 'bulk-fit-project',
  title: 'Bulk fit',
  style: '',
  synopsis: '',
  assets: [],
  scenes: [
    {id: 'sc-a', title: 'Scene A', shots: [
      {id: 'v1', title: 'Wide', seconds: 10, action: '', camera: 'wide', dialogue: '', holdSeconds: 2, media: {name: 'wide.mp4', type: 'input', sourceIn: 0, sourceOut: 4}},
      {id: 'v2', title: 'Close', seconds: 4, action: '', camera: 'close', dialogue: '', playbackSpeed: 2, media: {name: 'close.webm', type: 'input', sourceIn: 1, sourceOut: 5}},
      {id: 'still', title: 'Card', seconds: 3, action: '', camera: '', dialogue: '', media: {name: 'card.png', type: 'input'}},
    ]},
    {id: 'sc-b', title: 'Scene B', shots: [
      {id: 'v3', title: 'Insert', seconds: 8, action: '', camera: '', dialogue: '', media: {name: 'insert.mp4', type: 'input'}},
      {id: 'boards', title: 'Boards', seconds: 5, action: '', camera: '', dialogue: '', visualSource: 'boards', panels: [], media: {name: 'ignore.mp4', type: 'input'}},
    ]},
  ],
};
validateProject(bulkProject);
assert.deepEqual(listVideoClipFitShots(bulkProject, 'episode').map(s => s.id), ['v1', 'v2', 'v3']);
assert.deepEqual(listVideoClipFitShots(bulkProject, {sceneId: 'sc-a'}).map(s => s.id), ['v1', 'v2']);
assert.deepEqual(listVideoClipFitShots(bulkProject, bulkProject.scenes[1].shots).map(s => s.id), ['v3']);
assert.throws(() => listVideoClipFitShots(null));

const bulkEntries = [
  {shot: bulkProject.scenes[0].shots[0], usableClipSeconds: trimmedClipSeconds(20, bulkProject.scenes[0].shots[0].media)}, // 4s source, hold 2 -> fit 6
  {shot: bulkProject.scenes[0].shots[1], usableClipSeconds: trimmedClipSeconds(20, bulkProject.scenes[0].shots[1].media)}, // 4s source @2x -> moving 2
  {shot: bulkProject.scenes[1].shots[0], usableClipSeconds: 8}, // already matched
];
const bulkResult = fitShotsToClips(bulkEntries);
assert.equal(bulkResult.considered, 3);
assert.equal(bulkResult.changed, 2);
assert.equal(bulkResult.unchanged, 1);
assert.equal(bulkProject.scenes[0].shots[0].seconds, 6); // floor(4)+2 hold
assert.equal(bulkProject.scenes[0].shots[0].holdSeconds, 2); // kept
assert.equal(bulkProject.scenes[0].shots[1].seconds, 2); // floor(4/2)+0
assert.equal(bulkProject.scenes[1].shots[0].seconds, 8);
assert.equal(bulkResult.rows[0].moving, 4);
assert.equal(bulkResult.rows[0].hold, 2);
assert.equal(bulkResult.rows[1].moving, 2);
assert.equal(bulkResult.rows[1].hold, 0);
assert.match(bulkResult.text, /Fitted 2 shots/);
assert.match(bulkResult.text, /Wide 10s -> 6s \(4s moving \+ 2s hold\)/);
assert.match(bulkResult.text, /1 already matched/);
assert.match(bulkFitHeldFrameNote([]), /No video shots fitted/);
assert.match(bulkFitHeldFrameNote([{shotId: 'x', title: 'X', before: 5, after: 5, moving: 5, hold: 0, changed: false}]), /already match clip \+ hold/);
assert.throws(() => fitShotsToClips('nope'));
assert.throws(() => fitShotsToClips([{shot: {id: 'z', seconds: 3}, usableClipSeconds: 0}]));
validateProject(bulkProject);


// --- cross-shot transition copy ---
{
  assert.equal(shotHasTransition({seconds: 4}), false);
  assert.equal(shotHasTransition({seconds: 4, transition: {type: 'cut', durationSec: 0}}), false);
  assert.equal(shotHasTransition({seconds: 4, transition: {type: 'dissolve', durationSec: 1}}), true);

  const copyProj = {
    scenes: [
      {id: 'sc1', title: 'Open', shots: [
        {id: 'a', title: 'Wide', seconds: 6, transition: {type: 'dissolve', durationSec: 1}},
        {id: 'b', title: 'Close', seconds: 5},
      ]},
      {id: 'sc2', title: 'Act 2', shots: [
        {id: 'c', title: 'Wipe', seconds: 8, transition: {type: 'wipe-left', durationSec: 0.5}},
      ]},
    ],
  };
  const sources = listTransitionSources(copyProj, 'b');
  assert.equal(sources.length, 2);
  assert.equal(sources[0].id, 'a');
  assert.equal(sources[1].type, 'wipe-left');
  assert.match(sources[0].label, /dissolve/i);
  assert.equal(listTransitionSources(copyProj, 'a').length, 1);
  assert.equal(listTransitionSources(copyProj, 'missing').length, 2);

  const dst = {id: 'b', title: 'Close', seconds: 5};
  const src = copyProj.scenes[0].shots[0];
  const allSummary = copyTransitionFromShot(dst, src, 'all');
  assert.equal(allSummary.mode, 'all');
  assert.equal(allSummary.type, 'dissolve');
  assert.equal(allSummary.durationSec, 1);
  assert.deepEqual(dst.transition, {type: 'dissolve', durationSec: 1});

  dst.transition = {type: 'fade-black', durationSec: 2};
  const typeSummary = copyTransitionFromShot(dst, src, 'type');
  assert.equal(typeSummary.mode, 'type');
  assert.equal(typeSummary.type, 'dissolve');
  assert.equal(typeSummary.durationSec, 2);
  assert.equal(typeSummary.keptDuration, true);
  assert.deepEqual(dst.transition, {type: 'dissolve', durationSec: 2});

  const bare = {id: 'bare', seconds: 5};
  const typeOntoBare = copyTransitionFromShot(bare, src, 'type');
  assert.equal(typeOntoBare.keptDuration, false);
  assert.equal(typeOntoBare.durationSec, 1);
  assert.deepEqual(bare.transition, {type: 'dissolve', durationSec: 1});

  const wipeSrc = copyProj.scenes[1].shots[0];
  bare.transition = {type: 'circle-open', durationSec: 1.5};
  const durSummary = copyTransitionFromShot(bare, wipeSrc, 'duration');
  assert.equal(durSummary.mode, 'duration');
  assert.equal(durSummary.type, 'circle-open');
  assert.equal(durSummary.durationSec, 0.5);
  assert.deepEqual(bare.transition, {type: 'circle-open', durationSec: 0.5});

  assert.throws(() => copyTransitionFromShot(dst, {seconds: 4}, 'all'), /no overlap transition/i);
  assert.throws(() => copyTransitionFromShot(dst, src, 'nope'), /all, type, or duration/i);
  assert.throws(() => copyTransitionFromShot(null, src), /target/i);
  assert.throws(() => copyTransitionFromShot({seconds: 5}, wipeSrc, 'duration'), /no overlap transition type/i);
  assert.throws(() => copyTransitionFromShot({seconds: 1, transition: {type: 'dissolve', durationSec: 0.5}}, src, 'all'), /shorter than the shot/i);

  const dirSrc = fs.readFileSync(new URL('../../simple-editor/director.js', import.meta.url), 'utf8');
  assert.match(dirSrc, /copyTransitionFromShot/);
  assert.match(dirSrc, /listTransitionSources/);
  assert.match(dirSrc, /shotHasTransition/);
  assert.match(dirSrc, /Copy transition from shot/);
  assert.match(dirSrc, /transition-copy/);
  assert.ok(dirSrc.includes("copyBtn.disabled = !sources.length") || dirSrc.includes('copyBtn.disabled=!sources.length'), 'Copy button disables when no sources');
}


console.log('Timing fit checks passed: clip/audio integer fits, board refit via setShotSeconds, media sourceIn/sourceOut trim, scrub in/out handles, media peaks helpers, holdSeconds intentional last-frame + clamp/presets/preview polish, playbackSpeed 0.5x-2x with fit/window + clamp/presets/preview polish, bulk Fit held-frame notes (list/fit/summary moving vs hold), transitions cut/dissolve/wipe/slide/fade/circle, cross-shot transition copy (all/type/duration), bounds and validation.');


