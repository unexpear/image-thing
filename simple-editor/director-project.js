import {validateDucking} from './director-audio-edit.js';
import {validateAudioMeter} from './director-audio-meter.js';
import {validateLipSync} from './director-lipsync.js';
import {validateEpisodeAudio} from './director-episode-audio.js';
import {validatePlanning} from './director-planning-state.js';
import {validateMediaTrim, validateShotHold, validateShotPlaybackSpeed, validateShotTransition, validateTransitionPair, transitionOverlapSeconds} from './director-timing.js';
import {validateProduction} from './director-production.js';
import {validateDrawing} from './director-drawing.js';
import {validateRig3D,validateShotReferenceVideo,validateShotSilhouette} from './director-3d-state.js';
import {validateShotPerformanceScrubLanes} from './director-performance-state.js';
import {validateSkeletonDraft} from './director-skeleton-state.js';
import {validateRigAsset} from './director-rig-library.js';
import {validateSetKitAsset} from './director-set-kit.js';
import {validateAssistantDrafts} from './director-assistant-drafts.js';
import {validateVoiceTakes} from './director-voice-takes.js';
import {validateTitleProject} from './director-title-styles.js';
export const MAX_SECONDS=14400;
export const duration=p=>{
  const shots=p.scenes.flatMap(s=>s.shots);
  return shots.reduce((n,x)=>n+x.seconds,0)-transitionOverlapSeconds(shots);
};
export function validateProject(p){
 if(!p||p.version!==1||typeof p.title!=='string'||!Array.isArray(p.scenes)||!p.scenes.length||!Array.isArray(p.assets))throw Error('Choose a Cartoon Director project JSON with at least one scene.');
 const ids=new Set();let count=0;
 const checkId=item=>{if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))throw Error('Project items need nonempty, unique IDs.');ids.add(item.id);};
 const text=(item,keys)=>{for(const key of keys)if(item[key]!==undefined&&typeof item[key]!=='string')throw Error('Project text fields must contain text.');};
 checkId(p);text(p,['style','synopsis']);
 for(const asset of p.assets){checkId(asset);if(!['character','set','prop','voice','music'].includes(asset.kind)||typeof asset.name!=='string')throw Error('Invalid asset record.');text(asset,['brief']);validateRigAsset(asset);validateSetKitAsset(asset);}
 for(const scene of p.scenes){checkId(scene);if(typeof scene.title!=='string'||!Array.isArray(scene.shots))throw Error('Invalid scene.');for(const shot of scene.shots){checkId(shot);validateProduction(shot,p.assets);validateDrawing(shot.drawing);validateRig3D(shot.rig3d);validateSkeletonDraft(shot.skeletonDraft);text(shot,['title','action','camera','dialogue']);if(!Number.isInteger(shot.seconds)||shot.seconds<1||shot.seconds>3600)throw Error('Shot durations must be from 1 to 3600 seconds.');if(shot.media)validateMediaTrim(shot.media);validateShotHold(shot);validateShotPlaybackSpeed(shot);validateShotTransition(shot);validateShotReferenceVideo(shot);validateShotSilhouette(shot);validateShotPerformanceScrubLanes(shot);count++;}}
 const flatShots=p.scenes.flatMap(sc=>sc.shots);for(let i=0;i<flatShots.length;i++)validateTransitionPair(flatShots[i],flatShots[i+1]||null);
 if(count>14400||duration(p)>MAX_SECONDS)throw Error('An episode cannot exceed 4 hours (14,400 seconds).');
 validatePlanning(p);validateEpisodeAudio(p.episodeAudio);validateDucking(p.ducking);validateAudioMeter(p.audioMeter);for(const scene of p.scenes)for(const shot of scene.shots)validateLipSync(shot.lipSync);
 validateAssistantDrafts(p);
 validateVoiceTakes(p);
 validateTitleProject(p);
 return p;
}
export const newProject=()=>({version:1,id:crypto.randomUUID(),title:'Untitled cartoon',style:'',synopsis:'',assets:[],scenes:[{id:crypto.randomUUID(),title:'Scene 1',shots:[]}]});
export const time=s=>`${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s%3600/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function shotBrief(project,scene,shot){return [project.title,project.style,project.story?.premise,project.story?.worldRules,scene.title,scene.plan?.purpose,scene.plan?.goal,scene.plan?.turn,shot.title,shot.action,shot.camera,shot.dialogue?'Dialogue: '+shot.dialogue:'',...project.assets.filter(a=>['character','set','prop'].includes(a.kind)&&(shot.assetIds===undefined||shot.assetIds.includes(a.id))).map(a=>`${a.kind}: ${a.name}. ${a.brief||''}`)].filter(Boolean).join('\n');}

/** Scene + shot index for a shot id, or null. */
export function findShotLocation(project, shotId) {
  if (!project || !Array.isArray(project.scenes) || typeof shotId !== 'string' || !shotId) return null;
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex++) {
    const scene = project.scenes[sceneIndex];
    const shots = Array.isArray(scene?.shots) ? scene.shots : [];
    const shotIndex = shots.findIndex((s) => s && s.id === shotId);
    if (shotIndex >= 0) return { scene, sceneIndex, shot: shots[shotIndex], shotIndex };
  }
  return null;
}

/** Other scenes a shot can move into (same-scene reorder: Earlier / Later / Reorder in scene). */
export function otherScenesForShot(project, shotId) {
  const loc = findShotLocation(project, shotId);
  if (!loc) return [];
  return project.scenes
    .filter((scene) => scene && scene.id && scene.id !== loc.scene.id)
    .map((scene) => ({
      id: scene.id,
      title: typeof scene.title === 'string' && scene.title.trim() ? scene.title : 'Untitled scene',
      shotCount: Array.isArray(scene.shots) ? scene.shots.length : 0,
    }));
}
/**
 * Resolve Place UI value to destIndex for moveShotToScene / copyShotToScene.
 * 'end' / '' / null / undefined → undefined (append).
 * 'start' → 0.
 * 'after:<i>' → i+1 (insert after dest shot at index i).
 * 'index:<n>' → n (clamp still happens in move/copy).
 */
export function destIndexFromPlace(place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Place must be text.');
  if (place.startsWith('after:')) {
    const i = Number(place.slice(6));
    if (!Number.isInteger(i) || i < 0) throw Error('After-shot place needs a whole shot index.');
    return i + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown Place value.');
}

/**
 * Dest-scene shots for Place "After shot N" picker.
 * Each entry: { shotIndex, id, title, placeValue, destIndex }.
 */
export function placeAfterOptions(project, destSceneId) {
  if (!project || !Array.isArray(project.scenes) || typeof destSceneId !== 'string' || !destSceneId) return [];
  const scene = project.scenes.find((s) => s && s.id === destSceneId);
  if (!scene || !Array.isArray(scene.shots)) return [];
  return scene.shots.map((shot, shotIndex) => {
    const title = typeof shot?.title === 'string' && shot.title.trim() ? shot.title.trim() : 'Untitled shot';
    return {
      shotIndex,
      id: typeof shot?.id === 'string' ? shot.id : '',
      title,
      placeValue: 'after:' + shotIndex,
      destIndex: shotIndex + 1,
    };
  });
}

/**
 * Position picker for same-scene reorder (excludes the moving shot).
 * Values: start | end | after:<shotId> (id-based so indices stay stable while moving).
 */
export function reorderInSceneOptions(project, shotId) {
  const loc = findShotLocation(project, shotId);
  if (!loc || !Array.isArray(loc.scene.shots) || loc.scene.shots.length < 2) return [];
  const opts = [
    { value: 'start', label: 'Start of scene', destIndex: 0 },
    { value: 'end', label: 'End of scene', destIndex: undefined },
  ];
  for (const shot of loc.scene.shots) {
    if (!shot || shot.id === shotId) continue;
    const title = typeof shot.title === 'string' && shot.title.trim() ? shot.title.trim() : 'Untitled shot';
    const others = loc.scene.shots.filter((s) => s && s.id !== shotId);
    const j = others.findIndex((s) => s.id === shot.id);
    if (j < 0) continue;
    opts.push({
      value: 'after:' + shot.id,
      label: 'After ' + title,
      id: shot.id,
      destIndex: j + 1,
    });
  }
  return opts;
}

/**
 * Resolve Reorder-in-scene UI value to destIndex into the scene *without* the moving shot
 * (same convention as moveShotToScene destIndex).
 * 'end' / '' / null / undefined → undefined (append).
 * 'start' → 0.
 * 'after:<shotId>' → index after that shot among remaining shots.
 * 'index:<n>' → n.
 */
export function destIndexFromReorderPlace(project, shotId, place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Reorder position must be text.');
  if (place.startsWith('after:')) {
    const afterId = place.slice(6);
    if (!afterId) throw Error('After-shot reorder needs a shot id.');
    const loc = findShotLocation(project, shotId);
    if (!loc) throw Error('That shot is no longer in the episode.');
    const others = loc.scene.shots.filter((s) => s && s.id !== shotId);
    const j = others.findIndex((s) => s && s.id === afterId);
    if (j < 0) throw Error('That After shot is not in this scene (or is the shot being moved).');
    return j + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown reorder position.');
}

/**
 * Reorder a shot inside its current scene.
 * destIndex omitted / null = append. Integer clamped to [0, shots.length-1 after remove]
 * i.e. index into the array *without* the moving shot (same as cross-scene move).
 * No-op (same final index) throws so Undo is not polluted.
 * Same shot id (Follow-shot / drafts / voice-take targets stay linked).
 */
export function moveShotInScene(project, shotId, destIndex) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.scenes)) {
    throw Error('Choose a project before reordering a shot.');
  }
  if (typeof shotId !== 'string' || !shotId) throw Error('Choose a shot to reorder.');
  const loc = findShotLocation(project, shotId);
  if (!loc) throw Error('That shot is no longer in the episode.');
  const scene = loc.scene;
  if (!Array.isArray(scene.shots)) throw Error('Invalid scene.');
  if (scene.shots.length < 2) throw Error('Need at least two shots in this scene to reorder.');
  const from = loc.shotIndex;
  const [shot] = scene.shots.splice(from, 1);
  let insertAt = scene.shots.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > scene.shots.length) insertAt = scene.shots.length;
  if (insertAt === from) {
    scene.shots.splice(from, 0, shot);
    throw Error('That shot is already in this position. Pick Start, End, or After a different shot.');
  }
  scene.shots.splice(insertAt, 0, shot);
  return { shot, scene, fromIndex: from, index: insertAt };
}


/**
 * Move a shot to another scene. Same shot id (episode audio Follow shot, drafts, voice-take targets stay).
 * destIndex omitted / null = append. Integer clamped to [0, dest.shots.length].
 * Same-scene moves throw (use Earlier / Later). Empty source scenes are allowed.
 */
export function moveShotToScene(project, shotId, destSceneId, destIndex) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.scenes)) {
    throw Error('Choose a project before moving a shot.');
  }
  if (typeof shotId !== 'string' || !shotId) throw Error('Choose a shot to move.');
  if (typeof destSceneId !== 'string' || !destSceneId) throw Error('Choose a destination scene.');
  const loc = findShotLocation(project, shotId);
  if (!loc) throw Error('That shot is no longer in the episode.');
  const destSceneIndex = project.scenes.findIndex((s) => s && s.id === destSceneId);
  if (destSceneIndex < 0) throw Error('That scene is no longer in the episode.');
  const destScene = project.scenes[destSceneIndex];
  if (!Array.isArray(destScene.shots)) throw Error('Invalid destination scene.');
  if (destScene === loc.scene || destScene.id === loc.scene.id) {
    throw Error('That shot is already in this scene. Use Earlier / Later to reorder.');
  }
  let insertAt = destScene.shots.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > destScene.shots.length) insertAt = destScene.shots.length;
  const [shot] = loc.scene.shots.splice(loc.shotIndex, 1);
  destScene.shots.splice(insertAt, 0, shot);
  return { shot, fromScene: loc.scene, toScene: destScene, index: insertAt };
}

/** Deep-clone a shot with a fresh id (same contents as in-scene Duplicate). */
export function cloneShotRecord(shot) {
  if (!shot || typeof shot !== 'object' || Array.isArray(shot)) throw Error('Choose a shot to copy.');
  const copy = structuredClone(shot);
  copy.id = crypto.randomUUID();
  return copy;
}

/**
 * Copy a shot into another scene (new shot id). Original stays put.
 * Follow-shot episode audio / drafts / voice-take targets stay on the original id.
 * destIndex omitted / null = append. Integer clamped to [0, dest.shots.length].
 * Same-scene copies throw (use Duplicate). Empty destination scenes are allowed.
 */
export function copyShotToScene(project, shotId, destSceneId, destIndex) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.scenes)) {
    throw Error('Choose a project before copying a shot.');
  }
  if (typeof shotId !== 'string' || !shotId) throw Error('Choose a shot to copy.');
  if (typeof destSceneId !== 'string' || !destSceneId) throw Error('Choose a destination scene.');
  const loc = findShotLocation(project, shotId);
  if (!loc) throw Error('That shot is no longer in the episode.');
  const destSceneIndex = project.scenes.findIndex((s) => s && s.id === destSceneId);
  if (destSceneIndex < 0) throw Error('That scene is no longer in the episode.');
  const destScene = project.scenes[destSceneIndex];
  if (!Array.isArray(destScene.shots)) throw Error('Invalid destination scene.');
  if (destScene === loc.scene || destScene.id === loc.scene.id) {
    throw Error('That shot is already in this scene. Use Duplicate to copy it here.');
  }
  let insertAt = destScene.shots.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > destScene.shots.length) insertAt = destScene.shots.length;
  const copy = cloneShotRecord(loc.shot);
  destScene.shots.splice(insertAt, 0, copy);
  return { shot: copy, source: loc.shot, fromScene: loc.scene, toScene: destScene, index: insertAt };
}
/** True when this shot is not the first in its scene (split keeps earlier shots in place). */
export function canSplitSceneAtShot(project, shotId) {
  const loc = findShotLocation(project, shotId);
  return !!(loc && loc.shotIndex >= 1);
}

/**
 * Default title for a scene created by Split scene here.
 * Named source -> "Title (cont.)"; blank/untitled -> "Scene N" (1-based index of the new scene).
 * Avoids stacking "(cont.)" when the source already ends that way.
 */
export function defaultSplitSceneTitle(fromScene, newSceneIndex) {
  const titleBase = typeof fromScene?.title === 'string' && fromScene.title.trim()
    ? fromScene.title.trim()
    : '';
  if (titleBase) {
    if (/\(\s*cont\.\s*\)$/i.test(titleBase)) return titleBase;
    return titleBase + ' (cont.)';
  }
  const n = Number.isInteger(newSceneIndex) && newSceneIndex >= 0 ? newSceneIndex + 1 : 1;
  return 'Scene ' + n;
}

/**
 * Split a scene at a shot: that shot and later become a new scene immediately after.
 * Same shot ids (Follow-shot episode audio, drafts, voice-take targets stay).
 * Original scene keeps the shots before the split (so not the first shot).
 * New scene has a fresh id; default title is "Title (cont.)" / "Scene N" (override via options.title).
 * Scene plan stays on the original.
 */
export function splitSceneAtShot(project, shotId, options) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.scenes)) {
    throw Error('Choose a project before splitting a scene.');
  }
  if (typeof shotId !== 'string' || !shotId) throw Error('Choose a shot to split from.');
  const loc = findShotLocation(project, shotId);
  if (!loc) throw Error('That shot is no longer in the episode.');
  if (loc.shotIndex < 1) {
    throw Error('Split starting at a later shot so this scene keeps the shots before the split.');
  }
  const opts = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const moved = loc.scene.shots.splice(loc.shotIndex);
  const newSceneIndex = loc.sceneIndex + 1;
  const title = typeof opts.title === 'string' && opts.title.trim()
    ? opts.title.trim()
    : defaultSplitSceneTitle(loc.scene, newSceneIndex);
  const newScene = {
    id: crypto.randomUUID(),
    title,
    shots: moved,
  };
  project.scenes.splice(newSceneIndex, 0, newScene);
  return { fromScene: loc.scene, toScene: newScene, shot: loc.shot, index: 0 };
}

/** True when this scene has a following scene to join. */
export function canJoinSceneWithNext(project, sceneId) {
  if (!project || !Array.isArray(project.scenes) || typeof sceneId !== 'string' || !sceneId) return false;
  const i = project.scenes.findIndex((s) => s && s.id === sceneId);
  return i >= 0 && i < project.scenes.length - 1;
}

/** True when the episode has more than one scene (safe to remove the current one). */
export function canRemoveScene(project) {
  return !!(project && Array.isArray(project.scenes) && project.scenes.length > 1);
}

function sceneConfirmLabel(scene) {
  if (scene && typeof scene.title === 'string' && scene.title.trim()) return scene.title.trim();
  return 'this scene';
}

function shotConfirmLabel(shot) {
  if (shot && typeof shot.title === 'string' && shot.title.trim()) return shot.title.trim();
  return 'Untitled shot';
}

/** Confirm copy before Remove shot (Undo restores). */
export function removeShotConfirmMessage(shot) {
  return 'Remove shot "' + shotConfirmLabel(shot) + '" from this scene?\n\nUndo restores the shot.';
}

/** Confirm copy before Remove scene (Undo restores). */
export function removeSceneConfirmMessage(scene) {
  const n = Array.isArray(scene?.shots) ? scene.shots.length : 0;
  return 'Remove scene "' + sceneConfirmLabel(scene) + '" and its ' + n + ' shot' + (n === 1 ? '' : 's') + ' from the episode?\n\nUndo restores the scene.';
}

/** Confirm copy before Join with next scene (drops next plan; Undo restores). */

function assetConfirmLabel(asset) {
  if (asset && typeof asset.name === 'string' && asset.name.trim()) return asset.name.trim();
  return 'Untitled asset';
}

/** Count shots that list this asset id in assetIds. */
export function countAssetLinkedShots(project, assetId) {
  if (!project || !Array.isArray(project.scenes) || typeof assetId !== 'string' || !assetId) return 0;
  let n = 0;
  for (const scene of project.scenes) {
    if (!scene || !Array.isArray(scene.shots)) continue;
    for (const shot of scene.shots) {
      if (shot && Array.isArray(shot.assetIds) && shot.assetIds.includes(assetId)) n++;
    }
  }
  return n;
}

/**
 * Confirm copy before Remove asset (set kits / rig setups / linked shots called out; Undo restores).
 * High-blast for set kits: deletes the reusable room layout and unlinks shot.assetIds.
 */
export function removeAssetConfirmMessage(asset, project) {
  const name = assetConfirmLabel(asset);
  const kind = (asset && typeof asset.kind === 'string' && asset.kind) ? asset.kind : 'asset';
  const bits = ['Remove ' + kind + ' "' + name + '" from this project?'];
  const details = [];
  if (asset && asset.setKit) {
    const n = Array.isArray(asset.setKit.props) ? asset.setKit.props.length : 0;
    details.push('Set kit with ' + n + ' stage prop' + (n === 1 ? '' : 's') + ' (Apply from Body will no longer find it)');
  }
  if (asset && asset.rigSetup) {
    details.push('Reusable rig setup (Character continuity Load will no longer find it)');
  }
  const linked = countAssetLinkedShots(project, asset && asset.id);
  if (linked > 0) {
    details.push('Unlinks from ' + linked + ' shot' + (linked === 1 ? '' : 's'));
  }
  if (details.length) bits.push('', details.join('. ') + '.');
  bits.push('', 'Undo restores the asset' + (linked > 0 ? ' and shot links' : '') + '.');
  return bits.join('\n');
}

export function joinSceneConfirmMessage(nextScene) {
  const n = Array.isArray(nextScene?.shots) ? nextScene.shots.length : 0;
  return 'Join ' + n + ' shot' + (n === 1 ? '' : 's') + ' from "' + sceneConfirmLabel(nextScene) + '" onto this scene?\n\nThe next scene record (including its plan) will be removed. Shot ids stay. Undo restores.';
}

/**
 * Join this scene with the next: append the next scene's shots, then remove that scene.
 * Same shot ids. Next scene plan / title is dropped (shots stay in episode order).
 * Empty next scenes are allowed (the empty scene record is removed).
 */
export function joinSceneWithNext(project, sceneId) {
  if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.scenes)) {
    throw Error('Choose a project before joining scenes.');
  }
  if (typeof sceneId !== 'string' || !sceneId) throw Error('Choose a scene to join.');
  const i = project.scenes.findIndex((s) => s && s.id === sceneId);
  if (i < 0) throw Error('That scene is no longer in the episode.');
  if (i >= project.scenes.length - 1) {
    throw Error('This is the last scene. Move it earlier, or split a scene first.');
  }
  const currentScene = project.scenes[i];
  const nextScene = project.scenes[i + 1];
  if (!Array.isArray(currentScene.shots) || !Array.isArray(nextScene.shots)) throw Error('Invalid scene.');
  const insertAt = currentScene.shots.length;
  const absorbedCount = nextScene.shots.length;
  currentScene.shots.push(...nextScene.shots);
  project.scenes.splice(i + 1, 1);
  return { scene: currentScene, absorbed: nextScene, index: insertAt, absorbedCount };
}

/** Normalize find-shot query: trim + lower-case. Empty => ''. */
export function normalizeShotFindQuery(query) {
  return typeof query === 'string' ? query.trim().toLowerCase() : '';
}

/** Shot string fields searched by find-shot (plus id). Matches validateProject text keys. */
export const SHOT_FIND_TEXT_FIELDS = ['title', 'action', 'camera', 'dialogue'];

/**
 * Which find-shot fields contain the query (case-insensitive substring).
 * Order: id, then SHOT_FIND_TEXT_FIELDS. Empty query => [].
 */
export function shotFindMatchFields(shot, query) {
  const q = normalizeShotFindQuery(query);
  if (!q || !shot) return [];
  const hits = [];
  if (typeof shot.id === 'string' && shot.id.toLowerCase().includes(q)) hits.push('id');
  for (const key of SHOT_FIND_TEXT_FIELDS) {
    const v = shot[key];
    if (typeof v === 'string' && v.toLowerCase().includes(q)) hits.push(key);
  }
  return hits;
}

/** True when any searchable shot field contains the query. Empty query never matches. */
export function shotMatchesFindQuery(shot, query) {
  return shotFindMatchFields(shot, query).length > 0;
}

/**
 * Episode-wide find-shot: title / id / action / camera / dialogue substring match.
 * Returns [{ scene, sceneIndex, shot, shotIndex, fields }, ...] in episode order. Empty query => [].
 */
export function findShotsByQuery(project, query) {
  const q = normalizeShotFindQuery(query);
  if (!q || !project || !Array.isArray(project.scenes)) return [];
  const out = [];
  for (let sceneIndex = 0; sceneIndex < project.scenes.length; sceneIndex++) {
    const scene = project.scenes[sceneIndex];
    const shots = Array.isArray(scene?.shots) ? scene.shots : [];
    for (let shotIndex = 0; shotIndex < shots.length; shotIndex++) {
      const shot = shots[shotIndex];
      const fields = shotFindMatchFields(shot, q);
      if (fields.length) out.push({ scene, sceneIndex, shot, shotIndex, fields });
    }
  }
  return out;
}
