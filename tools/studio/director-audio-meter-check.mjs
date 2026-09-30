import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  DEFAULT_AUDIO_METER,
  MMATH_SPECTRUM_FLOOR_DB,
  AUDIO_METER_DISPLAY_FLOOR_DB,
  MMATH_LOUDNESS_FLOOR,
  normalizeAudioMeter,
  validateAudioMeter,
  setAudioMeter,
  clearAudioMeter,
  isDefaultAudioMeter,
  fractionalOctaveBands,
  mapFrequencyDbToBandLevels,
  createBandMeter,
  dbToMeterUnit,
  drawBandMeterCanvas,
  kWeighting,
  createLoudnessMeter,
  createTruePeakDetector,
  truePeakCoeffTable,
  formatLoudnessReading,
  formatLoudnessRange,
  TRUE_PEAK_PHASES,
  TRUE_PEAK_TAPS_PER_PHASE,
  measureOfflineBuffer,
  measureOfflineBufferAsync,
  audioBufferToInterleaved,
  mediaLoudnessKey,
  getProgrammeLoudness,
  setProgrammeLoudness,
  clearProgrammeLoudness,
  normalizeProgrammeLoudness,
} from '../../simple-editor/director-audio-meter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const vendor = join(root, 'tools', 'mmathen');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'analysis', 'analyzer.h')), 'vendored analyzer.h missing');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'analysis', 'spectrum.h')), 'vendored spectrum.h missing');
assert.ok(existsSync(join(vendor, 'include', 'mmathen', 'analysis', 'bs1770.h')), 'vendored bs1770.h missing');
assert.ok(existsSync(join(root, 'simple-editor', 'director-audio-loudness.js')), 'director-audio-loudness.js missing');
const vendorMd = readFileSync(join(vendor, 'VENDOR.md'), 'utf8');
assert.ok(/director-audio-meter/i.test(vendorMd), 'VENDOR.md must document spectrum/meter JS port');
assert.ok(/BandAnalyzer/i.test(vendorMd), 'VENDOR.md must name BandAnalyzer');
assert.ok(/bs1770|BS\.1770|loudness/i.test(vendorMd), 'VENDOR.md must document BS.1770 / loudness JS port');
assert.ok(/director-audio-loudness/i.test(vendorMd), 'VENDOR.md must name director-audio-loudness.js');

assert.equal(DEFAULT_AUDIO_METER.bandsPerOctave, 3);
assert.equal(DEFAULT_AUDIO_METER.releaseDbPerSec, 24);
assert.equal(DEFAULT_AUDIO_METER.peakHoldSec, 1);
assert.equal(DEFAULT_AUDIO_METER.loudnessEnabled, true);
assert.equal(MMATH_SPECTRUM_FLOOR_DB, -300);
assert.equal(MMATH_LOUDNESS_FLOOR, -200);

assert.deepEqual(normalizeAudioMeter(undefined), {...DEFAULT_AUDIO_METER});
assert.equal(normalizeAudioMeter({bandsPerOctave: 1}).bandsPerOctave, 1);
assert.equal(normalizeAudioMeter({bandsPerOctave: 99}).bandsPerOctave, 3);
assert.ok(isDefaultAudioMeter(undefined));
assert.ok(isDefaultAudioMeter({}));

validateAudioMeter(undefined);
validateAudioMeter({enabled: true, bandsPerOctave: 3});
assert.throws(() => validateAudioMeter({loudnessEnabled: 'yes'}), /loudnessEnabled/);
assert.throws(() => validateAudioMeter({bandsPerOctave: 2}), /octave/);
assert.throws(() => validateAudioMeter({releaseDbPerSec: -1}), /release/);
assert.throws(() => validateAudioMeter({peakHoldSec: 11}), /peak hold/);
assert.throws(() => validateAudioMeter({fMinHz: 100, fMaxHz: 50}), /frequency/);

const project = {};
setAudioMeter(project, {bandsPerOctave: 1});
assert.equal(project.audioMeter.bandsPerOctave, 1);
setAudioMeter(project, {...DEFAULT_AUDIO_METER});
assert.equal(project.audioMeter, undefined);
setAudioMeter(project, {releaseDbPerSec: 48});
assert.equal(project.audioMeter.releaseDbPerSec, 48);
setAudioMeter(project, {loudnessEnabled: false});
assert.equal(project.audioMeter.loudnessEnabled, false);
clearAudioMeter(project);
assert.equal(project.audioMeter, undefined);

// IEC third-octave around 1 kHz: mid 1000 must appear
const thirds = fractionalOctaveBands(3, 20, 16000);
assert.ok(thirds.length > 20);
const mid1k = thirds.find((b) => Math.abs(b.mid - 1000) < 1e-6);
assert.ok(mid1k, '1 kHz third-octave mid band missing');
assert.ok(mid1k.lower < 1000 && mid1k.upper > 1000);
const octaves = fractionalOctaveBands(1, 20, 16000);
assert.ok(octaves.length < thirds.length);
assert.throws(() => fractionalOctaveBands(2, 20, 16000), /1\|3/);

// Map a tone-ish bin into the 1 kHz band
const fftSize = 2048;
const sr = 48000;
const binHz = sr / fftSize;
const k1k = Math.round(1000 / binHz);
const freqDb = new Float32Array(fftSize / 2 + 1);
freqDb.fill(-100);
freqDb[k1k] = -6; // strong bin near 1 kHz
const levels = mapFrequencyDbToBandLevels(freqDb, sr, fftSize, thirds);
const hot = levels.find((l) => Math.abs(l.band.mid - 1000) < 1e-6);
assert.ok(hot.bins >= 1);
assert.ok(hot.levelDb > -20, '1 kHz band should pick up the hot bin');
const cold = levels.find((l) => l.band.mid < 100);
assert.ok(cold.levelDb <= -99);

// Ballistics: instant attack, release, peak hold
const meter = createBandMeter({bandsPerOctave: 3, releaseDbPerSec: 24, peakHoldSec: 0.5, fMinHz: 20, fMaxHz: 16000});
const n = meter.bands.length;
const silence = Array(n).fill(AUDIO_METER_DISPLAY_FLOOR_DB);
const spike = Array(n).fill(AUDIO_METER_DISPLAY_FLOOR_DB);
const idx = meter.bands.findIndex((b) => Math.abs(b.mid - 1000) < 1e-6);
spike[idx] = -3;
meter.pushRawDb(spike, 0);
assert.ok(Math.abs(meter.display()[idx] + 3) < 1e-9);
assert.ok(Math.abs(meter.peaks()[idx] + 3) < 1e-9);
// Hold still: peak stays after 0.2s silence
meter.pushRawDb(silence, 0.2);
assert.ok(Math.abs(meter.peaks()[idx] + 3) < 1e-9);
// After hold expires, peak falls at 24 dB/s
meter.pushRawDb(silence, 0.5); // consume hold
meter.pushRawDb(silence, 0.5); // 0.5s * 24 = 12 dB fall from -3 → -15
assert.ok(meter.peaks()[idx] < -10);
assert.ok(meter.peaks()[idx] > -20);
assert.ok(meter.overallDisplayDb() <= meter.display()[idx] + 1e-9);

assert.equal(dbToMeterUnit(0), 1);
assert.equal(dbToMeterUnit(AUDIO_METER_DISPLAY_FLOOR_DB), 0);
assert.ok(Math.abs(dbToMeterUnit(-30) - 0.5) < 1e-9);

{
  const calls = [];
  const canvas = {
    width: 200,
    height: 48,
    getContext(){
      return {
        clearRect(){calls.push('clear');},
        fillRect(){calls.push('fill');},
        createLinearGradient(){return {addColorStop(){}};},
        fillText(){calls.push('text');},
        fillStyle: '', font: '', textBaseline: '',
      };
    },
  };
  drawBandMeterCanvas(canvas, {
    bands: thirds.slice(0, 8),
    display: Array(8).fill(-20),
    peaks: Array(8).fill(-10),
    live: true,
  });
  assert.ok(calls.includes('clear'));
  assert.ok(calls.includes('fill'));
}

// Overview exports analyser helper
const overviewSrc = readFileSync(join(root, 'simple-editor', 'director-audio-overview.js'), 'utf8');
assert.ok(/ensureMediaAnalyser/.test(overviewSrc), 'overview must export/ensure AnalyserNode');
assert.ok(/director-audio-meter/.test(overviewSrc), 'overview must import meter module');
assert.ok(/audio-overview-spectrum/.test(overviewSrc), 'overview must mount spectrum canvas');
assert.ok(/audio-overview-loudness/.test(overviewSrc), 'overview must mount loudness readout');
assert.ok(/createLoudnessMeter/.test(overviewSrc), 'overview must create loudness meter');
assert.ok(/getFloatTimeDomainData/.test(overviewSrc), 'overview must feed Analyser time-domain to loudness');
assert.ok(/loudnessEnabled/.test(overviewSrc), 'overview must honor loudnessEnabled pref');
assert.ok(/decodeMediaAudioBuffer/.test(overviewSrc), 'overview must decode media for programme loudness');
assert.ok(/measureOfflineBufferAsync|measureOfflineBuffer/.test(overviewSrc), 'overview must run offline programme meter');
assert.ok(/audio-overview-programme/.test(overviewSrc), 'overview must mount programme readout');
assert.ok(/Measure programme loudness/.test(overviewSrc), 'overview must expose Measure programme loudness control');
assert.ok(/Prog I/.test(overviewSrc), 'overview must label programme Integrated as Prog I');
assert.ok(/setProgrammeLoudness/.test(overviewSrc), 'overview must cache programme loudness on project');
assert.ok(/fetchStudioPcm/.test(overviewSrc), 'overview must call fetchStudioPcm on decode failure');
assert.ok(/fetchProgrammeLoudnessServer/.test(overviewSrc), 'overview must call fetchProgrammeLoudnessServer when PCM fails');
assert.ok(/\/studio\/director\/pcm/.test(overviewSrc), 'overview studio PCM path');
assert.ok(/\/studio\/director\/programme-loudness/.test(overviewSrc), 'overview programme-loudness path');
assert.ok(/Browser \+ studio measure failed|silent server fallback/i.test(overviewSrc), 'overview must mention combined failure / silent fallback');
assert.ok(/I\*/.test(overviewSrc), 'overview must mark live integrated as I*');

assert.ok(/STUDIO_PCM_MAX_DURATION_SEC\s*=\s*180/.test(overviewSrc), 'overview exports STUDIO_PCM_MAX_DURATION_SEC = 180');
assert.ok(/overPcmBudget/.test(overviewSrc), 'overview Measure must skip PCM for duration > STUDIO_PCM_MAX_DURATION_SEC');
assert.ok(/fetchProgrammeLoudnessServer/.test(overviewSrc) && /overPcmBudget/.test(overviewSrc), 'long clips must prefer fetchProgrammeLoudnessServer');
assert.ok(/programmeSourceLabel|full file \(studio ffmpeg\)/.test(overviewSrc), 'overview must surface programme source label');
assert.ok(/source: reading\.source \|\| 'browser-pcm'|source: reading\.source \|\| "browser-pcm"|source: reading\.source \|\| 'browser-pcm'/.test(overviewSrc) || /source: reading\.source \|\| 'browser-pcm'/.test(overviewSrc), 'browser Offline path tags source browser-pcm');
assert.ok(/never truncated/i.test(overviewSrc), 'overview documents never-truncated long-clip routing');


const projectSrc = readFileSync(join(root, 'simple-editor', 'director-project.js'), 'utf8');
assert.ok(/validateAudioMeter/.test(projectSrc), 'project validate must call validateAudioMeter');


// --- BS.1770 / true-peak (mmathen bs1770.h port) ---
assert.equal(TRUE_PEAK_PHASES, 4);
assert.equal(TRUE_PEAK_TAPS_PER_PHASE, 12);
const table = truePeakCoeffTable();
assert.equal(table.length, 4);
assert.equal(table[0].length, 12);
// Each phase DC gain ~ 1
for(const row of table){
  const sum = row.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'true-peak phase DC gain');
}

// Published BS.1770-5 48 kHz K-weighting (Tables 1 & 2)
const kw48 = kWeighting(48000);
const pubShelf = {b0:1.53512485958697, b1:-2.69169618940638, b2:1.19839281085285, a1:-1.69065929318241, a2:0.73248077421585};
const pubHp = {b0:1, b1:-2, b2:1, a1:-1.99004745483398, a2:0.99007225036621};
for(const k of Object.keys(pubShelf)){
  assert.ok(Math.abs(kw48.shelf[k] - pubShelf[k]) < 1e-12, 'shelf ' + k);
}
for(const k of Object.keys(pubHp)){
  assert.ok(Math.abs(kw48.highpass[k] - pubHp[k]) < 1e-12, 'highpass ' + k);
}
assert.throws(() => kWeighting(1000), /sample rate/);

// True-peak: full-scale 1 kHz sine ≈ 0 dBTP
{
  const tp = createTruePeakDetector(1);
  const sr = 48000;
  const n = sr;
  const buf = new Float64Array(n);
  for(let i = 0; i < n; i++) buf[i] = Math.sin(2 * Math.PI * 1000 * i / sr);
  tp.pushInterleaved(buf, n);
  assert.ok(Math.abs(tp.truePeakDb()) < 0.05, 'FS 1 kHz true-peak near 0 dBTP, got ' + tp.truePeakDb());
  assert.ok(Math.abs(tp.samplePeakDb()) < 0.05, 'FS sample peak near 0 dBFS');
}

// Loudness: -20 dBFS 1 kHz sine → ~-23 LUFS (classic BS.1770 result)
{
  const sr = 48000;
  const m = createLoudnessMeter({sampleRate: sr, channels: 1});
  const amp = Math.pow(10, -20 / 20);
  const buf = new Float64Array(sr * 3); // 3 s for short-term
  for(let i = 0; i < buf.length; i++) buf[i] = amp * Math.sin(2 * Math.PI * 1000 * i / sr);
  m.pushInterleaved(buf, buf.length);
  const mom = m.momentaryLufs();
  const st = m.shortTermLufs();
  const integ = m.integratedLufs();
  assert.ok(Math.abs(mom + 23) < 0.15, 'momentary ~-23 LUFS, got ' + mom);
  assert.ok(Math.abs(st + 23) < 0.15, 'short-term ~-23 LUFS, got ' + st);
  assert.ok(Math.abs(integ + 23) < 0.15, 'integrated ~-23 LUFS, got ' + integ);
  assert.ok(m.truePeakDbtp() < -19.5 && m.truePeakDbtp() > -20.5, 'TP ~-20 dBTP, got ' + m.truePeakDbtp());
  assert.ok(m.blocks() >= 1);
  assert.equal(m.integratedIsLiveSession, true);
  assert.ok(formatLoudnessReading(mom).includes('LUFS'));
  assert.ok(formatLoudnessReading(MMATH_LOUDNESS_FLOOR).includes('\u2014') || formatLoudnessReading(MMATH_LOUDNESS_FLOOR).startsWith('\u2014') || /[—-]/.test(formatLoudnessReading(MMATH_LOUDNESS_FLOOR)));
}

assert.ok(normalizeAudioMeter({}).loudnessEnabled === true);
assert.ok(isDefaultAudioMeter({loudnessEnabled: true, enabled: true, bandsPerOctave: 3, releaseDbPerSec: 24, peakHoldSec: 1, fMinHz: 20, fMaxHz: 16000}));
assert.ok(!isDefaultAudioMeter({loudnessEnabled: false}));


// --- Offline programme Integrated + LRA (OfflineBuffer path) ---
{
  const sr = 48000;
  const amp = Math.pow(10, -20 / 20);
  const mono = new Float64Array(sr * 4);
  for(let i = 0; i < mono.length; i++) mono[i] = amp * Math.sin(2 * Math.PI * 1000 * i / sr);
  const prog = measureOfflineBuffer({sampleRate: sr, interleaved: mono, frames: mono.length, channelCount: 1});
  assert.equal(prog.kind, 'programme');
  assert.equal(prog.integratedIsLiveSession, false);
  assert.ok(Math.abs(prog.integratedLufs + 23) < 0.15, 'programme integrated ~-23 LUFS, got ' + prog.integratedLufs);
  assert.ok(prog.loudnessRangeLu >= 0 && prog.loudnessRangeLu < 0.5, 'constant tone LRA near 0, got ' + prog.loudnessRangeLu);
  assert.ok(prog.truePeakDbtp < -19.5 && prog.truePeakDbtp > -20.5, 'programme TP ~-20');
  assert.ok(Math.abs(prog.durationSec - 4) < 1e-9);
  assert.ok(formatLoudnessRange(prog.loudnessRangeLu).includes('LU'));

  // AudioBuffer-like path
  const fakeBuf = {
    numberOfChannels: 1,
    length: mono.length,
    sampleRate: sr,
    getChannelData(){ return mono; },
  };
  const packed = audioBufferToInterleaved(fakeBuf);
  assert.equal(packed.channelCount, 1);
  assert.equal(packed.frames, mono.length);
  const fromBuf = measureOfflineBuffer(fakeBuf);
  assert.equal(fromBuf.integratedIsLiveSession, false);
  assert.ok(Math.abs(fromBuf.integratedLufs + 23) < 0.15);

  // channels[] path
  const fromPlanes = measureOfflineBuffer({sampleRate: sr, channels: [mono]});
  assert.ok(Math.abs(fromPlanes.integratedLufs + 23) < 0.15);

  // async path matches sync
  const asyncProg = await measureOfflineBufferAsync({sampleRate: sr, interleaved: mono, frames: mono.length, channelCount: 1}, {yieldEveryChunks: 1, yieldFn: async () => {}});
  assert.ok(Math.abs(asyncProg.integratedLufs - prog.integratedLufs) < 1e-9);
  assert.equal(asyncProg.integratedIsLiveSession, false);
}

// Durable programme cache on project
{
  const proj = {};
  const media = {name: 'voice.wav', subfolder: 'studio-voices', type: 'input'};
  assert.equal(mediaLoudnessKey(media), 'input:studio-voices:voice.wav');
  assert.equal(getProgrammeLoudness(proj, media), null);
  setProgrammeLoudness(proj, media, {
    integratedLufs: -23.1,
    loudnessRangeLu: 4.2,
    truePeakDbtp: -1.5,
    durationSec: 12,
    sampleRate: 48000,
    channels: 1,
    blocks: 30,
  });
  const hit = getProgrammeLoudness(proj, media);
  assert.ok(hit);
  assert.equal(hit.integratedIsLiveSession, false);
  assert.equal(hit.kind, 'programme');
  assert.ok(Math.abs(hit.integratedLufs + 23.1) < 1e-9);
  assert.ok(Math.abs(hit.loudnessRangeLu - 4.2) < 1e-9);
  assert.equal(proj.audioProgrammeLoudness['input:studio-voices:voice.wav'].mediaKey, 'input:studio-voices:voice.wav');
  clearProgrammeLoudness(proj, media);
  assert.equal(proj.audioProgrammeLoudness, undefined);
  assert.equal(normalizeProgrammeLoudness(null), null);
  assert.equal(normalizeProgrammeLoudness({}), null);
}

// --- Server PCM / programme-loudness client contract (mock fetch, no Comfy) ---
{
  const overviewMod = await import('../../simple-editor/director-audio-overview.js');
  const {fetchStudioPcm, fetchProgrammeLoudnessServer} = overviewMod;
  assert.equal(overviewMod.STUDIO_PCM_MAX_DURATION_SEC, 180);

  assert.equal(typeof fetchStudioPcm, 'function');
  assert.equal(typeof fetchProgrammeLoudnessServer, 'function');

  const media = {name: 'voice.wav', subfolder: 'studio-voices', type: 'input'};

  // PCM: build 0.05s mono silence f32le base64
  const frames = 2400;
  const f32 = new Float32Array(frames);
  const b64 = Buffer.from(Buffer.from(f32.buffer)).toString('base64');
  let pcmCalls = 0;
  const pcm = await fetchStudioPcm(media, {
    cache: false,
    fetchImpl: async (url, opts) => {
      pcmCalls += 1;
      assert.equal(url, '/studio/director/pcm');
      assert.equal(opts.method, 'POST');
      assert.equal(opts.headers['X-Studio-Director'], '1');
      const body = JSON.parse(opts.body);
      assert.deepEqual(body.media, media);
      return {
        ok: true,
        json: async () => ({
          sampleRate: 48000,
          channelCount: 1,
          frames,
          duration: frames / 48000,
          encoding: 'f32le',
          pcmBase64: b64,
        }),
      };
    },
  });
  assert.equal(pcm.sampleRate, 48000);
  assert.equal(pcm.channelCount, 1);
  assert.equal(pcm.frames, frames);
  assert.equal(pcm.interleaved.length, frames);
  assert.equal(pcm.source, 'server-pcm');
  assert.equal(pcmCalls, 1);
  const silenceProg = measureOfflineBuffer(pcm);
  assert.equal(silenceProg.kind, 'programme');
  assert.ok(silenceProg.integratedLufs <= -70, 'near-silence integrated very low');

  let sumCalls = 0;
  const summary = await fetchProgrammeLoudnessServer(media, {
    fetchImpl: async (url, opts) => {
      sumCalls += 1;
      assert.equal(url, '/studio/director/programme-loudness');
      assert.equal(opts.headers['X-Studio-Director'], '1');
      assert.deepEqual(JSON.parse(opts.body).media, media);
      return {
        ok: true,
        json: async () => ({
          kind: 'programme',
          integratedLufs: -23.0,
          loudnessRangeLu: 0.1,
          truePeakDbtp: -20.0,
          durationSec: 4,
          source: 'server-ffmpeg',
        }),
      };
    },
  });
  assert.equal(summary.kind, 'programme');
  assert.equal(summary.integratedIsLiveSession, false);
  assert.ok(Math.abs(summary.integratedLufs + 23) < 1e-9);
  assert.equal(summary.source, 'server-ffmpeg');
  assert.equal(sumCalls, 1);

  // Error contract
  await assert.rejects(
    () => fetchProgrammeLoudnessServer(media, {
      fetchImpl: async () => ({ok: false, json: async () => ({error: 'nope'})}),
    }),
    /nope|unavailable/i,
  );
}

assert.ok(/programme|OfflineBuffer|measureOfflineBuffer/i.test(vendorMd), 'VENDOR.md must document offline programme loudness');
assert.ok(/programme-loudness|\/studio\/director\/pcm|server fallback/i.test(vendorMd), 'VENDOR.md must document server PCM / programme-loudness fallback');
assert.ok(/180|PCM_MAX_DURATION|STUDIO_PCM_MAX|pcm_duration_cap|never truncat/i.test(vendorMd), 'VENDOR.md must document 180s PCM cap / long-clip programme-loudness');

console.log('Audio meter / mmath BandAnalyzer + BS.1770 loudness/true-peak + offline programme I/LRA + studio PCM fallback + long-clip programme-loudness routing checks passed: IEC bands, ballistics, K-weighting, true-peak, live LUFS, OfflineBuffer programme, durable cache+source, server PCM/summary mock contract, 180s cap routing, vendor headers, overview wiring.');
