import {shotBrief} from './director-project.js';
import {compileFeatureScript,expressionScriptLines} from './director-features.js';
import {applyPrototypeDraft} from './director-prototype.js';
import {assistantDraftLabel,buildAssistantDraft,findAssistantDraft,recordAssistantDraft,setAssistantDraftStatus,ASSISTANT_DRAFT_FILTERS,listAssistantDrafts,summarizeAssistantDrafts,clearDecidedAssistantDrafts,clearableDecidedAssistantDraftCount,assistantTextApplyGate,assistantShotApplyGate,assistantAudioApplyGate,assistantScriptApplyGate} from './director-assistant-drafts.js';
import {buildVoiceTake,recordVoiceTake,findVoiceTake,promoteVoiceTake,setVoiceTakeStatus,setVoiceTakeLabel,setVoiceTakeNote,duplicateVoiceTake,voiceTakeLabel,collectVoiceKeepNames,orphanVoiceFiles,linkOrphanVoiceFile,orphanDiscardConfirm,summarizeOrphanDiscard,crossEpisodeVoiceKeepRefs,formatCrossEpisodeKeepNote,VOICE_TAKE_FILTERS,listVoiceTakes,summarizeVoiceTakes,clearRejectedVoiceTakes,clearDecidedVoiceTakes,clearableRejectedVoiceTakeCount,clearableDecidedVoiceTakeCount} from './director-voice-takes.js';
export function createDirectorAssistant(parent,{getProject,getScene,getLibrary,change,upload,tell,download}){
 const panel=document.createElement('details');panel.className='settings';panel.innerHTML=`<summary>Local creative assistants</summary><p class="hint">Draft a shot, write with a local model, generate spoken dialogue with Kokoro, or transcribe uploaded dialogue. Suggestions stay editable until you apply them. Planning, writing, speech and transcription take turns with Studio generation. Writing guides supply reusable production instructions.</p><label class="field">Assistant task<select aria-label="Assistant task"><option value="shot">Plan a shot · Bonsai</option><option value="write">Writing assistant</option><option value="voice">Generate speech · Kokoro</option><option value="transcribe">Transcribe audio · R2T2</option></select></label><label class="field" data-shot-model>Shot planner<select aria-label="Shot planner"><option value="bonsai">Bonsai · recommended</option><option value="needle">Needle · experimental extraction</option></select></label><label class="field" data-skill hidden>Writing guide<select aria-label="Writing guide"><option value="general">General cartoon writing</option><option value="trailer">Trailer beats & timing</option><option value="continuity">Character continuity review</option><option value="animation">Animation timing and face tools</option><option value="asset">3D asset planning · staged build</option><option value="prototype">Story and character prototype</option></select></label><label class="field" data-guide-stage hidden>Guide stage<select aria-label="Guide stage"><option value="plan">Plan</option><option value="camera">Camera</option><option value="body">Body</option><option value="face">Face</option><option value="draw">Draw</option><option value="review">Review</option></select></label><p class="hint" data-guide-note hidden>Only this stage is sent. A stage marked finished on the target shot is left out. The project keeps the work.</p><p class="hint" data-asset-note hidden>Text-only asset planning inspired by img2threejs: parts, materials, pivots, rig needs and build checks. Describe the object and intended use. This creates a brief, not a mesh or a visual assessment.</p><label class="field" data-model hidden>Writing model<select aria-label="Writing model"><option value="bonsai">Bonsai 2 · recommended</option><option value="occamy">Occamy · alternate, slower</option><option value="zgcm">ZGCM · short reasoning</option></select></label><label class="field">Target shot<select aria-label="Assistant target shot"></select></label><label class="field" data-engine hidden>Speech engine<select aria-label="Speech engine"><option value="kokoro">Kokoro · fast, even read</option><option value="chatterbox">Chatterbox · acted, about 10x slower</option></select></label><p class="hint" data-engine-note hidden></p><label class="field" data-voice hidden>Voice<select aria-label="Speech voice"><option value="bm_george">George · British male</option><option value="af_heart">Heart · American female</option><option value="am_michael">Michael · American male</option><option value="bf_emma">Emma · British female</option></select></label><label class="field" data-speed hidden>Speech speed<input aria-label="Speech speed" type="number" min="0.5" max="1.5" step="0.05" value="0.9"></label><label class="field" data-delivery hidden>Delivery<input aria-label="Speech delivery" type="number" min="0" max="1.5" step="0.05" value="0.5"></label><label class="field" data-pacing hidden>Pacing<input aria-label="Speech pacing" type="number" min="0.1" max="1" step="0.05" value="0.5"></label><label class="field" data-reference hidden>Reference voice <span>Optional</span><input aria-label="Speech reference" type="file" accept=".wav,.flac,.mp3,.ogg,.m4a"></label><p class="hint" data-reference-note hidden>A few seconds of speech is enough. Chatterbox copies that voice, so different characters can share one engine. Leave empty for its own voice.</p><label class="field" data-prompt>Request<textarea aria-label="Assistant request" maxlength="6000" rows="4" placeholder="Character: Mira. Setting: observatory. Action: waving. Duration: 6 seconds."></textarea></label><label class="field" data-audio hidden>Audio to transcribe<input aria-label="Assistant audio" type="file" accept=".wav,.flac,.mp3,.ogg,.m4a"></label><p class="hint" data-audio-note hidden>Audio under 100 MB. Transcript text only; no automatic speaker labels, word timing or lip-sync. Split long recordings into short takes.</p><div class="actions" data-voice-tools hidden><button type="button" data-clean-voices>Remove unused voice takes</button></div><div class="actions"><button type="button" data-context>Use target shot brief</button><button type="button" data-run>Create draft</button><button type="button" data-cancel hidden>Cancel assistant</button></div><span class="activity-spinner" data-spinner hidden aria-hidden="true"></span><p role="status" data-status>Ready. No model runs until you request a draft.</p><div data-result hidden><audio data-voice-preview controls hidden></audio><button type="button" data-apply-audio hidden>Attach generated voice to target shot</button><label class="field">Editable result<textarea aria-label="Assistant result" rows="8"></textarea></label><button type="button" data-download>Download draft text</button><fieldset data-asset-save hidden><legend>Save this build brief</legend><label class="field">Asset name<input aria-label="Planned asset name" maxlength="200" required aria-describedby="planned-asset-status"></label><label class="field">Asset type<select aria-label="Planned asset type"><option value="prop">Prop</option><option value="character">Character</option><option value="set">Set</option></select></label><p class="hint">Review the editable result first. This adds a new library brief; geometry and rigging still need to be built.</p><button type="button" data-save-asset>Save brief to asset library</button><p id="planned-asset-status" role="status"></p></fieldset><div data-shot hidden><label class="field">Suggested shot title<input aria-label="Suggested shot title" maxlength="200"></label><label class="field">Suggested duration (seconds)<input aria-label="Suggested shot duration" type="number" min="1" max="3600"></label><p class="hint">Check character, location, duration and action carefully: extraction can mix up fields. Explicit labels in your request work best.</p></div><div class="actions"><button type="button" data-apply-script>Write expression script on target shot</button><button type="button" data-apply-prototype>Write prototype from draft</button><button type="button" data-apply-shot>Add suggested shot</button><button type="button" data-apply-outline>Replace episode outline</button><button type="button" data-apply-action>Replace shot action</button><button type="button" data-apply-dialogue>Replace shot dialogue</button><button type="button" data-apply-subtitle>Replace shot subtitle</button></div><p class="hint">Use project Undo to restore replaced text. Download project backups to keep your work.</p></div>
<details data-inbox><summary>Draft inbox</summary>
<p class="hint">Completed drafts stay with this project across reloads. Restore one into the editable result, then apply. Accept or reject keeps a durable history (source brief, model, guide). Filter by status or kind; Clear decided removes accepted/rejected rows and frees inbox slots (pending kept).</p>
<label class="field assistant-draft-filter">Inbox filter<select aria-label="Draft inbox filter"></select></label>
<p class="hint" data-inbox-summary role="status"></p>
<div class="actions"><button type="button" data-clear-decided-drafts>Clear decided drafts</button></div>
<div data-inbox-list role="list"></div>
<p class="hint" data-inbox-empty>No saved drafts yet. Finished assistant jobs appear here.</p>
</details>
<details data-takes><summary>Voice take library</summary>
<p class="hint">Generated speech stays here across reloads, beyond the one shot.audio attachment and the mixed draft inbox. Restore loads a take into the preview; Promote attaches it to the target shot; Rename / Note keep artist labels and production notes on the take; Duplicate clones the take onto the same audio file with a new id and "… (copy)" label (status resets to library; note preserved; no re-upload). Filter by status; Clear rejected removes rejected rows (takes still linked to a shot stay); Clear decided also drops unlinked promoted history (library kept; shot-linked takes stay) to free the 48-take cap. Remove unused voice takes still deletes WAVs that nothing references. Orphan disk rows list studio-voices WAVs this project does not reference — Link adds a library take; Discard deletes the file after confirm (disk project snapshots stay protected).</p><label class="field voice-take-filter">Take filter<select aria-label="Voice take library filter"></select></label>
<p class="hint" data-takes-summary role="status"></p>
<div class="actions"><button type="button" data-clear-rejected-takes>Clear rejected takes</button><button type="button" data-clear-decided-takes>Clear decided takes</button></div>

<div data-takes-list role="list"></div>
<p class="hint" data-takes-empty>No saved voice takes yet. Finished speech jobs appear here.</p>
<div data-orphans>
<p class="hint"><strong>On disk · not linked</strong> — WAVs under ComfyUI input/studio-voices missing from this project's takes, drafts, and shot audio. Rows still used by another loaded episode show a keep-ref note (Discard stays blocked). Link keeps the file and adds a durable library row. Discard removes one orphan after confirm; checkboxes + Discard selected batch-delete with one confirm (disk snapshots stay protected).</p>
<div class="actions"><button type="button" data-refresh-orphans>Refresh disk listing</button><button type="button" data-select-all-orphans>Select all orphans</button><button type="button" data-clear-orphan-selection>Clear selection</button><button type="button" data-discard-selected-orphans>Discard selected</button></div>
<div data-orphans-list role="list"></div>
<p class="hint" data-orphans-empty>No orphan voice files on disk (or listing unavailable).</p>
</div>
</details>`;
 parent.before(panel);const q=s=>panel.querySelector(s),task=q('[aria-label="Assistant task"]'),model=q('[aria-label="Writing model"]'),shotModel=q('[aria-label="Shot planner"]'),skill=q('[aria-label="Writing guide"]'),target=q('[aria-label="Assistant target shot"]'),prompt=q('[aria-label="Assistant request"]'),audio=q('[aria-label="Assistant audio"]'),output=q('[aria-label="Assistant result"]'),status=q('[data-status]'),run=q('[data-run]'),cancel=q('[data-cancel]');let jobId=null,owner=null,resultKind=null,timer=null,busy=false,generatedAudio=null,savedAssetId=null,activeDraftId=null,activeTakeId=null;
 const chatBox=document.createElement('div');chatBox.dataset.chatBox='';chatBox.hidden=true;chatBox.innerHTML='<label class="field">Model source<select aria-label="Chat source"><option value="">Installed list</option><option value="ollama">Ollama</option><option value="lmstudio">LM Studio</option><option value="custom">Custom local server</option></select></label><label class="field">Model name<input aria-label="Custom chat model" maxlength="200" placeholder="Name in Ollama or LM Studio, or hf.co/org/model"></label><label class="field" data-chat-url hidden>Server URL<input aria-label="Custom chat URL" placeholder="http://127.0.0.1:8080/v1/chat/completions"></label><p class="hint">Ollama, LM Studio, llama.cpp, or another program on this computer. A Hugging Face chat model works when that program already has it. The story stays on this machine.</p>';q('[data-model]').after(chatBox);const chatSource=q('[aria-label="Chat source"]'),chatModel=q('[aria-label="Custom chat model"]'),chatUrl=q('[aria-label="Custom chat URL"]');chatSource.onchange=()=>{q('[data-chat-url]').hidden=chatSource.value!=='custom';};const fictionNote=document.createElement('p');fictionNote.className='hint';fictionNote.hidden=true;chatBox.after(fictionNote);
 const say=text=>{status.textContent=text;};
 function refresh(){const previous=target.value;target.replaceChildren(new Option('No target shot',''));for(const scene of getProject().scenes)for(const shot of scene.shots)target.add(new Option(scene.title+' / '+shot.title,shot.id));if([...target.options].some(o=>o.value===previous))target.value=previous;refreshInbox();refreshTakes();refreshOrphans();}
 function showDraft(draft,{announce=true}={}){
  if(!draft)return;
  activeDraftId=draft.id;resultKind=draft.kind;owner={project:getProject().id,scene:draft.sceneId||getScene()?.id,target:draft.targetShotId||'',skill:draft.skill||skill.value};if(draft.targetShotId&&[...target.options].some(o=>o.value===draft.targetShotId))target.value=draft.targetShotId;
  generatedAudio=draft.audio?{...draft.audio}:null;savedAssetId=null;
  output.value=draft.resultText||'';q('[data-result]').hidden=false;
  q('[data-voice-preview]').hidden=q('[data-apply-audio]').hidden=!generatedAudio;
  if(generatedAudio)q('[data-voice-preview]').src='/view?'+new URLSearchParams({filename:generatedAudio.name,subfolder:generatedAudio.subfolder||'',type:generatedAudio.type||'input'});
  q('[data-asset-save]').hidden=!(draft.kind==='write'&&draft.skill==='asset');
  q('#planned-asset-status').textContent='';q('[aria-label="Planned asset name"]').value='';q('[aria-label="Planned asset name"]').removeAttribute('aria-invalid');
  const proposed=draft.shot;q('[data-shot]').hidden=q('[data-apply-shot]').hidden=!proposed;q('[data-apply-outline]').hidden=!!proposed;
  for(const name of ['action','dialogue','subtitle'])q('[data-apply-'+name+']').hidden=!!proposed;
  if(proposed){q('[data-shot]').dataset.character=proposed.character||'';q('[data-shot]').dataset.setting=proposed.setting||'';q('[aria-label="Suggested shot title"]').value=((proposed.character||'')+' · '+(proposed.setting||'')).replace(/^ · | · $/g,'').trim()||'Suggested shot';q('[aria-label="Suggested shot duration"]').value=proposed.duration_seconds||'';if(proposed.action)output.value=proposed.action;}
  if(draft.request)prompt.value=draft.request;
  if(draft.kind)task.value=draft.kind;
  if(draft.kind==='write'&&draft.skill)skill.value=draft.skill;
  if(draft.kind==='write'&&draft.model)model.value=draft.model;
  if(draft.kind==='shot'&&draft.model)shotModel.value=draft.model;
  if(draft.stage)q('[aria-label="Guide stage"]').value=draft.stage;
  mode();
  if(announce)say('Restored draft · '+assistantDraftLabel(draft));
  refreshInbox();
  syncApplyButtons();
 }
 function persistCompletedJob(job){
  try{
   const proposed=job.result?.shot;
   const draft=buildAssistantDraft({
    kind:job.kind,model:owner?.model|| (job.kind==='shot'?shotModel.value:model.value),skill:owner?.skill,stage:owner?.stage,
    request:owner?.request||prompt.value,resultText:proposed?proposed.action:(job.result?.text||''),
    targetShotId:owner?.target,sceneId:owner?.scene,jobId:job.id||jobId,shot:proposed,audio:job.result?.audio,truncated:!!job.result?.truncated,
   });
   change(()=>{recordAssistantDraft(getProject(),draft);});
   activeDraftId=draft.id;
   if(job.kind==='voice'&&job.result?.audio)persistVoiceTake(job);
   return draft;
  }catch(e){say('Draft ready, but inbox save failed: '+e.message);return null;}
 }
 function markActive(status){
  if(!activeDraftId)return;
  const id=activeDraftId;
  try{change(()=>setAssistantDraftStatus(getProject(),id,status));}catch(e){say(e.message);}
 }
 function refreshInbox(){
  const host=q('[data-inbox-list]'),empty=q('[data-inbox-empty]'),summary=q('[data-inbox-summary]'),filterSel=q('[aria-label="Draft inbox filter"]');
  if(!host)return;
  if(filterSel&&!filterSel.options.length){
    for(const f of ASSISTANT_DRAFT_FILTERS)filterSel.add(new Option(f.label,f.id));
    filterSel.value='pending';
  }
  const filterId=filterSel?.value||'all';
  const counts=summarizeAssistantDrafts(getProject());
  if(summary){
    summary.textContent=counts.total
      ? (counts.pending+' pending · '+counts.accepted+' accepted · '+counts.rejected+' rejected · '+counts.total+' total'+(filterId!=='all'?' · showing '+filterId:''))
      : 'No drafts on this project yet.';
  }
  host.replaceChildren();
  const drafts=listAssistantDrafts(getProject(),filterId);
  empty.hidden=drafts.length>0;
  empty.textContent=counts.total&&!drafts.length
    ? 'No drafts match this filter.'
    : 'No saved drafts yet. Finished assistant jobs appear here.';
  for(const draft of drafts){
   const row=document.createElement('div');row.className='actions assistant-draft-row';row.setAttribute('role','listitem');row.dataset.status=draft.status;row.dataset.kind=draft.kind;
   if(draft.id===activeDraftId)row.dataset.active='1';
   const label=document.createElement('p');label.className='hint';label.textContent=assistantDraftLabel(draft);
   if(draft.targetShotId){
     const shotTitle=getProject().scenes.flatMap(s=>s.shots).find(s=>s.id===draft.targetShotId);
     const targetNote=document.createElement('p');targetNote.className='hint';targetNote.textContent='Target: '+(shotTitle?shotTitle.title:draft.targetShotId);
     if(draft.request){const brief=document.createElement('p');brief.className='hint';brief.textContent='Brief: '+(draft.request.length>160?draft.request.slice(0,157)+'…':draft.request);row.append(label,targetNote,brief);}else row.append(label,targetNote);
   }else if(draft.request){const brief=document.createElement('p');brief.className='hint';brief.textContent='Brief: '+(draft.request.length>160?draft.request.slice(0,157)+'…':draft.request);row.append(label,brief);}else row.append(label);
   const restore=document.createElement('button');restore.type='button';restore.textContent='Restore';restore.onclick=()=>{try{showDraft(findAssistantDraft(getProject(),draft.id)||draft);}catch(e){say(e.message);}};
   const accept=document.createElement('button');accept.type='button';accept.textContent='Accept';accept.disabled=draft.status==='accepted';accept.onclick=()=>{try{change(()=>setAssistantDraftStatus(getProject(),draft.id,'accepted'));say('Draft accepted. History stays on this project.');refreshInbox();}catch(e){say(e.message);}};
   const reject=document.createElement('button');reject.type='button';reject.textContent='Reject';reject.disabled=draft.status==='rejected';reject.onclick=()=>{try{change(()=>setAssistantDraftStatus(getProject(),draft.id,'rejected'));say('Draft rejected. History stays on this project.');refreshInbox();}catch(e){say(e.message);}};
   row.append(restore,accept,reject);host.append(row);
  }
  const clearDrafts=q('[data-clear-decided-drafts]');
  const clearableDrafts=clearableDecidedAssistantDraftCount(counts);
  if(clearDrafts){
    clearDrafts.disabled=!clearableDrafts;
    clearDrafts.title=clearableDrafts
      ? ('Remove '+clearableDrafts+' accepted/rejected draft'+(clearableDrafts===1?'':'s')+' (pending kept)')
      : 'No accepted or rejected drafts to clear.';
  }
 }


 function syncApplyButtons(){
  if(busy)return;
  const projectId=getProject().id;
  const ownerProjectId=owner?.project||'';
  const text=output.value;
  const targetId=owner?.target||'';
  const shotRecord=targetId?getProject().scenes.flatMap(x=>x.shots).find(s=>s.id===targetId):null;
  const targetShotExists=!!shotRecord;
  const setBtn=(el,gate)=>{if(!el)return;el.disabled=!gate.ok;el.title=gate.reason||'';};
  setBtn(q('[data-apply-outline]'),assistantTextApplyGate({text,ownerProjectId,currentProjectId:projectId}));
  for(const field of ['action','dialogue','subtitle']){
    setBtn(q('[data-apply-'+field+']'),assistantTextApplyGate({text,ownerProjectId,currentProjectId:projectId,requireTarget:true,targetShotId:targetId,targetShotExists}));
  }
  setBtn(q('[data-apply-shot]'),assistantShotApplyGate({
    title:q('[aria-label="Suggested shot title"]')?.value||'',
    seconds:q('[aria-label="Suggested shot duration"]')?.value,
    action:text,
    ownerProjectId,currentProjectId:projectId
  }));
  setBtn(q('[data-apply-audio]'),assistantAudioApplyGate({
    hasAudio:!!generatedAudio,
    targetShotId:targetId,
    targetShotExists,
    ownerProjectId,currentProjectId:projectId
  }));
  setBtn(q('[data-apply-script]'),assistantScriptApplyGate({
    text,
    hasRig:!!shotRecord?.rig3d,
    targetShotId:targetId,
    targetShotExists,
    ownerProjectId,currentProjectId:projectId
  }));
  const dl=q('[data-download]');
  if(dl){
    const empty=!String(text||'').trim();
    dl.disabled=empty;
    dl.title=empty?'The draft is empty.':'Download the editable result as text.';
  }
 }
 function mode(){const speech=task.value==='voice',acted=speech&&q('[aria-label="Speech engine"]').value==='chatterbox';q('[data-engine]').hidden=q('[data-voice-tools]').hidden=!speech;q('[data-voice]').hidden=q('[data-speed]').hidden=!speech||acted;q('[data-delivery]').hidden=q('[data-pacing]').hidden=q('[data-reference]').hidden=q('[data-reference-note]').hidden=!acted;const note=q('[data-engine-note]');note.hidden=!speech;note.textContent=acted?'Delivery runs 0 flat to 1.5 theatrical; 0.5 is natural. Lower pacing tightens a fast line. This engine takes about ten seconds per second of speech, and Studio generation keeps running while it works.':'Twenty-eight installed voices, read at an even level. Fast enough to iterate on.';q('[data-shot-model]').hidden=task.value!=='shot';q('[data-skill]').hidden=task.value!=='write';q('[data-model]').hidden=task.value!=='write';chatBox.hidden=task.value==='voice'||task.value==='transcribe';q('[data-guide-stage]').hidden=q('[data-guide-note]').hidden=task.value!=='write'||skill.value!=='animation';q('[data-asset-note]').hidden=task.value!=='write'||skill.value!=='asset';q('[data-apply-prototype]').hidden=task.value!=='write'||skill.value!=='prototype';q('[data-prompt]').hidden=task.value==='transcribe';q('[data-audio]').hidden=q('[data-audio-note]').hidden=task.value!=='transcribe';q('[data-context]').hidden=task.value==='transcribe';run.textContent=task.value==='transcribe'?'Transcribe audio':task.value==='voice'?'Generate speech':'Create draft';const dark=getProject().story?.fiction==='dark';fictionNote.hidden=!dark||speech||task.value==='transcribe';fictionNote.textContent='Dark fiction is on. Horror stays in the draft. If this model refuses, set Model source to an uncensored model already in Ollama or LM Studio.';}
 function lock(value){busy=value;for(const control of [task,model,shotModel,skill,target,prompt,audio,run,q('[data-context]'),q('[aria-label="Speech voice"]'),q('[aria-label="Speech speed"]'),q('[aria-label="Speech engine"]'),q('[aria-label="Speech delivery"]'),q('[aria-label="Speech pacing"]'),q('[aria-label="Speech reference"]')])control.disabled=value;cancel.hidden=!value||!jobId;q('[data-spinner]').hidden=!value;for(const b of q('[data-result]').querySelectorAll('button'))b.disabled=value;if(!value)syncApplyButtons();}
 function shot(){return getProject().scenes.flatMap(s=>s.shots).find(s=>s.id===target.value);}
 function checkOwner(){if(!owner||getProject().id!==owner.project)throw Error('Select the original project before applying this draft.');}
 async function api(path,body){const response=await fetch('/studio/assistant'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok){const error=Error(data.error||'Assistant request failed.');error.status=response.status;throw error;}return data;}
 function remember(){try{sessionStorage.setItem('studio-director-assistant-job',JSON.stringify({jobId,owner}));}catch{}}
 async function poll(){if(!jobId)return;try{const job=await api('/'+jobId);say(job.message+' · '+(job.elapsed||0)+'s');if(['running','cancelling'].includes(job.state)){timer=setTimeout(poll,1500);return;}lock(false);sessionStorage.removeItem('studio-director-assistant-job');if(job.state==='done'){resultKind=job.kind;generatedAudio=job.result.audio||null;q('[data-voice-preview]').hidden=q('[data-apply-audio]').hidden=!generatedAudio;if(generatedAudio)q('[data-voice-preview]').src='/view?'+new URLSearchParams({filename:generatedAudio.name,subfolder:generatedAudio.subfolder,type:'input'});output.value=job.result.text;q('[data-result]').hidden=false;q('[data-asset-save]').hidden=!(job.kind==='write'&&owner?.skill==='asset');savedAssetId=null;q('#planned-asset-status').textContent='';q('[aria-label="Planned asset name"]').value='';q('[aria-label="Planned asset name"]').removeAttribute('aria-invalid');const proposed=job.result.shot;q('[data-shot]').hidden=q('[data-apply-shot]').hidden=!proposed;q('[data-apply-outline]').hidden=!!proposed;for(const name of ['action','dialogue','subtitle'])q('[data-apply-'+name+']').hidden=!!proposed;if(proposed){q('[data-shot]').dataset.character=proposed.character||'';q('[data-shot]').dataset.setting=proposed.setting||'';q('[aria-label="Suggested shot title"]').value=proposed.character+' · '+proposed.setting;q('[aria-label="Suggested shot duration"]').value=proposed.duration_seconds;output.value=proposed.action;}if(generatedAudio)say('Voice ready · '+job.result.seconds.toFixed(1)+' seconds. Text edits require generating speech again.');if(job.result.truncated)say('Draft hit the reply limit. Review it or request a smaller section.');
  // Capture request metadata onto owner for durable inbox persistence.
  if(owner){owner.model=job.kind==='shot'?shotModel.value:model.value;owner.request=prompt.value;owner.stage=q('[aria-label="Guide stage"]').value;}
  const saved=persistCompletedJob(job);if(saved)activeDraftId=saved.id;
  }jobId=null;}catch(e){if(e.status===404){jobId=null;lock(false);sessionStorage.removeItem('studio-director-assistant-job');say(e.message);return;}say('Connection interrupted: '+e.message+' Reconnecting…');timer=setTimeout(poll,3000);}}
 run.onclick=async()=>{if(busy)return;q('[data-result]').hidden=true;owner={project:getProject().id,scene:getScene()?.id,target:target.value,skill:skill.value,model:task.value==='shot'?shotModel.value:model.value,stage:q('[aria-label="Guide stage"]').value,request:prompt.value};activeDraftId=null;lock(true);say('Preparing request…');try{const targetShot=shot(),body={kind:task.value,text:prompt.value,model:task.value==='shot'?shotModel.value:model.value,skill:skill.value,stage:q('[aria-label="Guide stage"]').value,finished:Object.entries(targetShot?.toolStages||{}).filter(([,value])=>value==='finished').map(([key])=>key),voice:q('[aria-label="Speech voice"]').value,speed:Number(q('[aria-label="Speech speed"]').value),engine:q('[aria-label="Speech engine"]').value,delivery:Number(q('[aria-label="Speech delivery"]').value),pacing:Number(q('[aria-label="Speech pacing"]').value),chat_source:chatSource.value,chat_model:chatModel.value,chat_url:chatUrl.value,fiction:getProject().story?.fiction||''};const referenceFile=q('[aria-label="Speech reference"]').files[0];if(body.kind==='voice'&&body.engine==='chatterbox'&&referenceFile){if(referenceFile.size>=100*1024*1024)throw Error('Use a reference under 100 MB.');body.reference=await upload(referenceFile);}if(body.kind==='transcribe'){const file=audio.files[0];if(!file)throw Error('Choose an audio file first.');if(file.size>=100*1024*1024)throw Error('Use audio under 100 MB.');body.audio=await upload(file);}const accepted=await api('',body);jobId=accepted.id;remember();lock(true);poll();}catch(e){lock(false);say(e.message);}};
 cancel.onclick=async()=>{try{await api('/'+jobId+'/cancel',{});say('Cancelling and releasing the local model…');}catch(e){say(e.message);}};
 q('[data-download]').onclick=()=>{if(!output.value.trim()){say('The draft is empty.');return;}download(output.value,'studio-assistant-draft.txt','text/plain');};
 q('[data-save-asset]').onclick=()=>{
  const nameInput=q('[aria-label="Planned asset name"]'),message=q('#planned-asset-status');
  try{
   if(busy)return;
   checkOwner();
   if(resultKind!=='write'||owner.skill!=='asset')throw Error('Create a 3D asset planning draft first.');
   if(savedAssetId&&getProject().assets.some(a=>a.id===savedAssetId))throw Error('This brief is already saved. Edit it in the asset library, or create another draft.');
   const name=nameInput.value.trim(),kind=q('[aria-label="Planned asset type"]').value,brief=output.value.trim();
   nameInput.setAttribute('aria-invalid',String(!name||name.length>200));
   if(!name||name.length>200){nameInput.focus();throw Error('Enter an asset name of 1–200 characters.');}
   if(!brief)throw Error('Add a build brief in the editable result first.');
   if(!['character','set','prop'].includes(kind))throw Error('Choose a character, prop or set.');
   const asset={id:crypto.randomUUID(),name,kind,brief};
   change(()=>getProject().assets.push(asset));savedAssetId=asset.id;
   markActive('accepted');message.textContent='Saved “'+name+'” to the asset library. Project Undo removes this addition.';
  }catch(error){message.textContent=error.message;}
 };
 q('[data-context]').onclick=()=>{const s=shot();if(!s){say('Choose a target shot first.');return;}const p=getProject(),scene=p.scenes.find(x=>x.shots.includes(s));prompt.value=shotBrief(p,scene,s);};
 q('[data-apply-shot]').onclick=()=>{try{checkOwner();const scene=getProject().scenes.find(s=>s.id===owner.scene);if(!scene)throw Error('The original scene no longer exists.');const seconds=Number(q('[aria-label="Suggested shot duration"]').value),title=q('[aria-label="Suggested shot title"]').value.trim();const shotGate=assistantShotApplyGate({title,seconds,action:output.value,ownerProjectId:owner?.project||'',currentProjectId:getProject().id});if(!shotGate.ok)throw Error(shotGate.reason);if(getProject().scenes.flatMap(s=>s.shots).reduce((n,s)=>n+s.seconds,0)+seconds>14400)throw Error('This shot would exceed the four-hour episode limit.');const action=output.value.trim(),names=[q('[data-shot]').dataset.character,q('[data-shot]').dataset.setting].map(name=>(name||'').trim().toLowerCase()).filter(Boolean),matched=getProject().assets.filter(asset=>['character','set','prop'].includes(asset.kind)&&names.includes(asset.name.trim().toLowerCase()));const planned={id:crypto.randomUUID(),title,seconds,action,camera:'',dialogue:'',visualSource:'boards',panels:[{id:crypto.randomUUID(),frames:seconds*24,action}]};if(matched.length)planned.assetIds=matched.map(asset=>asset.id);change(()=>scene.shots.push(planned));markActive('accepted');say('Planned shot added. The animatic uses its action, duration and storyboard panel. Project Undo removes it.');}catch(e){say(e.message);}};
 for(const field of ['outline','action','dialogue','subtitle'])q('[data-apply-'+field+']').onclick=()=>{try{checkOwner();const targetId=owner?.target||'';const shotRecord=targetId?getProject().scenes.flatMap(x=>x.shots).find(s=>s.id===targetId):null;const gate=assistantTextApplyGate({text:output.value,ownerProjectId:owner?.project||'',currentProjectId:getProject().id,requireTarget:field!=='outline',targetShotId:targetId,targetShotExists:!!shotRecord});if(!gate.ok)throw Error(gate.reason);if(field==='outline')change(()=>getProject().synopsis=output.value);else{change(()=>shotRecord[field]=output.value);}markActive('accepted');say('Draft applied. Project Undo restores the previous text.');syncApplyButtons();}catch(e){say(e.message);}};

 function showTake(take,{announce=true}={}){
  if(!take)return;
  activeTakeId=take.id;resultKind='voice';
  owner={project:getProject().id,scene:take.sceneId||getScene()?.id,target:take.targetShotId||target.value,skill:skill.value};
  generatedAudio=take.audio?{...take.audio}:null;savedAssetId=null;
  output.value=take.resultText||'';q('[data-result]').hidden=false;
  q('[data-voice-preview]').hidden=q('[data-apply-audio]').hidden=!generatedAudio;
  if(generatedAudio)q('[data-voice-preview]').src='/view?'+new URLSearchParams({filename:generatedAudio.name,subfolder:generatedAudio.subfolder||'studio-voices',type:generatedAudio.type||'input'});
  q('[data-asset-save]').hidden=true;q('[data-shot]').hidden=q('[data-apply-shot]').hidden=true;q('[data-apply-outline]').hidden=false;
  for(const name of ['action','dialogue','subtitle'])q('[data-apply-'+name+']').hidden=false;
  if(take.request)prompt.value=take.request;
  task.value='voice';mode();
  if(announce)say('Restored take · '+voiceTakeLabel(take));
  refreshTakes();
  syncApplyButtons();
 }
 function persistVoiceTake(job){
  if(job.kind!=='voice'||!job.result?.audio)return null;
  try{
   const take=buildVoiceTake({
    engine:owner?.engine||q('[aria-label="Speech engine"]').value,
    voice:owner?.voice||q('[aria-label="Speech voice"]').value,
    model:job.model||'kokoro',
    request:owner?.request||prompt.value,
    resultText:job.result?.text||'',
    targetShotId:owner?.target,sceneId:owner?.scene,jobId:job.id||jobId,
    audio:job.result.audio,seconds:job.result.seconds,
    speed:owner?.speed,delivery:owner?.delivery,pacing:owner?.pacing,
   });
   change(()=>{recordVoiceTake(getProject(),take);});
   activeTakeId=take.id;
   refreshTakes();
   return take;
  }catch(e){say('Voice ready, but take library save failed: '+e.message);return null;}
 }
 function refreshTakes(){
  const host=q('[data-takes-list]'),empty=q('[data-takes-empty]'),summary=q('[data-takes-summary]'),filterSel=q('[aria-label="Voice take library filter"]');
  if(!host)return;
  if(filterSel&&!filterSel.options.length){
    for(const f of VOICE_TAKE_FILTERS)filterSel.add(new Option(f.label,f.id));
    filterSel.value='library';
  }
  const filterId=filterSel?.value||'all';
  const counts=summarizeVoiceTakes(getProject());
  if(summary){
    summary.textContent=counts.total
      ? (counts.library+' library · '+counts.promoted+' promoted · '+counts.rejected+' rejected · '+counts.total+' total'+(filterId!=='all'?' · showing '+filterId:''))
      : 'No voice takes on this project yet.';
  }
  host.replaceChildren();
  const takes=listVoiceTakes(getProject(),filterId);
  empty.hidden=takes.length>0;
  empty.textContent=counts.total&&!takes.length
    ? 'No voice takes match this filter.'
    : 'No saved voice takes yet. Finished speech jobs appear here.';
  for(const take of takes){
   const row=document.createElement('div');row.className='actions voice-take-row';row.setAttribute('role','listitem');row.dataset.status=take.status||'library';
   if(take.id===activeTakeId)row.dataset.active='1';
   const label=document.createElement('p');label.className='hint';label.textContent=voiceTakeLabel(take);
   const bits=[label];
   if(take.note){const noteEl=document.createElement('p');noteEl.className='hint';noteEl.textContent='Note: '+(take.note.length>160?take.note.slice(0,157)+'…':take.note);bits.push(noteEl);}
   if(take.resultText){const brief=document.createElement('p');brief.className='hint';brief.textContent=(take.resultText.length>160?take.resultText.slice(0,157)+'…':take.resultText);bits.push(brief);}
   row.append(...bits);
   const restore=document.createElement('button');restore.type='button';restore.textContent='Restore';restore.onclick=()=>{try{showTake(findVoiceTake(getProject(),take.id)||take);}catch(e){say(e.message);}};
   const promote=document.createElement('button');promote.type='button';promote.textContent='Promote';promote.onclick=()=>{try{
    const shotId=target.value||take.targetShotId;if(!shotId)throw Error('Choose a target shot before promoting a take.');
    change(()=>promoteVoiceTake(getProject(),take.id,shotId));
    generatedAudio={...findVoiceTake(getProject(),take.id).audio};activeTakeId=take.id;
    say('Take promoted onto the target shot. Undo restores previous shot audio.');
    refreshTakes();
   }catch(e){say(e.message);}};
   const rename=document.createElement('button');rename.type='button';rename.textContent='Rename';rename.onclick=()=>{try{
    const current=findVoiceTake(getProject(),take.id)||take;
    const next=window.prompt('Take label (empty clears custom name):', current.label||'');
    if(next===null)return;
    change(()=>setVoiceTakeLabel(getProject(),take.id,next));
    say(String(next).trim()?'Take renamed · '+String(next).trim():'Custom label cleared.');
    refreshTakes();
   }catch(e){say(e.message);}};
   const noteBtn=document.createElement('button');noteBtn.type='button';noteBtn.textContent='Note';noteBtn.onclick=()=>{try{
    const current=findVoiceTake(getProject(),take.id)||take;
    const next=window.prompt('Take note (empty clears):', current.note||'');
    if(next===null)return;
    change(()=>setVoiceTakeNote(getProject(),take.id,next));
    say(String(next).trim()?'Take note saved.':'Take note cleared.');
    refreshTakes();
   }catch(e){say(e.message);}};
   const dup=document.createElement('button');dup.type='button';dup.textContent='Duplicate';dup.title='Same audio file, new take id and editable meta (no re-upload)';dup.onclick=()=>{try{
    let copy;
    change(()=>{copy=duplicateVoiceTake(getProject(),take.id);});
    say('Take duplicated · '+(copy&&copy.label?copy.label:voiceTakeLabel(copy))+'. Same audio file; status is library. Undo removes the copy.');
    refreshTakes();
   }catch(e){say(e.message);}};
   const reject=document.createElement('button');reject.type='button';reject.textContent='Reject';reject.disabled=take.status==='rejected';reject.onclick=()=>{try{change(()=>setVoiceTakeStatus(getProject(),take.id,'rejected'));say('Take rejected. History stays on this project until unused-take cleanup.');refreshTakes();}catch(e){say(e.message);}};
   row.append(restore,promote,rename,noteBtn,dup,reject);host.append(row);
  }
  const clearRej=q('[data-clear-rejected-takes]');
  const clearDec=q('[data-clear-decided-takes]');
  const clearableRej=clearableRejectedVoiceTakeCount(counts);
  const clearableDec=clearableDecidedVoiceTakeCount(counts);
  if(clearRej){
    clearRej.disabled=!clearableRej;
    clearRej.title=clearableRej
      ? ('Remove '+clearableRej+' rejected take'+(clearableRej===1?'':'s')+' not linked to a shot')
      : (counts.linkedRejected?'Rejected takes still linked to a shot stay until you detach them.':'No rejected takes to clear.');
  }
  if(clearDec){
    clearDec.disabled=!clearableDec;
    clearDec.title=clearableDec
      ? ('Remove '+clearableDec+' promoted/rejected take'+(clearableDec===1?'':'s')+' not linked to a shot')
      : (counts.linkedDecided?'Promoted/rejected takes still linked to a shot stay until you detach them.':'No decided takes to clear.');
  }
 }
  function refreshOrphans(){
  const host=q('[data-orphans-list]'),empty=q('[data-orphans-empty]');
  if(!host)return;
  const previousSelected=new Set([...host.querySelectorAll('input[data-orphan-check]:checked')].map(c=>c.value));
  host.replaceChildren();
  empty.hidden=false;empty.textContent='Loading disk listing…';
  (async()=>{
   try{
    const response=await fetch('/studio/voices/files',{headers:{'X-Studio-Director':'1'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Could not list studio-voices.');
    const currentProject=getProject();
    const keep=collectVoiceKeepNames([currentProject]);
    const orphans=orphanVoiceFiles(data.files||[],keep);
    const loaded=(getLibrary?getLibrary():[currentProject])||[];
    const crossRefs=crossEpisodeVoiceKeepRefs(orphans.map(f=>f.name),currentProject,loaded);
    host.replaceChildren();
    empty.hidden=orphans.length>0;
    empty.textContent='No orphan voice files on disk (or listing unavailable).';
    for(const file of orphans){
     const row=document.createElement('div');row.className='actions';row.setAttribute('role','listitem');
     const when=(()=>{try{return file.mtime?new Date(file.mtime*1000).toLocaleString():'';}catch{return '';}})();
     const size=typeof file.bytes==='number'?(file.bytes>=1024?((file.bytes/1024).toFixed(0)+' KB'):(file.bytes+' B')):'';
     const otherRefs=crossRefs.get(file.name)||[];
     const keepNote=formatCrossEpisodeKeepNote(otherRefs);
     const check=document.createElement('input');check.type='checkbox';check.setAttribute('data-orphan-check','');check.value=file.name;check.setAttribute('aria-label','Select orphan '+file.name);if(previousSelected.has(file.name))check.checked=true;if(keepNote){check.setAttribute('data-cross-episode-keep','1');check.title=keepNote;}
     const label=document.createElement('p');label.className='hint';label.textContent=[file.name,size,when].filter(Boolean).join(' · ');
     row.append(check,label);
     if(keepNote){const note=document.createElement('p');note.className='hint';note.setAttribute('data-cross-episode-note','');note.textContent=keepNote;row.append(note);}
     const preview=document.createElement('button');preview.type='button';preview.textContent='Preview';preview.onclick=()=>{
      generatedAudio={name:file.name,subfolder:file.subfolder||'studio-voices',type:file.type||'input'};activeTakeId=null;resultKind='voice';
      q('[data-result]').hidden=false;q('[data-voice-preview]').hidden=q('[data-apply-audio]').hidden=false;
      q('[data-voice-preview]').src='/view?'+new URLSearchParams({filename:file.name,subfolder:file.subfolder||'studio-voices',type:file.type||'input'});
      output.value=file.name;say('Previewing orphan disk take · '+file.name+'. '+(keepNote||('Link to keep it on this project, or Discard to delete the file.')));
     };
     const link=document.createElement('button');link.type='button';link.textContent='Link';link.onclick=()=>{try{
      let take=null;
      change(()=>{take=linkOrphanVoiceFile(getProject(),file,{targetShotId:target.value||undefined,sceneId:getScene()?.id});});
      activeTakeId=take.id;generatedAudio={...take.audio};
      q('[data-result]').hidden=false;q('[data-voice-preview]').hidden=q('[data-apply-audio]').hidden=false;
      q('[data-voice-preview]').src='/view?'+new URLSearchParams({filename:take.audio.name,subfolder:take.audio.subfolder||'studio-voices',type:take.audio.type||'input'});
      output.value=take.resultText||take.audio.name;
      say('Linked orphan into Voice take library · '+voiceTakeLabel(take)+'. Promote to attach to a shot. File stays on disk.');
      refreshTakes();refreshOrphans();
     }catch(e){say(e.message);}};
     const discard=document.createElement('button');discard.type='button';discard.textContent='Discard';if(keepNote){discard.disabled=true;discard.title=keepNote;}
     discard.onclick=async()=>{
      if(busy)return;
      if(keepNote){say(keepNote);return;}
      const loaded=(getLibrary?getLibrary():[getProject()])||[];
      const loadedKeep=collectVoiceKeepNames(loaded);
      if(loadedKeep.includes(file.name)){say('That file is still referenced by a loaded episode. Open that project to manage it, or unlink there first.');return;}
      if(!confirm(orphanDiscardConfirm([file.name])))return;
      try{
       const response=await fetch('/studio/voices/discard',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify({names:[file.name]})});
       const result=await response.json().catch(()=>({}));
       if(!response.ok)throw Error(result.error||'Discard failed.');
       say(summarizeOrphanDiscard(result,[file.name]));
       refreshOrphans();
      }catch(e){say(e.message);}
     };
     row.append(preview,link,discard);host.append(row);
    }
   }catch(e){
    host.replaceChildren();
    empty.hidden=false;empty.textContent='Disk listing unavailable: '+e.message;
   }
  })();
 }
async function discardSelectedOrphans(){
  if(busy)return;
  const host=q('[data-orphans-list]');
  if(!host)return;
  const names=[...host.querySelectorAll('input[data-orphan-check]:checked')].map(c=>c.value).filter(Boolean);
  if(!names.length){say('Select one or more orphan voice files first.');return;}
  const loaded=(getLibrary?getLibrary():[getProject()])||[];
  const loadedKeep=new Set(collectVoiceKeepNames(loaded));
  const blocked=names.filter(n=>loadedKeep.has(n));
  const free=names.filter(n=>!loadedKeep.has(n));
  if(blocked.length&&!free.length){say('Selected files are still referenced by a loaded episode. Open that project to manage them, or unlink there first.');return;}
  if(blocked.length){say('Skipping '+blocked.length+' selected file'+(blocked.length===1?'':'s')+' still referenced by a loaded episode.');}
  if(!free.length)return;
  if(!confirm(orphanDiscardConfirm(free)))return;
  try{
   const response=await fetch('/studio/voices/discard',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify({names:free})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.error||'Discard failed.');
   let msg=summarizeOrphanDiscard(result,free);
   if(blocked.length)msg+=' Skipped '+blocked.length+' loaded-episode ref'+(blocked.length===1?'':'s')+'.';
   say(msg);
   refreshOrphans();
  }catch(e){say(e.message);}
}
q('[data-refresh-orphans]').onclick=()=>{refreshOrphans();say('Refreshing studio-voices disk listing…');};
 q('[data-select-all-orphans]').onclick=()=>{const host=q('[data-orphans-list]');if(!host)return;for(const c of host.querySelectorAll('input[data-orphan-check]'))c.checked=true;const n=host.querySelectorAll('input[data-orphan-check]:checked').length;const blocked=host.querySelectorAll('input[data-orphan-check][data-cross-episode-keep]:checked').length;if(!n){say('No orphans to select.');return;}say('Selected '+n+' orphan'+(n===1?'':'s')+'.'+(blocked?(' '+blocked+' still used by another loaded episode (Discard blocked on those rows).'):''));};
 q('[data-clear-orphan-selection]').onclick=()=>{const host=q('[data-orphans-list]');if(!host)return;for(const c of host.querySelectorAll('input[data-orphan-check]'))c.checked=false;say('Cleared orphan selection.');};
 q('[data-discard-selected-orphans]').onclick=()=>{discardSelectedOrphans();};
 q('[data-clean-voices]').onclick=async()=>{
  if(busy)return;
  const projects=(getLibrary?getLibrary():[getProject()])||[];
  const keep=collectVoiceKeepNames(projects);
  if(!confirm(`Delete generated voice takes that none of your ${projects.length} loaded ${projects.length===1?'episode':'episodes'} still uses?\n\n${keep.length} in use here will be kept. Registered disk project snapshots are protected too. Open older projects in Director first to register their media.`))return;
  try{const response=await fetch('/studio/voices/cleanup',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify({keep})});const result=await response.json();if(!response.ok)throw Error(result.error||'Cleanup failed.');
   say(result.deleted?`Removed ${result.deleted} unused ${result.deleted===1?'take':'takes'}, freeing ${(result.freed/1024).toFixed(0)} KB. ${result.kept} still in use.`:`Nothing to remove; all ${result.kept} takes are still in use.`);
   if(result.failed)say(`${result.failed} could not be deleted; close anything using them and try again.`);}
  catch(e){say(e.message);}
 };
 q('[data-apply-audio]').onclick=()=>{try{checkOwner();const s=getProject().scenes.flatMap(x=>x.shots).find(s=>s.id===owner.target);const audioGate=assistantAudioApplyGate({hasAudio:!!generatedAudio,targetShotId:owner?.target||'',targetShotExists:!!s,ownerProjectId:owner?.project||'',currentProjectId:getProject().id});if(!audioGate.ok)throw Error(audioGate.reason);change(()=>{s.audio={...generatedAudio};if(activeTakeId){try{setVoiceTakeStatus(getProject(),activeTakeId,'promoted');const take=findVoiceTake(getProject(),activeTakeId);if(take)take.targetShotId=owner.target;}catch{/* take may have been pruned */} } else if(generatedAudio.name){const hit=(getProject().voiceTakes||[]).find(t=>(t.audio?.name||t.audio?.filename)===generatedAudio.name);if(hit){setVoiceTakeStatus(getProject(),hit.id,'promoted');hit.targetShotId=owner.target;activeTakeId=hit.id;}}});markActive('accepted');refreshTakes();say('Voice attached. Check shot duration against the recording; Undo restores previous audio. Registered project media is protected during cleanup.');}catch(e){say(e.message);}};
 q('[data-apply-script]').onclick=()=>{try{checkOwner();const shotRecord=getProject().scenes.flatMap(x=>x.shots).find(s=>s.id===owner.target);const scriptGate=assistantScriptApplyGate({text:output.value,hasRig:!!shotRecord?.rig3d,targetShotId:owner?.target||'',targetShotExists:!!shotRecord,ownerProjectId:owner?.project||'',currentProjectId:getProject().id});if(!scriptGate.ok)throw Error(scriptGate.reason);const next=compileFeatureScript(shotRecord.rig3d,expressionScriptLines(output.value),shotRecord.seconds*24-1);change(()=>{shotRecord.rig3d.featureKeys=next.featureKeys;});markActive('accepted');say('Expression keys written on the target shot. Scrub the 3D preview. Undo restores the previous keys.');}catch(e){say(e.message);}};
 q('[data-apply-prototype]').onclick=()=>{try{checkOwner();if(!output.value.trim())throw Error('The draft is empty.');let summary;change(()=>{summary=applyPrototypeDraft(getProject(),output.value);});markActive('accepted');say('Prototype written'+(summary.events?' · '+summary.events+' timeline row'+(summary.events===1?'':'s'):'')+(summary.characters?' · '+summary.characters+' character sheet'+(summary.characters===1?'':'s'):'')+'. Undo restores.');}catch(e){say(e.message);}};
 if(q('[aria-label="Draft inbox filter"]'))q('[aria-label="Draft inbox filter"]').onchange=()=>refreshInbox();
 if(q('[aria-label="Voice take library filter"]'))q('[aria-label="Voice take library filter"]').onchange=()=>refreshTakes();
 q('[data-clear-rejected-takes]').onclick=()=>{
  const counts=summarizeVoiceTakes(getProject());
  const clearable=clearableRejectedVoiceTakeCount(counts);
  if(!clearable){say(counts.linkedRejected?'Rejected takes still linked to a shot stay until you detach them.':'No rejected takes to clear.');return;}
  const linkedNote=counts.linkedRejected?' '+counts.linkedRejected+' still linked to a shot will be kept.':'';
  if(!confirm('Remove '+clearable+' rejected take'+(clearable===1?'':'s')+' from this project library?'+linkedNote+' Library and promoted takes stay. Undo restores the list.'))return;
  try{
   let removed=0;
   change(()=>{removed=clearRejectedVoiceTakes(getProject());});
   if(activeTakeId&&!findVoiceTake(getProject(),activeTakeId))activeTakeId=null;
   refreshTakes();
   const left=summarizeVoiceTakes(getProject());
   say('Cleared '+removed+' rejected take'+(removed===1?'':'s')+'. '+left.library+' library · '+left.promoted+' promoted remain'+(left.linkedRejected?' · '+left.linkedRejected+' linked rejected kept':'')+'.');
  }catch(e){say(e.message);}
 };
 q('[data-clear-decided-takes]').onclick=()=>{
  const counts=summarizeVoiceTakes(getProject());
  const clearable=clearableDecidedVoiceTakeCount(counts);
  if(!clearable){say(counts.linkedDecided?'Promoted/rejected takes still linked to a shot stay until you detach them.':'No decided takes to clear.');return;}
  const linkedNote=counts.linkedDecided?' '+counts.linkedDecided+' still linked to a shot will be kept.':'';
  if(!confirm('Remove '+clearable+' decided take'+(clearable===1?'':'s')+' (unlinked promoted + rejected) from this project library?'+linkedNote+' Library takes stay. Undo restores the list.'))return;
  try{
   let removed=0;
   change(()=>{removed=clearDecidedVoiceTakes(getProject());});
   if(activeTakeId&&!findVoiceTake(getProject(),activeTakeId))activeTakeId=null;
   refreshTakes();
   const left=summarizeVoiceTakes(getProject());
   say('Cleared '+removed+' decided take'+(removed===1?'':'s')+'. '+left.library+' library · '+left.promoted+' promoted remain'+(left.linkedDecided?' · '+left.linkedDecided+' linked decided kept':'')+'.');
  }catch(e){say(e.message);}
 };

q('[data-clear-decided-drafts]').onclick=()=>{
  const counts=summarizeAssistantDrafts(getProject());
  const clearable=clearableDecidedAssistantDraftCount(counts);
  if(!clearable){say('No accepted or rejected drafts to clear.');return;}
  if(!confirm('Remove '+clearable+' decided draft'+(clearable===1?'':'s')+' from this project inbox? Pending drafts stay. Undo restores the list.'))return;
  try{
   let removed=0;
   change(()=>{removed=clearDecidedAssistantDrafts(getProject());});
   if(activeDraftId&&!findAssistantDraft(getProject(),activeDraftId))activeDraftId=null;
   refreshInbox();
   say('Cleared '+removed+' decided draft'+(removed===1?'':'s')+'. '+summarizeAssistantDrafts(getProject()).pending+' pending remain.');
  }catch(e){say(e.message);}
 };
 output.addEventListener('input',()=>syncApplyButtons());
 const shotTitleInput=q('[aria-label="Suggested shot title"]');
 const shotDurInput=q('[aria-label="Suggested shot duration"]');
 if(shotTitleInput)shotTitleInput.addEventListener('input',()=>syncApplyButtons());
 if(shotDurInput)shotDurInput.addEventListener('input',()=>syncApplyButtons());
 target.addEventListener('change',()=>{if(owner)owner.target=target.value;syncApplyButtons();});
 skill.onchange=mode;task.onchange=mode;q('[aria-label="Speech engine"]').onchange=mode;panel.addEventListener('toggle',()=>{if(panel.open)refresh();});mode();refresh();syncApplyButtons();
 // Every installed voice pack, so the menu cannot drift from what the backend accepts.
 (async()=>{try{const listed=await api('/voices');if(!listed.voices?.length)return;const select=q('[aria-label="Speech voice"]');select.replaceChildren(...listed.voices.map(v=>new Option(v.name+' · '+v.accent,v.id)));select.value=listed.voices.some(v=>v.id===listed.default)?listed.default:listed.voices[0].id;}catch{/* Keep the built-in choices when the listing is unavailable. */}})();
 try{const saved=JSON.parse(sessionStorage.getItem('studio-director-assistant-job')||'null');if(saved?.jobId&&saved.owner){jobId=saved.jobId;owner=saved.owner;panel.open=true;lock(true);poll();}}catch{}
 return {refresh};
}
