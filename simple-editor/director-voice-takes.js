/** Durable voice take library (project-owned; survives reload via localStorage + studio-data snapshot).
 *  Broader than shot.audio (one active attachment) and assistantDrafts (mixed kinds, shared cap).
 *  WAV bytes live under ComfyUI input/studio-voices/; this list keeps metadata + media refs.
 */
export const MAX_VOICE_TAKES = 48;
export const MAX_TAKE_TEXT = 2000;
export const MAX_TAKE_LABEL = 80;
export const MAX_TAKE_NOTE = 500;
export const VOICE_TAKE_STATUSES = Object.freeze(['library', 'promoted', 'rejected']);

function checkText(value, label, max = MAX_TAKE_TEXT) {
  if (typeof value !== 'string') throw Error(label + ' must be text.');
  if (value.length > max) throw Error(label + ' exceeds ' + max + ' characters.');
}

function checkMediaRef(ref, label) {
  if (!ref || typeof ref !== 'object') throw Error(label + ' is invalid.');
  if (typeof (ref.name || ref.filename) !== 'string' || !(ref.name || ref.filename)) throw Error(label + ' needs a file name.');
  if (ref.type !== undefined && typeof ref.type !== 'string') throw Error(label + ' type must be text.');
  if (ref.subfolder !== undefined && typeof ref.subfolder !== 'string') throw Error(label + ' subfolder must be text.');
}

export function validateVoiceTake(take) {
  if (!take || typeof take !== 'object') throw Error('Voice take records must be objects.');
  if (typeof take.id !== 'string' || !take.id) throw Error('Voice takes need nonempty IDs.');
  if (!VOICE_TAKE_STATUSES.includes(take.status)) throw Error('Unknown voice take status.');
  if (typeof take.createdAt !== 'string' || !take.createdAt) throw Error('Voice takes need createdAt.');
  if (take.promotedAt !== undefined && typeof take.promotedAt !== 'string') throw Error('Voice take promotedAt must be text.');
  if (take.rejectedAt !== undefined && typeof take.rejectedAt !== 'string') throw Error('Voice take rejectedAt must be text.');
  if (take.engine !== undefined) checkText(take.engine, 'Voice take engine', 40);
  if (take.voice !== undefined) checkText(take.voice, 'Voice take voice', 80);
  if (take.model !== undefined) checkText(take.model, 'Voice take model', 80);
  if (take.request !== undefined) checkText(take.request, 'Voice take request');
  if (typeof take.resultText !== 'string') throw Error('Voice take resultText must be text.');
  if (take.resultText.length > MAX_TAKE_TEXT) throw Error('Voice take result exceeds ' + MAX_TAKE_TEXT + ' characters.');
  if (take.label !== undefined) checkText(take.label, 'Voice take label', MAX_TAKE_LABEL);
  if (take.note !== undefined) checkText(take.note, 'Voice take note', MAX_TAKE_NOTE);
  if (take.targetShotId !== undefined && typeof take.targetShotId !== 'string') throw Error('Voice take targetShotId must be text.');
  if (take.sceneId !== undefined && typeof take.sceneId !== 'string') throw Error('Voice take sceneId must be text.');
  if (take.jobId !== undefined && typeof take.jobId !== 'string') throw Error('Voice take jobId must be text.');
  if (take.seconds !== undefined) {
    if (typeof take.seconds !== 'number' || !Number.isFinite(take.seconds) || take.seconds < 0 || take.seconds > 3600) {
      throw Error('Voice take seconds must be from 0 to 3600.');
    }
  }
  if (take.speed !== undefined) {
    if (typeof take.speed !== 'number' || !Number.isFinite(take.speed) || take.speed < 0.5 || take.speed > 1.5) {
      throw Error('Voice take speed must be between 0.5 and 1.5.');
    }
  }
  if (take.delivery !== undefined) {
    if (typeof take.delivery !== 'number' || !Number.isFinite(take.delivery) || take.delivery < 0 || take.delivery > 1.5) {
      throw Error('Voice take delivery must be between 0 and 1.5.');
    }
  }
  if (take.pacing !== undefined) {
    if (typeof take.pacing !== 'number' || !Number.isFinite(take.pacing) || take.pacing < 0.1 || take.pacing > 1) {
      throw Error('Voice take pacing must be between 0.1 and 1.');
    }
  }
  checkMediaRef(take.audio, 'Voice take audio');
  return take;
}

export function validateVoiceTakes(project) {
  if (project.voiceTakes === undefined) return project;
  if (!Array.isArray(project.voiceTakes)) throw Error('voiceTakes must be a list.');
  if (project.voiceTakes.length > MAX_VOICE_TAKES) {
    throw Error('Keep at most ' + MAX_VOICE_TAKES + ' voice takes on a project.');
  }
  const ids = new Set();
  for (const take of project.voiceTakes) {
    validateVoiceTake(take);
    if (ids.has(take.id)) throw Error('Voice take IDs must be unique.');
    ids.add(take.id);
  }
  return project;
}

export function ensureVoiceTakes(project) {
  if (!Array.isArray(project.voiceTakes)) project.voiceTakes = [];
  return project.voiceTakes;
}

export function pruneVoiceTakes(project) {
  const list = ensureVoiceTakes(project);
  while (list.length > MAX_VOICE_TAKES) {
    let drop = list.findIndex(t => t.status === 'rejected');
    if (drop === -1) drop = list.findIndex(t => t.status === 'library');
    list.splice(drop === -1 ? list.length - 1 : drop, 1);
  }
  return list;
}

/** Build a durable take record from a completed voice job + owner metadata. */
export function buildVoiceTake({
  id,
  status = 'library',
  createdAt,
  engine,
  voice,
  model,
  request,
  resultText,
  targetShotId,
  sceneId,
  jobId,
  audio,
  seconds,
  speed,
  delivery,
  pacing,
  label,
  note,
}) {
  if (!audio || typeof audio !== 'object') throw Error('Voice takes need an audio media ref.');
  const take = {
    id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'take-' + Date.now()),
    status,
    createdAt: createdAt || new Date().toISOString(),
    resultText: String(resultText || '').slice(0, MAX_TAKE_TEXT),
    audio: {
      name: audio.name || audio.filename,
      subfolder: audio.subfolder || 'studio-voices',
      type: audio.type || 'input',
    },
  };
  if (engine) take.engine = String(engine).slice(0, 40);
  if (voice) take.voice = String(voice).slice(0, 80);
  if (model) take.model = String(model).slice(0, 80);
  if (request) take.request = String(request).slice(0, MAX_TAKE_TEXT);
  if (targetShotId) take.targetShotId = String(targetShotId);
  if (sceneId) take.sceneId = String(sceneId);
  if (jobId) take.jobId = String(jobId);
  if (typeof seconds === 'number' && Number.isFinite(seconds)) take.seconds = seconds;
  if (typeof speed === 'number' && Number.isFinite(speed)) take.speed = speed;
  if (typeof delivery === 'number' && Number.isFinite(delivery)) take.delivery = delivery;
  if (typeof pacing === 'number' && Number.isFinite(pacing)) take.pacing = pacing;
  if (label) take.label = String(label).trim().slice(0, MAX_TAKE_LABEL);
  if (note) take.note = String(note).trim().slice(0, MAX_TAKE_NOTE);
  if (take.label === '') delete take.label;
  if (take.note === '') delete take.note;
  return validateVoiceTake(take);
}

export function recordVoiceTake(project, fields) {
  const take = fields && fields.id && fields.status && fields.audio && typeof fields.resultText === 'string' && fields.createdAt
    ? validateVoiceTake({ ...fields })
    : buildVoiceTake(fields);
  const list = ensureVoiceTakes(project);
  const existing = list.findIndex(t => t.id === take.id || (take.jobId && t.jobId === take.jobId));
  if (existing >= 0) list.splice(existing, 1, take);
  else list.unshift(take);
  pruneVoiceTakes(project);
  return take;
}

export function setVoiceTakeStatus(project, takeId, status) {
  if (!VOICE_TAKE_STATUSES.includes(status)) throw Error('Unknown voice take status.');
  const list = ensureVoiceTakes(project);
  const take = list.find(t => t.id === takeId);
  if (!take) throw Error('That take is no longer on this project.');
  take.status = status;
  if (status === 'promoted') take.promotedAt = new Date().toISOString();
  if (status === 'rejected') take.rejectedAt = new Date().toISOString();
  validateVoiceTake(take);
  return take;
}

/** Promote a library take onto a shot as shot.audio (and mark promoted). */
export function promoteVoiceTake(project, takeId, shotId) {
  const take = findVoiceTake(project, takeId);
  if (!take) throw Error('That take is no longer on this project.');
  const shot = (project.scenes || []).flatMap(s => s.shots || []).find(s => s.id === shotId);
  if (!shot) throw Error('Choose a target shot before promoting a take.');
  shot.audio = {
    name: take.audio.name || take.audio.filename,
    subfolder: take.audio.subfolder || 'studio-voices',
    type: take.audio.type || 'input',
  };
  shot.audioRole = 'dialogue';
  take.targetShotId = shotId;
  setVoiceTakeStatus(project, takeId, 'promoted');
  return take;
}


/** Artist-facing rename. Empty string clears the custom label (auto label returns). */
export function setVoiceTakeLabel(project, takeId, label) {
  const take = findVoiceTake(project, takeId);
  if (!take) throw Error('That take is no longer on this project.');
  const text = label == null ? '' : String(label).trim();
  if (!text) delete take.label;
  else {
    checkText(text, 'Voice take label', MAX_TAKE_LABEL);
    take.label = text.slice(0, MAX_TAKE_LABEL);
  }
  validateVoiceTake(take);
  return take;
}

/** Production note on a take (timing / delivery / which shot). Empty clears. */
export function setVoiceTakeNote(project, takeId, note) {
  const take = findVoiceTake(project, takeId);
  if (!take) throw Error('That take is no longer on this project.');
  const text = note == null ? '' : String(note).trim();
  if (!text) delete take.note;
  else {
    checkText(text, 'Voice take note', MAX_TAKE_NOTE);
    take.note = text.slice(0, MAX_TAKE_NOTE);
  }
  validateVoiceTake(take);
  return take;
}

/** Default artist label for a duplicated take: "<source or short auto> (copy)". */
export function defaultDuplicateVoiceTakeLabel(take) {
  const suffix = ' (copy)';
  let base = '';
  if (take && typeof take.label === 'string' && take.label.trim()) {
    base = take.label.trim();
    if (base.endsWith(suffix)) base = base.slice(0, -suffix.length).trimEnd();
  } else if (take && typeof take.voice === 'string' && take.voice.trim()) {
    base = take.voice.trim();
  } else if (take && typeof (take.engine || take.model) === 'string' && (take.engine || take.model).trim()) {
    base = String(take.engine || take.model).trim();
  } else {
    base = 'Take';
  }
  const maxBase = Math.max(1, MAX_TAKE_LABEL - suffix.length);
  if (base.length > maxBase) base = base.slice(0, maxBase).trimEnd();
  return (base + suffix).slice(0, MAX_TAKE_LABEL);
}

/**
 * Clone a take pointing at the same audio file with a new id + editable meta.
 * Does not copy or re-upload the WAV (shared media ref under studio-voices/).
 * Safer UX: status resets to library (does not inherit promoted/rejected);
 * note / resultText / engine knobs / targetShotId are preserved as context.
 * jobId is omitted so a later re-record cannot upsert over the copy.
 * Inserts newest-first; may prune under MAX_VOICE_TAKES.
 */
export function duplicateVoiceTake(project, takeId, fields = {}) {
  const source = findVoiceTake(project, takeId);
  if (!source) throw Error('That take is no longer on this project.');
  const label = Object.prototype.hasOwnProperty.call(fields, 'label')
    ? (fields.label == null || String(fields.label).trim() === ''
      ? undefined
      : String(fields.label).trim().slice(0, MAX_TAKE_LABEL))
    : defaultDuplicateVoiceTakeLabel(source);
  const note = Object.prototype.hasOwnProperty.call(fields, 'note')
    ? fields.note
    : source.note;
  const take = buildVoiceTake({
    id: fields.id,
    status: 'library',
    createdAt: fields.createdAt || new Date().toISOString(),
    engine: source.engine,
    voice: source.voice,
    model: source.model,
    request: source.request,
    resultText: source.resultText,
    targetShotId: source.targetShotId,
    sceneId: source.sceneId,
    audio: {
      name: source.audio.name || source.audio.filename,
      subfolder: source.audio.subfolder || 'studio-voices',
      type: source.audio.type || 'input',
    },
    seconds: source.seconds,
    speed: source.speed,
    delivery: source.delivery,
    pacing: source.pacing,
    label,
    note,
  });
  return recordVoiceTake(project, take);
}



export const VOICE_TAKE_FILTERS = Object.freeze([
  { id: 'all', label: 'All takes' },
  { id: 'library', label: 'Library only' },
  { id: 'promoted', label: 'Promoted only' },
  { id: 'rejected', label: 'Rejected only' },
  { id: 'decided', label: 'Promoted + rejected' },
]);

const STATUS_RANK = Object.freeze({ library: 0, promoted: 1, rejected: 2 });

export function takeMatchesVoiceTakeFilter(take, filterId) {
  const id = filterId || 'all';
  if (!take || typeof take !== 'object') return false;
  if (id === 'all') return true;
  if (id === 'library' || id === 'promoted' || id === 'rejected') return take.status === id;
  if (id === 'decided') return take.status === 'promoted' || take.status === 'rejected';
  return true;
}

/** Collect audio file names still attached on any shot (main audio + audioTracks). */
export function shotLinkedVoiceNames(project) {
  const names = new Set();
  for (const scene of project?.scenes || []) {
    for (const shot of scene.shots || []) {
      for (const ref of [
        shot.audio,
        ...((shot.audioTracks || []).map((track) => track.media)),
      ]) {
        const name = ref?.name || ref?.filename;
        if (typeof name === 'string' && name) names.add(name);
      }
    }
  }
  return names;
}

/** True when this take's WAV is still attached to a shot on the project. */
export function voiceTakeLinkedToShot(project, take) {
  const name = take?.audio?.name || take?.audio?.filename;
  if (typeof name !== 'string' || !name) return false;
  return shotLinkedVoiceNames(project).has(name);
}

/** Library first, then newest createdAt within each status band. */
export function listVoiceTakes(project, filterId = 'all') {
  const list = Array.isArray(project?.voiceTakes) ? project.voiceTakes.slice() : [];
  const filtered = list.filter((t) => takeMatchesVoiceTakeFilter(t, filterId));
  filtered.sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 9;
    const rb = STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });
  return filtered;
}

export function summarizeVoiceTakes(project) {
  const list = Array.isArray(project?.voiceTakes) ? project.voiceTakes : [];
  const summary = { total: list.length, library: 0, promoted: 0, rejected: 0, decided: 0, linkedRejected: 0, linkedPromoted: 0, linkedDecided: 0 };
  const linked = shotLinkedVoiceNames(project);
  for (const t of list) {
    const name = t.audio?.name || t.audio?.filename;
    const isLinked = typeof name === 'string' && name && linked.has(name);
    if (t.status === 'library') summary.library++;
    else if (t.status === 'promoted') {
      summary.promoted++;
      if (isLinked) summary.linkedPromoted++;
    } else if (t.status === 'rejected') {
      summary.rejected++;
      if (isLinked) summary.linkedRejected++;
    }
  }
  summary.decided = summary.promoted + summary.rejected;
  summary.linkedDecided = summary.linkedPromoted + summary.linkedRejected;
  return summary;
}

/** How many rejected rows Clear rejected would remove (excludes shot-linked WAVs). */
export function clearableRejectedVoiceTakeCount(summary) {
  const s = summary || {};
  return Math.max(0, (s.rejected || 0) - (s.linkedRejected || 0));
}

/** How many promoted+rejected rows Clear decided would remove (excludes shot-linked WAVs). */
export function clearableDecidedVoiceTakeCount(summary) {
  const s = summary || {};
  return Math.max(0, (s.decided || 0) - (s.linkedDecided || 0));
}

/** Drop rejected history rows; keep library + promoted. Linked-shot rejected rows stay (shot.audio still points at the WAV). Returns removed count. */
export function clearRejectedVoiceTakes(project) {
  const list = ensureVoiceTakes(project);
  const linked = shotLinkedVoiceNames(project);
  const before = list.length;
  const kept = list.filter((t) => {
    if (t.status !== 'rejected') return true;
    const name = t.audio?.name || t.audio?.filename;
    return typeof name === 'string' && name && linked.has(name);
  });
  list.splice(0, list.length, ...kept);
  return before - list.length;
}

/** Drop promoted + rejected history; keep library. Linked-shot rows (any status) stay. Returns removed count. */
export function clearDecidedVoiceTakes(project) {
  const list = ensureVoiceTakes(project);
  const linked = shotLinkedVoiceNames(project);
  const before = list.length;
  const kept = list.filter((t) => {
    if (t.status === 'library') return true;
    const name = t.audio?.name || t.audio?.filename;
    return typeof name === 'string' && name && linked.has(name);
  });
  list.splice(0, list.length, ...kept);
  return before - list.length;
}

export function findVoiceTake(project, takeId) {
  return (project.voiceTakes || []).find(t => t.id === takeId) || null;
}

export function voiceTakeLabel(take) {
  const when = (() => {
    try { return new Date(take.createdAt).toLocaleString(); } catch { return take.createdAt; }
  })();
  const sep = ' · ';
  if (take.label) return take.label + sep + take.status + sep + when;
  const engine = take.engine || take.model || '';
  const voiceBit = take.voice ? sep + take.voice : '';
  const engineBit = engine ? engine + voiceBit + sep : '';
  const secs = typeof take.seconds === 'number' ? take.seconds.toFixed(1) + 's' + sep : '';
  return engineBit + secs + take.status + sep + when;
}

/** File names referenced by the take library (for unused-take cleanup keep lists). */
export function voiceTakeMediaNames(project) {
  const names = [];
  for (const take of project.voiceTakes || []) {
    const name = take.audio?.name || take.audio?.filename;
    if (typeof name === 'string' && name) names.push(name);
  }
  return names;
}

/** Collect keep-names from loaded projects for /studio/voices/cleanup (shots + drafts + take library). */
export function collectVoiceKeepNames(projects) {
  const names = new Set();
  for (const p of projects || []) {
    for (const name of voiceTakeMediaNames(p)) names.add(name);
    for (const draft of p.assistantDrafts || []) {
      const name = draft.audio?.name || draft.audio?.filename;
      if (typeof name === 'string' && name) names.add(name);
    }
    for (const t of p.episodeAudio || []) {
      const name = t.media?.name || t.media?.filename;
      if (typeof name === 'string' && name) names.add(name);
    }
    for (const scene of p.scenes || []) {
      for (const shot of scene.shots || []) {
        for (const ref of [
          shot.audio,
          shot.media,
          ...(shot.audioTracks || []).map(track => track.media),
          ...(shot.versions || []).flatMap(v => [v.audio, v.media]),
        ]) {
          const name = ref?.name || ref?.filename;
          if (typeof name === 'string' && name) names.add(name);
        }
      }
    }
  }
  return [...names];
}

/** Disk WAV entries not referenced by keep-names (project-linked takes / shots / drafts). */
export function orphanVoiceFiles(files, keepNames) {
  const keep = new Set(keepNames || []);
  const list = Array.isArray(files) ? files : [];
  return list.filter((file) => file && typeof file.name === 'string' && file.name && !keep.has(file.name));
}

/** Link an orphan disk WAV into the project's voice take library (durable ref; file stays on disk). */
export function linkOrphanVoiceFile(project, file, fields = {}) {
  if (!file || typeof file.name !== 'string' || !file.name) throw Error('Choose an orphan voice file to link.');
  const name = file.name;
  if (name.includes('/') || name.includes('\\') || name !== orphanVoiceBasename(name)) {
    throw Error('Orphan voice file name is invalid.');
  }
  if (!name.toLowerCase().endsWith('.wav')) throw Error('Only studio-voices WAV takes can be linked.');
  const existing = (project.voiceTakes || []).find((t) => (t.audio?.name || t.audio?.filename) === name);
  if (existing) return existing;
  return recordVoiceTake(project, {
    engine: fields.engine || 'disk',
    voice: fields.voice,
    model: fields.model || 'orphan-link',
    request: fields.request || '',
    resultText: fields.resultText != null ? fields.resultText : name,
    targetShotId: fields.targetShotId,
    sceneId: fields.sceneId,
    audio: {
      name,
      subfolder: file.subfolder || 'studio-voices',
      type: file.type || 'input',
    },
    seconds: typeof fields.seconds === 'number' ? fields.seconds : undefined,
    status: 'library',
  });
}


/** Map orphan file names -> other loaded episodes that still reference them (excludes current project). */
export function crossEpisodeVoiceKeepRefs(fileNames, currentProject, loadedProjects) {
  const names = Array.isArray(fileNames) ? fileNames.filter((n) => typeof n === 'string' && n) : [];
  const out = new Map();
  if (!names.length) return out;
  const currentId = currentProject && typeof currentProject.id === 'string' ? currentProject.id : null;
  const others = (loadedProjects || []).filter((p) => {
    if (!p || typeof p !== 'object') return false;
    if (currentProject && p === currentProject) return false;
    if (currentId && typeof p.id === 'string' && p.id === currentId) return false;
    return true;
  });
  for (const p of others) {
    const keep = new Set(collectVoiceKeepNames([p]));
    const title = (typeof p.title === 'string' && p.title.trim())
      ? p.title.trim()
      : (typeof p.id === 'string' && p.id ? p.id : 'Untitled episode');
    const ref = { id: typeof p.id === 'string' ? p.id : '', title };
    for (const name of names) {
      if (!keep.has(name)) continue;
      if (!out.has(name)) out.set(name, []);
      const list = out.get(name);
      if (!list.some((r) => (ref.id && r.id === ref.id) || r.title === ref.title)) list.push(ref);
    }
  }
  return out;
}

/** Short row note when an orphan is still kept by another loaded episode. */
export function formatCrossEpisodeKeepNote(refs) {
  const list = Array.isArray(refs) ? refs.filter((r) => r && typeof r.title === 'string' && r.title) : [];
  if (!list.length) return '';
  if (list.length === 1) {
    return 'Also used by loaded episode "' + list[0].title + '" — Discard blocked until you unlink there.';
  }
  const shown = list.slice(0, 3).map((r) => r.title);
  const extra = list.length > 3 ? (', +' + (list.length - 3) + ' more') : '';
  return 'Also used by ' + list.length + ' loaded episodes ("' + shown.join('", "') + '"' + extra + ') — Discard blocked until you unlink there.';
}

/** Build the confirm dialog for discarding one or more orphan voice files. */
export function orphanDiscardConfirm(names) {
  const list = Array.isArray(names) ? names.filter((n) => typeof n === 'string' && n) : [];
  if (!list.length) return '';
  if (list.length === 1) {
    return 'Discard orphan voice file "' + list[0] + '" from studio-voices on disk?\n\nThis cannot be undone. Linked project takes are unchanged. Disk project snapshots that still reference this file stay protected.';
  }
  const shown = list.slice(0, 20);
  const extra = list.length > 20 ? ('\n… and ' + (list.length - 20) + ' more') : '';
  return 'Discard ' + list.length + ' orphan voice files from studio-voices on disk?\n\n' + shown.map((n) => '• ' + n).join('\n') + extra + '\n\nThis cannot be undone. Linked project takes are unchanged. Disk project snapshots that still reference these files stay protected.';
}

/** Human summary of a /studio/voices/discard JSON result (per-file fail-safe counts). */
export function summarizeOrphanDiscard(result, requestedNames = []) {
  const r = result && typeof result === 'object' ? result : {};
  const deleted = Number(r.deleted) || 0;
  const protectedCount = Number(r.protected) || 0;
  const missing = Number(r.missing) || 0;
  const failed = Number(r.failed) || 0;
  const freed = Number(r.freed) || 0;
  const parts = [];
  if (deleted) {
    parts.push('Discarded ' + deleted + ' orphan' + (deleted === 1 ? '' : 's') + (freed ? (' · freed ' + (freed / 1024).toFixed(0) + ' KB') : ''));
  }
  if (protectedCount) {
    parts.push('Kept ' + protectedCount + ' (disk project snapshot still references ' + (protectedCount === 1 ? 'it' : 'them') + ')');
  }
  if (missing) parts.push(missing + ' already gone');
  if (failed) parts.push(failed + ' failed');
  if (!parts.length) return 'Nothing discarded.';
  return parts.join('. ') + '.';
}

function orphanVoiceBasename(name) {
  const parts = String(name).split(/[/\\]/);
  return parts[parts.length - 1] || '';
}
