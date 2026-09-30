import {STORY_FIELDS,SCENE_FIELDS,ARC_FIELDS,ASSET_STATES,boardFrames,fitPanels,planningBasis,planningIssues,removeBeat,removeBeatConfirmMessage,clearAllBeats,clearAllBeatsConfirmMessage,storyBeatCount,removePanelConfirmMessage,removeAudioTrackConfirmMessage,reorderBeatOptions,destIndexFromBeatPlace,moveBeat,reorderPanelOptions,destIndexFromPanelPlace,movePanel,ensureAudioTrackIds,reorderAudioTrackOptions,destIndexFromAudioTrackPlace,moveAudioTrack,planningDocument,usesBoards,addPanel,removePanel,duplicatePanel,setPanelFrames,listScenePlanSources,copyScenePlan} from './director-planning-state.js';
import {countWords,feedManuscript,MANUSCRIPT_MAX_CHARS} from './director-manuscript.js';
import {shotCast} from './director-production.js';
import {audioOverviewControls} from './director-audio-overview.js';
const labels={premise:'Premise · who wants what, and what stands in the way?',audience:'Audience & tone',theme:'Theme · the question your story explores',worldRules:'World rules & continuity',ending:'Ending · what changes?',purpose:'Why this scene exists',goal:'Character goal',obstacle:'Obstacle',turn:'Turning point',outcome:'Outcome · what changes?',script:'Scene script',want:'What they want',need:'What they need',flaw:'Flaw / fear',change:'How they change'};
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
function section(parent,title,key){const d=el('details');d.className='settings planning-section';d.dataset.plan=key;d.append(el('summary',title));parent.append(d);return d;}
function select(parent,label,items,value,fn){const l=el('label',label);l.className='field';const s=el('select');s.setAttribute('aria-label',label);for(const [v,t] of items)s.add(new Option(t,v));s.value=value;s.onchange=()=>fn(s.value);l.append(s);parent.append(l);return s;}
function move(list,index,delta){const to=index+delta;if(to>=0&&to<list.length)[list[index],list[to]]=[list[to],list[index]];}
export function storyRoom(parent,project,{field,button,change,download,tell}){
 parent.replaceChildren();const d=section(parent,'Story Room · premise, characters & beats','story-room');
 d.append(el('p','Plan the story before making finished shots. Start with the premise, then add only the detail you need.'));
 for(const k of STORY_FIELDS)field(d,labels[k],project.story?.[k],(v,o)=>change(()=>{project.story??={beats:[]};project.story[k]=v;},o),'textarea');
 const manuscriptHost=el('div');manuscriptHost.className='manuscript-block';
 manuscriptHost.append(el('p','Manuscript · draft scenes in plain text. A line with only *** starts a new scene. A line starting with # Title names the scene. Feed manuscript appends scenes (existing ones stay). Undo restores.'));
 const wordMeta=el('p');wordMeta.className='hint manuscript-words';
 const syncWords=()=>{const text=project.story?.manuscript||'';wordMeta.textContent=countWords(text)+' words · '+(text.length||0)+' / '+MANUSCRIPT_MAX_CHARS+' characters (not sent in assistant story context).';};
 field(manuscriptHost,'Manuscript',project.story?.manuscript||'',(v,o)=>{
  change(()=>{project.story??={beats:[]};project.story.manuscript=v;},o);
  syncWords();
 },'textarea');
 syncWords();manuscriptHost.append(wordMeta);
 manuscriptHost.append(button('Feed manuscript',()=>{
  try{
   let summary;
   change(()=>{
    project.story??={beats:[]};
    summary=feedManuscript(project,project.story.manuscript||'');
   });
   tell?.(summary.count+' scene'+(summary.count===1?'':'s')+' appended from manuscript ('+summary.words+' words). Existing scenes kept. Undo restores.');
  }catch(e){tell?.(e.message);}
 }));
 d.append(manuscriptHost);
 const board=el('div');board.className='beat-board';d.append(board);
 for(const [i,b] of (project.story?.beats||[]).entries()){
  const card=el('section');card.className='beat-card';card.dataset.beatId=b.id;card.append(el('h3',Beat ));
  field(card,'Beat title',b.title,(v,o)=>change(()=>b.title=v,o));field(card,'Act / sequence',b.act,(v,o)=>change(()=>b.act=v,o));field(card,'Event, choice & consequence',b.summary,(v,o)=>change(()=>b.summary=v,o),'textarea');
  select(card,'Pays off an earlier beat',[['','No setup link'],...project.story.beats.filter(x=>x!==b).map(x=>[x.id,x.title])],b.setupId||'',v=>change(()=>{if(v)b.setupId=v;else delete b.setupId;}));
  const actions=el('div');actions.className='actions';actions.append(button('Move beat earlier',()=>change(()=>move(project.story.beats,i,-1))),button('Move beat later',()=>change(()=>move(project.story.beats,i,1))),button('Remove beat',()=>{if(!confirm(removeBeatConfirmMessage(b)))return;const label=(typeof b.title==='string'&&b.title.trim())?b.title.trim():'Untitled beat';change(()=>removeBeat(project,b.id));tell?.(label+' removed. Undo restores.');}));card.append(actions);
  const reorderRow=el('div');reorderRow.className='beat-reorder';
  const reorderLabel=el('label','Place');reorderLabel.className='field';
  const reorderSel=el('select');reorderSel.setAttribute('aria-label','Place beat in story list');
  const ropts=reorderBeatOptions(project,b.id);
  const canReorder=ropts.length>=2;
  if(!canReorder){reorderSel.add(new Option('Need another story beat',''));reorderSel.disabled=true;}
  else{for(const opt of ropts)reorderSel.add(new Option(opt.label,opt.value));reorderSel.value='end';}
  reorderLabel.append(reorderSel);reorderRow.append(reorderLabel);
  const reorderBtn=button('Reorder beat',()=>{
   if(!canReorder){tell?.('Add another story beat to reorder.');return;}
   const place=reorderSel.value;if(!place){tell?.('Choose Start, End, or After a beat.');return;}
   try{
    const destIndex=destIndexFromBeatPlace(project,b.id,place);
    change(()=>{moveBeat(project,b.id,destIndex);});
    tell?.((b.title||'Untitled beat')+' reordered in the story beat list. Undo restores.');
    requestAnimationFrame(()=>document.querySelector('.beat-card[data-beat-id="'+CSS.escape(b.id)+'"]')?.scrollIntoView({block:'nearest'}));
   }catch(e){tell?.(e.message);}
  });
  reorderBtn.disabled=!canReorder;reorderRow.append(reorderBtn);card.append(reorderRow);
  const reorderHint=el('p',canReorder
   ?'Jump this beat to Start, End, or After another beat (same as many Earlier/Later clicks). Beat id stays. Undo restores.'
   :'Add another story beat to place here. Move beat earlier / later also step one position at a time.');
  reorderHint.className='hint beat-reorder-hint';card.append(reorderHint);
  board.append(card);
 }
  const clearAllBeatsBtn=button('Clear all beats',()=>{
  const n=storyBeatCount(project);
  if(!n){tell?.('No story beats to clear.');return;}
  if(!confirm(clearAllBeatsConfirmMessage(project)))return;
  change(()=>{clearAllBeats(project);});
  tell?.(n+' story beat'+(n===1?'':'s')+' cleared. Undo restores.');
 });
 function syncClearAllBeatsBtn(){
  const n=storyBeatCount(project);
  clearAllBeatsBtn.disabled=!n;
  clearAllBeatsBtn.title=n?('Clear all '+n+' story beat'+(n===1?'':'s')+' (confirms first; Undo restores)'):'No story beats to clear.';
 }
 syncClearAllBeatsBtn();
 d.append(button('Add story beat',()=>{change(()=>{project.story??={};project.story.beats??=[];project.story.beats.push({id:crypto.randomUUID(),title:'New beat',act:'',summary:''});});}),clearAllBeatsBtn,button('Export planning document',()=>download(planningDocument(project),'cartoon-plan.txt','text/plain;charset=utf-8')));
 d.append(el('p','Character motivations and arcs are in the Character, set & asset library. Link beats to scenes below.'));
}
export function scenePlanning(parent,project,scene,{field,button,change,tell}){
 parent.replaceChildren();const d=section(parent,'Scene plan · purpose, script & story links','scene-plan');
 for(const k of SCENE_FIELDS)field(d,labels[k],scene.plan?.[k],(v,o)=>change(()=>{scene.plan??={};scene.plan[k]=v;},o),'textarea');
 for(const b of project.story?.beats||[]){const l=el('label'),c=el('input');c.type='checkbox';c.checked=scene.plan?.beatIds?.includes(b.id)||false;c.onchange=()=>change(()=>{scene.plan??={};scene.plan.beatIds=(scene.plan.beatIds||[]).filter(id=>id!==b.id);if(c.checked)scene.plan.beatIds.push(b.id);});l.className='asset-check';l.append(c,document.createTextNode('Story beat: '+b.title));d.append(l);}
 if(!project.story?.beats?.length)d.append(el('p','Add story beats in the Story Room to link them to this scene.'));
 const sources=listScenePlanSources(project,scene.id);
 const copyHint=el('p',sources.length
  ?'Copy purpose, script and/or linked beats from another scene (for example after Split left this scene’s plan empty). Undo restores.'
  :'Add a plan on another scene to copy it here. Split keeps the plan on the original scene only.');
 copyHint.className='hint';d.append(copyHint);
 const copyBox=el('div');copyBox.className='actions scene-plan-copy';
 const srcLabel=el('label','Copy plan from scene');srcLabel.className='field';
 const srcSelect=el('select');srcSelect.setAttribute('aria-label','Copy plan from scene');
 srcSelect.disabled=!sources.length;
 if(!sources.length)srcSelect.add(new Option('No other scene plans',''));
 else for(const s of sources)srcSelect.add(new Option(s.title||'Untitled scene',s.id));
 srcLabel.append(srcSelect);copyBox.append(srcLabel);
 const modeLabel=el('label','Copy plan mode');modeLabel.className='field';
 const modeSelect=el('select');modeSelect.setAttribute('aria-label','Copy plan mode');
 modeSelect.add(new Option('All (fields + beats)','all'));
 modeSelect.add(new Option('Fields only','fields'));
 modeSelect.add(new Option('Beat links only','beats'));
 modeSelect.value='all';modeLabel.append(modeSelect);copyBox.append(modeLabel);
 const copyBtn=button('Copy scene plan',()=>{
  if(!sources.length){tell?.('No other scene has a plan to copy.');return;}
  const source=project.scenes.find(s=>s.id===srcSelect.value);
  if(!source){tell?.('Choose a source scene.');return;}
  let summary;
  change(()=>{summary=copyScenePlan(scene,source,modeSelect.value);});
  const bits=[];
  if(summary.mode!=='beats')bits.push(summary.fields+' field'+(summary.fields===1?'':'s'));
  if(summary.mode!=='fields')bits.push(summary.beats+' beat link'+(summary.beats===1?'':'s'));
  tell?.('Copied plan from '+(source.title||'Untitled scene')+' ('+bits.join(', ')+'). Undo restores.');
 });
 copyBtn.disabled=!sources.length;copyBox.append(copyBtn);d.append(copyBox);
}
export function assetPlanning(parent,asset,{field,change}){
 const d=section(parent,'Character arc & production readiness','asset-'+asset.id);
 select(d,'Asset readiness',ASSET_STATES.map(s=>[s,s]),asset.readiness||'Not started',v=>change(()=>asset.readiness=v));
 if(asset.kind==='character')for(const k of ARC_FIELDS)field(d,labels[k],asset.arc?.[k],(v,o)=>change(()=>{asset.arc??={};asset.arc[k]=v;},o),'textarea');
}
export function shotPlanning(parent,project,scene,shot,{field,button,change,attach,tell}){
 const d=section(parent,'Storyboard panels & sound tracks','shot-plan-'+shot.id);
 d.append(el('p','This plan is the shot the animatic and assembly use: the action, the duration at 24 frames a second, these panels, and the cast below. Picture source chooses the storyboard or the recorded clip. Editing a panel’s frames keeps the total on that duration.'));
 const needed=shot.seconds*24,covered=boardFrames(shot),picture=usesBoards(shot)?'Storyboard panels':shot.media?'Recorded clip':'No picture attached yet';
 d.append(el('p',`Animatic and assembly: ${shot.seconds}s · ${needed} frames · ${picture}.`));
 if(usesBoards(shot)&&shot.media)d.append(el('p','A clip is attached. The animatic still plays the storyboard until you choose Finished shot.'));
 if(!usesBoards(shot)&&shot.panels?.length)d.append(el('p','The storyboard stays in the plan. The animatic plays the recorded clip.'));
 if(shot.panels?.length&&covered!==needed)d.append(el('p',`Storyboard is ${covered} frames. Fit panel timing so it matches this shot.`));
 select(d,'Picture source',[['clip','Finished shot / main attachment'],['boards','Storyboard panels']],shot.visualSource||'clip',v=>change(()=>shot.visualSource=v));
 const strip=el('div');strip.className='panel-strip';d.append(strip);
 for(const [i,p] of (shot.panels||[]).entries()){
  const card=el('section');card.className='board-card';card.dataset.panelId=p.id;card.append(el('h4',`Panel ${i+1}`));
  if(p.media){const img=el('img');img.alt=`Storyboard panel ${i+1}`;img.loading='lazy';img.src='/view?'+new URLSearchParams({filename:p.media.name||p.media.filename,subfolder:p.media.subfolder||'',type:p.media.type||'input'});card.append(img);}
  field(card,'Panel action / expression',p.action,(v,o)=>change(()=>p.action=v,o),'textarea');
  const frames=field(card,'Panel duration (frames)',p.frames,v=>change(()=>setPanelFrames(shot,i,Math.round(Number(v)))),'number');frames.max=86400;
  attach(card,'Panel drawing',p,'media','image/png,image/jpeg,image/webp');
  card.append(button('Panel earlier',()=>change(()=>move(shot.panels,i,-1))),button('Panel later',()=>change(()=>move(shot.panels,i,1))),button('Duplicate panel',()=>change(()=>duplicatePanel(shot,i))),button('Remove panel',()=>{if(!confirm(removePanelConfirmMessage(p,i)))return;change(()=>removePanel(shot,i));tell?.('Panel '+(i+1)+' removed. Undo restores.');}));
  const reorderRow=el('div');reorderRow.className='panel-reorder';
  const reorderLabel=el('label','Place');reorderLabel.className='field';
  const reorderSel=el('select');reorderSel.setAttribute('aria-label','Place panel in storyboard');
  const ropts=reorderPanelOptions(shot,p.id);
  const canReorder=ropts.length>=2;
  if(!canReorder){reorderSel.add(new Option('Need another storyboard panel',''));reorderSel.disabled=true;}
  else{for(const opt of ropts)reorderSel.add(new Option(opt.label,opt.value));reorderSel.value='end';}
  reorderLabel.append(reorderSel);reorderRow.append(reorderLabel);
  const reorderBtn=button('Reorder panel',()=>{
   if(!canReorder){tell?.('Add another storyboard panel to reorder.');return;}
   const place=reorderSel.value;if(!place){tell?.('Choose Start, End, or After a panel.');return;}
   try{
    const destIndex=destIndexFromPanelPlace(shot,p.id,place);
    change(()=>{movePanel(shot,p.id,destIndex);});
    tell?.('Panel '+(i+1)+' reordered in the storyboard. Undo restores.');
    requestAnimationFrame(()=>document.querySelector('.board-card[data-panel-id="'+CSS.escape(p.id)+'"]')?.scrollIntoView({block:'nearest'}));
   }catch(e){tell?.(e.message);}
  });
  reorderBtn.disabled=!canReorder;reorderRow.append(reorderBtn);card.append(reorderRow);
  const reorderHint=el('p',canReorder
   ?'Jump this panel to Start, End, or After another panel (same as many Earlier/Later clicks). Panel id and frames stay. Undo restores.'
   :'Add another storyboard panel to place here. Panel earlier / later also step one position at a time.');
  reorderHint.className='hint panel-reorder-hint';card.append(reorderHint);
  strip.append(card);
 }
 d.append(el('p',`${covered} storyboard frames / ${needed} shot frames`));
 d.append(button('Add storyboard panel',()=>change(()=>addPanel(shot))),button('Fit panel timing to shot',()=>change(()=>fitPanels(shot))));
 shotCast(d,project,shot,{change,button});
 if(shot.media&&!/\.(mp4|webm|mov|mkv)$/i.test(shot.media.name||shot.media.filename||''))d.append(button('Add main drawing as panel',()=>change(()=>{shot.panels??=[];shot.panels.push({id:crypto.randomUUID(),frames:24,action:shot.action||'',media:structuredClone(shot.media)});})));
 const sound=section(d,'Sound tracks · dialogue, music & effects','sound-'+shot.id);
 sound.append(el('p','Tracks mix with the shot’s existing sound. Start times are measured from the start of this shot; audio ends at the shot cut. Use low levels when layering sounds. Empty tracks are planning notes only.'));
 ensureAudioTrackIds(shot);
 for(const [i,t] of (shot.audioTracks||[]).entries()){
  const row=el('section');row.className='board-card';row.dataset.trackId=t.id;row.append(el('h4',`Sound track ${i+1}`));
  select(row,'Track type',[['dialogue','Dialogue'],['music','Music'],['effects','Effects']],t.kind,v=>change(()=>t.kind=v));
  field(row,'Track label',t.label,(v,o)=>change(()=>t.label=v,o));field(row,'Sound cue / direction',t.notes,(v,o)=>change(()=>t.notes=v,o),'textarea');
  const start=field(row,'Track start (seconds)',t.start,v=>change(()=>t.start=Number(v)),'number');start.min=0;start.step=1/24;
  const volume=field(row,'Track level (0–1)',t.volume,v=>change(()=>t.volume=Number(v)),'number');volume.min=0;volume.max=1;volume.step=.05;
  attach(row,'Track audio',t,'media','audio/*');
  if(t.media)audioOverviewControls(row,t,project,{button,change,splitTracks:shot.audioTracks,title:'Sound track overview',autoLoad:false});
  row.append(button('Track earlier',()=>change(()=>move(shot.audioTracks,i,-1))),button('Track later',()=>change(()=>move(shot.audioTracks,i,1))),button('Remove sound track',()=>{if(!confirm(removeAudioTrackConfirmMessage(t,i)))return;const label=(typeof t.label==='string'&&t.label.trim())?t.label.trim():('Sound track '+(i+1));change(()=>shot.audioTracks.splice(i,1));tell?.('"'+label+'" removed. Undo restores.');}));
  const reorderRow=el('div');reorderRow.className='sound-reorder';
  const reorderLabel=el('label','Place');reorderLabel.className='field';
  const reorderSel=el('select');reorderSel.setAttribute('aria-label','Place sound track in list');
  const ropts=reorderAudioTrackOptions(shot,t.id);
  const canReorder=ropts.length>=2;
  if(!canReorder){reorderSel.add(new Option('Need another sound track',''));reorderSel.disabled=true;}
  else{for(const opt of ropts)reorderSel.add(new Option(opt.label,opt.value));reorderSel.value='end';}
  reorderLabel.append(reorderSel);reorderRow.append(reorderLabel);
  const reorderBtn=button('Reorder track',()=>{
   if(!canReorder){tell?.('Add another sound track to reorder.');return;}
   const place=reorderSel.value;if(!place){tell?.('Choose Start, End, or After a track.');return;}
   try{
    const destIndex=destIndexFromAudioTrackPlace(shot,t.id,place);
    change(()=>{moveAudioTrack(shot,t.id,destIndex);});
    tell?.('Sound track '+(i+1)+' reordered. Undo restores.');
    requestAnimationFrame(()=>document.querySelector('.board-card[data-track-id="'+CSS.escape(t.id)+'"]')?.scrollIntoView({block:'nearest'}));
   }catch(e){tell?.(e.message);}
  });
  reorderBtn.disabled=!canReorder;reorderRow.append(reorderBtn);row.append(reorderRow);
  const reorderHint=el('p',canReorder
   ?'Jump this track to Start, End, or After another track (same as many Earlier/Later clicks). Track id and cues stay. Undo restores.'
   :'Add another sound track to place here. Track earlier / later also step one position at a time.');
  reorderHint.className='hint sound-reorder-hint';row.append(reorderHint);
  sound.append(row);
 }
 sound.append(button('Add sound track',()=>change(()=>{shot.audioTracks??=[];shot.audioTracks.push({id:crypto.randomUUID(),kind:'effects',label:'',notes:'',start:0,volume:.5});})));
 const approved=shot.planApproval===planningBasis(project,scene,shot);
 d.append(el('p',approved?'Plan approved · matches current script and assets':shot.planApproval?'Plan changed · review before making more animation':'Plan not approved yet'));
 d.append(button('Approve current shot plan',()=>change(()=>shot.planApproval=planningBasis(project,scene,shot))));
}
export function refreshPlanningIssues(parent,project,button,goToShot){
 parent.replaceChildren();const issues=planningIssues(project);
 parent.append(el('summary',`Planning checks · ${issues.length} reminders`));
 if(!issues.length){parent.append(el('p','No linked-plan changes or storyboard timing gaps found. Story quality still needs your review.'));return;}
 const rows=el('div');rows.className='planning-issues';parent.append(rows);
 for(const issue of issues){
  const shot=issue.shotId?project.scenes.flatMap(s=>s.shots).find(s=>s.id===issue.shotId):null;
  const label=(shot?shot.title+' — ':'')+issue.message;
  if(issue.shotId&&typeof button==='function'&&typeof goToShot==='function')rows.append(button(label,()=>goToShot(issue.shotId)));
  else rows.append(el('p',label));
 }
}
