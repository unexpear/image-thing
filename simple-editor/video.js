import { setupCleanup, applyDirectorBrief } from './cleanup.js';
import { trackEvent, trackFinish, renderTracking, previewMessage, receivePreview } from './tracking.js';
const mediaEpoch = await setupCleanup();
const $ = id => document.getElementById(id), key = 'studio-video-v1' + mediaEpoch;
let jobs = []; try { jobs = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
let selected = jobs[0]?.id, input, ready = false, online = false, sending = false, templates = {}, ws, formMessage = '';
let reference = null, referenceUploading = false;
const client = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, client);
const active = j => ['sending', 'queued', 'running', 'cancelling', 'unknown'].includes(j.state);
const view = item => {
  const parts = (item.filename || item.name).replaceAll('\\', '/').split('/');
  const filename = parts.pop(), subfolder = [item.subfolder, ...parts].filter(Boolean).join('/');
  return '/view?' + new URLSearchParams({ filename, subfolder, type: item.type || 'input' });
};
const mode = () => document.querySelector('input[name=mode]:checked').value;
const audioLabel = document.createElement('label'); audioLabel.className = 'field'; audioLabel.textContent = 'Source audio';
const gentleOption = new Option('Gentle variation · experimental, 20 steps', 'gentle'); $('quality').add(gentleOption);
const benchmarkHint = document.createElement('p'); benchmarkHint.className = 'hint'; benchmarkHint.textContent = 'Laptop test, 1-second 384 px clips: 4 steps took 12–21s; standard 20-step tests took 85–150s. Gentle variation took 216s and kept more of the room, but followed the recolor prompt less well. Times vary with source and system load.'; $('quality').closest('label').after(benchmarkHint);
const audioChoice = document.createElement('select'); audioChoice.id = 'source-audio'; audioChoice.add(new Option('Keep original audio', 'keep')); audioChoice.add(new Option('Mute output', 'mute')); audioLabel.append(audioChoice); $('restyle-options').append(audioLabel);
for (const p of document.querySelectorAll('p')) if (p.textContent.includes('Output is 16 fps with no audio.')) p.textContent = p.textContent.replace('Output is 16 fps with no audio.', 'Output is 16 fps. Restyles can keep the source audio; photo animations are silent.');
const fields = ['description', 'length', 'resolution', 'quality', 'vseed', 'start', 'guidance', 'control-strength', 'source-audio'];
function settings() { return Object.fromEntries(fields.map(id => [id, $(id).value])); }
function saveDraft() { try { localStorage.setItem(key + '-draft', JSON.stringify({ mode: mode(), input, reference, settings: settings() })); } catch {} updatePlan(); }
const referenceBox = document.createElement('details'); referenceBox.className = 'settings';
referenceBox.innerHTML = '<summary>Add a reference photo <span>Optional</span></summary><label class="field">Additional reference<input id="reference-file" type="file" accept="image/png,image/jpeg,image/webp"></label><img id="reference-preview" alt="Additional reference photo" class="video-input" hidden><button id="remove-reference" type="button" hidden>Remove reference</button><p class="hint">The starting photo sets the first frame. This extra photo guides a subject or background. One extra reference is supported; it is not an exact identity or style lock. Use the 4-step or standard 20-step preset.</p>';
$('source-note').after(referenceBox);
function showReference() {
  $('reference-preview').hidden = !reference; $('remove-reference').hidden = !reference;
  if (reference) { $('reference-preview').src = view(reference); referenceBox.open = true; }
}
$('remove-reference').onclick = () => { reference = null; $('reference-file').value = ''; showReference(); saveDraft(); };
$('reference-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return error('Choose a PNG, JPG or WebP reference photo.');
  if (file.size > 30 * 1024 * 1024) return error('Choose a reference photo under 30 MB.');
  referenceUploading = true; buttons(); error();
  try {
    const body = new FormData(); body.append('image', file); body.append('subfolder','studio-video'); body.append('type','input');
    const uploaded = await api('/upload/image', { method:'POST', body });
    if ($('reference-file').files[0] === file) { reference = uploaded; showReference(); saveDraft(); }
  } catch (e) { error(e.message); }
  finally { referenceUploading = false; buttons(); }
};
const plan = document.createElement('div'); plan.className = 'video-plan'; plan.setAttribute('aria-live', 'polite'); $('run').before(plan);
const markStart = document.createElement('button'); markStart.type = 'button'; markStart.id = 'mark-start'; markStart.textContent = 'Start the edit at this frame'; markStart.hidden = true; $('clip').after(markStart);
markStart.onclick = () => {
  $('clip').pause(); $('start').value = (Math.floor($('clip').currentTime * 10) / 10).toFixed(1); saveDraft();
};
$('clip').addEventListener('loadedmetadata', () => {
  if (input && mode() === 'restyle' && Number.isFinite($('clip').duration)) { input.duration = $('clip').duration; saveDraft(); }
});
function dimensions() {
  if (!input) return null;
  const ratio = Number($('resolution').value) / Math.max(input.width, input.height);
  return { width: Math.max(64, Math.round(input.width * ratio / 16) * 16), height: Math.max(64, Math.round(input.height * ratio / 16) * 16) };
}
function updatePlan() {
  gentleOption.disabled = mode() !== 'restyle';
  if (gentleOption.disabled && $('quality').value === 'gentle') $('quality').value = 'fast';
  for (const id of ['guidance', 'control-strength']) $(id).closest('label').hidden = $('quality').value === 'gentle';
  const size = dimensions(); markStart.hidden = !input || mode() !== 'restyle';
  markStart.disabled = $('clip').readyState < 1;
  if (!size) { plan.textContent = 'Choose a source to see your output settings.'; return; }
  const frames = Number($('length').value), seconds = frames / 16, steps = $('quality').value === 'fast' ? 4 : 20;
  plan.replaceChildren();
  const title = document.createElement('strong'); title.textContent = `${size.width} × ${size.height} · ${seconds.toFixed(2)} seconds · ${steps} steps`; plan.append(title);
  const detail = document.createElement('p'); detail.textContent = `${frames} frames · 16 fps · ${mode() === 'restyle' && audioChoice.value === 'keep' ? 'source audio if present' : 'silent MP4'}`; plan.append(detail);
  if (reference) { const note = document.createElement('p'); note.textContent = 'Additional reference photo included · uses more memory.'; plan.append(note); }
  // Drift measured on this 1.3B model: the 4-step preset loses a composition
  // after about two seconds, and 20 steps does not rescue a long clip — it
  // sharpens frames without holding the scene together. What actually predicts
  // a usable clip is the subject: wide shots with simple motion survive three
  // seconds, while close-ups and fast action come apart even in one second.
  if (frames > 33) {
    const drift = document.createElement('p'); drift.className = 'hint';
    drift.textContent = `${seconds.toFixed(2)} seconds is at the long end for this model. ` +
      (steps === 4 ? 'On 4 steps the framing usually pushes in and the background dissolves; the 20-step preset is steadier but does not fix length. '
                   : 'Even at 20 steps the scene can rebuild itself towards the end. ') +
      'Wide shots with simple motion hold best at this length. Keep close-ups and fast action to about 2 seconds.';
    plan.append(drift);
  } else if (steps === 4 && frames > 17) {
    const drift = document.createElement('p'); drift.className = 'hint';
    drift.textContent = 'On 4 steps, close-ups and fast action drift even at this length. Use the 20-step preset for anything tighter than a medium shot.';
    plan.append(drift);
  }
  if (mode() === 'restyle') {
    const start = Number($('start').value), end = start + (frames - 1) / 16;
    const range = document.createElement('p'); range.textContent = `Source starts at ${start.toFixed(1)}s; last frame sampled at ${end.toFixed(2)}s.`;
    if (input.duration && end >= input.duration) range.textContent += ' The clip ends earlier, so its last frame will be held.';
    plan.append(range);
  }
}
function restore(saved) {
  const radio = document.querySelector(`input[name=mode][value="${saved.mode === 'restyle' ? 'restyle' : 'animate'}"]`);
  radio.checked = true; radio.onchange();
  reference = saved.reference || null; showReference();
  for (const id of fields) if (saved.settings?.[id] !== undefined) $(id).value = saved.settings[id];
  if (saved.input) {
    input = saved.input; $('media').required = false;
    const preview = mode() === 'animate' ? $('photo') : $('clip'); preview.src = view(input); preview.hidden = false;
    $('source-note').textContent = `${input.name} · restored local source`;
  }
  buttons(); saveDraft();
}
$('video-form').addEventListener('input', saveDraft);
$('video-form').addEventListener('change', saveDraft);
const actions = document.querySelector('.result-actions');
let comparing = false;
const compareButton = document.createElement('button'); compareButton.type = 'button'; compareButton.textContent = 'Compare before / after'; compareButton.hidden = true; actions.prepend(compareButton);
const sourceCompare = document.createElement('div'); sourceCompare.className = 'source-compare'; sourceCompare.hidden = true;
sourceCompare.innerHTML = '<span>Original</span><video muted playsinline preload="metadata"></video><img alt="Original photo" hidden>';
const resultCanvas = $('video-result').parentElement; resultCanvas.prepend(sourceCompare);
const editedCaption = document.createElement('span'); editedCaption.className = 'edited-caption'; editedCaption.textContent = 'Edited'; editedCaption.hidden = true; resultCanvas.append(editedCaption);
const originalVideo = sourceCompare.querySelector('video'), originalPhoto = sourceCompare.querySelector('img');
function syncComparison() {
  const job = jobs.find(j => j.id === selected);
  if (!comparing || !job?.setup || job.mode !== 'restyle' || originalVideo.readyState < 1) return;
  const master = $('video-result'), offset = Number(job.setup.settings.start || 0);
  const target = Math.min(offset + master.currentTime, Math.max(0, originalVideo.duration - 0.001));
  if (Math.abs(originalVideo.currentTime - target) > 0.12) originalVideo.currentTime = target;
  if (master.paused || offset + master.currentTime >= originalVideo.duration) originalVideo.pause();
  else if (originalVideo.paused) originalVideo.play().catch(() => { originalVideo.pause(); });
}
function setComparison(enabled) {
  const job = jobs.find(j => j.id === selected); comparing = enabled && !!job?.setup?.input;
  sourceCompare.hidden = !comparing; resultCanvas.classList.toggle('comparing', comparing);
  editedCaption.hidden = !comparing;
  compareButton.textContent = comparing ? 'Show result only' : 'Compare before / after';
  originalVideo.pause();
  if (!comparing) return;
  const video = job.mode === 'restyle'; originalVideo.hidden = !video; originalPhoto.hidden = video;
  sourceCompare.querySelector('span').textContent = video ? `Original · from ${Number(job.setup.settings.start || 0).toFixed(1)}s` : 'Original photo';
  const source = video ? originalVideo : originalPhoto; source.src = view(job.setup.input); syncComparison();
}
compareButton.onclick = () => setComparison(!comparing);
for (const event of ['play','pause','seeking','seeked','timeupdate','ended']) $('video-result').addEventListener(event, syncComparison);
originalVideo.addEventListener('loadedmetadata', syncComparison);
for (const [id, text] of [['reuse-settings', 'Reuse settings'], ['continue-video', 'Restyle this result']]) {
  const button = document.createElement('button'); button.id = id; button.type = 'button'; button.textContent = text; button.hidden = true; actions.prepend(button);
}
$('reuse-settings').onclick = () => {
  const j = jobs.find(j => j.id === selected); if (!j?.setup) return;
  restore(j.setup); $('description').focus(); error();
};
$('continue-video').onclick = async () => {
  const j = jobs.find(j => j.id === selected); if (!j?.output) return;
  $('continue-video').disabled = true;
  try {
    const response = await fetch(view(j.output), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error('This result file is unavailable.');
    const body = new FormData(); body.append('image', new File([await response.blob()], j.output.filename, { type: 'video/mp4' })); body.append('type', 'input'); body.append('subfolder', 'studio-video');
    const uploaded = await api('/upload/image', { method: 'POST', body });
    restore({ mode: 'restyle', input: { ...uploaded, width: j.width, height: j.height }, settings: { ...settings(), description: j.prompt, start: '0' } });
    $('description').focus(); error();
  } catch (e) { error(e.message); }
  finally { $('continue-video').disabled = false; }
};
const stages = { 1: 'Loading video model', 2: 'Loading text encoder', 3: 'Loading video decoder', 4: 'Preparing source frames', 5: 'Preparing motion guidance', 6: 'Understanding your prompt', 7: 'Preparing conditioning', 9: 'Encoding video guidance', 11: 'Applying acceleration', 12: 'Preparing sampler', 14: 'Generating video frames', 15: 'Preparing output', 16: 'Decoding video frames', 17: 'Assembling video', 18: 'Saving MP4', 20: 'Trimming source audio', 21: 'Encoding the original clip' };
async function api(path, options = {}) { const r = await fetch(path, { ...options, signal: AbortSignal.timeout(30000) }); const d = await r.json(); if (!r.ok) { const e = new Error(JSON.stringify(d, null, 2)); e.rejected = true; throw e; } return d; }
const post = (path, data) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
function error(message = '') { formMessage = message; renderError(); }
function renderError() { const message = formMessage || jobs.find(j => j.id === selected)?.error || ''; $('video-error').hidden = !message; $('video-error').textContent = message; }
function save() { try { localStorage.setItem(key, JSON.stringify(jobs.slice(0, 30))); } catch {} }
function buttons() { $('run').disabled = !ready || !online || !input || sending || referenceUploading; updatePlan(); }
function elapsed(j) { const s = Math.max(0, Math.floor(((j.ended || Date.now()) - (j.started || j.created)) / 1000)); return `${Math.floor(s / 60)}m ${s % 60}s`; }
function render() {
  const j = jobs.find(j => j.id === selected); renderTracking(j); if (!j) return;
  const busy = active(j); $('working').hidden = !busy; $('working').closest('.canvas').setAttribute('aria-busy', String(busy));
  $('working-title').textContent = !online ? 'Reconnecting…' : j.state === 'queued' ? 'Waiting in the queue…' : j.state === 'cancelling' ? 'Stopping this video…' : j.state === 'unknown' ? 'Checking submission status…' : 'Creating your video…';
  $('working').querySelector('.activity-spinner').style.animationPlayState = online ? 'running' : 'paused';
  $('working-stage').textContent = j.stage || j.state; $('time').textContent = elapsed(j) + ' elapsed';
  $('state').textContent = j.state; $('video-stage').textContent = (j.stage || j.state) + ' · ' + elapsed(j);
  document.title = `${busy ? '⏳ ' : ''}${j.state === 'done' ? 'Video ready' : j.stage || 'Video'} · Studio`;
  const p = $('video-progress'); if (j.step && busy) { p.max = j.step.max; p.value = j.step.value; $('working-stage').textContent += ` · ${j.step.value} / ${j.step.max}`; } else if (busy) p.removeAttribute('value'); else { p.max = 1; p.value = j.state === 'done' ? 1 : 0; }
  $('cancel-video').hidden = !busy; $('cancel-video').disabled = ['cancelling', 'sending'].includes(j.state);
  $('video-empty').hidden = busy || !!j.output; $('video-result').hidden = busy || !j.output;
  $('save-video').hidden = !j.output;
  $('reuse-settings').hidden = !j.setup;
  $('continue-video').hidden = !j.output || busy;
  compareButton.hidden = !j.output || !j.setup?.input || busy;
  if (busy && comparing) setComparison(false);
  if (j.output && $('video-result').dataset.job !== j.id) { setComparison(false); $('video-result').src = view(j.output); $('video-result').dataset.job = j.id; $('save-video').href = view(j.output); $('save-video').download = j.output.filename; }
  renderError();
}
let historySignature = '';
function history() {
  const signature = JSON.stringify([selected, jobs.slice(0, 10).map(j => [j.id, j.state, j.prompt])]);
  if (signature === historySignature) return;
  historySignature = signature;
  const h = $('video-history'); h.replaceChildren();
  for (const j of jobs.slice(0, 10)) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = j.prompt; b.setAttribute('aria-pressed', String(selected === j.id));
    const s = document.createElement('small'); s.textContent = `${j.mode === 'animate' ? 'Photo animation' : 'Video restyle'} · ${j.state} · ${j.width}×${j.height} · seed ${j.seed}`; b.append(s);
    const date = document.createElement('small'); date.textContent = new Date(j.created).toLocaleString() + (j.ended ? ' · processed in ' + elapsed(j) : ''); b.append(date);
    b.onclick = () => { $('video-result').pause(); selected = j.id; render(); history(); }; h.append(b);
  }
}
function changed() { save(); render(); history(); }
function finish(j, state, message) { trackFinish(j, state, message); j.state = state; j.ended ||= Date.now(); j.stage = state === 'done' ? 'Video ready' : state === 'cancelled' ? 'Video cancelled' : 'Video failed'; j.error = message; delete j.step; }
for (const r of document.querySelectorAll('input[name=mode]')) r.onchange = () => {
  input = null; $('media').required = true; $('media').value = ''; $('photo').hidden = true; $('clip').hidden = true; $('clip').pause();
  const video = mode() === 'restyle'; $('media').accept = video ? 'video/mp4,video/webm,video/quicktime' : 'image/png,image/jpeg,image/webp'; $('restyle-options').hidden = !video;
  $('source-note').textContent = video ? 'Restyle a short section. Motion is guided by your source; details may change. Source audio is kept by default.' : 'The photo sets the first frame. Describe the movement you want.'; buttons();
};
$('media').onchange = async e => {
  const file = e.target.files[0]; input = null; buttons(); if (!file) return;
  if (file.size > 300 * 1024 * 1024) return error('Choose a clip under 300 MB. Trim large recordings first.');
  const pickedMode = mode(); const element = pickedMode === 'animate' ? $('photo') : $('clip'); const objectUrl = URL.createObjectURL(file);
  error();
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not read this media file.')), 10000);
      const done = () => { clearTimeout(timer); resolve({ width: element.naturalWidth || element.videoWidth, height: element.naturalHeight || element.videoHeight, duration: pickedMode === 'restyle' && Number.isFinite(element.duration) ? element.duration : null }); };
      element.onerror = () => { clearTimeout(timer); reject(new Error('Cannot preview this format. Use PNG/JPG or an H.264 MP4.')); };
      if (pickedMode === 'animate') element.onload = done; else element.onloadedmetadata = done;
      element.src = objectUrl; element.hidden = false;
    });
    const body = new FormData(); body.append('image', file); body.append('type', 'input'); body.append('subfolder', 'studio-video');
    $('source-note').textContent = 'Uploading to this computer…';
    const uploaded = await api('/upload/image', { method: 'POST', body });
    if (mode() === pickedMode && $('media').files[0] === file) { input = { ...uploaded, ...dimensions }; element.src = view(input); $('source-note').textContent = `${file.name} · ${dimensions.width}×${dimensions.height} · uploaded locally`; saveDraft(); }
  } catch (e) { error(e.message); }
  finally { URL.revokeObjectURL(objectUrl); buttons(); }
};
$('video-form').onsubmit = async e => {
  e.preventDefault(); if (!input || !ready || sending || referenceUploading) return;
  if (reference && $('quality').value === 'gentle') return error('Additional references work with 4-step or standard 20-step processing. Choose one of those presets or remove the reference.');
  if (mode() === 'restyle' && input.duration && Number($('start').value) >= input.duration) return error(`Start time must be earlier than the end of this ${input.duration.toFixed(2)}-second clip.`);
  sending = true; buttons(); error();
  const which = mode(), graph = structuredClone(templates[which]);
  const { width, height } = dimensions();
  const frames = Number($('length').value), seed = $('vseed').value === '' ? crypto.getRandomValues(new Uint32Array(1))[0] : Number($('vseed').value);
  const prompt = $('description').value.trim();
  if (!prompt) { sending = false; buttons(); return error('Describe the video you want.'); }
  graph['6'].inputs.text = prompt; Object.assign(graph['9'].inputs, { width, height, length: frames }); graph['14'].inputs.seed = seed;
  const name = (input.subfolder ? input.subfolder + '/' : '') + input.name;
  if (which === 'animate') { graph['4'].inputs.image = name; Object.assign(graph['5'].inputs, { width, height }); }
  else { Object.assign(graph['4'].inputs, { file: name, width, height, frames, start_seconds: Number($('start').value) }); graph['9'].inputs.strength = Number($('control-strength').value); if ($('guidance').value === 'source') { graph['9'].inputs.control_video = ['4', 0]; delete graph['5']; } }
  if ($('quality').value !== 'fast') { graph['12'].inputs.model = ['1', 0]; delete graph['11']; Object.assign(graph['14'].inputs, { steps: 20, cfg: 6 }); }
  if ($('quality').value === 'gentle' && which === 'restyle') {
    graph['21'] = { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['3', 0] } };
    graph['9'].inputs.control_video = ['4', 0]; graph['9'].inputs.strength = 1; delete graph['5'];
    Object.assign(graph['14'].inputs, { latent_image: ['21', 0], denoise: 0.6, cfg: 3 });
  }
  if (which === 'restyle' && audioChoice.value === 'keep') {
    graph['20'] = { class_type: 'StudioVideoAudio', inputs: { file: name, start_seconds: Number($('start').value), duration: frames / 16 } };
    graph['17'].inputs.audio = ['20', 0];
  }
  if (reference) {
    graph['22'] = { class_type:'LoadImage', inputs:{ image:(reference.subfolder ? reference.subfolder + '/' : '') + reference.name } };
    graph['9'].inputs.reference_image = ['22', 0];
  }
  const setup = { mode: which, input: structuredClone(input), reference: reference ? structuredClone(reference) : null, settings: { ...settings(), vseed: String(seed) } };
  const j = { id: crypto.randomUUID(), created: Date.now(), state: 'sending', stage: 'Sending video job', prompt, mode: which, width, height, seed, setup };
  jobs.unshift(j); selected = j.id; changed();
  try { await post('/prompt', { prompt_id: j.id, client_id: client, prompt: graph, extra_data: { preview_method: 'latent2rgb', studio_video_setup: setup } }); if (j.state === 'sending') { j.state = 'queued'; j.stage = 'Waiting in queue'; } }
  catch (e) { if (e.rejected) finish(j, 'error', e.message); else { j.state = 'unknown'; j.stage = 'Connection lost; checking job'; j.error = 'Submission may have succeeded. Check its status before retrying.'; } }
  finally { sending = false; buttons(); changed(); }
};
$('cancel-video').onclick = async () => { const j = jobs.find(j => j.id === selected); if (!j || !active(j)) return; const before = j.state; j.state = 'cancelling'; changed(); try { const r = await post('/api/jobs/' + j.id + '/cancel', {}); if (r.cancelled && before === 'queued') finish(j, 'cancelled'); await poll(); } catch (e) { j.state = before; j.error = e.message; } changed(); };
function absorb(j, h) {
  j.setup ||= h.prompt?.[3]?.studio_video_setup;
  if (!j.setup && h.prompt?.[2]?.['4']) {
    const g = h.prompt[2], animate = g['4'].class_type === 'LoadImage';
    j.setup = { mode: animate ? 'animate' : 'restyle', input: { name: g['4'].inputs.image || g['4'].inputs.file, type: 'input', width: j.width, height: j.height }, settings: { description: j.prompt, length: String(g['9'].inputs.length), resolution: String(Math.max(j.width,j.height)), quality: g['14'].inputs.steps === 20 ? 'standard' : 'fast', vseed: String(j.seed), start: String(g['4'].inputs.start_seconds || 0), guidance: g['5']?.class_type === 'Canny' ? 'edges' : 'source', 'control-strength': String(g['9'].inputs.strength), 'source-audio': g['20'] ? 'keep' : 'mute' } };
  }
  const messages = h.status?.messages || []; j.started = messages.find(m => m[0] === 'execution_start')?.[1].timestamp || j.started;
  j.output = Object.values(h.outputs || {}).flatMap(o => o.images || []).find(i => /\.mp4$/i.test(i.filename)) || j.output;
  const failure = messages.find(m => ['execution_error', 'execution_interrupted'].includes(m[0]));
  if (failure) finish(j, failure[0] === 'execution_interrupted' ? 'cancelled' : 'error', failure[1].exception_message);
  else if (h.status?.completed) { finish(j, j.output ? 'done' : 'error', j.output ? undefined : 'The completed job returned no video. Check the ComfyUI output files.'); j.ended = messages.find(m => m[0] === 'execution_success')?.[1].timestamp || j.ended; }
}
let polling = false;
async function poll() {
  if (polling) return; polling = true;
  try {
    const q = await api('/queue'); online = true; $('connection').textContent = ws?.readyState === WebSocket.OPEN ? '● Local · live' : '● Local · polling'; $('queue-state').textContent = `${q.queue_running.length} running · ${q.queue_pending.length} waiting`;
    for (const j of jobs.filter(j => (active(j) && j.state !== 'sending') || (j.state === 'done' && !j.output))) {
      if (q.queue_running.some(r => r[1] === j.id)) { if (j.state !== 'running' && j.state !== 'cancelling') { j.state = 'running'; j.stage = 'Processing video'; } }
      else if (q.queue_pending.some(r => r[1] === j.id)) { j.state = 'queued'; j.stage = `Waiting · position ${q.queue_pending.findIndex(r => r[1] === j.id) + 1}`; }
      else { const h = await api('/history/' + j.id); if (h[j.id]) absorb(j, h[j.id]); else if (Date.now() - j.created > 30000) { if (j.state === 'cancelling') finish(j, 'cancelled'); else finish(j, 'error', 'This job is no longer in server history or queue. The backend may have restarted. Check output files before retrying.'); } }
    }
    changed();
  } catch { online = false; $('connection').textContent = '○ Reconnecting'; }
  finally { polling = false; buttons(); }
}
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?clientId=${client}`);
  ws.onclose = () => setTimeout(connect, 3000); ws.onerror = () => ws.close();
  ws.binaryType = 'arraybuffer';
  ws.onmessage = e => {
    if (typeof e.data !== 'string') { receivePreview(e.data, jobs); return; } const { type, data } = JSON.parse(e.data); previewMessage(type, data); const j = jobs.find(j => j.id === data?.prompt_id); if (!j) return;
    if (type === 'execution_start') { j.state = 'running'; j.started = data.timestamp || Date.now(); }
    if (type === 'executing' && data.node) { j.stage = stages[data.node] || 'Processing'; delete j.step; }
    if (type === 'progress') { j.state = 'running'; j.stage = stages[data.node] || 'Processing'; j.step = { value: data.value, max: data.max }; }
    if (type === 'execution_error') finish(j, 'error', data.exception_message);
    if (type === 'execution_interrupted') finish(j, 'cancelled');
    if (type === 'executed' && data.output?.images) j.output = data.output.images.find(i => /\.mp4$/i.test(i.filename));
    if (type === 'execution_success') { finish(j, 'done'); poll(); }
    trackEvent(j, type, data);
    changed();
  };
}
async function init() {
  try {
    [templates.animate, templates.restyle] = await Promise.all(['animate', 'restyle'].map(m => api(`/qwen-editor/${m}.api.json`)));
    const checks = [['UNETLoader', 'unet_name', templates.animate['1'].inputs.unet_name], ['CLIPLoader', 'clip_name', templates.animate['2'].inputs.clip_name], ['VAELoader', 'vae_name', templates.animate['3'].inputs.vae_name], ['LoraLoaderModelOnly', 'lora_name', templates.animate['11'].inputs.lora_name]];
    for (const [type, field, file] of checks) { const info = await api('/object_info/' + type); if (!info[type].input.required[field][0].includes(file)) throw new Error('Missing model: ' + file); }
    const info = await api('/object_info/StudioVideoInput'); if (!info.StudioVideoInput) throw new Error('Restart ComfyUI to load the video decoder.');
    ready = true; $('availability').textContent = 'Models ready · processed on this computer';
    const h = await api('/history?max_items=30');
    for (const [id, item] of Object.entries(h)) { const g = item.prompt?.[2]; if (jobs.some(j => j.id === id) || !g?.['18']?.inputs.filename_prefix?.startsWith('Qwen-Studio/Video/')) continue; const j = { id, state: 'unknown', created: item.status.messages[0][1].timestamp, prompt: g['6'].inputs.text, mode: g['4'].class_type === 'LoadImage' ? 'animate' : 'restyle', width: g['9'].inputs.width, height: g['9'].inputs.height, seed: g['14'].inputs.seed }; absorb(j, item); jobs.push(j); }
    jobs.sort((a, b) => b.created - a.created); selected ||= jobs[0]?.id;
  } catch (e) { $('availability').textContent = 'Video setup not ready'; error(e.message); }
  try { const draft = JSON.parse(localStorage.getItem(key + '-draft') || 'null'); if (draft) restore(draft); } catch {}
  applyDirectorBrief();
  connect(); await poll(); changed();
}
setInterval(poll, 3000); setInterval(render, 1000); init();
