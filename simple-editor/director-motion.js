import {travelPathControls} from './director-path2d.js';
import {sampleCels} from './director-cels.js';
import {channelControls,validateChannels,drawingChannelSpecs,sampleScalar,channelActive} from './director-channels.js';
import {validateWalk,sampleWalk,createWalkControls} from './director-walk.js';
import {validateLipSync,mouthAt} from './director-lipsync.js';
import {recordCanvas} from './director-recorder.js';
import {defaultRig} from './director-rig.js';
import {motionInterval,validateTiming,EASINGS,craftControls} from './director-animation-craft.js';
import {pictureNote} from './director-planning-state.js';
export const FPS=24,MAX_KEYS=120;
export const hasDrawingAnimation=board=>!!(board.keyframes?.length||board.walk||board.lipSync||board.layers.some(l=>l.cels?.length)||board.channels?.some(channelActive));
export function validateMotion(board){
 validateWalk(board);
 validateLipSync(board.lipSync);
 validateChannels(board.channels,drawingChannelSpecs(board));
 if(board.loop!==undefined&&typeof board.loop!=='boolean')throw Error('Invalid drawing animation loop setting.');
 if(board.keyframes===undefined){validateTiming(board,[]);return;}
 if(!Array.isArray(board.keyframes)||board.keyframes.length>MAX_KEYS)throw Error('Use at most 120 pose keyframes per drawing.');
 const frames=new Set(),ids=new Set(board.layers.map(l=>l.id));
 for(const key of board.keyframes){
  if(!key||!Number.isInteger(key.frame)||key.frame<0||key.frame>=86400||frames.has(key.frame)||!Array.isArray(key.poses)||key.poses.length>12)throw Error('Invalid pose keyframe.');
  frames.add(key.frame);const parts=new Set();
  for(const p of key.poses){if(!p||!ids.has(p.id)||parts.has(p.id)||![['x',1920],['y',1080],['angle',360]].every(([k,max])=>Number.isFinite(p[k])&&Math.abs(p[k])<=max))throw Error('Invalid keyframe layer pose.');if(p.stretch!==undefined&&(!Number.isFinite(p.stretch)||p.stretch<.25||p.stretch>4))throw Error('Invalid keyframe stretch.');parts.add(p.id);}
 }
 validateTiming(board,board.keyframes);
}
export const capturePose=board=>board.layers.map(l=>{const r=l.rig||defaultRig();return {id:l.id,x:r.x,y:r.y,angle:r.angle,stretch:r.stretch??1};});
function samplePoses(board,frame){
 const interval=motionInterval(board,board.keyframes||[],frame);
 const {a,b,t}=interval||{a:{poses:[]},b:{poses:[]},t:0};
 return {...board,layers:board.layers.map(l=>{const rig=l.rig||defaultRig(),p=a.poses.find(p=>p.id===l.id)||rig,q=b.poses.find(p=>p.id===l.id)||rig;
  return {...l,opacity:sampleScalar(board.channels,`layer:${l.id}:opacity`,frame,l.opacity),rig:{...rig,...Object.fromEntries(['x','y','angle','stretch'].map(axis=>{const start=p[axis]??(axis==='stretch'?1:0),end=q[axis]??(axis==='stretch'?1:0);return [axis,sampleScalar(board.channels,`layer:${l.id}:${axis}`,frame,start+(end-start)*t)];}))}};
 })};
}
export function sampleMotion(board,frame){const posed=sampleCels(sampleWalk(samplePoses(board,frame),frame,board),frame);if(!board.lipSync)return posed;const shape=mouthAt(board.lipSync,frame/24);return {...posed,layers:posed.layers.map(l=>/^Mouth [A-HX]$/.test(l.name)?{...l,visible:l.name==='Mouth '+shape}:l)};}
export function createMotionControls({board,selected,shot,commit,change,button,notify,upload,isCurrent,paint,view}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
 const panel=el('details');panel.className='settings motion-controls';panel.append(el('summary','Animate rig · poses & playback'));
 const walkControls=createWalkControls({board,commit,button,notify});panel.append(walkControls);
 panel.append(el('p','Pose parts in the drawing above, choose a frame, then save a keyframe. The preview blends saved poses at 24 frames per second. Pivots, parenting and artwork apply to every frame. Rotation follows the entered degrees, including full turns.'));
 const toolbar=el('div');toolbar.className='drawing-toolbar';panel.append(toolbar);
 function field(name,input){const label=el('label',name);label.className='field';input.setAttribute('aria-label',name);label.append(input);toolbar.append(label);return input;}
 const frame=field('Animation frame',el('input'));frame.type='number';frame.min=0;frame.step=1;
 const easing=field('Movement after this keyframe',el('select'));for(const [v,t] of EASINGS)easing.add(new Option(t,v));
 const loop=field('Repeat drawing keyframes',el('input'));loop.type='checkbox';loop.onchange=()=>commit(()=>board().loop=loop.checked);
 const scrub=el('input');scrub.type='range';scrub.min=0;scrub.step=1;scrub.setAttribute('aria-label','Scrub animation');
 const canvas=el('canvas');canvas.className='motion-preview';canvas.setAttribute('aria-label','Rig animation preview');
 const info=el('p');info.setAttribute('role','status');const keys=el('div');keys.className='actions motion-keys';
 const actions=el('div');actions.className='actions';const progress=el('progress');progress.max=1;progress.hidden=true;
 let raf=0,running=false,recording=false,cancelRecord=null,craft;
 const last=()=>Math.max(0,Math.round(shot.seconds*FPS)-1);
 const active=()=>isCurrent()&&panel.isConnected&&panel.open&&panel.closest('.drawing-controls')?.open&&!document.hidden;
 function at(value){view.frame=Math.max(0,Math.min(last(),Math.round(Number(value)||0)));frame.value=scrub.value=view.frame;const key=board().keyframes?.find(k=>k.frame===view.frame);if(key)easing.value=key.easing;craft?.refresh();draw();panel.dispatchEvent(new CustomEvent('director-frame',{bubbles:true,detail:{shotId:shot.id,frame:view.frame}}));}
 function draw(){if(panel.open){const pose=sampleMotion(board(),view.frame||0);paint(canvas,pose);if(pose.walkClamped)info.textContent='Walk reach warning: shorten the stride or adjust the resting legs.';}}
 function stop(){running=false;cancelAnimationFrame(raf);play.textContent='Play poses';}
 function update(){pathUI.refresh();channelsUI.refresh();walkControls.update();loop.checked=!!board().loop;if(running)stop();frame.max=scrub.max=last();at(view.frame||0);keys.replaceChildren();for(const k of [...(board().keyframes||[])].sort((a,b)=>a.frame-b.frame)){const jump=button('Frame '+k.frame,()=>{stop();at(k.frame);});jump.disabled=k.frame>last();keys.append(jump);}info.textContent=(board().keyframes?.length||0)+' / 120 keyframes · '+shot.seconds+' seconds. '+((board().keyframes||[]).some(k=>k.frame>last())?'Some keys are beyond the shortened shot; lengthen it to use them.':'Preview does not change your working pose.');}
 const save=button('Save pose keyframe',()=>{stop();if(!(board().keyframes||[]).some(k=>k.frame===view.frame)&&(board().keyframes?.length||0)>=MAX_KEYS){notify('This drawing already has 120 keyframes. Remove one first.');return;}commit(()=>{const previous=board().keyframes?.find(k=>k.frame===view.frame),curve=previous?.curve,kind=previous?.kind;board().keyframes=(board().keyframes||[]).filter(k=>k.frame!==view.frame);board().keyframes.push({frame:view.frame||0,easing:easing.value,...(kind?{kind}:{}),...(easing.value==='bezier'&&curve?{curve}:{}),poses:capturePose(board())});});notify('Pose saved at frame '+view.frame+'.');});
 const load=button('Use preview pose in drawing',()=>{stop();const posed=sampleMotion(board(),view.frame||0);if(posed.layers.some((l,i)=>l.locked&&['x','y','angle','stretch'].some(k=>(l.rig?.[k]??(k==='stretch'?1:0))!==((board().layers[i].rig||defaultRig())[k]??(k==='stretch'?1:0))))){notify('Unlock the affected layers before loading this pose.');return;}commit(()=>{for(const l of board().layers){if(!l.locked)l.rig={...(posed.layers.find(p=>p.id===l.id).rig||defaultRig())};}delete board().walk;});notify('Preview pose applied. Any procedural walk was removed so it is not applied twice.');});
 const remove=button('Remove keyframe',()=>{stop();commit(()=>{board().keyframes=(board().keyframes||[]).filter(k=>k.frame!==view.frame);});});
 const play=button('Play poses',()=>{if(running){stop();return;}if(!hasDrawingAnimation(board())){notify('Save pose keys, cels or mouth timing first.');return;}running=true;play.textContent='Stop preview';const start=performance.now();function tick(now){if(!active()){stop();return;}at(Math.min(last(),Math.floor((now-start)/1000*FPS)));if(now-start>=shot.seconds*1000){stop();return;}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);});
 frame.onchange=()=>{stop();at(frame.value);};scrub.oninput=()=>{stop();at(scrub.value);};
 const exportButton=button('Save animation as shot clip',record);
 const cancel=button('Cancel recording',()=>cancelRecord?.('Recording cancelled.'));cancel.hidden=true;
 actions.append(save,load,remove,play,exportButton,cancel);panel.append(actions,scrub,canvas,progress,info,keys);
 craft=craftControls({label:'2D',getState:board,keyName:'keyframes',getFrame:()=>view.frame||0,change:next=>commit(()=>Object.assign(board(),next)),validate:validateMotion,notify,beforeEdit:stop,isBusy:()=>recording||!isCurrent(),lastFrame:last,
  sample:f=>({frame:f,easing:'smooth',poses:capturePose(samplePoses(board(),f))}),
  alter:(key,a,b,factor,lift)=>{const layer=selected();if(!layer||layer.locked)throw Error('Select an unlocked drawing layer first.');if(board().walk)throw Error('Disable procedural walking before suggesting pose breakdowns.');const base=layer.rig||defaultRig(),p=a.poses.find(p=>p.id===layer.id)||base,q=b.poses.find(p=>p.id===layer.id)||base,target=key.poses.find(p=>p.id===layer.id);for(const axis of ['x','y','angle'])target[axis]=p[axis]+(q[axis]-p[axis])*factor;target.y-=lift;}});
 panel.append(el('p','Suggestions affect the selected layer. Exposure affects saved poses; procedural walking and mouth timing keep their own timing. Inserted full-pose keys can change the timing of other parts—review the complete character.'),craft.panel);
 const channelsUI=channelControls({host:panel,label:'2D',getState:board,getSpecs:()=>drawingChannelSpecs(board()).filter(s=>s.layerId===selected()?.id),getFrame:()=>view.frame||0,lastFrame:last,notify,isBusy:()=>recording||!isCurrent(),beforeEdit:()=>{stop();if(!selected()||selected().locked)throw Error('Select an unlocked layer first.');if(board().walk)throw Error('Disable procedural walking before editing independent channels.');},getValue:(id,f)=>{const spec=drawingChannelSpecs(board()).find(s=>s.id===id);if(!spec)throw Error('Select a property.');const layer=samplePoses(board(),f).layers.find(l=>l.id===spec.layerId);return spec.axis==='opacity'?layer.opacity:layer.rig[spec.axis];},save:next=>{validateMotion(next);commit(()=>Object.assign(board(),next));}});
 const pathUI=travelPathControls({host:panel,board,selected,last,sample:f=>samplePoses(board(),f).layers.find(l=>l.id===selected().id).rig,save:next=>{validateMotion(next);commit(()=>Object.assign(board(),next));},notify,isBusy:()=>recording||!isCurrent(),stop});
 panel.open=!!view.motionOpen;panel.ontoggle=()=>{view.motionOpen=panel.open;if(panel.open)update();else{stop();cancelRecord?.('Recording cancelled because the animation panel closed.');}};
 async function record(){
  if(recording)return;stop();
  if(!hasDrawingAnimation(board())){notify('Save pose keys, cels or mouth timing first.');return;}
  recording=true;for(const control of [exportButton,save,load,remove,play,frame,scrub,easing,loop])control.disabled=true;cancel.hidden=false;progress.hidden=false;progress.value=0;
  const snapshot=JSON.stringify(board()),seconds=shot.seconds,originalMedia=JSON.stringify(shot.media),frozen=structuredClone(board()),output=el('canvas'),stage=el('canvas'),scratch=el('canvas'),controller=new AbortController();let result;
  output.width=960;output.height=540;cancelRecord=()=>controller.abort();
  const unchanged=()=>isCurrent()&&JSON.stringify(board())===snapshot&&shot.seconds===seconds&&JSON.stringify(shot.media)===originalMedia;
  try{
   result=await recordCanvas({canvas:output,seconds,signal:controller.signal,active:()=>active()&&unchanged(),draw:frame=>{paint(stage,sampleMotion(frozen,frame),null,scratch);output.getContext('2d').drawImage(stage,0,0);canvas.getContext('2d').drawImage(output,0,0);},onProgress:(elapsed,total)=>{progress.value=elapsed/total;info.textContent='Recording '+elapsed.toFixed(1)+' / '+total+' seconds to temporary disk storage. Keep this window visible.';}});
   info.textContent='Saving clip…';
   const file=await upload(result.file,{signal:controller.signal,onProgress:p=>info.textContent="Uploading clip: "+Math.round(p*100)+"%"});
   if(controller.signal.aborted||!active()||!unchanged())throw Error('Clip was not attached because recording was cancelled or the shot changed.');
   change(()=>{shot.media=file;});notify('Animation saved as the shot clip. Existing shot audio is kept for assembly.'+pictureNote(shot));
  }catch(e){notify(e.message);}finally{await result?.release().catch(e=>notify('Clip saved, but temporary storage cleanup failed: '+e.message));recording=false;cancelRecord=null;for(const control of [exportButton,save,load,remove,play,frame,scrub,easing,loop])control.disabled=false;cancel.hidden=true;progress.hidden=true;draw();}
 }
 return {panel,update};
}

