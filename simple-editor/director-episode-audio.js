import {duckDefaults,duckGain,dialogueWindows,createTransportGain,spliceSeekMedia,ensureSpliceAlt,TRANSPORT_LONG_SEEK_SEC,TRANSPORT_SEEK_RAMP_MS} from './director-audio-edit.js';
import {audioOverviewControls} from './director-audio-overview.js';
import {validateBeatMarkers} from './director-beat-markers.js';
export function validateEpisodeAudio(tracks){
 if(tracks===undefined)return;
 if(!Array.isArray(tracks)||tracks.length>32)throw Error('Keep at most 32 episode audio clips.');
 const ids=new Set();
 for(const t of tracks){
  if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id))throw Error('Episode audio clips need unique IDs.');ids.add(t.id);
  if(t.anchorShot!==undefined&&typeof t.anchorShot!=='string')throw Error('Invalid linked shot.');
  if(!['music','ambience','dialogue','effects'].includes(t.kind)||typeof t.label!=='string'||typeof t.muted!=='boolean')throw Error('Invalid episode audio clip.');
  for(const k of ['start','sourceStart','duration','fadeIn','fadeOut','volume'])if(!Number.isFinite(t[k])||t[k]<0)throw Error('Audio timing and levels must be nonnegative numbers.');
  if(t.start>14400||t.sourceStart>14400||t.duration<1/24||t.duration>14400||t.start+t.duration>14400||t.volume>1||t.fadeIn+t.fadeOut>t.duration)throw Error('Keep audio within four hours, levels within 0–1, and fades within the clip duration.');
  if(t.loop!==undefined&&typeof t.loop!=='boolean')throw Error('Episode audio loop must be true or false.');
  if(t.loopCrossfadeSec!==undefined){
   if(!Number.isFinite(t.loopCrossfadeSec)||t.loopCrossfadeSec<0||t.loopCrossfadeSec>5)throw Error('Loop restart crossfade must be 0–5 seconds.');
   if(t.loopCrossfadeSec>0&&!t.loop)throw Error('Loop restart crossfade needs Loop source enabled.');
  }
  if(t.media&&(!['input','output'].includes(t.media.type||'input')||typeof(t.media.name||t.media.filename)!=='string'))throw Error('Attach a local audio file.');
  validateBeatMarkers(t.markers);
 }
}
/** Optional per-loop restart crossfade seconds (0/omit = hard wrap). */
export function loopCrossfadeSec(t){
 const n=t?.loop&&Number.isFinite(t.loopCrossfadeSec)?t.loopCrossfadeSec:0;
 return n>0?Math.min(5,n):0;
}
/** Preview seek ramp ms for a loop wrap (approximates Assemble overlap; clip fades stay separate). */
export function loopWrapSeekMs(t){
 const sec=loopCrossfadeSec(t);
 return sec>0?Math.max(TRANSPORT_SEEK_RAMP_MS,Math.min(2000,Math.round(sec*1000))):TRANSPORT_SEEK_RAMP_MS;
}
/** Episode-timeline position -> source seek + faded volume.
 *  When track.loop and sourceLength (seconds) are known, source time wraps within
 *  [sourceStart, sourceStart+usable). Clip fadeIn/fadeOut still follow the episode
 *  window only (once). Optional loopCrossfadeSec softens each restart in Assemble;
 *  preview approximates via dual-element splice ramp on wrap seeks.
 *  Omit sourceLength to skip wrap (metadata not ready). */
export function clipPosition(t,position,sourceLength){
 const elapsed=position-t.start,active=!t.muted&&elapsed>=0&&elapsed<t.duration;
 const fade=Math.min(1,t.fadeIn?Math.max(0,elapsed)/t.fadeIn:1,t.fadeOut?Math.max(0,t.duration-elapsed)/t.fadeOut:1);
 let local=Math.max(0,Math.min(t.duration,elapsed));
 if(t.loop&&active&&Number.isFinite(sourceLength)){
  const usable=Math.max(0,sourceLength-t.sourceStart);
  if(usable>=1/24) local=((elapsed%usable)+usable)%usable;
 }
 return {active,time:t.sourceStart+local,volume:active?t.volume*fade:0};
}

/**
 * Ensure each episode-audio clip has a stable id (defensive; validate already requires unique ids).
 * Mutates in place; returns the tracks array (or []).
 */
export function ensureEpisodeAudioIds(project) {
  const tracks = project?.episodeAudio;
  if (!Array.isArray(tracks)) return [];
  const seen = new Set();
  for (const t of tracks) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    if (typeof t.id !== 'string' || !t.id || seen.has(t.id)) {
      t.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('ep-audio-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    }
    seen.add(t.id);
  }
  return tracks;
}
/**
 * Position picker for episode-audio reorder (excludes the moving clip).
 * Values: start | end | after:<trackId> (id-based so indices stay stable while moving).
 * Ensures clip ids exist.
 */
export function reorderEpisodeAudioOptions(project, trackId) {
  const tracks = ensureEpisodeAudioIds(project);
  if (!Array.isArray(tracks) || tracks.length < 2) return [];
  if (typeof trackId !== 'string' || !trackId) return [];
  if (!tracks.some((t) => t && t.id === trackId)) return [];
  const opts = [
    { value: 'start', label: 'Start of list', destIndex: 0 },
    { value: 'end', label: 'End of list', destIndex: undefined },
  ];
  for (const track of tracks) {
    if (!track || track.id === trackId) continue;
    const others = tracks.filter((t) => t && t.id !== trackId);
    const j = others.findIndex((t) => t.id === track.id);
    if (j < 0) continue;
    const n = tracks.indexOf(track) + 1;
    const kind = track.kind === 'dialogue' ? 'Dialogue'
      : track.kind === 'music' ? 'Music'
      : track.kind === 'ambience' ? 'Ambience'
      : track.kind === 'effects' ? 'Effects'
      : 'Clip';
    const labelText = typeof track.label === 'string' && track.label.trim() ? track.label.trim() : '';
    const label = labelText
      ? ('After ' + kind + ' ' + n + ' · ' + (labelText.length > 28 ? labelText.slice(0, 25) + '…' : labelText))
      : ('After ' + kind + ' ' + n);
    opts.push({
      value: 'after:' + track.id,
      label,
      id: track.id,
      destIndex: j + 1,
    });
  }
  return opts;
}
/**
 * Resolve episode-audio Place UI value to destIndex into the list *without* the moving clip
 * (same convention as moveAudioTrack / movePanel / moveBeat destIndex).
 * 'end' / '' / null / undefined -> undefined (append).
 * 'start' -> 0.
 * 'after:<trackId>' -> index after that clip among remaining clips.
 * 'index:<n>' -> n.
 */
export function destIndexFromEpisodeAudioPlace(project, trackId, place) {
  if (place === undefined || place === null || place === '' || place === 'end') return undefined;
  if (place === 'start') return 0;
  if (typeof place !== 'string') throw Error('Episode-audio place must be text.');
  if (place.startsWith('after:')) {
    const afterId = place.slice(6);
    if (!afterId) throw Error('After-clip place needs a clip id.');
    const tracks = ensureEpisodeAudioIds(project);
    if (!Array.isArray(tracks)) throw Error('That episode audio clip is no longer on this project.');
    const others = tracks.filter((t) => t && t.id !== trackId);
    const j = others.findIndex((t) => t && t.id === afterId);
    if (j < 0) throw Error('That After clip is not on this project (or is the clip being moved).');
    return j + 1;
  }
  if (place.startsWith('index:')) {
    const n = Number(place.slice(6));
    if (!Number.isInteger(n)) throw Error('Destination index must be a whole number.');
    return n;
  }
  throw Error('Unknown episode-audio place.');
}
/**
 * Reorder an episode audio clip in project.episodeAudio.
 * destIndex omitted / null = append. Integer clamped to [0, tracks.length-1 after remove]
 * i.e. index into the array *without* the moving clip (same as shot sound-track reorder).
 * No-op (same final index) throws so Undo is not polluted.
 * Clip id stays (kind / label / media / start / duration / fades stay on the same record).
 * Order-only; does not change episode timing fields.
 */
export function moveEpisodeAudio(project, trackId, destIndex) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw Error('Choose a project before reordering episode audio.');
  }
  if (typeof trackId !== 'string' || !trackId) throw Error('Choose an episode audio clip to reorder.');
  const tracks = ensureEpisodeAudioIds(project);
  if (!Array.isArray(project.episodeAudio)) throw Error('That episode audio clip is no longer on this project.');
  if (tracks.length < 2) throw Error('Need at least two episode audio clips to reorder.');
  const from = tracks.findIndex((t) => t && t.id === trackId);
  if (from < 0) throw Error('That episode audio clip is no longer on this project.');
  const [track] = tracks.splice(from, 1);
  let insertAt = tracks.length;
  if (destIndex !== undefined && destIndex !== null) {
    if (!Number.isInteger(destIndex)) throw Error('Destination index must be a whole number.');
    insertAt = destIndex;
  }
  if (insertAt < 0) insertAt = 0;
  if (insertAt > tracks.length) insertAt = tracks.length;
  if (insertAt === from) {
    tracks.splice(from, 0, track);
    throw Error('That episode audio clip is already in this position. Pick Start, End, or After a different clip.');
  }
  tracks.splice(insertAt, 0, track);
  return { track, fromIndex: from, index: insertAt };
}
export function episodeAudioControls(parent,project,{field,button,change,attach,tell}){
 parent.replaceChildren();const d=document.createElement('details');d.className='settings planning-section';d.dataset.plan='episode-audio';
 d.innerHTML='<summary>Episode audio studio · music, ambience & dialogue</summary><p>Sound continues across shot cuts. Keep clips at a fixed episode time or link them to follow a shot. Deleting the linked shot leaves its audio at the last position. Preview the mix in Animatic preview. Short jumps soft-seek; long audible jumps dual-element splice (same thresholds as shot animatic).</p>';
 const total=project.scenes.reduce((n,s)=>n+s.shots.reduce((m,x)=>m+x.seconds,0),0);ensureEpisodeAudioIds(project);const tracks=project.episodeAudio||[];
 const duckLabel=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=project.ducking?.enabled||false;enabled.onchange=()=>change(()=>{project.ducking??={...duckDefaults};project.ducking.enabled=enabled.checked;});duckLabel.append(enabled,document.createTextNode('Automatically lower episode music and ambience under dialogue'));d.append(duckLabel);
 const note=document.createElement('p');note.textContent="Follows episode clips and shot tracks marked Dialogue, plus each shot's main attached voice (shot.audio) when its role is Dialogue (or Auto with lip-sync / a matching voice take). Main attachments tagged Music, Ambience, or Effects - or Auto with a music-ish filename - are skipped so beds do not open duck windows. Trimmed dialogue tracks duck only for their usable duration; untrimmed tracks still cover through the shot end. Pauses inside those ranges stay ducked. Speech is not detected acoustically.";d.append(note);
 for(const [key,name,max] of [['level','Music level during dialogue (0–1)',1],['attack','Duck fade-down (seconds)',5],['release','Duck fade-up (seconds)',10]]){const input=field(d,name,project.ducking?.[key]??duckDefaults[key],v=>change(()=>{project.ducking??={...duckDefaults};project.ducking[key]=Number(v);}), 'number');input.min=key==='level'?0:.01;input.max=max;input.step=.05;}
 const ruler=document.createElement('div');ruler.className='episode-audio-ruler';ruler.textContent=`Episode start · 0s — ${total}s`;d.append(ruler);
 for(const [i,t] of tracks.entries()){
  const card=document.createElement('section');card.className='board-card';card.dataset.trackId=t.id;
  const lane=document.createElement('div');lane.className='episode-audio-lane';const clip=document.createElement('span');clip.className='episode-audio-clip';clip.style.marginLeft=Math.min(100,t.start/Math.max(total,1)*100)+'%';clip.style.width=Math.max(0,Math.min(t.duration,total-t.start)/Math.max(total,1)*100)+'%';clip.textContent=t.label||t.kind;lane.append(clip);card.append(lane);
  const heading=document.createElement('h4');heading.textContent=`Clip ${i+1} · ${t.start}s – ${t.start+t.duration}s`;card.append(heading);
  field(card,'Episode audio label',t.label,(v,o)=>change(()=>t.label=v,o));
  const linkLabel=document.createElement('label');linkLabel.className='field';linkLabel.textContent='Follow shot';const link=document.createElement('select');link.add(new Option('Keep fixed episode time',''));for(const scene of project.scenes)for(const shot of scene.shots)link.add(new Option(scene.title+' / '+shot.title,shot.id));link.value=t.anchorShot||'';link.onchange=()=>change(()=>{if(link.value)t.anchorShot=link.value;else delete t.anchorShot;});linkLabel.append(link);card.append(linkLabel);
  const label=document.createElement('label');label.className='field';label.textContent='Episode audio type';const kind=document.createElement('select');for(const k of ['music','ambience','dialogue','effects'])kind.add(new Option(k,k));kind.value=t.kind;kind.onchange=()=>change(()=>t.kind=kind.value);label.append(kind);card.append(label);
  for(const [key,name,max] of [['start','Episode start (seconds)',14400],['sourceStart','Skip into source (seconds)',14400],['duration','Audio clip duration (seconds)',14400],['volume','Episode clip level (0–1)',1],['fadeIn','Fade in (seconds)',14400],['fadeOut','Fade out (seconds)',14400]]){
   const input=field(card,name,t[key],v=>change(()=>t[key]=Number(v)),'number');input.min=key==='duration'?1/24:0;input.max=max;input.step=key==='volume'?.05:'any';
  }
  const muteLabel=document.createElement('label'),mute=document.createElement('input');mute.type='checkbox';mute.checked=t.muted;mute.onchange=()=>change(()=>t.muted=mute.checked);muteLabel.append(mute,document.createTextNode('Mute episode clip'));card.append(muteLabel);
  const loopLabel=document.createElement('label'),loop=document.createElement('input');loop.type='checkbox';loop.checked=!!t.loop;loop.onchange=()=>change(()=>{if(loop.checked)t.loop=true;else{delete t.loop;delete t.loopCrossfadeSec;}});loopLabel.append(loop,document.createTextNode('Loop source to fill clip duration'));card.append(loopLabel);
  const loopHint=document.createElement('p');loopHint.className='hint';loopHint.textContent=t.loop?'Source restarts from Skip-into-source until the episode clip ends. Clip Fade in/out still apply once at the episode window (not each restart).':'Off (default): a short source ends in silence for the rest of the clip duration.';card.append(loopHint);
  if(t.loop){
   const xf=field(card,'Loop restart crossfade (seconds)',t.loopCrossfadeSec??0,v=>change(()=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)delete t.loopCrossfadeSec;else t.loopCrossfadeSec=n;}),'number');
   xf.min=0;xf.max=5;xf.step=0.05;
   const xfHint=document.createElement('p');xfHint.className='hint';xfHint.textContent='Optional (0 = hard cut at each restart). Small values like 0.05–0.2 soften loop joins. Preview approximates; Assemble overlaps with afade. Does not change clip Fade in/out.';card.append(xfHint);
  }
  attach(card,'Episode audio file',t,'media','audio/*');
  audioOverviewControls(card,t,project,{button,change,splitTracks:project.episodeAudio,title:'Episode clip overview · peaks, A/B, crossfaded scrub',autoLoad:true});
  card.append(button('Duplicate episode audio',()=>change(()=>project.episodeAudio.splice(i+1,0,{...structuredClone(t),id:crypto.randomUUID()}))),button('Remove episode audio',()=>change(()=>project.episodeAudio.splice(i,1))));
  const reorderRow=document.createElement('div');reorderRow.className='episode-audio-reorder';
  const reorderLabel=document.createElement('label');reorderLabel.className='field';reorderLabel.append(document.createTextNode('Place'));
  const reorderSel=document.createElement('select');reorderSel.setAttribute('aria-label','Place episode audio in list');
  const ropts=reorderEpisodeAudioOptions(project,t.id);
  const canReorder=ropts.length>=2;
  if(!canReorder){reorderSel.add(new Option('Need another episode audio clip',''));reorderSel.disabled=true;}
  else{for(const opt of ropts)reorderSel.add(new Option(opt.label,opt.value));reorderSel.value='end';}
  reorderLabel.append(reorderSel);reorderRow.append(reorderLabel);
  const reorderBtn=button('Reorder clip',()=>{
   if(!canReorder){tell?.('Add another episode audio clip to reorder.');return;}
   const place=reorderSel.value;if(!place){tell?.('Choose Start, End, or After a clip.');return;}
   try{
    const destIndex=destIndexFromEpisodeAudioPlace(project,t.id,place);
    change(()=>{moveEpisodeAudio(project,t.id,destIndex);});
    tell?.('Episode audio clip '+(i+1)+' reordered. Undo restores.');
    requestAnimationFrame(()=>document.querySelector('.board-card[data-track-id="'+CSS.escape(t.id)+'"]')?.scrollIntoView({block:'nearest'}));
   }catch(e){tell?.(e.message);}
  });
  reorderBtn.disabled=!canReorder;reorderRow.append(reorderBtn);card.append(reorderRow);
  const reorderHint=document.createElement('p');reorderHint.textContent=canReorder
   ?'Jump this clip to Start, End, or After another clip (list order only; episode start times stay). Clip id and timing stay. Undo restores.'
   :'Add another episode audio clip to place here.';
  reorderHint.className='hint episode-audio-reorder-hint';card.append(reorderHint);
  if(t.start+t.duration>total){const note=document.createElement('p');note.textContent='This clip extends beyond the episode and will be cut at its end.';card.append(note);}
  if(!t.media){const note=document.createElement('p');note.textContent='No file attached · this clip is a planning placeholder.';card.append(note);}
  d.append(card);
 }
 d.append(button('Add episode audio',()=>change(()=>{project.episodeAudio??=[];project.episodeAudio.push({id:crypto.randomUUID(),kind:'music',label:'',start:0,sourceStart:0,duration:Math.max(1,total),volume:.3,fadeIn:0,fadeOut:0,muted:false});})));
 const hint=document.createElement('p');hint.textContent='Clips mix with existing shot sound. Use modest levels to avoid clipping. Short sources end in silence unless Loop source to fill clip duration is on. Clip fades apply once on the episode window; optional Loop restart crossfade softens each source restart. Project backups keep file references.';d.append(hint);parent.append(d);
}
export function createEpisodeAudioPreview(parent,onError){
 let clips=[],items=[],epoch=0,lastState=null,ducking=null,windows=[];
 function release(){
  epoch++;
  lastState=null;
  for(const item of items){
   if(item.splice?.active){
    const sp=item.splice;
    if(sp.inEl&&'volume' in sp.inEl)sp.inEl.volume=0;
    try{sp.inEl?.pause?.();}catch{}
    item.splice=null;
   }
   item.pendingSeek=null;
   if(item.gain)item.gain.snap(0);
   const els=new Set([item.audio,item.alt].filter(Boolean));
   for(const el of els){
    try{el.pause();}catch{}
    if('volume' in el)el.volume=0;
    try{el.removeAttribute('src');el.load();}catch{}
    try{el.remove();}catch{}
   }
   item.alt=null;
  }
  items=[];
 }
 function pause(){
  epoch++;
  if(lastState)lastState[1]=false;
  for(const item of items){
   // Snap quiet then pause — HTMLMediaElement cannot finish a ramp after pause().
   if(item.splice?.active){
    const sp=item.splice;
    if(sp.inEl&&'volume' in sp.inEl)sp.inEl.volume=0;
    try{sp.inEl?.pause?.();}catch{}
    item.splice=null;
   }
   if(!item.gain)item.gain=createTransportGain(item.audio.volume||0);
   item.pendingSeek=null;
   item.gain.snap(0);
   item.audio.volume=0;
   item.audio.pause();
   if(item.alt){
    if('volume' in item.alt)item.alt.volume=0;
    try{item.alt.pause?.();}catch{}
   }
  }
 }
 function sync(position,playing,muted){
  lastState=[position,playing,muted];
  if(!items.length)items=clips.filter(t=>t.media&&!t.muted).map(track=>{
   const audio=document.createElement('audio');
   audio.hidden=true;
   audio.dataset.episodeAudio=track.id;
   audio.preload='metadata';
   audio.src='/view?'+new URLSearchParams({filename:track.media.name||track.media.filename,subfolder:track.media.subfolder||'',type:track.media.type||'input'});
   const item={track,audio,pending:false,gain:createTransportGain(0),pendingSeek:null};
   audio.onloadedmetadata=()=>{if(items.includes(item)&&lastState)sync(...lastState);};
   audio.onerror=()=>onError('Episode audio unavailable: '+(track.label||track.kind));
   parent.append(audio);
   return item;
  });
  for(const item of items){
   let {audio,track}=item;
   const sourceLen=Number.isFinite(audio.duration)?audio.duration:undefined;
   const state=clipPosition(track,position,sourceLen);
   const duck=['music','ambience'].includes(track.kind)?duckGain(position,ducking,windows):1;
   const targetVolume=muted?0:state.volume*duck;
   audio.muted=false; // volume ramp carries mute so seeks stay de-clicked
   if(audio.readyState<1||audio.error)continue;
   const end=Number.isFinite(audio.duration)?Math.max(0,audio.duration-.001):state.time;
   const wantTime=Math.min(state.time,end);
   const wantPlay=!!(playing&&state.active&&targetVolume>0&&(track.loop||state.time<end));
   if(!item.onSplicePromote){
    item.onSplicePromote=(incoming)=>{
     item.audio=incoming;
    };
   }
   spliceSeekMedia(item,audio,wantTime,{
    playing:wantPlay,
    targetVolume,
    longSeekSec:TRANSPORT_LONG_SEEK_SEC,
    seekMs:loopWrapSeekMs(track),
    ensureAlt:()=>{
     const primary=item.audio||audio;
     item.alt=ensureSpliceAlt(primary,item.alt,{parent});
     return item.alt;
    },
   });
   // After a finished splice, primary may have been promoted.
   if(item.audio&&item.audio!==audio)audio=item.audio;
   if(wantPlay){
    if(audio.paused&&!item.pending){
     item.pending=true;
     const token=epoch;
     audio.play().catch(e=>{if(token===epoch)onError('Episode audio could not play: '+e.message);}).finally(()=>{item.pending=false;});
    }
   }else if(!audio.paused){
    if(item.gain&&item.gain.value<=0.02){
     audio.pause();
     item.gain.snap(0);
     audio.volume=0;
    }
   }
  }
 }
 return {sync,pause,release,reset(next,project){release();clips=next||[];ducking=project?.ducking;windows=project?dialogueWindows(project):[];}};
}
