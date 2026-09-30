import {followShots} from './director-links.js';
import {createProjectStorage} from './director-storage.js';
import {imageReferences} from './director-references.js';
import {createReview} from './director-review.js';
import {lipSyncControls} from './director-lipsync.js';
import {dialogueWindows} from './director-audio-edit.js';
import {episodeAudioControls} from './director-episode-audio.js';
import {audioOverviewControls} from './director-audio-overview.js';
import {storyRoom,scenePlanning,assetPlanning,shotPlanning,refreshPlanningIssues} from './director-planning.js';
import {assemblyShots,usesBoards,setShotSeconds} from './director-planning-state.js';
import {createAnimatic} from './director-animatic.js';
import {createDelivery} from './director-delivery.js';
import {createTimingCheck, setMediaTrim, clearMediaTrim, mediaTrim, scrubOutHandleSeconds, scrubHandlesToTrim, shotHoldSeconds, setShotHoldSeconds, clearShotHoldSeconds, shotPlaybackSpeed, setShotPlaybackSpeed, clearShotPlaybackSpeed, shotTransition, setShotTransition, clearShotTransition, mediaPeaksKey, MEDIA_PEAKS_BINS, isSilentPeaks, peaksFromSamples, luminanceEnergy, normalizePeaks} from './director-timing.js';
import {drawingControls} from './director-drawing.js';
import {exposureControls} from './director-exposure.js';
import {rig3DControls} from './director-3d-state.js';
import {uploadDirectorFile} from './director-upload.js';
import {createDirectorAssistant} from './director-assistant.js';
import {productionControls,productionSummary} from './director-production.js';
import {newProject,validateProject,duration,time,shotBrief} from './director-project.js';
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
const masterLabel=document.createElement('label'),masterAudio=document.createElement('input');masterAudio.type='checkbox';masterLabel.append(masterAudio,document.createTextNode('Balance final audio for web playback (−16 LUFS, −1.5 dBTP target)'));$('render').before(masterLabel);
const resumeHint=document.createElement('p');resumeHint.className='hint';resumeHint.textContent='Exports keep completed shot checkpoints on disk. After an interruption, assemble the same project again to reuse them. Changed shot media or timing starts a new checkpoint set.';$('render').before(resumeHint);
function save(){try{if(recoveryData&&!recoveryStored)throw Error('Original saved data is protected. Download your current project; browser storage cannot safely be replaced.');validateProject(current);localStorage.setItem(KEY,JSON.stringify(library));projectStorage?.schedule();tell('Saved in this browser · disk snapshot scheduled. Use the media backup for a complete archive.');}catch(e){tell('Not saved: '+e.message);}}
function rememberSelection(){try{localStorage.setItem(KEY+'-selection',JSON.stringify({project:current.id,scene:sceneId}));}catch{}}
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
function attach(parent,label,object,key,accept){const l=document.createElement('label');l.className='field';l.textContent=label+(object[key]?' · '+(object[key].name||object[key].filename):'');const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=async()=>{const owner=current;input.disabled=true;tell('Uploading locally…');try{const file=await upload(input.files[0]);if(file){if(current!==owner||!(current.assets.includes(object)||current.episodeAudio?.includes(object)||current.scenes.some(s=>s.shots.some(x=>x===object||x.panels?.includes(object)||x.audioTracks?.includes(object)))))throw Error('Upload finished, but the original shot or project changed. Select the file again for the intended shot.');change(()=>object[key]=file);}}catch(e){tell(e.message);}finally{input.disabled=false;}};l.append(input);parent.append(l);if(object[key])parent.append(button('Detach '+label,()=>change(()=>delete object[key])));}
function openTool(path,brief,shot){try{sessionStorage.removeItem('studio-director-references');if(shot&&path==='/qwen-editor.html'){const refs=imageReferences(current,shot);if(refs.length>3)throw Error('Select fewer visual assets for this shot: image editing supports three pictures total, including the storyboard.');sessionStorage.setItem('studio-director-references',JSON.stringify(refs));brief+='\n'+refs.map((r,i)=>`Picture ${i+1}: ${r.label}`).join('\n');}sessionStorage.setItem('studio-director-brief',brief);location.href=path+(path.includes('?')?'&':'?')+'director=1';}catch(error){tell(error.message);}}
async function chooseOutput(parent,shot){
 try{const response=await fetch('/history?max_items=100');if(!response.ok)throw Error('Could not load Studio outputs.');const history=await response.json();const files=Object.values(history).reverse().flatMap(h=>Object.values(h.outputs||{}).flatMap(o=>o.images||[])).filter(f=>f.type==='output'&&/\.(png|jpe?g|webp|mp4|webm|mov|mkv|m4v)$/i.test(f.filename));
 const select=document.createElement('select');select.setAttribute('aria-label','Choose Studio output');select.add(new Option('Choose an existing image or video…',''));files.forEach((f,i)=>select.add(new Option([f.subfolder,f.filename].filter(Boolean).join('/'),String(i))));select.onchange=()=>{if(select.value!=='')change(()=>shot.media=files[Number(select.value)]);};parent.append(select);if(!files.length)tell('No recent Studio image or video outputs found. You can upload a file instead.');
 }catch(e){tell(e.message);}
}
function updateCounts(){if(planningChecks)refreshPlanningIssues(planningChecks,current);assistant?.refresh();animatic?.reset(current);delivery?.update();timing?.update();updateProduction();const shots=current.scenes.flatMap(s=>s.shots);if($('scene-count'))$('scene-count').textContent=current.scenes.length;if($('shot-count'))$('shot-count').textContent=shots.length+(shots.length===1?' shot':' shots');if($('media-count'))$('media-count').textContent=shots.filter(s=>usesBoards(s)?s.panels?.length&&s.panels.every(p=>p.media):s.media).length+' / '+shots.length+' shots attached';}

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
        catch{return {kind:'silent',duration,peaks:null,note:'Silent / no audio — scrub only.'};}
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
  const inRange=document.createElement('input');inRange.type='range';inRange.min='0';inRange.step='0.001';inRange.disabled=true;inRange.setAttribute('aria-label','Source in handle');
  const outRange=document.createElement('input');outRange.type='range';outRange.min='0';outRange.step='0.001';outRange.disabled=true;outRange.setAttribute('aria-label','Source out handle');
  track.append(peaksCanvas,rangeFill,inRange,outRange);box.append(status,track);parent.append(box);
  let peaksInfo=null;
  const alive=()=>box.isConnected;
  function peaksNote(){
    if(!peaksInfo)return 'loading peaks\u2026';
    if(peaksInfo.kind==='audio')return 'audio waveform';
    if(peaksInfo.kind==='luminance')return 'silent audio \u00b7 luminance strip';
    if(peaksInfo.kind==='silent')return peaksInfo.note||'silent (scrub only)';
    return peaksInfo.note||'peaks unavailable';
  }
  function paint(duration){const trim=mediaTrim(shot.media);const inn=trim.sourceIn;const out=scrubOutHandleSeconds(trim.sourceOut,duration);inRange.max=String(duration);outRange.max=String(duration);inRange.value=String(inn);outRange.value=String(out);const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';const outLabel=trim.sourceOut==null?'end of file':trim.sourceOut.toFixed(3)+'s';status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+outLabel+' \u00b7 '+peaksNote()+' (scrub writes the same source in/out as the numeric fields; works with playback speed and hold).';if(peaksInfo?.peaks)drawMediaPeaks(peaksCanvas,peaksInfo.peaks,peaksInfo.kind);}
  function livePaint(duration){let inn=Number(inRange.value);let out=Number(outRange.value);if(inn>=out){if(document.activeElement===inRange)inn=Math.max(0,out-0.001);else out=Math.min(duration,inn+0.001);inRange.value=String(inn);outRange.value=String(out);}const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+out.toFixed(3)+'s (release to save).';}
  function commit(duration){change(()=>{const next=scrubHandlesToTrim(Number(inRange.value),Number(outRange.value),duration);setMediaTrim(shot.media,next.sourceIn,next.sourceOut);});}
  probeClipDuration(shot.media).then(async duration=>{
    if(!alive())return;
    if(!Number.isFinite(duration)||duration<=0){status.textContent='Could not read clip duration for scrub handles. Use the numeric source in/out fields.';return;}
    inRange.disabled=false;outRange.disabled=false;paint(duration);
    inRange.oninput=()=>livePaint(duration);outRange.oninput=()=>livePaint(duration);
    inRange.onchange=()=>commit(duration);outRange.onchange=()=>commit(duration);
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
 $('scenes').replaceChildren();for(const scene of current.scenes){const b=button(scene.title+' · '+time(scene.shots.reduce((n,s)=>n+s.seconds,0)),()=>{sceneId=scene.id;render();});b.classList.toggle('selected',scene.id===sceneId);$('scenes').append(b);}
 const scene=current.scenes.find(s=>s.id===sceneId)||current.scenes[0];sceneId=scene?.id;$('scene-title').value=scene?.title||'';$('shots').replaceChildren();
 episodeAudioControls(episodeAudioHost,current,{field,button,change,attach});
 storyRoom(storyHost,current,{field,button,change,download});scenePlanning(sceneHost,current,scene,{field,button,change});
 let start=0;for(const s of current.scenes){if(s===scene)break;start+=s.shots.reduce((n,x)=>n+x.seconds,0);}
 for(const [index,shot] of (scene?.shots||[]).entries()){
  const card=document.createElement('article');card.className='shot';card.dataset.shotId=shot.id;const h=document.createElement('h3');h.textContent=`Shot ${index+1} · ${time(start)} – ${time(start+shot.seconds)}`;start+=shot.seconds;card.append(h);
  for(const [key,label,type] of [['title','Shot title','text'],['seconds','Duration in seconds (1–3600)','number'],['action','Action / storyboard brief','textarea'],['camera','Camera / framing','text'],['dialogue','Dialogue / sound notes','textarea']])field(card,label,shot[key],(v,options)=>change(()=>{if(key==='seconds')setShotSeconds(shot,Number(v));else shot[key]=v;},options),type);
  const actions=document.createElement('div');actions.className='actions';actions.append(button('Build image',()=>openTool('/qwen-editor.html',shotBrief(current,scene,shot),shot)),button('Build video',()=>openTool('/qwen-editor/video.html',shotBrief(current,scene,shot))),button('Build 3D prop',()=>openTool('/qwen-editor/mesh.html',shotBrief(current,scene,shot))));
  for(const [label,delta] of [['Earlier',-1],['Later',1]])actions.append(button(label,()=>change(()=>{const to=index+delta;if(to>=0&&to<scene.shots.length)[scene.shots[index],scene.shots[to]]=[scene.shots[to],scene.shots[index]];})));
  actions.append(button('Duplicate',()=>change(()=>scene.shots.splice(index+1,0,{...structuredClone(shot),id:crypto.randomUUID()}))),button('Remove shot',()=>change(()=>scene.shots.splice(index,1))));card.append(actions);
  card.append(button('Choose existing Studio output',()=>chooseOutput(card,shot)));
  attach(card,'Storyboard image or clip',shot,'media','image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,.mov,.mkv,.m4v');attach(card,'Voice / music audio',shot,'audio','audio/*');
  if(shot.audio){
    const audioTrack={id:shot.id+'-audio',media:shot.audio,sourceStart:0,duration:shot.seconds||1,volume:1,fadeIn:0,fadeOut:0,start:0};
    audioOverviewControls(card,audioTrack,current,{button,change,title:'Shot voice/music overview · peaks & crossfaded scrub',autoLoad:true});
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
    if(shot.media.sourceIn!==undefined||shot.media.sourceOut!==undefined)card.append(button('Clear media trim',()=>change(()=>clearMediaTrim(shot.media))));
    {
      const hold = shotHoldSeconds(shot);
      const holdLabel = document.createElement('label');holdLabel.className='field';holdLabel.append(document.createTextNode('Hold last frame (seconds)'));
      const holdInput = document.createElement('input');holdInput.type='number';holdInput.min='0';holdInput.max='3600';holdInput.step='1';holdInput.value=hold?String(hold):'0';holdInput.setAttribute('aria-label','Hold last frame seconds');
      holdInput.onchange=()=>change(()=>{setShotHoldSeconds(shot,Math.round(Number(holdInput.value)||0));});
      holdLabel.append(holdInput);card.append(holdLabel);
      const holdHint=document.createElement('p');holdHint.className='hint';
      holdHint.textContent='After the trimmed clip plays, assembly pads this many seconds of the last frame (ffmpeg tpad). 0 = no intentional hold. Fit shot to clip keeps this hold on top of the moving length.';
      card.append(holdHint);
      if(shot.holdSeconds)card.append(button('Clear hold',()=>change(()=>clearShotHoldSeconds(shot))));
    }
    {
      const speed = shotPlaybackSpeed(shot);
      const speedLabel = document.createElement('label');speedLabel.className='field';speedLabel.append(document.createTextNode('Playback speed (0.5x-2x)'));
      const speedInput = document.createElement('input');speedInput.type='number';speedInput.min='0.5';speedInput.max='2';speedInput.step='0.05';speedInput.value=String(speed);speedInput.setAttribute('aria-label','Playback speed');
      speedInput.onchange=()=>change(()=>{setShotPlaybackSpeed(shot,Number(speedInput.value));});
      speedLabel.append(speedInput);card.append(speedLabel);
      const speedHint=document.createElement('p');speedHint.className='hint';
      speedHint.textContent='How fast the trimmed clip plays in animatic and Assemble. 1 = normal. Fit shot to clip uses trimmed length divided by speed, then adds hold. 0.5 slows; 2 speeds up.';
      card.append(speedHint);
      if(shot.playbackSpeed!==undefined && shot.playbackSpeed!==1)card.append(button('Clear playback speed',()=>change(()=>clearShotPlaybackSpeed(shot))));
    }
  }
    {
    const trans = shotTransition(shot);
    const tLabel = document.createElement('label');tLabel.className='field';tLabel.append(document.createTextNode('Transition into next shot'));
    const tSelect = document.createElement('select');tSelect.setAttribute('aria-label','Transition into next shot');
    tSelect.add(new Option('Hard cut (default)','cut'));tSelect.add(new Option('Dissolve','dissolve'));tSelect.value=trans.type;
    tLabel.append(tSelect);card.append(tLabel);
    const dLabel = document.createElement('label');dLabel.className='field';dLabel.append(document.createTextNode('Dissolve duration (seconds)'));
    const dInput = document.createElement('input');dInput.type='number';dInput.min='0.1';dInput.max='30';dInput.step='0.1';dInput.value=trans.type==='dissolve'?String(trans.durationSec):'1';dInput.disabled=trans.type!=='dissolve';dInput.setAttribute('aria-label','Dissolve duration in seconds');
    dLabel.append(dInput);card.append(dLabel);
    tSelect.onchange=()=>change(()=>{if(tSelect.value==='cut')setShotTransition(shot,'cut');else setShotTransition(shot,'dissolve',Number(dInput.value)||1);});
    dInput.onchange=()=>change(()=>{if(tSelect.value==='dissolve')setShotTransition(shot,'dissolve',Number(dInput.value));});
    const tHint=document.createElement('p');tHint.className='hint';
    tHint.textContent='Hard cut is the default. Dissolve overlaps the end of this shot with the start of the next in animatic preview and Assemble (ffmpeg xfade). Ignored on the last shot.';
    card.append(tHint);
    if(shot.transition)card.append(button('Clear transition',()=>change(()=>clearShotTransition(shot))));
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
  else if(stage==='plan')shotPlanning(card,current,scene,shot,{field,button,change,attach});
  else if(stage==='review'){productionControls(card,current,shot,{change,button,tell});card.querySelector('.production-controls').open=expanded.has(shot.id);}
  else if(stage==='draw'){
   if(!drawingViews.has(shot.id))drawingViews.set(shot.id,{});
   drawingControls(card,shot,{change,button,tell,upload,isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot)),undo:()=>travel(undoStack,redoStack),redo:()=>travel(redoStack,undoStack),canUndo:()=>!!undoStack.length,canRedo:()=>!!redoStack.length,view:drawingViews.get(shot.id)});
   card.querySelector('.drawing-controls').open=drawingsOpen.has(shot.id);
   exposureControls(card,shot,{change});
   card.querySelector('.exposure-sheet').open=sheetsOpen.has(shot.id);
  }else if(stage==='face'){
   lipSyncControls(card,shot,{button,change,tell,projectId:owner.id,isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   rig3DControls(card,shot,{stage,change,button,tell,upload,getSetups:()=>owner.assets.filter(a=>a.rigSetup),saveSetup:asset=>{if(current!==owner)throw Error('Return to the original project to save this setup.');change(()=>owner.assets.push(asset));},isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   card.querySelector('.rig3d-controls').open=rigsOpen.has(shot.id);
  }else{
   rig3DControls(card,shot,{stage,change,button,tell,upload,getSetups:()=>owner.assets.filter(a=>a.rigSetup),saveSetup:asset=>{if(current!==owner)throw Error('Return to the original project to save this setup.');change(()=>owner.assets.push(asset));},isCurrent:()=>current===owner&&current.scenes.some(s=>s.shots.includes(shot))});
   card.querySelector('.rig3d-controls').open=rigsOpen.has(shot.id);
  }
  $('shots').append(card);
 }
 if(!scene?.shots.length){const empty=document.createElement('div');empty.className='sequence-empty';empty.innerHTML='<span class="empty-film" aria-hidden="true">▤</span><h3>Every story starts with a shot.</h3><p>Set the action, frame the camera and build your first moment. Your sequence will take shape here.</p>';empty.append(button('Create your first shot',()=>$('add-shot').click()));$('shots').append(empty);}
 $('assets').replaceChildren();for(const asset of current.assets){const item=document.createElement('div');item.className='shot';const select=document.createElement('select');for(const k of ['character','set','prop','voice','music'])select.add(new Option(k,k));select.value=asset.kind;select.onchange=()=>{if(asset.rigSetup&&!['character','set'].includes(select.value)){select.value=asset.kind;tell('Rig setups must stay a character or set.');return;}change(()=>asset.kind=select.value);};item.append(select);if(asset.rigSetup){const info=document.createElement('p');info.className='hint';info.textContent='Reusable rig setup · '+asset.rigSetup.rig.names.length+' joints. Load a copy from a shot’s Character continuity panel.';item.append(info);}field(item,'Name',asset.name,(v,options)=>change(()=>asset.name=v,options));field(item,'Design / consistency notes',asset.brief,(v,options)=>change(()=>asset.brief=v,options),'textarea');assetPlanning(item,asset,{field,change});attach(item,'Asset file',asset,'file','image/*,audio/*,video/*,.glb');item.append(button('Build image',()=>openTool('/qwen-editor.html',current.style+'\n'+asset.name+'\n'+asset.brief)),button('Build 3D',()=>openTool('/qwen-editor/mesh.html',asset.name+'\n'+asset.brief)),button('Remove asset',()=>change(()=>{current.assets.splice(current.assets.indexOf(asset),1);for(const scene of current.scenes)for(const shot of scene.shots)if(shot.assetIds)shot.assetIds=shot.assetIds.filter(id=>id!==asset.id);})));$('assets').append(item);}
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
const removeScene=button('Remove scene',()=>change(()=>{if(current.scenes.length===1)throw Error('Keep at least one scene. Remove its shots instead.');const i=current.scenes.findIndex(s=>s.id===sceneId);current.scenes.splice(i,1);sceneId=current.scenes[Math.min(i,current.scenes.length-1)].id;}));removeScene.id='remove-scene';$('scene-down').after(duplicateScene,removeScene);
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
if(recoveryData)$('backup').after(button('Download saved-data recovery',()=>download(recoveryData,'director-recovery.json','application/json')));
$('backup').onclick=()=>download(JSON.stringify(current,null,2),'cartoon-project.json','application/json');
$('script').onclick=()=>download([current.title,current.synopsis,current.style,...current.scenes.flatMap(s=>[s.title,...s.shots.map(x=>`${x.title} (${x.seconds}s)\n${x.action||''}\n${x.camera||''}\n${x.dialogue||''}`)])].join('\n\n'),'episode-script.txt','text/plain');
$('import').onchange=async()=>{try{const file=$('import').files[0];if(!file)return;if(/\.zip$/i.test(file.name)){if(!projectStorage?.importZip)throw Error('ZIP import is not ready yet.');await projectStorage.importZip(file);return;}if(file.size>4*1024*1024)throw Error('Project JSON must be under 4 MB.');const p=validateProject(JSON.parse(await file.text()));p.id=crypto.randomUUID();library.push(p);current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0]?.id;save();render();}catch(e){tell(e.message);}};
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Director request failed.');return data;}
$('render').onclick=async()=>{try{validateProject(current);const shots=assemblyShots(current);if(!shots.length||shots.some(s=>!s.media))throw Error('Attach an image or clip to every shot before assembling.');await api('/studio/director/render',{shots,width:Number($('render-size').value),episodeAudio:current.episodeAudio||[],ducking:current.ducking,dialogueWindows:dialogueWindows(current),masterAudio:masterAudio.checked});await poll();}catch(e){tell(e.message);}};
$('cancel-render').onclick=async()=>{try{await api('/studio/director/cancel',{});}catch(e){tell(e.message);}};
const loudnessButton=button('Check exported audio loudness',async()=>{loudnessButton.disabled=true;try{const job=await api('/studio/director/status');if(!job.output)throw Error('Assemble an episode first.');tell('Measuring the exported audio…');const report=await api('/studio/director/loudness',job.output);tell(`Export: ${report.integrated} LUFS · true peak ${report.truePeak} dBTP · range ${report.range} LU. ${Number(report.truePeak)>-1?'Peak is high; reduce levels or enable balancing.':'Review the mix by ear as well.'}`);}catch(error){tell(error.message);}finally{loudnessButton.disabled=false;}});$('cancel-render').after(loudnessButton);
async function poll(){try{const job=await api('/studio/director/status');$('render').disabled=job.state==='running';$('render-spinner').hidden=job.state!=='running';$('cancel-render').hidden=job.state!=='running';$('render-status').textContent=job.message||'Ready to assemble.';$('episode-progress').max=job.total||1;$('episode-progress').value=job.completed||0;$('download-episode').hidden=!job.output;if(job.output)$('download-episode').href='/view?'+new URLSearchParams(job.output);}catch{$('render-spinner').hidden=true;$('render-status').textContent='Assembly backend offline. Project editing still works.';}}
const production= document.createElement('details');production.className='settings production-overview';
production.innerHTML='<summary>Production overview <span id="production-counts"></span></summary><p class="hint">Story & script → boards & timing → layout → animation → cleanup / color → lighting & effects → composite → sound → review & delivery. Use only the stages your project needs.</p><div id="production-rows"></div>';
$('shots').before(production);
function updateProduction(){
 if(!$('production-counts'))return;
 const counts=productionSummary(current);
 $('production-counts').textContent=`${counts.media}/${counts.shots} media attached · ${counts.changes} need changes · ${counts.review} in review · ${counts.notes} open notes`;
 const rows=$('production-rows');rows.replaceChildren();
 for(const scene of current.scenes)for(const shot of scene.shots){
  const tasks=Object.entries(shot.production||{}).filter(([,status])=>status!=='Not started').map(([stage,status])=>stage+': '+status);
  const b=button(`${scene.title} / ${shot.title||'Untitled shot'} — ${usesBoards(shot)?'Storyboard panels':shot.media?'Recorded clip':'Missing media'}${tasks.length?' · '+tasks.join(' / '):''}`,()=>showShot(shot.id,'review'));
  rows.append(b);
 }
}
const episodeAudioHost=document.createElement('div'),storyHost=document.createElement('div'),sceneHost=document.createElement('div'),planningChecks=document.createElement('details');planningChecks.className='settings';
 $('shots').before(storyHost,sceneHost,episodeAudioHost,planningChecks);
 animatic=createAnimatic(production);
delivery=createDelivery(document.querySelector('.assembly-panel'),{getProject:()=>current,button,download,tell,goToShot:id=>showShot(id,'plan')});
timing=createTimingCheck(document.querySelector('.assembly-panel'),{getProject:()=>current,button,goToShot:id=>showShot(id,'plan'),change});
assistant=createDirectorAssistant(production,{getProject:()=>current,getScene:()=>current.scenes.find(s=>s.id===sceneId),getLibrary:()=>library,change,upload,tell,download});
const demo=document.createElement('details');demo.className='settings';
demo.innerHTML='<summary>Watch & edit a demo cartoon trailer</summary><p>The Last Starlight · animation pass 3 · 36 seconds. Planted-foot walking, shaded surfaces, selective detail and smooth scene dissolves. Motion and transitions are baked into six clips; keep their order for the intended continuity.</p><video controls preload="none" poster="demo-starlight.png?v=3" style="width:100%;max-width:960px;border-radius:12px" src="/view?filename=the-last-starlight-demo-v3.mp4&subfolder=Qwen-Studio%2FDirector&type=output"></video>';
demo.append(button('Add demo as a new episode',async()=>{try{const response=await fetch('demo-starlight.json');if(!response.ok)throw Error('Demo project could not be loaded.');const p=validateProject(await response.json());p.id=crypto.randomUUID();library.push(p);current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0].id;save();render();tell('Demo added as a separate episode. Your other projects are still in the project list.');}catch(e){tell(e.message);}}));
production.before(demo);
projectStorage=createProjectStorage({getProject:()=>current,getLibrary:()=>library,button,tell,host:$('backup'),change,upload,applyImportedProject:(project,meta={})=>{
 const p=validateProject(structuredClone(project));
 const mode=meta.mode||'new';
 if(mode==='replace'){const i=library.findIndex(x=>x.id===p.id);if(i>=0)library[i]=p;else library.push(p);}
 else{if(library.some(x=>x.id===p.id))p.id=crypto.randomUUID();library.push(p);}
 current=p;undoStack=[];redoStack=[];lastGroup=null;sceneId=p.scenes[0]?.id;save();render();
}});
createReview(production,{getProject:()=>current,button,change,tell});
for(const project of library)projectStorage.schedule(project);
const restoreDisk=button('Recover project from disk',async()=>{try{const r=await fetch('/studio/director/projects');if(!r.ok)throw Error('Disk projects are unavailable.');const projects=await r.json();const select=document.createElement('select');select.setAttribute('aria-label','Disk project backup');select.add(new Option('Choose a disk project to restore as a copy…',''));projects.forEach((p,i)=>select.add(new Option(p.title,String(i))));select.onchange=()=>{try{if(select.value==='')return;const p=validateProject(structuredClone(projects[Number(select.value)]));p.id=crypto.randomUUID();p.title+=' (recovered)';library.push(p);current=p;sceneId=p.scenes[0].id;undoStack=[];redoStack=[];save();render();select.remove();}catch(e){tell(e.message);}};restoreDisk.after(select);if(!projects.length)tell('No disk snapshots found.');}catch(e){tell(e.message);}});$('backup').after(restoreDisk);
render();poll();setInterval(poll,2000);
