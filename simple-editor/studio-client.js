// Managed studio client: authenticated calls to the studio_jobs backend.
// Legacy pages keep their own code paths; this module only serves the
// explicitly managed buttons. Token is pasted once and kept in sessionStorage.
const TOKEN_KEY = 'studio-token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

let csrf = '';

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (csrf && (options.method || 'GET') !== 'GET') headers['X-Studio-CSRF'] = csrf;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(data.message || data.code || `HTTP ${response.status}`);
    e.code = data.code;
    e.status = response.status;
    throw e;
  }
  return data;
}

export async function login(token) {
  const r = await api('/studio/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  csrf = r.csrf;
  setToken(token);
  return r;
}

export async function ensureAuth(tokenInput) {
  if (csrf) return true;
  const t = (tokenInput && tokenInput.value) || getToken();
  if (!t) throw new Error('Paste the local studio token first (explicit setup).');
  await login(t.trim());
  return true;
}

export async function status() {
  return api('/studio/status');
}

export async function startJob(body) {
  return api('/studio/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function jobStatus(id) {
  return (await api(`/studio/jobs/${id}`)).job;
}

export async function jobResult(id) {
  return (await api(`/studio/jobs/${id}/result`)).job;
}

export async function cancelJob(id) {
  return api(`/studio/jobs/${id}/cancel`, { method: 'POST' });
}

export function artifactUrl(a) {
  return `/studio/artifacts/${a.artifact_id}/content`;
}

export async function pollJob(id, onUpdate, timeoutS) {
  const t0 = Date.now();
  for (;;) {
    const job = await jobStatus(id);
    onUpdate(job);
    if (['succeeded', 'failed', 'cancelled', 'timed_out', 'stale', 'unknown'].includes(job.state)) return job;
    if ((Date.now() - t0) / 1000 > timeoutS) throw new Error('Client-side wait timed out; the job may still be running.');
    await new Promise(r => setTimeout(r, 1000));
  }
}
