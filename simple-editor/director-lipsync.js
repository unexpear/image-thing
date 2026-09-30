import {fitShotToAudio} from './director-timing.js';
import {fetchWaveformPeaks} from './director-audio-overview.js';
import {sampleFeatures, MOUTH_STYLES} from './director-features.js';

export const MOUTH_SHAPES=['A','B','C','D','E','F','G','H','X'];

/** Rhubarb A-H/X -> denser Face editor mouth styles artists can key. X rest; A closed (MBP); B smile; C open; D wide; E round; F bite; G teeth; H pucker. */
export const MOUTH_SHAPE_TO_FEATURE=Object.freeze({
  X:'line',A:'closed',B:'smile',C:'open',D:'wide',E:'round',F:'bite',G:'teeth',H:'pucker',
});

/** Reverse of MOUTH_SHAPE_TO_FEATURE (frown is Face-only, no Rhubarb letter). */
export const FEATURE_TO_MOUTH_SHAPE=Object.freeze(Object.fromEntries(
  Object.entries(MOUTH_SHAPE_TO_FEATURE).map(([letter,style])=>[style,letter])
));

/** Durable mouthMap keys: Rhubarb letters and denser Face mouth styles. */
export const MOUTH_MAP_KEYS=Object.freeze([...new Set([...MOUTH_SHAPES,...MOUTH_STYLES])]);

/** Artist-facing rows for mouthMap UI (style first; letter cue when one exists). */
export const MOUTH_MAP_ROWS=Object.freeze(MOUTH_STYLES.map(style=>{
  const letter=FEATURE_TO_MOUTH_SHAPE[style];
  return {style,letter:letter||null,label:letter?style+' ('+letter+')':style+' (expression)'};
}));

/**
 * Name heuristics for auto-detecting skinned GLB morph targets.
 * Prefer specific viseme/mouth tokens; assign denser Face style keys (and letter aliases).
 */
export const MOUTH_MORPH_HEURISTICS=Object.freeze({
  line:[/(?:^|[^a-z0-9])(rest|sil(?:ence)?|neutral|mouth[_\s-]?rest|mouth[_\s-]?x|viseme[_\s-]?x|viseme[_\s-]?sil)(?:[^a-z0-9]|$)/i],
  closed:[/(?:^|[^a-z0-9])(closed|mbp|lips?[_\s-]?together|mouth[_\s-]?closed|mouth[_\s-]?a|viseme[_\s-]?a|viseme[_\s-]?pp|mouth[_\s-]?pp)(?:[^a-z0-9]|$)/i],
  smile:[/(?:^|[^a-z0-9])(smile|slight|mouth[_\s-]?b|viseme[_\s-]?b)(?:[^a-z0-9]|$)/i],
  open:[/(?:^|[^a-z0-9])(mouth[_\s-]?open|mouth[_\s-]?c|viseme[_\s-]?c|viseme[_\s-]?aa|mouth[_\s-]?aa)(?:[^a-z0-9]|$)/i,/mouth.*open/i],
  wide:[/(?:^|[^a-z0-9])(wide|big[_\s-]?open|mouth[_\s-]?d|viseme[_\s-]?d)(?:[^a-z0-9]|$)/i],
  round:[/(?:^|[^a-z0-9])(round|mouth[_\s-]?e|viseme[_\s-]?e|viseme[_\s-]?oh|mouth[_\s-]?oh)(?:[^a-z0-9]|$)/i],
  bite:[/(?:^|[^a-z0-9])(bite|mouth[_\s-]?f|viseme[_\s-]?f|viseme[_\s-]?fv|mouth[_\s-]?fv|fv)(?:[^a-z0-9]|$)/i],
  teeth:[/(?:^|[^a-z0-9])(teeth|mouth[_\s-]?g|viseme[_\s-]?g|viseme[_\s-]?ee|mouth[_\s-]?ee)(?:[^a-z0-9]|$)/i],
  pucker:[/(?:^|[^a-z0-9])(pucker|kiss|mouth[_\s-]?h|viseme[_\s-]?h|viseme[_\s-]?oo|mouth[_\s-]?oo|viseme[_\s-]?u|mouth[_\s-]?u)(?:[^a-z0-9]|$)/i],
  frown:[/(?:^|[^a-z0-9])(frown|sad[_\s-]?mouth|mouth[_\s-]?frown)(?:[^a-z0-9]|$)/i],
})

export function validateMouthMap(rig){
  if(rig?.mouthMap===undefined)return;
  if(!rig.mouthMap||Array.isArray(rig.mouthMap)||typeof rig.mouthMap!=='object')throw Error('Invalid 3D mouth mapping.');
  for(const [shape,index] of Object.entries(rig.mouthMap)){
    if(!MOUTH_MAP_KEYS.includes(shape)||!Number.isInteger(index)||index<0||index>255)
      throw Error('Invalid 3D mouth mapping.');
  }
}

/** How many mouthMap entries Clear mouth morph map would remove. */

/** Gate for Apply cues to drawing mouth layers (needs saved cues + Mouth * drawing layers). */
export function applyLipSyncDrawingGate(shot){
  if(!shot?.lipSync||!shot?.drawing)return{ok:false,reason:'Save cues and create a drawing first.'};
  const cues=Array.isArray(shot.lipSync.mouthCues)?shot.lipSync.mouthCues:[];
  const layers=Array.isArray(shot.drawing.layers)?shot.drawing.layers:[];
  const names=new Set(layers.map(l=>l&&typeof l.name==='string'?l.name:'').filter(Boolean));
  for(const shape of new Set(['X',...cues.map(c=>c&&c.value).filter(Boolean)])){
    if(!names.has('Mouth '+shape))return{ok:false,reason:'Add a drawing layer named Mouth '+shape+'.'};
  }
  return{ok:true,reason:'Apply saved mouth cues to drawing Mouth layers. Undo restores.'};
}

/** Gate for Apply cues to 3D face (needs cues + face keyframe + distinct mouthMap morphs). */
export function applyLipSyncFaceGate(shot){
  if(!shot?.lipSync||!shot?.rig3d)return{ok:false,reason:'Save cues and create a 3D rig first.'};
  if(!shot.rig3d.face?.length)return{ok:false,reason:'Save one 3D face keyframe first so its shape controls are registered.'};
  const map=shot.rig3d.mouthMap&&typeof shot.rig3d.mouthMap==='object'&&!Array.isArray(shot.rig3d.mouthMap)?shot.rig3d.mouthMap:{};
  const cues=Array.isArray(shot.lipSync.mouthCues)?shot.lipSync.mouthCues:[];
  const letters=[...new Set(cues.map(c=>c&&c.value).filter(Boolean))];
  const indices=[];
  for(const shape of letters){
    if(shape==='X')continue;
    const index=Number.isInteger(map[shape])?map[shape]:map[MOUTH_SHAPE_TO_FEATURE[shape]];
    if(!Number.isInteger(index))return{ok:false,reason:'Map mouth '+shape+' (or '+MOUTH_SHAPE_TO_FEATURE[shape]+') to a shape control first.'};
    if(index<0||index>=shot.rig3d.face.length)return{ok:false,reason:'Use an existing shape control for mouth '+shape+'.'};
    indices.push(index);
  }
  if(new Set(indices).size!==indices.length)return{ok:false,reason:'Use a distinct, existing shape control for each mapped mouth.'};
  return{ok:true,reason:'Apply saved mouth cues to the 3D face. Undo restores.'};
}

export function clearableMouthMapCount(rig){
  const map=rig?.mouthMap;
  if(!map||typeof map!=='object'||Array.isArray(map))return 0;
  return Object.keys(map).length;
}

/** Active mouth letter + denser Face style at a playhead frame. */
export function resolveActiveMouth(rig,frame){
  let letter=null,style=null;
  if(rig?.lipSync){
    letter=mouthAt(rig.lipSync,frame/24);
    style=MOUTH_SHAPE_TO_FEATURE[letter]||null;
  }
  const features=sampleFeatures(rig,frame);
  if(features?.mouth?.style){
    if(!rig?.lipSync)style=features.mouth.style;
    else if(!style)style=features.mouth.style;
  }else if(!style&&rig?.features?.mouth?.style&&!rig?.featureKeys?.length){
    style=rig.features.mouth.style;
  }
  if(!letter&&style)letter=FEATURE_TO_MOUTH_SHAPE[style]||null;
  return {letter,style};
}

/**
 * Auto-map morph target names -> denser Face styles (+ letter aliases).
 * First matching unused morph wins per style. Returns a fresh map.
 */
export function detectMouthMapFromMorphNames(names){
  if(!Array.isArray(names))throw Error('Morph names are required to auto-detect a mouth map.');
  if(names.length>256)throw Error('Too many morph targets to auto-detect (max 256).');
  const map={};
  const used=new Set();
  for(const style of MOUTH_STYLES){
    const patterns=MOUTH_MORPH_HEURISTICS[style]||[];
    let hit=-1;
    for(let i=0;i<names.length;i++){
      if(used.has(i))continue;
      const name=String(names[i]||'');
      if(!name)continue;
      if(patterns.some(re=>re.test(name))){hit=i;break;}
    }
    if(hit<0)continue;
    map[style]=hit;
    used.add(hit);
    const letter=FEATURE_TO_MOUTH_SHAPE[style];
    if(letter)map[letter]=hit;
  }
  return map;
}

/** Merge detected entries into an existing mouthMap; overrides keys present in detected. */
export function applyDetectedMouthMap(rig,names,{replace=false}={}){
  const detected=detectMouthMapFromMorphNames(names);
  if(!Object.keys(detected).length)throw Error('No morph names matched mouth heuristics. Assign indices by hand.');
  const next=structuredClone(rig||{});
  next.mouthMap=replace?{...detected}:Object.assign({},next.mouthMap||{},detected);
  validateMouthMap(next);
  return next;
}



export function validateLipSync(sync){
  if(sync===undefined)return;
  if(!sync||!Array.isArray(sync.mouthCues)||sync.mouthCues.length>20000)throw Error('Invalid mouth cues.');
  let end=0;
  for(const c of sync.mouthCues){
    if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<end||c.end<=c.start||c.end>3600||!MOUTH_SHAPES.includes(c.value))
      throw Error('Mouth cues need ordered times and shapes A-H or X.');
    end=c.end;
  }
  if(sync.duration!==undefined){
    if(!Number.isFinite(sync.duration)||sync.duration<=0||sync.duration>3600)throw Error('Lip-sync duration must be from 0 to 3600 seconds.');
  }
  if(sync.offsetSec!==undefined){
    if(!Number.isFinite(sync.offsetSec)||Math.abs(sync.offsetSec)>3600)throw Error('Lip-sync offset must be within +/-3600 seconds.');
  }
}

export function mouthAt(sync,seconds){
  return sync?.mouthCues.find(c=>seconds>=c.start&&seconds<c.end)?.value||'X';
}

export function lipSyncEndSeconds(sync){
  const cues=sync?.mouthCues;
  if(!cues?.length)return 0;
  return cues[cues.length-1].end;
}

export function firstSpeechCueStart(sync){
  for(const cue of sync?.mouthCues||[])if(cue.value!=='X')return cue.start;
  return sync?.mouthCues?.[0]?.start??0;
}

function cloneSync(sync){
  const next=sync&&typeof sync==='object'?structuredClone(sync):{mouthCues:[]};
  next.mouthCues=Array.isArray(next.mouthCues)?next.mouthCues:[];
  return next;
}

function snapTime(t){
  return Math.round(Number(t)*1e6)/1e6;
}

export function insertMouthCue(sync,cue){
  const next=cloneSync(sync);
  next.mouthCues=[...next.mouthCues,{start:cue.start,end:cue.end,value:cue.value}].sort((a,b)=>a.start-b.start);
  validateLipSync(next);
  return next;
}

export function removeMouthCue(sync,start){
  const next=cloneSync(sync);
  const before=next.mouthCues.length;
  next.mouthCues=next.mouthCues.filter(cue=>Math.abs(cue.start-Number(start))>1e-4);
  if(next.mouthCues.length===before)throw Error('No mouth cue starts at that time.');
  validateLipSync(next);
  return next;
}

export function replaceMouthCue(sync,atStart,cue){
  if(!Number.isFinite(Number(atStart)))throw Error('Cue start time is required to replace a mouth cue.');
  if(!cue||typeof cue!=='object')throw Error('Replacement mouth cue is required.');
  const next=cloneSync(sync);
  const idx=next.mouthCues.findIndex(c=>Math.abs(c.start-Number(atStart))<=1e-4);
  if(idx<0)throw Error('No mouth cue starts at that time.');
  const value=cue.value!==undefined?cue.value:next.mouthCues[idx].value;
  const start=cue.start!==undefined?Number(cue.start):next.mouthCues[idx].start;
  const end=cue.end!==undefined?Number(cue.end):next.mouthCues[idx].end;
  next.mouthCues[idx]={start,end,value};
  next.mouthCues.sort((a,b)=>a.start-b.start);
  validateLipSync(next);
  return next;
}

/** Move one cue edge by deltaSec. When the edge abuts a neighbor (within 1e-4s), push that neighbor too so Rhubarb-contiguous tracks stay gapless. */
export function nudgeMouthCueEdge(sync,atStart,edge,deltaSec,{frameSec=1/24}={}){
  if(!Number.isFinite(Number(atStart)))throw Error('Cue start time is required to nudge a mouth cue.');
  if(edge!=='start'&&edge!=='end')throw Error('Edge must be start or end.');
  if(!Number.isFinite(deltaSec))throw Error('Edge nudge must be a finite number of seconds.');
  if(deltaSec===0)return cloneSync(sync);
  const minDur=Number.isFinite(frameSec)&&frameSec>0?Math.min(frameSec,1e-3):1e-3;
  const next=cloneSync(sync);
  const idx=next.mouthCues.findIndex(c=>Math.abs(c.start-Number(atStart))<=1e-4);
  if(idx<0)throw Error('No mouth cue starts at that time.');
  const cue=next.mouthCues[idx];
  const prev=idx>0?next.mouthCues[idx-1]:null;
  const following=idx<next.mouthCues.length-1?next.mouthCues[idx+1]:null;
  if(edge==='end'){
    let target=snapTime(cue.end+deltaSec);
    const floor=snapTime(cue.start+minDur);
    if(following){
      const abuts=Math.abs(following.start-cue.end)<=1e-4;
      if(abuts){
        const ceil=snapTime(following.end-minDur);
        target=Math.max(floor,Math.min(ceil,target));
        following.start=target;
        cue.end=target;
      }else{
        const ceil=snapTime(following.start);
        target=Math.max(floor,Math.min(ceil,target));
        if(target<=cue.start)throw Error('That end nudge would collapse the cue.');
        cue.end=target;
      }
    }else{
      target=Math.max(floor,Math.min(3600,target));
      if(target<=cue.start)throw Error('That end nudge would collapse the cue.');
      cue.end=target;
    }
  }else{
    let target=snapTime(cue.start+deltaSec);
    const ceil=snapTime(cue.end-minDur);
    if(prev){
      const abuts=Math.abs(prev.end-cue.start)<=1e-4;
      if(abuts){
        const floor=snapTime(prev.start+minDur);
        target=Math.max(floor,Math.min(ceil,target));
        prev.end=target;
        cue.start=target;
      }else{
        const floor=snapTime(prev.end);
        target=Math.max(floor,Math.min(ceil,target));
        if(target>=cue.end)throw Error('That start nudge would collapse the cue.');
        cue.start=target;
      }
    }else{
      target=Math.max(0,Math.min(ceil,target));
      if(target>=cue.end)throw Error('That start nudge would collapse the cue.');
      cue.start=target;
    }
  }
  if(Number.isFinite(next.duration))next.duration=snapTime(Math.max(next.duration,lipSyncEndSeconds(next)));
  validateLipSync(next);
  return next;
}

/** Set one cue edge to an absolute time (seconds). Abutting neighbors move with the boundary. Returns {sync, atStart}. */
export function setMouthCueEdge(sync,atStart,edge,timeSec,{frameSec=1/24}={}){
  if(!Number.isFinite(Number(timeSec)))throw Error('Edge time must be a finite number of seconds.');
  const probe=cloneSync(sync);
  const idx=probe.mouthCues.findIndex(c=>Math.abs(c.start-Number(atStart))<=1e-4);
  if(idx<0)throw Error('No mouth cue starts at that time.');
  const cue=probe.mouthCues[idx];
  const current=edge==='start'?cue.start:cue.end;
  const delta=snapTime(Number(timeSec)-current);
  if(delta===0)return {sync:probe,atStart:cue.start};
  const synced=nudgeMouthCueEdge(sync,atStart,edge,delta,{frameSec});
  const newAt=synced.mouthCues[Math.min(idx,synced.mouthCues.length-1)]?.start ?? Number(atStart);
  return {sync:synced,atStart:newAt};
}


/** Nudge every cue by offsetSec. Rejects shifts that would push any cue before 0s or past 3600s. */
export function shiftMouthCues(sync,offsetSec){
  if(!Number.isFinite(offsetSec)||Math.abs(offsetSec)>3600)throw Error('Offset must be a finite number within +/-3600 seconds.');
  const next=cloneSync(sync);
  if(!next.mouthCues.length)throw Error('Add or generate mouth cues before shifting them.');
  if(offsetSec===0)return next;
  next.mouthCues=next.mouthCues.map(cue=>({
    start:snapTime(cue.start+offsetSec),
    end:snapTime(cue.end+offsetSec),
    value:cue.value,
  }));
  if(next.mouthCues[0].start<0)throw Error('That offset would push cues before 0s. Use a smaller late shift, or fit to duration first.');
  if(next.mouthCues[next.mouthCues.length-1].end>3600)throw Error('That offset would push cues past 3600s.');
  next.offsetSec=snapTime((Number(next.offsetSec)||0)+offsetSec);
  if(Number.isFinite(next.duration))next.duration=snapTime(Math.max(next.duration,next.mouthCues[next.mouthCues.length-1].end));
  validateLipSync(next);
  return next;
}

/** Proportionally scale cue times so the last cue ends at durationSec (voice take / shot audio length). */
export function fitMouthCuesToDuration(sync,durationSec){
  if(!Number.isFinite(durationSec)||durationSec<=0||durationSec>3600)throw Error('Duration must be greater than 0 and at most 3600 seconds.');
  const next=cloneSync(sync);
  const end=lipSyncEndSeconds(next);
  if(!next.mouthCues.length||end<=0){
    next.mouthCues=[{start:0,end:snapTime(durationSec),value:'X'}];
    next.duration=snapTime(durationSec);
    validateLipSync(next);
    return next;
  }
  const scale=durationSec/end;
  next.mouthCues=next.mouthCues.map(cue=>({
    start:snapTime(cue.start*scale),
    end:snapTime(cue.end*scale),
    value:cue.value,
  }));
  let prev=0;
  for(const cue of next.mouthCues){
    if(cue.start<prev)cue.start=prev;
    if(cue.end<=cue.start)cue.end=snapTime(cue.start+1e-3);
    prev=cue.end;
  }
  next.mouthCues[next.mouthCues.length-1].end=snapTime(durationSec);
  if(next.mouthCues[next.mouthCues.length-1].end<=next.mouthCues[next.mouthCues.length-1].start){
    next.mouthCues[next.mouthCues.length-1].start=snapTime(Math.max(0,durationSec-1e-3));
    next.mouthCues[next.mouthCues.length-1].end=snapTime(durationSec);
  }
  next.duration=snapTime(durationSec);
  validateLipSync(next);
  return next;
}

/**
 * First sustained energy rise in a peak strip, in seconds.
 * Manual override still preferred; this only suggests an onset when peaks exist.
 */
export function speechOnsetFromPeaks(peaks,durationSec,{thresholdRatio=0.25,minRun=2,silentMax=0.02}={}){
  if(!Array.isArray(peaks)||!peaks.length)throw Error('Peaks are required to estimate speech onset.');
  if(!Number.isFinite(durationSec)||durationSec<=0||durationSec>3600)throw Error('Duration must be greater than 0 and at most 3600 seconds.');
  if(!Number.isFinite(thresholdRatio)||thresholdRatio<=0||thresholdRatio>1)throw Error('Threshold ratio must be between 0 and 1.');
  if(!Number.isInteger(minRun)||minRun<1||minRun>64)throw Error('minRun must be a whole number from 1 to 64.');
  let max=0;
  for(const p of peaks)max=Math.max(max,Number(p)||0);
  if(max<silentMax)return 0;
  const thr=max*thresholdRatio;
  let run=0;
  for(let i=0;i<peaks.length;i++){
    if((Number(peaks[i])||0)>=thr){
      run+=1;
      if(run>=minRun)return snapTime(((i-minRun+1)/peaks.length)*durationSec);
    }else run=0;
  }
  return 0;
}

/** Shift cues so the first non-X (speech) cue starts at onsetSec. */
export function alignMouthCuesToOnset(sync,onsetSec){
  if(!Number.isFinite(onsetSec)||onsetSec<0||onsetSec>3600)throw Error('Onset must be from 0 to 3600 seconds.');
  const speech=firstSpeechCueStart(sync);
  return shiftMouthCues(sync,onsetSec-speech);
}

/** Scrub markers / spans for mouth cues (frames). Used by Face lip-sync strip and tests. */
export function mouthCueScrubModel(sync,{fps=24,lastFrame}={}){
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('fps must be a positive number.');
  const endSec=lipSyncEndSeconds(sync);
  const last=Number.isInteger(lastFrame)?lastFrame:Math.max(0,Math.ceil(endSec*fps)-1);
  const spans=[],marks=[];
  for(const cue of sync?.mouthCues||[]){
    const start=Math.max(0,Math.min(last,Math.round(cue.start*fps)));
    const end=Math.max(start,Math.min(last,Math.max(0,Math.ceil(cue.end*fps)-1)));
    spans.push({start,end,value:cue.value,label:'Mouth '+cue.value,startSec:cue.start,endSec:cue.end});
    marks.push({frame:start,value:cue.value,seconds:cue.start});
  }
  return {last,fps,spans,marks,endSec};
}

/** Pending Face/3D playhead seeks while the 3D panel is not mounted yet (lazy createRig3D). */
const pendingFaceSeeks=new Map();

/** Queue a Face/3D seek frame for a shot. Latest wins. */
export function queueFaceSeek(shotId,frame){
  if(shotId==null||shotId==='')throw Error('shotId is required to queue a Face seek.');
  const f=Math.round(Number(frame));
  if(!Number.isFinite(f)||f<0||f>=86400)throw Error('Face seek frame must be a finite frame index.');
  pendingFaceSeeks.set(String(shotId),f);
  return f;
}

/** Read the pending Face/3D seek without clearing it. */
export function peekPendingFaceSeek(shotId){
  if(shotId==null||shotId==='')return null;
  return pendingFaceSeeks.has(String(shotId))?pendingFaceSeeks.get(String(shotId)):null;
}

/** Take and clear the pending Face/3D seek for a shot (applied on 3D mount). */
export function takePendingFaceSeek(shotId){
  if(shotId==null||shotId==='')return null;
  const key=String(shotId);
  if(!pendingFaceSeeks.has(key))return null;
  const f=pendingFaceSeeks.get(key);
  pendingFaceSeeks.delete(key);
  return f;
}

/** Drop a queued Face/3D seek (live listener already applied it). */
export function clearPendingFaceSeek(shotId){
  if(shotId==null||shotId==='')return false;
  return pendingFaceSeeks.delete(String(shotId));
}

/** Map a Face/3D playhead frame onto mouth + peak scrub positions. */
export function mouthPlayheadModel(frame,{fps=24,lastFrame,durationSec}={}){
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('fps must be a positive number.');
  const last=Number.isInteger(lastFrame)?lastFrame:Math.max(0,Math.ceil((Number.isFinite(durationSec)?durationSec:0)*fps)-1);
  if(last<0)throw Error('lastFrame must be >= 0.');
  const f=Math.max(0,Math.min(last,Math.round(Number(frame)||0)));
  const endSec=Number.isFinite(durationSec)&&durationSec>0?durationSec:(last+1)/fps;
  const seconds=snapTime(f/fps);
  const mouthRatio=last>0?f/last:0;
  const peakRatio=endSec>0?Math.max(0,Math.min(1,seconds/endSec)):0;
  return {frame:f,last,fps,seconds,mouthRatio,peakRatio,endSec};
}

/** Peak strip + onset marker model for Face mouth scrub (seconds). Downs samples for display. */
export function mouthPeakOnsetModel(peaks,durationSec,{onsetSec,bins=64}={}){
  if(!Array.isArray(peaks)||!peaks.length)throw Error('Peaks are required for the mouth peak strip.');
  if(!Number.isFinite(durationSec)||durationSec<=0||durationSec>3600)throw Error('Duration must be greater than 0 and at most 3600 seconds.');
  const n=Math.max(8,Math.min(256,Number.isInteger(bins)?bins:64));
  const display=new Array(n);
  for(let i=0;i<n;i++){
    const a=Math.floor(i*peaks.length/n);
    const b=Math.max(a+1,Math.floor((i+1)*peaks.length/n));
    let m=0;
    for(let j=a;j<b&&j<peaks.length;j++)m=Math.max(m,Number(peaks[j])||0);
    display[i]=m;
  }
  let max=0;
  for(const p of display)max=Math.max(max,p);
  const norm=display.map(p=>max>0?p/max:0);
  const onset=Number.isFinite(onsetSec)
    ?snapTime(Math.max(0,Math.min(durationSec,onsetSec)))
    :speechOnsetFromPeaks(peaks,durationSec);
  const onsetRatio=durationSec>0?Math.max(0,Math.min(1,onset/durationSec)):0;
  return {durationSec,bins:n,peaks:norm,rawPeaks:peaks,onsetSec:onset,onsetRatio};
}


/** True when eyes/ears/brows match the base face (mouth-only / prior Write Face key). */
function faceChannelsMatchBase(part,base){
  if(!part&&!base)return true;
  if(!part||!base)return false;
  return part.style===base.style
    &&Number(part.scale)===Number(base.scale)
    &&Number(part.spread)===Number(base.spread)
    &&Number(part.height)===Number(base.height)
    &&Number(part.depth)===Number(base.depth)
    &&part.color===base.color;
}

function hasNonMouthActing(key,features){
  return !faceChannelsMatchBase(key?.eyes,features?.eyes)
    ||!faceChannelsMatchBase(key?.ears,features?.ears)
    ||!faceChannelsMatchBase(key?.brows,features?.brows);
}

/**
 * Write Face featureKeys mouth styles from mouth cues (style changes only).
 * Replaces the mouth channel: drops stale mouth-only keys outside the new cue
 * write (Fit / cue edit orphans) and past lastFrame; keeps non-mouth acting
 * (eyes/ears/brows) keys. Carries eyes/ears/brows from prior keys on the same
 * frame. Caps at 64 keys. Pass summary:{} to receive {written,cleared,kept}.
 */
export function featureKeysFromMouthCues(rig,sync,{fps=24,lastFrame,summary}={}){
  if(!rig||typeof rig!=='object')throw Error('A 3D rig with Face features is required.');
  if(!rig.features?.mouth)throw Error('Set Face mouth features first.');
  if(!sync?.mouthCues?.length)throw Error('Save mouth cues first.');
  if(!Number.isFinite(fps)||fps<=0||fps>240)throw Error('fps must be a positive number.');
  const endSec=lipSyncEndSeconds(sync);
  const last=Number.isInteger(lastFrame)?lastFrame:Math.max(0,Math.ceil(endSec*fps)-1);
  const carry=part=>part?structuredClone(part):undefined;
  const priorKeys=rig.featureKeys||[];
  const priorByFrame=new Map(priorKeys.map(key=>[key.frame,key]));
  const written=[];
  let prevStyle=null;
  const used=new Set();
  for(const cue of sync.mouthCues){
    const style=MOUTH_SHAPE_TO_FEATURE[cue.value];
    if(!style||style===prevStyle)continue;
    let frame=Math.max(0,Math.min(last,Math.round(cue.start*fps)));
    while(used.has(frame)&&frame<last)frame+=1;
    if(used.has(frame))throw Error('Mouth cues are too dense for Face keys on this shot length.');
    used.add(frame);
    const prior=priorByFrame.get(frame);
    written.push({
      frame,
      eyes:carry(prior?.eyes||rig.features.eyes),
      ears:carry(prior?.ears||rig.features.ears),
      mouth:{...carry(prior?.mouth||rig.features.mouth),style},
      brows:carry(prior?.brows||rig.features.brows),
    });
    prevStyle=style;
  }
  if(!written.length)throw Error('No speech mouth shapes to write as Face keys.');
  if(written.length>64)throw Error('Mouth cues produce more than 64 Face keys. Fit or thin cues first.');
  const writeFrames=new Set(written.map(k=>k.frame));
  // Replace mouth channel: drop mouth-only / prior-Write orphans and keys past shot end.
  const kept=priorKeys.filter(key=>{
    if(writeFrames.has(key.frame))return false;
    if(!Number.isInteger(key.frame)||key.frame<0||key.frame>last)return false;
    return hasNonMouthActing(key,rig.features);
  });
  const clearedCount=priorKeys.filter(key=>!writeFrames.has(key.frame)&&!kept.includes(key)).length;
  if(kept.length+written.length>64)throw Error('Combining existing Face keys with mouth cues exceeds 64 keys.');
  const next=structuredClone(rig);
  next.featureKeys=[...kept,...written].sort((a,b)=>a.frame-b.frame);
  if(summary&&typeof summary==='object'){
    summary.written=written.length;
    summary.kept=kept.length;
    summary.cleared=clearedCount;
    summary.total=next.featureKeys.length;
  }
  return next;
}

/** Best-known audio length for this shot: lipSync.duration, matching voice take, or cue end. */
export function resolveVoiceAudioSeconds(shot,voiceTakes){
  if(Number.isFinite(shot?.lipSync?.duration)&&shot.lipSync.duration>0)return shot.lipSync.duration;
  const name=shot?.audio?.name||shot?.audio?.filename;
  if(name&&Array.isArray(voiceTakes)){
    const take=voiceTakes.find(t=>(t.audio?.name||t.audio?.filename)===name&&Number.isFinite(t.seconds)&&t.seconds>0);
    if(take)return take.seconds;
  }
  const end=lipSyncEndSeconds(shot?.lipSync);
  return end>0?end:null;
}

export function faceWithMouth(rig,frame,face){
  const map=rig?.mouthMap;
  if(!map||!Object.keys(map).length)return face;
  if(!rig.lipSync&&!rig.features?.mouth&&!(rig.featureKeys&&rig.featureKeys.length))return face;
  const {letter,style}=resolveActiveMouth(rig,frame);
  const active=new Set();
  if(letter)active.add(letter);
  if(style)active.add(style);
  const result=[...face];
  for(const [key,index] of Object.entries(map)){
    if(Number.isInteger(index)&&index>=0&&index<result.length)result[index]=active.has(key)?1:0;
  }
  return result;
}

function mouthScrubStrip(host,sync,{fps=24,lastFrame,onPick,onOnset,onSeek,onResize}={}){
  const box=document.createElement('div');
  box.className='performance-scrub-strip lipsync-scrub-strip';
  box.setAttribute('role','group');
  box.setAttribute('aria-label','Mouth cue timing strip');
  const note=document.createElement('p');
  note.className='hint';
  note.textContent='Mouth cue scrub strip. Click a span or empty lane to jump the Face/3D playhead and load that cue. Drag a span\'s left/right edge to nudge that boundary (abutting neighbors move together). Live voice peaks appear when a voice take is attached. Click the peak strip to scrub Face; Shift+click or drag the green onset mark (or arrow keys) to set Align onset.';
  const lanes=document.createElement('div');lanes.className='performance-scrub-lanes';
  const empty=document.createElement('p');empty.className='hint performance-scrub-empty';empty.textContent='No mouth cues yet.';
  const status=document.createElement('p');status.setAttribute('role','status');
  box.append(note,lanes,empty,status);
  host.append(box);
  let peakModel=null;
  let lastSync=sync;
  let playheadFrame=0;

  function resolveLast(){
    const raw=typeof lastFrame==='function'?lastFrame():lastFrame;
    return Math.max(0,Number.isInteger(raw)?raw:Math.round(Number(raw)||0));
  }

  function playhead(){
    return mouthPlayheadModel(playheadFrame,{
      fps,
      lastFrame:resolveLast(),
      durationSec:peakModel?.durationSec,
    });
  }

  function seekFromRatio(ratio,{announce}={}){
    const last=resolveLast();
    const frame=Math.round(Math.max(0,Math.min(1,ratio))*last);
    playheadFrame=frame;
    onSeek?.(frame);
    if(announce!==false){
      const ph=playhead();
      status.textContent='Playhead frame '+ph.frame+' · '+ph.seconds.toFixed(3)+'s.';
    }
    paint(lastSync);
  }

  function setPlayhead(frame,{repaint=true}={}){
    const last=resolveLast();
    playheadFrame=Math.max(0,Math.min(last,Math.round(Number(frame)||0)));
    if(repaint)paint(lastSync);
    return playheadFrame;
  }

  function drawPeakCanvas(canvas,peaks){
    const w=Math.max(64,canvas.clientWidth||320);
    const h=Math.max(22,canvas.clientHeight||28);
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#0e1520';
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#4a8ab8';
    ctx.lineWidth=1;
    ctx.beginPath();
    const mid=h/2;
    const n=peaks.length;
    for(let x=0;x<w;x++){
      const peak=peaks[Math.min(n-1,Math.floor(x/w*n))]||0;
      const amp=peak*(h*0.42);
      ctx.moveTo(x+0.5,mid-amp);
      ctx.lineTo(x+0.5,mid+amp);
    }
    ctx.stroke();
  }

  function paintPeakRow(){
    const existing=lanes.querySelector('[data-kind="voice-peaks"]');
    if(existing)existing.remove();
    if(!peakModel?.peaks?.length)return;
    const row=document.createElement('div');row.className='performance-scrub-row';row.dataset.kind='voice-peaks';
    const label=document.createElement('span');label.className='performance-scrub-label';label.textContent='Voice peaks';
    const lane=document.createElement('div');lane.className='performance-scrub-track lipsync-peak-track';lane.setAttribute('role','slider');
    lane.setAttribute('aria-label','Voice waveform peaks. Click to scrub Face playhead. Shift+click or drag onset mark to set speech onset.');
    lane.tabIndex=0;
    const canvas=document.createElement('canvas');canvas.className='lipsync-peak-canvas';canvas.setAttribute('aria-hidden','true');
    const onsetMark=document.createElement('span');
    onsetMark.className='lipsync-onset-mark';
    onsetMark.title='Speech onset '+peakModel.onsetSec.toFixed(3)+'s (drag to adjust)';
    onsetMark.style.left=(peakModel.onsetRatio*100)+'%';
    onsetMark.setAttribute('aria-hidden','true');
    const ph=playhead();
    const head=document.createElement('div');
    head.className='performance-scrub-playhead';
    head.style.left=(ph.peakRatio*100)+'%';
    head.title='Playhead frame '+ph.frame;
    lane.append(canvas,onsetMark,head);
    function setOnsetFromClientX(clientX){
      const rect=lane.getBoundingClientRect();
      if(!rect.width)return;
      const ratio=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
      const sec=snapTime(ratio*peakModel.durationSec);
      peakModel={...peakModel,onsetSec:sec,onsetRatio:ratio};
      onsetMark.style.left=(ratio*100)+'%';
      onsetMark.title='Speech onset '+sec.toFixed(3)+'s (drag to adjust)';
      onOnset?.(sec);
      paint(lastSync);
    }
    function scrubFromClientX(clientX){
      const rect=lane.getBoundingClientRect();
      if(!rect.width)return;
      seekFromRatio((clientX-rect.left)/rect.width);
    }
    lane.onclick=e=>{
      if(e.target===onsetMark)return;
      if(e.shiftKey)setOnsetFromClientX(e.clientX);
      else scrubFromClientX(e.clientX);
    };
    onsetMark.onpointerdown=e=>{
      e.preventDefault();
      e.stopPropagation();
      onsetMark.setPointerCapture?.(e.pointerId);
      setOnsetFromClientX(e.clientX);
      const move=ev=>setOnsetFromClientX(ev.clientX);
      const up=()=>{
        onsetMark.releasePointerCapture?.(e.pointerId);
        window.removeEventListener('pointermove',move);
        window.removeEventListener('pointerup',up);
      };
      window.addEventListener('pointermove',move);
      window.addEventListener('pointerup',up);
    };
    lane.onkeydown=e=>{
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        e.preventDefault();
        const step=(e.shiftKey?1/24:1/48)*(e.key==='ArrowRight'?1:-1);
        const sec=snapTime(Math.max(0,Math.min(peakModel.durationSec,peakModel.onsetSec+step)));
        peakModel={...peakModel,onsetSec:sec,onsetRatio:peakModel.durationSec>0?sec/peakModel.durationSec:0};
        onsetMark.style.left=(peakModel.onsetRatio*100)+'%';
        onsetMark.title='Speech onset '+sec.toFixed(3)+'s (drag to adjust)';
        onOnset?.(sec);
        paint(lastSync);
        return;
      }
      if(e.key==='Home'||e.key==='End'){
        e.preventDefault();
        seekFromRatio(e.key==='Home'?0:1);
      }
    };
    row.append(label,lane);lanes.prepend(row);
    requestAnimationFrame(()=>drawPeakCanvas(canvas,peakModel.peaks));
  }

  function paint(nextSync){
    lastSync=nextSync;
    const model=mouthCueScrubModel(nextSync,{fps,lastFrame:resolveLast()});
    const ph=playhead();
    lanes.replaceChildren();
    empty.hidden=!!model.spans.length;
    status.textContent=model.spans.length
      ? model.spans.length+' mouth cue'+(model.spans.length===1?'':'s')+' - ends '+model.endSec.toFixed(2)+'s - last frame '+model.last+' - playhead '+ph.frame
      : '';
    paintPeakRow();
    if(!model.spans.length){
      if(peakModel)status.textContent=(status.textContent?status.textContent+' ':'')+'Voice peaks ready'+(peakModel.onsetSec>0?' - onset '+peakModel.onsetSec.toFixed(3)+'s':'')+' - playhead '+ph.frame+'.';
      else status.textContent='Playhead frame '+ph.frame+' - add or generate mouth cues, or scrub this empty lane / Face timeline.';
    }
    const row=document.createElement('div');row.className='performance-scrub-row';row.dataset.kind='mouth';
    const label=document.createElement('span');label.className='performance-scrub-label';label.textContent='Mouth cues';
    const lane=document.createElement('div');lane.className='performance-scrub-track';lane.setAttribute('role','presentation');
    lane.title='Click to scrub Face playhead';
    const end=Math.max(1,model.last);
    for(const span of model.spans){
      const bar=document.createElement('button');
      bar.type='button';
      bar.className='performance-scrub-span';
      bar.dataset.value=span.value;
      bar.title='Mouth '+span.value+' - '+span.startSec.toFixed(2)+'s-'+span.endSec.toFixed(2)+'s';
      const barLabel=document.createElement('span');
      barLabel.className='lipsync-cue-label';
      barLabel.textContent=span.value;
      bar.append(barLabel);
      bar.style.left=(span.start/end*100)+'%';
      bar.style.width=(Math.max(1,span.end-span.start+1)/end*100)+'%';
      bar.onclick=e=>{
        e.stopPropagation();
        onPick?.(span);
        playheadFrame=span.start;
        onSeek?.(span.start);
        paint(lastSync);
      };
      if(typeof onResize==='function'){
        for(const edge of ['start','end']){
          const handle=document.createElement('span');
          handle.className='lipsync-cue-edge lipsync-cue-edge-'+edge;
          handle.title=(edge==='start'?'Drag start':'Drag end')+' boundary';
          handle.setAttribute('aria-hidden','true');
          handle.onpointerdown=e=>{
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture?.(e.pointerId);
            const track=lane.getBoundingClientRect();
            const endFrame=Math.max(1,model.last);
            const endSec=Math.max(model.endSec,peakModel?.durationSec||0,1e-6);
            let liveAtStart=span.startSec;
            onPick?.(span);
            const move=ev=>{
              if(!track.width)return;
              const ratio=Math.max(0,Math.min(1,(ev.clientX-track.left)/track.width));
              const frame=Math.round(ratio*endFrame);
              const sec=snapTime((frame/Math.max(1,endFrame))*endSec);
              try{
                const result=onResize(liveAtStart,edge,sec);
                const next=result?.sync||result;
                if(next){
                  if(Number.isFinite(result?.atStart))liveAtStart=result.atStart;
                  else if(edge==='start')liveAtStart=sec;
                  lastSync=next;
                  // Live-update this bar geometry without rebuilding the whole strip (keeps pointer capture).
                  const end=Math.max(1,model.last);
                  const cue=next.mouthCues.find(c=>Math.abs(c.start-liveAtStart)<=1e-4);
                  if(cue){
                    const startF=Math.round(cue.start*fps);
                    const endF=Math.max(startF,Math.round(cue.end*fps)-1);
                    bar.style.left=(startF/end*100)+'%';
                    bar.style.width=(Math.max(1,endF-startF+1)/end*100)+'%';
                    bar.title='Mouth '+cue.value+' - '+cue.start.toFixed(2)+'s-'+cue.end.toFixed(2)+'s';
                    bar.dataset.value=cue.value;
                    const label=bar.querySelector('.lipsync-cue-label');
                    if(label)label.textContent=cue.value;
                  }
                }
              }catch(err){
                status.textContent=err.message||String(err);
              }
            };
            const up=()=>{
              handle.releasePointerCapture?.(e.pointerId);
              window.removeEventListener('pointermove',move);
              window.removeEventListener('pointerup',up);
              paint(lastSync);
              const loaded=lastSync?.mouthCues?.find(c=>Math.abs(c.start-liveAtStart)<=1e-4);
              if(loaded)onPick?.({
                value:loaded.value,
                startSec:loaded.start,
                endSec:loaded.end,
                start:Math.round(loaded.start*fps),
                end:Math.max(Math.round(loaded.start*fps),Math.round(loaded.end*fps)-1),
              });
            };
            window.addEventListener('pointermove',move);
            window.addEventListener('pointerup',up);
          };
          bar.append(handle);
        }
      }
      lane.append(bar);
    }
    if(peakModel&&Number.isFinite(peakModel.onsetSec)){
      const mouthOnset=document.createElement('span');
      mouthOnset.className='lipsync-onset-mark';
      const endSec=Math.max(model.endSec,peakModel.durationSec,1e-6);
      mouthOnset.style.left=(Math.max(0,Math.min(1,peakModel.onsetSec/endSec))*100)+'%';
      mouthOnset.title='Speech onset '+peakModel.onsetSec.toFixed(3)+'s';
      lane.append(mouthOnset);
    }
    const head=document.createElement('div');
    head.className='performance-scrub-playhead';
    head.style.left=(ph.mouthRatio*100)+'%';
    head.title='Playhead frame '+ph.frame;
    lane.append(head);
    lane.onclick=e=>{
      if(e.target!==lane)return;
      const rect=lane.getBoundingClientRect();
      if(!rect.width)return;
      seekFromRatio((e.clientX-rect.left)/rect.width);
    };
    row.append(label,lane);lanes.append(row);
  }

  function paintPeaks(peaks,durationSec,onsetSec){
    if(!Array.isArray(peaks)||!peaks.length||!Number.isFinite(durationSec)||durationSec<=0){
      peakModel=null;
      paint(lastSync);
      return null;
    }
    peakModel=mouthPeakOnsetModel(peaks,durationSec,{onsetSec});
    paint(lastSync);
    return peakModel;
  }

  paint(sync);
  return {paint,paintPeaks,status,getPeakModel:()=>peakModel,setPlayhead,getPlayhead:()=>playhead()};
}

/** Manual-first mouthMap editor: denser Face styles -> morph index, with optional auto-detect. */
export function mouthMapControls({host,getRig,edit,notify,getMorphNames=()=>[]}){
  const box=document.createElement('div');
  box.className='mouth-map-controls';
  const heading=document.createElement('p');
  heading.className='hint';
  heading.textContent='Mouth morph map (skinned GLB). Assign a morph target index (from 0) for each denser Face mouth style. Face seek/scrub and Write Face mouth keys drive those morphs. Letter aliases (A-H/X) stay valid for Apply cues to 3D face. Auto-detect matches common morph names; override by hand.';
  box.append(heading);
  const rows=document.createElement('div');
  rows.className='mouth-map-rows';
  box.append(rows);
  const status=document.createElement('p');status.setAttribute('role','status');box.append(status);

  function morphOptions(){
    const names=typeof getMorphNames==='function'?getMorphNames():[];
    return Array.isArray(names)?names:[];
  }

  function paint(){
    const rig=typeof getRig==='function'?getRig():null;
    const map=rig?.mouthMap||{};
    const names=morphOptions();
    rows.replaceChildren();
    for(const row of MOUTH_MAP_ROWS){
      const label=document.createElement('label');label.className='field';
      label.textContent='Morph · '+row.label;
      const input=document.createElement('input');input.type='number';input.min=0;input.max=255;input.step=1;
      input.setAttribute('aria-label','Morph index for mouth '+row.style);
      const current=map[row.style]??(row.letter!=null?map[row.letter]:undefined);
      input.value=current??'';
      input.onchange=()=>{
        try{
          edit(r=>{
            r.mouthMap??={};
            if(input.value===''){
              delete r.mouthMap[row.style];
              if(row.letter)delete r.mouthMap[row.letter];
            }else{
              const index=Number(input.value);
              if(!Number.isInteger(index)||index<0||index>255)throw Error('Morph index must be a whole number from 0 to 255.');
              r.mouthMap[row.style]=index;
              if(row.letter)r.mouthMap[row.letter]=index;
            }
            if(r.mouthMap&&!Object.keys(r.mouthMap).length)delete r.mouthMap;
            validateMouthMap(r);
          });
          status.textContent=input.value===''?'Cleared '+row.style+'.':'Mapped '+row.style+' → morph '+input.value+'.';
          paint();
        }catch(e){notify(e.message);paint();}
      };
      label.append(input);
      if(names.length){
        const select=document.createElement('select');
        select.setAttribute('aria-label','Pick morph name for mouth '+row.style);
        select.append(new Option('Pick morph name…',''));
        names.forEach((name,i)=>select.append(new Option(i+' · '+(name||('Morph '+i)),String(i))));
        if(current!=null&&names[current]!=null)select.value=String(current);
        select.onchange=()=>{
          if(select.value==='')return;
          input.value=select.value;
          input.dispatchEvent(new Event('change'));
        };
        label.append(select);
      }
      rows.append(label);
    }
    syncClearMouthMapButton();
  }

  function syncClearMouthMapButton(){
    if(!clear)return;
    const clearable=clearableMouthMapCount(typeof getRig==='function'?getRig():null);
    clear.disabled=!clearable;
    clear.title=clearable
      ? ('Clear '+clearable+' mouth morph map entr'+(clearable===1?'y':'ies'))
      : 'No mouth morph map entries to clear';
  }

  const auto=document.createElement('button');
  auto.type='button';
  auto.textContent='Auto-detect morph indices from names';
  auto.onclick=()=>{
    try{
      const names=morphOptions();
      if(!names.length)throw Error('Open the Face/3D panel on a skinned GLB first so morph names are available, or type indices by hand.');
      edit(r=>{
        Object.assign(r,applyDetectedMouthMap(r,names,{replace:false}));
      });
      const rig=typeof getRig==='function'?getRig():null;
      status.textContent='Auto-detected '+Object.keys(rig?.mouthMap||{}).length+' mouth map entries. Override any row by hand.';
      paint();
    }catch(e){notify(e.message);}
  };
  const clear=document.createElement('button');
  clear.type='button';
  clear.textContent='Clear mouth morph map';
  clear.onclick=()=>{
    try{
      const clearable=clearableMouthMapCount(typeof getRig==='function'?getRig():null);
      if(!clearable){status.textContent='No mouth morph map entries to clear.';syncClearMouthMapButton();return;}
      edit(r=>{delete r.mouthMap;});
      status.textContent='Mouth morph map cleared.';
      paint();
    }catch(e){notify(e.message);}
  };
  box.append(auto,clear);
  host.append(box);
  paint();
  return {refresh:paint};
}


export function lipSyncControls(card,shot,{button,change,tell,isCurrent,projectId,getVoiceTakes=()=>[],getMorphNames=()=>[]}){
  const panel=document.createElement('details');
  panel.className='settings';
  panel.dataset.plan='lipsync-'+shot.id;
  const summary=document.createElement('summary');
  summary.textContent='Lip-sync · voice to editable mouth cues';
  panel.append(summary);

  const note=document.createElement('p');
  note.textContent='Use an English voice take up to five minutes. Generate A-H / X mouth shapes. Write Face mouth keys replaces the mouth channel from cues (clears stale mouth keys after Fit or cue edits) and maps each cue to a denser Face style (line/closed/smile/open/wide/round/bite/teeth/pucker) artists can also key by hand. Map denser styles (or A-H/X) to skinned GLB morph indices under Mouth morph map so Face seek/scrub and Write Face mouth keys drive those morphs. Or map cues to drawing layers. Shift, fit, or align to voice length before exporting.';
  panel.append(note);

  if(shot.lipSync?.source&&JSON.stringify(shot.lipSync.source)!==JSON.stringify(shot.audio)){
    const stale=document.createElement('p');
    stale.textContent='Voice attachment changed since these cues were saved. Regenerate timing and apply it to the drawing or rig again.';
    panel.append(stale);
  }

  const editor=document.createElement('textarea');
  editor.rows=5;
  editor.setAttribute('aria-label','Mouth cue JSON');
  editor.value=JSON.stringify(shot.lipSync||{mouthCues:[]},null,2);
  panel.append(editor);

  const cueRow=document.createElement('div');cueRow.className='actions';
  const cueShape=document.createElement('select');cueShape.setAttribute('aria-label','Mouth cue shape');
  for(const shape of MOUTH_SHAPES)cueShape.add(new Option('Mouth '+shape,shape));
  const cueStart=document.createElement('input');cueStart.type='number';cueStart.min=0;cueStart.step=1/24;cueStart.value=0;cueStart.setAttribute('aria-label','Mouth cue start seconds');
  const cueEnd=document.createElement('input');cueEnd.type='number';cueEnd.min=0;cueEnd.step=1/24;cueEnd.value=(3/24).toFixed(3);cueEnd.setAttribute('aria-label','Mouth cue end seconds');
  const cueNote=document.createElement('p');
  cueNote.textContent='Generate fills this list. Click a scrub span to load it, then Update selected mouth cue (or nudge start/end by 1 frame). Drag scrub edges to move boundaries. Add / Remove still work. Save edited mouth cues keeps changes on the shot.';
  cueRow.append(cueShape,cueStart,cueEnd);panel.append(cueRow,cueNote);

  let job;
  const jobKey='studio-mouth-job-'+projectId+'-'+shot.id;
  try{editor.value=sessionStorage.getItem(jobKey+'-draft')||editor.value;}catch{}
  const spinner=document.createElement('span');spinner.className='activity-spinner';spinner.hidden=true;panel.append(spinner);
  const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);

  function readEditor(){
    const sync=JSON.parse(editor.value||'{}');
    validateLipSync(sync);
    return sync;
  }
  function writeEditor(sync,message){
    editor.value=JSON.stringify(sync,null,2);
    if(message)status.textContent=message;
    scrub.paint(sync);
  }

  const offsetInput=document.createElement('input');offsetInput.type='number';offsetInput.step=1/24;offsetInput.value=0;offsetInput.setAttribute('aria-label','Mouth cue offset seconds');
  const durationInput=document.createElement('input');durationInput.type='number';durationInput.min=0.001;durationInput.step=0.001;durationInput.setAttribute('aria-label','Voice duration seconds');
  const onsetInput=document.createElement('input');onsetInput.type='number';onsetInput.min=0;onsetInput.step=1/24;onsetInput.value=0;onsetInput.setAttribute('aria-label','Speech onset seconds');
  const known=resolveVoiceAudioSeconds(shot,getVoiceTakes());
  durationInput.value=known!=null?Number(known).toFixed(3):(lipSyncEndSeconds(shot.lipSync)||shot.seconds||1);
  const waveStatus=document.createElement('p');waveStatus.className='hint';waveStatus.setAttribute('role','status');
  waveStatus.textContent=shot.audio?'Reading voice waveform peaks for live onset...':'Attach a voice take to load live peaks / onset on the scrub strip.';

  const lastFrame=()=>Math.max(0,Math.round(shot.seconds||1)*24-1);
  let selectedCueStart=null;
  const scrub=mouthScrubStrip(panel,shot.lipSync||{mouthCues:[]},{
    lastFrame,
    onPick:span=>{
      selectedCueStart=Number(span.startSec);
      cueShape.value=span.value;
      cueStart.value=span.startSec;
      cueEnd.value=span.endSec;
      status.textContent='Loaded Mouth '+span.value+' at '+span.startSec.toFixed(3)+'s-'+span.endSec.toFixed(3)+'s (frame '+span.start+').';
    },
    onOnset:sec=>{
      onsetInput.value=sec;
      status.textContent='Onset set from waveform to '+Number(sec).toFixed(3)+'s. Align first speech to apply it.';
    },
    onSeek:frame=>{
      const f=queueFaceSeek(shot.id,Number(frame)||0);
      card.dispatchEvent(new CustomEvent('director-seek',{bubbles:true,detail:{shotId:shot.id,frame:f,source:'lipsync'}}));
    },
    onResize:(atStart,edge,sec)=>{
      const result=setMouthCueEdge(readEditor(),atStart,edge,sec);
      selectedCueStart=result.atStart;
      // Update the JSON editor only — scrub paints; avoid writeEditor.paint which rebuilds handles mid-drag.
      editor.value=JSON.stringify(result.sync,null,2);
      status.textContent='Boundary dragged in the editor. Save edited mouth cues to keep the change.';
      const loaded=result.sync.mouthCues.find(c=>Math.abs(c.start-result.atStart)<=1e-4);
      if(loaded){
        cueShape.value=loaded.value;
        cueStart.value=loaded.start;
        cueEnd.value=loaded.end;
      }
      return result;
    },
  });
  card.addEventListener('director-frame',event=>{
    if(event.detail?.shotId!==shot.id)return;
    if(event.detail?.source==='lipsync')return;
    scrub.setPlayhead(event.detail.frame);
  });

  const align=document.createElement('div');align.className='settings lipsync-align';
  const alignTitle=document.createElement('p');alignTitle.className='hint';
  alignTitle.textContent='Timing alignment - shift cues, fit to voice duration, or align first speech to an onset. Live peaks fill onset when voice is attached; scrub the strip for Face playhead; Shift+click peaks or drag the green onset mark (or type) to override onset.';
  const alignRow=document.createElement('div');alignRow.className='actions';
  alignRow.append(offsetInput,durationInput,onsetInput);
  align.append(alignTitle,alignRow,waveStatus);
  panel.append(align);

  async function loadLivePeaks(){
    if(!shot.audio){
      scrub.paintPeaks(null);
      waveStatus.textContent='Attach a voice take to load live peaks / onset on the scrub strip.';
      return;
    }
    if(!panel.isConnected)return;
    waveStatus.textContent='Reading voice waveform peaks for live onset...';
    try{
      const result=await fetchWaveformPeaks(shot.audio);
      if(!panel.isConnected)return;
      const dur=Number(result.duration)>0?Number(result.duration):Number(durationInput.value)||1;
      if(Number(result.duration)>0)durationInput.value=Number(result.duration).toFixed(3);
      const onset=speechOnsetFromPeaks(result.peaks,dur);
      onsetInput.value=onset;
      const model=scrub.paintPeaks(result.peaks,dur,onset);
      waveStatus.textContent=onset>0
        ? 'Live peaks loaded. Suggested onset '+onset.toFixed(3)+'s (click peak strip or edit before Align).'
        : 'Live peaks loaded. No clear speech onset detected (near-silent or flat) - type onset by ear.';
      if(model)status.textContent=waveStatus.textContent;
    }catch(e){
      if(!panel.isConnected)return;
      scrub.paintPeaks(null);
      waveStatus.textContent='Waveform unavailable - type onset by ear. '+(e.message||e);
    }
  }
  loadLivePeaks();

  async function api(path,body){
    const r=await fetch('/studio/assistant'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify(body)});
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Lip-sync failed.');
    return data;
  }

  const generate=button('Generate mouth timing',async()=>{
    if(!shot.audio){status.textContent='Attach a voice take to this shot first.';return;}
    generate.disabled=true;
    try{
      const accepted=await api('',{kind:'lipsync',audio:shot.audio,text:shot.dialogue||''});
      job=accepted.id;sessionStorage.setItem(jobKey,job);cancel.hidden=false;poll();
    }catch(e){generate.disabled=false;status.textContent=e.message;}
  });
  async function poll(){
    if(!panel.isConnected)return;
    spinner.hidden=false;
    try{
      const data=await api('/'+job);
      status.textContent=data.message;
      if(['running','cancelling'].includes(data.state)){setTimeout(poll,1500);return;}
      generate.disabled=false;cancel.hidden=true;spinner.hidden=true;sessionStorage.removeItem(jobKey);
      if(data.state==='done'){
        editor.value=data.result.text;
        sessionStorage.setItem(jobKey+'-draft',editor.value);
        try{scrub.paint(JSON.parse(editor.value));}catch{}
        status.textContent='Timing ready. Review, align to voice length if needed, then save the cues before mapping them.';
      }
    }catch(e){status.textContent=e.message;generate.disabled=false;cancel.hidden=true;spinner.hidden=true;sessionStorage.removeItem(jobKey);}
  }
  const cancel=button('Cancel mouth timing',()=>api('/'+job+'/cancel',{}).catch(e=>status.textContent=e.message));
  cancel.hidden=true;

  const save=button('Save edited mouth cues',()=>{
    try{
      if(!isCurrent())throw Error('Return to the original shot.');
      const sync=readEditor();
      if(shot.audio)sync.source=structuredClone(shot.audio);
      change(()=>shot.lipSync=sync);
      sessionStorage.removeItem(jobKey+'-draft');
      scrub.paint(sync);
      status.textContent='Mouth cues saved on the shot.';
    }catch(e){tell(e.message);}
  });
  const addCue=button('Add mouth cue',()=>{
    try{
      const next=insertMouthCue(readEditor(),{value:cueShape.value,start:Number(cueStart.value),end:Number(cueEnd.value)});
      selectedCueStart=Number(cueStart.value);
      writeEditor(next,'Cue added in the editor. Save edited mouth cues to keep it on the shot.');
    }catch(e){tell(e.message);}
  });
  const dropCue=button('Remove mouth cue at that start',()=>{
    try{
      const next=removeMouthCue(readEditor(),Number(cueStart.value));
      selectedCueStart=null;
      writeEditor(next,'Cue removed in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  });
  const updateCue=button('Update selected mouth cue',()=>{
    try{
      const at=selectedCueStart!=null?selectedCueStart:Number(cueStart.value);
      const next=replaceMouthCue(readEditor(),at,{
        value:cueShape.value,
        start:Number(cueStart.value),
        end:Number(cueEnd.value),
      });
      selectedCueStart=Number(cueStart.value);
      writeEditor(next,'Cue updated in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  });
  const frameStep=1/24;
  function nudgeSelected(edge,dir){
    try{
      const at=selectedCueStart!=null?selectedCueStart:Number(cueStart.value);
      const before=readEditor();
      const idx=before.mouthCues.findIndex(c=>Math.abs(c.start-Number(at))<=1e-4);
      if(idx<0)throw Error('No mouth cue starts at that time.');
      const next=nudgeMouthCueEdge(before,at,edge,dir*frameStep);
      const loaded=next.mouthCues[idx];
      if(loaded){
        selectedCueStart=loaded.start;
        cueShape.value=loaded.value;
        cueStart.value=loaded.start;
        cueEnd.value=loaded.end;
      }
      writeEditor(next,'Cue '+edge+' nudged '+(dir<0?'-':'')+'1 frame in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  }
  const nudgeStartBack=button('Start -1f',()=>nudgeSelected('start',-1));
  const nudgeStartFwd=button('Start +1f',()=>nudgeSelected('start',1));
  const nudgeEndBack=button('End -1f',()=>nudgeSelected('end',-1));
  const nudgeEndFwd=button('End +1f',()=>nudgeSelected('end',1));

  const shiftBtn=button('Shift cues by offset',()=>{
    try{
      const next=shiftMouthCues(readEditor(),Number(offsetInput.value));
      writeEditor(next,'Cues shifted by '+Number(offsetInput.value)+'s in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  });
  const fitBtn=button('Fit cues to voice duration',()=>{
    try{
      const next=fitMouthCuesToDuration(readEditor(),Number(durationInput.value));
      writeEditor(next,'Cues fitted to '+Number(durationInput.value)+'s in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  });
  const onsetBtn=button('Align first speech to onset',()=>{
    try{
      const next=alignMouthCuesToOnset(readEditor(),Number(onsetInput.value));
      writeEditor(next,'First speech aligned to '+Number(onsetInput.value)+'s in the editor. Save edited mouth cues to keep the change.');
    }catch(e){tell(e.message);}
  });
  const refreshPeaksBtn=button('Refresh live peaks / onset',()=>loadLivePeaks());
  const fitShotBtn=button('Match shot length to voice',()=>{
    try{
      if(!isCurrent())throw Error('Return to the original shot.');
      const sec=Number(durationInput.value);
      if(!Number.isFinite(sec)||sec<=0)throw Error('Set a positive voice duration first.');
      change(()=>{
        fitShotToAudio(shot,sec);
        if(shot.lipSync?.mouthCues?.length){
          shot.lipSync=fitMouthCuesToDuration(shot.lipSync,sec);
          editor.value=JSON.stringify(shot.lipSync,null,2);
          scrub.paint(shot.lipSync);
        }
      });
      status.textContent='Shot length matched to '+sec+'s'+(shot.lipSync?.mouthCues?.length?' and cues fitted':'')+'.';
    }catch(e){tell(e.message);}
  });
  const faceKeysBtn=button('Write Face mouth keys from cues',()=>{
    try{
      if(!isCurrent())throw Error('Return to the original shot.');
      if(!shot.rig3d)throw Error('Create or import a 3D rig with Face features first.');
      const sync=shot.lipSync?.mouthCues?.length?shot.lipSync:readEditor();
      validateLipSync(sync);
      const summary={};
      change(()=>{
        Object.assign(shot.rig3d,featureKeysFromMouthCues(shot.rig3d,sync,{lastFrame:lastFrame(),summary}));
        if(!shot.lipSync?.mouthCues?.length){
          if(shot.audio)sync.source=structuredClone(shot.audio);
          shot.lipSync=sync;
        }
      });
      const clearedBit=summary.cleared>0?', '+summary.cleared+' stale mouth key'+(summary.cleared===1?'':'s')+' cleared':'';
      status.textContent='Face mouth keys replaced from cues ('+summary.written+' written'+clearedBit+'; mouth channel rewrite). Scrub the 3D Face preview — mapped mouthMap morphs follow denser styles. Pick Mouth shape manually or edit Mouth morph map.';
    }catch(e){tell(e.message);}
  });

  panel.append(generate,cancel,addCue,updateCue,dropCue,nudgeStartBack,nudgeStartFwd,nudgeEndBack,nudgeEndFwd,save,shiftBtn,fitBtn,onsetBtn,refreshPeaksBtn,fitShotBtn,faceKeysBtn);

  mouthMapControls({
    host:panel,
    getRig:()=>shot.rig3d,
    edit:fn=>change(()=>{
      if(!shot.rig3d)throw Error('Create or import a 3D rig first.');
      fn(shot.rig3d);
    }),
    notify:tell,
    getMorphNames:typeof getMorphNames==='function'?getMorphNames:()=>[],
  });

  const applyDrawingBtn=button('Apply cues to drawing mouth layers',()=>{
    const gate=applyLipSyncDrawingGate(shot);
    if(!gate.ok){tell(gate.reason);return;}
    change(()=>{
      const again=applyLipSyncDrawingGate(shot);
      if(!again.ok)throw Error(again.reason);
      shot.drawing.lipSync=structuredClone(shot.lipSync);
    });
  });
  const applyFaceBtn=button('Apply cues to 3D face',()=>{
    const gate=applyLipSyncFaceGate(shot);
    if(!gate.ok){tell(gate.reason);return;}
    change(()=>{
      const again=applyLipSyncFaceGate(shot);
      if(!again.ok)throw Error(again.reason);
      shot.rig3d.lipSync=structuredClone(shot.lipSync);
    });
  });
  function syncApplyLipSyncButtons(){
    const drawingGate=applyLipSyncDrawingGate(shot);
    applyDrawingBtn.disabled=!drawingGate.ok;
    applyDrawingBtn.title=drawingGate.reason||'';
    const faceGate=applyLipSyncFaceGate(shot);
    applyFaceBtn.disabled=!faceGate.ok;
    applyFaceBtn.title=faceGate.reason||'';
  }
  panel.append(applyDrawingBtn,applyFaceBtn);
  syncApplyLipSyncButtons();
  panel.addEventListener('toggle',()=>{if(panel.open)syncApplyLipSyncButtons();});

  card.append(panel);
  try{
    job=sessionStorage.getItem(jobKey);
    if(job){generate.disabled=true;cancel.hidden=false;poll();}
  }catch{}
}
