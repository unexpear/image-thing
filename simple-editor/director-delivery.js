import {safeAreaGuideControls, titleOverlayText} from './director-title-styles.js';
import {usesBoards,boardFrames} from './director-planning-state.js';
import {STAGES,animationPassGateMessages,animationPassLabel,animationPassStatus} from './director-production.js';
import {shotTimeline,frameTime} from './director-animatic.js';

export function deliveryChecks(project){
 const entries=shotTimeline(project),issues=[];
 if(!entries.length)issues.push({message:'Add at least one shot.',kind:'Assembly'});
 for(const entry of entries){
  const s=entry.shot,add=(kind,message)=>issues.push({shotId:s.id,kind,message});
  if(usesBoards(s)){if(!s.panels?.length||s.panels.some(p=>!p.media))add('Assembly','Attach every storyboard panel drawing.');if(boardFrames(s)!==s.seconds*24)add('Assembly','Match panel frames to shot duration.');}else if(!s.media)add('Assembly','Attach a storyboard image or clip.');
  if(!(s.action||'').trim())add('Planning','Add an action / storyboard brief.');
  const changes=STAGES.filter(stage=>s.production?.[stage]==='Needs changes');
  if(changes.length)add('Review','Changes requested: '+changes.join(', '));
  const unfinished=STAGES.filter(stage=>!['Approved','Not needed','Needs changes'].includes(s.production?.[stage]));
  if(unfinished.length)add('Review','Stages not approved or skipped: '+unfinished.join(', '));
  const notes=(s.versions||[]).reduce((n,v)=>n+v.notes.filter(x=>!x.resolved).length,0);
  if(notes)add('Review',notes+' unresolved version notes.');
  for(const message of animationPassGateMessages(s))add('Animation passes',message);
  const linked=project.assets.filter(a=>['character','set','prop'].includes(a.kind)&&(s.assetIds===undefined||s.assetIds.includes(a.id)));
  for(const a of linked)if((a.readiness||'Not started')!=='Approved')add('Assets','Waiting for asset: '+a.name+' ('+(a.readiness||'Not started')+').');
  if((s.subtitle||'').trim().length>s.seconds*20)add('Subtitles','Dense subtitle text: consider shortening it or splitting the shot.');
  const titleText=titleOverlayText(s);if(titleText.length>s.seconds*24)add('Titles','Dense title overlay text: keep cards readable inside title-safe.');
 }
 return issues;
}
const filename=file=>file?[file.type||'input',file.subfolder,file.name||file.filename].filter(Boolean).join('/'):'';
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function shotListCSV(project){
 const rows=[['Scene','Shot ID','Shot','Start (24 fps)','End (24 fps)','Seconds','Action','Camera','Dialogue / sound notes','Subtitle','Visual assets','Media','Replacement audio',...STAGES,'Blocking pass','Breakdowns pass','Polish pass','Open notes']];
 for(const e of shotTimeline(project)){const s=e.shot,pass=animationPassStatus(s);rows.push([e.scene,s.id,s.title,frameTime(e.start),frameTime(e.end),s.seconds,s.action,s.camera,s.dialogue,s.subtitle,project.assets.filter(a=>['character','set','prop'].includes(a.kind)&&(s.assetIds===undefined||s.assetIds.includes(a.id))).map(a=>a.name).join('; '),filename(s.media),filename(s.audio),...STAGES.map(stage=>s.production?.[stage]||'Not started'),pass.Blocking.status,pass.Breakdowns.status,pass.Polish.status,(s.versions||[]).reduce((n,v)=>n+v.notes.filter(x=>!x.resolved).length,0)]);}
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
const srtTime=s=>[Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':')+',000';
export function subtitlesSRT(project){
 const cues=[];
 for(const e of shotTimeline(project)){
  // Blank lines delimit SRT cues, so remove empty lines inside one caption.
  const text=(e.shot.subtitle||'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean).join('\n');
  if(text)cues.push(`${cues.length+1}\n${srtTime(e.start)} --> ${srtTime(e.end)}\n${text}`);
 }
 return cues.length?cues.join('\n\n')+'\n\n':'';
}

/** ISO 639-2/B codes for mov_text language metadata (ffmpeg -metadata:s:s:0 language=...). */
export const DEFAULT_CAPTIONS_LANGUAGE = 'eng';
export const CAPTION_LANGUAGES = [
  {code:'eng',label:'English (eng)'},
  {code:'spa',label:'Spanish (spa)'},
  {code:'fra',label:'French (fra)'},
  {code:'deu',label:'German (deu)'},
  {code:'ita',label:'Italian (ita)'},
  {code:'por',label:'Portuguese (por)'},
  {code:'nld',label:'Dutch (nld)'},
  {code:'rus',label:'Russian (rus)'},
  {code:'jpn',label:'Japanese (jpn)'},
  {code:'kor',label:'Korean (kor)'},
  {code:'zho',label:'Chinese (zho)'},
  {code:'ara',label:'Arabic (ara)'},
  {code:'hin',label:'Hindi (hin)'},
  {code:'und',label:'Undetermined (und)'},
];
const CAPTION_LANGUAGE_CODES = new Set(CAPTION_LANGUAGES.map(x=>x.code));

/** Normalize / validate a 3-letter captions language (default eng). */
export function normalizeCaptionsLanguage(raw){
  if(raw==null||raw==='')return DEFAULT_CAPTIONS_LANGUAGE;
  if(typeof raw!=='string')throw Error('Captions language must be text.');
  const code=raw.trim().toLowerCase();
  if(!/^[a-z]{3}$/.test(code))throw Error('Captions language must be a 3-letter ISO 639-2 code (for example eng).');
  if(!CAPTION_LANGUAGE_CODES.has(code))throw Error('Unsupported captions language: '+code+'. Pick one from the Assemble list.');
  return code;
}

/** Assemble payload fragment when artist opts into soft-mux captions (mov_text). */
export function softMuxCaptionsPayload(project, enabled, language){
  if(!enabled)return {softMuxCaptions:false};
  const captionsSrt=subtitlesSRT(project);
  if(!captionsSrt)throw Error('Add subtitle text under a shot\u2019s Production, cast & review controls before embedding soft captions.');
  return {softMuxCaptions:true, captionsSrt, captionsLanguage:normalizeCaptionsLanguage(language)};
}
/** Body for remuxing soft captions onto an already-assembled export (no re-encode). */
export function softMuxAfterExportBody(project, language, source){
  if(!source || typeof source!=='object' || Array.isArray(source))throw Error('Assemble an episode first, then embed soft captions into that export.');
  const name=source.filename||source.name;
  if(typeof name!=='string' || !name.trim())throw Error('Assemble an episode first, then embed soft captions into that export.');
  const type=source.type||'output';
  if(type!=='input' && type!=='output')throw Error('Soft-caption remux source must be a Studio media file.');
  const body=softMuxCaptionsPayload(project, true, language);
  body.source={filename:name, type};
  if(source.subfolder!=null && source.subfolder!=='')body.source.subfolder=source.subfolder;
  return body;
}

/** Gate for Assemble MP4 - disabled until Delivery Assembly checks pass (attach media / finish boards). */
export function assembleReadyGate(project){
  if(!project || typeof project!=='object' || Array.isArray(project)){
    return {ok:false, reason:'Open an episode before assembling.', missing:0};
  }
  const assembly=deliveryChecks(project).filter(i=>i.kind==='Assembly');
  if(assembly.length){
    const first=assembly[0];
    const n=assembly.length;
    const reason=n===1
      ? first.message
      : (first.message+' (+'+(n-1)+' more assembly issue'+(n===2?'':'s')+')');
    return {ok:false, reason, missing:n};
  }
  return {ok:true, reason:'Assemble the episode MP4 from attached shot media.', missing:0};
}

/** Gate for Check exported audio loudness - needs a finished Assemble output (not in progress). */
export function assembleLoudnessGate(job){
  if(job && job.state==='running'){
    return {ok:false, reason:'Wait for Assemble to finish before measuring loudness.'};
  }
  const output=job && job.output;
  if(!output || typeof output!=='object' || Array.isArray(output)){
    return {ok:false, reason:'Assemble an episode first, then check exported audio loudness.'};
  }
  const name=output.filename||output.name;
  if(typeof name!=='string' || !name.trim()){
    return {ok:false, reason:'Assemble an episode first, then check exported audio loudness.'};
  }
  return {ok:true, reason:'Measure loudness of the last Assemble export (LUFS / true peak / range).'};
}

export function createDelivery(before,{getProject,button,download,tell,goToShot,change}){
 const panel=document.createElement('details');panel.className='settings production-overview';panel.id='director-delivery';
 panel.innerHTML='<summary>Delivery checklist & exports <span id="delivery-count"></span></summary><p class="hint">Checks project records for missing attachments, unfinished stages, open review notes and animation-pass gates (Blocking → Breakdowns → Polish). Animation Ready/Approved without those craft revisions still lists an Animation-passes reminder — gates are manual, not automatic quality checks. File existence, visual quality and sound quality still need checking in preview. Unapproved linked assets and review reminders do not block draft MP4 export. Soft captions (mov_text) are optional under Assemble with a caption language picker, or remux onto the last export without re-assembling; Burn titles stays separate.</p><div class="actions" id="delivery-actions"></div><div id="delivery-issues" class="delivery-issues"></div>';
 before.before(panel);
 const guideHost=document.createElement('div');guideHost.className='delivery-safe-area';panel.querySelector('summary').after(guideHost);
 let guideCtl=null;
 function refreshGuides(){const project=getProject();guideHost.replaceChildren();guideCtl=safeAreaGuideControls(guideHost,project,{change:(fn)=>{ if(typeof change==='function') change(fn); else fn(); }});}
 refreshGuides();
 panel.querySelector('#delivery-actions').append(button('Export shot list CSV',()=>download(shotListCSV(getProject()),'episode-shot-list.csv','text/csv;charset=utf-8')),button('Export subtitles SRT',()=>{const text=subtitlesSRT(getProject());if(!text){tell('Add subtitle text under a shot’s Production, cast & review controls first.');return;}download(text,'episode-subtitles.srt','text/plain;charset=utf-8');}));
 return {update(){refreshGuides();const project=getProject(),issues=deliveryChecks(project),assembly=issues.filter(i=>i.kind==='Assembly').length,gates=issues.filter(i=>i.kind==='Animation passes').length,other=Math.max(0,issues.length-assembly-gates);panel.querySelector('#delivery-count').textContent=issues.length?`${assembly} assembly · ${gates} animation-pass gates · ${other} other reminders`:'Project record checks passed (assembly, stages, notes, animation-pass gates)';const rows=panel.querySelector('#delivery-issues');rows.replaceChildren();
  const names=new Map(shotTimeline(project).map(e=>[e.shot.id,e.scene+' / '+(e.shot.title||'Untitled shot')]));
  const ordered=[...issues].sort((a,b)=>(a.kind==='Animation passes'?0:1)-(b.kind==='Animation passes'?0:1));
  for(const issue of ordered){const label=`${issue.kind}: ${names.get(issue.shotId)||project.title} — ${issue.message}`;if(issue.shotId){const b=button(label,()=>goToShot(issue.shotId));if(issue.kind==='Animation passes')b.classList.add('delivery-gate-issue');rows.append(b);}else{const p=document.createElement('p');p.textContent=label;rows.append(p);}}
 }};
}
