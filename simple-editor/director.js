import {followShots} from './director-links.js';
import {createProjectStorage} from './director-storage.js';
import {imageReferences} from './director-references.js';
import {createReview} from './director-review.js';
import {lipSyncControls} from './director-lipsync.js';
import {dialogueWindows} from './director-audio-edit.js';
import {episodeAudioControls} from './director-episode-audio.js';
import {audioOverviewControls, formatOverviewTime, hoverTimeFromClientX, drawHoverTimeChip} from './director-audio-overview.js';
import {storyRoom,scenePlanning,assetPlanning,shotPlanning,refreshPlanningIssues} from './director-planning.js';
import {assemblyShots,usesBoards,setShotSeconds} from './director-planning-state.js';
import {createAnimatic} from './director-animatic.js';
import {createDelivery,softMuxCaptionsPayload,softMuxAfterExportBody,CAPTION_LANGUAGES,DEFAULT_CAPTIONS_LANGUAGE,assembleReadyGate,assembleLoudnessGate} from './director-delivery.js';
import {safeAreaGuideControls, withTitleBurns} from './director-title-styles.js';
import {createTimingCheck, setMediaTrim, clearMediaTrim, mediaTrim, scrubOutHandleSeconds, scrubHandlesToTrim, shotHoldSeconds, setShotHoldSeconds, clearShotHoldSeconds, clampShotHoldSeconds, shotHoldPreview, SHOT_HOLD_PRESETS, shotPlaybackSpeed, setShotPlaybackSpeed, clearShotPlaybackSpeed, clampShotPlaybackSpeed, shotPlaybackSpeedPreview, SHOT_PLAYBACK_SPEED_PRESETS, playbackSpeedsEqual,  shotTransition, setShotTransition, clearShotTransition, shotHasTransition, listTransitionSources, copyTransitionFromShot, transitionOverlaps, SHOT_TRANSITION_OPTIONS, mediaPeaksKey, MEDIA_PEAKS_BINS, isSilentPeaks, peaksFromSamples, luminanceEnergy, normalizePeaks} from './director-timing.js';
import {drawingControls} from './director-drawing.js';
import {exposureControls} from './director-exposure.js';
import {rig3DControls} from './director-3d-state.js';
import {uploadDirectorFile} from './director-upload.js';
import {createDirectorAssistant} from './director-assistant.js';
import {productionControls,productionSummary,animationPassLabel,animationPassCompact,animationPassGateMessages,ANIMATION_PASS_FILTERS,shotMatchesAnimationPassFilter,PRODUCTION_STATUS_FILTERS,shotMatchesProductionStatusFilter,productionOverviewSceneFilters,shotMatchesProductionSceneFilter,shotHasMedia,productionOverviewAttention,compareProductionOverviewAttention} from './director-production.js';
import {newProject,validateProject,duration,time,shotBrief,moveShotToScene,copyShotToScene,otherScenesForShot,findShotLocation,destIndexFromPlace,placeAfterOptions,splitSceneAtShot,joinSceneWithNext,canSplitSceneAtShot,canJoinSceneWithNext,canRemoveScene,removeShotConfirmMessage,removeSceneConfirmMessage,joinSceneConfirmMessage,countAssetLinkedShots,removeAssetConfirmMessage,moveShotInScene,reorderInSceneOptions,destIndexFromReorderPlace,findShotsByQuery,normalizeShotFindQuery} from './director-project.js';
import {isLibraryStagePropGlb,libraryPropLabel,getLibraryPropHost,placeLibraryPropOffline,linkShotAsset,libraryAssetContentHash,libraryPropsMissingContentHash,ingestLibraryPropContentHash,clearLibraryAssetContentHash,backfillLibraryPropContentHash,backfillLibraryPropContentHashes} from './director-library-prop.js';
import {backfillProjectLegacyContentHashes} from './director-set-kit.js';
let animatic=null,delivery=null,assistant=null,timing=null,projectStorage=null;
const toolStage=new Map(),STAGE_LABELS=[['plan','Plan'],['camera','Camera'],['body','Body'],['face','Face'],['draw','Draw'],['review','Review']];
const stageFor=shot=>toolStage.get(shot.id)||'plan';
function showShot(id,stage='plan'){const scene=current.scenes.find(s=>s.shots.some(x=>x.id===id));if(!scene)return;toolStage.set(id,stage);sceneId=scene.id;render();document.querySelector(`.shot[data-shot-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:'center'});}
const drawingViews=new Map();
const $=id=>document.getElementById(id),KEY='studio-director-v1';
let library=[],current,sceneId,undoStack=[],redoStack=[],lastGroup=null,recoveryData=null,recoveryStored=false;
let storedData=null;
try{storedData=localStorage.getItem(KEY);library=JSON.parse(storedData||'[]');library.forEach(validateProject);}catch{
 recoveryData=storedData;
 if(recoveryData){try{localStorage.setItem(KEY+'-recovery-'+Date.now(),recoveryData);recoveryStored=true;}catch{}}
 $('notice').textContent='Saved projects could not be read. Download the recovery data or import a valid project backup.';library=[];
}
if(!library.length)library=[newProject()];
let selection;try{selection=JSON.parse(localStorage.getItem(KEY+'-selection')||'null');}catch{}
current=library.find(p=>p.id===selection?.project)||library[0];sceneId=current.scenes.find(s=>s.id===selection?.scene)?.id||current.scenes[0]?.id;
const tell=text=>$('notice').textContent=text;
/** Rebuild Place select: End / Start / After shot N (dest scene shots). Keeps prior value when still valid. */
function fillPlaceSelect(placeSel, project, destSceneId){
  const prev=placeSel.value;
  placeSel.replaceChildren();
  placeSel.add(new Option('End of scene','end'));
  placeSel.add(new Option('Start of scene','start'));
  for(const opt of placeAfterOptions(project, destSceneId)){
    placeSel.add(new Option('After shot '+(opt.shotIndex+1)+' \u00b7 '+opt.title, opt.placeValue));
  }
  if([...placeSel.options].some(o=>o.value===prev)) placeSel.value=prev;
  else placeSel.value='end';
}

/** Rebuild Reorder-in-scene select: End / Start / After other shots. Keeps prior value when still valid. */
function fillReorderSelect(reorderSel, project, shotId){
  const prev=reorderSel.value;
  reorderSel.replaceChildren();
  const opts=reorderInSceneOptions(project, shotId);
  if(!opts.length){
    reorderSel.add(new Option('Need another shot in this scene',''));
    reorderSel.disabled=true;
    return;
  }
  reorderSel.disabled=false;
  for(const opt of opts){
    reorderSel.add(new Option(opt.label, opt.value));
  }
  if([...reorderSel.options].some(o=>o.value===prev)) reorderSel.value=prev;
  else reorderSel.value='end';
}


const masterLabel=document.createElement('label'),masterAudio=document.createElement('input');masterAudio.type='checkbox';masterLabel.append(masterAudio,document.createTextNode('Balance final audio for web playback (Ã¢Ë†â€™16 LUFS, Ã¢Ë†â€™1.5 dBTP target)'));$('render').before(masterLabel);
const burnLabel=document.createElement('label'),burnTitles=document.createElement('input');burnTitles.type='checkbox';burnTitles.checked=true;burnLabel.append(burnTitles,document.createTextNode('Burn titles into export (ffmpeg drawtext; matches Animatic title styles). Hard-burns on-screen titles â€” not soft captions.)'));
$('render').before(burnLabel);
const softRow=document.createElement('div');softRow.className='assemble-soft-captions';const softLabel=document.createElement('label'),softMuxCaptions=document.createElement('input');softMuxCaptions.type='checkbox';softMuxCaptions.checked=false;softLabel.append(softMuxCaptions,document.createTextNode('Embed soft captions in MP4 (SRT as mov_text; player can toggle). Separate from Burn titles; off by default.)'));const softLangLabel=document.createElement('label');softLangLabel.className='assemble-caption-language';softLangLabel.append(document.createTextNode('Caption language '));const softMuxLanguage=document.createElement('select');softMuxLanguage.setAttribute('aria-label','Soft caption language');softMuxLanguage.disabled=true;for(const {code,label} of CAPTION_LANGUAGES){const o=document.createElement('option');o.value=code;o.textContent=label;softMuxLanguage.append(o);}softMuxLanguage.value=DEFAULT_CAPTIONS_LANGUAGE;softLangLabel.append(softMuxLanguage);softMuxCaptions.addEventListener('change',()=>{softMuxLanguage.disabled=!softMuxCaptions.checked;});softRow.append(softLabel,softLangLabel);$('render').before(softRow);

const resumeHint=document.createElement('p');resumeHint.className='hint';resumeHint.textContent='Exports keep completed shot checkpoints on disk. After an interruption, assemble the same project again to reuse them. Changed shot media or timing starts a new checkpoint set.';$('render').before(resumeHint);
function save(){try{if(recoveryData&&!recoveryStored)throw Error('Original saved data is protected. Download your current project; browser storage cannot safely be replaced.');validateProject(current);localStorage.setItem(KEY,JSON.stringify(library));projectStorage?.schedule();tell('Saved on this computer · disk snapshot scheduled. Use the media backup for a complete archive.');}catch(e){tell('Not saved: '+e.message);}}
try{
 let legacyHashStamped=0;
 for(const project of library){
  const summary=backfillProjectLegacyContentHashes(project);
  legacyHashStamped+=summary.meshStamped+summary.kitStamped;
 }
 if(legacyHashStamped){save();tell('Stamped contentHash on '+legacyHashStamped+' legacy mesh path'+(legacyHashStamped===1?'':'s')+' (stage props / set-kit refs).');}
}catch{/* keep loaded projects */}

function rememberSelection(){try{localStorage.setItem(KEY+'-selection',JSON.stringify({project:current.id,scene:sceneId}));}catch{}}
let lastAssembleJob=null;let loudnessBusy=false;let loudnessButton=null;
function historyButtons(){const back=$('director-undo'),forward=$('director-redo');if(back)back.disabled=!undoStack.length;if(forward)forward.disabled=!redoStack.length;}
function updateSummary(){ updateCounts(); $('runtime').textContent=time(duration(current))+' / 04:00:00';const option=[...$('projects').options].find(o=>o.value===current.id);if(option)option.textContent=current.title;historyButtons();}
function change(fn,{redraw=true,group=null}={}){
 const before=structuredClone(current);
 try{fn();followShots(before,current);validateProject(current);if(!group||group!==lastGroup){undoStack.push(before);if(undoStack.length>20)undoStack.shift();}lastGroup=group;redoStack=[];save();}
 catch(e){for(const key of Object.keys(current))delete current[key];Object.assign(current,before);tell(e.message);redraw=true;}
 if(redraw)render();else updateSummary();
}
const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;return b;};
function bindText(input,onchange){let group=Symbol();input.onfocus=()=>{group=Symbol();};input.oninput=()=>onchange(input.value,{redraw:false,group});}
function field(parent,label,value,onchange,type='text'){const l=document.createElement('label');l.className='field';l.append(document.createTextNode(label));const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';if(type==='number'){input.min=1;input.max=3600;input.step=1;input.onchange=()=>onchange(input.value);}else bindText(input,onchange);l.append(input);parent.append(l);return input;}
const upload=uploadDirectorFile;
function attach(parent,label,object,key,accept){const l=document.createElement('label');l.className='field';l.textContent=label+(object[key]?' Ã‚Â· '+(object[key].name||object[key].filename):'');const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=async()=>{const owner=current;input.disabled=true;tell('Uploading locallyÃ¢â‚¬Â¦');try{const file=await upload(input.files[0]);if(file){if(current!==owner||!(current.assets.includes(object)||current.episodeAudio?.includes(object)||current.assets.some(a=>a.design&&['views','outfits','hair'].some(k=>(a.design[k]||[]).includes(object)))||current.scenes.some(s=>s.shots.some(x=>x===object||x.panels?.includes(object)||x.audioTracks?.includes(object)))))throw Error('Upload finished, but the original shot or project changed. Select the file again for the intended shot.');change(()=>object[key]=file);}}catch(e){tell(e.message);}finally{input.disabled=false;}};l.append(input);parent.append(l);if(object[key])parent.append(button('Detach '+label,()=>change(()=>delete object[key])));}
function openTool(path,brief,shot){try{sessionStorage.removeItem('studio-director-references');if(shot&&path==='/qwen-editor.html'){const refs=imageReferences(current,shot);if(refs.length>3)throw Error('Select fewer visual assets for this shot: image editing supports three pictures total, including the storyboard.');sessionStorage.setItem('studio-director-references',JSON.stringify(refs));brief+='\n'+refs.map((r,i)=>`Picture ${i+1}: ${r.label}`).join('\n');}sessionStorage.setItem('studio-director-brief',brief);location.href=path+(path.includes('?')?'&':'?')+'director=1';}catch(error){tell(error.message);}}
async function chooseOutput(parent,shot){
 try{const response=await fetch('/history?max_items=100');if(!response.ok)throw Error('Could not load Studio outputs.');const history=await response.json();const files=Object.values(history).reverse().flatMap(h=>Object.values(h.outputs||{}).flatMap(o=>o.images||[])).filter(f=>f.type==='output'&&/\.(png|jpe?g|webp|mp4|webm|mov|mkv|m4v)$/i.test(f.filename));
 const select=document.createElement('select');select.setAttribute('aria-label','Choose Studio output');select.add(new Option('Choose an existing image or videoÃ¢â‚¬Â¦',''));files.forEach((f,i)=>select.add(new Option([f.subfolder,f.filename].filter(Boolean).join('/'),String(i))));select.onchange=()=>{if(select.value!=='')change(()=>shot.media=files[Number(select.value)]);};parent.append(select);if(!files.length)tell('No recent Studio image or video outputs found. You can upload a file instead.');
 }catch(e){tell(e.message);}
}
function updateCounts(){if(planningChecks)refreshPlanningIssues(planningChecks,current,button,id=>showShot(id,'plan'));assistant?.refresh();animatic?.reset(current);delivery?.update();refreshAssembleGuides();timing?.update();updateProduction();if(typeof syncAssembleExportButtons==='function')syncAssembleExportButtons();const shots=current.scenes.flatMap(s=>s.shots);if($('scene-count'))$('scene-count').textContent=current.scenes.length;if($('shot-count'))$('shot-count').textContent=shots.length+(shots.length===1?' shot':' shots');if($('media-count'))$('media-count').textContent=shots.filter(shotHasMedia).length+' / '+shots.length+' shots attached';}

const clipDurationCache=new Map();
const mediaPeaksCache=new Map();
function mediaViewURL(file){return '/view?'+new URLSearchParams({filename:file.name||file.filename||'',subfolder:file.subfolder||'',type:file.type||'input'});}
function probeClipDuration(file){const url=mediaViewURL(file);if(clipDurationCache.has(url))return clipDurationCache.get(url);const p=new Promise(resolve=>{const v=document.createElement('video');v.preload='metadata';v.onloadedmetadata=()=>resolve(Number.isFinite(v.duration)?v.duration:null);v.onerror=()=>resolve(null);v.src=url;});clipDurationCache.set(url,p);return p;}
function drawMediaPeaks(canvas, peaks, kind){
  const w=canvas.clientWidth||canvas.width||600;const h=canvas.clientHeight||canvas.height||48;
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,w,h);
  if(!peaks?.length)return;
  // Audio-engine display gain (mmath lens): max-abs peaks rescaled so quiet-but-present
  // audio stays visible. Silence vs no-data is decided upstream on raw peaks.
  const drawn=normalizePeaks(peaks);
  const mid=h/2;ctx.strokeStyle=kind==='luminance'?'#8fb57a':'#a6d1f7';ctx.lineWidth=1;ctx.beginPath();
  // Max-pool into pixels so a narrow peak is never averaged away.
  for(let x=0;x<w;x++){const peak=drawn[Math.min(drawn.length-1,Math.floor(x/w*drawn.length))]||0;const amp=peak*(h*0.42);ctx.moveTo(x+.5,mid-amp);ctx.lineTo(x+.5,mid+amp);}
  ctx.stroke();
}
async function fetchAudioPeaks(media){
  const r=await fetch('/studio/director/waveform',{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify({media})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(result.error||'Waveform could not be read.');
  if(!Array.isArray(result.peaks)||!result.peaks.length)throw Error('Waveform returned no peaks.');
  return {kind:'audio',duration:result.duration,peaks:result.peaks};
}
async function sampleLuminancePeaks(url, duration, alive){
  const samples=Math.min(96,Math.max(24,Math.ceil(duration*3)));
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
  await new Promise((resolve,reject)=>{video.onloadeddata=()=>resolve();video.onerror=()=>reject(Error('Could not load video for luminance peaks.'));video.src=url;});
  if(!alive())throw Error('detached');
  const canvas=document.createElement('canvas');canvas.width=48;canvas.height=27;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Canvas unavailable for luminance peaks.');
  const energies=[];
  for(let i=0;i<samples;i++){
    if(!alive())throw Error('detached');
    const t=Math.min(Math.max(0,duration-0.05),(i+.5)/samples*duration);
    video.currentTime=t;
    await new Promise(resolve=>{const done=()=>{video.removeEventListener('seeked',done);resolve();};video.addEventListener('seeked',done);setTimeout(done,400);});
    ctx.drawImage(video,0,0,48,27);
    const data=ctx.getImageData(0,0,48,27).data;let sum=0,n=0;
    for(let p=0;p<data.length;p+=16){sum+=luminanceEnergy(data[p],data[p+1],data[p+2]);n++;}
    energies.push(n?sum/n:0);
  }
  const peaks=peaksFromSamples(energies,MEDIA_PEAKS_BINS);
  return {kind:'luminance',duration,peaks:normalizePeaks(peaks)};
}
function loadMediaPeaks(media, duration, alive){
  let key;try{key=mediaPeaksKey(media);}catch{return Promise.resolve({kind:'none',duration,peaks:null,note:'Media id unavailable for peak cache.'});}
  if(mediaPeaksCache.has(key))return mediaPeaksCache.get(key);
  const job=(async()=>{
    try{
      const audio=await fetchAudioPeaks(media);
      if(isSilentPeaks(audio.peaks)){
        try{return await sampleLuminancePeaks(mediaViewURL(media),duration,alive);}
        catch{return {kind:'silent',duration:audio.duration??duration,peaks:null,note:'Silent audio track (no usable peaks).'};}
      }
      return audio;
    }catch(err){
      const msg=String(err?.message||err);
      const noAudio=/no decodable audio|Choose an audio file|Waveform unavailable/i.test(msg);
      if(noAudio){
        try{return await sampleLuminancePeaks(mediaViewURL(media),duration,alive);}
        catch{return {kind:'silent',duration,peaks:null,note:'Silent / no audio Ã¢â‚¬â€ scrub only.'};}
      }
      try{return await sampleLuminancePeaks(mediaViewURL(media),duration,alive);}
      catch{return {kind:'none',duration,peaks:null,note:msg};}
    }
  })();
  mediaPeaksCache.set(key,job);
  job.catch(()=>{if(mediaPeaksCache.get(key)===job)mediaPeaksCache.delete(key);});
  return job;
}
/** Duration scrub bar with in/out handles + cached audio/luminance peaks under the track. */
function mediaTrimScrub(parent, shot, {change}){
  const box=document.createElement('div');box.className='media-trim-scrub';box.setAttribute('role','group');box.setAttribute('aria-label','Source in and out scrub');
  const status=document.createElement('p');status.className='hint media-trim-scrub-status';status.setAttribute('role','status');status.textContent='Loading clip duration for scrub handles\u2026';
  const track=document.createElement('div');track.className='media-trim-track';
  const peaksCanvas=document.createElement('canvas');peaksCanvas.className='media-trim-peaks';peaksCanvas.setAttribute('aria-hidden','true');peaksCanvas.width=600;peaksCanvas.height=48;
  const rangeFill=document.createElement('div');rangeFill.className='media-trim-range';
  const hoverCanvas=document.createElement('canvas');hoverCanvas.className='media-trim-hover';hoverCanvas.setAttribute('aria-hidden','true');hoverCanvas.width=600;hoverCanvas.height=48;
  const inRange=document.createElement('input');inRange.type='range';inRange.min='0';inRange.step='0.001';inRange.disabled=true;inRange.setAttribute('aria-label','Source in handle');
  const outRange=document.createElement('input');outRange.type='range';outRange.min='0';outRange.step='0.001';outRange.disabled=true;outRange.setAttribute('aria-label','Source out handle');
  track.append(peaksCanvas,rangeFill,hoverCanvas,inRange,outRange);box.append(status,track);parent.append(box);
  let peaksInfo=null;
  let hoverTime=null;
  let clipDuration=null;
  const alive=()=>box.isConnected;
  function peaksNote(){
    if(!peaksInfo)return 'loading peaks\u2026';
    if(peaksInfo.kind==='audio')return 'audio waveform';
    if(peaksInfo.kind==='luminance')return 'silent audio \u00b7 luminance strip';
    if(peaksInfo.kind==='silent')return peaksInfo.note||'silent (scrub only)';
    return peaksInfo.note||'peaks unavailable';
  }
  function redrawHover(){
    const w=hoverCanvas.clientWidth||hoverCanvas.width||600;
    const h=hoverCanvas.clientHeight||hoverCanvas.height||48;
    if(hoverCanvas.width!==w)hoverCanvas.width=w;
    if(hoverCanvas.height!==h)hoverCanvas.height=h;
    const ctx=hoverCanvas.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    if(hoverTime==null||!Number.isFinite(clipDuration)||clipDuration<=0)return;
    drawHoverTimeChip(ctx,hoverTime,{width:w,height:h,duration:clipDuration,suffix:''});
  }
  function paint(duration){const trim=mediaTrim(shot.media);const inn=trim.sourceIn;const out=scrubOutHandleSeconds(trim.sourceOut,duration);inRange.max=String(duration);outRange.max=String(duration);inRange.value=String(inn);outRange.value=String(out);const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';const outLabel=trim.sourceOut==null?'end of file':trim.sourceOut.toFixed(3)+'s';const hoverNote=hoverTime==null?'':(' \u00b7 hover '+formatOverviewTime(hoverTime));status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+outLabel+' \u00b7 '+peaksNote()+hoverNote+' (scrub writes the same source in/out as the numeric fields; works with playback speed and hold; hover time).';if(peaksInfo?.peaks)drawMediaPeaks(peaksCanvas,peaksInfo.peaks,peaksInfo.kind);redrawHover();}
  function livePaint(duration){let inn=Number(inRange.value);let out=Number(outRange.value);if(inn>=out){if(document.activeElement===inRange)inn=Math.max(0,out-0.001);else out=Math.min(duration,inn+0.001);inRange.value=String(inn);outRange.value=String(out);}const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';const hoverNote=hoverTime==null?'':(' \u00b7 hover '+formatOverviewTime(hoverTime));status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+out.toFixed(3)+'s'+hoverNote+' (release to save).';redrawHover();}
  function commit(duration){change(()=>{const next=scrubHandlesToTrim(Number(inRange.value),Number(outRange.value),duration);setMediaTrim(shot.media,next.sourceIn,next.sourceOut);});}
  probeClipDuration(shot.media).then(async duration=>{
    if(!alive())return;
    if(!Number.isFinite(duration)||duration<=0){status.textContent='Could not read clip duration for scrub handles. Use the numeric source in/out fields.';return;}
    clipDuration=duration;
    inRange.disabled=false;outRange.disabled=false;paint(duration);
    inRange.oninput=()=>livePaint(duration);outRange.oninput=()=>livePaint(duration);
    inRange.onchange=()=>commit(duration);outRange.onchange=()=>commit(duration);
    track.onpointermove=e=>{
      hoverTime=hoverTimeFromClientX(e.clientX,track.getBoundingClientRect(),duration);
      const dragging=document.activeElement===inRange||document.activeElement===outRange;
      if(dragging) livePaint(duration);
      else paint(duration);
    };
    track.onpointerleave=()=>{hoverTime=null;paint(duration);};
    try{
      peaksInfo=await loadMediaPeaks(shot.media,duration,alive);
      if(!alive())return;
      if(peaksInfo?.peaks)drawMediaPeaks(peaksCanvas,peaksInfo.peaks,peaksInfo.kind);
      paint(duration);
    }catch(e){
      if(!alive())return;
      peaksInfo={kind:'none',peaks:null,note:String(e?.message||e)};
      paint(duration);
    }
  });
}


function render(){
 const planningOpen=new Set([...document.querySelectorAll('[data-plan][open]')].map(e=>e.dataset.plan));
 const expanded=new Set([...document.querySelectorAll(".production-controls[open]")].map(e=>e.dataset.shotId));
 const drawingsOpen=new Set([...document.querySelectorAll('.drawing-controls[open]')].map(e=>e.dataset.shotId));
 const sheetsOpen=new Set([...document.querySelectorAll('.exposure-sheet[open]')].map(e=>e.dataset.shotId));
 const rigsOpen=new Set([...document.querySelectorAll('.rig3d-controls[open]')].map(e=>e.dataset.shotId));
 rememberSelection();historyButtons();updateCounts();
 $('projects').replaceChildren(...library.map(p=>new Option(p.title,p.id)));$('projects').value=current.id;
 for(const id of ['title','style','synopsis'])$(id).value=current[id]||'';
 $('runtime').textContent=time(duration(current))+' / 04:00:00';
 $('scenes').replaceChildren();for(const scene of current.scenes){const b=button(scene.title+' Ã‚Â· '+time(scene.shots.reduce((n,s)=>n+s.seconds,0)),()=>{sceneId=scene.id;render();});b.classList.toggle('selected',scene.id===sceneId);$('scenes').append(b);}
 const scene=current.scenes.find(s=>s.id===sceneId)||current.scenes[0];sceneId=scene?.id;$('scene-title').value=scene?.title||'';const joinBtn=$('join-next-scene');if(joinBtn)joinBtn.disabled=!canJoinSceneWithNext(current,sceneId);const removeSceneBtn=$('remove-scene');if(removeSceneBtn){const canRemove=canRemoveScene(current);removeSceneBtn.disabled=!canRemove;removeSceneBtn.title=canRemove?'Remove this scene and its shots from the episode. Undo restores.':'Keep at least one scene. Remove its shots instead.';}$('shots').replaceChildren();
 episodeAudioControls(episodeAudioHost,current,{field,button,change,attach,tell});
 storyRoom(storyHost,current,{field,button,change,download,tell});scenePlanning(sceneHost,current,scene,{field,button,change,tell});
 let start=0;for(const s of current.scenes){if(s===scene)break;start+=s.shots.reduce((n,x)=>n+x.seconds,0);}
 for(const [index,shot] of (scene?.shots||[]).entries()){
  const card=document.createElement('article');card.className='shot';card.dataset.shotId=shot.id;const h=document.createElement('h3');h.textContent=`Shot ${index+1} Ã‚Â· ${time(start)} Ã¢â‚¬â€œ ${time(start+shot.seconds)}`;start+=shot.seconds;card.append(h);
  for(const [key,label,type] of [['title','Shot title','text'],['seconds','Duration in seconds (1Ã¢â‚¬â€œ3600)','number'],['action','Action / storyboard brief','textarea'],['camera','Camera / framing','text'],['dialogue','Dialogue / sound notes','textarea']])field(card,label,shot[key],(v,options)=>change(()=>{if(key==='seconds')setShotSeconds(shot,Number(v));else shot[key]=v;},options),type);
  const actions=document.createElement('div');actions.className='actions';actions.append(button('Build image',()=>openTool('/qwen-editor.html',shotBrief(current,scene,shot),shot)),button('Build video',()=>openTool('/qwen-editor/video.html',shotBrief(current,scene,shot))),button('Build 3D prop',()=>openTool('/qwen-editor/mesh.html',shotBrief(current,scene,shot))));
  for(const [label,delta] of [['Earlier',-1],['Later',1]])actions.append(button(label,()=>change(()=>{const to=index+delta;if(to>=0&&to<scene.shots.length)[scene.shots[index],scene.shots[to]]=[scene.shots[to],scene.shots[index]];})));
  actions.append(button('Duplicate',()=>change(()=>scene.shots.splice(index+1,0,{...structuredClone(shot),id:crypto.randomUUID()}))),button('Remove shot',()=>{if(!confirm(removeShotConfirmMessage(shot)))return;const label=(typeof shot.title==='string'&&shot.title.trim())?shot.title.trim():'Untitled shot';change(()=>scene.shots.splice(index,1));tell(label+' removed. Undo restores.');}));card.append(actions);
  const reorderRow=document.createElement('div');reorderRow.className='shot-move shot-reorder';
  const reorderLabel=document.createElement('label');reorderLabel.className='field';reorderLabel.append(document.createTextNode('Reorder in scene'));
  const reorderSel=document.createElement('select');reorderSel.setAttribute('aria-label','Reorder shot within scene');
  fillReorderSelect(reorderSel,current,shot.id);reorderLabel.append(reorderSel);
  const canReorder=(scene.shots||[]).length>=2;
  const reorderBtn=button('Reorder',()=>{
    if(!canReorder){tell('Add another shot in this scene to reorder.');return;}
    const place=reorderSel.value;if(!place){tell('Choose Start, End, or After a shot.');return;}
    try{
      const destIndex=destIndexFromReorderPlace(current,shot.id,place);
      change(()=>{moveShotInScene(current,shot.id,destIndex);},{redraw:false});
      render();
      tell((shot.title||'Untitled shot')+' reordered in '+(scene.title||'this scene')+'. Undo restores.');
      requestAnimationFrame(()=>document.querySelector('.shot[data-shot-id="'+CSS.escape(shot.id)+'"]')?.scrollIntoView({block:'center'}));
    }catch(e){tell(e.message);}
  });
  reorderBtn.disabled=!canReorder;
  reorderRow.append(reorderLabel,reorderBtn);card.append(reorderRow);
  const reorderHint=document.createElement('p');reorderHint.className='hint shot-move-hint';
  reorderHint.textContent=canReorder
    ? 'Jump this shot to Start, End, or After another shot in this scene (same as many Earlier/Later clicks). Shot id stays. Undo restores. Cross-scene moves stay under Move to scene.'
    : 'Add another shot in this scene to reorder here. Earlier / Later also step one position at a time.';
  card.append(reorderHint);
  const others=otherScenesForShot(current,shot.id);
  const moveRow=document.createElement('div');moveRow.className='shot-move';
  const moveLabel=document.createElement('label');moveLabel.className='field';moveLabel.append(document.createTextNode('Move to scene'));
  const moveSel=document.createElement('select');moveSel.setAttribute('aria-label','Move shot to scene');
  if(!others.length){moveSel.add(new Option('Add another scene first',''));moveSel.disabled=true;}
  else{moveSel.add(new Option('Choose a scene\u2026',''));for(const s of others)moveSel.add(new Option(s.title+(s.shotCount?' \u00b7 '+s.shotCount+' shot'+(s.shotCount===1?'':'s'):''),s.id));}
  moveLabel.append(moveSel);
  const placeLabel=document.createElement('label');placeLabel.className='field';placeLabel.append(document.createTextNode('Place'));
  const placeSel=document.createElement('select');placeSel.setAttribute('aria-label','Place in destination scene');fillPlaceSelect(placeSel,current,moveSel.value||'');placeLabel.append(placeSel);
  moveSel.onchange=()=>fillPlaceSelect(placeSel,current,moveSel.value||'');
  const moveBtn=button('Move to scene',()=>{
    const destId=moveSel.value;if(!destId){tell('Choose a destination scene first.');return;}
    const destIndex=destIndexFromPlace(placeSel.value);
    change(()=>{moveShotToScene(current,shot.id,destId,destIndex);},{redraw:false});
    if(findShotLocation(current,shot.id)?.scene.id===destId){
      sceneId=destId;render();
      const destTitle=current.scenes.find(s=>s.id===destId)?.title||'the destination scene';
      tell((shot.title||'Untitled shot')+' is now in '+destTitle+'. Undo restores its previous scene.');
      requestAnimationFrame(()=>document.querySelector('.shot[data-shot-id="'+CSS.escape(shot.id)+'"]')?.scrollIntoView({block:'center'}));
    }
  });
  moveBtn.disabled=!others.length;
  moveRow.append(moveLabel,placeLabel,moveBtn);card.append(moveRow);
  const moveHint=document.createElement('p');moveHint.className='hint shot-move-hint';
  moveHint.textContent=others.length
    ? 'Keeps this shot\u2019s id, so Follow-shot episode audio, drafts and voice-take targets stay linked. Place: End, Start, or After a shot in the destination. Undo restores.'
    : 'Add another scene to move this shot out of '+ (scene.title||'this scene') +'.';
  card.append(moveHint);
  const copyRow=document.createElement('div');copyRow.className='shot-move shot-copy';
  const copyLabel=document.createElement('label');copyLabel.className='field';copyLabel.append(document.createTextNode('Copy to scene'));
  const copySel=document.createElement('select');copySel.setAttribute('aria-label','Copy shot to scene');
  if(!others.length){copySel.add(new Option('Add another scene first',''));copySel.disabled=true;}
  else{copySel.add(new Option('Choose a scene\u2026',''));for(const s of others)copySel.add(new Option(s.title+(s.shotCount?' \u00b7 '+s.shotCount+' shot'+(s.shotCount===1?'':'s'):''),s.id));}
  copyLabel.append(copySel);
  const copyPlaceLabel=document.createElement('label');copyPlaceLabel.className='field';copyPlaceLabel.append(document.createTextNode('Place'));
  const copyPlaceSel=document.createElement('select');copyPlaceSel.setAttribute('aria-label','Place copy in destination scene');fillPlaceSelect(copyPlaceSel,current,copySel.value||'');copyPlaceLabel.append(copyPlaceSel);
  copySel.onchange=()=>fillPlaceSelect(copyPlaceSel,current,copySel.value||'');
  const copyBtn=button('Copy to scene',()=>{
    const destId=copySel.value;if(!destId){tell('Choose a destination scene first.');return;}
    const destIndex=destIndexFromPlace(copyPlaceSel.value);
    let newId=null;
    change(()=>{const result=copyShotToScene(current,shot.id,destId,destIndex);newId=result.shot.id;},{redraw:false});
    if(newId&&findShotLocation(current,newId)?.scene.id===destId){
      sceneId=destId;render();
      const destTitle=current.scenes.find(s=>s.id===destId)?.title||'the destination scene';
      tell((shot.title||'Untitled shot')+' copied into '+destTitle+' (new shot id). Original stays here. Undo restores.');
      requestAnimationFrame(()=>document.querySelector('.shot[data-shot-id="'+CSS.escape(newId)+'"]')?.scrollIntoView({block:'center'}));
    }
  });
  copyBtn.disabled=!others.length;
  copyRow.append(copyLabel,copyPlaceLabel,copyBtn);card.append(copyRow);
  const copyHint=document.createElement('p');copyHint.className='hint shot-move-hint';
  copyHint.textContent=others.length
    ? 'Makes a new shot with its own id (original stays). Place: End, Start, or After a shot in the destination. Follow-shot episode audio, drafts and voice-take targets stay on the original. Undo removes the copy.'
    : 'Add another scene to copy this shot into it.';
  card.append(copyHint);
  const splitRow=document.createElement('div');splitRow.className='shot-move shot-split';
  const splitBtn=button('Split scene here',()=>{
    let newSceneId=null;
    let suggested='';
    change(()=>{const result=splitSceneAtShot(current,shot.id);newSceneId=result.toScene.id;suggested=result.toScene.title;},{redraw:false,group:'split-scene-rename'});
    if(newSceneId&&current.scenes.some(sc=>sc.id===newSceneId)){
      const next=window.prompt('Name for the new scene:', suggested||'');
      if(next!==null){
        const trimmed=typeof next==='string'?next.trim():'';
        const finalTitle=trimmed||suggested||'Untitled scene';
        if(finalTitle!==suggested){
          change(()=>{const sc=current.scenes.find(s=>s.id===newSceneId);if(sc)sc.title=finalTitle;},{redraw:false,group:'split-scene-rename'});
        }
      }
      sceneId=newSceneId;render();
      const destTitle=current.scenes.find(sc=>sc.id===newSceneId)?.title||'the new scene';
      tell((shot.title||'Untitled shot')+' and later shots are now in '+destTitle+'. Shot ids stay. Undo restores the split (and rename).');
      requestAnimationFrame(()=>{
        document.querySelector('.shot[data-shot-id="'+CSS.escape(shot.id)+'"]')?.scrollIntoView({block:'center'});
        const titleInput=$('scene-title');
        if(titleInput){titleInput.focus();titleInput.select();}
      });
    }
  });
  splitBtn.disabled=!canSplitSceneAtShot(current,shot.id);
  splitRow.append(splitBtn);card.append(splitRow);
  const splitHint=document.createElement('p');splitHint.className='hint shot-move-hint';
  splitHint.textContent=canSplitSceneAtShot(current,shot.id)
    ? 'This shot and later become a new scene after this one (default title: current title + " (cont.)", or Scene N). You can rename in the prompt; Cancel keeps the default. Shot ids stay, so Follow-shot episode audio, drafts and voice-take targets stay linked. Scene plan stays on the original. Undo restores the split and rename.'
    : 'Split starting at a later shot so this scene keeps the shots before the split.';
  card.append(splitHint);
  card.append(button('Choose existing Studio output',()=>chooseOutput(card,shot)));
  attach(card,'Storyboard image or clip',shot,'media','image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mov,.mkv,.m4v');attach(card,'Voice / music audio',shot,'audio','audio/*');
  if(shot.audio){
    const roleLabel=document.createElement('label');roleLabel.className='field';roleLabel.textContent='Main audio role (episode ducking)';
    const roleSel=document.createElement('select');roleSel.setAttribute('aria-label','Main audio role for ducking');
    roleSel.add(new Option('Auto - voice/lip-sync ducks; music-named skips',''));
    for(const [v,l] of [['dialogue','Dialogue - duck episode music under this'],['music','Music - do not duck under this'],['ambience','Ambience - do not duck under this'],['effects','Effects - do not duck under this']])roleSel.add(new Option(l,v));
    roleSel.value=shot.audioRole||'';
    roleSel.onchange=()=>change(()=>{if(roleSel.value)shot.audioRole=roleSel.value;else delete shot.audioRole;});
    roleLabel.append(roleSel);card.append(roleLabel);
    const roleHint=document.createElement('p');roleHint.className='hint';
    roleHint.textContent='Automatic duck under dialogue uses Dialogue-role main attachments (and Auto with lip-sync or a matching voice take). Choose Music / Ambience / Effects when the attachment is a bed so it does not open a duck window.';
    card.append(roleHint);
    const audioTrack={id:shot.id+'-audio',media:shot.audio,sourceStart:0,duration:shot.seconds||1,volume:1,fadeIn:0,fadeOut:0,start:0};
    audioOverviewControls(card,audioTrack,current,{button,change,title:'Shot voice/music overview Â· peaks & crossfaded scrub',autoLoad:true});
  }

  if(shot.media && /\.(mp4|webm|mov|mkv|m4v)$/i.test(shot.media.name||shot.media.filename||'')){
    const trim = mediaTrim(shot.media);
    const inLabel = document.createElement('label');inLabel.className='field';inLabel.append(document.createTextNode('Source in (seconds into clip)'));
    const inInput = document.createElement('input');inInput.type='number';inInput.min='0';inInput.max='14400';inInput.step='0.001';inInput.value=String(trim.sourceIn);inInput.setAttribute('aria-label','Source in seconds into clip');
    inInput.onchange=()=>change(()=>{const nextIn=Number(inInput.value);const out=shot.media.sourceOut;setMediaTrim(shot.media,nextIn,out===undefined?null:out);});
    inLabel.append(inInput);
    const outLabel = document.createElement('label');outLabel.className='field';outLabel.append(document.createTextNode('Source out (seconds into clip; blank = end of file)'));
    const outInput = document.createElement('input');outInput.type='number';outInput.min='0';outInput.max='14400';outInput.step='0.001';outInput.value=trim.sourceOut==null?'':String(trim.sourceOut);outInput.setAttribute('aria-label','Source out seconds into clip');
    outInput.onchange=()=>change(()=>{const text=outInput.value.trim();const nextOut=text===''?null:Number(outInput.value);setMediaTrim(shot.media,mediaTrim(shot.media).sourceIn,nextOut);});
    outLabel.append(outInput);
    card.append(inLabel,outLabel);
    mediaTrimScrub(card,shot,{change});
    const trimHint=document.createElement('p');trimHint.className='hint';
    trimHint.textContent='Trim plays and assembles only this range of the attached clip. Drag the yellow in/out handles on the scrub bar (or type the numeric fields). Peaks under the bar are the clip audio waveform when present, or a luminance strip for silent video. Fit shot to clip uses the trimmed length at playback speed, then adds hold. Clear trim to use the whole file.';
    card.append(trimHint);
    if(shot.media.sourceIn!==undefined||shot.media.sourceOut!==undefined)card.append(button('Clear media trim',()=>change(()=>clearMediaTrim(shot.media))));    {
      const hold = shotHoldSeconds(shot);
      const holdLabel = document.createElement('label');holdLabel.className='field';holdLabel.append(document.createTextNode('Hold last frame (0\u20133600 s, integer)'));
      const holdInput = document.createElement('input');holdInput.type='number';holdInput.min='0';holdInput.max='3600';holdInput.step='1';holdInput.value=String(hold);holdInput.setAttribute('aria-label','Hold last frame seconds, 0 to 3600 integer');
      const applyHold = (raw)=>change(()=>{setShotHoldSeconds(shot, clampShotHoldSeconds(raw));});
      holdInput.onchange=()=>applyHold(holdInput.value);
      holdLabel.append(holdInput);card.append(holdLabel);
      const holdPresets=document.createElement('div');holdPresets.className='hold-presets';holdPresets.setAttribute('role','group');holdPresets.setAttribute('aria-label','Hold last frame presets');
      for(const sec of SHOT_HOLD_PRESETS){
        const lab = sec===0 ? '0s (none)' : (sec+'s');
        const b=button(lab,()=>applyHold(sec));
        b.setAttribute('aria-pressed', String(hold===sec));
        if(hold===sec)b.classList.add('selected');
        holdPresets.append(b);
      }
      card.append(holdPresets);
      const holdHint=document.createElement('p');holdHint.className='hint';
      holdHint.textContent='Intentional freeze after the trimmed clip plays (assembler pads the last frame). Integer seconds only (0\u20133600). Presets: 0 / 1 / 2 / 3s. Fit shot to clip = moving length + this hold. 0 clears intentional hold; Timing \u0026 cutting still flags accidental freezes beyond it.';
      card.append(holdHint);
      const holdPreview=document.createElement('p');holdPreview.className='hint hold-preview';holdPreview.setAttribute('role','status');
      holdPreview.textContent=shotHoldPreview(shot).text;
      card.append(holdPreview);
      if(shot.holdSeconds)card.append(button('Clear hold',()=>change(()=>clearShotHoldSeconds(shot))));
    }
    {
      const speed = shotPlaybackSpeed(shot);
      const speedLabel = document.createElement('label');speedLabel.className='field';speedLabel.append(document.createTextNode('Playback speed (0.5–2x)'));
      const speedInput = document.createElement('input');speedInput.type='number';speedInput.min='0.5';speedInput.max='2';speedInput.step='0.05';speedInput.value=String(speed);speedInput.setAttribute('aria-label','Playback speed, 0.5 to 2');
      const applySpeed = (raw)=>change(()=>{setShotPlaybackSpeed(shot, clampShotPlaybackSpeed(raw));});
      speedInput.onchange=()=>applySpeed(speedInput.value);
      speedLabel.append(speedInput);card.append(speedLabel);
      const speedPresets=document.createElement('div');speedPresets.className='speed-presets';speedPresets.setAttribute('role','group');speedPresets.setAttribute('aria-label','Playback speed presets');
      for(const rate of SHOT_PLAYBACK_SPEED_PRESETS){
        const lab = rate===1 ? '1x (normal)' : (rate+'x');
        const b=button(lab,()=>applySpeed(rate));
        b.setAttribute('aria-pressed', String(playbackSpeedsEqual(speed, rate)));
        if(playbackSpeedsEqual(speed, rate))b.classList.add('selected');
        speedPresets.append(b);
      }
      card.append(speedPresets);
      const speedHint=document.createElement('p');speedHint.className='hint';
      speedHint.textContent='How fast the trimmed clip plays in animatic and Assemble (0.5–2x). Presets: 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2x. Fit shot to clip = floor(trimmed source / speed) + hold. 1 clears intentional speed.';
      card.append(speedHint);
      const speedPreview=document.createElement('p');speedPreview.className='hint speed-preview';speedPreview.setAttribute('role','status');
      speedPreview.textContent=shotPlaybackSpeedPreview(shot).text;
      card.append(speedPreview);
      if(shot.playbackSpeed!==undefined && shot.playbackSpeed!==1)card.append(button('Clear playback speed',()=>change(()=>clearShotPlaybackSpeed(shot))));
    }
  }
    {
    const trans = shotTransition(shot);
    const overlap = transitionOverlaps(trans.type);
    const tLabel = document.createElement('label');tLabel.className='field';tLabel.append(document.createTextNode('Transition into next shot'));
    const tSelect = document.createElement('select');tSelect.setAttribute('aria-label','Transition into next shot');
    for(const opt of SHOT_TRANSITION_OPTIONS)tSelect.add(new Option(opt.label,opt.type));
    tSelect.value=trans.type;
    tLabel.append(tSelect);card.append(tLabel);
    const dLabel = document.createElement('label');dLabel.className='field';dLabel.append(document.createTextNode('Transition duration (seconds)'));
    const dInput = document.createElement('input');dInput.type='number';dInput.min='0.1';dInput.max='30';dInput.step='0.1';dInput.value=overlap?String(trans.durationSec):'1';dInput.disabled=!overlap;dInput.setAttribute('aria-label','Transition duration in seconds');
    dLabel.append(dInput);card.append(dLabel);
    tSelect.onchange=()=>change(()=>{if(tSelect.value==='cut')setShotTransition(shot,'cut');else setShotTransition(shot,tSelect.value,Number(dInput.value)||1);});
    dInput.onchange=()=>change(()=>{if(transitionOverlaps(tSelect.value))setShotTransition(shot,tSelect.value,Number(dInput.value));});
    const tHint=document.createElement('p');tHint.className='hint';
    tHint.textContent='Hard cut is the default. Dissolve, wipe, slide, fade-through, and circle overlap this shot with the next in animatic preview (CSS approx; wipe/slide/circle directions match Assemble xfade) and Assemble (ffmpeg xfade). Ignored on the last shot.';
    card.append(tHint);
    if(shot.transition)card.append(button('Clear transition',()=>change(()=>clearShotTransition(shot))));
    {
      const sources = listTransitionSources(current, shot.id);
      const copyHint = document.createElement('p');
      copyHint.className = 'hint';
      copyHint.textContent = sources.length
        ? 'Copy transition from another shot for continuity. Copy all replaces type and duration. Type only keeps this shot’s duration when it already overlaps (otherwise uses the source duration). Duration only keeps this shot’s type. Undo restores.'
        : 'Copy transition from another shot once another shot has an overlap transition (dissolve / wipe / slide / fade / circle).';
      card.append(copyHint);
      const copyBox = document.createElement('div');
      copyBox.className = 'drawing-toolbar transition-copy';
      copyBox.setAttribute('role', 'group');
      copyBox.setAttribute('aria-label', 'Copy transition from another shot');
      const srcLabel = document.createElement('label');
      srcLabel.className = 'field';
      srcLabel.append(document.createTextNode('Copy transition from shot'));
      const srcSelect = document.createElement('select');
      srcSelect.setAttribute('aria-label', 'Copy transition from shot');
      srcSelect.append(new Option(sources.length ? 'Choose a shot with a transition…' : 'No other shots with an overlap transition yet', ''));
      for (const src of sources) srcSelect.append(new Option(src.label, src.id));
      srcLabel.append(srcSelect);
      const modeLabel = document.createElement('label');
      modeLabel.className = 'field';
      modeLabel.append(document.createTextNode('Copy mode'));
      const modeSelect = document.createElement('select');
      modeSelect.setAttribute('aria-label', 'Transition copy mode');
      modeSelect.append(new Option('Copy all (type & duration)', 'all'));
      modeSelect.append(new Option('Type only (keep local duration)', 'type'));
      modeSelect.append(new Option('Duration only (keep local type)', 'duration'));
      modeSelect.value = 'all';
      modeLabel.append(modeSelect);
      const copyBtn = button('Copy transition', () => {
        const sourceId = srcSelect.value;
        if (!sourceId) { tell('Choose another shot that already has an overlap transition.'); return; }
        let sourceShot = null;
        for (const sc of current.scenes || []) { sourceShot = sc.shots?.find(x => x.id === sourceId); if (sourceShot) break; }
        if (!sourceShot || !shotHasTransition(sourceShot)) { tell('Source shot no longer has an overlap transition.'); return; }
        const mode = modeSelect.value || 'all';
        let summary = null;
        try {
          change(() => { summary = copyTransitionFromShot(shot, sourceShot, mode); });
        } catch (e) { tell(e.message); return; }
        const title = sourceShot.title || 'Untitled shot';
        const typeLabel = (SHOT_TRANSITION_OPTIONS.find(o => o.type === summary.type) || {}).label || summary.type;
        const bits = mode === 'type'
          ? ('Copied transition type ' + typeLabel + ' from "' + title + '"' + (summary.keptDuration ? '; kept this shot’s duration' : (' at ' + summary.durationSec + 's')))
          : mode === 'duration'
            ? ('Copied transition duration ' + summary.durationSec + 's from "' + title + '"; kept this shot’s type')
            : ('Copied ' + typeLabel + ' (' + summary.durationSec + 's) from "' + title + '"');
        tell(bits + '. Undo restores this shot’s previous transition.');
      });
      copyBtn.disabled = !sources.length;
      copyBtn.title = sources.length
        ? 'Copy overlap transition from the selected shot (Undo restores)'
        : 'No other shots with an overlap transition yet';
      srcSelect.disabled = !sources.length;
      modeSelect.disabled = !sources.length;
      copyBox.append(srcLabel, modeLabel, copyBtn);
      card.append(copyBox);
    }
  }
  if(shot.media)card.append(button('Preview attached shot',()=>{const name=shot.media.name||shot.media.filename;const media=document.createElement(/\.(mp4|webm|mov|mkv|m4v)$/i.test(name)?'video':'img');media.style.maxWidth='100%';media.src='/view?'+new URLSearchParams({filename:name,subfolder:shot.media.subfolder||'',type:shot.media.type||'input'});if(media.tagName==='VIDEO'){media.controls=true;media.preload='metadata';}else media.alt='Shot storyboard';card.append(media);}));
  const stages=document.createElement('div');stages.className='shot-stages';stages.setAttribute('role','group');stages.setAttribute('aria-label','Shot production stage');
  const stage=stageFor(shot);
  for(const [id,label] of STAGE_LABELS){const pick=button(label,()=>{toolStage.set(shot.id,id);render();});pick.setAttribute('aria-pressed',String(stage===id));stages.append(pick);}
  const stageFinished=shot.toolStages?.[stage]==='finished';
  stages.append(button(stageFinished?'Reopen this stage':'Mark this stage finished',()=>change(()=>{shot.toolStages??={};if(shot.toolStages[stage]==='finished')delete shot.toolStages[stage];else shot.toolStages[stage]='finished';if(!Object.keys(shot.toolStages).length)delete shot.toolStages;})));
  card.append(stages);
  const owner=current;
  if(stageFinished){const done=document.createElement('p');done.className='hint';done.textContent=`${STAGE_LABELS.find(([id])=>id===stage)[1]} is finished. This stage stays out of the page and out of the assistant prompt. The shot still has the work. Reopen the stage to edit it.`;card.append(done);}
  else if(stage==='plan')shotPlanning(card,current,scene,shot,{field,button,change,attach,upload,tell});
  else if(stage==='review'){productionControls(card,current,shot,{change,button,tell});card.querySelector('.production-controls').open=expanded.has(shot.id);}
  else if(stage==='draw'){
   if(!drawingViews.has(shot.id))drawingViews.set(shot.id,{});
   drawingControls(card,shot,{change,button,tell,upload,isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot)),undo:()=>travel(undoStack,redoStack),redo:()=>travel(redoStack,undoStack),canUndo:()=>!!undoStack.length,canRedo:()=>!!redoStack.length,view:drawingViews.get(shot.id)});
   card.querySelector('.drawing-controls').open=drawingsOpen.has(shot.id);
   exposureControls(card,shot,{change});
   card.querySelector('.exposure-sheet').open=sheetsOpen.has(shot.id);
  }else if(stage==='face'){
   lipSyncControls(card,shot,{button,change,tell,projectId:owner.id,getVoiceTakes:()=>owner.voiceTakes||[],isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   rig3DControls(card,shot,{stage,change,button,tell,upload,getSetups:()=>owner.assets.filter(a=>a.rigSetup),saveSetup:asset=>{if(current!==owner)throw Error('Return to the original project to save this setup.');change(()=>owner.assets.push(asset));},getSetKits:()=>owner.assets.filter(a=>a.setKit),saveSetKit:asset=>{if(current!==owner)throw Error('Return to the original project to save this set kit.');change(()=>owner.assets.push(asset));},getLibraryProps:()=>owner.assets.filter(a=>isLibraryStagePropGlb(a)),getProject:()=>owner,isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   card.querySelector('.rig3d-controls').open=rigsOpen.has(shot.id);
  }else{
   rig3DControls(card,shot,{stage,change,button,tell,upload,getSetups:()=>owner.assets.filter(a=>a.rigSetup),saveSetup:asset=>{if(current!==owner)throw Error('Return to the original project to save this setup.');change(()=>owner.assets.push(asset));},getSetKits:()=>owner.assets.filter(a=>a.setKit),saveSetKit:asset=>{if(current!==owner)throw Error('Return to the original project to save this set kit.');change(()=>owner.assets.push(asset));},getLibraryProps:()=>owner.assets.filter(a=>isLibraryStagePropGlb(a)),getProject:()=>owner,isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   card.querySelector('.rig3d-controls').open=rigsOpen.has(shot.id);
  }
  $('shots').append(card);
 }
 if(!scene?.shots.length){const empty=document.createElement('div');empty.className='sequence-empty';empty.innerHTML='<span class="empty-film" aria-hidden="true">Ã¢â€“Â¤</span><h3>Every story starts with a shot.</h3><p>Set the action, frame the camera and build your first moment. Your sequence will take shape here.</p>';empty.append(button('Create your first shot',()=>$('add-shot').click()));$('shots').append(empty);}
 $('assets').replaceChildren();
 const assetFilterHost=document.createElement('label');assetFilterHost.className='field';assetFilterHost.textContent='Library filter';
 const assetFilter=document.createElement('select');assetFilter.setAttribute('aria-label','Library filter');
 for(const [label,value] of [['All kinds',''],['Characters','character'],['Sets','set'],['Props','prop'],['Props with GLB','prop-glb'],['Voice','voice'],['Music','music'],['Set kits only','set-kit'],['Rig setups only','rig-setup']])assetFilter.add(new Option(label,value));
 assetFilter.value=window.__directorAssetFilter||'';
 assetFilter.onchange=()=>{window.__directorAssetFilter=assetFilter.value;render();};
 assetFilterHost.append(assetFilter);$('assets').append(assetFilterHost);
 const missingHashes=libraryPropsMissingContentHash(current.assets);
 if(missingHashes.length){const backfillBar=document.createElement('div');backfillBar.className='actions';backfillBar.append(button('Backfill missing GLB hashes ('+missingHashes.length+')',async()=>{const owner=current;try{tell('Backfilling library GLB content hashesÃ¢â‚¬Â¦');const probes=missingHashes.map(a=>structuredClone(a));const result=await backfillLibraryPropContentHashes(probes);if(current!==owner)throw Error('Project changed during backfill.');change(()=>{for(const row of result.stamped){const asset=current.assets.find(a=>a.id===row.assetId);if(!asset)continue;asset.contentHash=row.contentHash;if(asset.file)asset.file.contentHash=row.contentHash;}backfillProjectLegacyContentHashes(current);});const parts=[];if(result.stamped.length)parts.push(result.stamped.length+' hashed');if(result.already.length)parts.push(result.already.length+' already had hash');if(result.failed.length)parts.push(result.failed.length+' failed'+(result.failed[0]?': '+result.failed[0].error:''));tell(parts.join(' Ã‚Â· ')||'No props needed a hash.');}catch(e){tell(e.message);}}));$('assets').append(backfillBar);}

 const filter=assetFilter.value;
 const visible=current.assets.filter(asset=>{
  if(filter==='set-kit')return !!asset.setKit;
  if(filter==='rig-setup')return !!asset.rigSetup;
  if(filter==='prop-glb')return isLibraryStagePropGlb(asset);
  return !filter||asset.kind===filter;
 });
 if(!visible.length){const empty=document.createElement('p');empty.className='hint';empty.textContent=current.assets.length?'No assets match this filter.':'Add characters, sets or props here. Attach a prop GLB and place it into a shot from the asset card. Save a room layout as a set kit from Body Ã‚Â· Set layout.';$('assets').append(empty);}
 for(const asset of visible){const item=document.createElement('div');item.className='shot asset-card';item.dataset.kind=asset.kind;item.dataset.readiness=asset.readiness||'Not started';
  const head=document.createElement('div');head.className='asset-card-head';
  const select=document.createElement('select');for(const k of ['character','set','prop','voice','music'])select.add(new Option(k,k));select.value=asset.kind;select.onchange=()=>{if(asset.rigSetup&&!['character','set'].includes(select.value)){select.value=asset.kind;tell('Rig setups must stay a character or set.');return;}if(asset.setKit&&select.value!=='set'){select.value=asset.kind;tell('Set kits must stay kind "set".');return;}change(()=>asset.kind=select.value);};
  const readiness=document.createElement('span');readiness.className='asset-readiness';readiness.dataset.state=asset.readiness||'Not started';readiness.textContent=asset.readiness||'Not started';
  head.append(select,readiness);item.append(head);
  if(asset.setKit){const info=document.createElement('p');info.className='hint';info.textContent='Set kit Ã‚Â· '+asset.setKit.props.length+' stage props. Apply from Body Ã‚Â· Set layout Ã‚Â· room & doorway without replacing the character.';item.append(info);}
  if(asset.rigSetup){const info=document.createElement('p');info.className='hint';info.textContent='Reusable rig setup Ã‚Â· '+asset.rigSetup.rig.names.length+' joints. Load a copy from a shotÃ¢â‚¬â„¢s Character continuity panel.';item.append(info);}
    if(isLibraryStagePropGlb(asset)){const info=document.createElement('p');info.className='hint';info.textContent=libraryPropLabel(asset)+'. Place into a shot as an embedded static stage prop (same path as Body Ã‚Â· import a reusable prop). Open Body on that shot to remount live; otherwise the model is updated for the next open.';item.append(info);
   const placeHost=document.createElement('label');placeHost.className='field';placeHost.textContent='Place GLB into shot';
   const shotChoice=document.createElement('select');shotChoice.setAttribute('aria-label','Place GLB into shot');
   const sceneShots=current.scenes.find(sc=>sc.id===sceneId)?.shots||[];
   for(const sh of sceneShots)shotChoice.append(new Option(sh.title||'Untitled shot',sh.id));
   if(window.__directorLibraryPropShot && [...shotChoice.options].some(o=>o.value===window.__directorLibraryPropShot))shotChoice.value=window.__directorLibraryPropShot;
   else if(sceneShots[0])shotChoice.value=sceneShots[0].id;
   shotChoice.onchange=()=>{window.__directorLibraryPropShot=shotChoice.value;};placeHost.append(shotChoice);item.append(placeHost);
   item.append(button('Place GLB as stage prop',async()=>{const owner=current;const target=(current.scenes.find(sc=>sc.id===sceneId)?.shots||[]).find(sh=>sh.id===shotChoice.value)||current.scenes.flatMap(sc=>sc.shots).find(sh=>sh.id===shotChoice.value);if(!target){tell('Add a shot in this scene first.');return;}window.__directorLibraryPropShot=target.id;try{
    const host=getLibraryPropHost(target.id);
    if(host){if(host.busy?.())throw Error('Body stage is busy. Wait for the current 3D edit to finish.');await host.place(asset);if(current!==owner)throw Error('Project changed during place.');tell('Library GLB placed on '+(target.title||'shot')+' through the open Body stage.');return;}
    tell('Placing library GLB into the shot modelÃ¢â‚¬Â¦');
    const {disposeObject}=await import('./director-3d-engine.js');
    let placed;
    try{
     placed=await placeLibraryPropOffline(target,asset,{upload});
     if(current!==owner||!(current.scenes.some(sc=>sc.shots.includes(target))))throw Error('Shot or project changed during place. Original kept.');
     change(()=>{target.rig3d=placed.rig;linkShotAsset(target,asset.id);},{redraw:true});
     tell('Library GLB embedded on '+(target.title||'shot')+'. Open Body to view and place it. Undo restores the previous model.');
    }finally{if(placed?.root)disposeObject(placed.root);}
   }catch(e){tell(e.message);}}));}

field(item,'Name',asset.name,(v,options)=>change(()=>asset.name=v,options));field(item,'Design / consistency notes',asset.brief,(v,options)=>change(()=>asset.brief=v,options),'textarea');assetPlanning(item,asset,{field,change,attach});
  // Asset file ingest: stamp SHA-256 contentHash on Props-with-GLB cards so Place/Link/set-kit can propagate hash to meshes.
  (()=>{const l=document.createElement('label');l.className='field';l.textContent='Asset file'+(asset.file?' Ã‚Â· '+(asset.file.name||asset.file.filename):'');const input=document.createElement('input');input.type='file';input.accept='image/*,audio/*,video/*,.glb';input.onchange=async()=>{const owner=current;const chosen=input.files[0];input.disabled=true;tell('Uploading locallyÃ¢â‚¬Â¦');try{const file=await upload(chosen);if(file){if(current!==owner||!current.assets.includes(asset))throw Error('Upload finished, but the original shot or project changed. Select the file again for the intended shot.');const isGlb=!!(chosen&&/\.glb$/i.test(chosen.name||''));let digest='';if(isGlb){tell('Hashing library GLBÃ¢â‚¬Â¦');digest=await ingestLibraryPropContentHash({},chosen);}if(current!==owner||!current.assets.includes(asset))throw Error('Upload finished, but the original project changed. Select the file again.');change(()=>{asset.file=file;if(digest){asset.contentHash=digest;if(asset.file)asset.file.contentHash=digest;}else clearLibraryAssetContentHash(asset);});tell(digest?'Library GLB attached with content hash.':'Asset file attached.'); }}catch(e){tell(e.message);}finally{input.disabled=false;}};l.append(input);item.append(l);if(asset.file)item.append(button('Detach Asset file',()=>change(()=>{delete asset.file;clearLibraryAssetContentHash(asset);})));})();
  if(isLibraryStagePropGlb(asset)){const hash=libraryAssetContentHash(asset);const hashHint=document.createElement('p');hashHint.className='hint';hashHint.textContent=hash?('Content hash Ã‚Â· '+hash.slice(0,12)+'Ã¢â‚¬Â¦ (propagates to placed meshes / set-kit refs)'):('No content hash yet Ã¢â‚¬â€ Place still works; backfill so older cards can stamp rename-safe hashes onto meshes.');item.append(hashHint);if(!hash)item.append(button('Backfill content hash',async()=>{const owner=current;try{tell('Hashing library GLBÃ¢â‚¬Â¦');const result=await backfillLibraryPropContentHash(structuredClone(asset));if(current!==owner||!current.assets.includes(asset))throw Error('Project changed during backfill.');if(result.status==='stamped')change(()=>{asset.contentHash=result.contentHash;if(asset.file)asset.file.contentHash=result.contentHash;});else if(result.status==='already')tell('This card already has a content hash.');else tell('Hash ready.');if(result.status==='stamped')tell('Content hash saved for '+(asset.name||'prop')+'.');}catch(e){tell(e.message);}}));}
  item.append(button('Build image',()=>openTool('/qwen-editor.html',current.style+'\n'+asset.name+'\n'+asset.brief)),button('Build 3D',()=>openTool('/qwen-editor/mesh.html',asset.name+'\n'+asset.brief)),button('Remove asset',()=>{if(!confirm(removeAssetConfirmMessage(asset,current)))return;const label=(typeof asset.name==='string'&&asset.name.trim())?asset.name.trim():'Untitled asset';const kitN=asset.setKit&&Array.isArray(asset.setKit.props)?asset.setKit.props.length:0;const linked=countAssetLinkedShots(current,asset.id);change(()=>{const i=current.assets.indexOf(asset);if(i<0)throw Error('That asset is no longer in the project.');current.assets.splice(i,1);for(const scene of current.scenes)for(const shot of scene.shots)if(shot.assetIds)shot.assetIds=shot.assetIds.filter(id=>id!==asset.id);});tell(label+(kitN?' (set kit, '+kitN+' prop'+(kitN===1?'':'s')+')':'')+' removed'+(linked?' (unlinked from '+linked+' shot'+(linked===1?'':'s')+')':'')+'. Undo restores.');}));$('assets').append(item);}
 for(const d of document.querySelectorAll('[data-plan]'))d.open=planningOpen.has(d.dataset.plan);
}
for(const id of ['title','style','synopsis'])bindText($(id),(value,options)=>change(()=>current[id]=value,options));
bindText($('scene-title'),(value,options)=>change(()=>{current.scenes.find(s=>s.id===sceneId).title=value;const active=$('scenes').querySelector('.selected');if(active)active.textContent=value;},options));
$('projects').onchange=()=>{current=library.find(p=>p.id===$('projects').value);sceneId=current.scenes[0]?.id;undoStack=[];redoStack=[];lastGroup=null;render();};
$('new').onclick=()=>{undoStack=[];redoStack=[];lastGroup=null;current=newProject();library.push(current);sceneId=current.scenes[0].id;save();render();};
$('add-scene').onclick=()=>change(()=>{const s={id:crypto.randomUUID(),title:'Scene '+(current.scenes.length+1),shots:[]};current.scenes.push(s);sceneId=s.id;});
$('add-shot').onclick=()=>change(()=>current.scenes.find(s=>s.id===sceneId).shots.push({id:crypto.randomUUID(),title:'New shot',seconds:5,action:'',camera:'',dialogue:''}));
for(const [id,delta] of [['scene-up',-1],['scene-down',1]])$(id).onclick=()=>change(()=>{const i=current.scenes.findIndex(s=>s.id===sceneId),j=i+delta;if(j>=0&&j<current.scenes.length)[current.scenes[i],current.scenes[j]]=[current.scenes[j],current.scenes[i]];});
$('add-asset').onclick=()=>change(()=>current.assets.push({id:crypto.randomUUID(),kind:'character',name:'New character',brief:''}));
function travel(from,to){if(!from.length)return;to.push(structuredClone(current));const snapshot=from.pop();for(const key of Object.keys(current))delete current[key];Object.assign(current,snapshot);lastGroup=null;save();render();}
const undoButton=button('Undo',()=>travel(undoStack,redoStack));undoButton.id='director-undo';
const redoButton=button('Redo',()=>travel(redoStack,undoStack));redoButton.id='director-redo';$('backup').after(undoButton,redoButton);
const duplicateScene=button('Duplicate scene',()=>change(()=>{const original=current.scenes.find(s=>s.id===sceneId);const copy=structuredClone(original);copy.id=crypto.randomUUID();copy.title+=' (copy)';copy.shots.forEach(s=>s.id=crypto.randomUUID());current.scenes.splice(current.scenes.indexOf(original)+1,0,copy);sceneId=copy.id;}));duplicateScene.id='duplicate-scene';
const removeScene=button('Remove scene',()=>{if(!canRemoveScene(current)){tell('Keep at least one scene. Remove its shots instead.');return;}const sc=current.scenes.find(s=>s.id===sceneId);if(!sc){tell('That scene is no longer in the episode.');return;}if(!confirm(removeSceneConfirmMessage(sc)))return;const label=(typeof sc.title==='string'&&sc.title.trim())?sc.title.trim():'Untitled scene';const shotCount=Array.isArray(sc.shots)?sc.shots.length:0;change(()=>{const i=current.scenes.findIndex(s=>s.id===sceneId);if(i<0)throw Error('That scene is no longer in the episode.');if(current.scenes.length===1)throw Error('Keep at least one scene. Remove its shots instead.');current.scenes.splice(i,1);sceneId=current.scenes[Math.min(i,current.scenes.length-1)].id;});tell(label+' ('+shotCount+' shot'+(shotCount===1?'':'s')+') removed. Undo restores.');});removeScene.id='remove-scene';removeScene.disabled=!canRemoveScene(current);removeScene.title=canRemoveScene(current)?'Remove this scene and its shots from the episode. Undo restores.':'Keep at least one scene. Remove its shots instead.';const joinNext=button('Join with next scene',()=>{
  const i=current.scenes.findIndex(sc=>sc.id===sceneId);
  const next=current.scenes[i+1];
  if(!next){tell('This is the last scene. Move it earlier, or split a scene first.');return;}
  if(!confirm(joinSceneConfirmMessage(next)))return;
  const nextId=next.id;
  const nextTitle=(typeof next.title==='string'&&next.title.trim())?next.title.trim():'the next scene';
  const nextCount=Array.isArray(next.shots)?next.shots.length:0;
  change(()=>joinSceneWithNext(current,sceneId),{redraw:false});
  if(nextId&&!current.scenes.some(sc=>sc.id===nextId)){
    render();
    tell('Joined '+nextCount+' shot'+(nextCount===1?'':'s')+' from '+nextTitle+' onto this scene. The next scene record (including its plan) was removed. Shot ids stay. Undo restores.');
  }
});
joinNext.id='join-next-scene';
$('scene-down').after(duplicateScene,removeScene,joinNext);
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(recoveryData)$('backup').after(button('Download saved-data recovery',()=>download(recoveryData,'director-recovery.json','application/json')));
$('backup').onclick=()=>download(JSON.stringify(current,null,2),'cartoon-project.json','application/json');
$('script').onclick=()=>download([current.title,current.synopsis,current.style,...current.scenes.flatMap(s=>[s.title,...s.shots.map(x=>`${x.title} (${x.seconds}s)\n${x.action||''}\n${x.camera||''}\n${x.dialogue||''}`)])].join('\n\n'),'episode-script.txt','text/plain');
$('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(/\.zip$/i.test(file.name)){if(!projectStorage?.importZip)throw Error('ZIP import is not ready yet.');await projectStorage.importZip(file);return;}if(file.size>4*1024*1024)throw Error('Project JSON must be under 4 MB.');const p=validateProject(JSON.parse(await file.text()));p.id=crypto.randomUUID();try{backfillProjectLegacyContentHashes(p);}catch{/* keep import */}library.push(p);current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0]?.id;save();render();}catch(e){tell(e.message);}};
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Director request failed.');return data;}
$('render').onclick=async()=>{try{const ready=assembleReadyGate(current);if(!ready.ok)throw Error(ready.reason);validateProject(current);const shots=assemblyShots(current);if(!shots.length||shots.some(s=>!s.media))throw Error('Attach an image or clip to every shot before assembling.');await api('/studio/director/render',{shots:withTitleBurns(current,shots,burnTitles.checked),width:Number($('render-size').value),episodeAudio:current.episodeAudio||[],ducking:current.ducking,dialogueWindows:dialogueWindows(current),masterAudio:masterAudio.checked,burnTitles:burnTitles.checked,...softMuxCaptionsPayload(current,softMuxCaptions.checked,softMuxLanguage.value)});await poll();}catch(e){tell(e.message);}};
$('cancel-render').onclick=async()=>{try{await api('/studio/director/cancel',{});}catch(e){tell(e.message);}};
function syncAssembleExportButtons(job){
  if(job!==undefined)lastAssembleJob=job;
  const ready=assembleReadyGate(current);
  const running=lastAssembleJob?.state==='running';
  const renderBtn=$('render');
  if(renderBtn){
    renderBtn.disabled=!!running||!ready.ok;
    renderBtn.title=running?'Assemble in progress\u2026':ready.reason;
  }
  if(loudnessBusy||!loudnessButton)return;
  const loud=assembleLoudnessGate(lastAssembleJob);
  loudnessButton.disabled=!loud.ok;
  loudnessButton.title=loud.reason;
}
loudnessButton=button('Check exported audio loudness',async()=>{
  loudnessBusy=true;loudnessButton.disabled=true;
  try{
    const job=await api('/studio/director/status');
    lastAssembleJob=job;
    const gate=assembleLoudnessGate(job);
    if(!gate.ok)throw Error(gate.reason);
    tell('Measuring the exported audio\u2026');
    const report=await api('/studio/director/loudness',job.output);
    tell(`Export: ${report.integrated} LUFS \u00b7 true peak ${report.truePeak} dBTP \u00b7 range ${report.range} LU. ${Number(report.truePeak)>-1?'Peak is high; reduce levels or enable balancing.':'Review the mix by ear as well.'}`);
  }catch(error){tell(error.message);}
  finally{loudnessBusy=false;syncAssembleExportButtons();}
});
loudnessButton.className='assemble-loudness-check';
$('cancel-render').after(loudnessButton);
syncAssembleExportButtons(lastAssembleJob);
const softAfterBtn=button('Embed soft captions into last export',async()=>{softAfterBtn.disabled=true;try{if(!softMuxCaptions.checked)throw Error('Check Embed soft captions and pick a language first.');validateProject(current);const job=await api('/studio/director/status');if(job.state==='running')throw Error('Wait for Assemble to finish first.');if(!job.output)throw Error('Assemble an episode first, then embed soft captions into that export.');tell('Embedding soft captions into the last export\u2026');const result=await api('/studio/director/soft-mux-captions',softMuxAfterExportBody(current,softMuxLanguage.value,job.output));$('download-episode').hidden=!result.output;if(result.output)$('download-episode').href='/view?'+new URLSearchParams(result.output);$('render-status').textContent=result.message||'Soft captions embedded. Download your MP4.';tell(result.message||'Soft captions embedded into the last export. Download the updated MP4.');}catch(e){tell(e.message);}finally{softAfterBtn.disabled=false;}});
softAfterBtn.className='assemble-soft-after';softAfterBtn.title='Remux mov_text onto the last Assemble MP4 (video/audio copy; no full re-assemble)';
$('cancel-render').after(softAfterBtn);
const softAfterHint=document.createElement('p');softAfterHint.className='hint assemble-soft-after-hint';softAfterHint.textContent='Already assembled without soft captions? Check Embed soft captions, pick a language, then use Embed soft captions into last export (A/V copy only \u2014 no full re-assemble).';
$('render-status').before(softAfterHint);

async function poll(){try{const job=await api('/studio/director/status');$('render-spinner').hidden=job.state!=='running';$('cancel-render').hidden=job.state!=='running';$('render-status').textContent=job.message||'Ready to assemble.';$('episode-progress').max=job.total||1;$('episode-progress').value=job.completed||0;$('download-episode').hidden=!job.output;if(job.output)$('download-episode').href='/view?'+new URLSearchParams(job.output);syncAssembleExportButtons(job);}catch{$('render-spinner').hidden=true;$('render-status').textContent='Assembly backend offline. Project editing still works.';syncAssembleExportButtons(lastAssembleJob);}}
const production=document.createElement('details');production.className='settings production-overview';
production.innerHTML='<summary>Production overview <span id="production-counts"></span></summary><p class="hint">Story &amp; script → boards &amp; timing → layout → animation (Blocking → Breakdowns → Polish) → cleanup / color → lighting &amp; effects → composite → sound → review &amp; delivery. Row labels list stage statuses and animation-pass gates (B / Bd / P). Filter by scene, status (media, notes, revision), and gate below. Open a row to jump to Review — gate flips stay under Animation passes (manual; no auto-approve).</p><div class="production-overview-filters"><label class="field production-scene-filter">Scene filter<select id="production-scene-filter" aria-label="Filter shots by scene"></select></label><label class="field production-status-filter">Status filter<select id="production-status-filter" aria-label="Filter shots by production status"></select></label><label class="field production-gate-filter">Gate filter<select id="production-gate-filter" aria-label="Filter shots by animation-pass gate"></select></label></div><div id="production-rows"></div>';
$('shots').before(production);
{
 const sceneSel=$('production-scene-filter');
 sceneSel.onchange=()=>updateProduction();
 const statusSel=$('production-status-filter');
 for(const f of PRODUCTION_STATUS_FILTERS)statusSel.add(new Option(f.label,f.id));
 statusSel.value='all';
 statusSel.onchange=()=>updateProduction();
 const sel=$('production-gate-filter');
 for(const f of ANIMATION_PASS_FILTERS)sel.add(new Option(f.label,f.id));
 sel.value='all';
 sel.onchange=()=>updateProduction();
}

// Episode-wide find-shot (title / id / action / camera / dialogue). Session-only; jump via showShot.
{
 const toolbar=document.querySelector('.project-toolbar .actions');
 const findWrap=document.createElement('label');
 findWrap.className='field find-shot-control';
 findWrap.innerHTML='Find shot <input id="find-shot" type="search" placeholder="Title, dialogue, action\u2026" aria-label="Find shot across episode by title, id, dialogue, action, or camera" autocomplete="off" spellcheck="false">';
 const results=document.createElement('div');
 results.id='find-shot-results';
 results.className='find-shot-results';
 results.hidden=true;
 results.setAttribute('role','listbox');
 results.setAttribute('aria-label','Find shot matches');
 const host=document.createElement('div');host.className='find-shot-host';host.append(findWrap,results);if(toolbar)toolbar.append(host);else production.prepend(host);
 const input=$('find-shot');
 let activeIndex=-1;
 const hideResults=()=>{results.hidden=true;results.replaceChildren();activeIndex=-1;results._hits=null;};
 const fieldLabel=(fields)=>{
  if(!fields||!fields.length)return '';
  const order=['title','dialogue','action','camera','id'];
  const sorted=[...fields].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
  return sorted.join(', ');
 };
 const labelFor=(hit)=>{
  const sceneTitle=(typeof hit.scene?.title==='string'&&hit.scene.title.trim())?hit.scene.title.trim():'Untitled scene';
  const shotTitle=(typeof hit.shot?.title==='string'&&hit.shot.title.trim())?hit.shot.title.trim():'Untitled shot';
  const idShort=(hit.shot?.id||'').slice(0,8);
  const via=fieldLabel(hit.fields);
  return sceneTitle+' / Shot '+(hit.shotIndex+1)+' \u00b7 '+shotTitle+(idShort?' \u00b7 '+idShort:'')+(via?' \u00b7 '+via:'');
 };
 const jumpTo=(hit)=>{
  if(!hit?.shot?.id)return;
  hideResults();
  input.value='';
  showShot(hit.shot.id,'review');
  tell('Jumped to '+labelFor(hit));
 };
 const renderResults=()=>{
  const q=normalizeShotFindQuery(input.value);
  if(!q){hideResults();return;}
  const hits=findShotsByQuery(current,q).slice(0,40);
  results.replaceChildren();
  activeIndex=hits.length?0:-1;
  if(!hits.length){
   const empty=document.createElement('p');empty.className='hint find-shot-empty';
   empty.textContent='No shots match "'+q+'".';
   results.append(empty);results.hidden=false;results._hits=[];return;
  }
  hits.forEach((hit,i)=>{
   const b=document.createElement('button');b.type='button';b.className='find-shot-result';
   b.setAttribute('role','option');b.dataset.index=String(i);
   b.textContent=labelFor(hit);
   b.title=(hit.shot?.id||'')+(hit.fields?.length?' \u00b7 '+hit.fields.join(', '):'')+' \u2014 open scene and scroll to shot';
   b.onmousedown=(e)=>e.preventDefault();
   b.onclick=()=>jumpTo(hit);
   if(i===activeIndex)b.classList.add('is-active');
   results.append(b);
  });
  results.hidden=false;
  results._hits=hits;
 };
 const setActive=(next)=>{
  const hits=results._hits||[];
  if(!hits.length)return;
  activeIndex=(next+hits.length)%hits.length;
  [...results.querySelectorAll('.find-shot-result')].forEach((el,i)=>el.classList.toggle('is-active',i===activeIndex));
  results.querySelector('.find-shot-result.is-active')?.scrollIntoView({block:'nearest'});
 };
 input.addEventListener('input',()=>renderResults());
 input.addEventListener('keydown',(e)=>{
  if(e.key==='Escape'){if(!results.hidden){e.preventDefault();hideResults();input.blur();}return;}
  if(e.key==='ArrowDown'){if(!results.hidden){e.preventDefault();setActive(activeIndex+1);}else renderResults();return;}
  if(e.key==='ArrowUp'){if(!results.hidden){e.preventDefault();setActive(activeIndex-1);}return;}
  if(e.key==='Enter'){
   const hits=results._hits||[];
   if(!results.hidden&&hits.length&&activeIndex>=0){e.preventDefault();jumpTo(hits[activeIndex]);}
   return;
  }
 });
 input.addEventListener('blur',()=>setTimeout(hideResults,150));
 document.addEventListener('keydown',(e)=>{
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey)return;
  const tag=(e.target&&e.target.tagName||'').toLowerCase();
  if(tag==='input'||tag==='textarea'||tag==='select'||e.target?.isContentEditable)return;
  e.preventDefault();
  input.focus();input.select();
 });
}
function updateProduction(){
 if(!$('production-counts'))return;
 const counts=productionSummary(current);
 const pass=counts.passes||{blocking:0,breakdowns:0,polish:0,gated:0,complete:0};
 const sceneSel=$('production-scene-filter');
 if(sceneSel){
  const prev=sceneSel.value||'all';
  const opts=productionOverviewSceneFilters(current);
  sceneSel.replaceChildren();
  for(const f of opts)sceneSel.add(new Option(f.label,f.id));
  sceneSel.value=opts.some(f=>f.id===prev)?prev:'all';
 }
 const sceneFilter=sceneSel?.value||'all';
 const statusFilter=$('production-status-filter')?.value||'all';
 const filter=$('production-gate-filter')?.value||'all';
 $('production-counts').textContent=`${counts.media}/${counts.shots} media · ${counts.changes} need changes · ${counts.review} in review · ${counts.notes} open notes · gates ${pass.blocking}/${pass.breakdowns}/${pass.polish} Approved of ${counts.shots} (B/Bd/P) · ${pass.complete} all-three · ${pass.gated} open gates`;
 const rows=$('production-rows');rows.replaceChildren();
 const entries=[];
 for(const scene of current.scenes)for(const shot of scene.shots){
  if(!shotMatchesProductionSceneFilter(scene,sceneFilter))continue;
  if(!shotMatchesProductionStatusFilter(shot,statusFilter))continue;
  if(!shotMatchesAnimationPassFilter(shot,filter))continue;
  const attn=productionOverviewAttention(shot);
  entries.push({scene,shot,gated:!!attn.gated,attn});
 }
 entries.sort((a,b)=>compareProductionOverviewAttention(a.attn,b.attn));
 for(const {scene,shot,gated,attn} of entries){
  const tasks=Object.entries(shot.production||{}).filter(([,status])=>status!=='Not started').map(([stage,status])=>stage+': '+status);
  const passes=animationPassLabel(shot);
  const compact=animationPassCompact(shot);
  const mediaLabel=usesBoards(shot)?'Storyboard panels':shotHasMedia(shot)?'Recorded clip':'Missing media';
  const flags=[attn.missing?'missing media':'',attn.notes?'open notes':'',attn.changes?'needs changes':'',attn.review?'ready for review':'',gated?'open gates':''].filter(Boolean);
  const b=button(`${scene.title} / ${shot.title||'Untitled shot'} - ${mediaLabel}${tasks.length?' · '+tasks.join(' / '):''} · ${compact}${flags.length?' · '+flags.join(' · '):''}`,()=>showShot(shot.id,'review'));
  b.title=passes+(flags.length?' - '+flags.join(', '):'');
  b.classList.toggle('production-row-gated',gated);
  b.classList.toggle('production-row-missing',!!attn.missing);
  b.classList.toggle('production-row-notes',!!attn.notes);
  rows.append(b);
 }
 if(!entries.length){
  const empty=document.createElement('p');empty.className='hint';
  const narrowing=sceneFilter!=='all'||statusFilter!=='all'||filter!=='all';
  empty.textContent=narrowing?'No shots match these filters.':'No shots yet.';
  rows.append(empty);
 }
}

const episodeAudioHost=document.createElement('div'),storyHost=document.createElement('div'),sceneHost=document.createElement('div'),planningChecks=document.createElement('details');planningChecks.className='settings';
 $('shots').before(storyHost,sceneHost,episodeAudioHost,planningChecks);
 animatic=createAnimatic(production,{change});
delivery=createDelivery(document.querySelector('.assembly-panel'),{getProject:()=>current,button,download,tell,goToShot:id=>showShot(id,'plan'),change});
const assembleGuides=document.createElement('div');assembleGuides.className='assemble-safe-area';assembleGuides.id='assemble-safe-area';document.querySelector('.assembly-panel summary')?.after(assembleGuides);function refreshAssembleGuides(){ assembleGuides.replaceChildren(); if(!current)return; safeAreaGuideControls(assembleGuides,current,{change:(fn)=>change(fn)});}refreshAssembleGuides();
timing=createTimingCheck(document.querySelector('.assembly-panel'),{getProject:()=>current,getScene:()=>current.scenes.find(s=>s.id===sceneId),button,goToShot:id=>showShot(id,'plan'),change,tell});
assistant=createDirectorAssistant(production,{getProject:()=>current,getScene:()=>current.scenes.find(s=>s.id===sceneId),getLibrary:()=>library,change,upload,tell,download});
const demo=document.createElement('details');demo.className='settings';
demo.innerHTML='<summary>Watch & edit a demo cartoon trailer</summary><p>The Last Starlight Ã‚Â· animation pass 3 Ã‚Â· 36 seconds. Planted-foot walking, shaded surfaces, selective detail and smooth scene dissolves. Motion and transitions are baked into six clips; keep their order for the intended continuity.</p><video controls preload="none" poster="demo-starlight.png?v=3" style="width:100%;max-width:960px;border-radius:12px" src="/view?filename=the-last-starlight-demo-v3.mp4&subfolder=Qwen-Studio%2FDirector&type=output"></video>';
demo.append(button('Add demo as a new episode',async()=>{try{const response=await fetch('demo-starlight.json');if(!response.ok)throw Error('Demo project could not be loaded.');const p=validateProject(await response.json());p.id=crypto.randomUUID();library.push(p);current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0].id;save();render();tell('Demo added as a separate episode. Your other projects are still in the project list.');}catch(e){tell(e.message);}}));
production.before(demo);
projectStorage=createProjectStorage({getProject:()=>current,getLibrary:()=>library,button,tell,host:$('backup'),change,upload,applyImportedProject:(project,meta={})=>{
 const p=validateProject(structuredClone(project));
 try{backfillProjectLegacyContentHashes(p);}catch{/* keep import */}
 const mode=meta.mode||'new';
 if(mode==='replace'){const i=library.findIndex(x=>x.id===p.id);if(i>=0)library[i]=p;else library.push(p);}
 else{if(library.some(x=>x.id===p.id))p.id=crypto.randomUUID();library.push(p);}
 current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0]?.id;save();render();
}});
createReview(production,{getProject:()=>current,button,change,tell});
for(const project of library)projectStorage.schedule(project);
async function loadSharedProjects(){
 try{
  const response=await fetch('/studio/director/projects');
  if(!response.ok)return;
  const disk=await response.json();
  if(!Array.isArray(disk))return;
  let added=0;
  for(const item of disk){
   if(!item||typeof item.id!=='string'||library.some(project=>project.id===item.id))continue;
   try{library.push(validateProject(structuredClone(item)));added++;}catch{/* skip an unreadable snapshot */ }
  }
  if(!added)return;
  try{localStorage.setItem(KEY,JSON.stringify(library));}catch{}
  for(const project of library)projectStorage.schedule(project);
  render();
  tell(added+' episode'+(added===1?'':'s')+' saved on this computer added to the project list.');
 }catch{}
}
loadSharedProjects();
const restoreDisk=button('Recover project from disk',async()=>{try{const r=await fetch('/studio/director/projects');if(!r.ok)throw Error('Disk projects are unavailable.');const projects=await r.json();const select=document.createElement('select');select.setAttribute('aria-label','Disk project backup');select.add(new Option('Choose a disk project to restore as a copyÃ¢â‚¬Â¦',''));projects.forEach((p,i)=>select.add(new Option(p.title,String(i))));select.onchange=()=>{try{if(select.value==='')return;const p=validateProject(structuredClone(projects[Number(select.value)]));p.id=crypto.randomUUID();p.title+=' (recovered)';library.push(p);current=p;sceneId=p.scenes[0].id;undoStack=[];redoStack=[];save();render();select.remove();}catch(e){tell(e.message);}};restoreDisk.after(select);if(!projects.length)tell('No disk snapshots found.');}catch(e){tell(e.message);}});$('backup').after(restoreDisk);
render();poll();setInterval(poll,2000);
