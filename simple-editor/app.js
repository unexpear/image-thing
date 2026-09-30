import { setupCleanup, applyDirectorBrief } from './cleanup.js';
import {loadDirectorReferences} from './director-references.js';
import {setMaskSource, restoreReferences, applyImageControls} from './image-controls.js';
import { trackEvent, trackFinish, renderTracking, previewMessage, receivePreview } from './tracking.js';
const mediaEpoch = await setupCleanup();
const $ = id => document.getElementById(id);
const videoLink = document.createElement('a');
videoLink.href = '/qwen-editor/video.html'; videoLink.textContent = 'Video →';
document.querySelector('.header-right').prepend(videoLink);
const STORE = 'qwen-studio-v1' + mediaEpoch;
let saved; try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { saved = {}; }
let jobs = saved.jobs || [], selected = saved.selected, source = saved.source || null;
let template, workflow, online = false, submitting = false, uploading = false, socket;
let clientId = sessionStorage.getItem(STORE) || crypto.randomUUID();
sessionStorage.setItem(STORE, clientId);
const active = job => ['submitting', 'queued', 'running', 'cancelling'].includes(job.state);
// Keep this element mounted so timer updates do not restart the animation.
const activity = document.createElement('div');
activity.id = 'activity'; activity.hidden = true;
activity.innerHTML = '<span class="activity-spinner" aria-hidden="true"></span><strong id="activity-title"></strong><p id="activity-detail"></p><span id="activity-time"></span>';
$('canvas').append(activity);
const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ jobs: jobs.slice(0, 40), selected, source, prompt: $('prompt').value })); } catch { /* Storage can be disabled; server outputs remain saved. */ } };
const url = img => {
  const parts = (img.filename || img.name).replaceAll('\\', '/').split('/');
  const filename = parts.pop(), subfolder = [img.subfolder, ...parts].filter(Boolean).join('/');
  return '/view?' + new URLSearchParams({ filename, subfolder, type: img.type || 'input' });
};
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data, null, 2));
  return data;
}
const post = (path, data) => request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
function formError(message = '') { $('form-error').textContent = message; $('form-error').hidden = !message; }
function updateButton() { $('generate').disabled = !online || !template || !source || uploading || submitting; }
function setSource(img) {
  setMaskSource(img);
  source = img; $('input-preview').src = url(img); $('input-preview').hidden = false;
  $('upload-hint').hidden = true; $('input-name').textContent = img.name || img.filename;
  persist(); updateButton();
}
async function upload(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return formError('Choose a PNG, JPG or WebP image.');
  uploading = true; updateButton(); formError(); $('input-name').textContent = 'Uploading locally…';
  try { const body = new FormData(); body.append('image', file); body.append('subfolder', 'qwen-studio'); body.append('type', 'input'); setSource(await request('/upload/image', { method: 'POST', body })); }
  catch (e) { formError('Image upload failed: ' + e.message); $('input-name').textContent = source?.name || 'No image selected'; }
  finally { uploading = false; updateButton(); }
}
$('file').onchange = e => upload(e.target.files[0]);
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('drag'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('drag'); });
$('dropzone').addEventListener('drop', e => upload(e.dataTransfer.files[0]));
$('prompt').value = saved.prompt || ''; $('prompt').oninput = persist; applyDirectorBrief();
$('lora').onchange = () => { $('strength').disabled = !$('lora').value; };
if (source) setSource(source);
try{await loadDirectorReferences(setSource,restoreReferences);}catch(error){formError(error.message);}
const stageNames = { '1': 'Loading image model', '2': 'Loading vision and text model', '3': 'Loading image decoder', '4': 'Reading your image', '5': 'Resizing your image', '6': 'Understanding your edit', '7': 'Preparing conditioning', '10': 'Encoding your image', '11': 'Applying Lightning preset', '19': 'Applying additional LoRA', '14': 'Generating your edit', '15': 'Decoding your result', '16': 'Saving your result' };
function duration(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`; }
function render() {
  const job = jobs.find(j => j.id === selected);
  renderTracking(job);
  const busy = !!job && active(job);
  activity.hidden = !busy;
  $('canvas').classList.toggle('working', busy);
  activity.classList.toggle('disconnected', !online);
  $('canvas').setAttribute('aria-busy', String(busy));
  if (busy) {
    $('activity-title').textContent = !online ? 'Reconnecting to ComfyUI…' : job.state === 'queued' ? 'Your edit is in the queue' : job.state === 'submitting' ? 'Sending your edit…' : job.state === 'cancelling' ? 'Stopping your edit…' : 'Creating your edit…';
    $('activity-detail').textContent = !online ? 'Waiting for the backend to confirm progress.' : job.step ? `${job.stage} · ${job.step.value} / ${job.step.max}` : job.stage || 'Preparing models';
    $('activity-time').textContent = duration(Date.now() - (job.started || job.created)) + (job.state === 'queued' ? ' waiting' : ' elapsed');
  }
  if (!job) return;
  $('stage').textContent = job.stage || job.state;
  $('result-label').textContent = ({ done: 'Edit complete', error: 'Needs attention', cancelled: 'Cancelled', queued: 'In the queue', running: 'Creating…', submitting: 'Submitting…', cancelling: 'Stopping…', unknown: 'Status unavailable' })[job.state] || job.state;
  $('elapsed').textContent = (job.started ? 'Processing ' : 'Elapsed ') + duration((job.ended || Date.now()) - (job.started || job.created));
  const progress = $('progress');
  if (job.state === 'done') { progress.max = 1; progress.value = 1; }
  else if (job.step && job.state === 'running') { progress.max = job.step.max; progress.value = job.step.value; }
  else if (active(job)) progress.removeAttribute('value');
  else { progress.max = 1; progress.value = 0; }
  $('stage-note').textContent = job.step && job.state === 'running' ? `${job.node === '14' ? 'Sampling step' : 'Stage progress'} ${job.step.value} of ${job.step.max} · ${job.steps} step preset` : job.state === 'done' ? `Saved on this computer · ${job.steps} steps · seed ${job.seed}` : job.state === 'queued' ? 'Waiting for earlier work to finish. You can leave this page open.' : job.state === 'running' ? 'Model loading and image understanding can take a while on 8 GB VRAM.' : job.state === 'error' ? 'See the error details below, adjust the edit, and try again.' : job.state === 'unknown' ? 'The server no longer has this job. It may have restarted; check ComfyUI output files.' : job.state === 'cancelled' ? 'This edit was stopped. Your original image is unchanged.' : 'Contacting ComfyUI…';
  $('cancel').hidden = !active(job); $('cancel').disabled = job.state === 'cancelling' || job.state === 'submitting';
  $('error-details').hidden = !job.error; $('error-text').textContent = job.error || '';
  $('used-prompt').hidden = false; $('used-prompt-text').textContent = job.prompt || '';
  const result = job.images?.[0];
  $('comparison-label').hidden = !result;
  $('empty').hidden = !!result; $('result').hidden = !result; $('result-actions').hidden = !result;
  if (result && $('result').dataset.job !== job.id) { $('result').src = url(result); $('result').dataset.job = job.id; $('compare').textContent = 'View original'; $('comparison-label').textContent = 'Edited result'; }
  if (result) { $('download').href = url(result); $('download').download = result.filename; }
}
function renderHistory() {
  const container = $('history'); container.replaceChildren();
  if (!jobs.length) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'Your recent edits will appear here.'; container.append(p); }
  for (const job of jobs.slice(0, 20)) {
    const card = document.createElement('button'); card.className = 'history-card'; card.type = 'button';
    const img = job.images?.[0]; if (img) { const image = document.createElement('img'); image.src = url(img); image.alt = job.prompt; image.loading = 'lazy'; card.append(image); }
    const title = document.createElement('b'); title.textContent = job.prompt; card.append(title);
    const subtitle = document.createElement('small'); subtitle.textContent = `${job.state} · ${job.steps} steps · ${new Date(job.created).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; card.append(subtitle);
    card.onclick = () => { selected = job.id; $('result').dataset.job = ''; persist(); render(); }; container.append(card);
  }
}
function changed() { persist(); render(); renderHistory(); }
function finish(job, state, error) { trackFinish(job, state, error); job.state = state; job.ended ||= Date.now(); job.stage = state === 'done' ? 'Your edit is ready' : state === 'cancelled' ? 'Edit cancelled' : 'Edit failed'; job.error = error; delete job.step; }
$('editor').onsubmit = async event => {
  event.preventDefault(); if (submitting || uploading || !source || !template) return;
  const prompt = $('prompt').value.trim(); if (!prompt) return formError('Describe what you want to change.');
  submitting = true; updateButton(); formError();
  const graph = structuredClone(template), ui = structuredClone(workflow);
  const steps = Number(document.querySelector('input[name=preset]:checked').value);
  const seed = $('seed').value === '' ? crypto.getRandomValues(new Uint32Array(1))[0] : Number($('seed').value);
  const image = (source.subfolder ? source.subfolder + '/' : '') + (source.name || source.filename);
  graph['4'].inputs.image = image; graph['5'].inputs.megapixels = Number($('size').value); graph['6'].inputs.prompt = prompt;
  graph['11'].inputs.lora_name = `Qwen-Image-Edit-2511-Lightning-${steps === 40 ? 4 : steps}steps-V1.0-bf16.safetensors`;
  graph['11'].inputs.strength_model = steps === 40 ? 0 : 1;
  graph['14'].inputs.cfg = steps === 40 ? 4 : 1;
  graph['19'].inputs.lora_name = $('lora').value || graph['11'].inputs.lora_name;
  graph['19'].inputs.strength_model = $('lora').value ? Number($('strength').value) : 0;
  graph['14'].inputs.steps = steps; graph['14'].inputs.seed = seed;
  graph['16'].inputs.filename_prefix = 'Qwen-Studio/Edit';
  let imageControls;
  try { imageControls = await applyImageControls(graph); }
  catch (e) { submitting = false; updateButton(); formError(e.message); return; }
  const widgets = { 4: [image, 'image'], 5: ['area', Number($('size').value), 8], 6: [prompt], 11: [graph['11'].inputs.lora_name, graph['11'].inputs.strength_model], 14: [seed, 'fixed', steps, graph['14'].inputs.cfg, 'euler', 'simple', 1], 16: ['Qwen-Studio/Edit'], 19: [graph['19'].inputs.lora_name, graph['19'].inputs.strength_model] };
  for (const node of ui.nodes) if (widgets[node.id]) node.widgets_values = widgets[node.id];
  const job = { id: crypto.randomUUID(), created: Date.now(), state: 'submitting', stage: 'Sending your edit', prompt, steps, seed, source: structuredClone(source), settings: { size: Number($('size').value), lora: $('lora').value, strength: Number($('strength').value) }, workflow: ui };
  jobs.unshift(job); selected = job.id; changed();
  job.imageControls = imageControls; job.apiWorkflow = graph;
  try { await post('/prompt', { prompt_id: job.id, client_id: clientId, prompt: graph, extra_data: { preview_method: 'latent2rgb', extra_pnginfo: { ...(imageControls.masked || imageControls.refs.length ? {} : {workflow: ui}), studio_image_controls: imageControls } } }); if (job.state === 'submitting') { job.state = 'queued'; job.stage = 'Waiting in queue'; } }
  catch (e) {
    // A lost response can still mean the server accepted the job. Reconcile before allowing a retry.
    try { const q = await request('/queue'); const h = await request('/history/' + job.id); if (h[job.id]) absorb(job, h[job.id]); else if ([...q.queue_running, ...q.queue_pending].some(row => row[1] === job.id)) { job.state = 'queued'; job.stage = 'Accepted · reconnecting'; } else finish(job, 'error', e.message); }
    catch { job.state = 'unknown'; job.stage = 'Submission status unknown'; job.error = 'Connection lost. Check the ComfyUI queue before retrying. ' + e.message; }
  } finally { submitting = false; updateButton(); changed(); }
};
$('cancel').onclick = async () => {
  const job = jobs.find(j => j.id === selected); if (!job || !active(job)) return;
  const previous = job.state; job.state = 'cancelling'; job.stage = 'Stopping this edit'; changed();
  try { const result = await post('/api/jobs/' + job.id + '/cancel', {}); if (result.cancelled && previous === 'queued') finish(job, 'cancelled'); await poll(); }
  catch (e) { job.state = previous; job.error = 'Could not cancel: ' + e.message; }
  changed();
};
$('compare').onclick = () => { const job = jobs.find(j => j.id === selected); if (!job?.source) return; const original = $('compare').textContent === 'View original'; $('result').src = url(original ? job.source : job.images[0]); $('compare').textContent = original ? 'View edited result' : 'View original'; $('comparison-label').textContent = original ? 'Original · comparison view' : 'Edited result'; $('result').alt = original ? 'Original image for comparison' : 'Edited result'; };
$('reuse').onclick = async () => {
  const job = jobs.find(j => j.id === selected); if (!job?.images?.[0]) return;
  try { const response = await fetch(url(job.images[0])); if (!response.ok) throw new Error('Result image unavailable'); const blob = await response.blob(); await upload(new File([blob], job.images[0].filename, { type: 'image/png' })); $('prompt').focus(); }
  catch (e) { formError(e.message); }
};
function absorb(job, item) {
  const messages = item.status?.messages || [];
  const start = messages.find(([type]) => type === 'execution_start'); if (start) job.started = start[1].timestamp;
  const images = Object.values(item.outputs || {}).flatMap(o => o.images || []).filter(i => i.type === 'output');
  if (images.length) job.images = images;
  const failure = messages.find(([type]) => type === 'execution_error' || type === 'execution_interrupted');
  if (failure) { finish(job, failure[0] === 'execution_interrupted' ? 'cancelled' : 'error', failure[1].exception_message); job.ended = failure[1].timestamp || job.ended; }
  else if (item.status?.completed) { finish(job, job.images?.length ? 'done' : 'error', job.images?.length ? undefined : 'The completed job returned no image. Check the ComfyUI output files.'); job.ended = messages.find(([type]) => type === 'execution_success')?.[1].timestamp || job.ended; }
}
let polling = false, lastImport = 0;
async function poll() {
  if (polling) return; polling = true;
  try {
    const q = await request('/queue'); online = true;
    $('connection').textContent = socket?.readyState === WebSocket.OPEN ? '● Local · connected' : '● Local · polling';
    $('queue').textContent = `${q.queue_running.length} running · ${q.queue_pending.length} waiting`;
    for (const row of [...q.queue_running, ...q.queue_pending]) {
      if (jobs.some(j => j.id === row[1])) continue;
      const graph = row[2];
      if (!graph || !Object.values(graph).some(n => n.class_type === 'TextEncodeQwenImageEditPlus')) continue;
      const name = graph['4']?.inputs.image;
      jobs.unshift({ id: row[1], created: Date.now(), state: 'queued', stage: 'Submitted from ComfyUI', prompt: graph['6']?.inputs.prompt || 'ComfyUI edit', steps: graph['14']?.inputs.steps || '?', seed: graph['14']?.inputs.seed, source: name ? { name, type: 'input' } : null });
      if (!selected) selected = row[1];
    }
    const needsHistory = jobs.filter(j => active(j) || j.state === 'unknown' || (j.state === 'done' && !j.images?.length));
    for (const job of needsHistory) {
      if (q.queue_running.some(row => row[1] === job.id)) { if (job.state !== 'cancelling') { if (job.state !== 'running') job.stage = 'Processing in ComfyUI'; job.state = 'running'; } }
      else if (q.queue_pending.some(row => row[1] === job.id)) { job.state = 'queued'; job.stage = `Waiting · position ${q.queue_pending.findIndex(row => row[1] === job.id) + 1}`; }
      else { const h = await request('/history/' + job.id); if (h[job.id]) absorb(job, h[job.id]); else if (Date.now() - job.created > 15000) { if (job.state === 'cancelling') finish(job, 'cancelled'); else { job.state = 'unknown'; job.stage = 'Job no longer in server queue'; } } }
    }
    if (Date.now() - lastImport > 12000) {
      const history = await request('/history?max_items=30'); lastImport = Date.now();
      const stats = await request('/system_stats');
      const gpu = stats.devices?.find(d => d.type === 'cuda');
      if (gpu) $('hardware').textContent = `GPU memory: ${((gpu.vram_total - gpu.vram_free) / 1073741824).toFixed(1)} / ${(gpu.vram_total / 1073741824).toFixed(0)} GB used · RAM free: ${(stats.system.ram_free / 1073741824).toFixed(1)} GB`;
      for (const [id, item] of Object.entries(history)) {
        if (jobs.some(j => j.id === id)) continue;
        const graph = item.prompt?.[2]; if (!graph || !Object.values(graph).some(n => n.class_type === 'TextEncodeQwenImageEditPlus')) continue;
        const inputName = graph['4']?.inputs.image;
        const job = { id, created: item.status?.messages?.[0]?.[1]?.timestamp || Date.now(), prompt: graph['6']?.inputs.prompt || 'ComfyUI edit', steps: graph['14']?.inputs.steps || '?', seed: graph['14']?.inputs.seed, source: inputName ? { name: inputName, type: 'input' } : null, state: 'unknown', settings: { size: graph['5']?.inputs.megapixels || 0.25, lora: graph['19']?.inputs.strength_model ? graph['19'].inputs.lora_name : '', strength: graph['19']?.inputs.strength_model || 1 }, workflow: item.prompt?.[3]?.extra_pnginfo?.workflow };
        job.apiWorkflow = graph; job.imageControls = item.prompt?.[3]?.extra_pnginfo?.studio_image_controls;
        absorb(job, item); jobs.push(job);
      }
      jobs.sort((a, b) => b.created - a.created); if (!selected && jobs.length) selected = jobs[0].id;
    }
    changed();
  } catch { online = false; $('connection').textContent = '○ Backend offline'; $('queue').textContent = 'Reconnecting… Start Qwen Edit if ComfyUI is closed.'; }
  finally { polling = false; updateButton(); }
}
function connect() {
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?clientId=${clientId}`);
  socket.onopen = () => poll();
  socket.onclose = () => { $('connection').textContent = 'Reconnecting…'; setTimeout(connect, 3000); };
  socket.onerror = () => socket.close();
  socket.binaryType = 'arraybuffer';
  socket.onmessage = event => {
    if (typeof event.data !== 'string') { receivePreview(event.data, jobs); return; }
    const { type, data } = JSON.parse(event.data); previewMessage(type, data); const job = jobs.find(j => j.id === data?.prompt_id); if (!job) return;
    if (type === 'execution_start') { job.state = 'running'; job.started = data.timestamp || Date.now(); job.stage = 'Preparing models'; }
    if (type === 'executing' && data.node) { job.node = String(data.node); job.stage = stageNames[job.node] || 'Preparing your edit'; delete job.step; }
    if (type === 'progress') { job.state = 'running'; job.node = String(data.node); job.step = { value: data.value, max: data.max }; job.stage = stageNames[job.node] || 'Processing your edit'; }
    if (type === 'executed' && data.output?.images) job.images = data.output.images;
    if (type === 'execution_error') finish(job, 'error', `${data.node_type}: ${data.exception_message}`);
    if (type === 'execution_interrupted') finish(job, 'cancelled');
    if (type === 'execution_success') { finish(job, 'done'); poll(); }
    trackEvent(job, type, data);
    changed();
  };
}
async function init() {
  try {
    [template, workflow] = await Promise.all([request('/qwen-editor/quality.api.json'), request('/qwen-editor/quality.json')]);
    const info = await request('/object_info/LoraLoaderModelOnly');
    const loras = info.LoraLoaderModelOnly.input.required.lora_name[0].filter(name => !name.includes('Lightning-') && !/wan21|causvid/i.test(name));
    for (const name of loras) $('lora').add(new Option(name, name));
    if (!loras.length) $('lora-hint').textContent = 'No extra LoRAs installed yet. Lightning is included in the fast presets; full sampling turns it off. Add Qwen Edit 2511 LoRAs to ComfyUI/models/loras, then reload.';
  } catch (e) { formError('Could not load the editor configuration. Reload after starting ComfyUI. ' + e.message); }
  connect(); await poll(); renderHistory(); render();
}
$('restore').onclick = () => {
  const job = jobs.find(j => j.id === selected); if (!job) return;
  if (job.source) setSource(job.source);
  restoreReferences(job.imageControls);
  formError();
  $('prompt').value = job.prompt; $('seed').value = job.seed ?? '';
  const preset = document.querySelector(`input[name=preset][value="${job.steps}"]`); if (preset) preset.checked = true;
  if (job.settings) { $('size').value = job.settings.size; $('lora').value = job.settings.lora; $('strength').value = job.settings.strength; $('lora').onchange(); }
  persist(); $('prompt').focus();
};
$('export').onclick = () => {
  const job = jobs.find(j => j.id === selected); if (!job?.apiWorkflow && !job?.workflow) return formError('Workflow metadata is unavailable for this older edit. New Studio edits include it.');
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(job.apiWorkflow || job.workflow, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = objectUrl; link.download = `Qwen-Studio-${job.seed}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};
setInterval(poll, 3000); setInterval(render, 1000); init();
