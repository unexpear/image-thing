import {moveCelFrame} from './director-cels.js';
const PAGE=12;
const lastFrame=shot=>Math.max(0,Math.round(shot.seconds||1)*24-1);
function keySpans(keys,last){
 const sorted=[...(keys||[])].sort((a,b)=>a.frame-b.frame);
 return sorted.filter(key=>key.frame<=last).map((key,index,all)=>({start:key.frame,end:index+1<all.length?all[index+1].frame-1:last,label:String(key.frame)+(key.kind?' '+key.kind:'')+(key.easing==='hold'?' hold':'')}));
}
function celSpans(layer,last){
 const cels=[...(layer.cels||[])].sort((a,b)=>a.frame-b.frame).filter(cel=>cel.frame<=last),spans=[];
 if(!cels.length)return [{start:0,end:last,label:'Base drawing'}];
 if(cels[0].frame>0)spans.push({start:0,end:cels[0].frame-1,label:'Base'});
 for(const [index,cel] of cels.entries())spans.push({start:cel.frame,end:index+1<cels.length?cels[index+1].frame-1:last,label:cel.frame+' '+cel.kind,edit:{from:cel.frame}});
 return spans;
}
function mouthSync(shot){return shot.lipSync?.mouthCues?shot.lipSync:shot.rig3d?.lipSync?.mouthCues?shot.rig3d.lipSync:shot.drawing?.lipSync?.mouthCues?shot.drawing.lipSync:null;}
function mouthSpans(sync,last){
 const spans=[];
 for(const cue of sync?.mouthCues||[]){
  const start=Math.max(0,Math.ceil(cue.start*24-1e-6)),end=Math.min(last,Math.floor(cue.end*24-1e-6));
  if(end>=start)spans.push({start,end,label:cue.value});
 }
 return spans;
}
function soundRows(shot,last){
 const rows=[];
 if(shot.audio)rows.push({name:'Shot audio',spans:[{start:0,end:last,label:shot.audio.name||shot.audio.filename||'Audio'}]});
 for(const track of shot.audioTracks||[]){
  const start=Math.max(0,Math.min(last,Math.round((track.start||0)*24)));
  rows.push({name:'Sound · '+(track.label||track.kind||'track'),spans:[{start,end:last,label:track.kind||'sound'}]});
 }
 if(!rows.length)rows.push({name:'Sound',spans:[]});
 return rows;
}
function cameraSpans(rig,last){
 const keys=[...(rig?.cameraKeys||[])].sort((a,b)=>a.frame-b.frame).filter(key=>key.frame<=last);
 if(!keys.length)return rig?.camera?[{start:0,end:last,label:'Saved view'}]:[];
 const spans=[];
 if(keys[0].frame>0&&rig.camera)spans.push({start:0,end:keys[0].frame-1,label:'Saved view'});
 keys.forEach((key,index)=>{
  const start=index===0&&!rig.camera?0:key.frame,end=index+1<keys.length?keys[index+1].frame-1:last;
  if(start<=end)spans.push({start,end,label:(!key.easing||key.easing==='hold'?'Hold ':'')+key.frame+(key.easing&&key.easing!=='hold'?' '+key.easing:'')});
 });
 return spans;
}
export function exposureTracks(shot){
 const last=lastFrame(shot),layers=shot.drawing?.layers||[],tracks=[];
 if(!layers.length)tracks.push({name:'Drawings',spans:[]});
 for(const layer of layers)tracks.push({name:layer.name||'Layer',id:layer.id,kind:'cel',spans:celSpans(layer,last)});
 tracks.push({name:'Body',spans:keySpans(shot.rig3d?.keys,last)},{name:'Face',spans:keySpans(shot.rig3d?.faceKeys,last)},{name:'Mouth',spans:mouthSpans(mouthSync(shot),last)},...soundRows(shot,last),{name:'Camera',spans:cameraSpans(shot.rig3d,last)});
 return {last,tracks};
}
export function exposureCells(tracks,frame,last,pageSize=PAGE){
 const playhead=Math.max(0,Math.min(last,Math.round(frame)||0)),start=Math.floor(playhead/pageSize)*pageSize,end=Math.min(last,start+pageSize-1);
 return {start,end,frame:playhead,columns:Array.from({length:end-start+1},(_,index)=>start+index),rows:tracks.map(track=>({name:track.name,id:track.id,kind:track.kind,cells:Array.from({length:end-start+1},(_,index)=>{
  const f=start+index,span=track.spans.find(item=>f>=item.start&&f<=item.end);
  return {frame:f,hold:!!span,label:span&&f===Math.max(span.start,start)?span.label:'',edit:span&&f===span.start?span.edit:undefined};
 })}))};
}
export function exposureControls(card,shot,{change}){
 const panel=document.createElement('details');panel.className='settings exposure-sheet';panel.dataset.shotId=shot.id;
 const summary=document.createElement('summary');summary.textContent='Exposure sheet';panel.append(summary);
 const note=document.createElement('p');note.textContent='One grid for this shot. Drawing holds, body and face keys, mouth cues, sound and camera keys share the frame ruler. A hold is the span until the next item on that row. Change a drawing hold’s start here; that number is the hold boundary. Ones, twos and threes are the Exposure setting in timing and animation craft. Body, face, mouth, sound and camera stay edited in their own controls. The highlighted column is the playhead.';panel.append(note);
 const tools=document.createElement('div');tools.className='exposure-tools';
 const frameLabel=document.createElement('label');frameLabel.textContent='Playhead frame';const frameInput=document.createElement('input');frameInput.type='number';frameInput.min=0;frameInput.step=1;frameInput.value=0;frameInput.setAttribute('aria-label','Exposure playhead');frameLabel.append(frameInput);
 const earlier=document.createElement('button');earlier.type='button';earlier.textContent='Earlier frames';const later=document.createElement('button');later.type='button';later.textContent='Later frames';
 const status=document.createElement('p');status.setAttribute('role','status');tools.append(frameLabel,earlier,later);panel.append(tools,status);
 const scroller=document.createElement('div');scroller.className='exposure-scroll';const table=document.createElement('table');table.className='exposure-grid';scroller.append(table);panel.append(scroller);card.append(panel);
 let frame=0;
 function paint(){
  const model=exposureTracks(shot),view=exposureCells(model.tracks,frame,model.last);
  frame=view.frame;frameInput.max=model.last;frameInput.value=frame;status.textContent='Playhead frame '+frame+' of '+model.last+'.';
  table.replaceChildren();
  const caption=document.createElement('caption');caption.textContent='Shot exposure';table.append(caption);
  const head=document.createElement('thead'),headRow=document.createElement('tr'),corner=document.createElement('th');corner.textContent='Track';headRow.append(corner);
  for(const column of view.columns){const cell=document.createElement('th');cell.textContent=String(column);cell.scope='col';if(column===frame)cell.className='is-playhead';headRow.append(cell);}
  head.append(headRow);table.append(head);
  const body=document.createElement('tbody');
  for(const [rowIndex,row] of view.rows.entries()){
   const tr=document.createElement('tr'),label=document.createElement('th');label.textContent=row.name;label.scope='row';tr.append(label);
   row.cells.forEach((cell,index)=>{
    const td=document.createElement('td');
    if(cell.hold)td.classList.add('exposure-hold',row.kind==='cel'?'is-cel':'is-key');
    if(cell.label)td.classList.add('exposure-start');
    if(cell.frame===frame)td.classList.add('is-playhead');
    if(cell.label)td.append(document.createTextNode(cell.label));
    if(cell.edit){const input=document.createElement('input');input.type='number';input.min=0;input.max=model.last;input.step=1;input.value=cell.edit.from;input.setAttribute('aria-label','Hold start for '+row.name);input.onchange=()=>{const layer=shot.drawing?.layers?.find(item=>item.id===row.id),next=Math.round(Number(input.value));try{moveCelFrame(structuredClone(layer),cell.edit.from,next,model.last);}catch(error){status.textContent=error.message;paint();return;}change(()=>moveCelFrame(layer,cell.edit.from,next,model.last),{redraw:false});if(!panel.isConnected)return;card.dispatchEvent(new CustomEvent('director-drawing-refresh',{bubbles:true}));paint();};td.append(input);}
    tr.append(td);
   });
   if(!rowIndex)tr.dataset.exposure='first';
   body.append(tr);
  }
  table.append(body);
 }
 frameInput.onchange=()=>{frame=Number(frameInput.value);paint();};
 earlier.onclick=()=>{frame=Math.max(0,exposureCells(exposureTracks(shot).tracks,frame,lastFrame(shot)).start-PAGE);paint();};
 later.onclick=()=>{frame=Math.min(lastFrame(shot),exposureCells(exposureTracks(shot).tracks,frame,lastFrame(shot)).start+PAGE);paint();};
 card.addEventListener('director-frame',event=>{if(event.detail?.shotId!==shot.id)return;frame=event.detail.frame;if(panel.open)paint();});
 card.addEventListener('director-exposure',()=>{if(panel.open)paint();});
 panel.ontoggle=()=>{if(panel.open)paint();};
}
