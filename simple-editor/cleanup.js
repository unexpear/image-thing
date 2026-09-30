export async function setupCleanup() {
  const director = document.createElement('a'); director.href='/qwen-editor/director.html'; director.textContent='Cartoon Director';
  (document.querySelector('.header-right') || document.querySelector('.mode-links')).prepend(director);
  if(new URLSearchParams(location.search).get('director')==='1'){
    const brief=sessionStorage.getItem('studio-director-brief')||'';
    const note=document.createElement('details');note.className='settings';note.open=true;const title=document.createElement('summary');title.textContent='Director shot brief';const content=document.createElement('p');content.textContent=brief;note.append(title,content);document.querySelector('main').prepend(note);

  }
  if (!location.pathname.endsWith('/mesh.html')) {
    const link = document.createElement('a'); link.href = '/qwen-editor/mesh.html'; link.textContent = '3D';
    (document.querySelector('.header-right') || document.querySelector('.mode-links')).prepend(link);
  }
  let epoch = '0';
  try {
    const response = await fetch('/studio/media-status', {cache: 'no-store'});
    if (!response.ok) throw new Error('Cleanup service unavailable');
    epoch = (await response.json()).epoch;
  } catch { /* The editor remains usable while the backend restarts. */ }
  if (epoch !== '0') {
    for (const key of Object.keys(localStorage)) {
      if ((key.startsWith('qwen-studio-v1') || key.startsWith('studio-video-v1') || key.startsWith('studio-mesh-v1')) && !key.includes(`-${epoch}`)) localStorage.removeItem(key);
    }
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'clear-media';
  button.textContent = 'Clear unused photos & generations';
  button.title = 'Delete media except files referenced by loaded Director projects or disk snapshots. Open older projects in Director first so their references are registered.';
  const message = document.createElement('span');
  message.setAttribute('role', 'status');
  message.className = 'hint';
  (document.querySelector('.header-right') || document.querySelector('.mode-links')).append(button, message);
  button.onclick = async () => {
    // Generated voice takes live only in the input folder, so a shot that uses
    // one keeps its reference and loses its audio. Say so before deleting.
    if (!confirm('Delete unused photos, generations and voice recordings?\n\nMedia referenced by projects in this browser or registered disk snapshots is kept. Open older projects from other browser profiles in Director first to register them.')) return;
    button.disabled = true;
    button.textContent = 'Clearing…';
    try {
      const projects=JSON.parse(localStorage.getItem('studio-director-v1')||'[]');
      const response = await fetch('/studio/clear-media', {method: 'POST', headers: {'X-Studio-Cleanup': '1','Content-Type':'application/json'},body:JSON.stringify({projects})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not clear media.');
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('qwen-studio-v1') || key.startsWith('studio-video-v1') || key.startsWith('studio-mesh-v1')) localStorage.removeItem(key);
      }
      sessionStorage.setItem('studio-cleanup-result', `${result.deleted} media files deleted.${result.failed ? ` ${result.failed} could not be deleted; close apps using them and try again.` : ''}`);
      location.reload();
    } catch (error) {
      message.textContent = error.message;
      button.disabled = false;
      button.textContent = 'Clear unused photos & generations';
    }
  };
  message.textContent = sessionStorage.getItem('studio-cleanup-result') || '';
  sessionStorage.removeItem('studio-cleanup-result');
  setInterval(async () => {
    try {
      const response = await fetch('/studio/media-status', {cache: 'no-store'});
      if (response.ok && (await response.json()).epoch !== epoch) location.reload();
    } catch {}
  }, 3000);
  return epoch === '0' ? '' : `-${epoch}`;
}

export function applyDirectorBrief(){if(new URLSearchParams(location.search).get("director")!=="1")return;const prompt=document.getElementById("prompt")||document.getElementById("description");if(prompt){prompt.value=sessionStorage.getItem("studio-director-brief")||"";prompt.dispatchEvent(new Event("input"));}}
