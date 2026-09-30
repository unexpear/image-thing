// Small previews stay in memory for this tab, separate from saved final outputs.
const previews = new Map();
let previewContext = null, displayedJob = null, galleryVersion = 0, shownVersion = -1;
const galleryPanel = document.createElement('section');
galleryPanel.className = 'iteration-tracker';
const galleryTitle = document.createElement('h3');
galleryTitle.textContent = 'Visual iterations';
const galleryNote = document.createElement('p');
galleryNote.className = 'hint';
galleryNote.textContent = 'A rough preview appears after each sampling step. Video shows a still frame. Keep this tab open; previews are not saved after refresh.';
const gallery = document.createElement('div');
gallery.className = 'iteration-gallery';
galleryPanel.append(galleryTitle, galleryNote, gallery);
document.querySelector('.tracker').before(galleryPanel);

export function previewMessage(type, data) {
  if (type === 'progress') previewContext = {id: data.prompt_id, node: String(data.node), step: data.value, total: data.max};
  else if (['executing', 'execution_start', 'execution_success', 'execution_error', 'execution_interrupted'].includes(type)) previewContext = null;
}

export function receivePreview(buffer, knownJobs) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength <= 8 || !previewContext) return;
  const header = new DataView(buffer);
  // This client uses ComfyUI's legacy preview protocol: event, format, image bytes.
  if (header.getUint32(0) !== 1 || ![1, 2].includes(header.getUint32(4))) return;
  const context = previewContext;
  if (context.node !== '14' || !knownJobs.some(job => job.id === context.id)) return;
  let frames = previews.get(context.id);
  if (!frames) { frames = new Map(); previews.set(context.id, frames); }
  const old = frames.get(context.step);
  if (old) URL.revokeObjectURL(old.url);
  frames.set(context.step, {url: URL.createObjectURL(new Blob([buffer.slice(8)], {type: header.getUint32(4) === 1 ? 'image/jpeg' : 'image/png'})), total: context.total});
  while (previews.size > 30) {
    const oldest = previews.keys().next().value;
    for (const frame of previews.get(oldest).values()) URL.revokeObjectURL(frame.url);
    previews.delete(oldest);
  }
  galleryVersion++;
  renderGallery(displayedJob);
}

function renderGallery(id) {
  if (displayedJob === id && shownVersion === galleryVersion) return;
  displayedJob = id; shownVersion = galleryVersion;
  gallery.replaceChildren();
  const frames = previews.get(id);
  if (!frames?.size) {
    const empty = document.createElement('p'); empty.className = 'hint';
    empty.textContent = 'Waiting for visual previews. Earlier or cached runs have no live previews.';
    gallery.append(empty); return;
  }
  for (const [step, frame] of [...frames].sort((a, b) => a[0] - b[0])) {
    const figure = document.createElement('figure');
    const link = document.createElement('a'); link.href = frame.url; link.target = '_blank'; link.rel = 'noopener';
    const image = document.createElement('img'); image.src = frame.url; image.alt = `Iteration ${step} preview`; link.append(image);
    const label = document.createElement('figcaption'); label.textContent = `Iteration ${step} / ${frame.total}`;
    figure.append(link, label); gallery.append(figure);
  }
}
const panel = document.createElement('section');
panel.className = 'iteration-tracker';
const title = document.createElement('h3');
title.textContent = 'Iterations & activity';
const current = document.createElement('p');
current.setAttribute('role', 'status');
const log = document.createElement('ol');
log.className = 'iteration-log';
panel.append(title, current, log);
document.querySelector('.tracker').append(panel);
const alert = document.createElement('div');
alert.className = 'failure-banner';
alert.hidden = true;
alert.setAttribute('role', 'alert');
const message = document.createElement('p');
const dismiss = document.createElement('button');
dismiss.type = 'button'; dismiss.textContent = 'Dismiss message';
dismiss.onclick = () => { alert.hidden = true; };
alert.append(message, dismiss);
document.querySelector('main').prepend(alert);
let signature;

export function recordActivity(job, text) {
  job.activity ||= [];
  if (job.activity.at(-1)?.text === text) return;
  job.activity.push({time: Date.now(), text});
  job.activity = job.activity.slice(-150);
}

export function trackEvent(job, type, data) {
  if (type === 'progress') {
    const sampling = String(data.node) === '14';
    recordActivity(job, `${sampling ? 'Iteration' : 'Stage progress'} ${data.value} of ${data.max} · ${job.stage || 'Processing'}`);
    job.lastProgressAt = Date.now();
  } else if (['execution_start', 'executing'].includes(type) && (data.node || type === 'execution_start')) {
    recordActivity(job, job.stage || 'Starting');
  }
}

export function trackFinish(job, state, error) {
  const text = state === 'done' ? 'Completed successfully' : state === 'cancelled' ? 'Cancelled' : `Failed: ${error || 'The backend did not provide error details.'}`;
  recordActivity(job, text);
  if (state !== 'error' || job.failureNotified) return;
  job.failureNotified = true;
  const detail = String(error || 'The backend did not provide error details.');
  const advice = /out of memory|allocation|cuda.*memory/i.test(detail)
    ? 'Try a smaller image or shorter clip, then retry.'
    : /connection|restart|history|queue/i.test(detail)
      ? 'Check that ComfyUI is running and check the queue before retrying.'
      : 'Check the error below, adjust your settings, then retry.';
  message.textContent = `Generation failed (${new Date(job.created).toLocaleTimeString()}). ${advice}\n${detail}`;
  alert.hidden = false;
}

export function renderTracking(job) {
  renderGallery(job?.id);
  const entries = job?.activity || [];
  const next = JSON.stringify([job?.id, job?.state, job?.step, entries]);
  if (next === signature) return;
  signature = next;
  current.textContent = !job ? 'Start a generation to see live updates.'
    : job.step ? `Current stage: ${job.step.value} / ${job.step.max}`
    : job.stage || 'Waiting for progress';
  log.replaceChildren();
  for (const entry of entries.slice().reverse()) {
    const item = document.createElement('li');
    item.textContent = `${new Date(entry.time).toLocaleTimeString()} · ${entry.text}`;
    log.append(item);
  }
  if (!entries.length) {
    const item = document.createElement('li');
    item.textContent = 'Live iterations appear while sampling. Loading models may not report steps.';
    log.append(item);
  }
}
renderTracking(null);
