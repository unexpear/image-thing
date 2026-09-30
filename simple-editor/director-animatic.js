import {createEpisodeAudioPreview} from './director-episode-audio.js';
import {episodeBeatTimes} from './director-beat-markers.js';
import {mountSafeAreaGuides, paintTitleOverlay, safeAreaGuideControls, safeAreaGuidesOn} from './director-title-styles.js';
import {createTransportGain, spliceSeekMedia, ensureSpliceAlt} from './director-audio-edit.js';
import {panelAt,usesBoards,boardFrames,plannedAssets,planStill,planStillLabel,animaticPictureLabel,animaticPlanStatus} from './director-planning-state.js';
import {shotTransition, transitionOverlaps, mediaPlaybackWindow, shotPlaybackSpeed, shotHoldSeconds, setShotTransition, SHOT_TRANSITION_OPTIONS} from './director-timing.js';
export function shotTimeline(project){
 let cursor=0;
 const entries=[];
 for(const scene of project.scenes){
  for(const shot of scene.shots){
   const start=cursor;
   const end=start+shot.seconds;
   const outgoing=shotTransition(shot);
   const dissolveOut=transitionOverlaps(outgoing.type)?outgoing.durationSec:0;
   entries.push({scene:scene.title,shot,start,end,dissolveOut,transitionType:outgoing.type});
   cursor=end-dissolveOut;
  }
 }
 return entries;
}
export function shotAt(entries,seconds){
 if(!entries.length)return null;
 let found=entries[0];
 for(const e of entries){
  if(e.start<=seconds)found=e;
  else break;
 }
 return found;
}
/** Previous timeline entry when position is inside a dissolve overlap. */
export function dissolvePair(entries,seconds){
 const incoming=shotAt(entries,seconds);
 if(!incoming)return null;
 const index=entries.indexOf(incoming);
 if(index<=0)return null;
 const outgoing=entries[index-1];
 if(!(outgoing.dissolveOut>0) || seconds<incoming.start || seconds>=outgoing.end)return null;
 const progress=Math.min(1,Math.max(0,(seconds-incoming.start)/outgoing.dissolveOut));
 return {outgoing,incoming,progress};
}

/** Pure opacities for ffmpeg-like fadeblack / fadewhite (mid plate peaks at progress 0.5). */
export function fadeThroughOpacities(type, progress){
 if(type!=='fade-black' && type!=='fade-white')return null;
 const p=Math.min(1,Math.max(0,Number(progress)||0));
 const color=type==='fade-white'?'#ffffff':'#000000';
 if(p<=0.5){
  const t=p*2;
  return {out:1-t, plate:t, in:0, color};
 }
 const t=(p-0.5)*2;
 return {out:0, plate:1-t, in:t, color};
}

/**
 * Studio type -> ffmpeg xfade name + CSS preview intent (parity with Assemble / vf_xfade.c).
 * Wipe reveal = side from which the incoming shot appears (edge moves the opposite way).
 * Honest gaps: CSS hard clip (no smoothstep feather); slide is dual-layer translate (no modular wrap);
 * fade-through uses linear mid-plate (not ffmpeg phase=0.2 smoothstep); not pixel-identical.
 */
export const ANIMATIC_XFADE_CSS = Object.freeze({
 dissolve:{xfade:'fade', kind:'opacity'},
 'wipe-left':{xfade:'wipeleft', kind:'wipe', reveal:'right'},
 'wipe-right':{xfade:'wiperight', kind:'wipe', reveal:'left'},
 'wipe-up':{xfade:'wipeup', kind:'wipe', reveal:'bottom'},
 'wipe-down':{xfade:'wipedown', kind:'wipe', reveal:'top'},
 'slide-left':{xfade:'slideleft', kind:'slide', outAxis:'-x', inFrom:'right'},
 'slide-right':{xfade:'slideright', kind:'slide', outAxis:'+x', inFrom:'left'},
 'slide-up':{xfade:'slideup', kind:'slide', outAxis:'-y', inFrom:'bottom'},
 'slide-down':{xfade:'slidedown', kind:'slide', outAxis:'+y', inFrom:'top'},
 'fade-black':{xfade:'fadeblack', kind:'fade-through'},
 'fade-white':{xfade:'fadewhite', kind:'fade-through'},
 'circle-open':{xfade:'circleopen', kind:'circle', sense:'open'},
 'circle-close':{xfade:'circleclose', kind:'circle', sense:'close'},
});

/**
 * Circle radius % for CSS clip-path matching ffmpeg circleopen/close band.
 * vf_xfade: smooth = dist/z + (progress_ff-0.5)*3 with progress_ff 1->0; studio p = 1-progress_ff.
 * Hard edge ~ smooth 0.5 -> radius/z = max(0,3p-1) open / max(0,2-3p) close.
 * CSS circle(%) is relative to sqrt(w^2+h^2)/sqrt(2); corners sit at 100/sqrt(2) ~= 70.711%.
 */
export function circleXfadeRadiusPct(progress, mode){
 const p=Math.min(1,Math.max(0,Number(progress)||0));
 const frac=mode==='close'
  ? Math.max(0,Math.min(1,2-3*p))
  : Math.max(0,Math.min(1,3*p-1));
 return frac*(100/Math.SQRT2);
}

function setClip(el, value){
 if(!el||!el.style)return;
 el.style.clipPath=value;
 el.style.webkitClipPath=value;
}

/** CSS approx of ffmpeg xfade for animatic dual-layer preview (honest: not pixel-identical). */
export function applyTransitionLayers(layerOut, layerIn, type, progress, plate){
 const p=Math.min(1,Math.max(0,Number(progress)||0));
 const clear=el=>{if(!el||!el.style)return;el.style.opacity='';el.style.clipPath='';el.style.webkitClipPath='';el.style.transform='';el.style.zIndex='';};
 clear(layerOut);clear(layerIn);
 if(plate){
  clear(plate);
  plate.style.background='';
  plate.style.opacity='0';
  plate.hidden=true;
 }
 if(!type || type==='cut' || !Number.isFinite(progress)){
  layerOut.style.opacity='0';layerIn.style.opacity='1';return;
 }
 const through=fadeThroughOpacities(type,p);
 if(through){
  layerOut.style.opacity=String(through.out);
  layerIn.style.opacity=String(through.in);
  layerOut.style.zIndex='1';
  layerIn.style.zIndex='3';
  if(plate){
   plate.hidden=false;
   plate.style.background=through.color;
   plate.style.opacity=String(through.plate);
   plate.style.zIndex='2';
  }
  return;
 }
 const pct=v=>`${(v*100).toFixed(3)}%`;
 if(type==='dissolve'){
  layerOut.style.opacity=String(1-p);layerIn.style.opacity=String(p);return;
 }
 layerOut.style.opacity='1';layerIn.style.opacity='1';
 // Wipes: match vf_xfade wipe* (incoming reveals from the named opposite side).
 // wipeleft = B from right; wiperight = B from left; wipeup = B from bottom; wipedown = B from top.
 if(type==='wipe-left'){setClip(layerIn,`inset(0 0 0 ${pct(1-p)})`);return;}
 if(type==='wipe-right'){setClip(layerIn,`inset(0 ${pct(1-p)} 0 0)`);return;}
 if(type==='wipe-up'){setClip(layerIn,`inset(${pct(1-p)} 0 0 0)`);return;}
 if(type==='wipe-down'){setClip(layerIn,`inset(0 0 ${pct(1-p)} 0)`);return;}
 if(type==='slide-left'){layerOut.style.transform=`translateX(-${pct(p)})`;layerIn.style.transform=`translateX(${pct(1-p)})`;return;}
 if(type==='slide-right'){layerOut.style.transform=`translateX(${pct(p)})`;layerIn.style.transform=`translateX(-${pct(1-p)})`;return;}
 if(type==='slide-up'){layerOut.style.transform=`translateY(-${pct(p)})`;layerIn.style.transform=`translateY(${pct(1-p)})`;return;}
 if(type==='slide-down'){layerOut.style.transform=`translateY(${pct(p)})`;layerIn.style.transform=`translateY(-${pct(1-p)})`;return;}
 if(type==='circle-open'){setClip(layerIn,`circle(${circleXfadeRadiusPct(p,'open').toFixed(3)}%)`);return;}
 if(type==='circle-close'){setClip(layerOut,`circle(${circleXfadeRadiusPct(p,'close').toFixed(3)}%)`);layerOut.style.zIndex='3';layerIn.style.zIndex='2';return;}
 layerOut.style.opacity=String(1-p);layerIn.style.opacity=String(p);
}

export function frameTime(seconds){
 const frames=Math.max(0,Math.floor(seconds*24+1e-7));
 return [Math.floor(frames/86400),Math.floor(frames/1440)%60,Math.floor(frames/24)%60,frames%24].map(n=>String(n).padStart(2,'0')).join(':');
}

/** Label for a studio transition type (shot-strip tooltips). */
export function transitionTypeLabel(type){
  const hit = SHOT_TRANSITION_OPTIONS.find(o => o.type === type);
  return hit ? hit.label : (type || 'cut');
}

/** Default overlap seconds when promoting a hard cut from the animatic strip. */
export const STRIP_DEFAULT_TRANSITION_SEC = 1;

/**
 * Apply a transition type change from the animatic shot strip.
 * Cut clears the field. Overlap types keep currentDurationSec when legal,
 * else clamp via clampOverlapDuration, else try STRIP_DEFAULT_TRANSITION_SEC.
 * Mutates shot; returns shotTransition(shot).
 */
export function applyStripTransitionType(shot, nextShot, type, currentDurationSec){
  if(!shot || typeof shot !== 'object' || Array.isArray(shot))
    throw Error('Choose a shot before setting a transition.');
  if(!type || type === 'cut'){
    delete shot.transition;
    return shotTransition(shot);
  }
  if(!transitionOverlaps(type))
    throw Error('Transition type must be cut, dissolve, wipe, slide, fade-black/white, or circle.');
  let d = Number(currentDurationSec);
  if(!Number.isFinite(d) || d <= 0) d = STRIP_DEFAULT_TRANSITION_SEC;
  const clamped = clampOverlapDuration(shot.seconds, nextShot?.seconds, d);
  if(clamped == null){
    const fallback = clampOverlapDuration(shot.seconds, nextShot?.seconds, STRIP_DEFAULT_TRANSITION_SEC);
    if(fallback == null)
      throw Error('These shots are too short for an overlap transition. Lengthen a shot first.');
    return setShotTransition(shot, type, fallback);
  }
  return setShotTransition(shot, type, clamped);
}

/** Build a compact <select> of SHOT_TRANSITION_OPTIONS for the shot strip. */
export function buildStripTransitionSelect(currentType, {ariaLabel} = {}){
  const sel = document.createElement('select');
  sel.className = 'animatic-overlap-type';
  sel.setAttribute('aria-label', ariaLabel || 'Transition into next shot');
  const cur = currentType || 'cut';
  for(const opt of SHOT_TRANSITION_OPTIONS){
    const o = document.createElement('option');
    o.value = opt.type;
    o.textContent = opt.label;
    if(opt.type === cur) o.selected = true;
    sel.append(o);
  }
  // Keep strip seek/drag from stealing pointer events on the control.
  sel.onpointerdown = ev => ev.stopPropagation();
  sel.onclick = ev => ev.stopPropagation();
  return sel;
}

/**
 * Layout for the animatic shot strip: shot blocks + overlap regions.
 * Overlap spans [outgoing.end - dissolveOut, outgoing.end] (same window as dissolvePair).
 */
export function shotStripLayout(entries){
  const list = Array.isArray(entries) ? entries : [];
  const total = list.length ? list[list.length - 1].end : 0;
  const shots = [];
  const overlaps = [];
  const seams = [];
  for(let i = 0; i < list.length; i++){
    const e = list[i];
    shots.push({
      kind: 'shot',
      index: i,
      start: e.start,
      end: e.end,
      label: String(i + 1),
      title: e.shot?.title || 'Untitled shot',
      scene: e.scene || '',
      holdSeconds: (()=>{ try { return shotHoldSeconds(e.shot); } catch { return 0; } })(),
      playbackSpeed: (()=>{ try { return shotPlaybackSpeed(e.shot); } catch { return 1; } })(),
    });
    if(i >= list.length - 1) continue;
    if(e.dissolveOut > 0){
      overlaps.push({
        kind: 'overlap',
        index: i,
        start: e.end - e.dissolveOut,
        end: e.end,
        durationSec: e.dissolveOut,
        transitionType: e.transitionType || 'dissolve',
        shot: e.shot,
        nextShot: list[i + 1].shot,
      });
    } else {
      // Hard-cut boundary: thin seam so the strip can promote to an overlap type.
      seams.push({
        kind: 'seam',
        index: i,
        at: e.end,
        shot: e.shot,
        nextShot: list[i + 1].shot,
      });
    }
  }
  return {total, shots, overlaps, seams};
}

/**
 * Clamp an authored overlap duration so validateShotTransition / validateTransitionPair accept it.
 * Returns null when no legal positive duration exists.
 */
export function clampOverlapDuration(shotSeconds, nextSeconds, durationSec){
  const shot = Number(shotSeconds);
  const next = Number(nextSeconds);
  if(!Number.isFinite(shot) || !Number.isFinite(next) || shot <= 0.1 || next <= 0.1)return null;
  const max = Math.min(30, shot - 0.1, next - 0.1);
  if(!(max >= 0.1))return null;
  let d = Number(durationSec);
  if(!Number.isFinite(d))d = 0.1;
  d = Math.round(d * 10) / 10;
  if(d < 0.1)d = 0.1;
  if(d > max)d = Math.round(max * 10) / 10;
  if(d < 0.1)return null;
  if(d >= shot || d >= next || d > 30)return null;
  return d;
}

const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function createAnimatic(before, opts={}){
 const change = typeof opts.change === 'function' ? opts.change : (fn)=>fn();
 const panel=node('details');panel.className='settings animatic-panel';panel.id='animatic';
 panel.innerHTML='<summary>Animatic preview <small>Check your episode’s pacing</small></summary><p class="hint">Preview at 24 fps. Main voice / music replaces clip sound; extra sound tracks mix over it. Storyboard mode plays each panel for its planned frames. Short audio ends in silence; short clips hold their last frame (set intentional Hold last frame on the shot card to author a deliberate freeze; Playback speed on the shot card retimes the moving clip). Scrubbing pauses playback. Shot video/voice/music and episode-mix tracks soft-seek (EqualPower) for small jumps; long audible jumps dual-element splice (SpliceReader) so they do not click. The shot strip under the scrubber shows each shot, colored transition overlaps, and hard-cut seams — click to seek; drag an overlap handle to change duration; use the type menu on an overlap or seam to change (or clear) the transition without leaving the preview. Buffering can affect preview timing; use the assembled MP4 for final review.</p>';
 const screen=node('div');screen.className='animatic-screen';
 const layerOut=node('div');layerOut.className='animatic-layer animatic-layer-out';
 const layerPlate=node('div');layerPlate.className='animatic-layer animatic-plate';layerPlate.hidden=true;layerPlate.setAttribute('aria-hidden','true');
 const layerIn=node('div');layerIn.className='animatic-layer animatic-layer-in';
 screen.append(layerOut,layerPlate,layerIn);
 const safeGuides = mountSafeAreaGuides(screen);
 safeGuides.setVisible(false);
 const caption=node('p');caption.id='animatic-caption';
 const status=node('p','Open the preview to load the current shot.');status.id='animatic-status';status.setAttribute('role','status');
 const controls=node('div');controls.className='actions';
 const make=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;controls.append(b);return b;};
 const play=make('Play preview',()=>playing?pause():start());play.id='animatic-play';
 const sound=make('Mute preview',()=>{muted=!muted;applySound();});sound.id='animatic-sound';sound.setAttribute('aria-pressed','false');
 const soundStatus=node('p');soundStatus.id='animatic-audio-status';soundStatus.setAttribute('role','status');
 make('Previous shot',()=>jump(-1));make('Next shot',()=>jump(1));
 make('Back one frame',()=>seek(position-1/24));make('Forward one frame',()=>seek(position+1/24));
 const counter=node('output');counter.id='animatic-time';
 const scrub=node('input');scrub.type='range';scrub.min=0;scrub.step=1/24;scrub.value=0;scrub.setAttribute('aria-label','Animatic timeline');scrub.oninput=()=>seek(Number(scrub.value));
 const selector=node('select');selector.setAttribute('aria-label','Jump to shot');selector.onchange=()=>seek(Number(selector.value));
 const beatStrip=node('div');beatStrip.className='animatic-beat-strip';beatStrip.setAttribute('role','img');beatStrip.setAttribute('aria-label','Episode beat markers');
 const shotStrip=node('div');shotStrip.className='animatic-shot-strip';shotStrip.setAttribute('role','list');shotStrip.setAttribute('aria-label','Shot and transition strip');
 const shotStripPlayhead=node('div');shotStripPlayhead.className='animatic-shot-strip-playhead';shotStripPlayhead.setAttribute('aria-hidden','true');shotStrip.append(shotStripPlayhead);
 let stripDrag=null;

 const guideBox = node('div'); guideBox.className = 'animatic-guide-bar';
 let guideCtl = null; let guideProject = null;
 function bindGuideControls(project){
  guideProject = project;
  guideBox.replaceChildren();
  if(!project){ safeGuides.setVisible(false); return; }
  guideCtl = safeAreaGuideControls(guideBox, project, {
   change: (fn)=>{ change(()=>{ fn(); }); safeGuides.setVisible(safeAreaGuidesOn(project)); if(panel.open) display(); },
   onToggle: (on)=> { safeGuides.setVisible(on); if(panel.open) display(); },
  });
  safeGuides.setVisible(safeAreaGuidesOn(project));
 }
 panel.append(screen,guideBox,caption,controls,counter,scrub,shotStrip,beatStrip,selector,status,soundStatus);before.before(panel);
 let entries=[],total=0,position=0,playing=false,last=0,raf=0,active=null,media=null,audio=null,muted=false,signature='',generation=0,playbackEpoch=0,failed=false,shown=null;
 let tracks=[],picture=null;
 let mediaBag=null,audioBag=null,fadeBag=null;
 const episodeSound=createEpisodeAudioPreview(panel,message=>{soundStatus.textContent=message;});
 const pending=new WeakSet();
 function clearBagTransport(bag){
  if(!bag)return;
  if(bag.splice?.active){
   const sp=bag.splice;
   if(sp.inEl&&'volume' in sp.inEl)sp.inEl.volume=0;
   try{sp.inEl?.pause?.();}catch{}
   bag.splice=null;
  }
  bag.pendingSeek=null;
  if(bag.gain)bag.gain.snap(0);
  const el=bag.el||bag.element;if(el&&'volume' in el)el.volume=0;
  if(bag.alt){
   try{bag.alt.pause?.();}catch{}
   try{bag.alt.removeAttribute?.('src');bag.alt.load?.();}catch{}
   try{bag.alt.remove?.();}catch{}
   bag.alt=null;
  }
 }

 const mediaURL=file=>'/view?'+new URLSearchParams({filename:file.name||file.filename||'',subfolder:file.subfolder||'',type:file.type||'input'});
 function applySound(){sound.textContent=muted?'Unmute preview':'Mute preview';sound.setAttribute('aria-pressed',String(muted));
  // Clip-sound replace stays element-muted; preview mute uses TransportGain volume so seeks stay de-clicked.
  if(media?.tagName==='VIDEO')media.muted=!!active?.shot.audio;
  if(audio)audio.muted=false;
  for(const t of tracks)t.element.muted=false;
  episodeSound.sync(position,playing,muted);
  if(panel.open&&active)syncVideo();
 }
 let fadeMedia=null,fadeEntry=null;
 function clearLayer(layer){layer.replaceChildren();}
 function release(){generation++;
  for(const bag of [mediaBag,fadeBag,audioBag,...tracks])clearBagTransport(bag);
  for(const item of [media,fadeMedia,audio,...tracks.map(t=>t.element)])if(item?.pause){item.pause();item.removeAttribute('src');item.load();}
  audio?.remove();for(const t of tracks)t.element.remove();tracks=[];picture=null;audio=null;media=null;fadeMedia=null;fadeEntry=null;active=null;mediaBag=null;audioBag=null;fadeBag=null;clearLayer(layerOut);clearLayer(layerIn);layerOut.style.opacity='0';layerIn.style.opacity='1';if(layerPlate){layerPlate.hidden=true;layerPlate.style.opacity='0';layerPlate.style.background='';}soundStatus.textContent='';
 }
 function pause(){episodeSound.pause();playing=false;playbackEpoch++;cancelAnimationFrame(raf);
  for(const bag of [mediaBag,fadeBag,audioBag,...tracks]){
   if(!bag)continue;
   if(!bag.gain)bag.gain=createTransportGain(0);
   if(bag.splice?.active){const sp=bag.splice;if(sp.inEl&&'volume' in sp.inEl)sp.inEl.volume=0;try{sp.inEl?.pause?.();}catch{}bag.splice=null;}
   bag.pendingSeek=null;bag.gain.snap(0);
   const el=bag.el||bag.element;if(el&&'volume' in el)el.volume=0;
   if(bag.alt&&'volume' in bag.alt)bag.alt.volume=0;
  }
  media?.pause?.();audio?.pause();for(const t of tracks)t.element.pause();play.textContent='Play preview';panel.classList.remove('playing');
 }
 function syncMedia(bag,delay=0,trim=null,speed=1){
  const item=bag?.el||bag?.element;
  if(!item||item.readyState<1||item.error)return;
  if(!bag.gain)bag.gain=createTransportGain(0);
  if(bag.pendingSeek===undefined)bag.pendingSeek=null;
  const local=Math.max(0,position-active.start-delay);
  const win=mediaPlaybackWindow(local,{
   sourceIn:trim&&Number.isFinite(trim.sourceIn)?trim.sourceIn:0,
   sourceOut:trim&&Number.isFinite(trim.sourceOut)?trim.sourceOut:null,
   speed:Number.isFinite(speed)?speed:1,
   fileDuration:Number.isFinite(item.duration)?item.duration:null
  });
  if(item.playbackRate!==undefined && Number.isFinite(win.speed))item.playbackRate=win.speed;
  const forceMute=!!bag.forceMute;
  if(item.tagName==='VIDEO')item.muted=forceMute;
  else item.muted=false;
  const baseVol=Number.isFinite(bag.volume)?bag.volume:1;
  const targetVolume=(muted||forceMute)?0:Math.min(1,Math.max(0,baseVol));
  const wantPlay=!!(playing&&position-active.start>=delay&&local<win.usableWall);
  // Soft-seek for small deltas; dual-element splice for long audible jumps.
  if(!bag.onSplicePromote){
   bag.onSplicePromote=(incoming,outgoing)=>{
    if(media===outgoing){
     media=incoming;
     incoming.hidden=false;
     if(outgoing.parentNode){try{outgoing.parentNode.replaceChild(incoming,outgoing);}catch{outgoing.replaceWith?.(incoming);}}
     outgoing.hidden=true;
    }
    if(audio===outgoing)audio=incoming;
    if(fadeMedia===outgoing)fadeMedia=incoming;
   };
  }
  spliceSeekMedia(bag,item,win.target,{
   playing:wantPlay&&targetVolume>1e-4,
   targetVolume,
   ensureAlt:()=>{
    bag.alt=ensureSpliceAlt(item,bag.alt,{parent:panel});
    return bag.alt;
   },
  });
  if(wantPlay){
   if(item.paused&&!pending.has(item)){
    const token=generation,epoch=playbackEpoch;pending.add(item);
    item.play().catch(e=>{if(token!==generation||epoch!==playbackEpoch||!playing)return;pause();status.textContent='Preview paused: '+e.message;}).finally(()=>pending.delete(item));
   }
  }else if(!item.paused){
   item.pause();
  }
 }
 function syncVideo(){
  if(!failed&&media?.tagName==='VIDEO'){
   if(!mediaBag||mediaBag.el!==media)mediaBag={el:media,gain:createTransportGain(0),pendingSeek:null,volume:1,forceMute:!!active?.shot?.audio};
   else mediaBag.forceMute=!!active?.shot?.audio;
   const m=active?.shot?.media;
   const trim=m?{sourceIn:Number(m.sourceIn)||0,sourceOut:m.sourceOut===undefined?null:Number(m.sourceOut)}:null;
   let speed=1;try{speed=shotPlaybackSpeed(active?.shot);}catch{speed=1;}
   syncMedia(mediaBag,0,trim,speed);
  }
  if(audio){
   if(!audioBag||audioBag.el!==audio)audioBag={el:audio,gain:createTransportGain(0),pendingSeek:null,volume:1};
   syncMedia(audioBag);
  }
  for(const t of tracks){
   if(!t.gain)t.gain=createTransportGain(0);
   if(t.pendingSeek===undefined)t.pendingSeek=null;
   t.volume=Number.isFinite(t.volume)?t.volume:1;
   syncMedia(t,t.start,null,1);
  }
 }
function paintBeatStrip(){
  const beats=episodeBeatTimes(shown||{episodeAudio:[]});
  beatStrip.replaceChildren();
  if(!total||!beats.length){beatStrip.hidden=true;beatStrip.title='';return;}
  beatStrip.hidden=false;
  beatStrip.title=beats.length+' beat marker'+(beats.length===1?'':'s')+' from episode audio';
  for(const b of beats){
    if(b.time<0||b.time>total)continue;
    const tick=node('button');tick.type='button';tick.className='animatic-beat-tick';
    tick.style.left=(b.time/total*100)+'%';
    tick.title=(b.label?b.label+' · ':'')+frameTime(b.time)+(b.kind?' · '+b.kind:'');
    tick.setAttribute('aria-label','Jump to beat at '+frameTime(b.time));
    tick.onclick=()=>{position=Math.min(total,Math.max(0,b.time));display();};
    beatStrip.append(tick);
  }
}
function paintShotStrip(){
  if(stripDrag){
    if(total>0)shotStripPlayhead.style.left=(Math.min(1,Math.max(0,position/total))*100)+'%';
    return;
  }
  const layout=shotStripLayout(entries);
  const kids=[shotStripPlayhead];
  shotStrip.hidden=!layout.total;
  shotStrip.title=layout.total? (layout.shots.length+' shot'+(layout.shots.length===1?'':'s')+(layout.overlaps.length?('·'+layout.overlaps.length+' transition overlap'+(layout.overlaps.length===1?'':'s')):'')+(layout.seams&&layout.seams.length?('·'+layout.seams.length+' hard cut'+(layout.seams.length===1?'':'s')):'')) : '';
  if(!layout.total){shotStrip.replaceChildren(shotStripPlayhead);return;}
  const pct=t=>((t/layout.total)*100)+'%';
  for(const s of layout.shots){
    const el=node('button');el.type='button';el.className='animatic-shot-block';el.setAttribute('role','listitem');
    el.style.left=pct(s.start);el.style.width=pct(Math.max(0,s.end-s.start));
    el.textContent=s.label;
    el.title=s.scene+' / '+s.title+' · '+frameTime(s.start)+'–'+frameTime(s.end)+(s.holdSeconds?(' · hold '+s.holdSeconds+'s'):'')+(s.playbackSpeed&&s.playbackSpeed!==1?(' · '+s.playbackSpeed+'x'):'');
    el.setAttribute('aria-label','Jump to shot '+s.label+' at '+frameTime(s.start));
    el.onclick=()=>{position=Math.min(total,Math.max(0,s.start));display();};
    kids.push(el);
  }
  for(const o of layout.overlaps){
    const el=node('div');el.className='animatic-overlap-block';el.setAttribute('role','listitem');
    el.style.left=pct(o.start);el.style.width=pct(Math.max(0,o.end-o.start));
    const label=transitionTypeLabel(o.transitionType);
    el.title=label+' · '+o.durationSec.toFixed(1)+'s · drag handle to resize';
    el.setAttribute('aria-label',label+' overlap '+o.durationSec.toFixed(1)+' seconds');
    el.onclick=e=>{if(e.target!==el)return;position=Math.min(total,Math.max(0,o.start+o.durationSec*0.5));display();};
    const handle=node('button');handle.type='button';handle.className='animatic-overlap-handle';
    handle.title='Drag to set transition duration';
    handle.setAttribute('aria-label','Resize '+label+' duration');
    handle.onpointerdown=ev=>{
      ev.preventDefault();ev.stopPropagation();
      try{handle.setPointerCapture(ev.pointerId);}catch{}
      const rect=shotStrip.getBoundingClientRect();
      stripDrag={
        overlap:o,
        pointerId:ev.pointerId,
        originX:ev.clientX,
        originDur:o.durationSec,
        pxPerSec: rect.width>0 && layout.total>0 ? rect.width/layout.total : 0,
        handle, el,
      };
      el.classList.add('is-dragging');
    };
    handle.onpointermove=ev=>{
      if(!stripDrag||stripDrag.pointerId!==ev.pointerId)return;
      const dx=ev.clientX-stripDrag.originX;
      // Left handle: drag left = longer overlap
      const delta= stripDrag.pxPerSec>0 ? (-dx/stripDrag.pxPerSec) : 0;
      const next=clampOverlapDuration(stripDrag.overlap.shot.seconds, stripDrag.overlap.nextShot.seconds, stripDrag.originDur+delta);
      if(next==null)return;
      stripDrag.provisional=next;
      const newStart=stripDrag.overlap.end-next;
      el.style.left=pct(newStart);
      el.style.width=pct(next);
      el.title=transitionTypeLabel(stripDrag.overlap.transitionType)+' · '+next.toFixed(1)+'s · release to save';
    };
    const endDrag=ev=>{
      if(!stripDrag||stripDrag.pointerId!==ev.pointerId)return;
      const drag=stripDrag;stripDrag=null;
      el.classList.remove('is-dragging');
      try{handle.releasePointerCapture(ev.pointerId);}catch{}
      const next=drag.provisional;
      if(next==null||!(next>0)||Math.abs(next-drag.originDur)<1e-6){paintShotStrip();return;}
      const type=drag.overlap.transitionType;
      const shot=drag.overlap.shot;
      try{
        change(()=>{setShotTransition(shot,type,next);});
      }catch(err){
        status.textContent='Could not set transition: '+(err&&err.message?err.message:err);
        paintShotStrip();
      }
    };
    handle.onpointerup=endDrag;handle.onpointercancel=endDrag;
    const typeSel=buildStripTransitionSelect(o.transitionType,{ariaLabel:'Transition type for overlap after shot '+(o.index+1)});
    typeSel.title='Change transition type (Hard cut clears). Duration kept when possible.';
    typeSel.onchange=()=>{
      const nextType=typeSel.value;
      const dur=o.durationSec;
      try{
        change(()=>{applyStripTransitionType(o.shot,o.nextShot,nextType,dur);});
        status.textContent=nextType==='cut'
          ? ('Hard cut after shot '+(o.index+1)+'. Undo restores.')
          : (transitionTypeLabel(nextType)+' after shot '+(o.index+1)+'. Undo restores.');
      }catch(err){
        status.textContent='Could not set transition: '+(err&&err.message?err.message:err);
        typeSel.value=o.transitionType||'dissolve';
      }
    };
    el.append(handle,typeSel);
    kids.push(el);
  }
  for(const seam of (layout.seams||[])){
    const el=node('div');el.className='animatic-cut-seam';el.setAttribute('role','listitem');
    el.style.left=pct(seam.at);
    el.title='Hard cut · pick a transition type to add overlap';
    el.setAttribute('aria-label','Hard cut after shot '+(seam.index+1)+'; choose a transition');
    const typeSel=buildStripTransitionSelect('cut',{ariaLabel:'Add transition after shot '+(seam.index+1)});
    typeSel.onchange=()=>{
      const nextType=typeSel.value;
      if(nextType==='cut')return;
      try{
        change(()=>{applyStripTransitionType(seam.shot,seam.nextShot,nextType,STRIP_DEFAULT_TRANSITION_SEC);});
        status.textContent=transitionTypeLabel(nextType)+' added after shot '+(seam.index+1)+'. Undo restores.';
      }catch(err){
        status.textContent='Could not set transition: '+(err&&err.message?err.message:err);
        typeSel.value='cut';
      }
    };
    el.append(typeSel);
    kids.push(el);
  }
  shotStrip.replaceChildren(...kids);
  shotStripPlayhead.style.left=(Math.min(1,Math.max(0,position/layout.total))*100)+'%';
}
function display(){
  counter.textContent=frameTime(position)+' / '+frameTime(total);scrub.value=position;paintBeatStrip();paintShotStrip();
  if(guideProject) safeGuides.setVisible(safeAreaGuidesOn(guideProject));
  const entry=shotAt(entries,position);
  if(!entry){caption.textContent='Add a shot to preview your episode.';clearLayer(layerIn);clearLayer(layerOut);layerIn.textContent='Your animatic will appear here.';applyTransitionLayers(layerOut,layerIn,'cut',null,layerPlate);paintTitleOverlay(screen, guideProject, null);return;}
  const pair=dissolvePair(entries,position);
  const local=Math.max(0,position-entry.start),frame=Math.min(entry.shot.seconds*24-1,Math.floor(local*24+1e-7));
  const cast=!shown||entry.shot.assetIds===undefined?'':plannedAssets(shown,entry.shot).map(asset=>asset.name).join(', ')||'No cast selected';
  const board=usesBoards(entry.shot)?panelAt(entry.shot,local):null;
  const still=planStill(entry.shot),stillLabel=planStillLabel(entry.shot);
  const pictureLabel=animaticPictureLabel(entry.shot,board);
  const tType=pair?(pair.outgoing.transitionType||pair.outgoing.shot?.transition?.type||'dissolve'):'';const dissolveNote=pair?` · ${tType} ${Math.round(pair.progress*100)}%`:'';
  selector.value=String(entry.start);const holdSec=(()=>{try{return shotHoldSeconds(entry.shot);}catch{return 0;}})();
  const holdNote=holdSec?(' · hold '+holdSec+'s last frame'):'';
  const speedRate=(()=>{try{return shotPlaybackSpeed(entry.shot);}catch{return 1;}})();
  const speedNote=speedRate!==1?(' · '+speedRate+'x'):'';
  caption.textContent=entry.scene+' / '+(entry.shot.title||'Untitled shot')+' · frame '+frame+' · '+pictureLabel+holdNote+speedNote+dissolveNote+(cast?' · '+cast:'')+(entry.shot.action?' · '+entry.shot.action:'');
  paintTitleOverlay(screen, guideProject || shown, entry.shot);
  if(entry!==active){
   const keepFade=pair&&active&&pair.outgoing===active&&media;
   if(keepFade){
    fadeMedia=media;fadeEntry=active;fadeBag=mediaBag;media=null;mediaBag=null;picture=null;
    clearLayer(layerOut);layerOut.append(fadeMedia);
    clearBagTransport(audioBag);if(audio)audio.volume=0;
    audio?.pause();audio?.remove();audio=null;audioBag=null;
    for(const t of tracks){clearBagTransport(t);t.element.pause();t.element.remove();}tracks=[];
    generation++;
   }else release();
   active=entry;failed=false;const token=generation,file=usesBoards(entry.shot)?null:entry.shot.media||planStill(entry.shot);
   clearLayer(layerIn);
   if(!file){layerIn.textContent=entry.shot.action||'Storyboard not attached';status.textContent='Missing media: this placeholder preserves the shot’s timing.';}
   else{
    const name=file.name||file.filename||'';mediaBag=null;media=node(/\.(mp4|webm|mov|mkv|m4v)$/i.test(name)?'video':'img');
    if(media.tagName==='VIDEO'){media.muted=!!entry.shot.audio;media.volume=0;media.playsInline=true;media.preload='auto';media.onloadeddata=()=>{if(token!==generation)return;status.textContent='Ready · video preview';syncVideo();};media.onwaiting=()=>{if(token===generation)status.textContent='Buffering media · timing preview continues';};}
    else{media.alt=entry.shot.media?'Storyboard preview':(planStillLabel(entry.shot)||'Plan picture');media.onload=()=>{if(token===generation)status.textContent=entry.shot.media?'Ready · storyboard still':animaticPlanStatus(planStillLabel(entry.shot)||'plan');};}
    media.onerror=()=>{if(token!==generation)return;failed=true;status.textContent='Media unavailable or unsupported. Reattach this shot’s file; its timing is preserved.';clearLayer(layerIn);layerIn.textContent='Preview unavailable';};
    status.textContent='Loading shot media…';media.src=mediaURL(file);layerIn.append(media);
   }
   if(entry.shot.audio){
    audioBag=null;audio=node('audio');audio.preload='auto';audio.muted=false;audio.hidden=true;audio.volume=0;
    soundStatus.textContent='Loading attached audio…';
    audio.onloadeddata=()=>{if(token!==generation)return;soundStatus.textContent='Attached audio replaces clip sound.';syncVideo();};
    audio.onwaiting=()=>{if(token===generation)soundStatus.textContent='Buffering attached audio · preview timing continues';};
    audio.onerror=()=>{if(token===generation)soundStatus.textContent='Attached audio unavailable or unsupported. Reattach the file. Clip sound remains replaced.';};
    audio.src=mediaURL(entry.shot.audio);panel.append(audio);
   }else soundStatus.textContent=media?.tagName==='VIDEO'?'Using clip sound, if present.':'No audio attached to this shot.';
   for(const t of entry.shot.audioTracks||[]){
    if(!t.media)continue;const element=node('audio');element.preload='auto';element.hidden=true;element.volume=0;element.muted=false;
    element.onloadeddata=()=>{if(token===generation)syncVideo();};
    element.onerror=()=>{if(token===generation)soundStatus.textContent='A sound track is unavailable. Reattach its audio file.';};
    element.src=mediaURL(t.media);tracks.push({...t,element,gain:createTransportGain(0),pendingSeek:null});panel.append(element);
   }
   if(tracks.length)soundStatus.textContent=`${tracks.length} sound track(s) mixed with ${entry.shot.audio?'attached voice':media?.tagName==='VIDEO'?'clip sound':'silent boards'}.`;
  }
  if(usesBoards(entry.shot)){
   const selected=board;
   if(picture!==selected){picture=selected;clearLayer(layerIn);media=null;
    if(!selected)layerIn.textContent=entry.shot.action||'This frame is past the storyboard.';
    else if(selected.media){const img=node('img');img.alt=selected.action||'Storyboard panel';img.src=mediaURL(selected.media);img.onerror=()=>{if(picture===selected)status.textContent='Panel drawing unavailable. Reattach its file.';};layerIn.append(img);}
    else if(planStill(entry.shot)){const img=node('img');img.alt=planStillLabel(entry.shot);img.src=mediaURL(planStill(entry.shot));layerIn.append(img);}
    else layerIn.textContent=selected.action||'Add a storyboard panel drawing';
   }
   status.textContent=selected&&!selected.media&&still?animaticPlanStatus(stillLabel):selected?'Storyboard panel '+((entry.shot.panels||[]).indexOf(selected)+1)+' · '+selected.frames+' planned frames':`Storyboard covers ${boardFrames(entry.shot)} frames; this shot is ${entry.shot.seconds*24}. Fit panel timing so the animatic matches the plan.`;
  }
  if(pair){applyTransitionLayers(layerOut,layerIn,pair.outgoing.transitionType||pair.outgoing.shot?.transition?.type||'dissolve',pair.progress,layerPlate);}
  else{
   applyTransitionLayers(layerOut,layerIn,'cut',null,layerPlate);
   if(fadeMedia){clearBagTransport(fadeBag);if(fadeMedia)fadeMedia.volume=0;if(fadeMedia.pause){fadeMedia.pause();fadeMedia.removeAttribute('src');fadeMedia.load?.();}fadeMedia=null;fadeEntry=null;fadeBag=null;clearLayer(layerOut);}
  }
  syncVideo();
  if(fadeMedia&&fadeEntry){
   if(!fadeBag||fadeBag.el!==fadeMedia)fadeBag={el:fadeMedia,gain:createTransportGain(0),pendingSeek:null,volume:1,forceMute:!!fadeEntry.shot?.audio};
   else fadeBag.forceMute=!!fadeEntry.shot?.audio;
   const m=fadeEntry.shot?.media;
   const trim=m?{sourceIn:Number(m.sourceIn)||0,sourceOut:m.sourceOut===undefined?null:Number(m.sourceOut)}:null;
   let speed=1;try{speed=shotPlaybackSpeed(fadeEntry.shot);}catch{speed=1;}
   const savedActive=active;active=fadeEntry;syncMedia(fadeBag,0,trim,speed);active=savedActive;
  }
  episodeSound.sync(position,playing,muted);
 }
 function seek(seconds){pause();position=Math.min(total,Math.max(0,seconds));if(panel.open)display();}
 function jump(delta){const index=entries.indexOf(shotAt(entries,position));seek(entries[Math.min(entries.length-1,Math.max(0,index+delta))]?.start||0);}
 function tick(now){if(!playing)return;position=Math.min(total,position+(now-last)/1000);last=now;display();if(position>=total){pause();status.textContent='Preview finished.';}else raf=requestAnimationFrame(tick);}
 function start(){if(!total)return;if(position>=total)position=0;playing=true;last=performance.now();play.textContent='Pause preview';panel.classList.add('playing');display();raf=requestAnimationFrame(tick);}
 panel.ontoggle=()=>{if(panel.open)display();else{pause();release();episodeSound.release();}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 window.addEventListener('pagehide',()=>{pause();release();episodeSound.release();});
 return {reset(project){
  shown=project;const next=shotTimeline(project),key=JSON.stringify([project.id,project.episodeAudio,project.ducking,project.assets.map(asset=>[asset.id,asset.name,asset.kind]),next.map(e=>[e.scene,e.shot.id,e.shot.title,e.shot.action,e.shot.seconds,e.shot.media,e.shot.audio,e.shot.visualSource,e.shot.panels,e.shot.audioTracks,e.shot.assetIds,e.shot.transition,e.shot.holdSeconds,e.shot.playbackSpeed,e.dissolveOut,e.shot.subtitle,e.shot.titleOverlay,e.shot.layout?.drawing,e.shot.colorScript?.frame]),project.previewGuides,project.titleStyles]);
  if(key===signature){bindGuideControls(project);if(panel.open)display();return;}signature=key;pause();release();bindGuideControls(project);episodeSound.reset(project.episodeAudio,project);entries=next;total=entries.at(-1)?.end||0;position=0;scrub.max=total;play.disabled=!total;scrub.disabled=!total;
  selector.replaceChildren(...entries.map((e,i)=>new Option((i+1)+'. '+e.scene+' / '+(e.shot.title||'Untitled shot')+' · '+frameTime(e.start),String(e.start))));selector.disabled=!total;
  counter.textContent=frameTime(0)+' / '+frameTime(total);if(panel.open)display();
 }};
}
