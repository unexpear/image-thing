import {motionInterval,validateTiming,EASINGS,DEFAULT_CURVE,keyRangeControls} from './director-animation-craft.js';

export const channelActive=c=>c.enabled!==false&&c.keys.length>0;
export const drawingChannelSpecs=board=>board.layers.flatMap(l=>[['x',1920],['y',1080],['angle',360],['stretch',4],['opacity',1]].map(([axis,max])=>({id:`layer:${l.id}:${axis}`,layerId:l.id,axis,label:l.name+' · '+axis,min:axis==='stretch'?.25:axis==='opacity'?0:-max,max})));
export function validateChannels(channels,specs){
 if(channels===undefined)return;
 if(!Array.isArray(channels)||channels.length>128)throw Error('Use at most 128 independent channels.');
 const ids=new Set(),map=new Map(specs.map(s=>[s.id,s]));let total=0;
 for(const c of channels){const s=c&&map.get(c.id);if(!s||ids.has(c.id)||!Array.isArray(c.keys)||c.keys.length>240||(c.enabled!==undefined&&typeof c.enabled!=='boolean'))throw Error('Invalid or duplicate animation channel.');ids.add(c.id);const frames=new Set();
  for(const k of c.keys){if(!k||!Number.isInteger(k.frame)||k.frame<0||k.frame>=86400||frames.has(k.frame)||!Number.isFinite(k.value)||k.value<s.min||k.value>s.max)throw Error('Invalid channel frame or value: '+s.label);frames.add(k.frame);}
  if(c.blendTarget!==undefined&&(!Number.isFinite(c.blendTarget)||c.blendTarget<s.min||c.blendTarget>s.max||c.keys.some(k=>k.value<0||k.value>1)))throw Error('A blended channel needs a valid target and weights from 0 to 1.');
  validateTiming(c,c.keys);total+=c.keys.length;
 }
 if(total>10000)throw Error('Use at most 10,000 independent channel keys per shot.');
}
export function setChannelKeyValue(keys,frame,value){if(!Array.isArray(keys)||!Number.isInteger(frame)||!Number.isFinite(value))throw Error('Choose a saved key and a finite value.');const next=keys.map(k=>({...k}));const key=next.find(k=>k.frame===frame);if(!key)throw Error('Choose a saved key and a finite value.');key.value=value;return next;}
export function sampleScalar(channels,id,frame,fallback){const c=channels?.find(c=>c.id===id&&channelActive(c));if(!c)return fallback;const {a,b,t}=motionInterval(c,c.keys,frame),value=a.value+(b.value-a.value)*t;return c.blendTarget===undefined?value:fallback+(c.blendTarget-fallback)*value;}
export function rigChannelSpecs(rig){return [
 ...rig.names.flatMap((n,i)=>['X','Y','Z'].map((axis,j)=>({id:`joint:${i}:${j}`,label:n+' rotation '+axis,min:-360,max:360}))),
 ...['X','Y','Z'].map((axis,j)=>({id:`root:${j}`,label:'Body travel '+axis,min:-10000,max:10000})),
 ...rig.names.flatMap((n,i)=>i===0?[]:['X','Y','Z'].map((axis,j)=>({id:`position:${i}:${j}`,label:n+' local travel '+axis,min:-10000,max:10000}))),
 ...(rig.face||[]).map((_,i)=>({id:`face:${i}`,label:'Face control '+(i+1),min:-10,max:10}))];}

export function setRigTravelPoint(rig,joint,frame,position,last){
 if(!Number.isInteger(joint)||joint<0||joint>=rig.names.length)throw Error('Select a joint.');
 if(!Number.isInteger(frame)||frame<0||frame>last||!Array.isArray(position)||position.length!==3)throw Error('Choose a frame inside the shot and three travel values.');
 const next=structuredClone(rig);next.channels??=[];
 position.forEach((value,axis)=>{
  const id=joint===0?`root:${axis}`:`position:${joint}:${axis}`;let channel=next.channels.find(c=>c.id===id);
  if(!channel){channel={id,keys:[]};next.channels.push(channel);}
  if(channel.enabled===false||channel.blendTarget!==undefined)throw Error('Enable ordinary travel channels before editing a 3D path point.');
  const old=channel.keys.find(k=>k.frame===frame);channel.keys=channel.keys.filter(k=>k.frame!==frame);
  channel.keys.push({...old,frame,value,easing:old?.easing||'linear',kind:old?.kind||'key'});channel.keys.sort((a,b)=>a.frame-b.frame);
 });
 validateChannels(next.channels,rigChannelSpecs(next));return next;
}

export function channelControls({host,label,getState,getSpecs,getFrame,lastFrame,getValue,save,notify,beforeEdit=()=>{},isBusy=()=>false}){
 const panel=document.createElement('details');panel.className='settings';const heading=document.createElement('summary');heading.textContent=label+' · independent channels & overlap';panel.append(heading);host.append(panel);
 const note=document.createElement('p');note.textContent='Each channel controls one value, with its own keys and curve. It overrides full-pose keys and holds its first/last value outside its keyed range. Drag a key dot up or down to change its value; frame, curve and exact numbers stay in the fields. Disable it to compare. Contacts, eye tracks and mouth cues are applied afterward. Offset a channel with range timing for follow-through; this does not simulate physics.';panel.append(note);
 function field(name,type='number',value=0){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;}input.setAttribute('aria-label',label+' channel '+name);wrap.append(input);panel.append(wrap);return input;}
 const selected=field('Property','select'),keys=field('Saved key','select'),value=field('Value'),easing=field('Curve','select');value.step=.05;for(const [id,text] of EASINGS)easing.add(new Option(text,id));
 const handles=DEFAULT_CURVE.map((v,i)=>{const f=field('Curve handle '+(i+1),'number',v);f.min=0;f.max=1;f.step=.05;return f;});
 const graph=document.createElement('canvas');graph.width=560;graph.height=180;graph.style.maxWidth='100%';graph.style.touchAction='none';graph.setAttribute('aria-label',label+' channel value graph');panel.append(graph);
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 const current=()=>getState().channels?.find(c=>c.id===selected.value);
 function action(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{if(isBusy())return;try{beforeEdit();fn();}catch(e){notify(e.message);}};panel.append(b);}
 function commit(edit){const state=structuredClone(getState());state.channels??=[];let c=state.channels.find(c=>c.id===selected.value);if(!c){if(!getSpecs().some(s=>s.id===selected.value))throw Error('Choose a property.');c={id:selected.value,keys:[]};state.channels.push(c);}edit(c);save(state);refresh();}
 action('Read '+label+' channel at playhead',()=>{const c=current();value.value=c?.blendTarget!==undefined?sampleScalar([{...c,blendTarget:undefined}],c.id,getFrame(),0):getValue(selected.value,getFrame());});
 action('Save '+label+' channel key at playhead',()=>commit(c=>{const frame=getFrame(),old=c.keys.find(k=>k.frame===frame);c.keys=c.keys.filter(k=>k.frame!==frame);c.keys.push({frame,value:Number(value.value),kind:old?.kind||'key',easing:easing.value,...(easing.value==='bezier'?{curve:handles.map(h=>Number(h.value))}:{})});c.keys.sort((a,b)=>a.frame-b.frame);}));
 action('Remove selected '+label+' channel key',()=>{if(!keys.value)throw Error('Select a channel key.');commit(c=>c.keys=c.keys.filter(k=>k.frame!==Number(keys.value)));});
 action('Enable / disable '+label+' channel',()=>commit(c=>c.enabled=c.enabled===false));
 action('Remove '+label+' channel',()=>{const state=structuredClone(getState());state.channels=(state.channels||[]).filter(c=>c.id!==selected.value);save(state);refresh();});
 const ranges=keyRangeControls({host:panel,label:label+' channel',getKeys:()=>current()?.keys||[],getFrame,lastFrame,notify,isBusy,beforeEdit,save:next=>commit(c=>c.keys=next)});
 function loadKey(){const k=current()?.keys.find(k=>k.frame===Number(keys.value));if(!k)return;value.value=k.value;easing.value=k.easing;handles.forEach((h,i)=>h.value=(k.curve||DEFAULT_CURVE)[i]);}
 let drag=null;
 function drawGraph(){const ctx=graph.getContext('2d'),c=current(),frozen=drag&&c?.id===drag.id?drag:null,ks=(c?.keys||[]).map(k=>frozen&&k.frame===frozen.frame?{...k,value:frozen.value}:k);ctx.clearRect(0,0,560,180);ctx.fillStyle='#9fb2c2';if(!ks.length){ctx.fillText('Save keys to see this channel’s value over time.',12,24);return;}const end=Math.max(1,lastFrame()),lo=frozen?frozen.lo:Math.min(...ks.map(k=>k.value)),hi=frozen?frozen.lo+frozen.span:Math.max(...ks.map(k=>k.value)),span=frozen?frozen.span:(hi-lo||1),x=f=>30+f/end*515,y=v=>145-(v-lo)/span*115;ctx.strokeStyle='#607383';ctx.strokeRect(30,20,515,130);ctx.fillText(lo.toFixed(2),0,158);ctx.fillText(hi.toFixed(2),0,16);ctx.fillText('0',30,176);ctx.fillText(String(end),515,176);ctx.strokeStyle='#2ac5aa';ctx.beginPath();for(let n=0;n<=515;n++){const f=end*n/515,shown={...c,keys:ks,enabled:true},v=sampleScalar([shown],c.id,f,0);n?ctx.lineTo(x(f),y(v)):ctx.moveTo(x(f),y(v));}ctx.stroke();ctx.fillStyle='#f0cc72';for(const k of ks){ctx.beginPath();ctx.arc(x(k.frame),y(k.value),3,0,Math.PI*2);ctx.fill();}}
 graph.onpointerdown=e=>{if(isBusy())return;const c=current();if(!c?.keys?.length)return;const rect=graph.getBoundingClientRect(),px=(e.clientX-rect.left)*(560/rect.width),py=(e.clientY-rect.top)*(180/rect.height),end=Math.max(1,lastFrame()),lo=Math.min(...c.keys.map(k=>k.value)),hi=Math.max(...c.keys.map(k=>k.value)),span=hi-lo||1,x=f=>30+f/end*515,y=v=>145-(v-lo)/span*115;let best=null,dist=12;for(const k of c.keys){const d=Math.hypot(px-x(k.frame),py-y(k.value));if(d<=dist){dist=d;best=k;}}if(!best)return;try{beforeEdit();}catch(err){notify(err.message);return;}drag={id:c.id,frame:best.frame,value:best.value,lo,span};graph.setPointerCapture(e.pointerId);e.preventDefault();};
 graph.onpointermove=e=>{if(!drag||!graph.hasPointerCapture(e.pointerId))return;const rect=graph.getBoundingClientRect(),py=(e.clientY-rect.top)*(180/rect.height),spec=getSpecs().find(s=>s.id===drag.id),c=current(),min=c?.blendTarget!==undefined?0:spec?.min??-1e9,max=c?.blendTarget!==undefined?1:spec?.max??1e9;drag.value=Math.min(max,Math.max(min,drag.lo+(145-py)/115*drag.span));drawGraph();};
 function finishDrag(e){if(!drag||e&&!graph.hasPointerCapture(e.pointerId))return;const {frame,value}=drag;drag=null;try{commit(c=>{c.keys=setChannelKeyValue(c.keys,frame,value);});}catch(err){notify(err.message);drawGraph();}}
 graph.onpointerup=finishDrag;graph.onpointercancel=()=>{drag=null;drawGraph();};
 function refresh(){const id=selected.value,specs=getSpecs();selected.replaceChildren(...specs.map(s=>new Option(s.label,s.id)));if(specs.some(s=>s.id===id))selected.value=id;const spec=specs.find(s=>s.id===selected.value);value.min=current()?.blendTarget===undefined?(spec?.min??0):0;value.max=current()?.blendTarget===undefined?(spec?.max??0):1;const frame=keys.value;keys.replaceChildren(...(current()?.keys||[]).map(k=>new Option('Frame '+k.frame+' · '+k.value,k.frame)));if(current()?.keys.some(k=>String(k.frame)===frame))keys.value=frame;status.textContent=current()?.enabled===false?'Channel disabled. Full-pose animation is used.':current()?.blendTarget!==undefined?'Values are blend weights: 0 uses the underlying animation; 1 reaches target '+current().blendTarget+'.':'Channel overrides this value when it has keys.';ranges.refresh();drawGraph();}
 keys.onchange=loadKey;selected.onchange=()=>{refresh();loadKey();};panel.addEventListener('toggle',()=>{if(panel.open)refresh();});return {refresh};
}
