import {usesBoards} from './director-planning-state.js';
import {validateRevisions,revisionControls,mediaComparison,ANIMATION_PASSES} from './director-revisions.js';
import {validateShotTitleOverlay, titleOverlayControls} from './director-title-styles.js';
export {ANIMATION_PASSES};
// Local production records; no media is read to build the production overview.
export const STAGES=['Storyboards','Layout','Animation','Cleanup / color','Lighting / FX','Composite','Sound'];
export const STATUSES=['Not started','In progress','Needs changes','Ready for review','Approved','Not needed'];
export function validateProduction(shot,assets){
 validateRevisions(shot);
 if(shot.subtitle!==undefined&&typeof shot.subtitle!=='string')throw Error('Subtitle text must contain text.');
 validateShotTitleOverlay(shot);
 if(shot.assetIds!==undefined&&(!Array.isArray(shot.assetIds)||new Set(shot.assetIds).size!==shot.assetIds.length||shot.assetIds.some(id=>!assets.some(a=>a.id===id))))throw Error('Shot asset links must refer to assets in this project.');
 if(shot.production!==undefined){if(!shot.production||typeof shot.production!=='object'||Array.isArray(shot.production))throw Error('Invalid production tasks.');for(const [stage,status] of Object.entries(shot.production))if(!STAGES.includes(stage)||!STATUSES.includes(status))throw Error('Invalid production stage or status.');}
 if(shot.versions!==undefined){
  if(!Array.isArray(shot.versions)||shot.versions.length>100)throw Error('Keep at most 100 saved versions per shot.');
  const ids=new Set();for(const v of shot.versions){
   if(!v||typeof v.id!=='string'||!v.id||ids.has(v.id)||typeof v.label!=='string'||typeof v.created!=='string'||!v.media||typeof(v.media.name||v.media.filename)!=='string'||!Array.isArray(v.notes))throw Error('Invalid shot version.');ids.add(v.id);
   for(const n of v.notes)if(!n||typeof n.text!=='string'||typeof n.resolved!=='boolean'||!Number.isInteger(n.frame)||n.frame<0||n.frame>=86400)throw Error('Review notes need text and a frame from 0 to 86,399.');
  }
 }
}
export function animationPassStatus(shot){
 const status={};
 for(const pass of ANIMATION_PASSES){
  const revs=(shot.animationRevisions||[]).filter(r=>r.pass===pass);
  if(!revs.length){status[pass]={status:'Missing'};continue;}
  const approved=revs.find(r=>r.status==='Approved');
  if(approved){status[pass]={status:'Approved',id:approved.id,label:approved.label};continue;}
  const needs=[...revs].reverse().find(r=>r.status==='Needs changes');
  if(needs){status[pass]={status:'Needs changes',id:needs.id,label:needs.label};continue;}
  const latest=revs.at(-1);status[pass]={status:latest.status,id:latest.id,label:latest.label};
 }
 return status;
}
export function animationPassLabel(shot){
 const status=animationPassStatus(shot);
 return ANIMATION_PASSES.map(pass=>{
  const st=status[pass].status;
  return pass+': '+(st==='Missing'?'not started':st);
 }).join(' · ');
}
/** Compact B/Bd/P tokens for dense overview/delivery rows. */
export function animationPassCompact(shot){
 const status=animationPassStatus(shot),short={Blocking:'B',Breakdowns:'Bd',Polish:'P'};
 const token=st=>st==='Approved'?'✓':st==='Missing'?'—':st==='Needs changes'?'needs':st==='Work in progress'?'WIP':st;
 return ANIMATION_PASSES.map(pass=>short[pass]+' '+token(status[pass].status)).join(' · ');
}
export const ANIMATION_PASS_FILTERS=[
 {id:'all',label:'All shots'},
 {id:'gated',label:'Open animation-pass gates'},
 {id:'blocking',label:'Blocking not Approved'},
 {id:'breakdowns',label:'Breakdowns not Approved'},
 {id:'polish',label:'Polish not Approved'},
 {id:'complete',label:'All three passes Approved'},
];
export function shotMatchesAnimationPassFilter(shot,filterId){
 const id=filterId||'all';
 if(id==='all')return true;
 const status=animationPassStatus(shot);
 if(id==='gated')return animationPassGateMessages(shot).length>0;
 if(id==='complete')return ANIMATION_PASSES.every(pass=>status[pass].status==='Approved');
 if(id==='blocking')return status.Blocking.status!=='Approved';
 if(id==='breakdowns')return status.Breakdowns.status!=='Approved';
 if(id==='polish')return status.Polish.status!=='Approved';
 return true;
}
export function animationPassGateMessages(shot){
 const messages=[],status=animationPassStatus(shot),revs=shot.animationRevisions||[];
 const open=revs.reduce((n,r)=>n+r.notes.filter(x=>!x.resolved).length,0);
 if(open)messages.push(open+' unresolved animation-pass notes.');
 if(status.Breakdowns.status!=='Missing'&&status.Blocking.status!=='Approved')messages.push('Breakdowns started before Blocking is Approved.');
 if(status.Polish.status!=='Missing'&&status.Breakdowns.status!=='Approved')messages.push('Polish started before Breakdowns is Approved.');
 if(revs.length&&status.Blocking.status!=='Approved')messages.push('Blocking animation pass is not Approved.');
 const stage=shot.production?.Animation;
 if(stage==='Ready for review'||stage==='Approved'){
  if(!revs.length)messages.push('Animation is '+stage+' without saved Blocking → Breakdowns → Polish revisions.');
  else for(const pass of ANIMATION_PASSES)if(status[pass].status!=='Approved')messages.push(pass+' pass is not Approved for Animation '+stage+'.');
 }
 return messages;
}
/** Attached finished clip, or every storyboard panel has media. */
export function shotHasMedia(shot){
 if(usesBoards(shot))return !!(shot.panels?.length&&shot.panels.every(p=>p.media));
 return !!shot.media;
}
export function shotOpenNotesCount(shot){
 return [...(shot.versions||[]),...(shot.animationRevisions||[])].reduce((n,v)=>n+v.notes.filter(x=>!x.resolved).length,0);
}
export function shotHasOpenNotes(shot){return shotOpenNotesCount(shot)>0;}
export function shotHasNeedsChanges(shot){return Object.values(shot.production||{}).includes('Needs changes');}
export function shotHasReadyForReview(shot){return Object.values(shot.production||{}).includes('Ready for review');}
/** Status filters beyond animation-pass gates — queues already counted in the overview strip. */
export const PRODUCTION_STATUS_FILTERS=[
 {id:'all',label:'All statuses'},
 {id:'missing-media',label:'Missing media'},
 {id:'open-notes',label:'Open notes'},
 {id:'needs-changes',label:'Needs changes'},
 {id:'ready-for-review',label:'Ready for review'},
];
export function shotMatchesProductionStatusFilter(shot,filterId){
 const id=filterId||'all';
 if(id==='all')return true;
 if(id==='missing-media')return !shotHasMedia(shot);
 if(id==='open-notes')return shotHasOpenNotes(shot);
 if(id==='needs-changes')return shotHasNeedsChanges(shot);
 if(id==='ready-for-review')return shotHasReadyForReview(shot);
 return true;
}
/** Scene options for Production overview: All scenes + each project scene (by id). Session UI only. */
export function productionOverviewSceneFilters(project){
 const scenes=Array.isArray(project?.scenes)?project.scenes:[];
 return [{id:'all',label:'All scenes'},...scenes.map((scene,i)=>{
  const id=typeof scene?.id==='string'?scene.id:'';
  const title=typeof scene?.title==='string'?scene.title.trim():'';
  return {id,label:title||('Scene '+(i+1))};
 }).filter(f=>f.id)];
}
export function shotMatchesProductionSceneFilter(scene,filterId){
 const id=filterId||'all';
 if(id==='all')return true;
 return !!(scene&&scene.id===id);
}
/** Attention rank for overview sort: gated first, then missing media, open notes, needs changes. Does not flip gates. */
export function productionOverviewAttention(shot){
 return {
  gated:animationPassGateMessages(shot).length>0?1:0,
  missing:shotHasMedia(shot)?0:1,
  notes:shotHasOpenNotes(shot)?1:0,
  changes:shotHasNeedsChanges(shot)?1:0,
  review:shotHasReadyForReview(shot)?1:0,
 };
}
export function compareProductionOverviewAttention(a,b){
 return (b.gated-a.gated)||(b.missing-a.missing)||(b.notes-a.notes)||(b.changes-a.changes)||(b.review-a.review)||0;
}

export function productionSummary(project){
 const shots=project.scenes.flatMap(s=>s.shots);
 const passCounts={blocking:0,breakdowns:0,polish:0,gated:0,complete:0};
 for(const shot of shots){
  const status=animationPassStatus(shot);
  if(status.Blocking.status==='Approved')passCounts.blocking+=1;
  if(status.Breakdowns.status==='Approved')passCounts.breakdowns+=1;
  if(status.Polish.status==='Approved')passCounts.polish+=1;
  if(ANIMATION_PASSES.every(pass=>status[pass].status==='Approved'))passCounts.complete+=1;
  if(animationPassGateMessages(shot).length)passCounts.gated+=1;
 }
 return {shots:shots.length,media:shots.filter(shotHasMedia).length,changes:shots.filter(shotHasNeedsChanges).length,review:shots.filter(shotHasReadyForReview).length,notes:shots.reduce((n,s)=>n+shotOpenNotesCount(s),0),passes:passCounts};
}
export function saveVersion(shot){
 if(!shot.media)throw Error('Attach an image or clip before saving a version.');
 shot.versions??=[];if(shot.versions.length>=100)throw Error('This shot already has 100 versions.');
 shot.versions.push({id:crypto.randomUUID(),label:'Version '+(shot.versions.length+1),created:new Date().toISOString(),media:structuredClone(shot.media),audio:shot.audio?structuredClone(shot.audio):null,notes:[]});
}
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function shotCast(parent,project,shot,{change,button}){
 parent.append(el('h4','Cast & set for this shot'));
 parent.append(el('p',shot.assetIds===undefined?'Using all visual assets. Choose specific assets to keep unrelated characters out of this shot’s brief and animatic.':'Only checked visual assets are in this shot’s brief and animatic. Build image still sends at most three pictures, including the storyboard.','hint'));
 const visual=project.assets.filter(a=>['character','set','prop'].includes(a.kind));
 for(const asset of visual){const label=el('label',null,'asset-check'),input=el('input');input.type='checkbox';input.checked=shot.assetIds===undefined||shot.assetIds.includes(asset.id);input.onchange=()=>change(()=>{shot.assetIds??=visual.map(a=>a.id);shot.assetIds=shot.assetIds.filter(id=>id!==asset.id);if(input.checked)shot.assetIds.push(asset.id);});label.append(input,document.createTextNode(asset.kind+': '+asset.name));parent.append(label);}
 if(!visual.length)parent.append(el('p','Add characters, sets or props in the asset library first.','hint'));
 parent.append(button('Use no visual assets',()=>change(()=>shot.assetIds=[])),button('Use all visual assets',()=>change(()=>delete shot.assetIds)));
}
export function productionControls(card,project,shot,{change,button,tell}){
 const panel=el('details',null,'production-controls settings');panel.dataset.shotId=shot.id;
 panel.append(el('summary','Production, cast & review'));
 const subtitleLabel=el('label','Subtitle text (whole shot)','field'),subtitle=el('textarea');subtitle.value=shot.subtitle||'';subtitle.placeholder='Only text the audience should read';
 let subtitleGroup=Symbol();subtitle.onfocus=()=>{subtitleGroup=Symbol();};subtitle.oninput=()=>change(()=>shot.subtitle=subtitle.value,{redraw:false,group:subtitleGroup});subtitleLabel.append(subtitle);panel.append(subtitleLabel);
 panel.append(el('p','Exports as one SRT caption for this shot’s full duration. Dialogue / sound notes remain separate. Subtitles are not burned into the MP4.','hint'));
 titleOverlayControls(panel, project, shot, {change});
 panel.append(el('p','Track the work for this shot. “Not needed” skips stages your animation style does not require. Statuses are your decisions, not automatic quality checks. Animation passes (Blocking → Breakdowns → Polish) under Revisions are manual craft gates — not automatic quality checks. Production overview and Delivery list them; mark Animation Ready/Approved only after the passes you use are Approved.','hint'));
 const tasks=el('div',null,'production-tasks');
 for(const stage of STAGES){const label=el('label',stage,'field'),select=el('select');select.setAttribute('aria-label',stage+' status');for(const s of STATUSES)select.add(new Option(s,s));select.value=shot.production?.[stage]||'Not started';select.onchange=()=>change(()=>{shot.production??={};shot.production[stage]=select.value;});label.append(select);tasks.append(label);}panel.append(tasks);
 panel.append(el('p','Cast for this shot is on the Plan stage. Marking Review finished hides this panel and leaves the shot’s notes in the project.','hint'));
 panel.append(el('h4','Versions & review notes'));
 panel.append(el('p','Save the attached media as a version before replacing it. Versions retain file references, not file copies. Review frames use the 24 fps export timeline, starting at frame 0.','hint'));
 panel.append(button('Save attached media as version',()=>change(()=>saveVersion(shot))));
 for(const version of [...(shot.versions||[])].reverse()){
  const row=el('section',null,'review-version');row.append(el('h4',version.label));row.append(el('p',(version.media.name||version.media.filename)+' · '+version.created,'hint'));
  row.append(button('Use this version',()=>change(()=>{shot.media=structuredClone(version.media);if(version.audio)shot.audio=structuredClone(version.audio);else delete shot.audio;})));
  const noteLabel=el('label','Feedback','field'),note=el('textarea');note.placeholder='What needs to change?';noteLabel.append(note);
  const frameLabel=el('label','Frame (24 fps, starting at 0)','field'),frame=el('input');frame.type='number';frame.min=0;frame.max=shot.seconds*24-1;frame.step=1;frame.value=0;frameLabel.append(frame);row.append(noteLabel,frameLabel);
  row.append(button('Add review note',()=>{const text=note.value.trim(),f=Number(frame.value);if(!text||!Number.isInteger(f)||f<0||f>=shot.seconds*24){tell('Enter feedback and a frame inside this shot.');return;}change(()=>version.notes.push({text,frame:f,resolved:false}));}));
  for(const n of version.notes){const item=el('div',null,'review-note');item.append(el('p','Frame '+n.frame+' · '+n.text));item.append(button(n.resolved?'Reopen note':'Resolve note',()=>change(()=>n.resolved=!n.resolved)));item.classList.toggle('resolved',n.resolved);row.append(item);}panel.append(row);
 }
 revisionControls(panel,shot,{change,button,tell});mediaComparison(panel,shot,{button});
 card.append(panel);
}
