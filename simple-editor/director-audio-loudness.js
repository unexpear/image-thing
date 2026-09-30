/** BS.1770 / true-peak — JS port of mmathen analysis/bs1770.h (vendored pin a1c8f3e).
 * ITU-R BS.1770-5 K-weighting, EBU R128 momentary/short-term windows, two-stage
 * integrated gating, EBU Tech 3342 LRA, and Annex-2 4× polyphase true-peak.
 * Native C++ is not linked into ComfyUI — Director live path feeds AnalyserNode
 * time-domain samples. Integrated LUFS from createLoudnessMeter live push is
 * session-since-reset. Whole-file / clip programme Integrated + LRA uses
 * measureOfflineBuffer on decoded PCM (AudioBuffer / interleaved).
 */

export const MMATH_LOUDNESS_FLOOR = -200;
export const TRUE_PEAK_PHASES = 4;
export const TRUE_PEAK_TAPS_PER_PHASE = 12;
export const TRUE_PEAK_DELAY_SAMPLES = 6;

/** Direct-form-I biquad (mmath dsp/biquad.h). coeffs: {b0,b1,b2,a1,a2} with a0=1. */
export function createBiquad(coeffs){
  const c = {
    b0: Number(coeffs.b0), b1: Number(coeffs.b1), b2: Number(coeffs.b2),
    a1: Number(coeffs.a1), a2: Number(coeffs.a2),
  };
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    coeffs: () => ({...c}),
    reset(){ x1 = x2 = y1 = y2 = 0; },
    processSample(x){
      const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      return y;
    },
  };
}

/**
 * K-weighting shelf + RLB high-pass for sample rate fs (8 kHz .. 384 kHz).
 * Same analog-prototype derivation as mmathen::kWeighting / libebur128.
 */
export function kWeighting(sampleRateHz){
  const fs = Number(sampleRateHz);
  if(!Number.isFinite(fs) || fs < 8000 || fs > 384000){
    throw Error('K-weighting needs sample rate between 8 kHz and 384 kHz.');
  }
  const pi = Math.PI;
  let shelf, highpass;
  {
    const f0 = 1681.974450955533, g = 3.999843853973347, q = 0.7071752369554196;
    const kk = Math.tan(pi * f0 / fs);
    const vh = Math.pow(10, g / 20);
    const vb = Math.pow(vh, 0.4996667741545416);
    const a0 = 1 + kk / q + kk * kk;
    shelf = {
      b0: (vh + vb * kk / q + kk * kk) / a0,
      b1: 2 * (kk * kk - vh) / a0,
      b2: (vh - vb * kk / q + kk * kk) / a0,
      a1: 2 * (kk * kk - 1) / a0,
      a2: (1 - kk / q + kk * kk) / a0,
    };
  }
  {
    const f0 = 38.13547087602444, q = 0.5003270373238773;
    const kk = Math.tan(pi * f0 / fs);
    const a0 = 1 + kk / q + kk * kk;
    highpass = {
      b0: 1, b1: -2, b2: 1,
      a1: 2 * (kk * kk - 1) / a0,
      a2: (1 - kk / q + kk * kk) / a0,
    };
  }
  return {shelf, highpass};
}

function besselI0(x){
  let sum = 1, term = 1;
  for(let k = 1; k < 40; k++){
    term *= (x / (2 * k)) * (x / (2 * k));
    sum += term;
  }
  return sum;
}

let _tpTable = null;
/** Build once: 4 phases × 12 taps, Kaiser β=5 windowed sinc, unit DC per phase. */
export function truePeakCoeffTable(){
  if(_tpTable) return _tpTable;
  const phases = TRUE_PEAK_PHASES;
  const taps = TRUE_PEAK_TAPS_PER_PHASE;
  const n = phases * taps;
  const h = new Array(n);
  const i0b = besselI0(5);
  for(let i = 0; i < n; i++){
    const tt = (i - (n - 1) / 2) / phases;
    const sinc = tt === 0 ? 1 : Math.sin(Math.PI * tt) / (Math.PI * tt);
    const r = 2 * i / (n - 1) - 1;
    h[i] = sinc * besselI0(5 * Math.sqrt(1 - r * r)) / i0b;
  }
  const out = [];
  for(let p = 0; p < phases; p++){
    let sum = 0;
    const row = new Array(taps);
    for(let j = 0; j < taps; j++) sum += h[j * phases + p];
    for(let j = 0; j < taps; j++) row[j] = h[j * phases + p] / sum;
    out.push(row);
  }
  _tpTable = out;
  return out;
}

export function createTruePeakInterpolator(){
  const taps = TRUE_PEAK_TAPS_PER_PHASE;
  const h = new Float64Array(taps);
  const table = truePeakCoeffTable();
  return {
    reset(){ h.fill(0); },
    push(x){
      for(let i = taps - 1; i > 0; i--) h[i] = h[i - 1];
      h[0] = x;
      let peak = Math.abs(x);
      for(let p = 0; p < TRUE_PEAK_PHASES; p++){
        let y = 0;
        const c = table[p];
        for(let j = 0; j < taps; j++) y += c[j] * h[j];
        const ay = Math.abs(y);
        if(ay > peak) peak = ay;
      }
      return peak;
    },
  };
}

export function createTruePeakDetector(channels = 1){
  const ch = Math.floor(Number(channels));
  if(!(ch >= 1 && ch <= 8)) throw Error('True-peak detector needs 1-8 channels.');
  const interp = Array.from({length: ch}, () => createTruePeakInterpolator());
  let peak = 0, samplePeak = 0;
  return {
    reset(){
      for(const i of interp) i.reset();
      peak = samplePeak = 0;
    },
    clearPeaks(){ peak = samplePeak = 0; },
    /** Interleaved frames: length = frames * channels. */
    pushInterleaved(samples, frames){
      const n = Math.floor(Number(frames));
      if(!n) return;
      for(let i = 0; i < n; i++){
        for(let c = 0; c < ch; c++){
          const v = Number(samples[i * ch + c]) || 0;
          const p = interp[c].push(v);
          if(p > peak) peak = p;
          const a = Math.abs(v);
          if(a > samplePeak) samplePeak = a;
        }
      }
    },
    truePeakDb(){
      const m = Math.max(peak, samplePeak);
      return m > 0 ? 20 * Math.log10(m) : MMATH_LOUDNESS_FLOOR;
    },
    samplePeakDb(){
      return samplePeak > 0 ? 20 * Math.log10(samplePeak) : MMATH_LOUDNESS_FLOOR;
    },
  };
}

export function lufsOf(weightedMeanSquare){
  const e = Number(weightedMeanSquare);
  return e > 0 ? -0.691 + 10 * Math.log10(e) : MMATH_LOUDNESS_FLOOR;
}

/**
 * LoudnessMeter matching mmathen::LoudnessMeter shape.
 * channels 1..5 in BS.1770 order L,R,C,Ls,Rs (no LFE). Mono = one channel G=1.
 */
export function createLoudnessMeter({sampleRate, channels = 1} = {}){
  const sr = Number(sampleRate);
  const ch = Math.floor(Number(channels));
  if(!Number.isFinite(sr) || sr < 8000 || sr > 384000){
    throw Error('Loudness meter needs sample rate between 8 kHz and 384 kHz.');
  }
  if(!(ch >= 1 && ch <= 5)) throw Error('Loudness meter needs 1-5 channels (no LFE).');
  const kw = kWeighting(sr);
  const filt = Array.from({length: ch}, () => ({
    shelf: createBiquad(kw.shelf),
    highpass: createBiquad(kw.highpass),
  }));
  const tp = createTruePeakDetector(ch);
  const subLen = Math.max(1, Math.round(sr / 10));
  const acc = new Float64Array(ch);
  let fill = 0;
  const sub = [];
  const blocks = [];
  const shortTerm = [];

  function weight(c){ return c >= 3 ? 1.41 : 1; }

  function meanOfLast(k){
    let s = 0;
    for(let i = sub.length - k; i < sub.length; i++) s += sub[i];
    return s / k;
  }

  function closeSubBlock(){
    let e = 0;
    for(let c = 0; c < ch; c++){
      e += weight(c) * acc[c] / subLen;
      acc[c] = 0;
    }
    fill = 0;
    sub.push(e);
    if(sub.length > 30) sub.shift();
    if(sub.length >= 4) blocks.push(meanOfLast(4));
    if(sub.length >= 30) shortTerm.push(meanOfLast(30));
  }

  function windowLufs(k){
    return sub.length >= k ? lufsOf(meanOfLast(k)) : MMATH_LOUDNESS_FLOOR;
  }

  return {
    sampleRate: sr,
    channels: ch,
    subLen,
    reset(){
      for(const f of filt){ f.shelf.reset(); f.highpass.reset(); }
      acc.fill(0);
      fill = 0;
      sub.length = 0;
      blocks.length = 0;
      shortTerm.length = 0;
      tp.reset();
    },
    /** Interleaved PCM in [-1,1]. */
    pushInterleaved(samples, frames){
      const n = Math.floor(Number(frames));
      if(!n) return;
      tp.pushInterleaved(samples, n);
      for(let i = 0; i < n; i++){
        for(let c = 0; c < ch; c++){
          let v = Number(samples[i * ch + c]) || 0;
          v = filt[c].shelf.processSample(v);
          v = filt[c].highpass.processSample(v);
          acc[c] += v * v;
        }
        if(++fill === subLen) closeSubBlock();
      }
    },
    /** Mono Float32Array / array from AnalyserNode time domain. */
    pushMono(samples){
      if(!samples || !samples.length) return;
      if(ch !== 1) throw Error('pushMono requires a 1-channel meter.');
      this.pushInterleaved(samples, samples.length);
    },
    momentaryLufs(){ return windowLufs(4); },
    shortTermLufs(){ return windowLufs(30); },
    integratedLufs(){
      let sum = 0, n = 0;
      for(const e of blocks){
        if(lufsOf(e) > -70){ sum += e; n += 1; }
      }
      if(!n) return MMATH_LOUDNESS_FLOOR;
      const gate = lufsOf(sum / n) - 10;
      sum = 0; n = 0;
      for(const e of blocks){
        const l = lufsOf(e);
        if(l > -70 && l > gate){ sum += e; n += 1; }
      }
      return n === 0 ? MMATH_LOUDNESS_FLOOR : lufsOf(sum / n);
    },
    loudnessRangeLu(){
      const e = [];
      for(const v of shortTerm){
        if(lufsOf(v) > -70) e.push(v);
      }
      if(!e.length) return 0;
      let mean = 0;
      for(const v of e) mean += v;
      const gate = lufsOf(mean / e.length) - 20;
      const l = [];
      for(const v of e){
        if(lufsOf(v) > gate) l.push(lufsOf(v));
      }
      if(l.length < 2) return 0;
      l.sort((a, b) => a - b);
      const pct = (p) => {
        const idx = p * (l.length - 1);
        const i = Math.floor(idx);
        const f = idx - i;
        return i + 1 < l.length ? l[i] + f * (l[i + 1] - l[i]) : l[i];
      };
      return pct(0.95) - pct(0.10);
    },
    truePeakDbtp(){ return tp.truePeakDb(); },
    samplePeakDbfs(){ return tp.samplePeakDb(); },
    blocks(){ return blocks.length; },
    /** Honest gap flag for UI. */
    integratedIsLiveSession: true,
  };
}

/** Format LUFS / dBTP for readout; floor → em-dash. */
export function formatLoudnessReading(value, {digits = 1, unit = 'LUFS'} = {}){
  const v = Number(value);
  if(!Number.isFinite(v) || v <= MMATH_LOUDNESS_FLOOR + 1) return '\u2014 ' + unit;
  const s = v.toFixed(digits);
  return (v >= 0 ? '+' : '') + s + ' ' + unit;
}

/**
 * Interleave AudioBuffer-like channel data into Float64 frames (BS.1770 order).
 * Caps at 5 channels (no LFE). Mono / stereo / 5.0 layouts supported.
 */
export function audioBufferToInterleaved(buffer, {maxChannels = 5} = {}){
  if(!buffer || typeof buffer.getChannelData !== 'function'){
    throw Error('audioBufferToInterleaved needs an AudioBuffer-like object.');
  }
  const chIn = Math.floor(Number(buffer.numberOfChannels) || 0);
  const frames = Math.floor(Number(buffer.length) || 0);
  if(!(chIn >= 1) || !(frames >= 0)) throw Error('AudioBuffer needs ≥1 channel and length.');
  const ch = Math.min(chIn, Math.max(1, Math.floor(Number(maxChannels) || 5)));
  const out = new Float64Array(frames * ch);
  const planes = [];
  for(let c = 0; c < ch; c++) planes.push(buffer.getChannelData(c));
  for(let i = 0; i < frames; i++){
    for(let c = 0; c < ch; c++) out[i * ch + c] = planes[c][i];
  }
  return {interleaved: out, frames, channelCount: ch, sampleRate: Number(buffer.sampleRate)};
}

function resolveOfflineInput(input){
  if(!input || typeof input !== 'object') throw Error('measureOfflineBuffer needs PCM input.');
  if(typeof input.getChannelData === 'function'){
    return audioBufferToInterleaved(input);
  }
  if(Array.isArray(input.channels) || (input.channels && typeof input.channels.length === 'number' && typeof input.channels !== 'number')){
    const planes = input.channels;
    const ch = Math.min(5, planes.length);
    if(!(ch >= 1)) throw Error('channels must be a non-empty list of sample arrays.');
    const frames = Math.floor(Number(planes[0]?.length) || 0);
    const sampleRate = Number(input.sampleRate);
    const out = new Float64Array(frames * ch);
    for(let i = 0; i < frames; i++){
      for(let c = 0; c < ch; c++) out[i * ch + c] = Number(planes[c][i]) || 0;
    }
    return {interleaved: out, frames, channelCount: ch, sampleRate};
  }
  const sampleRate = Number(input.sampleRate);
  const channelCount = Math.floor(Number(input.channelCount ?? (typeof input.channels === 'number' ? input.channels : 1)));
  const frames = Math.floor(Number(input.frames ?? (input.interleaved?.length / Math.max(1, channelCount))) || 0);
  if(!input.interleaved) throw Error('Provide AudioBuffer, channels[], or interleaved PCM.');
  return {
    interleaved: input.interleaved,
    frames,
    channelCount: Math.min(5, Math.max(1, channelCount)),
    sampleRate,
  };
}

/**
 * Offline whole-file / clip programme loudness (not live-session I*).
 * Runs K-weighted LoudnessMeter over the full PCM and returns programme
 * Integrated + LRA (+ true-peak). integratedIsLiveSession is always false.
 */
export function measureOfflineBuffer(input, {chunkFrames = 16384} = {}){
  const {interleaved, frames, channelCount, sampleRate} = resolveOfflineInput(input);
  if(!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000){
    throw Error('Offline loudness needs sample rate between 8 kHz and 384 kHz.');
  }
  if(!(frames >= 0)) throw Error('Offline loudness needs a non-negative frame count.');
  const meter = createLoudnessMeter({sampleRate, channels: channelCount});
  const chunk = Math.max(1, Math.floor(Number(chunkFrames) || 16384));
  for(let off = 0; off < frames; off += chunk){
    const n = Math.min(chunk, frames - off);
    const slice = interleaved instanceof Float64Array || interleaved instanceof Float32Array
      ? interleaved.subarray(off * channelCount, (off + n) * channelCount)
      : Array.prototype.slice.call(interleaved, off * channelCount, (off + n) * channelCount);
    meter.pushInterleaved(slice, n);
  }
  return {
    kind: 'programme',
    integratedIsLiveSession: false,
    integratedLufs: meter.integratedLufs(),
    loudnessRangeLu: meter.loudnessRangeLu(),
    truePeakDbtp: meter.truePeakDbtp(),
    samplePeakDbfs: meter.samplePeakDbfs(),
    momentaryLufs: meter.momentaryLufs(),
    shortTermLufs: meter.shortTermLufs(),
    durationSec: frames / sampleRate,
    sampleRate,
    channels: channelCount,
    blocks: meter.blocks(),
  };
}

/**
 * Same as measureOfflineBuffer but yields to the event loop between chunks so
 * overview Play / UI stay responsive. Tests use the sync path.
 */
export async function measureOfflineBufferAsync(input, {
  chunkFrames = 16384,
  yieldEveryChunks = 4,
  yieldFn = null,
} = {}){
  const {interleaved, frames, channelCount, sampleRate} = resolveOfflineInput(input);
  if(!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000){
    throw Error('Offline loudness needs sample rate between 8 kHz and 384 kHz.');
  }
  const meter = createLoudnessMeter({sampleRate, channels: channelCount});
  const chunk = Math.max(1, Math.floor(Number(chunkFrames) || 16384));
  const every = Math.max(1, Math.floor(Number(yieldEveryChunks) || 4));
  const yieldPause = typeof yieldFn === 'function'
    ? yieldFn
    : () => new Promise((r) => setTimeout(r, 0));
  let chunks = 0;
  for(let off = 0; off < frames; off += chunk){
    const n = Math.min(chunk, frames - off);
    const slice = interleaved instanceof Float64Array || interleaved instanceof Float32Array
      ? interleaved.subarray(off * channelCount, (off + n) * channelCount)
      : Array.prototype.slice.call(interleaved, off * channelCount, (off + n) * channelCount);
    meter.pushInterleaved(slice, n);
    chunks += 1;
    if(chunks % every === 0) await yieldPause();
  }
  return {
    kind: 'programme',
    integratedIsLiveSession: false,
    integratedLufs: meter.integratedLufs(),
    loudnessRangeLu: meter.loudnessRangeLu(),
    truePeakDbtp: meter.truePeakDbtp(),
    samplePeakDbfs: meter.samplePeakDbfs(),
    momentaryLufs: meter.momentaryLufs(),
    shortTermLufs: meter.shortTermLufs(),
    durationSec: frames / sampleRate,
    sampleRate,
    channels: channelCount,
    blocks: meter.blocks(),
  };
}

/** Format LRA (LU) for readout. */
export function formatLoudnessRange(value, {digits = 1} = {}){
  const v = Number(value);
  if(!Number.isFinite(v) || v < 0) return '— LU';
  return v.toFixed(digits) + ' LU';
}
