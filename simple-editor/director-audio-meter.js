/** Spectrum / band meter + BS.1770 loudness/true-peak — JS port of mmathen BandAnalyzer + fractional-octave bands
 * (tools/mmathen/include/mmathen/analysis/analyzer.h + spectrum.h). Browser uses
 * Web Audio AnalyserNode bins mapped onto the same IEC 61260-1 band edges; ballistics
 * match mmath (instant attack, linear release dB/s, peak hold). Native C++ is not
 * linked into ComfyUI — this is the Director surface until a rebuild exists.
 */
export {
  MMATH_LOUDNESS_FLOOR,
  TRUE_PEAK_PHASES,
  TRUE_PEAK_TAPS_PER_PHASE,
  TRUE_PEAK_DELAY_SAMPLES,
  kWeighting,
  createBiquad,
  createTruePeakInterpolator,
  createTruePeakDetector,
  truePeakCoeffTable,
  createLoudnessMeter,
  lufsOf,
  formatLoudnessReading,
  formatLoudnessRange,
  audioBufferToInterleaved,
  measureOfflineBuffer,
  measureOfflineBufferAsync,
} from './director-audio-loudness.js';

export const MMATH_SPECTRUM_FLOOR_DB = -300;
export const AUDIO_METER_DISPLAY_FLOOR_DB = -60;
export const AUDIO_METER_DISPLAY_CEILING_DB = 0;

/** Defaults mirror mmath MeterBallistics + third-octave voice range. */
export const DEFAULT_AUDIO_METER = Object.freeze({
  enabled: true,
  loudnessEnabled: true,
  bandsPerOctave: 3,
  releaseDbPerSec: 24,
  peakHoldSec: 1,
  fMinHz: 20,
  fMaxHz: 16000,
});

export function isDefaultAudioMeter(prefs){
  const n = normalizeAudioMeter(prefs);
  const d = DEFAULT_AUDIO_METER;
  return n.enabled === d.enabled
    && n.loudnessEnabled === d.loudnessEnabled
    && n.bandsPerOctave === d.bandsPerOctave
    && n.releaseDbPerSec === d.releaseDbPerSec
    && n.peakHoldSec === d.peakHoldSec
    && n.fMinHz === d.fMinHz
    && n.fMaxHz === d.fMaxHz;
}

/** Fill missing fields; never mutates input. */
export function normalizeAudioMeter(raw){
  const d = DEFAULT_AUDIO_METER;
  if(raw == null || raw === undefined) return {...d};
  const bandsPerOctave = Math.floor(Number(raw.bandsPerOctave));
  const releaseDbPerSec = Number(raw.releaseDbPerSec);
  const peakHoldSec = Number(raw.peakHoldSec);
  const fMinHz = Number(raw.fMinHz);
  const fMaxHz = Number(raw.fMaxHz);
  return {
    enabled: raw.enabled === undefined ? d.enabled : !!raw.enabled,
    loudnessEnabled: raw.loudnessEnabled === undefined ? d.loudnessEnabled : !!raw.loudnessEnabled,
    bandsPerOctave: bandsPerOctave === 1 || bandsPerOctave === 3 ? bandsPerOctave : d.bandsPerOctave,
    releaseDbPerSec: Number.isFinite(releaseDbPerSec) && releaseDbPerSec > 0 ? releaseDbPerSec : d.releaseDbPerSec,
    peakHoldSec: Number.isFinite(peakHoldSec) && peakHoldSec >= 0 ? peakHoldSec : d.peakHoldSec,
    fMinHz: Number.isFinite(fMinHz) && fMinHz > 0 ? fMinHz : d.fMinHz,
    fMaxHz: Number.isFinite(fMaxHz) && fMaxHz > 0 ? fMaxHz : d.fMaxHz,
  };
}

/** Throws artist-facing errors (same style as validateDucking). Undefined = omit OK. */
export function validateAudioMeter(prefs){
  if(prefs === undefined) return;
  if(!prefs || typeof prefs !== 'object') throw Error('Audio meter settings must be an object.');
  if(prefs.enabled !== undefined && typeof prefs.enabled !== 'boolean'){
    throw Error('Audio meter enabled must be true or false.');
  }
  if(prefs.loudnessEnabled !== undefined && typeof prefs.loudnessEnabled !== 'boolean'){
    throw Error('Audio meter loudnessEnabled must be true or false.');
  }
  if(prefs.bandsPerOctave !== undefined){
    const b = Math.floor(Number(prefs.bandsPerOctave));
    if(b !== 1 && b !== 3) throw Error('Audio meter bands must be 1 (octave) or 3 (third-octave).');
  }
  if(prefs.releaseDbPerSec !== undefined){
    const r = Number(prefs.releaseDbPerSec);
    if(!Number.isFinite(r) || !(r > 0) || r > 120) throw Error('Audio meter release must be between 0 and 120 dB/s.');
  }
  if(prefs.peakHoldSec !== undefined){
    const h = Number(prefs.peakHoldSec);
    if(!Number.isFinite(h) || h < 0 || h > 10) throw Error('Audio meter peak hold must be 0–10 seconds.');
  }
  if(prefs.fMinHz !== undefined || prefs.fMaxHz !== undefined){
    const lo = prefs.fMinHz === undefined ? DEFAULT_AUDIO_METER.fMinHz : Number(prefs.fMinHz);
    const hi = prefs.fMaxHz === undefined ? DEFAULT_AUDIO_METER.fMaxHz : Number(prefs.fMaxHz);
    if(!Number.isFinite(lo) || !Number.isFinite(hi) || !(lo > 0) || lo > hi || hi > 96000){
      throw Error('Audio meter frequency range must be positive Hz with min ≤ max (≤ 96 kHz).');
    }
  }
}

/** Persist only when non-default; clears field when back to defaults. */
export function setAudioMeter(project, partial){
  if(!project || typeof project !== 'object') throw Error('Need a project to store audio meter settings.');
  const next = normalizeAudioMeter({...normalizeAudioMeter(project.audioMeter), ...partial});
  validateAudioMeter(next);
  if(isDefaultAudioMeter(next)){
    delete project.audioMeter;
  }else{
    project.audioMeter = next;
  }
  return normalizeAudioMeter(project.audioMeter);
}

export function clearAudioMeter(project){
  if(project && 'audioMeter' in project) delete project.audioMeter;
}

/**
 * IEC 61260-1:2014 base-ten fractional-octave bands (mmath spectrum.h).
 * bandsPerOctave: 1 or 3. Returns [{lower, mid, upper}, ...] Hz.
 */
export function fractionalOctaveBands(bandsPerOctave, fMinHz, fMaxHz){
  const bpo = Math.floor(Number(bandsPerOctave));
  const lo = Number(fMinHz);
  const hi = Number(fMaxHz);
  if((bpo !== 1 && bpo !== 3) || !Number.isFinite(lo) || !Number.isFinite(hi) || !(lo > 0) || lo > hi){
    throw Error('fractionalOctaveBands needs bandsPerOctave 1|3 and 0 < fMin ≤ fMax.');
  }
  const b = bpo;
  const g = Math.pow(10, 0.3);
  const xLo = Math.ceil(b * Math.log(lo / 1000) / Math.log(g) - 1e-9);
  const xHi = Math.floor(b * Math.log(hi / 1000) / Math.log(g) + 1e-9);
  const bands = [];
  for(let x = xLo; x <= xHi; x += 1){
    const fm = 1000 * Math.pow(g, x / b);
    bands.push({
      lower: fm * Math.pow(g, -0.5 / b),
      mid: fm,
      upper: fm * Math.pow(g, 0.5 / b),
    });
  }
  return bands;
}

function powDb(p){
  return p > 0 ? 10 * Math.log10(p) : MMATH_SPECTRUM_FLOOR_DB;
}

/**
 * Map AnalyserNode-style float frequency data (dB per bin) onto band levels.
 * Converts dB → power, sums bins whose centre falls in [lower, upper), returns levelDb.
 * sampleRate / fftSize mirror Web Audio AnalyserNode (binHz = sr/fftSize).
 */
export function mapFrequencyDbToBandLevels(freqDb, sampleRate, fftSize, bands){
  if(!Array.isArray(freqDb) && !(freqDb instanceof Float32Array)){
    throw Error('freqDb must be an array or Float32Array.');
  }
  const sr = Number(sampleRate);
  const n = Math.floor(Number(fftSize));
  if(!Number.isFinite(sr) || !(sr > 0) || !Number.isFinite(n) || n < 16){
    throw Error('sampleRate and fftSize must be positive (fftSize ≥ 16).');
  }
  const binHz = sr / n;
  const out = [];
  for(const band of bands){
    let power = 0;
    let bins = 0;
    const len = freqDb.length;
    for(let k = 0; k < len; k++){
      const f = k * binHz;
      if(f >= band.lower && f < band.upper){
        const db = Number(freqDb[k]);
        if(Number.isFinite(db) && db > MMATH_SPECTRUM_FLOOR_DB){
          power += Math.pow(10, db / 10);
        }
        bins += 1;
      }
    }
    out.push({
      band,
      power,
      levelDb: bins ? powDb(power) : MMATH_SPECTRUM_FLOOR_DB,
      bins,
    });
  }
  return out;
}

/**
 * Streaming band meter with mmath ballistics.
 * display_i = max(raw_i, display_i - release * dt)
 * peak holds peakHoldSec then falls at release (never below display).
 */
export function createBandMeter(prefs){
  const cfg = normalizeAudioMeter(prefs);
  const bands = fractionalOctaveBands(cfg.bandsPerOctave, cfg.fMinHz, cfg.fMaxHz);
  const display = bands.map(() => MMATH_SPECTRUM_FLOOR_DB);
  const peak = bands.map(() => MMATH_SPECTRUM_FLOOR_DB);
  const hold = bands.map(() => 0);
  let raw = bands.map((band) => ({band, power: 0, levelDb: MMATH_SPECTRUM_FLOOR_DB, bins: 0}));

  function reset(){
    for(let i = 0; i < bands.length; i++){
      display[i] = MMATH_SPECTRUM_FLOOR_DB;
      peak[i] = MMATH_SPECTRUM_FLOOR_DB;
      hold[i] = 0;
      raw[i] = {band: bands[i], power: 0, levelDb: MMATH_SPECTRUM_FLOOR_DB, bins: 0};
    }
  }

  function pushRawDb(levelDbArr, dtSec){
    const dt = Math.max(0, Number(dtSec) || 0);
    const release = cfg.releaseDbPerSec;
    const holdSec = cfg.peakHoldSec;
    if(!Array.isArray(levelDbArr) && !(levelDbArr instanceof Float32Array)){
      throw Error('pushRawDb needs a level array.');
    }
    if(levelDbArr.length !== bands.length){
      throw Error(`pushRawDb expected ${bands.length} bands, got ${levelDbArr.length}.`);
    }
    for(let i = 0; i < bands.length; i++){
      const rawDb = Number(levelDbArr[i]);
      const r = Number.isFinite(rawDb) ? rawDb : MMATH_SPECTRUM_FLOOR_DB;
      raw[i] = {band: bands[i], power: r > MMATH_SPECTRUM_FLOOR_DB ? Math.pow(10, r / 10) : 0, levelDb: r, bins: 1};
      // Instant attack, linear fall
      display[i] = Math.max(r, display[i] - release * dt);
      if(r >= peak[i]){
        peak[i] = r;
        hold[i] = holdSec;
      }else if(hold[i] > 0){
        hold[i] = Math.max(0, hold[i] - dt);
      }else{
        peak[i] = Math.max(display[i], peak[i] - release * dt);
      }
    }
  }

  function pushFromAnalyser(freqDb, sampleRate, fftSize, dtSec){
    const levels = mapFrequencyDbToBandLevels(freqDb, sampleRate, fftSize, bands);
    pushRawDb(levels.map((l) => l.levelDb), dtSec);
    raw = levels;
    return levels;
  }

  function overallDisplayDb(){
    let m = MMATH_SPECTRUM_FLOOR_DB;
    for(const v of display) if(v > m) m = v;
    return m;
  }

  function overallPeakDb(){
    let m = MMATH_SPECTRUM_FLOOR_DB;
    for(const v of peak) if(v > m) m = v;
    return m;
  }

  return {
    cfg,
    bands,
    reset,
    pushRawDb,
    pushFromAnalyser,
    overallDisplayDb,
    overallPeakDb,
    display: () => display.slice(),
    peaks: () => peak.slice(),
    raw: () => raw.map((r) => ({...r, band: {...r.band}})),
  };
}

export function dbToMeterUnit(db, {
  floorDb = AUDIO_METER_DISPLAY_FLOOR_DB,
  ceilingDb = AUDIO_METER_DISPLAY_CEILING_DB,
} = {}){
  const lo = Number(floorDb);
  const hi = Number(ceilingDb);
  const v = Number(db);
  if(!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

/** Draw EQ bars + peak ticks onto a canvas (spectrum_app-style stub). */
export function drawBandMeterCanvas(canvas, {
  bands,
  display,
  peaks,
  floorDb = AUDIO_METER_DISPLAY_FLOOR_DB,
  ceilingDb = AUDIO_METER_DISPLAY_CEILING_DB,
  live = false,
} = {}){
  if(!canvas || typeof canvas.getContext !== 'function') throw Error('drawBandMeterCanvas needs a canvas.');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0c121c';
  ctx.fillRect(0, 0, w, h);
  const n = Array.isArray(bands) ? bands.length : 0;
  if(!n){
    ctx.fillStyle = '#8a9bb0';
    ctx.font = '12px sans-serif';
    ctx.fillText(live ? 'No bands in range' : 'Spectrum idle — play with Web Audio for live EQ bars (mmath BandAnalyzer)', 10, h / 2);
    return;
  }
  const gap = 1;
  const barW = Math.max(1, (w - gap * (n + 1)) / n);
  for(let i = 0; i < n; i++){
    const x = gap + i * (barW + gap);
    const d = dbToMeterUnit(display?.[i], {floorDb, ceilingDb});
    const p = dbToMeterUnit(peaks?.[i], {floorDb, ceilingDb});
    const barH = Math.round(d * (h - 4));
    ctx.fillStyle = '#1a2433';
    ctx.fillRect(x, 2, barW, h - 4);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#2d6b4f');
    grad.addColorStop(0.7, '#7dcea0');
    grad.addColorStop(1, '#e8d27a');
    ctx.fillStyle = grad;
    ctx.fillRect(x, h - 2 - barH, barW, barH);
    // Peak hold tick
    const py = h - 2 - Math.round(p * (h - 4));
    ctx.fillStyle = '#f0f6ff';
    ctx.fillRect(x, Math.max(2, py - 1), barW, 2);
  }
  // Floor / ceiling labels
  ctx.fillStyle = '#6a7a90';
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`${ceilingDb} dBFS`, 4, 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${floorDb}`, 4, h - 2);
  if(!live){
    ctx.fillStyle = 'rgba(138,155,176,0.9)';
    ctx.font = '11px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Play overview for live spectrum (mmathen BandAnalyzer port)', w / 2 - 140, h / 2);
  }
}

/**
 * Artist controls for durable project.audioMeter. Writes via change().
 * Returns {section, prefs, refresh}.
 */
export function audioMeterPrefsControls(parent, project, {button, change} = {}){
  if(!parent || !project) return null;
  const section = document.createElement('div');
  section.className = 'audio-meter-prefs';
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Spectrum + loudness (vendored mmathen BandAnalyzer / bs1770.h): IEC EQ bars, K-weighted LUFS, 4× true-peak. Live I* is session-since-Play; use Measure programme loudness for whole-file Integrated + LRA. Saved on the project when not default.';
  section.append(hint);

  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'field';
  const enabled = document.createElement('input');
  enabled.type = 'checkbox';
  enabledLabel.append(enabled, document.createTextNode(' Show spectrum / EQ bars'));
  section.append(enabledLabel);

  const loudLabel = document.createElement('label');
  loudLabel.className = 'field';
  const loudness = document.createElement('input');
  loudness.type = 'checkbox';
  loudLabel.append(loudness, document.createTextNode(' Show loudness / true-peak (BS.1770)'));
  section.append(loudLabel);

  const bandsLabel = document.createElement('label');
  bandsLabel.className = 'field';
  bandsLabel.textContent = 'Band spacing';
  const bandsSel = document.createElement('select');
  for(const [v, label] of [[3, 'Third-octave (default)'], [1, 'Octave']]){
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label;
    bandsSel.append(o);
  }
  bandsLabel.append(bandsSel);
  section.append(bandsLabel);

  const releaseLabel = document.createElement('label');
  releaseLabel.className = 'field';
  releaseLabel.textContent = 'Release (dB/s)';
  const release = document.createElement('input');
  release.type = 'number';
  release.min = 1;
  release.max = 120;
  release.step = 1;
  releaseLabel.append(release);
  section.append(releaseLabel);

  const holdLabel = document.createElement('label');
  holdLabel.className = 'field';
  holdLabel.textContent = 'Peak hold (seconds)';
  const hold = document.createElement('input');
  hold.type = 'number';
  hold.min = 0;
  hold.max = 10;
  hold.step = 0.1;
  holdLabel.append(hold);
  section.append(holdLabel);

  function refresh(){
    const p = normalizeAudioMeter(project.audioMeter);
    enabled.checked = p.enabled;
    loudness.checked = p.loudnessEnabled;
    bandsSel.value = String(p.bandsPerOctave);
    release.value = String(p.releaseDbPerSec);
    hold.value = String(p.peakHoldSec);
  }

  function write(partial){
    if(typeof change === 'function'){
      change(() => setAudioMeter(project, partial));
    }else{
      setAudioMeter(project, partial);
    }
    refresh();
  }

  enabled.onchange = () => write({enabled: enabled.checked});
  loudness.onchange = () => write({loudnessEnabled: loudness.checked});
  bandsSel.onchange = () => write({bandsPerOctave: Number(bandsSel.value)});
  release.onchange = () => write({releaseDbPerSec: Number(release.value)});
  hold.onchange = () => write({peakHoldSec: Number(hold.value)});

  if(typeof button === 'function'){
    section.append(button('Reset meter defaults', () => {
      if(typeof change === 'function') change(() => clearAudioMeter(project));
      else clearAudioMeter(project);
      refresh();
    }));
  }

  refresh();
  parent.append(section);
  return {section, refresh, prefs: () => normalizeAudioMeter(project.audioMeter)};
}

/** Stable key for media refs (matches overview peaks cache). */
export function mediaLoudnessKey(media){
  return [media?.type || 'input', media?.subfolder || '', media?.name || media?.filename || ''].join(':');
}

/** Soft-normalize a stored programme reading; null if unusable. */
export function normalizeProgrammeLoudness(raw){
  if(!raw || typeof raw !== 'object') return null;
  const integratedLufs = Number(raw.integratedLufs);
  const loudnessRangeLu = Number(raw.loudnessRangeLu);
  const truePeakDbtp = Number(raw.truePeakDbtp);
  const sampleRate = Number(raw.sampleRate);
  const durationSec = Number(raw.durationSec);
  const channels = Math.floor(Number(raw.channels));
  if(!Number.isFinite(integratedLufs)) return null;
  return {
    kind: 'programme',
    integratedIsLiveSession: false,
    integratedLufs,
    loudnessRangeLu: Number.isFinite(loudnessRangeLu) ? loudnessRangeLu : 0,
    truePeakDbtp: Number.isFinite(truePeakDbtp) ? truePeakDbtp : -200,
    samplePeakDbfs: Number.isFinite(Number(raw.samplePeakDbfs)) ? Number(raw.samplePeakDbfs) : undefined,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
    channels: channels >= 1 ? channels : undefined,
    blocks: Number.isFinite(Number(raw.blocks)) ? Number(raw.blocks) : undefined,
    measuredAt: typeof raw.measuredAt === 'string' ? raw.measuredAt : undefined,
    mediaKey: typeof raw.mediaKey === 'string' ? raw.mediaKey : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
}

export function getProgrammeLoudness(project, media){
  const key = mediaLoudnessKey(media);
  if(!key || key.endsWith(':')) return null;
  const bag = project?.audioProgrammeLoudness;
  if(!bag || typeof bag !== 'object') return null;
  return normalizeProgrammeLoudness(bag[key]);
}

/** Persist programme reading on project.audioProgrammeLoudness[mediaKey]. */
export function setProgrammeLoudness(project, media, reading){
  if(!project || typeof project !== 'object') throw Error('Need a project to store programme loudness.');
  const key = mediaLoudnessKey(media);
  if(!key || key.endsWith(':')) throw Error('Media needs a name to cache programme loudness.');
  const norm = normalizeProgrammeLoudness({
    ...reading,
    mediaKey: key,
    measuredAt: reading?.measuredAt || new Date().toISOString(),
  });
  if(!norm) throw Error('Programme loudness reading is incomplete.');
  if(!project.audioProgrammeLoudness || typeof project.audioProgrammeLoudness !== 'object'){
    project.audioProgrammeLoudness = {};
  }
  project.audioProgrammeLoudness[key] = norm;
  return norm;
}

export function clearProgrammeLoudness(project, media){
  if(!project?.audioProgrammeLoudness || typeof project.audioProgrammeLoudness !== 'object') return;
  if(media == null){
    delete project.audioProgrammeLoudness;
    return;
  }
  const key = mediaLoudnessKey(media);
  delete project.audioProgrammeLoudness[key];
  if(!Object.keys(project.audioProgrammeLoudness).length) delete project.audioProgrammeLoudness;
}
