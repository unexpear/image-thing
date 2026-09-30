import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {
  BEAT_MARKER_CAP,
  validateBeatMarkers,
  addBeatMarker,
  removeBeatMarker,
  setBeatMarkerLabel,
  clearBeatMarkers,
  markersInClipWindow,
  episodeTimeForMarker,
  episodeBeatTimes,
  nearestBeatMarker,
  drawBeatMarkerTicks,
} from '../../simple-editor/director-beat-markers.js';
import {validateEpisodeAudio} from '../../simple-editor/director-episode-audio.js';
import {newProject, validateProject} from '../../simple-editor/director-project.js';
import {drawOverviewCanvas} from '../../simple-editor/director-audio-overview.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

// Source wiring
const overviewSrc = readFileSync(join(root, 'simple-editor/director-audio-overview.js'), 'utf8');
assert.match(overviewSrc, /director-beat-markers/);
assert.match(overviewSrc, /beatMarkers: track\.markers/);
assert.match(overviewSrc, /Add beat at playhead/);
const episodeSrc = readFileSync(join(root, 'simple-editor/director-episode-audio.js'), 'utf8');
assert.match(episodeSrc, /validateBeatMarkers\(t\.markers\)/);
const animaticSrc = readFileSync(join(root, 'simple-editor/director-animatic.js'), 'utf8');
assert.match(animaticSrc, /episodeBeatTimes/);
assert.match(animaticSrc, /animatic-beat-strip/);
const planningSrc = readFileSync(join(root, 'simple-editor/director-planning-state.js'), 'utf8');
assert.match(planningSrc, /validateBeatMarkers\(t\.markers\)/);
const deploySrc = readFileSync(join(root, 'Deploy-Editor.ps1'), 'utf8');
assert.match(deploySrc, /director-beat-markers\.js/);
const runnerSrc = readFileSync(join(root, 'tools/studio/run-director-checks.mjs'), 'utf8');
assert.match(runnerSrc, /director-beat-markers-check\.mjs/);

// Validate empty / undefined
validateBeatMarkers(undefined);
validateBeatMarkers([]);
assert.throws(() => validateBeatMarkers({}), /list/);
assert.throws(() => validateBeatMarkers([{id: 'a', time: -1}]), /0/);
assert.throws(() => validateBeatMarkers([{id: 'a', time: 1}, {id: 'a', time: 2}]), /unique/);
assert.throws(() => validateBeatMarkers([{id: 'a', time: 1, label: 'x'.repeat(81)}]), /80/);

const track = {
  id: 'music-1',
  label: 'Score',
  kind: 'music',
  start: 10,
  sourceStart: 2,
  duration: 8,
  volume: 0.4,
  fadeIn: 0,
  fadeOut: 0,
  muted: false,
  media: {name: 'score.wav', type: 'input'},
};

const a = addBeatMarker(track, 2.0, 'kick');
assert.equal(a.time, 2);
assert.equal(a.label, 'kick');
assert.equal(track.markers.length, 1);

// Same frame replaces / updates label
const a2 = addBeatMarker(track, 2.0 + 1 / 96, 'kick2');
assert.equal(track.markers.length, 1);
assert.equal(a2.label, 'kick2');

addBeatMarker(track, 4.5);
addBeatMarker(track, 10.5); // outside clip window (source 2..10)
assert.equal(track.markers.length, 3);
assert.equal(markersInClipWindow(track).length, 2);
assert.equal(episodeTimeForMarker(track, track.markers.find(m => m.time === 2)), 10);
assert.equal(episodeTimeForMarker(track, track.markers.find(m => Math.abs(m.time - 4.5) < 1e-9)), 12.5);
assert.equal(episodeTimeForMarker(track, track.markers.find(m => Math.abs(m.time - 10.5) < 1e-9)), null);

setBeatMarkerLabel(track, a.id, '');
assert.equal(track.markers.find(m => m.id === a.id).label, undefined);

const near = nearestBeatMarker(track, 4.4, {within: 0.2});
assert.ok(near && Math.abs(near.time - 4.5) < 1e-9);

assert.equal(removeBeatMarker(track, a.id), true);
assert.equal(track.markers.length, 2);

validateEpisodeAudio([track]);
const project = newProject();
project.episodeAudio = [structuredClone(track)];
assert.deepEqual(validateProject(JSON.parse(JSON.stringify(project))).episodeAudio[0].markers?.length, 2);

const beats = episodeBeatTimes(project);
assert.equal(beats.length, 1); // only in-window (4.5 → 12.5); 9.9 excluded
assert.equal(beats[0].time, 12.5);

clearBeatMarkers(track);
assert.equal(track.markers, undefined);
assert.equal(episodeBeatTimes({episodeAudio: [track]}).length, 0);

// Cap
const crowded = {id: 'c', markers: []};
for(let i = 0; i < BEAT_MARKER_CAP; i++) addBeatMarker(crowded, i * 0.05);
assert.throws(() => addBeatMarker(crowded, 99), /128/);

// Canvas ticks smoke (jsdom-less: mock ctx)
let ops = 0;
const ctx = {
  save(){ ops++; },
  restore(){ ops++; },
  beginPath(){ ops++; },
  moveTo(){ ops++; },
  lineTo(){ ops++; },
  stroke(){ ops++; },
  fill(){ ops++; },
  closePath(){ ops++; },
  fillText(){ ops++; },
  measureText(){ return {width: 10}; },
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 1,
  font: '',
  textBaseline: '',
};
drawBeatMarkerTicks(ctx, [{id: '1', time: 1, label: 'x'}], {
  width: 100, height: 40, xOf: t => t * 10, viewStart: 0, viewEnd: 10,
});
assert.ok(ops > 4);

// drawOverviewCanvas accepts beatMarkers without throwing (node canvas may be null)
const canvas = {
  clientWidth: 200,
  clientHeight: 80,
  width: 0,
  height: 0,
  getContext(){ return null; },
};
assert.doesNotThrow(() => drawOverviewCanvas(canvas, {
  peaks: [0.1, 0.2, 0.3],
  duration: 10,
  cursor: 1,
  beatMarkers: [{id: '1', time: 1}],
}));

console.log('Beat marker checks passed.');
