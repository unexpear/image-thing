import {setupCleanup} from './cleanup.js';
import {finishingOptions, finishGraph, renderFinishing} from './mesh-finishing.js';
import {trackEvent, trackFinish, renderTracking} from './tracking.js';
import {fillModelSelect} from './studio-model-choice.js';
const epoch = await setupCleanup(), key = 'studio-mesh-v1' + epoch;
const $ = id => document.getElementById(id);
document.querySelector('.iteration-gallery').parentElement.hidden = true;
const checkpoint = 'hunyuan3d-dit-v2-mv-turbo.safetensors';
let jobs = []; try { jobs = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
let selected = jobs[0]?.id, submitting = false, online = false, ready = false, polling = false;
const client = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, client);
const active = job => ['queued','running','submitting','unknown','cancelling'].includes(job.state);
const stages = {'1':'Loading 3D model','2':'Preparing sampler','6':'Combining reference views','7':'Preparing guidance','8':'Preparing geometry','14':'Generating shape','15':'Decoding geometry','16':'Building mesh','17':'Reducing polygons','18':'Smoothing normals','19':'Saving GLB','20':'Unwrapping UVs on CPU','22':'Applying texture','23':'Checking geometry','24':'Saving collision box','25':'Resizing texture','26':'Styling material'};
const view = file => '/view?' + new URLSearchParams(file);
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {cache:'no-store'} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result = await response.json();
  if (!response.ok) { const e = new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result)); e.rejected = true; throw e; }
  return result;
}
function error(text='') {$('mesh-error').textContent=text; $('mesh-error').hidden=!text;}
function changed() { localStorage.setItem(key,JSON.stringify(jobs.slice(0,30))); render(); }
function finish(job,state,message) {trackFinish(job,state,message); job.state=state; job.error=message; job.ended=Date.now(); job.stage=state==='done'?'Mesh ready':state==='cancelled'?'Cancelled':'Mesh failed'; delete job.step;}
function render() {
  const job=jobs.find(j=>j.id===selected); renderTracking(job);
  renderFinishing(job,view);
  $('create-mesh').disabled=!online||!ready||submitting;
  $('mesh-state').textContent=job?.state||'Ready';
  const busy=job&&active(job); $('mesh-working').hidden=!busy; $('mesh-cancel').hidden=!busy;
  $('mesh-stage').textContent=(job?.stage||'Waiting') + (job ? ` · ${Math.floor(((job.ended||Date.now())-job.created)/1000)}s`:'');
  const progress=$('mesh-progress'); if(job?.step&&busy){progress.max=job.step.max;progress.value=job.step.value;}else if(busy)progress.removeAttribute('value');else{progress.max=1;progress.value=job?.state==='done'?1:0;}
  const url=job?.output?view(job.output):null;
  if(url&&$('mesh-viewer').getAttribute('src')!==url)$('mesh-viewer').setAttribute('src',url);
  if(!url)$('mesh-viewer').removeAttribute('src');
  $('mesh-download').hidden=!url; if(url)$('mesh-download').href=url;
  $('mesh-history').replaceChildren();
  for(const j of jobs){const button=document.createElement('button');button.type='button';button.textContent=`${new Date(j.created).toLocaleTimeString()} · ${j.state}`;button.onclick=()=>{selected=j.id;error(j.error||'');render();};$('mesh-history').append(button);}
}
export function buildGraph(images, options) {
  const graph = {
    '1':{class_type:'ImageOnlyCheckpointLoader',inputs:{ckpt_name:($('mesh-model-custom')?.value||'').trim()||$('mesh-model')?.value||checkpoint}},
    '2':{class_type:'ModelSamplingAuraFlow',inputs:{model:['1',0],shift:1}},
    '6':{class_type:'Hunyuan3Dv2ConditioningMultiView',inputs:{}},
    '7':{class_type:'FluxGuidance',inputs:{conditioning:['6',0],guidance:3.5}},
    '8':{class_type:'EmptyLatentHunyuan3Dv2',inputs:{resolution:3072,batch_size:1}},
    '14':{class_type:'KSampler',inputs:{model:['2',0],seed:options.seed,steps:options.steps,cfg:1,sampler_name:'euler',scheduler:'normal',positive:['7',0],negative:['6',1],latent_image:['8',0],denoise:1}},
    '15':{class_type:'VAEDecodeHunyuan3D',inputs:{samples:['14',0],vae:['1',2],num_chunks:4000,octree_resolution:options.detail}},
    '16':{class_type:'VoxelToMesh',inputs:{voxel:['15',0],algorithm:'surface net',threshold:0.6}},
    '17':{class_type:'DecimateMesh',inputs:{mesh:['16',0],target_face_count:options.faces,placement_mode:'midpoint'}},
    '18':{class_type:'MeshSmoothNormals',inputs:{mesh:['17',0],crease_angle:60}},
    '19':{class_type:'SaveGLB',inputs:{mesh:['18',0],filename_prefix:'Qwen-Studio/3D/asset'}}
  };
  Object.entries(images).forEach(([angle,name],i)=>{const load=String(30+i*2),encode=String(31+i*2);graph[load]={class_type:'LoadImage',inputs:{image:name}};graph[encode]={class_type:'CLIPVisionEncode',inputs:{clip_vision:['1',1],image:[load,0],crop:'none'}};graph['6'].inputs[angle]=[encode,0];});
  return finishGraph(graph, options);
}
$('mesh-form').onsubmit=async event=>{
  event.preventDefault();if(submitting||!ready||!online)return;submitting=true;error();render();
  let job;
  try {
    const images={};
    for(const angle of ['front','left','back','right']){const file=$(angle).files[0];if(!file)continue;if(file.size>30*1024*1024)throw Error('Use references under 30 MB.');const form=new FormData();form.append('image',file);form.append('subfolder','studio-3d');form.append('type','input');const response=await fetch('/upload/image',{method:'POST',body:form});if(!response.ok)throw Error('Reference upload failed.');const uploaded=await response.json();images[angle]=[uploaded.subfolder,uploaded.name].filter(Boolean).join('/');}
    if(!images.front)throw Error('Choose a front reference.');
    const options={detail:Number($('detail').value),faces:Number($('faces').value),steps:Number($('steps').value),seed:$('seed3d').value===''?crypto.getRandomValues(new Uint32Array(1))[0]:Number($('seed3d').value)};
    Object.assign(options, await finishingOptions());
    job={id:crypto.randomUUID(),created:Date.now(),state:'submitting',stage:'Sending mesh job',options}; jobs.unshift(job);selected=job.id;changed();
    await api('/prompt',{prompt_id:job.id,client_id:client,prompt:buildGraph(images,options),extra_data:{studio_mesh:true}});
    if(job.state==='submitting'){job.state='queued';job.stage='Waiting in queue';}
  }catch(e){if(job){if(e.rejected)finish(job,'error',e.message);else{job.state='unknown';job.stage='Checking submission status';}}error(e.message);}
  finally{submitting=false;changed();}
};
$('mesh-cancel').onclick=async()=>{const job=jobs.find(j=>j.id===selected);if(!job||!active(job))return;try{const result=await api('/api/jobs/'+job.id+'/cancel',{});if(result.cancelled&&job.state==='queued')finish(job,'cancelled');else{job.state='cancelling';job.stage='Stopping';}changed();}catch(e){error(e.message);}};
$('mesh-viewer').addEventListener('error',()=>error('The 3D preview could not load. You can still download the GLB and inspect it in Blender.'));
function absorb(job,history){const failure=history.status?.messages?.find(([type])=>['execution_error','execution_interrupted'].includes(type));if(failure){finish(job,failure[0]==='execution_interrupted'?'cancelled':'error',failure[1].exception_message);return;}const output=history.outputs?.['19']?.['3d']?.[0];job.collision=history.outputs?.['24']?.['3d']?.[0];job.checks=history.outputs?.['23']?.studio_mesh_report?.[0];if(output){job.output=output;finish(job,'done');}else if(history.status?.completed)finish(job,'error','No mesh was produced. Try a clearer isolated reference.');}
async function poll(){if(polling)return;polling=true;try{const queue=await api('/queue');online=true;$('connection').textContent='Connected';$('mesh-queue').textContent=`${queue.queue_running.length} running · ${queue.queue_pending.length} queued`;
  for(const job of jobs.filter(active)){if(queue.queue_running.some(row=>row[1]===job.id)){if(job.state!=='cancelling')job.state='running';}else if(queue.queue_pending.some(row=>row[1]===job.id)){job.state='queued';job.stage='Waiting in queue';}else{const history=await api('/history/'+job.id);if(history[job.id])absorb(job,history[job.id]);else if(Date.now()-job.created>30000)finish(job,job.state==='cancelling'?'cancelled':'error','Job is absent from the queue and history. ComfyUI may have restarted.');}}
}catch{online=false;$('connection').textContent='Reconnecting…';}finally{polling=false;changed();}}
function connect(){const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws?clientId=${client}`);ws.onclose=()=>setTimeout(connect,3000);ws.onerror=()=>ws.close();ws.onmessage=e=>{if(typeof e.data!=='string')return;const {type,data}=JSON.parse(e.data);const job=jobs.find(j=>j.id===data?.prompt_id);if(!job)return;
if(type==='executing'&&data.node){job.stage=stages[data.node]||'Reading reference';delete job.step;}if(type==='progress'){job.state='running';job.step={value:data.value,max:data.max};job.stage=stages[data.node]||'Processing mesh';}if(type==='execution_error')finish(job,'error',data.exception_message);if(type==='execution_interrupted')finish(job,'cancelled');if(type==='execution_success')poll();trackEvent(job,type,data);changed();};}
async function init(){try{const info=await api('/object_info');const required=['ImageOnlyCheckpointLoader','Hunyuan3Dv2ConditioningMultiView','DecimateMesh','MeshSmoothNormals','SaveGLB','UnwrapMesh','ApplyTextureToMesh','StudioMeshExportCheck','StudioMeshStyle'];ready=required.every(name=>info[name])&&info.ImageOnlyCheckpointLoader.input.required.ckpt_name[0].includes(checkpoint);$('setup-status').textContent=ready?'Local model installed · GPU shared with images and video':'3D setup incomplete. Model or required nodes are missing.';if($('mesh-model'))await fillModelSelect($('mesh-model'),{request:api,lists:[{node:'ImageOnlyCheckpointLoader',field:'ckpt_name'}],slot:'mesh',fallback:checkpoint,note:$('mesh-model-hint')});}catch(e){error(e.message);}connect();await poll();}
setInterval(poll,3000);setInterval(render,1000);init();

// Managed Blender processing via the studio_jobs backend (all server
// features default off; these controls only submit when explicitly used).
(async () => {
  try {
    const anchor = $('mesh-download').parentElement;
    const box = document.createElement('details');
    box.className = 'settings';
    box.innerHTML = `<summary>Managed Blender processing <span>Optional</span></summary>
      <label class="field">Local studio token (explicit setup)<input id="m-token" type="password" autocomplete="off" placeholder="paste once per tab"></label>
      <label class="field">Preset<select id="m-preset"><option value="preserve">preserve · no changes</option><option value="hunyuan_cleanup_unwrap">hunyuan_cleanup_unwrap · weld + UVs where absent</option></select></label>
      <label class="field"><span><input type="checkbox" id="m-decimate"> Decimate to budget</span></label>
      <label class="field">Triangle budget<input id="m-tris" type="number" value="100000" min="1" max="2000000"></label>
      <label class="field"><span><input type="checkbox" id="m-recenter"> Recenter to origin</span><span><input type="checkbox" id="m-scale"> Apply object scale</span><span><input type="checkbox" id="m-uvreplace"> Replace existing UVs</span></label>
      <p class="hint">Registers the selected raw mesh, then runs Blender headless on this computer. Nothing starts automatically; the raw output is never replaced.</p>
      <div class="result-actions"><button type="button" id="m-register">1 · Register raw output</button><button type="button" id="m-post">2 · Post-process in Blender</button><button type="button" id="m-render">3 · Render preview</button></div>
      <div id="m-status" class="hint" role="status"></div><div id="m-links" class="hint"></div>`;
    anchor.after(box);
    const client = await import('./studio-client.js');
    const say = t => { $('m-status').textContent = t; };
    const links = items => {
      $('m-links').replaceChildren();
      for (const a of items) {
        const el = document.createElement('a');
        el.href = client.artifactUrl(a); el.textContent = `Download ${a.filename} ↓`;
        el.className = 'download'; el.setAttribute('download', '');
        $('m-links').append(el, document.createElement('br'));
      }
    };
    let sourceArtifact = null;
    $('m-token').value = client.getToken();
    $('m-token').onchange = e => client.setToken(e.target.value.trim());
    async function auth() {
      await client.ensureAuth($('m-token'));
      const s = await client.status();
      if (!s.features.jobs_enabled || !s.features.blender_enabled)
        throw new Error('Managed Blender is disabled on the backend.');
      return s;
    }
    $('m-register').onclick = async () => {
      try {
        say('Registering…');
        const s = await auth();
        const job = jobs.find(j => j.id === selected);
        if (!job || job.state !== 'done' || !job.output) throw new Error('Select a completed raw mesh first.');
        const r = await client.api('/studio/artifacts/from-history', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt_id: job.id, node_id: '19', index: 0 }),
        });
        sourceArtifact = r.artifact.artifact_id;
        say(`Registered ${r.artifact.filename} (${(r.artifact.size / 1024).toFixed(0)} KB). Epoch ${s.epoch}.`);
      } catch (e) { say('Register failed: ' + e.message); }
    };
    async function runKind(kind, parameters, timeoutS, label) {
      const s = await auth();
      if (!sourceArtifact) throw new Error('Register the raw output first (step 1).');
      const { job } = await client.startJob({
        schema_version: 1, kind, expected_epoch: s.epoch,
        idempotency_key: crypto.randomUUID(), parameters,
      });
      say(`${label} accepted ${job.job_id.slice(0, 8)}…`);
      const done = await client.pollJob(job.job_id, j => say(`${label}: ${j.state}…`), timeoutS);
      if (done.state !== 'succeeded') throw new Error(`${label} ended: ${done.state} ${done.error?.message || ''}`);
      const full = await client.jobResult(job.job_id);
      links(full.result.artifacts);
      say(`${label} complete: ${full.result.artifacts.length} artifact(s). Raw output untouched.`);
    }
    $('m-post').onclick = async () => {
      try {
        const ops = {};
        if ($('m-decimate').checked) ops.decimate_target = Math.max(1, Number($('m-tris').value) || 100000);
        if ($('m-recenter').checked) ops.recenter = true;
        if ($('m-scale').checked) ops.apply_scale = true;
        if ($('m-uvreplace').checked) ops.uv_replace = true;
        await runKind('blender_post', { source_artifact_id: sourceArtifact, preset: $('m-preset').value, ops }, 700, 'Post-process');
      } catch (e) { say('Post-process failed: ' + e.message); }
    };
    $('m-render').onclick = async () => {
      try {
        await runKind('blender_render', { source_artifact_id: sourceArtifact }, 400, 'Render preview');
      } catch (e) { say('Render failed: ' + e.message); }
    };
  } catch { /* managed UI unavailable; legacy mesh flow unaffected */ }
})();
