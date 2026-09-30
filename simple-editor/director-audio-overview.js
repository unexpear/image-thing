/** Whole-track audio overview — mmath spectrum_app inspired (vendored: tools/mmathen).
 * Peaks strip, playhead cursor, click-seek, A/B selection, optional Web Audio gain ramps.
 * Live spectrum / EQ bars: director-audio-meter.js (BandAnalyzer + IEC bands port).
 * Live LUFS / true-peak: director-audio-loudness.js (bs1770.h port) via Analyser time-domain.
 * Programme Integrated + LRA: decodeMediaAudioBuffer -> measureOfflineBuffer (whole-file / clip);
 * silent server fallback via /studio/director/pcm -> OfflineBuffer, else /studio/director/programme-loudness.
 * Clips longer than STUDIO_PCM_MAX_DURATION_SEC skip PCM / heavy OfflineBuffer and use full-file
 * /programme-loudness (never truncated PCM).
 */
import {
  FadeCurve,
  createTransportGain,
  softSeekMedia,
  spliceSeekMedia,
  ensureSpliceAlt,
  fadeInGain,
  TRANSPORT_PLAY_RAMP_MS,
  TRANSPORT_SEEK_RAMP_MS,
  TRANSPORT_LONG_SEEK_SEC,
  splitClip,
} from './director-audio-edit.js';
import {
  normalizeAudioMeter,
  createBandMeter,
  drawBandMeterCanvas,
  dbToMeterUnit,
  audioMeterPrefsControls,
  AUDIO_METER_DISPLAY_FLOOR_DB,
  createLoudnessMeter,
  formatLoudnessReading,
  formatLoudnessRange,
  MMATH_LOUDNESS_FLOOR,
  measureOfflineBufferAsync,
  getProgrammeLoudness,
  setProgrammeLoudness,
  mediaLoudnessKey,
} from './director-audio-meter.js';
import {addBeatMarker, beatMarkerControls, drawBeatMarkerTicks} from './director-beat-markers.js';

export const AUDIO_OVERVIEW_BINS = 1800;

/** Match studio_director/waveform.py PCM_MAX_DURATION_SEC (~34 MB mono f32 @ 48 kHz). */
export const STUDIO_PCM_MAX_DURATION_SEC = 180;

const peaksCache = new Map();

export function mediaViewURL(file){
  return '/view?' + new URLSearchParams({
    filename: file.name || file.filename || '',
    subfolder: file.subfolder || '',
    type: file.type || 'input',
  });
}

export function maxPoolPeaks(peaks, width){
  if(!Array.isArray(peaks) || !peaks.length) return [];
  const w = Math.max(1, Math.floor(Number(width) || 1));
  const out = new Array(w);
  const n = peaks.length;
  for(let x = 0; x < w; x++){
    const a = Math.floor(x * n / w);
    const b = Math.max(a + 1, Math.floor((x + 1) * n / w));
    let m = 0;
    for(let i = a; i < b && i < n; i++){
      const v = Number(peaks[i]) || 0;
      if(v > m) m = v;
    }
    out[x] = m;
  }
  return out;
}

export function normalizePeaksDisplay(peaks, {floor = 0.05} = {}){
  if(!Array.isArray(peaks)) throw Error('Peaks must be an array.');
  let max = 0;
  for(const p of peaks){
    const v = Number(p) || 0;
    if(v > max) max = v;
  }
  const scale = Math.max(max, floor);
  return peaks.map(p => Math.max(0, Math.min(1, (Number(p) || 0) / scale)));
}

export async function fetchWaveformPeaks(media){
  const key = [media?.type || 'input', media?.subfolder || '', media?.name || media?.filename || ''].join(':');
  if(!key.endsWith(':') && peaksCache.has(key)) return peaksCache.get(key);
  const job = (async () => {
    const r = await fetch('/studio/director/waveform', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Studio-Director': '1'},
      body: JSON.stringify({media}),
    });
    const result = await r.json().catch(() => ({}));
    if(!r.ok) throw Error(result.error || 'Waveform could not be read.');
    if(!Array.isArray(result.peaks) || !result.peaks.length) throw Error('Waveform returned no peaks.');
    return {duration: result.duration, peaks: result.peaks};
  })();
  if(key && !key.endsWith(':')){
    peaksCache.set(key, job);
    job.catch(() => { if(peaksCache.get(key) === job) peaksCache.delete(key); });
  }
  return job;
}

const pcmDecodeCache = new Map();

/**
 * Fetch overview media bytes and decode to AudioBuffer via Web Audio.
 * Same-origin /view? paths usually work; CORS / element-only hosts may fail —
 * callers should surface that honest gap and still keep the OfflineBuffer API.
 */
export async function decodeMediaAudioBuffer(media, {
  audioContext = null,
  fetchImpl = null,
  cache = true,
} = {}){
  const key = mediaLoudnessKey(media);
  if(cache && key && !key.endsWith(':') && pcmDecodeCache.has(key)){
    return pcmDecodeCache.get(key);
  }
  const job = (async () => {
    const ctx = audioContext || getAudioContext();
    if(!ctx) throw Error('Web Audio AudioContext unavailable — cannot decode PCM for programme loudness.');
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if(!fetcher) throw Error('fetch unavailable for media decode.');
    const url = mediaViewURL(media);
    const r = await fetcher(url);
    if(!r.ok) throw Error('Could not fetch media for programme loudness (' + r.status + ').');
    const ab = await r.arrayBuffer();
    const copy = ab.slice(0);
    if(typeof ctx.decodeAudioData !== 'function'){
      throw Error('AudioContext.decodeAudioData missing.');
    }
    // Prefer promise form; fall back to callback form.
    try{
      const p = ctx.decodeAudioData(copy);
      if(p && typeof p.then === 'function') return await p;
    }catch{
      /* callback path */
    }
    return await new Promise((resolve, reject) => {
      try{
        ctx.decodeAudioData(
          copy,
          (buf) => resolve(buf),
          (err) => reject(Error(err?.message || 'decodeAudioData failed (CORS, unsupported codec, or element-only media).'))
        );
      }catch(e){
        reject(Error(e?.message || 'decodeAudioData failed.'));
      }
    });
  })();
  if(cache && key && !key.endsWith(':')){
    pcmDecodeCache.set(key, job);
    job.catch(() => { if(pcmDecodeCache.get(key) === job) pcmDecodeCache.delete(key); });
  }
  return job;
}

const studioPcmCache = new Map();

/**
 * Studio ffmpeg -> interleaved float32 PCM (base64) for OfflineBuffer when browser
 * decodeAudioData / CORS fails. Same media body + Director header as waveform peaks.
 */
export async function fetchStudioPcm(media, {fetchImpl = null, cache = true} = {}){
  const key = mediaLoudnessKey(media);
  if(cache && key && !key.endsWith(':') && studioPcmCache.has(key)){
    return studioPcmCache.get(key);
  }
  const job = (async () => {
    const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if(!fetcher) throw Error('fetch unavailable for studio PCM.');
    const r = await fetcher('/studio/director/pcm', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Studio-Director': '1'},
      body: JSON.stringify({media}),
    });
    const result = await r.json().catch(() => ({}));
    if(!r.ok) throw Error(result.error || 'Studio PCM unavailable.');
    if(result.encoding !== 'f32le' || typeof result.pcmBase64 !== 'string'){
      throw Error('Studio PCM response missing f32le payload.');
    }
    const sampleRate = Number(result.sampleRate);
    const channelCount = Math.floor(Number(result.channelCount));
    const frames = Math.floor(Number(result.frames));
    if(!(sampleRate >= 8000) || !(channelCount >= 1) || !(frames >= 0)){
      throw Error('Studio PCM metadata invalid.');
    }
    let bin;
    if(typeof atob === 'function'){
      bin = atob(result.pcmBase64);
    }else if(typeof Buffer !== 'undefined'){
      bin = Buffer.from(result.pcmBase64, 'base64').toString('binary');
    }else{
      throw Error('No base64 decoder for studio PCM.');
    }
    const bytes = new Uint8Array(bin.length);
    for(let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const interleaved = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
    if(interleaved.length < frames * channelCount){
      throw Error('Studio PCM payload shorter than frame count.');
    }
    return {
      sampleRate,
      channelCount,
      frames,
      duration: Number(result.duration) || (frames / sampleRate),
      interleaved: interleaved.subarray(0, frames * channelCount),
      source: 'server-pcm',
    };
  })();
  if(cache && key && !key.endsWith(':')){
    studioPcmCache.set(key, job);
    job.catch(() => { if(studioPcmCache.get(key) === job) studioPcmCache.delete(key); });
  }
  return job;
}

/**
 * Studio ffmpeg loudnorm summary (I / LRA / TP) when PCM transfer is too large or fails.
 * Contract mirrors durable programme cache fields.
 */
export async function fetchProgrammeLoudnessServer(media, {fetchImpl = null} = {}){
  const fetcher = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if(!fetcher) throw Error('fetch unavailable for programme loudness.');
  const r = await fetcher('/studio/director/programme-loudness', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Studio-Director': '1'},
    body: JSON.stringify({media}),
  });
  const result = await r.json().catch(() => ({}));
  if(!r.ok) throw Error(result.error || 'Studio programme loudness unavailable.');
  const integratedLufs = Number(result.integratedLufs);
  if(!Number.isFinite(integratedLufs)) throw Error('Studio programme loudness missing Integrated.');
  return {
    kind: 'programme',
    integratedIsLiveSession: false,
    integratedLufs,
    loudnessRangeLu: Number(result.loudnessRangeLu),
    truePeakDbtp: Number(result.truePeakDbtp),
    durationSec: Number.isFinite(Number(result.durationSec)) ? Number(result.durationSec) : undefined,
    source: result.source || 'server-ffmpeg',
  };
}

/** Shared AudioContext + GainNode graph for de-clicked preview (one per page). */
let sharedCtx = null;
const wiredElements = new WeakMap();

export function getAudioContext(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  if(!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AC();
  return sharedCtx;
}

/**
 * Attach an HTMLMediaElement to a GainNode for sample-accurate ramps when Web Audio allows.
 * Falls back to element.volume TransportGain via softSeekMedia.
 */
export function ensureMediaGraph(media){
  if(!media) return null;
  if(wiredElements.has(media)) return wiredElements.get(media);
  const ctx = getAudioContext();
  if(!ctx){
    const fallback = {kind: 'element', media, gain: createTransportGain(media.volume || 0), pendingSeek: null};
    wiredElements.set(media, fallback);
    return fallback;
  }
  try{
    const source = ctx.createMediaElementSource(media);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    const graph = {kind: 'webaudio', media, ctx, source, gainNode: gain, pendingSeek: null, target: 0};
    wiredElements.set(media, graph);
    return graph;
  }catch{
    // Already wired elsewhere or unsupported — element.volume path.
    const fallback = {kind: 'element', media, gain: createTransportGain(media.volume || 0), pendingSeek: null};
    wiredElements.set(media, fallback);
    return fallback;
  }
}

/** Attach AnalyserNode after gain for live spectrum (mmath BandAnalyzer feed). */
export function ensureMediaAnalyser(graph, {fftSize = 2048} = {}){
  if(!graph || graph.kind !== 'webaudio' || !graph.ctx || !graph.gainNode) return null;
  if(graph.analyser) return graph.analyser;
  try{
    const analyser = graph.ctx.createAnalyser();
    const size = Math.floor(Number(fftSize)) || 2048;
    analyser.fftSize = size;
    analyser.smoothingTimeConstant = 0; // Director ballistics own the fall
    graph.gainNode.disconnect();
    graph.gainNode.connect(analyser);
    analyser.connect(graph.ctx.destination);
    graph.analyser = analyser;
    graph.freqDb = new Float32Array(analyser.frequencyBinCount);
    graph.timeDomain = new Float32Array(analyser.fftSize);
    return analyser;
  }catch{
    return null;
  }
}

export function webAudioSetGain(graph, level, rampSec, curve = FadeCurve.Linear){
  if(!graph || graph.kind !== 'webaudio') return;
  const g = graph.gainNode.gain;
  const ctx = graph.ctx;
  const dest = Math.min(1, Math.max(0, Number(level) || 0));
  const now = ctx.currentTime;
  const dur = Math.max(0, Number(rampSec) || 0);
  try{ g.cancelScheduledValues(now); }catch{}
  const start = Math.max(0, g.value);
  g.setValueAtTime(start, now);
  graph.target = dest;
  if(dur <= 0){
    g.setValueAtTime(dest, now);
    return;
  }
  if(curve === FadeCurve.EqualPower || curve === FadeCurve.RaisedCosine){
    // Approximate curve with a few linear segments.
    const steps = 8;
    for(let i = 1; i <= steps; i++){
      const u = i / steps;
      const w = fadeInGain(curve, u);
      g.linearRampToValueAtTime(start + (dest - start) * w, now + dur * u);
    }
  }else{
    g.linearRampToValueAtTime(dest, now + dur);
  }
}

/** Format overview hover / status times (m:ss.cc or N.NNs). */
export function formatOverviewTime(sec){
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if(m > 0){
    const whole = Math.floor(r);
    const frac = Math.round((r - whole) * 100);
    return `${m}:${String(whole).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
  }
  return `${r.toFixed(2)}s`;
}

/** Map pointer clientX within an element rect to [0, duration] seconds. */
export function hoverTimeFromClientX(clientX, rect, duration){
  const w = Math.max(1, Number(rect?.width) || 0);
  const left = Number(rect?.left) || 0;
  const x = Math.max(0, Math.min(w, (Number(clientX) || 0) - left));
  const d = Math.max(0, Number(duration) || 0);
  if(d <= 0) return 0;
  return (x / w) * d;
}

/**
 * Dashed ghost + time chip at hoverTime (overview canvas + media-trim scrub).
 * Pass xOf(sec) for windowed overview mapping, or duration for linear [0,duration]→[0,width].
 */
export function drawHoverTimeChip(ctx, hoverTime, {
  width,
  height,
  xOf = null,
  duration = null,
  suffix = ' · seek',
  chipTop = 4,
} = {}){
  if(!ctx || hoverTime == null || !Number.isFinite(hoverTime)) return;
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  let hx;
  if(typeof xOf === 'function') hx = xOf(hoverTime);
  else {
    const d = Math.max(0, Number(duration) || 0);
    hx = d > 0 ? (hoverTime / d) * w : 0;
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(hx + 0.5, 0);
  ctx.lineTo(hx + 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);
  const label = formatOverviewTime(hoverTime) + (suffix || '');
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const pad = 5;
  const tw = ctx.measureText(label).width + pad * 2;
  const th = 16;
  let lx = hx + 8;
  if(lx + tw > w - 2) lx = hx - tw - 8;
  lx = Math.max(2, Math.min(w - tw - 2, lx));
  const ty = Math.max(2, Number(chipTop) || 4);
  ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(lx, ty, tw, th);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8f0ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx + pad, ty + th / 2);
  ctx.restore();
}

export function overviewAbRegion(selectionStart, selectionEnd, {
  markA = null,
  markB = null,
  minSpan = 1 / 24,
} = {}){
  const lo = Math.min(Number(selectionStart) || 0, Number(selectionEnd) || 0);
  const hi = Math.max(Number(selectionStart) || 0, Number(selectionEnd) || 0);
  const complete = hi - lo >= minSpan;
  const a = markA == null ? null : Number(markA);
  const b = markB == null ? null : Number(markB);
  const halfDone = !complete && (
    (a != null && Number.isFinite(a)) ||
    (b != null && Number.isFinite(b))
  );
  return {lo, hi, complete, halfDone, markA: a, markB: b};
}

/** Needle display time while soft-seek / splice is in flight (prefer target over lagging media clock). */
export function overviewNeedleTime(cursor, graph){
  if(graph?.splice?.active && Number.isFinite(graph.splice.target)) return graph.splice.target;
  if(graph?.pendingSeek != null && Number.isFinite(graph.pendingSeek)) return graph.pendingSeek;
  return Number(cursor) || 0;
}

export function drawOverviewCanvas(canvas, {
  peaks,
  duration,
  viewStart = 0,
  viewEnd = null,
  selectionStart = 0,
  selectionEnd = 0,
  cursor = 0,
  playing = false,
  seeking = false,
  hoverTime = null,
  markA = null,
  markB = null,
  beatMarkers = null,
} = {}){
  const w = canvas.clientWidth || canvas.width || 900;
  const h = canvas.clientHeight || canvas.height || 140;
  if(canvas.width !== w) canvas.width = w;
  if(canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  const end = viewEnd == null ? duration : viewEnd;
  const span = Math.max(1e-6, end - viewStart);
  ctx.fillStyle = '#101824';
  ctx.fillRect(0, 0, w, h);
  const xOf = s => (s - viewStart) / span * w;
  const ab = overviewAbRegion(selectionStart, selectionEnd, {markA, markB});
  // Selection (A/B) — spectrum_app style: soft cyan fill + edge needles
  if(ab.complete){
    const xa = xOf(ab.lo);
    const xb = xOf(ab.hi);
    ctx.fillStyle = 'rgba(120, 200, 255, 0.16)';
    ctx.fillRect(xa, 0, Math.max(1, xb - xa), h);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.86)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xa + 0.5, 0); ctx.lineTo(xa + 0.5, h);
    ctx.moveTo(xb + 0.5, 0); ctx.lineTo(xb + 0.5, h);
    ctx.stroke();
    // Tiny A / B caps
    ctx.fillStyle = 'rgba(180, 220, 255, 0.95)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('A', Math.max(2, xa + 3), 2);
    const bw = ctx.measureText('B').width;
    ctx.fillText('B', Math.min(w - bw - 2, xb - bw - 3), 2);
  }else if(ab.halfDone){
    // Provisional single-edge while drag has not yet formed a span (half-done A/B)
    const edge = Number.isFinite(ab.markA) ? ab.markA : ab.markB;
    const xe = xOf(edge);
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xe + 0.5, 0); ctx.lineTo(xe + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = 'rgba(180, 220, 255, 0.95)';
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('A', Math.max(2, xe + 3), 2);
  }
  // Peaks: take the bins covering the visible window, display-normalize, max-pool into pixels
  if(peaks?.length && duration > 0){
    const n = peaks.length;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(viewStart / duration * n)));
    const i1 = Math.max(i0 + 1, Math.min(n, Math.ceil(end / duration * n)));
    const slice = peaks.slice(i0, i1);
    const pooled = maxPoolPeaks(normalizePeaksDisplay(slice), w);
    ctx.strokeStyle = '#a6d1f7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const mid = h / 2;
    for(let x = 0; x < w; x++){
      const amp = (pooled[x] || 0) * (h * 0.42);
      ctx.moveTo(x + 0.5, mid - amp);
      ctx.lineTo(x + 0.5, mid + amp);
    }
    ctx.stroke();
  }
  // Beat markers (source-time ticks; orange diamonds)
  if(beatMarkers?.length){
    drawBeatMarkerTicks(ctx, beatMarkers, {
      width: w,
      height: h,
      xOf,
      viewStart,
      viewEnd: end,
    });
  }
  // Hover ghost (spectrum_app tooltip-at-mouse analogue)
  drawHoverTimeChip(ctx, hoverTime, {width: w, height: h, xOf});
  // Playhead needle — brighter core + glow + top chevron (clearer than 2px rect)
  const cx = xOf(cursor);
  const needleColor = seeking ? '#9fd4ff' : (playing ? '#8ee0b0' : '#ffe9a8');
  ctx.save();
  ctx.shadowColor = needleColor;
  ctx.shadowBlur = seeking ? 10 : 6;
  ctx.strokeStyle = needleColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, 9);
  ctx.lineTo(cx + 0.5, h);
  ctx.stroke();
  ctx.restore();
  // Solid core (no shadow) for crisp edge
  ctx.strokeStyle = playing && !seeking ? '#d8ffe8' : '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, 9);
  ctx.lineTo(cx + 0.5, h);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Chevron head
  ctx.fillStyle = needleColor;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx + 6, 9);
  ctx.lineTo(cx - 6, 9);
  ctx.closePath();
  ctx.fill();
}

/**
 * Interactive whole-track overview for a media ref + optional track timing fields.
 * track: {media, sourceStart?, duration?} — mutates via change() on trim/split actions.
 */
export function audioOverviewControls(parent, track, project, {
  button,
  change,
  splitTracks = null,
  title = 'Audio overview · peaks, scrub & transport',
  autoLoad = true,
} = {}){
  if(!track?.media) return null;
  const section = document.createElement('details');
  section.className = 'settings audio-overview';
  section.dataset.plan = 'overview-' + (track.id || 'shot');
  section.open = true;
  const summary = document.createElement('summary');
  summary.textContent = title;
  section.append(summary);
  const status = document.createElement('p');
  status.className = 'hint';
  status.setAttribute('role', 'status');
  status.textContent = 'Loading whole-track overview…';
  section.append(status);

  let data = null;
  let start = Number(track.sourceStart) || 0;
  let end = start + (Number(track.duration) || 0);
  let cursor = start;
  let viewStart = 0;
  let viewEnd = 0;
  let anchor = null;
  let preview = null; // {audio, graph, raf, playing, alt, seekBag}
  let hoverTime = null;
  let lastSeekAt = 0;
  const SEEK_THROTTLE_MS = 40;

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 140;
  canvas.className = 'audio-waveform audio-overview-canvas';
  canvas.title = 'Hover for time · click seek · drag A/B';
  canvas.setAttribute('aria-label', 'Whole-track audio overview');
  canvas.style.touchAction = 'none';

  const meter = document.createElement('div');
  meter.className = 'audio-overview-meter';
  meter.setAttribute('aria-hidden', 'true');
  const meterFill = document.createElement('span');
  const meterPeak = document.createElement('i');
  meterPeak.className = 'audio-overview-meter-peak';
  meter.append(meterFill, meterPeak);

  const spectrum = document.createElement('canvas');
  spectrum.width = 900;
  spectrum.height = 72;
  spectrum.className = 'audio-overview-spectrum';
  spectrum.setAttribute('aria-label', 'Fractional-octave spectrum meter');
  spectrum.title = 'mmathen BandAnalyzer port — IEC EQ bars + peak hold';

  const loudnessReadout = document.createElement('div');
  loudnessReadout.className = 'audio-overview-loudness';
  loudnessReadout.setAttribute('aria-live', 'polite');
  loudnessReadout.title = 'BS.1770 K-weighted LUFS + 4× true-peak (mmathen bs1770.h port). Integrated is live-session since Play, not offline whole-file.';

  const programmeReadout = document.createElement('div');
  programmeReadout.className = 'audio-overview-programme';
  programmeReadout.setAttribute('aria-live', 'polite');
  programmeReadout.title = 'Offline whole-file / clip programme loudness (BS.1770 Integrated + EBU Tech 3342 LRA). Distinct from live I* session meter.';
  let programmeReading = getProgrammeLoudness(project, track.media);
  let programmeBusy = false;

  let bandMeter = null;
  let loudnessMeter = null;
  let lastMeterTs = 0;
  let meterFreqBuf = null;
  let meterTimeBuf = null;
  let loudnessSampleCarry = 0;

  function meterPrefs(){
    return normalizeAudioMeter(project?.audioMeter);
  }

  function rebuildBandMeter(){
    const prefs = meterPrefs();
    bandMeter = createBandMeter(prefs);
    lastMeterTs = 0;
    loudnessSampleCarry = 0;
    loudnessMeter = null;
    updateLoudnessReadout(false);
    drawSpectrum(false);
  }

  function ensureLoudnessMeter(sampleRate){
    const sr = Number(sampleRate) || 48000;
    if(!loudnessMeter || loudnessMeter.sampleRate !== sr){
      loudnessMeter = createLoudnessMeter({sampleRate: sr, channels: 1});
    }
    return loudnessMeter;
  }

  function updateLoudnessReadout(live){
    const prefs = meterPrefs();
    loudnessReadout.hidden = !prefs.loudnessEnabled;
    if(!prefs.loudnessEnabled){
      programmeReadout.hidden = true;
      return;
    }
    programmeReadout.hidden = false;
    if(!loudnessMeter || !live){
      loudnessReadout.innerHTML =
        '<span class="loud-m">M —</span> <span class="loud-s">S —</span> <span class="loud-i">I* —</span> <span class="loud-tp">TP —</span>' +
        '<span class="loud-gap"> Live (session since Play) — Play for M / S / I* / TP</span>';
    }else{
      const m = formatLoudnessReading(loudnessMeter.momentaryLufs());
      const s = formatLoudnessReading(loudnessMeter.shortTermLufs());
      const i = formatLoudnessReading(loudnessMeter.integratedLufs());
      const tp = formatLoudnessReading(loudnessMeter.truePeakDbtp(), {unit: 'dBTP'});
      loudnessReadout.innerHTML =
        '<span class="loud-m">M ' + m + '</span> <span class="loud-s">S ' + s + '</span> ' +
        '<span class="loud-i" title="Live session since Play — not offline programme LUFS">I* ' + i + '</span> ' +
        '<span class="loud-tp">TP ' + tp + '</span>' +
        '<span class="loud-gap"> live session (not programme)</span>';
    }
    updateProgrammeReadout();
  }

  function programmeSourceLabel(reading){
    const src = reading?.source;
    if(src === 'server-ffmpeg') return 'full file (studio ffmpeg)';
    if(src === 'server-pcm') return 'full file (studio PCM)';
    if(src === 'browser-pcm') return 'full file (browser PCM)';
    return 'full file';
  }

  function updateProgrammeReadout(){
    const prefs = meterPrefs();
    programmeReadout.hidden = !prefs.loudnessEnabled;
    if(!prefs.loudnessEnabled) return;
    if(programmeBusy){
      programmeReadout.innerHTML =
        '<span class="loud-prog">Prog I —</span> <span class="loud-lra">LRA —</span> <span class="loud-prog-tp">Prog TP —</span>' +
        '<span class="loud-gap"> Measuring whole-file programme loudness…</span>';
      return;
    }
    if(!programmeReading){
      programmeReadout.innerHTML =
        '<span class="loud-prog">Prog I —</span> <span class="loud-lra">LRA —</span> <span class="loud-prog-tp">Prog TP —</span>' +
        '<span class="loud-gap"> Programme = whole file/clip — click Measure programme loudness</span>';
      return;
    }
    const i = formatLoudnessReading(programmeReading.integratedLufs);
    const lra = formatLoudnessRange(programmeReading.loudnessRangeLu);
    const tp = formatLoudnessReading(programmeReading.truePeakDbtp, {unit: 'dBTP'});
    const dur = Number.isFinite(programmeReading.durationSec)
      ? programmeReading.durationSec.toFixed(2) + 's'
      : '';
    const srcLabel = programmeSourceLabel(programmeReading);
    programmeReadout.innerHTML =
      '<span class="loud-prog" title="Offline whole-file / clip Integrated LUFS (not live I*)">Prog I ' + i + '</span> ' +
      '<span class="loud-lra" title="EBU Tech 3342 loudness range">LRA ' + lra + '</span> ' +
      '<span class="loud-prog-tp">Prog TP ' + tp + '</span>' +
      '<span class="loud-gap" title="Never truncated; long clips use studio ffmpeg summary"> programme ' +
      srcLabel + (dur ? ' · ' + dur : '') + '</span>';
  }

  async function measureProgrammeLoudness(){
    if(programmeBusy) return;
    const prefs = meterPrefs();
    if(!prefs.loudnessEnabled){
      status.textContent = 'Enable loudness / true-peak in meter prefs first.';
      return;
    }
    programmeBusy = true;
    updateProgrammeReadout();
    let reading = null;
    let browserErr = null;
    const knownDur = Number(data?.duration);
    const overPcmBudget = Number.isFinite(knownDur) && knownDur > STUDIO_PCM_MAX_DURATION_SEC;
    try{
      if(overPcmBudget){
        // Prefer accurate whole-file server summary — never truncated PCM OfflineBuffer.
        status.textContent = 'Measuring full-file programme loudness via studio ffmpeg (' +
          knownDur.toFixed(0) + 's > ' + STUDIO_PCM_MAX_DURATION_SEC + 's PCM budget)…';
        reading = await fetchProgrammeLoudnessServer(track.media);
      }else{
        status.textContent = 'Decoding PCM for programme loudness…';
        try{
          const ctx = getAudioContext();
          if(ctx?.state === 'suspended') await ctx.resume().catch(() => {});
          const buffer = await decodeMediaAudioBuffer(track.media, {audioContext: ctx});
          if(!section.isConnected) return;
          const bufDur = Number(buffer?.duration);
          if(Number.isFinite(bufDur) && bufDur > STUDIO_PCM_MAX_DURATION_SEC){
            // Browser decoded a long file — still prefer lightweight full-file server path.
            status.textContent = 'Clip longer than PCM budget — using studio full-file programme loudness…';
            reading = await fetchProgrammeLoudnessServer(track.media);
          }else{
            status.textContent = 'Computing programme Integrated + LRA…';
            reading = await measureOfflineBufferAsync(buffer);
            if(reading && typeof reading === 'object') reading = {...reading, source: reading.source || 'browser-pcm'};
          }
        }catch(e){
          browserErr = e;
          // Silent server fallback: studio PCM -> OfflineBuffer (<= budget), else ffmpeg I/LRA/TP summary.
          try{
            const pcm = await fetchStudioPcm(track.media);
            if(!section.isConnected) return;
            const pcmDur = Number(pcm?.duration);
            if(Number.isFinite(pcmDur) && pcmDur > STUDIO_PCM_MAX_DURATION_SEC + 0.5){
              // Defensive: server must not return over-budget PCM; never measure truncated.
              status.textContent = 'Studio PCM over budget — using full-file programme loudness…';
              reading = await fetchProgrammeLoudnessServer(track.media);
            }else{
              status.textContent = 'Computing programme Integrated + LRA…';
              reading = await measureOfflineBufferAsync(pcm);
              if(reading && typeof reading === 'object') reading = {...reading, source: reading.source || 'server-pcm'};
            }
          }catch(pcmErr){
            try{
              status.textContent = 'Measuring full-file programme loudness via studio ffmpeg…';
              reading = await fetchProgrammeLoudnessServer(track.media);
            }catch(serverErr){
              if(!section.isConnected) return;
              const msg = (serverErr?.message || String(serverErr));
              const prior = (browserErr?.message || String(browserErr || pcmErr));
              status.textContent = msg;
              programmeReadout.innerHTML =
                '<span class="loud-prog">Prog I —</span> <span class="loud-lra">LRA —</span> <span class="loud-prog-tp">Prog TP —</span>' +
                '<span class="loud-gap"> Browser + studio measure failed (' +
                String(prior).replace(/[<>&]/g, '') + ' · ' + String(msg).replace(/[<>&]/g, '') +
                ')</span>';
              return;
            }
          }
        }
      }
      if(!section.isConnected) return;
      if(!reading){
        status.textContent = 'Programme loudness failed.';
        return;
      }
      programmeReading = reading;
      if(typeof change === 'function'){
        change(() => setProgrammeLoudness(project, track.media, reading));
      }else{
        setProgrammeLoudness(project, track.media, reading);
      }
      const src = programmeSourceLabel(reading);
      status.textContent = 'Programme loudness ready (' + src + ': Prog I / LRA / Prog TP). Play still uses live I*.';
    }finally{
      programmeBusy = false;
      updateProgrammeReadout();
    }
  }

  function drawSpectrum(live){
    const prefs = meterPrefs();
    spectrum.hidden = !prefs.enabled;
    if(!prefs.enabled) return;
    if(!bandMeter) rebuildBandMeter();
    drawBandMeterCanvas(spectrum, {
      bands: bandMeter.bands,
      display: bandMeter.display(),
      peaks: bandMeter.peaks(),
      live: !!live,
    });
  }

  function updateLevelChrome(displayDb, peakDb){
    const u = dbToMeterUnit(displayDb);
    const p = dbToMeterUnit(peakDb);
    meterFill.style.width = Math.round(u * 100) + '%';
    meterPeak.style.left = Math.round(p * 100) + '%';
  }

  const transport = document.createElement('div');
  transport.className = 'audio-overview-transport actions';

  const cursorLabel = document.createElement('label');
  cursorLabel.className = 'field';
  cursorLabel.textContent = 'Playhead (seconds into source)';
  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.min = 0;
  scrub.step = 1 / 24;
  scrub.disabled = true;
  cursorLabel.append(scrub);

  const selectionInputs = [];
  for(const [name, get, set] of [
    ['Selection start (A) seconds', () => start, v => { start = v; }],
    ['Selection end (B) seconds', () => end, v => { end = v; }],
  ]){
    const label = document.createElement('label');
    label.className = 'field';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.step = 'any';
    input.disabled = true;
    input.onchange = () => {
      if(data && Number.isFinite(Number(input.value))){
        set(Math.max(0, Math.min(data.duration, Number(input.value))));
        draw();
      }
    };
    label.append(input);
    section.append(label);
    selectionInputs.push({input, get});
  }

  const point = e => {
    const rect = canvas.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(rect.width, 1)));
    return viewStart + u * (viewEnd - viewStart);
  };

  function draw(){
    if(!data) return;
    const needle = overviewNeedleTime(cursor, preview?.graph);
    const seeking = !!(preview?.graph?.pendingSeek != null || preview?.graph?.splice?.active);
    const provisionalA = anchor != null ? anchor : null;
    drawOverviewCanvas(canvas, {
      peaks: data.peaks,
      duration: data.duration,
      viewStart,
      viewEnd,
      selectionStart: start,
      selectionEnd: end,
      cursor: needle,
      playing: !!(preview && preview.playing),
      seeking,
      hoverTime: anchor == null ? hoverTime : null,
      markA: provisionalA,
      markB: null,
      beatMarkers: track.markers || null,
    });
    scrub.value = needle;
    for(const {input, get} of selectionInputs){
      input.disabled = false;
      input.max = data.duration;
      input.value = get().toFixed(3);
    }
    const curveNote = preview?.graph?.kind === 'webaudio' ? 'Web Audio gain ramps' : 'element volume ramps';
    const seekNote = seeking ? ' · seeking…' : '';
    status.textContent = `Overview ${data.duration.toFixed(2)}s · A ${start.toFixed(2)}s · B ${end.toFixed(2)}s · playhead ${formatOverviewTime(needle)}${seekNote} · ${curveNote} (click seek · drag A/B · hover time · mmathen overview)`;
  }

  function seekPreviewTo(t, {force = false} = {}){
    if(!preview?.playing || !preview.audio || !data) return;
    const now = performance.now();
    if(!force && now - lastSeekAt < SEEK_THROTTLE_MS) return;
    lastSeekAt = now;
    const want = Math.min(Math.max(0, t), data.duration);
    const g = preview.graph;
    if(g?.kind === 'webaudio'){
      webAudioSetGain(g, 0, TRANSPORT_SEEK_RAMP_MS / 1000, FadeCurve.EqualPower);
      clearTimeout(preview.seekTimer);
      preview.seekTimer = setTimeout(() => {
        if(!preview?.playing) return;
        try{ preview.audio.currentTime = want; }catch{}
        webAudioSetGain(g, track.volume ?? 1, TRANSPORT_SEEK_RAMP_MS / 1000, FadeCurve.EqualPower);
        g.pendingSeek = null;
      }, TRANSPORT_SEEK_RAMP_MS);
      g.pendingSeek = want;
      return;
    }
    // Element-volume path: soft-seek short jumps, dual-element splice for long audible seeks
    const bag = g?.kind === 'element' ? g : {kind: 'element', media: preview.audio, gain: createTransportGain(preview.audio.volume || 0), pendingSeek: null, alt: preview.alt || null};
    if(!preview.alt){
      preview.alt = ensureSpliceAlt(preview.audio, null, {parent: section});
      bag.alt = preview.alt;
    }
    bag.onSplicePromote = (inEl) => {
      preview.audio = inEl;
      if(preview.graph) preview.graph.media = inEl;
    };
    spliceSeekMedia(bag, preview.audio, want, {
      playing: true,
      targetVolume: track.volume ?? 1,
      longSeekSec: TRANSPORT_LONG_SEEK_SEC,
      ensureAlt: () => {
        preview.alt = ensureSpliceAlt(preview.audio, preview.alt, {parent: section});
        bag.alt = preview.alt;
        return preview.alt;
      },
    });
    preview.graph = bag;
  }

  function stopPreview(){
    if(!preview) return;
    preview.playing = false;
    cancelAnimationFrame(preview.raf);
    clearTimeout(preview.seekTimer);
    try{ preview.audio.pause(); }catch{}
    try{ preview.alt?.pause?.(); }catch{}
    if(preview.graph?.splice) preview.graph.splice = null;
    if(preview.graph) preview.graph.pendingSeek = null;
    if(preview.graph?.kind === 'webaudio') webAudioSetGain(preview.graph, 0, TRANSPORT_PLAY_RAMP_MS / 1000, FadeCurve.Linear);
    else if(preview.graph?.gain){ preview.graph.gain.snap(0); if(preview.audio) preview.audio.volume = 0; }
    if(preview.alt && preview.alt.parentNode) try{ preview.alt.remove(); }catch{}
    preview = null;
    meterFill.style.width = '0%';
    meterPeak.style.left = '0%';
    bandMeter?.reset();
    loudnessMeter?.reset();
    loudnessSampleCarry = 0;
    lastMeterTs = 0;
    updateLoudnessReadout(false);
    drawSpectrum(false);
    draw();
  }

  function tickPreview(){
    if(!preview?.playing) return;
    const g = preview.graph;
    // Keep soft-seek / splice progressing (element path)
    if(g?.kind === 'element'){
      const want = g.pendingSeek != null ? g.pendingSeek
        : (g.splice?.active ? g.splice.target : preview.audio.currentTime);
      spliceSeekMedia(g, preview.audio, want, {
        playing: true,
        targetVolume: track.volume ?? 1,
        longSeekSec: TRANSPORT_LONG_SEEK_SEC,
        ensureAlt: () => {
          preview.alt = ensureSpliceAlt(preview.audio, preview.alt, {parent: section});
          g.alt = preview.alt;
          return preview.alt;
        },
      });
      if(g.onSplicePromote == null){
        g.onSplicePromote = (inEl) => {
          preview.audio = inEl;
          g.media = inEl;
        };
      }
    }
    cursor = overviewNeedleTime(preview.audio.currentTime, g);
    if(cursor >= end - 0.001 && !(g?.pendingSeek != null || g?.splice?.active)){
      stopPreview();
      cursor = end;
      draw();
      return;
    }
    // Live spectrum / level from AnalyserNode → mmath band ballistics
    const prefs = meterPrefs();
    const now = performance.now();
    const dt = lastMeterTs ? Math.min(0.1, (now - lastMeterTs) / 1000) : 0;
    lastMeterTs = now;
    if(g?.kind === 'webaudio'){
      const analyser = ensureMediaAnalyser(g);
      if(analyser){
        if(prefs.enabled && bandMeter){
          if(!meterFreqBuf || meterFreqBuf.length !== analyser.frequencyBinCount){
            meterFreqBuf = new Float32Array(analyser.frequencyBinCount);
          }
          analyser.getFloatFrequencyData(meterFreqBuf);
          bandMeter.pushFromAnalyser(meterFreqBuf, g.ctx.sampleRate, analyser.fftSize, dt);
          updateLevelChrome(bandMeter.overallDisplayDb(), bandMeter.overallPeakDb());
          drawSpectrum(true);
        }
        if(prefs.loudnessEnabled){
          const lm = ensureLoudnessMeter(g.ctx.sampleRate);
          if(!meterTimeBuf || meterTimeBuf.length !== analyser.fftSize){
            meterTimeBuf = new Float32Array(analyser.fftSize);
          }
          analyser.getFloatTimeDomainData(meterTimeBuf);
          // Consume only newly arrived samples (dt * sr) from the end of the ring.
          loudnessSampleCarry += Math.max(0, dt) * g.ctx.sampleRate;
          let want = Math.floor(loudnessSampleCarry);
          loudnessSampleCarry -= want;
          if(want > meterTimeBuf.length) want = meterTimeBuf.length;
          if(want > 0){
            const start = meterTimeBuf.length - want;
            lm.pushMono(meterTimeBuf.subarray(start));
          }
          updateLoudnessReadout(true);
        }
      }
    }else if(prefs.enabled && bandMeter && dt > 0){
      // Element path: no FFT — release toward floor so peak ticks decay honestly
      bandMeter.pushRawDb(bandMeter.bands.map(() => AUDIO_METER_DISPLAY_FLOOR_DB), dt);
      updateLevelChrome(bandMeter.overallDisplayDb(), bandMeter.overallPeakDb());
      drawSpectrum(false);
      if(prefs.loudnessEnabled){
        loudnessReadout.hidden = false;
        loudnessReadout.innerHTML =
          '<span class="loud-gap">Loudness needs Web Audio (element-only preview has no PCM)</span>';
      }
    }else{
      const level = g?.kind === 'webaudio'
        ? Math.min(1, Math.abs(g.gainNode.gain.value))
        : (preview.audio.volume || 0);
      meterFill.style.width = Math.round(level * 100) + '%';
    }
    draw();
    preview.raf = requestAnimationFrame(tickPreview);
  }

  async function playPreview(){
    if(!data) return;
    stopPreview();
    const ctx = getAudioContext();
    if(ctx?.state === 'suspended') await ctx.resume().catch(() => {});
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.src = mediaViewURL(track.media);
    audio.hidden = true;
    section.append(audio);
    await new Promise((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(Error('Could not load audio for overview preview.'));
    });
    const graph = ensureMediaGraph(audio);
    if(graph.kind === 'webaudio') ensureMediaAnalyser(graph);
    rebuildBandMeter();
    const want = Math.min(Math.max(start, cursor), Math.max(start, end - 1 / 24));
    audio.currentTime = want;
    cursor = want;
    if(graph.kind === 'webaudio'){
      webAudioSetGain(graph, 0, 0);
      await audio.play();
      webAudioSetGain(graph, track.volume ?? 1, TRANSPORT_PLAY_RAMP_MS / 1000, FadeCurve.Linear);
    }else{
      audio.volume = 0;
      await audio.play();
      softSeekMedia(graph, audio, want, {playing: true, targetVolume: track.volume ?? 1});
    }
    const alt = graph.kind === 'element' ? ensureSpliceAlt(audio, null, {parent: section}) : null;
    if(graph.kind === 'element') graph.alt = alt;
    preview = {audio, graph, raf: 0, playing: true, alt, seekTimer: 0};
    preview.raf = requestAnimationFrame(tickPreview);
    draw();
  }

  canvas.onpointerdown = e => {
    if(!data) return;
    anchor = point(e);
    cursor = anchor;
    hoverTime = null;
    canvas.setPointerCapture(e.pointerId);
    if(preview?.playing) seekPreviewTo(cursor, {force: true});
    draw();
  };
  canvas.onpointermove = e => {
    if(!data) return;
    if(anchor === null){
      hoverTime = point(e);
      draw();
      return;
    }
    cursor = point(e);
    if(Math.abs(cursor - anchor) >= 1 / 24){
      start = Math.min(anchor, cursor);
      end = Math.max(anchor, cursor);
    }
    if(preview?.playing) seekPreviewTo(cursor);
    draw();
  };
  canvas.onpointerup = e => {
    if(anchor === null) return;
    cursor = point(e);
    if(Math.abs(cursor - anchor) > 1 / 24){
      start = Math.min(anchor, cursor);
      end = Math.max(anchor, cursor);
    }else if(preview?.playing){
      seekPreviewTo(cursor, {force: true});
    }
    anchor = null;
    hoverTime = point(e);
    draw();
  };
  canvas.onpointercancel = () => { anchor = null; };
  canvas.onpointerleave = () => {
    if(anchor !== null) return;
    hoverTime = null;
    if(data) draw();
  };
  scrub.oninput = () => {
    cursor = Number(scrub.value);
    if(preview?.playing) seekPreviewTo(cursor, {force: true});
    draw();
  };

  const load = button('Load / refresh overview', async () => {
    load.disabled = true;
    status.textContent = 'Reading waveform peaks…';
    try{
      const result = await fetchWaveformPeaks(track.media);
      if(!section.isConnected) return;
      data = result;
      viewEnd = data.duration;
      viewStart = 0;
      if(!(end > start)) { start = Number(track.sourceStart) || 0; end = Math.min(data.duration, start + (Number(track.duration) || data.duration)); }
      start = Math.min(start, data.duration);
      end = Math.min(Math.max(end, start + 1 / 24), data.duration);
      cursor = Math.min(Math.max(cursor, start), end);
      scrub.max = data.duration;
      scrub.disabled = false;
      draw();
    }catch(e){
      status.textContent = e.message || String(e);
    }finally{
      load.disabled = false;
    }
  });

  const act = fn => {
    if(!data){ status.textContent = 'Load the overview first.'; return; }
    fn();
  };

  transport.append(
    button('Play selection', () => act(() => { playPreview().catch(err => { status.textContent = err.message; }); })),
    button('Stop', () => stopPreview()),
    button('Measure programme loudness', () => { measureProgrammeLoudness().catch(err => { status.textContent = err.message; }); }),
    button('Trim track to A–B', () => act(() => change(() => {
      track.sourceStart = start;
      track.duration = Math.max(1 / 24, end - start);
      const fades = (track.fadeIn || 0) + (track.fadeOut || 0);
      if(fades > track.duration){
        track.fadeIn *= track.duration / fades;
        track.fadeOut *= track.duration / fades;
      }
    }))),
  );
  if(splitTracks){
    transport.append(button('Split at playhead', () => act(() => change(() => {
      splitClip(splitTracks, track, cursor);
    }))));
  }
  transport.append(
    button('Zoom to A–B', () => act(() => { if(end - start >= 1 / 24){ viewStart = start; viewEnd = end; draw(); } })),
    button('Show full track', () => act(() => { viewStart = 0; viewEnd = data.duration; draw(); })),
  );

  // Avoid circular import: local split using audio-edit trim semantics inline for button
  function awaitImportSplit(){
    // splitClip is sync-imported at module top of consumers; re-export path:
    return {splitClip: (tracks, t, sourceTime) => {
      const offset = sourceTime - t.sourceStart;
      if(offset < 1 / 24 || t.duration - offset < 1 / 24) throw Error('Place the playhead inside the clip, at least one frame from either end.');
      if(offset < t.fadeIn || offset > t.duration - t.fadeOut) throw Error('Split outside the fade regions, or shorten the fades first.');
      const right = {...structuredClone(t), id: crypto.randomUUID(), start: t.start + offset, sourceStart: sourceTime, duration: t.duration - offset, fadeIn: 0};
      t.duration = offset; t.fadeOut = 0;
      tracks.splice(tracks.indexOf(t) + 1, 0, right);
    }};
  }

  section.append(load, canvas, meter, spectrum, loudnessReadout, programmeReadout, transport, cursorLabel);
  updateProgrammeReadout();
  audioMeterPrefsControls(section, project, {button, change});
  rebuildBandMeter();
  let beatUi = null;
  const changeAndBeat = (fn, opts) => {
    change(() => { fn(); }, opts);
    beatUi?.refresh?.();
    if(data) draw();
  };
  beatUi = beatMarkerControls(section, track, {
    button,
    change: changeAndBeat,
    getPlayhead: () => {
      if(data) return overviewNeedleTime(cursor, preview?.graph);
      return Number(track.sourceStart) || 0;
    },
    seekTo: (t) => {
      const want = Math.min(Math.max(0, Number(t) || 0), data?.duration ?? 14400);
      cursor = want;
      if(preview?.playing) seekPreviewTo(want, {force: true});
      else if(preview?.audio){
        try{ preview.audio.currentTime = want; }catch{/* ignore */}
      }
      if(data) draw();
    },
    title: 'Beat markers · tap while playing',
  });
  transport.append(button('Add beat at playhead', () => {
    try{
      const t = data ? overviewNeedleTime(cursor, preview?.graph) : (Number(track.sourceStart) || 0);
      changeAndBeat(() => { addBeatMarker(track, t); });
      status.textContent = 'Beat added at ' + Number(t).toFixed(3) + 's.';
    }catch(e){ status.textContent = e.message; }
  }));
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Whole-track overview (vendored mmathen spectrum_app): Orange diamonds are beat markers (Add beat at playhead).  blue peaks, cyan A/B edges, chevron playhead needle. Hover shows time; click seeks (soft-seek / splice while playing); drag sets A/B. Play uses Web Audio gain ramps when allowed. Spectrum EQ bars use BandAnalyzer ballistics. Live loudness: M / S / I* / TP (I* = session since Play). Programme loudness: Measure programme loudness → Prog I + LRA + Prog TP (cached). Clips ≤180s use browser/studio PCM OfflineBuffer; longer clips use studio full-file /programme-loudness (never truncated).';
  section.append(hint);
  parent.append(section);

  section.addEventListener('toggle', () => { if(!section.open) stopPreview(); });
  window.addEventListener('pagehide', stopPreview);

  if(autoLoad) load.click();
  return {section, reload: () => load.click(), stop: stopPreview};
}
