// Shared timing for previews, recorded clips and baked 3D exports.
export const EASINGS=[['smooth','Ease in and out'],['linear','Constant speed'],['hold','Hold pose'],['ease-in','Accelerate'],['ease-out','Decelerate'],['bezier','Custom timing curve']];
export const DEFAULT_CURVE=[.42,0,.58,1];
export const KEY_KINDS=['key','breakdown','inbetween','extreme'];
// Retime only the requested track; values and interpolation metadata travel with keys.
export function retimeKeys(keys,{start,end,offset=0,scale=1,lastFrame=86399}){
 if(![start,end,offset,lastFrame].every(Number.isInteger)||start<0||end<start||lastFrame<0||lastFrame>86399||!Number.isFinite(scale)||scale<=0)throw Error('Use whole frame ranges and a positive timing scale.');
 if(!keys.some(k=>k.frame>=start&&k.frame<=end))throw Error('No saved keys in this range.');
 const result=structuredClone(keys),frames=new Set();
 for(const k of result){
  if(k.frame>=start&&k.frame<=end)k.frame=start+offset+Math.round((k.frame-start)*scale);
  if(!Number.isInteger(k.frame)||k.frame<0||k.frame>lastFrame)throw Error('Retimed keys would fall outside the shot. Lengthen the shot or reduce the move.');
  if(frames.has(k.frame))throw Error('Retiming would overlap keys at frame '+k.frame+'. No keys were changed.');
  frames.add(k.frame);
 }
 return result.sort((a,b)=>a.frame-b.frame);
}
export function validateTiming(state,keys){
 if(state.exposure!==undefined&&![1,2,3].includes(state.exposure))throw Error('Use animation on ones, twos or threes.');
 for(const key of keys){
  if(key.kind!==undefined&&!KEY_KINDS.includes(key.kind))throw Error('Invalid animation key label.');
  if(!EASINGS.some(([id])=>id===key.easing))throw Error('Invalid animation easing.');
  if(key.curve!==undefined&&(!Array.isArray(key.curve)||key.curve.length!==4||!key.curve.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Timing curve handles must be four numbers between 0 and 1.');
 }
}
export function easeAt(key,t){
 t=Math.max(0,Math.min(1,t));
 if(key.easing==='hold')return 0;
 if(key.easing==='smooth')return t*t*(3-2*t);
 if(key.easing==='ease-in')return t*t;
 if(key.easing==='ease-out')return 1-(1-t)*(1-t);
 if(key.easing!=='bezier'||t===0||t===1)return t;
 const [x1,y1,x2,y2]=key.curve||DEFAULT_CURVE;
 const bez=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
 // Solve x(u)=time, then evaluate y(u). Direct y(time) is not a timing curve.
 let low=0,high=1;
 for(let i=0;i<32;i++){const mid=(low+high)/2;if(bez(mid,x1,x2)<t)low=mid;else high=mid;}
 return bez((low+high)/2,y1,y2);
}
export function motionInterval(state,keys,frame){
 keys=[...keys].sort((a,b)=>a.frame-b.frame);
 if(!keys.length)return null;
 if(state.loop&&keys.length>1&&frame>=keys[0].frame)frame=keys[0].frame+(frame-keys[0].frame)%(keys.at(-1).frame-keys[0].frame);
 const a=keys.filter(k=>k.frame<=frame).at(-1)||keys[0],b=keys.find(k=>k.frame>frame)||a;
 // Restart exposure at each key: authored contacts must land on their exact frame.
 const step=state.exposure||1;
 if(step>1)frame=a.frame+Math.floor(Math.max(0,frame-a.frame)/step)*step;
 return {a,b,t:a===b?0:easeAt(a,(frame-a.frame)/(b.frame-a.frame))};
}
export function suggestBreakdowns(state,{keyName,start,kind,amount,arc=0,sample,alter}){
 const candidate=structuredClone(state),keys=candidate[keyName]||[],sorted=[...keys].sort((a,b)=>a.frame-b.frame);
 const a=sorted.find(k=>k.frame===start),b=sorted.find(k=>k.frame>start);
 if(!a||!b||b.frame-a.frame<6)throw Error('Choose a saved key with a following key at least six frames later.');
 if(!['anticipate','settle','arc'].includes(kind)||!Number.isFinite(amount)||amount<0||amount>.5||!Number.isFinite(arc))throw Error('Invalid motion suggestion settings.');
 if(keys.length+(kind==='arc'?1:2)>120)throw Error('Not enough room in the 120-key limit.');
 const span=b.frame-a.frame,points=kind==='arc'?[[.5,.5,arc]]:kind==='settle'?[[.65,1+amount,0],[.85,1-amount*.25,0]]:[[.2,-amount,0],[.8,1+amount*.5,0]];
 const generated=points.map(([time,factor,height])=>{const frame=a.frame+Math.round(span*time),key=sample(frame);key.frame=frame;key.kind='breakdown';key.easing='smooth';delete key.curve;alter(key,a,b,factor,height);return key;});
 candidate[keyName]=[...keys,...generated].sort((a,b)=>a.frame-b.frame);
 return {candidate,frames:generated.map(k=>k.frame)};
}

export function craftControls({label,getState,keyName,getFrame,change,validate,sample,alter,notify,beforeEdit=()=>{},isBusy=()=>false,lastFrame=()=>86399}){
 const panel=document.createElement('details');panel.className='settings animation-craft';
 const summary=document.createElement('summary');summary.textContent=label+' · timing & animation craft';panel.append(summary);
 const note=document.createElement('p');note.textContent='Save a pose key at the playhead for the same breakdown. Anticipation, settle and arc only insert those keys; edit the keys to correct them. Ones, twos and threes are the Exposure setting above. These helpers do not understand acting, collisions or planted contacts. Project Undo restores edits.';panel.append(note);
 const fields=document.createElement('div');fields.className='drawing-toolbar';panel.append(fields);
 function field(name,type,value){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;}input.setAttribute('aria-label',label+' '+name);wrap.append(input);fields.append(wrap);return input;}
 function button(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{if(isBusy())return;try{beforeEdit();fn();}catch(e){notify(e.message);}};panel.append(b);return b;}
 const exposure=field('Exposure','select');for(const [n,text] of [[1,'On ones · every frame'],[2,'On twos · every 2 frames'],[3,'On threes · every 3 frames']])exposure.add(new Option(text,n));
 const easing=field('Timing curve','select');for(const [id,text] of EASINGS)easing.add(new Option(text,id));
 const handles=['Handle 1 time','Handle 1 progress','Handle 2 time','Handle 2 progress'].map((name,i)=>{const input=field(name,'number',DEFAULT_CURVE[i]);input.min=0;input.max=1;input.step=.05;return input;});
 const graph=document.createElement('canvas');graph.width=300;graph.height=150;graph.setAttribute('aria-label',label+' timing curve preview');graph.style.maxWidth='100%';panel.append(graph);
 function curve(){const ctx=graph.getContext('2d');ctx.clearRect(0,0,300,150);ctx.strokeStyle='#688090';ctx.strokeRect(10,10,280,130);ctx.strokeStyle='#24bba9';ctx.beginPath();const key={easing:easing.value,curve:handles.map(i=>Number(i.value))};for(let i=0;i<=100;i++){const x=10+i*2.8,y=140-easeAt(key,i/100)*130;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();handles.forEach(i=>i.disabled=easing.value!=='bezier');}
 easing.onchange=curve;handles.forEach(i=>i.oninput=curve);
 function commit(next){validate(next);change(next);refresh();}
 const keyEditor=keyRangeControls({host:panel,label:label+' pose',getKeys:()=>getState()[keyName]||[],getFrame,lastFrame,isBusy,beforeEdit,notify,save:keys=>{const next=structuredClone(getState());next[keyName]=keys;commit(next);}});
 exposure.onchange=()=>{if(isBusy())return;try{beforeEdit();const next=structuredClone(getState());next.exposure=Number(exposure.value);commit(next);}catch(e){notify(e.message);refresh();}};
 button('Apply timing to saved key',()=>{const next=structuredClone(getState()),key=next[keyName]?.find(k=>k.frame===getFrame());if(!key)throw Error('Select a saved keyframe first.');key.easing=easing.value;if(key.easing==='bezier')key.curve=handles.map(i=>Number(i.value));else delete key.curve;commit(next);notify('Timing updated. Preview and export use the same curve.');});
 const kind=field('Suggestion','select');for(const [id,text] of [['anticipate','Anticipation → action → settle'],['settle','Overshoot → settle'],['arc','Curved travel · midpoint']])kind.add(new Option(text,id));
 const amount=field('Exaggeration (0–0.5)','number',.15);amount.min=0;amount.max=.5;amount.step=.05;
 const arc=field('Arc lift (pixels in 2D, units in 3D)','number',label==='2D'?60:.3);arc.step=label==='2D'?5:.05;
 const result=document.createElement('p');result.setAttribute('role','status');panel.append(result);let draft=null,fingerprint=null;
 button('Suggest editable breakdowns',()=>{draft=null;apply.disabled=true;result.textContent='';const state=getState();fingerprint=JSON.stringify(state);const suggestion=suggestBreakdowns(state,{keyName,start:getFrame(),kind:kind.value,amount:Number(amount.value),arc:Number(arc.value),sample,alter});validate(suggestion.candidate);if(suggestion.frames.some(f=>f>lastFrame())){draft=null;throw Error('Suggested keys would be outside the shot. Lengthen it first.');}draft=suggestion;result.textContent='Suggested frames: '+draft.frames.join(', ')+'. Review by applying, scrubbing, and adjusting the keys. End poses remain unchanged.';apply.disabled=false;});
 const apply=button('Apply suggested breakdowns',()=>{if(!draft||JSON.stringify(getState())!==fingerprint)throw Error('The animation changed. Make a fresh suggestion.');const next=draft.candidate;draft=null;apply.disabled=true;commit(next);notify('Editable breakdowns added. Scrub the motion, correct contacts and adjust poses.');});apply.disabled=true;
 function refresh(){const state=getState(),key=state[keyName]?.find(k=>k.frame===getFrame());exposure.value=state.exposure||1;easing.value=key?.easing||'smooth';handles.forEach((input,i)=>input.value=(key?.curve||DEFAULT_CURVE)[i]);if(fingerprint!==JSON.stringify(state)){draft=null;apply.disabled=true;result.textContent='';}keyEditor.refresh();curve();}
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
 return {panel,refresh};
}

export function keyRangeControls({host,label,getKeys,getFrame,lastFrame,save,notify,isBusy=()=>false,beforeEdit=()=>{}}){
 const panel=document.createElement('details');panel.className='settings';const summary=document.createElement('summary');summary.textContent=label+' · key labels & range timing';panel.append(summary);host.append(panel);
 const note=document.createElement('p');note.textContent='Move or stretch this track only. Scale 2 doubles spacing around the range start; 0.5 halves it. Times round to whole frames. Other tracks, contacts, cels and sound stay at their existing times; review synchronization afterward.';panel.append(note);
 function field(name,type,value){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;input.step=1;}input.setAttribute('aria-label',label+' '+name);wrap.append(input);panel.append(wrap);return input;}
 const mark=field('Key label','select');for(const kind of KEY_KINDS)mark.add(new Option(kind,kind));
 const start=field('Range start','number',0),end=field('Range end','number',24),offset=field('Move by frames','number',0),scale=field('Spacing scale','number',1);scale.min=.01;scale.step=.1;
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 function action(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{if(isBusy())return;try{beforeEdit();fn();}catch(e){status.textContent=e.message;notify(e.message);}};panel.append(b);}
 action('Mark current '+label+' key',()=>{const keys=structuredClone(getKeys()),key=keys.find(k=>k.frame===getFrame());if(!key)throw Error('Select a saved keyframe first.');key.kind=mark.value;save(keys);refresh();status.textContent='Saved key label at frame '+key.frame+'.';});
 action('Use full '+label+' key range',()=>{const keys=getKeys();if(!keys.length)throw Error('Save keys first.');start.value=Math.min(...keys.map(k=>k.frame));end.value=Math.max(...keys.map(k=>k.frame));});
 action('Apply '+label+' range timing',()=>{const keys=retimeKeys(getKeys(),{start:Number(start.value),end:Number(end.value),offset:Number(offset.value),scale:Number(scale.value),lastFrame:lastFrame()});save(keys);refresh();status.textContent='Timing saved. Review contacts and other tracks before rendering.';});
 function refresh(){const keys=[...getKeys()].sort((a,b)=>a.frame-b.frame),key=keys.find(k=>k.frame===getFrame());mark.value=key?.kind||'key';start.min=end.min=0;start.max=end.max=lastFrame();status.textContent=keys.length?keys.map(k=>k.frame+' · '+(k.kind||'key')).join('  /  '):'No saved keys on this track.';}
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();});return {refresh};
}
