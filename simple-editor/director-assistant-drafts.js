/** Durable assistant draft inbox helpers (project-owned; survives reload via localStorage + studio-data snapshot). */
export const MAX_ASSISTANT_DRAFTS = 24;
export const MAX_DRAFT_TEXT = 6000;
export const ASSISTANT_DRAFT_STATUSES = Object.freeze(['pending', 'accepted', 'rejected']);
export const ASSISTANT_DRAFT_KINDS = Object.freeze(['shot', 'write', 'voice', 'transcribe']);

function checkText(value, label, max = MAX_DRAFT_TEXT) {
  if (typeof value !== 'string') throw Error(label + ' must be text.');
  if (value.length > max) throw Error(label + ' exceeds ' + max + ' characters.');
}

function checkMediaRef(ref, label) {
  if (!ref || typeof ref !== 'object') throw Error(label + ' is invalid.');
  if (typeof (ref.name || ref.filename) !== 'string' || !(ref.name || ref.filename)) throw Error(label + ' needs a file name.');
  if (ref.type !== undefined && typeof ref.type !== 'string') throw Error(label + ' type must be text.');
  if (ref.subfolder !== undefined && typeof ref.subfolder !== 'string') throw Error(label + ' subfolder must be text.');
}

function checkShotProposal(shot) {
  if (!shot || typeof shot !== 'object') throw Error('Draft shot proposal is invalid.');
  for (const key of ['character', 'setting', 'action']) {
    if (shot[key] !== undefined) checkText(shot[key], 'Draft shot ' + key, 2000);
  }
  if (shot.duration_seconds !== undefined) {
    if (!Number.isInteger(shot.duration_seconds) || shot.duration_seconds < 1 || shot.duration_seconds > 3600) {
      throw Error('Draft shot duration must be from 1 to 3600 seconds.');
    }
  }
}

export function validateAssistantDraft(draft) {
  if (!draft || typeof draft !== 'object') throw Error('Assistant draft records must be objects.');
  if (typeof draft.id !== 'string' || !draft.id) throw Error('Assistant drafts need nonempty IDs.');
  if (!ASSISTANT_DRAFT_KINDS.includes(draft.kind)) throw Error('Unknown assistant draft kind.');
  if (!ASSISTANT_DRAFT_STATUSES.includes(draft.status)) throw Error('Unknown assistant draft status.');
  if (typeof draft.createdAt !== 'string' || !draft.createdAt) throw Error('Assistant drafts need createdAt.');
  if (draft.decidedAt !== undefined && typeof draft.decidedAt !== 'string') throw Error('Assistant draft decidedAt must be text.');
  if (draft.model !== undefined) checkText(draft.model, 'Assistant draft model', 80);
  if (draft.skill !== undefined) checkText(draft.skill, 'Assistant draft guide', 80);
  if (draft.stage !== undefined) checkText(draft.stage, 'Assistant draft stage', 40);
  if (draft.request !== undefined) checkText(draft.request, 'Assistant draft request');
  if (typeof draft.resultText !== 'string') throw Error('Assistant draft resultText must be text.');
  if (draft.resultText.length > MAX_DRAFT_TEXT) throw Error('Assistant draft result exceeds ' + MAX_DRAFT_TEXT + ' characters.');
  if (draft.targetShotId !== undefined && typeof draft.targetShotId !== 'string') throw Error('Assistant draft targetShotId must be text.');
  if (draft.sceneId !== undefined && typeof draft.sceneId !== 'string') throw Error('Assistant draft sceneId must be text.');
  if (draft.jobId !== undefined && typeof draft.jobId !== 'string') throw Error('Assistant draft jobId must be text.');
  if (draft.truncated !== undefined && typeof draft.truncated !== 'boolean') throw Error('Assistant draft truncated must be boolean.');
  if (draft.shot !== undefined) checkShotProposal(draft.shot);
  if (draft.audio !== undefined) checkMediaRef(draft.audio, 'Assistant draft audio');
  return draft;
}

export function validateAssistantDrafts(project) {
  if (project.assistantDrafts === undefined) return project;
  if (!Array.isArray(project.assistantDrafts)) throw Error('assistantDrafts must be a list.');
  if (project.assistantDrafts.length > MAX_ASSISTANT_DRAFTS) {
    throw Error('Keep at most ' + MAX_ASSISTANT_DRAFTS + ' assistant drafts on a project.');
  }
  const ids = new Set();
  for (const draft of project.assistantDrafts) {
    validateAssistantDraft(draft);
    if (ids.has(draft.id)) throw Error('Assistant draft IDs must be unique.');
    ids.add(draft.id);
  }
  return project;
}

export function ensureAssistantDrafts(project) {
  if (!Array.isArray(project.assistantDrafts)) project.assistantDrafts = [];
  return project.assistantDrafts;
}

export function pruneAssistantDrafts(project) {
  const list = ensureAssistantDrafts(project);
  while (list.length > MAX_ASSISTANT_DRAFTS) {
    const drop = list.findIndex(d => d.status !== 'pending');
    list.splice(drop === -1 ? 0 : drop, 1);
  }
  return list;
}

/** Build a durable draft record from a completed assistant job + owner metadata. */
export function buildAssistantDraft({
  id,
  kind,
  status = 'pending',
  createdAt,
  model,
  skill,
  stage,
  request,
  resultText,
  targetShotId,
  sceneId,
  jobId,
  shot,
  audio,
  truncated,
}) {
  const draft = {
    id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'draft-' + Date.now()),
    kind,
    status,
    createdAt: createdAt || new Date().toISOString(),
    resultText: String(resultText || '').slice(0, MAX_DRAFT_TEXT),
  };
  if (model) draft.model = String(model).slice(0, 80);
  if (skill) draft.skill = String(skill).slice(0, 80);
  if (stage) draft.stage = String(stage).slice(0, 40);
  if (request) draft.request = String(request).slice(0, MAX_DRAFT_TEXT);
  if (targetShotId) draft.targetShotId = String(targetShotId);
  if (sceneId) draft.sceneId = String(sceneId);
  if (jobId) draft.jobId = String(jobId);
  if (truncated) draft.truncated = true;
  if (shot && typeof shot === 'object') {
    draft.shot = {
      character: String(shot.character || '').slice(0, 2000),
      setting: String(shot.setting || '').slice(0, 2000),
      action: String(shot.action ?? resultText ?? '').slice(0, 2000),
      duration_seconds: Number.isInteger(shot.duration_seconds) ? shot.duration_seconds : undefined,
    };
    if (draft.shot.duration_seconds === undefined) delete draft.shot.duration_seconds;
  }
  if (audio && typeof audio === 'object') {
    draft.audio = {
      name: audio.name || audio.filename,
      subfolder: audio.subfolder || '',
      type: audio.type || 'input',
    };
  }
  return validateAssistantDraft(draft);
}

export function recordAssistantDraft(project, fields) {
  const draft = fields && fields.id && fields.kind && fields.status && typeof fields.resultText === 'string'
    ? validateAssistantDraft({ ...fields })
    : buildAssistantDraft(fields);
  const list = ensureAssistantDrafts(project);
  const existing = list.findIndex(d => d.id === draft.id || (draft.jobId && d.jobId === draft.jobId));
  if (existing >= 0) list.splice(existing, 1, draft);
  else list.unshift(draft);
  pruneAssistantDrafts(project);
  return draft;
}

export function setAssistantDraftStatus(project, draftId, status) {
  if (!ASSISTANT_DRAFT_STATUSES.includes(status)) throw Error('Unknown assistant draft status.');
  const list = ensureAssistantDrafts(project);
  const draft = list.find(d => d.id === draftId);
  if (!draft) throw Error('That draft is no longer on this project.');
  draft.status = status;
  draft.decidedAt = new Date().toISOString();
  validateAssistantDraft(draft);
  return draft;
}

export function findAssistantDraft(project, draftId) {
  return (project.assistantDrafts || []).find(d => d.id === draftId) || null;
}


export const ASSISTANT_DRAFT_FILTERS = Object.freeze([
  { id: 'all', label: 'All drafts' },
  { id: 'pending', label: 'Pending only' },
  { id: 'accepted', label: 'Accepted only' },
  { id: 'rejected', label: 'Rejected only' },
  { id: 'decided', label: 'Accepted + rejected' },
  { id: 'shot', label: 'Shot plans' },
  { id: 'write', label: 'Writing' },
  { id: 'voice', label: 'Speech' },
  { id: 'transcribe', label: 'Transcripts' },
]);

const STATUS_RANK = Object.freeze({ pending: 0, accepted: 1, rejected: 2 });

export function draftMatchesAssistantDraftFilter(draft, filterId) {
  const id = filterId || 'all';
  if (!draft || typeof draft !== 'object') return false;
  if (id === 'all') return true;
  if (id === 'pending' || id === 'accepted' || id === 'rejected') return draft.status === id;
  if (id === 'decided') return draft.status === 'accepted' || draft.status === 'rejected';
  if (ASSISTANT_DRAFT_KINDS.includes(id)) return draft.kind === id;
  return true;
}

/** Pending first, then newest createdAt within each status band. */
export function listAssistantDrafts(project, filterId = 'all') {
  const list = Array.isArray(project?.assistantDrafts) ? project.assistantDrafts.slice() : [];
  const filtered = list.filter((d) => draftMatchesAssistantDraftFilter(d, filterId));
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

export function summarizeAssistantDrafts(project) {
  const list = Array.isArray(project?.assistantDrafts) ? project.assistantDrafts : [];
  const summary = { total: list.length, pending: 0, accepted: 0, rejected: 0, decided: 0 };
  for (const d of list) {
    if (d.status === 'pending') summary.pending++;
    else if (d.status === 'accepted') summary.accepted++;
    else if (d.status === 'rejected') summary.rejected++;
  }
  summary.decided = summary.accepted + summary.rejected;
  return summary;
}

/** Drop accepted/rejected history; keep pending. Returns removed count. */

/** How many accepted+rejected rows Clear decided would remove (pending always kept). */
export function clearableDecidedAssistantDraftCount(summary) {
  const s = summary || {};
  return Math.max(0, s.decided || 0);
}

export function clearDecidedAssistantDrafts(project) {
  const list = ensureAssistantDrafts(project);
  const before = list.length;
  const kept = list.filter((d) => d.status === 'pending');
  list.splice(0, list.length, ...kept);
  return before - list.length;
}

export function assistantDraftLabel(draft) {
  const when = (() => {
    try { return new Date(draft.createdAt).toLocaleString(); } catch { return draft.createdAt; }
  })();
  const guide = draft.skill ? ' · ' + draft.skill : '';
  const model = draft.model ? ' · ' + draft.model : '';
  return draft.kind + model + guide + ' · ' + draft.status + ' · ' + when;
}

/**
 * Apply-button gates (disabled + title). Match the click guards so empty drafts /
 * missing owner / missing target cannot look clickable. No project JSON change.
 */
export function assistantTextApplyGate({
  text = '',
  ownerProjectId = '',
  currentProjectId = '',
  requireTarget = false,
  targetShotId = '',
  targetShotExists = true,
} = {}) {
  if (!ownerProjectId || !currentProjectId || ownerProjectId !== currentProjectId) {
    return { ok: false, reason: 'Select the original project before applying this draft.' };
  }
  if (!String(text || '').trim()) {
    return { ok: false, reason: 'The draft is empty.' };
  }
  if (requireTarget) {
    if (!targetShotId) {
      return { ok: false, reason: 'Choose a target shot and create a new draft before applying.' };
    }
    if (!targetShotExists) {
      return { ok: false, reason: 'The original target shot is missing. Choose a target and create a new draft.' };
    }
  }
  return { ok: true, reason: 'Applies the editable result. Project Undo restores the previous text.' };
}

export function assistantShotApplyGate({
  title = '',
  seconds,
  action = '',
  ownerProjectId = '',
  currentProjectId = '',
} = {}) {
  if (!ownerProjectId || !currentProjectId || ownerProjectId !== currentProjectId) {
    return { ok: false, reason: 'Select the original project before applying this draft.' };
  }
  const sec = Number(seconds);
  if (!String(title || '').trim() || !String(action || '').trim() || !Number.isInteger(sec) || sec < 1 || sec > 3600) {
    return { ok: false, reason: 'Add a title, action and valid duration (1–3600s).' };
  }
  return { ok: true, reason: 'Adds a planned shot. Project Undo removes it.' };
}

export function assistantAudioApplyGate({
  hasAudio = false,
  targetShotId = '',
  targetShotExists = false,
  ownerProjectId = '',
  currentProjectId = '',
} = {}) {
  if (!ownerProjectId || !currentProjectId || ownerProjectId !== currentProjectId) {
    return { ok: false, reason: 'Select the original project before applying this draft.' };
  }
  if (!hasAudio) {
    return { ok: false, reason: 'Generate or restore speech first.' };
  }
  if (!targetShotId || !targetShotExists) {
    return { ok: false, reason: 'Choose a target shot before attaching voice.' };
  }
  return { ok: true, reason: 'Attaches voice to the target shot. Undo restores previous audio.' };
}

export function assistantScriptApplyGate({
  text = '',
  hasRig = false,
  targetShotId = '',
  targetShotExists = false,
  ownerProjectId = '',
  currentProjectId = '',
} = {}) {
  if (!ownerProjectId || !currentProjectId || ownerProjectId !== currentProjectId) {
    return { ok: false, reason: 'Select the original project before applying this draft.' };
  }
  if (!String(text || '').trim()) {
    return { ok: false, reason: 'The draft is empty.' };
  }
  if (!targetShotId || !targetShotExists) {
    return { ok: false, reason: 'Choose a target shot first.' };
  }
  if (!hasRig) {
    return { ok: false, reason: 'Set an eye shape on the target shot before writing an expression script.' };
  }
  return { ok: true, reason: 'Writes expression keys on the target shot. Undo restores previous keys.' };
}
