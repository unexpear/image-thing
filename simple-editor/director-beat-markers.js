/**
 * Manual beat markers on episode / shot audio tracks (source-media time).
 * Artists tap beats while listening; ticks show on Audio overview + Animatic scrub.
 * Durable on track.markers — no AI, no loudness/Decal work.
 */
export const BEAT_MARKER_CAP = 128;
export const BEAT_MARKER_LABEL_MAX = 80;

function snapFrame(sec){
  const n = Number(sec);
  if(!Number.isFinite(n)) return NaN;
  return Math.round(n * 24) / 24;
}

export function validateBeatMarkers(markers){
  if(markers === undefined) return;
  if(!Array.isArray(markers)) throw Error('Beat markers must be a list.');
  if(markers.length > BEAT_MARKER_CAP) throw Error(`Keep at most ${BEAT_MARKER_CAP} beat markers on one track.`);
  const ids = new Set();
  for(const m of markers){
    if(!m || typeof m.id !== 'string' || !m.id || ids.has(m.id)) throw Error('Beat markers need unique IDs.');
    ids.add(m.id);
    if(!Number.isFinite(m.time) || m.time < 0 || m.time > 14400) throw Error('Beat marker time must be 0–14400 seconds into the source.');
    if(m.label !== undefined){
      if(typeof m.label !== 'string' || m.label.length > BEAT_MARKER_LABEL_MAX)
        throw Error(`Beat marker labels stay within ${BEAT_MARKER_LABEL_MAX} characters.`);
    }
  }
}

/** Ensure markers array exists; validate in place. */
export function ensureBeatMarkers(track){
  if(!track || typeof track !== 'object') throw Error('Beat markers need an audio track.');
  if(track.markers === undefined) track.markers = [];
  validateBeatMarkers(track.markers);
  return track.markers;
}

export function addBeatMarker(track, time, label = ''){
  const markers = ensureBeatMarkers(track);
  if(markers.length >= BEAT_MARKER_CAP) throw Error(`This track already has ${BEAT_MARKER_CAP} beat markers.`);
  const t = snapFrame(time);
  if(!Number.isFinite(t) || t < 0 || t > 14400) throw Error('Place the playhead on the source (0–14400s) before adding a beat.');
  const text = typeof label === 'string' ? label.trim().slice(0, BEAT_MARKER_LABEL_MAX) : '';
  // Replace an existing mark on the same frame rather than stacking duplicates.
  const existing = markers.find(m => Math.abs(m.time - t) < 1 / 48);
  if(existing){
    if(text) existing.label = text;
    else if(text === '' && existing.label) delete existing.label;
    return existing;
  }
  const marker = {id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `beat-${Date.now()}-${markers.length}`, time: t};
  if(text) marker.label = text;
  markers.push(marker);
  markers.sort((a, b) => a.time - b.time);
  return marker;
}

export function removeBeatMarker(track, id){
  if(!track?.markers) return false;
  const before = track.markers.length;
  track.markers = track.markers.filter(m => m.id !== id);
  const removed = track.markers.length < before;
  if(!track.markers.length) delete track.markers;
  return removed;
}

export function setBeatMarkerLabel(track, id, label){
  const markers = ensureBeatMarkers(track);
  const m = markers.find(x => x.id === id);
  if(!m) throw Error('Beat marker not found.');
  const text = typeof label === 'string' ? label.trim().slice(0, BEAT_MARKER_LABEL_MAX) : '';
  if(text) m.label = text;
  else delete m.label;
  return m;
}

export function clearBeatMarkers(track){
  if(!track) return;
  delete track.markers;
}

/** Markers whose source time falls inside the track's active window. */
export function markersInClipWindow(track){
  const markers = track?.markers || [];
  if(!markers.length) return [];
  const src0 = Number(track.sourceStart) || 0;
  const dur = Number(track.duration);
  const src1 = Number.isFinite(dur) && dur > 0 ? src0 + dur : Infinity;
  return markers.filter(m => m.time >= src0 - 1e-9 && m.time <= src1 + 1e-9).slice().sort((a, b) => a.time - b.time);
}

/**
 * Episode timeline seconds for a marker on an episode clip
 * (start + source-relative offset). Returns null if outside the clip window.
 */
export function episodeTimeForMarker(track, marker){
  if(!track || !marker || !Number.isFinite(marker.time)) return null;
  if(!Number.isFinite(track.start)) return null;
  const src0 = Number(track.sourceStart) || 0;
  const dur = Number(track.duration);
  if(Number.isFinite(dur) && dur > 0){
    if(marker.time < src0 - 1e-9 || marker.time > src0 + dur + 1e-9) return null;
  }
  return track.start + (marker.time - src0);
}

/** Flatten episodeAudio markers onto the episode timeline (for Animatic ticks). */
export function episodeBeatTimes(project){
  const out = [];
  for(const track of project?.episodeAudio || []){
    if(track.muted) continue;
    for(const marker of track.markers || []){
      const ep = episodeTimeForMarker(track, marker);
      if(ep == null || ep < 0) continue;
      out.push({
        time: snapFrame(ep),
        label: marker.label || '',
        trackId: track.id,
        markerId: marker.id,
        kind: track.kind,
      });
    }
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

export function nearestBeatMarker(track, time, {within = 0.25} = {}){
  const markers = track?.markers || [];
  if(!markers.length || !Number.isFinite(time)) return null;
  let best = null, bestDist = Infinity;
  for(const m of markers){
    const d = Math.abs(m.time - time);
    if(d < bestDist){ bestDist = d; best = m; }
  }
  if(bestDist > within) return null;
  return best;
}

/**
 * Compact list UI: Add at playhead / Jump / Remove / label.
 * getPlayhead() returns source-media seconds (overview needle).
 * seekTo(time) seeks overview or animatic when provided.
 */
export function beatMarkerControls(parent, track, {
  button,
  change,
  getPlayhead,
  seekTo,
  title = 'Beat markers',
} = {}){
  const box = document.createElement('div');
  box.className = 'beat-marker-controls';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', title);
  const heading = document.createElement('h4');
  heading.textContent = title;
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Tap beats while the overview plays. Times are into the source file (same as the playhead). Markers survive move/trim of the episode start; they stay tied to the music.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const list = document.createElement('div');
  list.className = 'beat-marker-list';

  function paint(){
    list.replaceChildren();
    const markers = (track.markers || []).slice().sort((a, b) => a.time - b.time);
    if(!markers.length){
      status.textContent = 'No beat markers yet.';
      return;
    }
    status.textContent = `${markers.length} beat marker${markers.length === 1 ? '' : 's'} (cap ${BEAT_MARKER_CAP}).`;
    for(const m of markers){
      const row = document.createElement('div');
      row.className = 'beat-marker-row';
      const time = document.createElement('span');
      time.className = 'beat-marker-time';
      time.textContent = m.time.toFixed(3) + 's';
      const label = document.createElement('input');
      label.type = 'text';
      label.maxLength = BEAT_MARKER_LABEL_MAX;
      label.placeholder = 'Label (optional)';
      label.value = m.label || '';
      label.setAttribute('aria-label', 'Beat marker label at ' + m.time.toFixed(3) + 's');
      label.onchange = () => {
        try{
          change(() => setBeatMarkerLabel(track, m.id, label.value));
          paint();
        }catch(e){ status.textContent = e.message; }
      };
      const jump = button('Jump', () => {
        try{
          seekTo?.(m.time);
          status.textContent = 'Playhead → ' + m.time.toFixed(3) + 's.';
        }catch(e){ status.textContent = e.message; }
      });
      const remove = button('Remove', () => {
        try{
          change(() => { removeBeatMarker(track, m.id); });
          paint();
        }catch(e){ status.textContent = e.message; }
      });
      row.append(time, label, jump, remove);
      list.append(row);
    }
  }

  const add = button('Add beat at playhead', () => {
    try{
      const t = typeof getPlayhead === 'function' ? getPlayhead() : NaN;
      change(() => { addBeatMarker(track, t); });
      paint();
      status.textContent = 'Beat added at ' + snapFrame(t).toFixed(3) + 's.';
    }catch(e){ status.textContent = e.message; }
  });
  const clear = button('Clear all beats', () => {
    try{
      if(!(track.markers || []).length){ status.textContent = 'No beat markers to clear.'; return; }
      change(() => { clearBeatMarkers(track); });
      paint();
      status.textContent = 'Beat markers cleared.';
    }catch(e){ status.textContent = e.message; }
  });
  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.append(add, clear);
  box.append(heading, hint, actions, status, list);
  parent.append(box);
  paint();
  return {refresh: paint, root: box};
}

/** Draw vertical ticks for beat markers onto an overview canvas context. */
export function drawBeatMarkerTicks(ctx, markers, {
  width,
  height,
  xOf,
  viewStart = 0,
  viewEnd = Infinity,
} = {}){
  if(!ctx || !markers?.length || typeof xOf !== 'function') return;
  const h = height || 140;
  const w = width || 900;
  ctx.save();
  for(const m of markers){
    if(!Number.isFinite(m.time)) continue;
    if(m.time < viewStart - 1e-9 || m.time > viewEnd + 1e-9) continue;
    const x = xOf(m.time);
    if(x < -2 || x > w + 2) continue;
    ctx.strokeStyle = 'rgba(255, 170, 70, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    // Diamond head
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 4, 5);
    ctx.lineTo(x, 10);
    ctx.lineTo(x - 4, 5);
    ctx.closePath();
    ctx.fill();
    if(m.label){
      ctx.fillStyle = 'rgba(255, 220, 170, 0.95)';
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(m.label).width;
      ctx.fillText(m.label, Math.max(2, Math.min(w - tw - 2, x + 5)), 12);
    }
  }
  ctx.restore();
}
