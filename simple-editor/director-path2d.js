import {drawingChannelSpecs,validateChannels} from './director-channels.js';

export function setTravelPoint(board,id,frame,x,y,last){
 const layer=board.layers.find(l=>l.id===id);
 if(!layer||layer.locked)throw Error('Select an unlocked layer.');
 if(board.walk)throw Error('Disable procedural walking before editing travel paths.');
 if(!Number.isInteger(frame)||frame<0||frame>last)throw Error('Choose a frame inside the shot.');
 const next=structuredClone(board);next.channels??=[];
 for(const [axis,value] of [['x',x],['y',y]]){
  const channelId=`layer:${id}:${axis}`;let c=next.channels.find(c=>c.id===channelId);
  if(!c){c={id:channelId,keys:[]};next.channels.push(c);}
  if(c.blendTarget!==undefined)throw Error('Remove blended travel channels before using path points.');
  if(c.enabled===false)throw Error('Enable both travel channels before editing the path.');
  const old=c.keys.find(k=>k.frame===frame);c.keys=c.keys.filter(k=>k.frame!==frame);
  c.keys.push({...old,frame,value,easing:old?.easing||'linear',kind:old?.kind||'key'});c.keys.sort((a,b)=>a.frame-b.frame);
 }
 validateChannels(next.channels,drawingChannelSpecs(next));return next;
}

export function travelPathControls({host,board,selected,last,sample,save,notify,isBusy,stop}){
 const panel=document.createElement('details');panel.className='settings';const title=document.createElement('summary');title.textContent='2D travel path · editable points';panel.append(title);host.append(panel);
 const note=document.createElement('p');note.textContent='Travel points edit the selected layer’s X/Y channels in its parent coordinates. These override full-pose travel and hold beyond their first/last keys. New segments are straight; adjust channel timing or add intermediate points to shape an arc. Drag a yellow point or use the numbered fields. This graph is a guide and never records.';panel.append(note);
 function field(label,value){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const input=document.createElement('input');input.type='number';input.value=value;input.setAttribute('aria-label',label);wrap.append(input);panel.append(wrap);return input;}
 const frame=field('Travel point frame',0),x=field('Travel point X',0),y=field('Travel point Y',0);frame.min=0;frame.step=1;x.min=-1920;x.max=1920;y.min=-1080;y.max=1080;
 const list=document.createElement('select');list.setAttribute('aria-label','Saved travel point');panel.append(list);
 const graph=document.createElement('canvas');graph.width=640;graph.height=360;graph.style.width='100%';graph.style.touchAction='none';graph.setAttribute('aria-label','2D travel path graph');panel.append(graph);
 let points=[],mapping=null,drag=null;
 function action(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{if(isBusy())return;try{stop();fn();}catch(e){notify(e.message);}};panel.append(b);}
 function apply(f,px,py){save(setTravelPoint(board(),selected().id,f,px,py,last()));refresh();}
 action('Save travel point',()=>apply(Number(frame.value),Number(x.value),Number(y.value)));
 action('Read travel at this frame',()=>{const f=Number(frame.value);if(!Number.isInteger(f)||f<0||f>last())throw Error('Choose a frame inside the shot.');const r=sample(f);x.value=r.x;y.value=r.y;});
 function load(){const p=points.find(p=>p.frame===Number(list.value));if(p){frame.value=p.frame;x.value=p.x;y.value=p.y;}}
 list.onchange=load;
 function refresh(){if(!panel.open)return;frame.max=last();const id=selected()?.id,channels=board().channels||[],frames=[...new Set(channels.filter(c=>[`layer:${id}:x`,`layer:${id}:y`].includes(c.id)).flatMap(c=>c.keys.map(k=>k.frame)))].filter(f=>f<=last()).sort((a,b)=>a-b);
  points=frames.map(frame=>({frame,...sample(frame)}));const previous=list.value;list.replaceChildren(...points.map(p=>new Option('Frame '+p.frame,p.frame)));if(previous!==''&&frames.includes(Number(previous)))list.value=previous;
  const count=Math.min(last()+1,481),samples=Array.from({length:count},(_,i)=>sample(last()*i/Math.max(1,count-1)));
  const all=[...samples,...points],loX=Math.min(0,...all.map(p=>p.x))-30,hiX=Math.max(0,...all.map(p=>p.x))+30,loY=Math.min(0,...all.map(p=>p.y))-30,hiY=Math.max(0,...all.map(p=>p.y))+30;
  mapping={px:v=>20+(v-loX)/(hiX-loX)*600,py:v=>20+(v-loY)/(hiY-loY)*320,x:v=>loX+(v-20)/600*(hiX-loX),y:v=>loY+(v-20)/320*(hiY-loY)};
  const ctx=graph.getContext('2d');ctx.clearRect(0,0,640,360);ctx.strokeStyle='#6b7f91';ctx.strokeRect(20,20,600,320);ctx.strokeStyle='#2bdab9';ctx.beginPath();samples.forEach((p,i)=>i?ctx.lineTo(mapping.px(p.x),mapping.py(p.y)):ctx.moveTo(mapping.px(p.x),mapping.py(p.y)));ctx.stroke();ctx.fillStyle='#ffd46b';for(const p of points){ctx.beginPath();ctx.arc(mapping.px(p.x),mapping.py(p.y),6,0,Math.PI*2);ctx.fill();ctx.fillText(String(p.frame),mapping.px(p.x)+8,mapping.py(p.y)-8);}
 }
 const pos=e=>{const r=graph.getBoundingClientRect();return [(e.clientX-r.left)*640/r.width,(e.clientY-r.top)*360/r.height];};
 graph.onpointerdown=e=>{if(e.button!==0||isBusy()||!mapping)return;const [px,py]=pos(e),p=points.find(p=>Math.hypot(mapping.px(p.x)-px,mapping.py(p.y)-py)<12);if(!p)return;e.preventDefault();stop();drag={id:e.pointerId,frame:p.frame,layer:selected().id,snapshot:JSON.stringify(board())};graph.setPointerCapture(e.pointerId);frame.value=p.frame;x.value=p.x;y.value=p.y;};
 graph.onpointermove=e=>{if(drag?.id!==e.pointerId)return;const [px,py]=pos(e);x.value=Math.max(-1920,Math.min(1920,Math.round(mapping.x(px))));y.value=Math.max(-1080,Math.min(1080,Math.round(mapping.y(py))));};
 graph.onpointerup=e=>{if(drag?.id!==e.pointerId)return;const d=drag;drag=null;try{if(isBusy()||d.layer!==selected().id||d.snapshot!==JSON.stringify(board()))throw Error('Drawing changed during the drag. Try again.');apply(d.frame,Number(x.value),Number(y.value));}catch(error){notify(error.message);}};
 graph.onpointercancel=()=>drag=null;panel.addEventListener('toggle',refresh);return {refresh};
}


