import { ensureAuth, startJob, pollJob, artifactUrl, getToken } from './studio-client.js';

const $ = id => document.getElementById(id);
$('p-token').value = getToken();
$('p-token').onchange = e => sessionStorage.setItem('studio-token', e.target.value.trim());

function error(t = '') { $('param-error').textContent = t; $('param-error').hidden = !t; }

function dims(recipe) {
  const parts = $('p-dims').value.split(/[x,;]/).map(s => Number(s.trim())).filter(v => Number.isFinite(v));
  if (recipe === 'box' || recipe === 'display_plinth') {
    if (parts.length !== 3) throw new Error('Enter W x H x D.');
    return { width: parts[0], height: parts[1], depth: parts[2] };
  }
  if (recipe === 'sphere') {
    if (parts.length < 1) throw new Error('Enter radius.');
    const p = { radius: parts[0] };
    const sg = $('p-segs').value.split(/[x,;]/).map(s => Number(s.trim())).filter(v => Number.isInteger(v));
    if (sg[0]) p.lon = sg[0];
    if (sg[1]) p.lat = sg[1];
    return p;
  }
  if (recipe === 'cylinder') {
    if (parts.length !== 2) throw new Error('Enter radius x height.');
    const p = { radius: parts[0], height: parts[1] };
    const sg = Number($('p-segs').value.trim());
    if (Number.isInteger(sg)) p.radial = sg;
    return p;
  }
  if (parts.length !== 2) throw new Error('Enter W x D.');
  return { width: parts[0], depth: parts[1] };
}

$('param-form').onsubmit = async e => {
  e.preventDefault();
  error();
  $('p-build').disabled = true;
  $('p-state').textContent = 'Working';
  try {
    await ensureAuth($('p-token'));
    const recipe = $('p-recipe').value;
    const { job } = await startJob({ schema_version: 1, kind: 'parametric_mesh',
      expected_epoch: (await (await import('./studio-client.js')).status()).epoch,
      idempotency_key: crypto.randomUUID(),
      parameters: { recipe_id: recipe, parameters: dims(recipe) } });
    const done = await pollJob(job.job_id, j => { $('p-state').textContent = j.state; }, 150);
    if (done.state !== 'succeeded') throw new Error(`Ended: ${done.state} ${done.error?.message || ''}`);
    const full = await (await import('./studio-client.js')).jobResult(job.job_id);
    const arts = full.result.artifacts;
    const glb = arts.find(a => a.kind === 'glb');
    const rec = arts.find(a => a.filename === 'recipe.json');
    $('p-viewer').setAttribute('src', artifactUrl(glb));
    $('p-download').hidden = false; $('p-download').href = artifactUrl(glb);
    if (rec) { $('p-recipe').hidden = false; $('p-recipe').href = artifactUrl(rec); }
    $('p-stats').textContent = `${recipe}: ${arts.length} artifact(s). Reproducible under generator ${glb.sha256.slice(0, 12)}…`;
    $('p-state').textContent = 'Ready';
  } catch (err) { error(err.message); $('p-state').textContent = 'Failed'; }
  finally { $('p-build').disabled = false; }
};
