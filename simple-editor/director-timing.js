import {usesBoards,boardFrames,setShotSeconds} from './director-planning-state.js';
/* Timing and cutting checks.
 *
 * Attaching a two-second clip to a seven-second shot does not make seven
 * seconds of animation: the assembler holds the clip's last frame, and the
 * remaining five seconds are a still image. That is the single mistake most
 * likely to make an assembled episode look dead, and nothing else in Director
 * measures it. These checks read the project's own durations and say so.
 *
 * The thresholds below are editorial defaults for this laptop workflow, not
 * industry law. Average-shot-length bands come from published shot-length
 * surveys; the rest follow the classic animation principles named in each
 * message. Change them here if your style wants a different cut.
 */
import {shotTimeline} from './director-animatic.js';

/** Integer shot length with no held last frame for this clip (assembler trims overhang). */
export function clipFitSeconds(clipSeconds){
  if(!Number.isFinite(clipSeconds)||clipSeconds<=0)throw Error('Clip duration must be a positive number of seconds.');
  return Math.max(1,Math.min(3600,Math.floor(clipSeconds+1e-9)));
}

/** Integer shot length that keeps attached audio from being cut off. */
export function audioFitSeconds(audioSeconds){
  if(!Number.isFinite(audioSeconds)||audioSeconds<=0)throw Error('Audio duration must be a positive number of seconds.');
  return Math.max(1,Math.min(3600,Math.ceil(audioSeconds-1e-9)));
}

/** Intentional last-frame hold after moving footage (integer seconds). Omit or 0 = current incidental-hold behavior only. */
export function shotHoldSeconds(shot){
  const n = shot?.holdSeconds;
  if(n === undefined || n === null)return 0;
  if(!Number.isInteger(n) || n < 0 || n > 3600)throw Error('Hold last frame must be an integer from 0 to 3600 seconds.');
  return n;
}

export function validateShotHold(shot){
  if(shot.holdSeconds === undefined)return;
  shotHoldSeconds(shot);
}

/** Persist intentional hold. 0 clears the field (default / omit). */
export function setShotHoldSeconds(shot, seconds){
  if(!shot || typeof shot !== 'object' || Array.isArray(shot))throw Error('Choose a shot before setting a hold.');
  const n = Number(seconds);
  if(!Number.isInteger(n) || n < 0 || n > 3600)throw Error('Hold last frame must be an integer from 0 to 3600 seconds.');
  if(!n)delete shot.holdSeconds;
  else shot.holdSeconds = n;
  return shotHoldSeconds(shot);
}

export function clearShotHoldSeconds(shot){
  if(shot && typeof shot === 'object')delete shot.holdSeconds;
  return 0;
}

/** Quick-set integers for the shot-card hold control. Fractional holds are not supported (assembler tpad is whole seconds). */
export const SHOT_HOLD_PRESETS = Object.freeze([0, 1, 2, 3]);

/** Round and clamp raw UI input to a legal hold integer (0-3600). Does not mutate; does not throw. */
export function clampShotHoldSeconds(seconds){
  const n = Math.round(Number(seconds));
  if(!Number.isFinite(n))return 0;
  return Math.max(0, Math.min(3600, n));
}

/** Artist-facing summary of intentional hold vs shot duration (Fit = moving + hold). */
export function shotHoldPreview(shot){
  const hold = shotHoldSeconds(shot);
  const dur = Number.isInteger(shot?.seconds) ? shot.seconds : null;
  if(!hold){
    return {hold: 0, duration: dur, moving: dur, text: 'No intentional hold (0s). Fit shot to clip uses the moving clip length only; Timing & cutting still flags accidental freezes.'};
  }
  const moving = dur != null ? Math.max(0, dur - hold) : null;
  const text = dur != null
    ? ('Hold ' + hold + 's last frame \u00b7 shot ' + dur + 's \u2248 ' + moving + 's moving + ' + hold + 's hold. Fit shot to clip keeps this hold on top of the moving length.')
    : ('Hold ' + hold + 's of the last frame after the moving clip. Fit shot to clip keeps this hold.');
  return {hold, duration: dur, moving, text};
}

/** Quick-set rates for the shot-card playback speed control (0.5x-2x). */
export const SHOT_PLAYBACK_SPEED_PRESETS = Object.freeze([0.5, 0.75, 1, 1.25, 1.5, 2]);

/** Round (0.05 steps) and clamp raw UI input to a legal playback speed (0.5-2). Does not mutate; does not throw. NaN/empty -> 1. */
export function clampShotPlaybackSpeed(speed){
  if(speed === '' || speed === null || speed === undefined)return 1;
  const n = Number(speed);
  if(!Number.isFinite(n))return 1;
  const snapped = Math.round(n * 20) / 20;
  return Math.max(0.5, Math.min(2, snapped));
}

/** True when two speeds match for UI selected-state (avoids float drift). */
export function playbackSpeedsEqual(a, b){
  return Math.abs(Number(a) - Number(b)) < 1e-9;
}

/** Artist-facing summary of playback speed vs Fit / hold. Optional usableSourceSeconds = trimmed clip length when known. */
export function shotPlaybackSpeedPreview(shot, usableSourceSeconds=null){
  let speed = 1;
  try { speed = shotPlaybackSpeed(shot); } catch { speed = 1; }
  let hold = 0;
  try { hold = shotHoldSeconds(shot); } catch { hold = 0; }
  const dur = Number.isInteger(shot?.seconds) ? shot.seconds : null;
  const holdBit = hold ? (' + ' + hold + 's hold') : '';
  let text;
  if(playbackSpeedsEqual(speed, 1)){
    text = 'Normal speed (1x). Fit shot to clip uses the trimmed moving length' + (hold ? (', then adds ' + hold + 's hold') : ' only') + '.';
  } else if(Number.isFinite(usableSourceSeconds) && usableSourceSeconds > 0){
    const wall = usableSourceSeconds / speed;
    const fit = Math.max(1, Math.min(3600, Math.floor(wall) + hold));
    text = speed + 'x · ' + usableSourceSeconds.toFixed(1) + 's source ≈ ' + wall.toFixed(1) + 's moving' + holdBit + ' · Fit ≈ ' + fit + 's.';
  } else {
    text = speed + 'x playback. Fit shot to clip = floor(trimmed source / ' + speed + ')' + holdBit + (dur != null ? ('. Shot is ' + dur + 's.') : '.');
  }
  return {speed, hold, duration: dur, usableSource: Number.isFinite(usableSourceSeconds) ? usableSourceSeconds : null, text};
}

/** Playback rate for attached shot media. Omit or 1 = normal. Range 0.5-2. */
export function shotPlaybackSpeed(shot){
  const n = shot?.playbackSpeed;
  if(n === undefined || n === null)return 1;
  if(!Number.isFinite(n) || n < 0.5 || n > 2)throw Error('Playback speed must be from 0.5 to 2.');
  return n;
}

export function validateShotPlaybackSpeed(shot){
  if(shot.playbackSpeed === undefined)return;
  shotPlaybackSpeed(shot);
}

/** Persist playback speed. 1 clears the field (default / omit). */
export function setShotPlaybackSpeed(shot, speed){
  if(!shot || typeof shot !== 'object' || Array.isArray(shot))throw Error('Choose a shot before setting playback speed.');
  const n = Number(speed);
  if(!Number.isFinite(n) || n < 0.5 || n > 2)throw Error('Playback speed must be from 0.5 to 2.');
  if(Math.abs(n - 1) < 1e-9){ delete shot.playbackSpeed; return 1; }
  shot.playbackSpeed = n;
  return shotPlaybackSpeed(shot);
}

export function clearShotPlaybackSpeed(shot){
  if(shot && typeof shot === 'object')delete shot.playbackSpeed;
  return 1;
}

/** Wall-clock moving seconds for a source-length clip at playbackSpeed (sourceSeconds / speed). */
export function movingClipSeconds(sourceSeconds, speed=1){
  const rate = speed === undefined || speed === null ? 1 : Number(speed);
  if(!Number.isFinite(rate) || rate < 0.5 || rate > 2)throw Error('Playback speed must be from 0.5 to 2.');
  if(sourceSeconds === Infinity)return Infinity;
  if(!Number.isFinite(sourceSeconds) || sourceSeconds <= 0)throw Error('Clip duration must be a positive number of seconds.');
  return sourceSeconds / rate;
}

/** Map shot-local wall time onto media currentTime given trim + playbackSpeed. */
export function mediaPlaybackWindow(localSeconds, {sourceIn=0, sourceOut=null, speed=1, fileDuration=null}={}){
  const rate = speed === undefined || speed === null ? 1 : Number(speed);
  if(!Number.isFinite(rate) || rate < 0.5 || rate > 2)throw Error('Playback speed must be from 0.5 to 2.');
  const start = Number.isFinite(sourceIn) ? sourceIn : 0;
  const local = Math.max(0, Number(localSeconds) || 0);
  const fileEnd = Number.isFinite(fileDuration) ? Math.max(0, fileDuration - 0.001) : null;
  let end = sourceOut == null || sourceOut === undefined ? null : sourceOut;
  if(end == null)end = fileEnd;
  else if(fileEnd != null)end = Math.min(end, fileEnd);
  if(end == null){
    return {sourceIn: start, end: null, usableSource: Infinity, usableWall: Infinity, target: start + local * rate, speed: rate};
  }
  const usableSource = Math.max(0, end - start);
  const usableWall = usableSource / rate;
  const target = Math.min(start + local * rate, end);
  return {sourceIn: start, end, usableSource, usableWall, target, speed: rate};
}

/** Integer shot length: moving clip fit plus any intentional holdSeconds (assembler tpad fills the rest). */
export function clipFitSecondsWithHold(clipSeconds, holdSeconds=0){
  const moving = clipFitSeconds(clipSeconds);
  const hold = holdSeconds === undefined || holdSeconds === null ? 0 : holdSeconds;
  if(!Number.isInteger(hold) || hold < 0 || hold > 3600)throw Error('Hold last frame must be an integer from 0 to 3600 seconds.');
  return Math.max(1, Math.min(3600, moving + hold));
}

/** Fit shot to trimmed clip length at playbackSpeed, keeping shot.holdSeconds as an intentional frozen tail. Uses setShotSeconds so storyboard panels refit. */
export function fitShotToClip(shot,clipSeconds){
  const hold = shotHoldSeconds(shot);
  const speed = shotPlaybackSpeed(shot);
  const wall = movingClipSeconds(clipSeconds, speed);
  const seconds = clipFitSecondsWithHold(wall, hold);
  if(seconds!==shot.seconds)setShotSeconds(shot,seconds);
  return seconds;
}

/** Lengthen the shot so attached dialogue is not truncated at the cut. */
export function fitShotToAudio(shot,audioSeconds){
  const seconds=audioFitSeconds(audioSeconds);
  if(seconds!==shot.seconds)setShotSeconds(shot,seconds);
  return seconds;
}

/** True when attached media is a video clip (not a still). */
export function shotMediaIsVideo(media){
  return /\.(mp4|webm|mov|mkv|m4v)$/i.test(media?.name || media?.filename || '');
}

/** List video-clip shots eligible for bulk Fit (skips storyboards and stills). scope: 'episode' | {sceneId} | shot[]. */
export function listVideoClipFitShots(project, scope='episode'){
  if(!project || typeof project !== 'object')throw Error('Choose a project before listing video shots to fit.');
  let shots;
  if(Array.isArray(scope)){
    shots = scope;
  } else if(scope && typeof scope === 'object' && scope.sceneId){
    const scene = (project.scenes || []).find(s => s.id === scope.sceneId);
    if(!scene)throw Error('That scene is no longer in the episode.');
    shots = scene.shots || [];
  } else {
    shots = (project.scenes || []).flatMap(s => s.shots || []);
  }
  return shots.filter(shot => shot && shot.media && shotMediaIsVideo(shot.media) && !usesBoards(shot));
}

/**
 * Artist-facing summary of a bulk Fit pass: what changed, with moving vs hold.
 * rows from fitShotsToClips (before/after/moving/hold/changed).
 */
export function bulkFitHeldFrameNote(rows){
  if(!Array.isArray(rows) || !rows.length){
    return 'No video shots fitted. Attach clips, then Fit all video shots or Fit this scene.';
  }
  const changed = rows.filter(r => r.changed);
  const same = rows.filter(r => !r.changed);
  const bits = [];
  if(changed.length){
    bits.push('Fitted ' + changed.length + ' shot' + (changed.length === 1 ? '' : 's') + ':');
    for(const r of changed){
      const label = (r.title && String(r.title).trim()) || r.shotId || 'shot';
      bits.push(label + ' ' + r.before + 's -> ' + r.after + 's (' + r.moving + 's moving + ' + r.hold + 's hold)');
    }
  } else {
    bits.push('All ' + rows.length + ' video shot' + (rows.length === 1 ? '' : 's') + ' already match clip + hold.');
  }
  if(same.length && changed.length){
    bits.push(same.length + ' already matched.');
  }
  return bits.join(' ');
}

/**
 * Fit many shots to trimmed clip length at each shot's playbackSpeed, keeping holdSeconds.
 * entries: [{shot, usableClipSeconds}] where usableClipSeconds is trimmed source seconds (before speed).
 * Manual-first bulk companion to fitShotToClip. Does not invent new timing models.
 */
export function fitShotsToClips(entries){
  if(!Array.isArray(entries))throw Error('Provide a list of shots with usable clip lengths.');
  const rows = [];
  for(const entry of entries){
    const shot = entry?.shot;
    const usable = entry?.usableClipSeconds;
    if(!shot || typeof shot !== 'object' || Array.isArray(shot))throw Error('Each fit entry needs a shot.');
    if(!Number.isFinite(usable) || usable <= 0)throw Error('Each fit entry needs a positive usable clip length in seconds.');
    const before = shot.seconds;
    const hold = shotHoldSeconds(shot);
    const speed = shotPlaybackSpeed(shot);
    const wall = movingClipSeconds(usable, speed);
    const moving = clipFitSeconds(wall);
    const after = fitShotToClip(shot, usable);
    rows.push({
      shotId: shot.id,
      title: shot.title || '',
      before,
      after,
      moving,
      hold,
      speed,
      usableClipSeconds: usable,
      changed: before !== after,
    });
  }
  return {
    considered: rows.length,
    changed: rows.filter(r => r.changed).length,
    unchanged: rows.filter(r => !r.changed).length,
    rows,
    text: bulkFitHeldFrameNote(rows),
  };
}


/** Durable source in/out on attached shot media. Missing fields mean the whole file. */
export function mediaTrim(media){
  const sourceIn = media?.sourceIn === undefined ? 0 : media.sourceIn;
  const sourceOut = media?.sourceOut === undefined ? null : media.sourceOut;
  return {sourceIn, sourceOut};
}

function validateTrimValues(sourceIn, sourceOut){
  if(!Number.isFinite(sourceIn) || sourceIn < 0 || sourceIn > 14400)throw Error("Source in must be 0-14400 seconds.");
  if(sourceOut != null){
    if(!Number.isFinite(sourceOut) || sourceOut <= sourceIn || sourceOut > 14400)throw Error("Source out must be after source in and within 0-14400 seconds.");
  }
}

/** Reject invalid sourceIn/sourceOut on a media record. No-op when neither field is set. */
export function validateMediaTrim(media){
  if(!media || typeof media !== "object" || Array.isArray(media))return;
  if(media.sourceIn === undefined && media.sourceOut === undefined)return;
  const {sourceIn, sourceOut} = mediaTrim(media);
  validateTrimValues(sourceIn, sourceOut);
}

/** Usable moving seconds from a probed clip after source in/out. */
export function trimmedClipSeconds(clipSeconds, media){
  const {sourceIn, sourceOut} = mediaTrim(media);
  validateTrimValues(sourceIn, sourceOut);
  const known = Number.isFinite(clipSeconds);
  if(known && clipSeconds <= 0)throw Error("Clip duration must be a positive number of seconds.");
  if(known && sourceIn >= clipSeconds)throw Error("Source in is past the end of the clip.");
  const end = sourceOut == null ? (known ? clipSeconds : Infinity) : sourceOut;
  const usable = end - sourceIn;
  if(!Number.isFinite(usable) && sourceOut == null)return Infinity;
  if(!(usable > 0))throw Error("Media trim source out must be after source in.");
  return known ? Math.min(usable, Math.max(0, clipSeconds - sourceIn)) : usable;
}

/** Persist source in/out on shot.media. Pass null sourceOut to leave the end open. */
export function setMediaTrim(media, sourceIn, sourceOut){
  if(!media || typeof media !== "object" || Array.isArray(media))throw Error("Attach a clip before setting a media trim.");
  validateTrimValues(sourceIn, sourceOut === undefined ? null : sourceOut);
  if(!sourceIn)delete media.sourceIn; else media.sourceIn = sourceIn;
  if(sourceOut == null || sourceOut === undefined)delete media.sourceOut; else media.sourceOut = sourceOut;
  return mediaTrim(media);
}

export function clearMediaTrim(media){
  if(!media || typeof media !== "object")return;
  delete media.sourceIn;
  delete media.sourceOut;
}

/** Visual out-handle position: open-ended trim parks the handle at clip end. */
export function scrubOutHandleSeconds(sourceOut, duration){
  if(!Number.isFinite(duration) || duration <= 0)throw Error('Clip duration must be a positive number of seconds.');
  if(sourceOut == null || sourceOut === undefined)return duration;
  if(!Number.isFinite(sourceOut))throw Error('Source out must be a number of seconds, or blank for end of file.');
  return Math.max(0, Math.min(duration, sourceOut));
}

/** Map scrub in/out handle seconds to durable trim fields. Out near clip end becomes open-ended null. */
export function scrubHandlesToTrim(inSec, outSec, duration, {openEndEpsilon=0.05}={}){
  if(!Number.isFinite(duration) || duration <= 0)throw Error('Clip duration must be a positive number of seconds.');
  let sourceIn = Number.isFinite(Number(inSec)) ? Number(inSec) : 0;
  let sourceOut = Number.isFinite(Number(outSec)) ? Number(outSec) : duration;
  sourceIn = Math.max(0, Math.min(duration, sourceIn));
  sourceOut = Math.max(0, Math.min(duration, sourceOut));
  if(sourceOut <= sourceIn){
    if(sourceIn < duration) sourceOut = Math.min(duration, sourceIn + 0.001);
    else { sourceIn = Math.max(0, duration - 0.001); sourceOut = duration; }
  }
  if((duration - sourceOut) <= openEndEpsilon) return {sourceIn, sourceOut: null};
  return {sourceIn, sourceOut};
}


/** Stable cache key for media peak strips (audio waveform or luminance). */
export function mediaPeaksKey(media){
  if(!media || typeof media !== 'object')throw Error('Media is required for a peaks cache key.');
  const name = media.name || media.filename || '';
  if(!name)throw Error('Media must have a name for a peaks cache key.');
  return (media.type || 'input') + ':' + (media.subfolder || '') + ':' + name;
}

export const MEDIA_PEAKS_BINS = 1800;
/** Peak max below this is treated as silent / flat. */
export const MEDIA_PEAKS_SILENT_MAX = 0.02;

/** True when every peak is below threshold (silent audio or flat strip). */
export function isSilentPeaks(peaks, {threshold = MEDIA_PEAKS_SILENT_MAX} = {}){
  if(!Array.isArray(peaks) || !peaks.length)return true;
  let max = 0;
  for(const p of peaks){
    const n = Number(p);
    if(Number.isFinite(n) && n > max)max = n;
  }
  return max < threshold;
}

/** Collapse a mono sample list into max-abs peak bins scaled 0-1. */
export function peaksFromSamples(samples, bins = MEDIA_PEAKS_BINS){
  const count = samples?.length|0;
  if(!count)throw Error('Samples are required to build peaks.');
  if(!Number.isInteger(bins) || bins < 1 || bins > 8192)throw Error('Peak bin count must be 1-8192.');
  const out = new Array(bins).fill(0);
  for(let i = 0; i < count; i++){
    const index = Math.min(bins - 1, Math.floor(i / count * bins));
    const v = Math.abs(Number(samples[i]) || 0);
    if(v > out[index])out[index] = v;
  }
  return out;
}

/** Relative luminance 0-1 from 8-bit RGB (energy proxy for silent video). */
export function luminanceEnergy(r, g, b){
  const R = Math.max(0, Math.min(255, Number(r) || 0));
  const G = Math.max(0, Math.min(255, Number(g) || 0));
  const B = Math.max(0, Math.min(255, Number(b) || 0));
  return (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
}

/** Rescale peaks to 0-1 using the strip maximum (keeps relative shape). */
export function normalizePeaks(peaks, {floor = 0.05} = {}){
  if(!Array.isArray(peaks))throw Error('Peaks must be an array.');
  let max = 0;
  for(const p of peaks){
    const n = Number(p);
    if(Number.isFinite(n) && n > max)max = n;
  }
  const scale = Math.max(floor, max);
  return peaks.map(p => Math.max(0, Math.min(1, (Number(p) || 0) / scale)));
}


export const RULES = {
  minRead: 0.7,      // Under this, a cut registers as a flicker rather than an image.
  holdLimit: 1.5,    // A frozen frame past this length reads as a stall.
  holdShare: 0.4,    // Or as a stall when it is this much of the shot.
  rhythmRun: 3,      // Three identical durations in a row is a metronome, not a rhythm.
  colourBreak: 0.06, // Rise in mean saturation that means the picture is breaking down rather
                     // than moving. Measured across every clip here, colour failures rose 0.07
                     // to 0.42 and sound clips stayed under 0.05. It is blind to a scene that
                     // collapses without going neon, which is what the weaker measure below is for.
  drift: 0.50,       // Layout change worth a second look. Measured in this browser
                     // across thirteen clips, broken ones scored 0.39-0.72 and sound ones
                     // 0.15-0.46: the two ranges OVERLAP, because a bike riding towards camera
                     // changes as much as a clip that fell apart. No threshold separates them.
                     // This one sits above every sound clip measured, so it reports four of the
                     // six known failures and stays quiet on real motion. Treat a flag as worth
                     // a look and its absence as no evidence either way; the summary always
                     // prints the highest score so a borderline clip stays visible.
  aslLow: 4.0,       // Typical modern feature pacing runs about 4-6 seconds per shot:
  aslHigh: 6.2,      // action ~4.0, adventure ~5.1, science fiction ~6.2.
};

const DIRECTIONS = [[/\b(screen )?left\b|\bleftward\b/i, 'left'], [/\b(screen )?right\b|\brightward\b/i, 'right']];
const WIDE = /\b(wide|establish|aerial|master|overhead|top.?down)\b/i;

const mediaURL = file => '/view?' + new URLSearchParams({
  filename: file.name || file.filename || '', subfolder: file.subfolder || '', type: file.type || 'input'});

const isVideo = file => /\.(mp4|webm|mov|mkv|m4v)$/i.test(file?.name || file?.filename || '');

/** Read a media file's real duration through the browser, cached per URL. */
const cache = new Map();
function durationOf(file, kind) {
  const url = mediaURL(file);
  if (cache.has(url)) return cache.get(url);
  const promise = new Promise(resolve => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => resolve(null);   // A missing file is the delivery check's job, not ours.
    el.src = url;
  });
  cache.set(url, promise);
  return promise;
}

/** Two readings of a clip's first and last frame: colour spread, and layout.
 *
 * A generated clip fails in two different ways, and one measure does not see
 * both.
 *
 * Colour blow-out is the common one: the picture drifts towards neon, rainbow
 * banding or posterised blocks. Mean saturation rises sharply, and a scene that
 * merely moves does not do that. Across every clip measured here, colour
 * failures rose by 0.07 to 0.42 while sound clips stayed within 0.05 -- and it
 * independently picked out the same six shots that were judged broken by eye,
 * including one whose artifacts only appeared in its closing frames.
 *
 * Composition collapse is the other: the camera pushes in, the background
 * dissolves, the character is replaced. Saturation barely moves, so that first
 * measure is blind to it; a colour histogram does see it, but so does a bike
 * riding towards camera, and those two overlap badly enough that no threshold
 * separates them.
 *
 * So saturation rise is reported as a real finding and histogram distance only
 * as a weak hint worth a look. Both are measured in the browser rather than
 * with ffmpeg, since the two disagree by roughly a tenth and this is where the
 * check runs.
 */
const driftCache = new Map();
function driftOf(file, duration) {
  const url = mediaURL(file);
  if (driftCache.has(url)) return driftCache.get(url);
  const promise = new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    const read = () => {
      context.drawImage(video, 0, 0, 64, 64);
      const {data} = context.getImageData(0, 0, 64, 64);
      const bins = new Array(48).fill(0);
      let saturation = 0, pixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        bins[r >> 4]++; bins[16 + (g >> 4)]++; bins[32 + (b >> 4)]++;
        const high = Math.max(r, g, b);
        saturation += (high - Math.min(r, g, b)) / (high + 1e-6);
        pixels++;
      }
      return {bins, saturation: saturation / pixels};
    };
    const seek = time => new Promise(done => { video.onseeked = done; video.currentTime = time; });
    video.onerror = () => resolve(null);
    video.onloadeddata = async () => {
      try {
        await seek(0);
        const first = read();
        await seek(Math.max(0, duration - 0.08));
        const last = read();
        const total = first.bins.reduce((a, b) => a + b, 0) || 1;
        let difference = 0;
        for (let i = 0; i < first.bins.length; i++) difference += Math.abs(first.bins[i] - last.bins[i]);
        resolve({layout: difference / (2 * total), colour: last.saturation - first.saturation});
      } catch { resolve(null); }
    };
    video.src = url;
  });
  driftCache.set(url, promise);
  return promise;
}

/** Everything measurable about one episode's timing. Async: it reads real media durations. */
export async function timingReport(project) {
  const entries = shotTimeline(project);
  const issues = [];
  const flag = (shot, rule, message, fix) => issues.push({shotId: shot.id, rule, message, ...(fix ? {fix} : {})});
  const seconds = entries.map(e => e.shot.seconds).filter(n => Number.isFinite(n) && n > 0);
  const asl = seconds.length ? seconds.reduce((a, b) => a + b, 0) / seconds.length : 0;

  let moving = 0, held = 0, worstDrift = 0, worstColour = 0;
  for (const entry of entries) {
    const shot = entry.shot;

    if (usesBoards(shot)) {
      const needed = shot.seconds * 24, covered = boardFrames(shot);
      if (!shot.panels?.length || covered !== needed || shot.panels.some(panel => !panel.media)) {
        flag(shot, 'storyboard',
          `The animatic uses this ${shot.seconds}s shot. Storyboard panels cover ${covered} of ${needed} frames` +
          `${shot.panels?.some(panel => !panel.media) ? ', and a panel still needs a drawing' : ''}. Fit the panels before assembly.`);
      }
    } else if (shot.media && isVideo(shot.media)) {
      const clip = await durationOf(shot.media, 'video');
      if (clip !== null) {
        let usable = clip;
        try { usable = trimmedClipSeconds(clip, shot.media); }
        catch { usable = Math.max(0, clip - mediaTrim(shot.media).sourceIn); }
        let speed = 1;
        try { speed = shotPlaybackSpeed(shot); } catch { speed = 1; }
        const wall = movingClipSeconds(usable, speed);
        const covered = Math.min(wall, shot.seconds);
        const frozen = Math.max(0, shot.seconds - wall);
        moving += covered; held += frozen;
        const drifted = await driftOf(shot.media, clip);
        if (drifted !== null) {
          worstDrift = Math.max(worstDrift, drifted.layout);
          worstColour = Math.max(worstColour, drifted.colour);
          if (drifted.colour > RULES.colourBreak) {
            flag(shot, 'colour breakdown',
              `The colours blow out over this clip (saturation rises ${drifted.colour.toFixed(2)}, ` +
              `against ${RULES.colourBreak} for a sound one). That is neon banding or posterised blocks ` +
              'building up, usually towards the end. Re-render it asking for much less motion.');
          } else if (drifted.layout > RULES.drift) {
            flag(shot, 'possible drift',
              `This clip ends laid out differently from how it started (difference ${drifted.layout.toFixed(2)}, ` +
              `noted above ${RULES.drift}), without the colours breaking down. That is either the scene ` +
              'collapsing or simply a lot of real movement, so open it and look rather than trusting this.');
          }
        }
        let intentional = 0;
        try { intentional = shotHoldSeconds(shot); } catch { intentional = 0; }
        const accidental = Math.max(0, frozen - intentional);
        if (accidental > RULES.holdLimit || (accidental > 0 && accidental / shot.seconds > RULES.holdShare)) {
          const fit = clipFitSecondsWithHold(wall, intentional);
          const trim = mediaTrim(shot.media);
          const speedNote = speed !== 1 ? (" at " + speed + "x") : "";
          const trimNote = trim.sourceIn || trim.sourceOut != null
            ? "trimmed usable " + usable.toFixed(1) + "s of " + clip.toFixed(1) + "s file" + speedNote + " = " + wall.toFixed(1) + "s wall"
            : "clip is " + clip.toFixed(1) + "s" + speedNote + (speed !== 1 ? (" = " + wall.toFixed(1) + "s wall") : "");
          const holdNote = intentional
            ? ` Intentional hold is ${intentional}s; ${accidental.toFixed(1)}s beyond that is accidental.`
            : '';
          flag(shot, 'held frame',
            `${frozen.toFixed(1)}s of this ${shot.seconds}s shot is a frozen last frame ` +
            `(${trimNote}). Shorten the shot to ${fit}s (Fit shot to clip), or animate more of it.` +
            holdNote +
            ' A held pose still needs motion to stay alive.',
            fit !== shot.seconds ? {kind: 'clip', seconds: fit, clip: usable} : undefined);
        }
      }
    } else if (shot.media) {
      held += shot.seconds;   // A still image is a held frame for its whole shot.
    }

    if (shot.audio) {
      const line = await durationOf(shot.audio, 'audio');
      if (line !== null && line > shot.seconds + 0.05) {
        const fit = audioFitSeconds(line);
        flag(shot, 'dialogue overrun',
          `The attached audio runs ${line.toFixed(1)}s but the shot is ${shot.seconds}s, so the end is cut off. ` +
          `Give this shot at least ${fit}s (Fit shot to audio).`,
          fit !== shot.seconds ? {kind: 'audio', seconds: fit, audio: line} : undefined);
      }
    }

    if (shot.seconds < RULES.minRead) {
      flag(shot, 'too short', `${shot.seconds}s is below ${RULES.minRead}s: the cut registers as a flicker, not an image.`);
    }
    if (!(shot.camera || '').trim()) {
      flag(shot, 'staging', 'No camera / framing note, so nothing records how this shot is staged.');
    }
  }

  // Cutting rhythm: a run of identical durations reads as mechanical.
  let run = 1;
  for (let i = 1; i <= entries.length; i++) {
    const same = i < entries.length && entries[i].shot.seconds === entries[i - 1].shot.seconds;
    if (same) { run++; continue; }
    if (run >= RULES.rhythmRun) {
      flag(entries[i - 1].shot, 'rhythm',
        `${run} shots in a row run exactly ${entries[i - 1].shot.seconds}s. Vary the lengths so the cutting has a pulse.`);
    }
    run = 1;
  }

  // Screen direction: a reversal between neighbouring shots breaks the 180-degree line
  // unless a wide shot re-establishes the geography in between.
  for (const scene of project.scenes) {
    for (let i = 1; i < scene.shots.length; i++) {
      const read = shot => {
        const text = `${shot.camera || ''} ${shot.action || ''}`;
        return DIRECTIONS.find(([pattern]) => pattern.test(text))?.[1] || null;
      };
      const previous = read(scene.shots[i - 1]), current = read(scene.shots[i]);
      const reestablished = WIDE.test(`${scene.shots[i].camera || ''} ${scene.shots[i].action || ''}`);
      if (previous && current && previous !== current && !reestablished) {
        flag(scene.shots[i], 'screen direction',
          `This shot goes ${current} after a ${previous} shot. Crossing the line flips the geography — ` +
          're-establish with a wide shot, or keep the direction.');
      }
    }
  }

  const total = moving + held;
  return {
    shots: entries.length,
    seconds: seconds.reduce((a, b) => a + b, 0),
    asl, moving, held, worstDrift, worstColour,
    movingShare: total ? moving / total : 0,
    issues,
  };
}

/** The panel Director shows above the assembly controls. */
export function createTimingCheck(before, {getProject, getScene, button, goToShot, change, tell}) {
  const panel = document.createElement('details');
  panel.className = 'settings production-overview';
  panel.id = 'director-timing';
  panel.innerHTML = '<summary>Timing &amp; cutting check <span id="timing-count"></span></summary>' +
    '<p class="hint">Measures the episode against its own media: how much of the running time is really moving, ' +
    'how long the average shot is, and where the cutting, staging or screen direction works against the shot. ' +
    'These are editorial defaults, not rules you must follow. Bulk Fit keeps each shot\'s hold and writes a moving vs hold note.</p>' +
    '<p id="timing-summary"></p>' +
    '<div id="timing-bulk" class="actions"></div>' +
    '<p id="timing-bulk-note" class="hint" hidden></p>' +
    '<div id="timing-rows" class="production-rows"></div>';
  before.before(panel);

  let token = 0;
  let lastBulkNote = '';

  async function buildFitEntries(shots) {
    const entries = [];
    let skipped = 0;
    for (const shot of shots) {
      if (!shot || usesBoards(shot) || !shot.media || !shotMediaIsVideo(shot.media)) { skipped++; continue; }
      const clip = await durationOf(shot.media, 'video');
      if (clip == null) { skipped++; continue; }
      let usable;
      try { usable = trimmedClipSeconds(clip, shot.media); }
      catch { skipped++; continue; }
      if (!Number.isFinite(usable) || usable <= 0) { skipped++; continue; }
      entries.push({ shot, usableClipSeconds: usable });
    }
    return { entries, skipped };
  }

  function showBulkNote(text) {
    lastBulkNote = text || '';
    const note = panel.querySelector('#timing-bulk-note');
    if (!note) return;
    if (!lastBulkNote) { note.hidden = true; note.textContent = ''; return; }
    note.hidden = false;
    note.textContent = lastBulkNote;
    if (typeof tell === 'function') tell(lastBulkNote);
  }

  async function runBulkFit(shots, emptyLabel) {
    const { entries, skipped } = await buildFitEntries(shots);
    if (!entries.length) {
      const msg = 'No video clips to fit' + (emptyLabel ? ' in ' + emptyLabel : '') +
        (skipped ? ' (' + skipped + ' skipped: boards, stills, or unreadable).' : '.');
      showBulkNote(msg);
      return;
    }
    let result;
    change(() => {
      const live = getProject().scenes.flatMap(s => s.shots);
      const mapped = entries.map(e => ({
        shot: live.find(s => s.id === e.shot.id) || e.shot,
        usableClipSeconds: e.usableClipSeconds,
      })).filter(e => e.shot);
      result = fitShotsToClips(mapped);
    });
    if (!result) return;
    let text = result.text;
    if (skipped) text += ' Skipped ' + skipped + ' non-video or unreadables.';
    showBulkNote(text);
  }

  return {async update() {
    const mine = ++token;
    const project = getProject();
    const report = await timingReport(project);
    if (mine !== token) return;   // A newer update already ran; drop this one.
    panel.querySelector('#timing-count').textContent =
      report.issues.length ? report.issues.length + ' timing notes' : 'no timing notes';
    panel.querySelector('#timing-summary').textContent = report.shots
      ? (report.shots + ' shots \u00b7 ' + report.seconds.toFixed(0) + 's \u00b7 average shot ' + report.asl.toFixed(1) + 's ' +
        '(' + (report.asl < RULES.aslLow ? 'faster than' : report.asl > RULES.aslHigh ? 'slower than' : 'within') + ' ' +
        'the usual ' + RULES.aslLow + '\u2013' + RULES.aslHigh + 's) \u00b7 ' + Math.round(report.movingShare * 100) + '% of the running time is moving footage, ' +
        report.held.toFixed(0) + 's is a held frame. Worst colour rise ' + report.worstColour.toFixed(2) + ' (breakdown above ' + RULES.colourBreak + '), worst layout change ' + report.worstDrift.toFixed(2) + '.')
      : 'Add shots to measure the episode\u2019s timing.';
    const bulk = panel.querySelector('#timing-bulk');
    bulk.replaceChildren();
    if (typeof change === 'function') {
      bulk.append(button('Fit all video shots (episode)', () => {
        runBulkFit(listVideoClipFitShots(getProject(), 'episode'), 'episode').catch(err => {
          console.error(err);
          showBulkNote(err.message || String(err));
        });
      }));
      if (typeof getScene === 'function') {
        bulk.append(button('Fit video shots in this scene', () => {
          const scene = getScene();
          if (!scene) { showBulkNote('Open a scene first.'); return; }
          runBulkFit(listVideoClipFitShots(getProject(), { sceneId: scene.id }), scene.title || 'this scene').catch(err => {
            console.error(err);
            showBulkNote(err.message || String(err));
          });
        }));
      }
      const heldFixes = report.issues.filter(i => i.fix && i.fix.kind === 'clip');
      if (heldFixes.length) {
        bulk.append(button('Fit ' + heldFixes.length + ' held-frame shot' + (heldFixes.length === 1 ? '' : 's'), () => {
          try {
            let result;
            change(() => {
              const live = getProject().scenes.flatMap(s => s.shots);
              const entries = [];
              for (const issue of heldFixes) {
                const shot = live.find(s => s.id === issue.shotId);
                if (!shot) continue;
                entries.push({ shot, usableClipSeconds: issue.fix.clip });
              }
              if (!entries.length) throw Error('Those held-frame shots are no longer in the episode.');
              result = fitShotsToClips(entries);
            });
            if (result) showBulkNote(result.text);
          } catch (err) {
            console.error(err);
            showBulkNote(err.message || String(err));
          }
        }));
      }
    }
    if (lastBulkNote) {
      const note = panel.querySelector('#timing-bulk-note');
      if (note) { note.hidden = false; note.textContent = lastBulkNote; }
    }
    const rows = panel.querySelector('#timing-rows');
    rows.replaceChildren();
    const names = new Map(shotTimeline(project).map(e => [e.shot.id, e.scene + ' / ' + (e.shot.title || 'Untitled shot')]));
    for (const issue of report.issues) {
      const row = document.createElement('div');
      row.className = 'actions';
      row.append(button(issue.rule + ': ' + (names.get(issue.shotId) || project.title) + ' \u2014 ' + issue.message,
        () => goToShot(issue.shotId)));
      if (issue.fix && typeof change === 'function') {
        const label = issue.fix.kind === 'audio'
          ? 'Fit shot to audio (' + issue.fix.seconds + 's)'
          : 'Fit shot to clip (' + issue.fix.seconds + 's)';
        row.append(button(label, () => {
          try {
            change(() => {
              const shot = getProject().scenes.flatMap(s => s.shots).find(s => s.id === issue.shotId);
              if (!shot) throw Error('That shot is no longer in the episode.');
              if (issue.fix.kind === 'audio') fitShotToAudio(shot, issue.fix.audio);
              else fitShotToClip(shot, issue.fix.clip);
            });
          } catch (err) {
            console.error(err);
          }
        }));
      }
      rows.append(row);
    }
  }};
}


/** Outgoing transition into the next shot. Omit or cut = hard cut (default). */
/** Studio type -> ffmpeg xfade name. cut has no xfade. dissolve maps to fade. */
export const SHOT_TRANSITION_XFADE = Object.freeze({
  dissolve: 'fade',
  'wipe-left': 'wipeleft',
  'wipe-right': 'wiperight',
  'wipe-up': 'wipeup',
  'wipe-down': 'wipedown',
  'slide-left': 'slideleft',
  'slide-right': 'slideright',
  'slide-up': 'slideup',
  'slide-down': 'slidedown',
  'fade-black': 'fadeblack',
  'fade-white': 'fadewhite',
  'circle-open': 'circleopen',
  'circle-close': 'circleclose',
});

export const SHOT_TRANSITION_OPTIONS = Object.freeze([
  {type:'cut', label:'Hard cut (default)'},
  {type:'dissolve', label:'Dissolve'},
  {type:'wipe-left', label:'Wipe left'},
  {type:'wipe-right', label:'Wipe right'},
  {type:'wipe-up', label:'Wipe up'},
  {type:'wipe-down', label:'Wipe down'},
  {type:'slide-left', label:'Slide left'},
  {type:'slide-right', label:'Slide right'},
  {type:'slide-up', label:'Slide up'},
  {type:'slide-down', label:'Slide down'},
  {type:'fade-black', label:'Fade through black'},
  {type:'fade-white', label:'Fade through white'},
  {type:'circle-open', label:'Circle open'},
  {type:'circle-close', label:'Circle close'},
]);

const OVERLAP_TYPES = new Set(Object.keys(SHOT_TRANSITION_XFADE));

export function transitionOverlaps(type){
  return OVERLAP_TYPES.has(type);
}

export function transitionXfadeName(type){
  return SHOT_TRANSITION_XFADE[type] || null;
}

export function shotTransition(shot){
  const t = shot?.transition;
  if(!t)return {type:'cut', durationSec:0};
  const type = transitionOverlaps(t.type) ? t.type : 'cut';
  const durationSec = type === 'cut' ? 0 : Number(t.durationSec);
  return {type, durationSec: Number.isFinite(durationSec) ? durationSec : 0};
}

export function validateShotTransition(shot){
  if(shot.transition === undefined)return;
  const t = shot.transition;
  if(!t || typeof t !== 'object' || Array.isArray(t))throw Error('Invalid shot transition.');
  if(t.type === 'cut'){
    if(t.durationSec !== undefined && t.durationSec !== 0)throw Error('Cut transitions use duration 0.');
    return;
  }
  if(!transitionOverlaps(t.type))throw Error('Transition type must be cut, dissolve, wipe, slide, fade-black/white, or circle.');
  const d = t.durationSec;
  if(!Number.isFinite(d) || d <= 0 || d > 30)throw Error('Transition duration must be greater than 0 and at most 30 seconds.');
  if(!Number.isInteger(shot.seconds) || d >= shot.seconds)throw Error('Transition duration must be shorter than the shot.');
}

/** Persist outgoing transition. Cut clears the field (hard-cut default). */
export function setShotTransition(shot, type, durationSec){
  if(!type || type === 'cut'){
    delete shot.transition;
    return shotTransition(shot);
  }
  if(!transitionOverlaps(type))throw Error('Transition type must be cut, dissolve, wipe, slide, fade-black/white, or circle.');
  shot.transition = {type, durationSec:Number(durationSec)};
  validateShotTransition(shot);
  return shotTransition(shot);
}

export function clearShotTransition(shot){
  delete shot.transition;
  return shotTransition(shot);
}

/** True when shot has a durable overlap transition (not hard-cut default). */
export function shotHasTransition(shot){
  const t = shot?.transition;
  return !!(t && typeof t === 'object' && !Array.isArray(t) && transitionOverlaps(t.type));
}

/** Other episode shots that already have an overlap transition (for continuity copy). */
export function listTransitionSources(project, excludeShotId){
  const out = [];
  for(const scene of project?.scenes || []){
    for(const shot of scene.shots || []){
      if(shot.id === excludeShotId || !shotHasTransition(shot)) continue;
      const t = shotTransition(shot);
      const sceneTitle = scene.title || 'Scene';
      const shotTitle = shot.title || 'Untitled shot';
      const typeLabel = (SHOT_TRANSITION_OPTIONS.find(o => o.type === t.type) || {}).label || t.type;
      out.push({
        id: shot.id,
        sceneId: scene.id,
        sceneTitle,
        shotTitle,
        type: t.type,
        durationSec: t.durationSec,
        label: sceneTitle + ' / ' + shotTitle + ' - ' + typeLabel + ' - ' + t.durationSec + 's',
      });
    }
  }
  return out;
}

/**
 * Copy outgoing transition from sourceShot onto targetShot.
 * mode 'all' (default): replace type and duration.
 * mode 'type': copy type only; keep local duration when target already overlaps, else use source duration.
 * mode 'duration': copy duration only; keep local type (target must already be an overlap type).
 * Mutates targetShot; validates. Caller should wrap in change()/Undo.
 */
export function copyTransitionFromShot(targetShot, sourceShot, mode='all'){
  if(!targetShot || typeof targetShot !== 'object' || Array.isArray(targetShot))
    throw Error('Transition copy needs a target shot.');
  if(!sourceShot || typeof sourceShot !== 'object' || Array.isArray(sourceShot))
    throw Error('Source shot is missing.');
  if(!shotHasTransition(sourceShot))
    throw Error('Source shot has no overlap transition to copy.');
  const m = mode == null || mode === '' ? 'all' : mode;
  if(m !== 'all' && m !== 'type' && m !== 'duration')
    throw Error('Transition copy mode must be all, type, or duration.');
  const src = shotTransition(sourceShot);

  if(m === 'all'){
    setShotTransition(targetShot, src.type, src.durationSec);
    return {mode: 'all', type: src.type, durationSec: src.durationSec};
  }

  if(m === 'type'){
    const local = shotTransition(targetShot);
    const keptDuration = transitionOverlaps(local.type);
    const durationSec = keptDuration ? local.durationSec : src.durationSec;
    setShotTransition(targetShot, src.type, durationSec);
    return {mode: 'type', type: src.type, durationSec, keptDuration};
  }

  // duration
  const local = shotTransition(targetShot);
  if(!transitionOverlaps(local.type))
    throw Error('This shot has no overlap transition type yet. Copy all or type first, or set a type on the shot card.');
  setShotTransition(targetShot, local.type, src.durationSec);
  return {mode: 'duration', type: local.type, durationSec: src.durationSec};
}

/** Assembled / preview length: sum of shot seconds minus overlap transitions. */
export function transitionOverlapSeconds(shots){
  let overlap = 0;
  for(let i = 0; i < shots.length - 1; i++){
    const t = shotTransition(shots[i]);
    if(transitionOverlaps(t.type))overlap += t.durationSec;
  }
  return overlap;
}

export function validateTransitionPair(shot, next){
  validateShotTransition(shot);
  const t = shotTransition(shot);
  if(transitionOverlaps(t.type) && next && t.durationSec >= next.seconds)throw Error('Transition duration must be shorter than the following shot.');
}
