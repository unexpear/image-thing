import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  maxPoolPeaks,
  normalizePeaksDisplay,
  AUDIO_OVERVIEW_BINS,
  formatOverviewTime,
  overviewAbRegion,
  overviewNeedleTime,
} from '../../simple-editor/director-audio-overview.js';
import {
  fadeInGain,
  fadeOutGain,
  createTransportGain,
  softSeekMedia,
  TRANSPORT_PLAY_RAMP_MS,
  TRANSPORT_SEEK_RAMP_MS,
  TRANSPORT_LONG_SEEK_SEC,
  FadeCurve,
} from '../../simple-editor/director-audio-edit.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vendor = join(root, 'tools', 'mmathen');
assert.ok(existsSync(join(vendor, 'VENDOR.md')), 'vendored mmathen VENDOR.md missing');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'dsp', 'crossfade.h')), 'vendored crossfade.h missing');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'core', 'triple_buffer.h')), 'vendored triple_buffer.h missing');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'core', 'spsc_ring.h')), 'vendored spsc_ring.h missing');
assert.ok(existsSync(join(vendor, 'app', 'engine.h')), 'vendored engine.h missing');
assert.ok(existsSync(join(vendor, 'reference', 'spectrum_app.cpp')), 'vendored reference/spectrum_app.cpp missing');
assert.ok(/a1c8f3e/i.test(readFileSync(join(vendor, 'VENDOR.md'), 'utf8')), 'VENDOR.md must pin a1c8f3e');
assert.ok(existsSync(join(vendor, 'app', 'engine.h')));
assert.ok(existsSync(join(vendor, 'app', 'audio_output.h')));
assert.ok(existsSync(join(vendor, 'CMakeLists.txt')));
assert.ok(!existsSync(join(vendor, 'tests')));
assert.ok(!existsSync(join(vendor, 'a4_golden_test.wav')));
const vendorMd = readFileSync(join(vendor, 'VENDOR.md'), 'utf8');
assert.ok(/mmathEn/i.test(vendorMd), 'VENDOR.md should name source');
assert.ok(!existsSync(join(vendor, 'build_real_audio')), 'build_real_audio must not be vendored');

assert.equal(AUDIO_OVERVIEW_BINS, 1800);
assert.deepEqual(maxPoolPeaks([0, 1, 0.5, 0.2], 2), [1, 0.5]);
assert.deepEqual(maxPoolPeaks([0.1, 0.2, 0.9, 0.3], 4), [0.1, 0.2, 0.9, 0.3]);
const norm = normalizePeaksDisplay([0.1, 0.2, 0.05]);
assert.ok(Math.abs(norm[1] - 1) < 1e-9);
assert.ok(Math.abs(fadeInGain(FadeCurve.EqualPower, 0.5) ** 2 + fadeOutGain(FadeCurve.EqualPower, 0.5) ** 2 - 1) < 1e-12);
assert.equal(TRANSPORT_PLAY_RAMP_MS, 5);
assert.equal(TRANSPORT_SEEK_RAMP_MS, 20);
const g = createTransportGain(0);
g.setTarget(1, 0);
assert.equal(g.value, 1);
const media = {currentTime: 0, duration: 5, volume: 1};
const item = {gain: createTransportGain(0.4), pendingSeek: null};
softSeekMedia(item, media, 2, {playing: true, targetVolume: 0.4});
assert.equal(item.pendingSeek, 2);


assert.equal(formatOverviewTime(0), '0.00s');
assert.equal(formatOverviewTime(12.345), '12.35s');
assert.equal(formatOverviewTime(65.5), '1:05.50');
const done = overviewAbRegion(1, 3);
assert.equal(done.complete, true);
assert.equal(done.halfDone, false);
assert.equal(done.lo, 1);
assert.equal(done.hi, 3);
const half = overviewAbRegion(2, 2, {markA: 2});
assert.equal(half.complete, false);
assert.equal(half.halfDone, true);
assert.equal(overviewNeedleTime(1.2, {pendingSeek: 3.5}), 3.5);
assert.equal(overviewNeedleTime(1.2, {splice: {active: true, target: 4.25}}), 4.25);
assert.equal(overviewNeedleTime(1.2, null), 1.2);
assert.ok(TRANSPORT_LONG_SEEK_SEC >= TRANSPORT_SEEK_RAMP_MS / 1000);

console.log('Audio overview + mmathen vendor checks passed: max-pool, normalize, needle/A-B helpers, crossfade helpers, soft-seek, vendored headers present, build_* omitted.');
