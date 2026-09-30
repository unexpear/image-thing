import {validateBeatMarkers} from './director-beat-markers.js';
import {validateManuscript} from './director-manuscript.js';
export const STORY_FIELDS=['premise','audience','theme','worldRules','ending'];
export const SCENE_FIELDS=['purpose','goal','obstacle','turn','outcome','script'];
export const ARC_FIELDS=['want','need','flaw','change'];
export const ASSET_STATES=['Not started','In progress','Approved'];
export const TOOL_STAGES=['plan','camera','body','face','draw','review'];
export const boardFrames=shot=>(shot.panels||[]).reduce((n,p)=>n+p.frames,0);
export const usesBoards=shot=>shot.visualSource==='boards';
export const shotFrames=shot=>shot.seconds*24;
export function panelAt(shot,seconds){
 let end=0;const panels=shot.panels||[];
 const found=panels.find(p=>{end+=p.frames;return seconds*24<end;});
 if(found)return found;
 if(panels.length&&seconds*24<=end+1e-4)return panels.at(-1);
 return null;
}
export function plannedAssets(project,shot){
 return project.assets.filter(a=>['character','set','prop'].includes(a.kind)&&(shot.assetIds===undefined||shot.assetIds.includes(a.id)));
}
export function pictureNote(shot){
 return usesBoards(shot)?' The animatic and assembly still play the storyboard for this shot’s duration. Choose Finished shot to use the attached clip.':' The animatic and assembly play this attachment for the planned duration.';
}
export function setShotSeconds(shot,seconds){
 if(!Number.isInteger(seconds)||seconds<1||seconds>3600)throw Error('Shot durations must be from 1 to 3600 seconds.');
 if((shot.panels?.length||0)>seconds*24)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');
 shot.seconds=seconds;
 if(shot.panels?.length&&boardFrames(shot)!==seconds*24)fitPanels(shot);
}
export function setPanelFrames(shot,index,frames){
 const panels=shot.panels||[],panel=panels[index];
 if(!panel)throw Error('Choose a storyboard panel.');
 if(!Number.isInteger(frames)||frames<1||frames>86400)throw Error('Panel duration must be 1–86,400 frames.');
 const total=shotFrames(shot);
 if(panels.length===1){if(frames!==total)throw Error('This panel has to cover the whole shot ('+total+' frames), or add another panel.');panel.frames=frames;return;}
 const neighbor=panels[index+1]||panels[index-1];
 const fixed=panels.reduce((n,item)=>n+(item===panel||item===neighbor?0:item.frames),0);
 const rest=total-frames-fixed;
 if(rest<1)throw Error('Leave at least one frame for the other panels. The shot is '+total+' frames.');
 panel.frames=frames;neighbor.frames=rest;
}
export function addPanel(shot,extra={}){
 const total=shotFrames(shot);shot.panels??=[];
 if(shot.panels.length+1>total)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');
 const panel={id:crypto.randomUUID(),frames:1,action:'',...extra};
 if(!shot.panels.length){panel.frames=total;panel.action=panel.action||shot.action||'';shot.panels.push(panel);return panel;}
 const used=boardFrames(shot);
 if(used<total){panel.frames=total-used;shot.panels.push(panel);return panel;}
 const donor=shot.panels.reduce((best,item)=>item.frames>best.frames?item:best);
 if(donor.frames<2)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');
 donor.frames-=1;shot.panels.push(panel);return panel;
}
export function removePanel(shot,index){
 const panels=shot.panels||[];if(!panels[index])throw Error('Choose a storyboard panel.');
 const matched=boardFrames(shot)===shotFrames(shot),[removed]=panels.splice(index,1);
 if(matched&&panels.length)panels[Math.min(index,panels.length-1)].frames+=removed.frames;
}
export function duplicatePanel(shot,index){
 const panels=shot.panels||[],source=panels[index];if(!source)throw Error('Choose a storyboard panel.');
 const total=shotFrames(shot);if(panels.length+1>total)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');
 const copy={...structuredClone(source),id:crypto.randomUUID()};
 if(boardFrames(shot)>=total){if(source.frames<2)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');const give=Math.max(1,Math.floor(source.frames/2));source.frames-=give;copy.frames=give;}
 else copy.frames=total-boardFrames(shot);
 panels.splice(index+1,0,copy);
 if(boardFrames(shot)!==total)fitPanels(shot);
}
export function planningBasis(project,scene,shot){
 const assets=project.assets.filter(a=>shot.assetIds===undefined||shot.assetIds.includes(a.id));
 const beats=(project.story?.beats||[]).filter(b=>(scene.plan?.beatIds||[]).includes(b.id));
 return JSON.stringify({style:project.style,synopsis:project.synopsis,story:STORY_FIELDS.map(k=>project.story?.[k]||''),beats,scene:scene.plan||{},shot:[shot.action,shot.camera,shot.dialogue,shot.seconds,shot.visualSource,shot.panels,shot.audioTracks,shot.audio,shot.audioRole],assets:assets.map(a=>[a.id,a.name,a.kind,a.brief,a.file,a.arc])});
}
export function planningIssues(project){
 const issues=[],beats=project.story?.beats||[];
 for(const beat of beats){
  if(!project.scenes.some(s=>s.plan?.beatIds?.includes(beat.id)))issues.push({message:`Beat “${beat.title}” is not linked to a scene.`});
  if(beat.setupId&&beats.findIndex(b=>b.id===beat.setupId)>=beats.indexOf(beat))issues.push({message:`Payoff “${beat.title}” comes before its setup.`});
 }
 for(const scene of project.scenes)for(const shot of scene.shots){
  const add=message=>issues.push({shotId:shot.id,message});
  if(shot.planApproval&&shot.planApproval!==planningBasis(project,scene,shot))add('Plan changed since approval. Review the script, timing and linked assets.');
  const required=project.assets.filter(a=>shot.assetIds===undefined||shot.assetIds.includes(a.id));
  for(const a of required)if(a.readiness!=='Approved')add(`Waiting for asset: ${a.name} (${a.readiness||'Not started'}).`);
  if(usesBoards(shot)){
   if(!shot.panels?.length)add('Add storyboard panels or switch back to the finished shot.');
   else{
    if(boardFrames(shot)!==shot.seconds*24)add(`Boards cover ${boardFrames(shot)} frames; shot needs ${shot.seconds*24}. Adjust panel timing or fit it to the shot.`);
    if(shot.panels.some(p=>!p.media))add('Attach a drawing to every storyboard panel.');
   }
  }
 }
 return issues;
}

export function sceneHasPlan(scene){
 const plan=scene?.plan;
 if(!plan||typeof plan!=='object'||Array.isArray(plan))return false;
 if(SCENE_FIELDS.some(k=>typeof plan[k]==='string'&&plan[k].trim()))return true;
 return Array.isArray(plan.beatIds)&&plan.beatIds.length>0;
}
export function listScenePlanSources(project,targetSceneId){
 return (project?.scenes||[]).filter(s=>s&&s.id!==targetSceneId&&sceneHasPlan(s));
}
export const SCENE_PLAN_COPY_MODES=['all','fields','beats'];
export function copyScenePlan(targetScene,sourceScene,mode='all'){
 if(!targetScene||typeof targetScene!=='object'||Array.isArray(targetScene))throw Error('Target scene required.');
 if(!sourceScene||typeof sourceScene!=='object'||Array.isArray(sourceScene))throw Error('Source scene required.');
 if(targetScene.id&&sourceScene.id&&targetScene.id===sourceScene.id)throw Error('Choose a different scene as the plan source.');
 if(!sceneHasPlan(sourceScene))throw Error('Source scene has no plan to copy.');
 const m=mode||'all';
 if(!SCENE_PLAN_COPY_MODES.includes(m))throw Error('Copy mode must be all, fields, or beats.');
 const src=sourceScene.plan;
 targetScene.plan??={};
 const summary={mode:m,fields:0,beats:0};
 if(m==='all'||m==='fields'){
  for(const k of SCENE_FIELDS){
   if(typeof src[k]==='string'){targetScene.plan[k]=src[k];if(src[k].trim())summary.fields++;}
   else delete targetScene.plan[k];
  }
 }
 if(m==='all'||m==='beats'){
  if(Array.isArray(src.beatIds)){targetScene.plan.beatIds=src.beatIds.slice();summary.beats=targetScene.plan.beatIds.length;}
  else delete targetScene.plan.beatIds;
 }
 return summary;
}
export function removeBeat(project,id){
 project.story.beats=project.story.beats.filter(b=>b.id!==id);
 for(const b of project.story.beats)if(b.setupId===id)delete b.setupId;
 for(const s of project.scenes)if(s.plan?.beatIds)s.plan.beatIds=s.plan.beatIds.filter(x=>x!==id);
}

function beatConfirmLabel(beat){
 if(beat&&typeof beat.title==='string'&&beat.title.trim())return beat.title.trim();
 return 'Untitled beat';
}
/** Confirm copy before Remove beat (clears scene/setup links; Undo restores). */
export function removeBeatConfirmMessage(beat){
 return 'Remove story beat "'+beatConfirmLabel(beat)+'"?\n\nScene links and payoff setup links to this beat are cleared. Undo restores.';
}

/** Count story beats (for Clear all beats disabled sync). */
export function storyBeatCount(project){
 const beats=project?.story?.beats;
 return Array.isArray(beats)?beats.length:0;
}

/**
 * Wipe every story beat. Clears scene plan beatIds (setup links go with the beats).
 * Undo via change() snapshot restores.
 */
export function clearAllBeats(project){
 if(!project||typeof project!=='object')throw Error('Project required.');
 project.story??={};
 const n=Array.isArray(project.story.beats)?project.story.beats.length:0;
 project.story.beats=[];
 for(const s of (project.scenes||[])){
  if(s?.plan?.beatIds){
   if(s.plan.beatIds.length)s.plan.beatIds=[];
   else delete s.plan.beatIds;
  }
 }
 return n;
}

/** Confirm copy before Clear all beats (high-blast Story Room wipe; Undo restores). */
export function clearAllBeatsConfirmMessage(project){
 const n=storyBeatCount(project);
 const label=n===1?'1 story beat':(n+' story beats');
 let sceneLinks=0;
 for(const s of (project?.scenes||[])){
  if(Array.isArray(s?.plan?.beatIds))sceneLinks+=s.plan.beatIds.length;
 }
 const linkNote=sceneLinks
  ?(' Clears '+sceneLinks+' scene beat link'+(sceneLinks===1?'':'s')+' and payoff setup links.')
  :' Scene links and payoff setup links to these beats are cleared.';
 return 'Clear all '+label+' from the Story Room?\n\n'+linkNote.trim()+' Undo restores.';
}

function panelConfirmLabel(panel,index){
 const n=(Number.isInteger(index)&&index>=0?index:0)+1;
 return 'Panel '+n;
}
/** Confirm copy before Remove panel (may redistribute frames; Undo restores). */
export function removePanelConfirmMessage(panel,index){
 const label=panelConfirmLabel(panel,index);
 const frames=Number(panel?.frames);
 const frameNote=Number.isFinite(frames)&&frames>0?(' ('+frames+' frame'+(frames===1?'':'s')+')'):'';
 const mediaNote=panel?.media?' (has drawing)':'';
 return 'Remove storyboard '+label+mediaNote+frameNote+'?\n\nIf remaining panels matched the shot length, frames redistribute to a neighbor. Undo restores.';
}

function audioTrackConfirmLabel(track,index){
 if(track&&typeof track.label==='string'&&track.label.trim())return track.label.trim();
 const n=(Number.isInteger(index)&&index>=0?index:0)+1;
 return 'Sound track '+n;
}
/** Confirm copy before Remove sound track (Undo restores). */
export function removeAudioTrackConfirmMessage(track,index){
 const label=audioTrackConfirmLabel(track,index);
 const kind=(track&&typeof track.kind==='string'&&track.kind)?track.kind:'effects';
 const mediaNote=track?.media?', has audio':'';
 return 'Remove "'+label+'" ('+kind+mediaNote+')?\n\nUndo restores the track.';
}
/**
 * Position picker for story-beat reorder (excludes the moving beat).
 * Values: start | end | after:<beatId> (id-based so indices stay stable while moving).
 */
export function reorderBeatOptions(project, beatId) {
  const beats = project?.story?.beats;
  if (!Array.isArray(beats) || beats.length < 2) return [];
  if (typeof beatId !== 'string' || !beatId) return [];
  if (!beats.some((b) => b && b.id === beatId)) return [];
  const opts = [
    { value: 'start', label: 'Start of list', destIndex: 0 },
    { value: 'end', label: 'End of list', destIndex: undefined },
  ];
  for (const beat of beats) {
    if (!beat || beat.id === beatId) continue;
    const title = typeof beat.title === 'string' && beat.title.trim() ? beat.title.trim() : 'Untitled beat';
    const others = beats.filter((b) => b && b.id !== beatId);
    const j = others.findIndex((b) => b.id === beat.id);
    if (j < 0) continue;
    opts.push({
      value: 'after:' + beat.id,
      label: 'After ' + title,
      id: beat.id,
      destIndex: j + 1,
    });
  }
  return opts;
}
/**
 * Resolve beat Place UI value to destIndex into the list *without* the moving beat
 * (same convention as moveShotInScene destIndex).
 * 'end' / '' / null / undefined → undefined (append).
 * 'start' → 0.
 * 'after:<beatId>' → index after that beat among remaining beats.
 * 'index:<n>' → n.
 */
export function destIndexFromBeatPlace(project, beatId, place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Beat place must be text.');
  if (place.startsWith('after:')) {
    const afterId = place.slice(6);
    if (!afterId) throw Error('After-beat place needs a beat id.');
    const beats = project?.story?.beats;
    if (!Array.isArray(beats)) throw Error('That beat is no longer in the story.');
    const others = beats.filter((b) => b && b.id !== beatId);
    const j = others.findIndex((b) => b && b.id === afterId);
    if (j < 0) throw Error('That After beat is not in the list (or is the beat being moved).');
    return j + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown beat place.');
}
/**
 * Reorder a story beat in project.story.beats.
 * destIndex omitted / null = append. Integer clamped to [0, beats.length-1 after remove]
 * i.e. index into the array *without* the moving beat (same as shot reorder).
 * No-op (same final index) throws so Undo is not polluted.
 * Beat id stays (scene plan beatIds / setup links stay linked).
 */
export function moveBeat(project, beatId, destIndex) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw Error('Choose a project before reordering a beat.');
  }
  if (typeof beatId !== 'string' || !beatId) throw Error('Choose a beat to reorder.');
  if (!project.story || typeof project.story !== 'object' || Array.isArray(project.story)) {
    throw Error('That beat is no longer in the story.');
  }
  if (!Array.isArray(project.story.beats)) throw Error('Invalid story beats.');
  const beats = project.story.beats;
  if (beats.length < 2) throw Error('Need at least two story beats to reorder.');
  const from = beats.findIndex((b) => b && b.id === beatId);
  if (from < 0) throw Error('That beat is no longer in the story.');
  const [beat] = beats.splice(from, 1);
  let insertAt = beats.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > beats.length) insertAt = beats.length;
  if (insertAt === from) {
    beats.splice(from, 0, beat);
    throw Error('That beat is already in this position. Pick Start, End, or After a different beat.');
  }
  beats.splice(insertAt, 0, beat);
  return { beat, fromIndex: from, index: insertAt };
}

/**
 * Position picker for storyboard-panel reorder (excludes the moving panel).
 * Values: start | end | after:<panelId> (id-based so indices stay stable while moving).
 */
export function reorderPanelOptions(shot, panelId) {
  const panels = shot?.panels;
  if (!Array.isArray(panels) || panels.length < 2) return [];
  if (typeof panelId !== 'string' || !panelId) return [];
  if (!panels.some((p) => p && p.id === panelId)) return [];
  const opts = [
    { value: 'start', label: 'Start of boards', destIndex: 0 },
    { value: 'end', label: 'End of boards', destIndex: undefined },
  ];
  for (const panel of panels) {
    if (!panel || panel.id === panelId) continue;
    const action = typeof panel.action === 'string' && panel.action.trim() ? panel.action.trim() : '';
    const others = panels.filter((p) => p && p.id !== panelId);
    const j = others.findIndex((p) => p.id === panel.id);
    if (j < 0) continue;
    const n = panels.indexOf(panel) + 1;
    const label = action ? ('After panel ' + n + ' - ' + (action.length > 36 ? action.slice(0, 33) + '...' : action)) : ('After panel ' + n);
    opts.push({
      value: 'after:' + panel.id,
      label,
      id: panel.id,
      destIndex: j + 1,
    });
  }
  return opts;
}
/**
 * Resolve panel Place UI value to destIndex into the list *without* the moving panel
 * (same convention as moveBeat / moveShotInScene destIndex).
 * 'end' / '' / null / undefined → undefined (append).
 * 'start' → 0.
 * 'after:<panelId>' → index after that panel among remaining panels.
 * 'index:<n>' → n.
 */
export function destIndexFromPanelPlace(shot, panelId, place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Panel place must be text.');
  if (place.startsWith('after:')) {
    const afterId = place.slice(6);
    if (!afterId) throw Error('After-panel place needs a panel id.');
    const panels = shot?.panels;
    if (!Array.isArray(panels)) throw Error('That panel is no longer on this shot.');
    const others = panels.filter((p) => p && p.id !== panelId);
    const j = others.findIndex((p) => p && p.id === afterId);
    if (j < 0) throw Error('That After panel is not on this shot (or is the panel being moved).');
    return j + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown panel place.');
}
/**
 * Reorder a storyboard panel in shot.panels.
 * destIndex omitted / null = append. Integer clamped to [0, panels.length-1 after remove]
 * i.e. index into the array *without* the moving panel (same as beat/shot reorder).
 * No-op (same final index) throws so Undo is not polluted.
 * Panel id stays (frames / media / action stay on the same panel record).
 * Does not change frame totals — only order.
 */
export function movePanel(shot, panelId, destIndex) {
  if (!shot || typeof shot !== 'object' || Array.isArray(shot)) {
    throw Error('Choose a shot before reordering a panel.');
  }
  if (typeof panelId !== 'string' || !panelId) throw Error('Choose a panel to reorder.');
  if (!Array.isArray(shot.panels)) throw Error('That panel is no longer on this shot.');
  const panels = shot.panels;
  if (panels.length < 2) throw Error('Need at least two storyboard panels to reorder.');
  const from = panels.findIndex((p) => p && p.id === panelId);
  if (from < 0) throw Error('That panel is no longer on this shot.');
  const [panel] = panels.splice(from, 1);
  let insertAt = panels.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > panels.length) insertAt = panels.length;
  if (insertAt === from) {
    panels.splice(from, 0, panel);
    throw Error('That panel is already in this position. Pick Start, End, or After a different panel.');
  }
  panels.splice(insertAt, 0, panel);
  return { panel, fromIndex: from, index: insertAt };
}

/**
 * Ensure each sound track on the shot has a stable id (legacy tracks may lack one).
 * Mutates in place; returns the tracks array (or []).
 */
export function ensureAudioTrackIds(shot) {
  const tracks = shot?.audioTracks;
  if (!Array.isArray(tracks)) return [];
  const seen = new Set();
  for (const t of tracks) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    if (typeof t.id !== 'string' || !t.id || seen.has(t.id)) {
      t.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('track-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    }
    seen.add(t.id);
  }
  return tracks;
}
/**
 * Position picker for sound-track reorder (excludes the moving track).
 * Values: start | end | after:<trackId> (id-based so indices stay stable while moving).
 * Ensures track ids exist (legacy projects).
 */
export function reorderAudioTrackOptions(shot, trackId) {
  const tracks = ensureAudioTrackIds(shot);
  if (!Array.isArray(tracks) || tracks.length < 2) return [];
  if (typeof trackId !== 'string' || !trackId) return [];
  if (!tracks.some((t) => t && t.id === trackId)) return [];
  const opts = [
    { value: 'start', label: 'Start of list', destIndex: 0 },
    { value: 'end', label: 'End of list', destIndex: undefined },
  ];
  for (const track of tracks) {
    if (!track || track.id === trackId) continue;
    const others = tracks.filter((t) => t && t.id !== trackId);
    const j = others.findIndex((t) => t.id === track.id);
    if (j < 0) continue;
    const n = tracks.indexOf(track) + 1;
    const kind = track.kind === 'dialogue' ? 'Dialogue' : track.kind === 'music' ? 'Music' : track.kind === 'effects' ? 'Effects' : 'Track';
    const labelText = typeof track.label === 'string' && track.label.trim() ? track.label.trim() : '';
    const label = labelText
      ? ('After ' + kind + ' ' + n + ' · ' + (labelText.length > 28 ? labelText.slice(0, 25) + '…' : labelText))
      : ('After ' + kind + ' ' + n);
    opts.push({
      value: 'after:' + track.id,
      label,
      id: track.id,
      destIndex: j + 1,
    });
  }
  return opts;
}
/**
 * Resolve sound-track Place UI value to destIndex into the list *without* the moving track
 * (same convention as movePanel / moveBeat destIndex).
 * 'end' / '' / null / undefined -> undefined (append).
 * 'start' -> 0.
 * 'after:<trackId>' -> index after that track among remaining tracks.
 * 'index:<n>' -> n.
 */
export function destIndexFromAudioTrackPlace(shot, trackId, place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Sound-track place must be text.');
  if (place.startsWith('after:')) {
    const afterId = place.slice(6);
    if (!afterId) throw Error('After-track place needs a track id.');
    const tracks = ensureAudioTrackIds(shot);
    if (!Array.isArray(tracks)) throw Error('That sound track is no longer on this shot.');
    const others = tracks.filter((t) => t && t.id !== trackId);
    const j = others.findIndex((t) => t && t.id === afterId);
    if (j < 0) throw Error('That After track is not on this shot (or is the track being moved).');
    return j + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown sound-track place.');
}
/**
 * Reorder a sound track in shot.audioTracks.
 * destIndex omitted / null = append. Integer clamped to [0, tracks.length-1 after remove]
 * i.e. index into the array *without* the moving track (same as panel/beat reorder).
 * No-op (same final index) throws so Undo is not polluted.
 * Track id stays (kind / label / media / start / volume stay on the same record).
 * Order-only; does not change cue timing fields.
 */
export function moveAudioTrack(shot, trackId, destIndex) {
  if (!shot || typeof shot !== 'object' || Array.isArray(shot)) {
    throw Error('Choose a shot before reordering a sound track.');
  }
  if (typeof trackId !== 'string' || !trackId) throw Error('Choose a sound track to reorder.');
  const tracks = ensureAudioTrackIds(shot);
  if (!Array.isArray(shot.audioTracks)) throw Error('That sound track is no longer on this shot.');
  if (tracks.length < 2) throw Error('Need at least two sound tracks to reorder.');
  const from = tracks.findIndex((t) => t && t.id === trackId);
  if (from < 0) throw Error('That sound track is no longer on this shot.');
  const [track] = tracks.splice(from, 1);
  let insertAt = tracks.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > tracks.length) insertAt = tracks.length;
  if (insertAt === from) {
    tracks.splice(from, 0, track);
    throw Error('That sound track is already in this position. Pick Start, End, or After a different track.');
  }
  tracks.splice(insertAt, 0, track);
  return { track, fromIndex: from, index: insertAt };
}

export function fitPanels(shot){
 const panels=shot.panels||[],total=shot.seconds*24;
 if(!panels.length||panels.length>total)throw Error('Each panel needs at least one frame. Increase shot duration or remove panels.');
 const sum=boardFrames(shot),remaining=total-panels.length;
 let used=0;
 panels.forEach((p,i)=>{const target=Math.round(remaining*panels.slice(0,i+1).reduce((n,x)=>n+x.frames,0)/sum);p._fit=1+target-used;used=target;});
 for(const p of panels){p.frames=p._fit;delete p._fit;}
}
export function assemblyShots(project){
 return project.scenes.flatMap(scene=>scene.shots.flatMap(shot=>{
  if(!usesBoards(shot))return [shot];
  if(!shot.panels?.length||boardFrames(shot)!==shot.seconds*24||shot.panels.some(p=>!p.media))throw Error(`Finish storyboard attachments and timing for “${shot.title}” before export.`);
  let frame=0;
  return shot.panels.map((panel,panelIndex,panels)=>{const part={...shot,media:panel.media,seconds:panel.frames/24,frames:panel.frames,audioOffset:frame/24};frame+=panel.frames;if(panelIndex!==panels.length-1)delete part.transition;else if(part.transition&&part.transition.type&&part.transition.type!=='cut'&&part.transition.durationSec>=part.seconds)throw Error('Transition is longer than the last storyboard panel of "'+shot.title+'". Shorten the transition or refit panels.');return part;});
 }));
}
export function validatePlanning(project){
 const text=(o,keys)=>{for(const k of keys)if(o[k]!==undefined&&typeof o[k]!=='string')throw Error('Planning fields must contain text.');};
 const record=o=>{if(!o||typeof o!=='object'||Array.isArray(o))throw Error('Invalid planning record.');};
 const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error('Invalid planning list or too many items.');};
 const ids=new Set();
 const id=o=>{record(o);if(typeof o.id!=='string'||!o.id||ids.has(o.id))throw Error('Planning items need unique IDs.');ids.add(o.id);};
 const media=m=>{record(m);if(typeof(m.name||m.filename)!=='string'||!['input','output'].includes(m.type||'input'))throw Error('Choose a local media file.');};
 let beats=[];
 if(project.story!==undefined){record(project.story);text(project.story,STORY_FIELDS);validateManuscript(project.story);beats=project.story.beats||[];list(beats,500);for(const b of beats){id(b);text(b,['title','act','summary','setupId']);}for(const b of beats)if(b.setupId&&(!beats.some(x=>x.id===b.setupId)||b.setupId===b.id))throw Error('Choose another existing beat as the setup.');}
 for(const a of project.assets){if(a.arc!==undefined){record(a.arc);text(a.arc,ARC_FIELDS);}if(a.readiness!==undefined&&!ASSET_STATES.includes(a.readiness))throw Error('Invalid asset readiness.');}
 for(const scene of project.scenes){
  if(scene.plan!==undefined){record(scene.plan);text(scene.plan,SCENE_FIELDS);if(scene.plan.beatIds!==undefined){list(scene.plan.beatIds,500);if(new Set(scene.plan.beatIds).size!==scene.plan.beatIds.length||scene.plan.beatIds.some(id=>!beats.some(b=>b.id===id)))throw Error('Scene links must refer to existing story beats.');}}
  for(const shot of scene.shots){
   text(shot,['planApproval']);
   if(shot.visualSource!==undefined&&!['clip','boards'].includes(shot.visualSource))throw Error('Choose finished shot or storyboard panels.');
   if(shot.panels!==undefined){list(shot.panels,300);const panelIds=new Set();for(const p of shot.panels){record(p);if(typeof p.id!=='string'||!p.id||panelIds.has(p.id))throw Error('Panels need unique IDs within their shot.');panelIds.add(p.id);text(p,['action']);if(!Number.isInteger(p.frames)||p.frames<1||p.frames>86400)throw Error('Panel duration must be 1–86,400 frames.');if(p.media){media(p.media);if(!/\.(png|jpe?g|webp)$/i.test(p.media.name||p.media.filename))throw Error('Storyboard panels need PNG, JPEG or WebP drawings.');}}}
   if(shot.audioRole!==undefined&&!['dialogue','music','ambience','effects'].includes(shot.audioRole))throw Error('Main audio role must be dialogue, music, ambience or effects.');
   if(shot.audioTracks!==undefined){list(shot.audioTracks,12);const trackIds=new Set();for(const t of shot.audioTracks){record(t);if(t.id!==undefined){if(typeof t.id!=='string'||!t.id||trackIds.has(t.id))throw Error('Sound tracks need unique IDs within their shot when set.');trackIds.add(t.id);}text(t,['label','notes']);if(!['dialogue','music','effects'].includes(t.kind))throw Error('Choose dialogue, music or effects.');if(!Number.isFinite(t.start)||t.start<0||t.start>3600||!Number.isFinite(t.volume)||t.volume<0||t.volume>1)throw Error('Audio needs a start of 0–3600 seconds and a level of 0–1.');if(t.media)media(t.media);validateBeatMarkers(t.markers);}}
   if(shot.toolStages!==undefined){record(shot.toolStages);const keys=Object.keys(shot.toolStages);if(keys.length>TOOL_STAGES.length||keys.some(key=>!TOOL_STAGES.includes(key)||shot.toolStages[key]!=='finished'))throw Error('Finished stages must be Plan, Camera, Body, Face, Draw or Review.');}
  }
 }
}
export function planningDocument(project){
 const lines=[project.title,'STORY ROOM',...STORY_FIELDS.map(k=>`${k}: ${project.story?.[k]||''}`),'BEATS'];
 for(const b of project.story?.beats||[])lines.push(`${b.act||''} · ${b.title}\n${b.summary||''}${b.setupId?'\nPays off: '+project.story.beats.find(x=>x.id===b.setupId)?.title:''}`);
 for(const a of project.assets)lines.push(`ASSET: ${a.name}\n${a.brief||''}\n${ARC_FIELDS.map(k=>k+': '+(a.arc?.[k]||'')).join('\n')}`);
 for(const s of project.scenes){lines.push(`SCENE: ${s.title}`,SCENE_FIELDS.map(k=>k+': '+(s.plan?.[k]||'')).join('\n'));for(const x of s.shots)lines.push(`SHOT: ${x.title} · ${x.seconds}s\n${x.action||''}\nCamera: ${x.camera||''}\nDialogue: ${x.dialogue||''}`,...(x.panels||[]).map((p,i)=>`Panel ${i+1} · ${p.frames} frames: ${p.action||''}`));}
 return lines.join('\n\n');
}
