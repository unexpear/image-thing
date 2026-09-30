import {validateDrawing,paintDrawing} from './director-drawing.js';
import {validateRig3D} from './director-3d-state.js';
import {sampleMotion} from './director-motion.js';
export const ANIMATION_PASSES=['Blocking','Breakdowns','Polish'];
export function validateRevisions(shot){
 if(shot.animationRevisions===undefined)return;
 if(!Array.isArray(shot.animationRevisions)||shot.animationRevisions.length>8)throw Error('Keep at most eight editable animation revisions per shot.');
 const ids=new Set();for(const r of shot.animationRevisions){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.label!=='string'||!r.label.trim()||r.label.length>100||!ANIMATION_PASSES.includes(r.pass)||!['Work in progress','Needs changes','Approved'].includes(r.status)||typeof r.created!=='string'||!Number.isInteger(r.seconds)||r.seconds<1||r.seconds>3600||(!r.drawing&&!r.rig3d)||!Array.isArray(r.notes)||r.notes.length>200)throw Error('Invalid animation revision.');ids.add(r.id);
  validateDrawing(r.drawing);validateRig3D(r.rig3d);
  for(const note of r.notes){if(!note||typeof note.text!=='string'||!note.text.trim()||note.text.length>2000||typeof note.resolved!=='boolean'||!Number.isInteger(note.frame)||note.frame<0||note.frame>=r.seconds*24||!Array.isArray(note.marks)||note.marks.length>50)throw Error('Invalid revision note.');for(const path of note.marks)if(!Array.isArray(path)||!path.length||path.length>500||path.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<0||v>1)))throw Error('Invalid frame annotation.');}
  if(r.status==='Approved'&&r.notes.some(n=>!n.resolved))throw Error('Resolve revision notes before approving.');
 }
 if(JSON.stringify(shot.animationRevisions).length>2000000)throw Error('Editable revisions exceed 2 MB. Download a project backup and remove an older revision.');
}
export function saveAnimationRevision(shot,label,pass){
 if(!shot.drawing&&!shot.rig3d)throw Error('Create a drawing or 3D rig before saving an editable revision.');
 const revision={id:crypto.randomUUID(),label:label.trim(),pass,status:'Work in progress',created:new Date().toISOString(),seconds:shot.seconds,notes:[]};
 for(const key of ['drawing','rig3d'])if(shot[key])revision[key]=structuredClone(shot[key]);
 const next=[...(shot.animationRevisions||[]),revision];validateRevisions({...shot,animationRevisions:next});shot.animationRevisions=next;return revision;
}
export function approveRevision(shot,id){const r=shot.animationRevisions?.find(r=>r.id===id);if(!r)throw Error('Select a revision.');if(r.notes.some(n=>!n.resolved))throw Error('Resolve this revision’s notes before approving.');const earlier=ANIMATION_PASSES.slice(0,ANIMATION_PASSES.indexOf(r.pass));if(earlier.some(pass=>!shot.animationRevisions.some(v=>v.pass===pass&&v.status==='Approved')))throw Error('Approve the earlier animation passes first.');r.status='Approved';}

/** Manual gate flip for a saved pass revision. Does not invent revisions or auto-verify craft. */
export function flipAnimationPass(shot,pass,status){
 if(!ANIMATION_PASSES.includes(pass))throw Error('Unknown animation pass.');
 if(!['Work in progress','Needs changes','Approved'].includes(status))throw Error('Invalid animation-pass status.');
 const revs=(shot.animationRevisions||[]).filter(r=>r.pass===pass);
 if(!revs.length)throw Error('Save a '+pass+' revision under Animation passes before changing that gate.');
 if(status==='Approved'){
  const candidate=[...revs].reverse().find(r=>r.status!=='Approved')||revs.at(-1);
  approveRevision(shot,candidate.id);
  return candidate;
 }
 const target=revs.find(r=>r.status==='Approved')||revs.at(-1);
 target.status=status;
 return target;
}
/** How many unsaved annotation strokes Clear unsaved frame marks would remove (session marks + in-progress stroke). */
export function clearableUnsavedFrameMarkCount(marks, drawing){
 const n = Array.isArray(marks) ? marks.length : 0;
 return n + (drawing && Array.isArray(drawing) && drawing.length ? 1 : 0);
}
export function revisionControls(host,shot,{change,button,tell}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=el('details');panel.className='settings';panel.append(el('summary','Animation passes · revisions & frame review'));host.append(panel);
 const note=el('p','Save the editable drawing and rig at each pass. Compare drawings at the same frame, draw feedback on the right-hand revision, then save the note. Rig revisions can be restored; use saved rendered-media versions below to compare 3D visuals. Approvals apply only to saved revisions.');panel.append(note);
 const gates=el('div');gates.className='animation-pass-gates';gates.setAttribute('role','group');gates.setAttribute('aria-label','Animation-pass gates');
 gates.append(el('p','Manual gates (Blocking → Breakdowns → Polish). Flips only change a saved revision\'s status — they do not verify craft. Approve still requires earlier passes Approved and notes resolved.'));
 for(const passName of ANIMATION_PASSES){
  const row=el('div');row.className='animation-pass-gate-row';
  const lab=el('span',passName);lab.className='animation-pass-gate-name';
  const statusEl=el('span');statusEl.className='animation-pass-gate-status';
  const refresh=()=>{const revs=(shot.animationRevisions||[]).filter(r=>r.pass===passName);statusEl.textContent=revs.length?(revs.find(r=>r.status==='Approved')||revs.at(-1)).status:'not started';};
  refresh();
  row.append(lab,statusEl);
  row.append(button('Approve '+passName,()=>{try{change(()=>flipAnimationPass(shot,passName,'Approved'));}catch(e){tell(e.message);}}));
  row.append(button('Needs changes',()=>{try{change(()=>flipAnimationPass(shot,passName,'Needs changes'));}catch(e){tell(e.message);}}));
  row.append(button('WIP',()=>{try{change(()=>flipAnimationPass(shot,passName,'Work in progress'));}catch(e){tell(e.message);}}));
  gates.append(row);
 }
 panel.append(gates);

 function field(label,type='text',value=''){const l=el('label',label);l.className='field';const input=el(type==='select'?'select':type==='textarea'?'textarea':'input');if(type!=='select'&&type!=='textarea')input.type=type;input.value=value;input.setAttribute('aria-label',label);l.append(input);panel.append(l);return input;}
 const label=field('Revision label','text','Animation pass'),pass=field('Animation pass','select');for(const p of ANIMATION_PASSES)pass.add(new Option(p,p));
 panel.append(button('Save editable animation revision',()=>change(()=>saveAnimationRevision(shot,label.value,pass.value))));
 const left=field('Compare drawing A','select'),right=field('Review drawing B','select');left.add(new Option('Current working drawing','current'));
 for(const r of shot.animationRevisions||[]){left.add(new Option(r.label+' · '+r.pass,r.id));right.add(new Option(r.label+' · '+r.pass+' · '+r.status,r.id));}right.value=shot.animationRevisions?.at(-1)?.id||'';
 const frame=field('Revision review frame','number',0);frame.min=0;frame.step=1;
 const canvases=el('div');canvases.style.display='grid';canvases.style.gridTemplateColumns='repeat(auto-fit,minmax(260px,1fr))';canvases.style.gap='12px';panel.append(canvases);
 const a=el('canvas'),b=el('canvas');for(const [canvas,name] of [[a,'Drawing revision A'],[b,'Drawing revision B and annotation canvas']]){canvas.width=960;canvas.height=540;canvas.style.width='100%';canvas.style.touchAction='none';canvas.setAttribute('aria-label',name);canvases.append(canvas);}
 let marks=[],drawing=null;const selected=()=>shot.animationRevisions?.find(r=>r.id===right.value),info=el('p');info.setAttribute('role','status');panel.append(info);
 let clearUnsavedMarksBtn;
 function syncClearUnsavedMarksButton(){
  if(!clearUnsavedMarksBtn)return;
  const clearable=clearableUnsavedFrameMarkCount(marks,drawing);
  clearUnsavedMarksBtn.disabled=!clearable;
  clearUnsavedMarksBtn.title=clearable
   ? ('Clear '+clearable+' unsaved mark'+(clearable===1?'':'s')+' on this frame')
   : 'No unsaved frame marks to clear';
 }

 const feedback=field('Revision frame feedback','textarea');
 function paintMarks(paths){const ctx=b.getContext('2d');ctx.strokeStyle='#df3153';ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';for(const path of paths){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x*960,y*540):ctx.moveTo(x*960,y*540));if(path.length===1){ctx.lineTo(path[0][0]*960+.1,path[0][1]*540);}ctx.stroke();}}
 function paint(){if(!panel.open)return;const r=selected(),l=left.value==='current'?shot:shot.animationRevisions?.find(r=>r.id===left.value),f=Math.max(0,Math.min((r?.seconds||shot.seconds)*24-1,Math.round(Number(frame.value)||0)));frame.value=f;frame.max=(r?.seconds||shot.seconds)*24-1;
  for(const [canvas,revision] of [[a,l],[b,r]]){if(revision?.drawing)paintDrawing(canvas,sampleMotion(revision.drawing,Math.min(f,revision.seconds*24-1)));else{canvas.width=960;const ctx=canvas.getContext('2d');ctx.fillStyle='#15202d';ctx.fillRect(0,0,960,540);ctx.fillStyle='#e5e8ee';ctx.font='24px sans-serif';ctx.fillText('No drawing in this revision',30,70);}}
  paintMarks([...(r?.notes||[]).filter(n=>n.frame===f&&!n.resolved).flatMap(n=>n.marks),...marks,...(drawing?[drawing]:[])]);
  info.textContent=r?`${r.pass} · ${r.status} · frame ${f} · ${r.notes.filter(n=>!n.resolved).length} open notes`:'Save an editable revision to review it.';
 }
 const reset=()=>{marks=[];drawing=null;paint();syncClearUnsavedMarksButton();};left.onchange=reset;right.onchange=reset;frame.onchange=reset;panel.addEventListener('toggle',paint);
 const point=e=>{const rect=b.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))];};
 b.onpointerdown=e=>{if(e.button!==0||!selected()||marks.length>=50)return;e.preventDefault();b.setPointerCapture(e.pointerId);drawing=[point(e)];paint();syncClearUnsavedMarksButton();};b.onpointermove=e=>{if(drawing&&drawing.length<500){drawing.push(point(e));paint();}};b.onpointerup=()=>{if(drawing){marks.push(drawing);drawing=null;paint();syncClearUnsavedMarksButton();}};b.onpointercancel=()=>{drawing=null;paint();syncClearUnsavedMarksButton();};
 clearUnsavedMarksBtn=button('Clear unsaved frame marks',()=>{
  const clearable=clearableUnsavedFrameMarkCount(marks,drawing);
  if(!clearable){tell('No unsaved frame marks to clear.');syncClearUnsavedMarksButton();return;}
  reset();
 });
 syncClearUnsavedMarksButton();
 panel.append(clearUnsavedMarksBtn,button('Save note on revision frame',()=>{const r=selected(),text=feedback.value.trim(),f=Number(frame.value);if(!r||!text){tell('Select a revision and enter feedback.');return;}change(()=>{r.notes.push({text,frame:f,resolved:false,marks:structuredClone(marks)});r.status='Needs changes';});}),button('Approve selected animation pass',()=>change(()=>approveRevision(shot,right.value))),button('Restore editable revision',()=>{const r=selected();if(!r)return;change(()=>{for(const key of ['drawing','rig3d'])if(r[key])shot[key]=structuredClone(r[key]);else delete shot[key];shot.seconds=r.seconds;shot.production??={};shot.production.Animation='Needs changes';});tell('Editable revision restored. Re-render the shot to update its attached media.');}),button('Remove selected editable revision',()=>change(()=>shot.animationRevisions=(shot.animationRevisions||[]).filter(r=>r.id!==right.value))));
 for(const r of shot.animationRevisions||[])for(const n of r.notes){const row=el('div');row.append(el('p',r.label+' · frame '+n.frame+' · '+n.text),button('View '+r.label+' frame '+n.frame,()=>{right.value=r.id;frame.value=n.frame;reset();}),button(n.resolved?'Reopen revision note':'Resolve revision note',()=>change(()=>{n.resolved=!n.resolved;if(!n.resolved)r.status='Needs changes';})));panel.append(row);}
}
export function mediaComparison(host,shot,{button}){
 if(!(shot.versions||[]).length)return;
 const panel=document.createElement('details');panel.className='settings';const summary=document.createElement('summary');summary.textContent='Compare rendered versions · same timeline frame';panel.append(summary);host.append(panel);
 const selects=['Rendered version A','Rendered version B'].map(name=>{const select=document.createElement('select');select.setAttribute('aria-label',name);for(const v of shot.versions)select.add(new Option(v.label+' · '+(v.media.name||v.media.filename),v.id));panel.append(select);return select;});selects[1].value=shot.versions.at(-1).id;
 const frame=document.createElement('input');frame.type='number';frame.min=0;frame.max=shot.seconds*24-1;frame.step=1;frame.value=0;frame.setAttribute('aria-label','Rendered comparison frame');panel.append(frame);
 const row=document.createElement('div');row.style.display='grid';row.style.gridTemplateColumns='repeat(auto-fit,minmax(260px,1fr))';row.style.gap='12px';const status=document.createElement('p');status.setAttribute('role','status');panel.append(row,status);let media=[];
 function seek(){const f=Math.max(0,Math.min(shot.seconds*24-1,Math.round(Number(frame.value)||0)));frame.value=f;status.textContent='Requested timeline frame '+f+' (24 fps). Video seeking follows the source timestamps; variable-frame-rate sources may not match exactly.';for(const item of media){if(item.tagName==='VIDEO'&&item.readyState>=1){const t=f/24;if(t>=item.duration){status.textContent='One version ends before frame '+f+'. Choose an earlier frame.';continue;}item.pause();item.currentTime=t;}}}
 function load(){for(const item of media){if(item.tagName==='VIDEO'){item.pause();item.removeAttribute('src');item.load();}}media=[];row.replaceChildren();for(const select of selects){const version=shot.versions.find(v=>v.id===select.value);if(!version)continue;const f=version.media,name=f.name||f.filename,video=/\.(mp4|webm|mov)$/i.test(name),item=document.createElement(video?'video':'img');item.style.width='100%';item.setAttribute('aria-label',select.getAttribute('aria-label')+' preview');if(video){item.muted=true;item.preload='auto';item.onloadedmetadata=seek;}item.onerror=()=>status.textContent='A saved media file could not load. Use Check project media to restore it.';item.src='/view?'+new URLSearchParams({filename:name,subfolder:f.subfolder||'',type:f.type||'input'});row.append(item);media.push(item);}seek();}
 panel.append(button('Load selected comparison',load));frame.onchange=seek;panel.addEventListener('toggle',()=>{if(!panel.open)for(const item of media)if(item.tagName==='VIDEO')item.pause();});
}
