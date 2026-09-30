/** Whole-track audio overview — mmath spectrum_app inspired (vendored: tools/mmathen).
 * Peaks strip, playhead cursor, click-seek, A/B selection, optional Web Audio gain ramps.
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

export const AUDIO_OVERVIEW_BINS = 1800;

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

/**
 * A/B region geometry for overview drawing.
 * halfDone: provisional mark (pointer down / single edge) before a full span exists.
 */
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
  // Hover ghost (spectrum_app tooltip-at-mouse analogue)
  if(hoverTime != null && Number.isFinite(hoverTime)){
    const hx = xOf(hoverTime);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hx + 0.5, 0);
    ctx.lineTo(hx + 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);
    const label = formatOverviewTime(hoverTime) + ' · seek';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const pad = 5;
    const tw = ctx.measureText(label).width + pad * 2;
    const th = 16;
    let lx = hx + 8;
    if(lx + tw > w - 2) lx = hx - tw - 8;
    lx = Math.max(2, Math.min(w - tw - 2, lx));
    ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
    ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(lx, 4, tw, th);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8f0ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lx + pad, 4 + th / 2);
    ctx.restore();
  }
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
  meter.append(meterFill);

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
    const level = g?.kind === 'webaudio'
      ? Math.min(1, Math.abs(g.gainNode.gain.value))
      : (preview.audio.volume || 0);
    meterFill.style.width = Math.round(level * 100) + '%';
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

  section.append(load, canvas, meter, transport, cursorLabel);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Whole-track overview (vendored mmathen spectrum_app): blue peaks, cyan A/B edges, chevron playhead needle. Hover shows time; click seeks (soft-seek / splice while playing); drag sets A/B. Play uses Web Audio gain ramps when allowed, else element-volume ramps. Trim writes sourceStart/duration.';
  section.append(hint);
  parent.append(section);

  section.addEventListener('toggle', () => { if(!section.open) stopPreview(); });
  window.addEventListener('pagehide', stopPreview);

  if(autoLoad) load.click();
  return {section, reload: () => load.click(), stop: stopPreview};
}
