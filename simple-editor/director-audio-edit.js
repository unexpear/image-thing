export const MAIN_AUDIO_ROLES=Object.freeze(['dialogue','music','ambience','effects']);
/** Filename hints that main shot.audio is a music/ambience bed, not dialogue. */
const MUSIC_NAME_RE=/(?:^|[^a-z0-9])(?:music|bgm|bed|beds|underscore|ambience|ambient|score|song|soundtrack|stinger|loop|theme|atmos)(?:[^a-z0-9]|$)/i;

/**
 * Resolve main-attachment role for ducking.
 * Explicit shot.audioRole wins; else lip-sync / matching voice-take => dialogue;
 * music-ish filename => music; default dialogue (keeps prior voice ducking).
 */
export function guessMainAudioRole(shot, voiceTakes){
 if(!shot?.audio)return null;
 if(MAIN_AUDIO_ROLES.includes(shot.audioRole))return shot.audioRole;
 if(Number.isFinite(shot.lipSync?.duration)&&shot.lipSync.duration>0)return 'dialogue';
 const cues=shot.lipSync?.cues;
 if(Array.isArray(cues)&&cues.length)return 'dialogue';
 const name=shot.audio.name||shot.audio.filename||'';
 if(name&&Array.isArray(voiceTakes)){
  const take=voiceTakes.find(t=>(t.audio?.name||t.audio?.filename)===name);
  if(take)return 'dialogue';
 }
 if(MUSIC_NAME_RE.test(name))return 'music';
 return 'dialogue';
}

/** True when main shot.audio should open a dialogue duck window. */
export function mainAudioDucksDialogue(shot, voiceTakes){
 return guessMainAudioRole(shot, voiceTakes)==='dialogue';
}

export const duckDefaults={enabled:false,level:.25,attack:.2,release:.5};
export function validateDucking(d){
 if(d===undefined)return;
 if(!d||typeof d.enabled!=='boolean'||!Number.isFinite(d.level)||d.level<0||d.level>1||!Number.isFinite(d.attack)||d.attack<.01||d.attack>5||!Number.isFinite(d.release)||d.release<.01||d.release>10)throw Error('Ducking needs a level from 0–1, fade-down of 0.01–5s and fade-up of 0.01–10s.');
}
/** Best-known seconds for a shot's main attached voice (shot.audio). */
export function mainVoiceDuckSeconds(shot, voiceTakes){
 if(!shot?.audio)return null;
 if(Number.isFinite(shot.lipSync?.duration)&&shot.lipSync.duration>0)return Math.min(shot.seconds, shot.lipSync.duration);
 const name=shot.audio.name||shot.audio.filename;
 if(name&&Array.isArray(voiceTakes)){
  const take=voiceTakes.find(t=>(t.audio?.name||t.audio?.filename)===name&&Number.isFinite(t.seconds)&&t.seconds>0);
  if(take)return Math.min(shot.seconds, take.seconds);
 }
 const cues=shot.lipSync?.cues;
 if(Array.isArray(cues)&&cues.length){
  let end=0;
  for(const c of cues){const e=Number(c.end);if(Number.isFinite(e)&&e>end)end=e;}
  if(end>0)return Math.min(shot.seconds, end);
 }
 return shot.seconds;
}

/** End time (shot-local) for a dialogue sound track: trimmed duration when set, else shot end. */
export function shotDialogueTrackEnd(shot, track){
 const start=Number(track?.start)||0;
 if(Number.isFinite(track?.duration)&&track.duration>0)return Math.min(shot.seconds, start+track.duration);
 return shot.seconds;
}

export function dialogueWindows(project){
 const ranges=[];let offset=0;
 const voiceTakes=project.voiceTakes||[];
 for(const scene of project.scenes)for(const s of scene.shots){
  if(mainAudioDucksDialogue(s, voiceTakes)){
   const mainSec=mainVoiceDuckSeconds(s, voiceTakes);
   if(mainSec!=null&&mainSec>0)ranges.push([offset, offset+mainSec]);
  }
  for(const t of s.audioTracks||[]){
   if(t.kind==='dialogue'&&t.media&&t.volume>0&&t.start<s.seconds){
    const end=shotDialogueTrackEnd(s, t);
    if(end>t.start)ranges.push([offset+t.start, offset+end]);
   }
  }
  offset+=s.seconds;
 }
 for(const t of project.episodeAudio||[])if(t.kind==='dialogue'&&t.media&&!t.muted&&t.volume>0&&t.start<offset)ranges.push([t.start,Math.min(offset,t.start+t.duration)]);
 ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
 for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1]+(project.ducking?.attack??duckDefaults.attack)+(project.ducking?.release??duckDefaults.release))last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
 return merged;
}
export function duckGain(position,settings,windows){
 if(!settings?.enabled)return 1;
 const amount=Math.min(1,windows.reduce((sum,[start,end])=>sum+Math.max(0,Math.min(1,(position-start+settings.attack)/settings.attack,(end+settings.release-position)/settings.release)),0));
 return 1-(1-settings.level)*amount;
}
export function trimClip(track,start,end){
 const a=Math.max(0,start),length=Math.min(end-a,14400-track.start);
 if(!Number.isFinite(a)||!Number.isFinite(length)||length<1/24)throw Error('Select at least one frame of source audio.');
 track.sourceStart=a;track.duration=length;
 const fades=track.fadeIn+track.fadeOut;if(fades>length){track.fadeIn*=length/fades;track.fadeOut*=length/fades;}
}
export function splitClip(tracks,track,sourceTime){
 const offset=sourceTime-track.sourceStart;
 if(offset<1/24||track.duration-offset<1/24)throw Error('Place the playhead inside the clip, at least one frame from either end.');
 if(offset<track.fadeIn||offset>track.duration-track.fadeOut)throw Error('Split outside the fade regions, or shorten the fades first.');
 const right={...structuredClone(track),id:crypto.randomUUID(),start:track.start+offset,sourceStart:sourceTime,duration:track.duration-offset,fadeIn:0};
 track.duration=offset;track.fadeOut=0;tracks.splice(tracks.indexOf(track)+1,0,right);
}
/** mmath-style crossfade curves (portable from crossfade.h). */
export const FadeCurve = Object.freeze({
  Linear: 'linear',
  RaisedCosine: 'raised-cosine',
  EqualPower: 'equal-power',
});
/** Play/pause de-click ramp (mmath engine playRamp ~5 ms). */
export const TRANSPORT_PLAY_RAMP_MS = 5;
/** Seek / scrub discontinuity fade (uncorrelated cut → EqualPower). */
export const TRANSPORT_SEEK_RAMP_MS = 20;
/** How far currentTime may drift before a soft seek. */
export const TRANSPORT_SEEK_EPSILON_SEC = 0.15;
/** Drift above this (while audible) uses dual-element SpliceReader-style splice. */
export const TRANSPORT_LONG_SEEK_SEC = 0.5;

export function fadeInGain(curve, t){
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  if(curve === FadeCurve.RaisedCosine) return 0.5 - 0.5 * Math.cos(Math.PI * u);
  if(curve === FadeCurve.EqualPower) return Math.sin(0.5 * Math.PI * u);
  return u;
}
export function fadeOutGain(curve, t){
  const u = Math.min(1, Math.max(0, Number(t) || 0));
  if(curve === FadeCurve.RaisedCosine) return 0.5 + 0.5 * Math.cos(Math.PI * u);
  if(curve === FadeCurve.EqualPower) return Math.cos(0.5 * Math.PI * u);
  return 1 - u;
}
/** Interpolate amplitude from→to with a fade-in shaped weight. */
export function rampGain(from, to, u, curve = FadeCurve.Linear){
  const a = Number(from), b = Number(to);
  if(!Number.isFinite(a) || !Number.isFinite(b)) throw Error('Ramp gains must be finite numbers.');
  return a + (b - a) * fadeInGain(curve, u);
}

/**
 * Sample-accurate-enough HTMLMediaElement gain ramp (GainRamp port).
 * Advances with wall clock; apply .tick() then write .value to element.volume.
 */
export function createTransportGain(initial = 0){
  let value = Number(initial) || 0;
  let from = value;
  let target = value;
  let startMs = 0;
  let durationMs = 0;
  let curve = FadeCurve.Linear;
  function setTarget(next, ms = 0, nextCurve = FadeCurve.Linear){
    const dest = Math.min(1, Math.max(0, Number(next) || 0));
    const dur = Math.max(0, Number(ms) || 0);
    from = value;
    target = dest;
    curve = nextCurve;
    durationMs = dur;
    startMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if(dur <= 0){ value = dest; durationMs = 0; }
    return value;
  }
  function tick(now){
    if(durationMs <= 0){ value = target; return value; }
    const t0 = now == null
      ? ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now())
      : now;
    const u = Math.min(1, Math.max(0, (t0 - startMs) / durationMs));
    value = rampGain(from, target, u, curve);
    if(u >= 1){ value = target; durationMs = 0; }
    return value;
  }
  function snap(next){ return setTarget(next, 0); }
  return {
    get value(){ return value; },
    get target(){ return target; },
    get settled(){ return durationMs <= 0 && Math.abs(value - target) < 1e-6; },
    setTarget, tick, snap,
  };
}

/**
 * Soft-seek an HTMLMediaElement: EqualPower out → jump → EqualPower in.
 * When silent/paused, seeks immediately. Call from the preview sync loop.
 */
export function softSeekMedia(item, media, wantTime, {
  playing = false,
  targetVolume = 1,
  seekEpsilon = TRANSPORT_SEEK_EPSILON_SEC,
  seekMs = TRANSPORT_SEEK_RAMP_MS,
  playMs = TRANSPORT_PLAY_RAMP_MS,
} = {}){
  if(!item || !media) return;
  if(!item.gain) item.gain = createTransportGain(0);
  if(item.pendingSeek == null) item.pendingSeek = null;
  const end = Number.isFinite(media.duration) ? Math.max(0, media.duration - 0.001) : wantTime;
  const target = Math.min(Math.max(0, wantTime), end);
  const drift = Math.abs((Number.isFinite(media.currentTime) ? media.currentTime : target) - target);
  const audible = playing && targetVolume > 1e-4;
  const needsSeek = item.pendingSeek != null || drift > seekEpsilon || !playing;

  if(item.pendingSeek != null){
    item.gain.tick();
    if(item.gain.value <= 0.02 || item.gain.settled){
      try{ media.currentTime = item.pendingSeek; }catch{/* ignore seek race */}
      item.pendingSeek = null;
      if(audible) item.gain.setTarget(targetVolume, seekMs, FadeCurve.EqualPower);
      else item.gain.snap(0);
    }
    media.volume = Math.min(1, Math.max(0, item.gain.value));
    return;
  }

  if(needsSeek && drift > seekEpsilon){
    if(audible && item.gain.value > 0.02){
      item.pendingSeek = target;
      item.gain.setTarget(0, seekMs, FadeCurve.EqualPower);
      item.gain.tick();
      media.volume = Math.min(1, Math.max(0, item.gain.value));
      return;
    }
    try{ media.currentTime = target; }catch{/* ignore */}
    item.pendingSeek = null;
  }

  const dest = audible ? targetVolume : 0;
  const ramp = audible ? (playing ? playMs : seekMs) : playMs;
  if(Math.abs(item.gain.target - dest) > 1e-4 || (dest === 0 && !item.gain.settled && item.gain.value > 1e-4)){
    // Retarget only when the desired level changes meaningfully.
    if(Math.abs(item.gain.target - dest) > 1e-4)
      item.gain.setTarget(dest, ramp, FadeCurve.Linear);
  }
  item.gain.tick();
  media.volume = Math.min(1, Math.max(0, item.gain.value));
}


/**
 * Ensure a second HTMLMediaElement sharing primary's src (SpliceReader dual voice).
 * Reuses existingAlt when tag+src match. Caller removes on release.
 */
export function ensureSpliceAlt(primary, existingAlt = null, { parent = null } = {}){
  if(!primary || typeof primary.cloneNode !== 'function') return existingAlt || null;
  const mediaSrc = primary.currentSrc || (typeof primary.getAttribute === 'function' ? primary.getAttribute('src') : null) || primary.src || '';
  if(!mediaSrc) return existingAlt || null;
  let alt = existingAlt;
  if(!alt || alt.tagName !== primary.tagName){
    alt = primary.cloneNode(false);
    if('playsInline' in primary) alt.playsInline = !!primary.playsInline;
    alt.preload = 'auto';
    alt.hidden = true;
  }
  const altSrc = alt.currentSrc || (typeof alt.getAttribute === 'function' ? alt.getAttribute('src') : null) || alt.src || '';
  if(altSrc !== mediaSrc){
    try{ alt.src = mediaSrc; }catch{/* ignore */}
  }
  if('volume' in alt) alt.volume = 0;
  if(parent && alt.parentNode !== parent){
    try{ parent.appendChild(alt); }catch{/* ignore */}
  }
  return alt;
}

function finishSplice(item){
  const sp = item.splice;
  if(!sp?.active) return;
  const { outEl, inEl, targetVol } = sp;
  if(inEl && 'volume' in inEl) inEl.volume = Math.min(1, Math.max(0, targetVol));
  if(outEl && 'volume' in outEl){
    outEl.volume = 0;
    try{ outEl.pause?.(); }catch{/* ignore */}
  }
  if(item.el === outEl) item.el = inEl;
  if(item.element === outEl) item.element = inEl;
  if(item.audio === outEl) item.audio = inEl;
  item.alt = outEl;
  if(!item.gain) item.gain = createTransportGain(targetVol);
  else item.gain.snap(targetVol);
  item.pendingSeek = null;
  item.splice = null;
  if(typeof item.onSplicePromote === 'function'){
    try{ item.onSplicePromote(inEl, outEl); }catch{/* ignore */}
  }
}

function tickDualSplice(item, wantTarget, { audible, seekEpsilon, seekMs, now }){
  const sp = item.splice;
  if(!sp?.active) return false;
  const durationMs = Math.max(1, Number(sp.durationMs) || seekMs);
  // Retarget mid-fade: keep louder voice as outgoing (SpliceReader.jumpTo).
  if(audible && Number.isFinite(wantTarget) && Math.abs(wantTarget - sp.target) > seekEpsilon){
    const u0 = Math.min(1, Math.max(0, (now - sp.startMs) / durationMs));
    const gi = fadeInGain(FadeCurve.EqualPower, u0);
    const go = fadeOutGain(FadeCurve.EqualPower, u0);
    if(gi >= go){
      const louder = sp.inEl;
      const quieter = sp.outEl;
      try{ quieter.currentTime = wantTarget; }catch{/* ignore */}
      if('volume' in quieter) quieter.volume = 0;
      try{ quieter.play?.()?.catch?.(()=>{}); }catch{/* ignore */}
      sp.outEl = louder;
      sp.inEl = quieter;
    }else{
      try{ sp.inEl.currentTime = wantTarget; }catch{/* ignore */}
    }
    sp.target = wantTarget;
    sp.startMs = now;
  }
  const u = Math.min(1, Math.max(0, (now - sp.startMs) / durationMs));
  // Centre-sample style: t = (i+1/2)/n with EqualPower endpoints.
  const t = u <= 0 ? 0.5 / Math.max(2, durationMs) : (u >= 1 ? 1 : u);
  const gi = fadeInGain(FadeCurve.EqualPower, t);
  const go = fadeOutGain(FadeCurve.EqualPower, t);
  const vol = Math.min(1, Math.max(0, sp.targetVol));
  if(sp.outEl && 'volume' in sp.outEl) sp.outEl.volume = Math.min(1, Math.max(0, go * vol));
  if(sp.inEl && 'volume' in sp.inEl) sp.inEl.volume = Math.min(1, Math.max(0, gi * vol));
  if(!item.gain) item.gain = createTransportGain(gi * vol);
  else item.gain.snap(gi * vol);
  if(u >= 1) finishSplice(item);
  return true;
}

function startDualSplice(item, outEl, inEl, target, targetVolume, seekMs, now){
  item.pendingSeek = null;
  try{ inEl.currentTime = target; }catch{/* ignore */}
  if('volume' in inEl) inEl.volume = 0;
  inEl.muted = false;
  if(outEl.playbackRate != null && inEl.playbackRate != null) inEl.playbackRate = outEl.playbackRate;
  try{ inEl.play?.()?.catch?.(()=>{}); }catch{/* ignore */}
  if(outEl.paused) try{ outEl.play?.()?.catch?.(()=>{}); }catch{/* ignore */}
  item.alt = inEl;
  item.splice = {
    active: true,
    startMs: now,
    durationMs: Math.max(1, seekMs),
    outEl,
    inEl,
    targetVol: targetVolume,
    target,
  };
  tickDualSplice(item, target, {
    audible: true,
    seekEpsilon: TRANSPORT_SEEK_EPSILON_SEC,
    seekMs,
    now,
  });
}

/**
 * Soft-seek for small deltas; dual-element EqualPower splice for long audible jumps
 * (mmath SpliceReader.jumpTo). Falls back to softSeekMedia when no alt element.
 * Call from the preview sync loop.
 */
export function spliceSeekMedia(item, media, wantTime, {
  playing = false,
  targetVolume = 1,
  seekEpsilon = TRANSPORT_SEEK_EPSILON_SEC,
  longSeekSec = TRANSPORT_LONG_SEEK_SEC,
  seekMs = TRANSPORT_SEEK_RAMP_MS,
  playMs = TRANSPORT_PLAY_RAMP_MS,
  ensureAlt = null,
} = {}){
  if(!item || !media) return;
  if(!item.gain) item.gain = createTransportGain(0);
  if(item.pendingSeek == null) item.pendingSeek = null;
  const end = Number.isFinite(media.duration) ? Math.max(0, media.duration - 0.001) : wantTime;
  const target = Math.min(Math.max(0, wantTime), end);
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const audible = playing && targetVolume > 1e-4;

  if(item.splice?.active){
    item.splice.targetVol = targetVolume;
    if(!audible){
      const sp = item.splice;
      if(sp.inEl && 'volume' in sp.inEl) sp.inEl.volume = 0;
      try{ sp.inEl?.pause?.(); }catch{/* ignore */}
      item.splice = null;
      item.pendingSeek = null;
      try{ media.currentTime = target; }catch{/* ignore */}
      item.gain.snap(0);
      if('volume' in media) media.volume = 0;
      return;
    }
    tickDualSplice(item, target, { audible, seekEpsilon, seekMs, now });
    return;
  }

  const cur = Number.isFinite(media.currentTime) ? media.currentTime : target;
  const drift = Math.abs(cur - target);

  if(audible && drift > longSeekSec){
    const alt = typeof ensureAlt === 'function' ? ensureAlt() : (item.alt || null);
    if(alt && alt !== media){
      startDualSplice(item, media, alt, target, targetVolume, seekMs, now);
      return;
    }
  }

  softSeekMedia(item, media, wantTime, {
    playing, targetVolume, seekEpsilon, seekMs, playMs,
  });
}

export function waveformControls(parent,track,project,{button,change}){
  // Delegates to the mmathen-inspired overview panel (dynamic import avoids cycle with overview → this module).
  if(!track?.media)return;
  import('./director-audio-overview.js').then(mod=>{
    if(!parent.isConnected)return;
    mod.audioOverviewControls(parent,track,project,{
      button,change,
      splitTracks: project?.episodeAudio || null,
      title: 'Waveform overview · trim, scrub & transport',
      autoLoad: true,
    });
  }).catch(err=>{
    const p=document.createElement('p');p.className='hint';p.textContent='Audio overview unavailable: '+(err?.message||err);parent.append(p);
  });
}
