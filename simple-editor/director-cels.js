export const CEL_KINDS=['key','breakdown','inbetween','smear','impact'];
export function celAt(layer,frame){return [...(layer.cels||[])].sort((a,b)=>a.frame-b.frame).filter(c=>c.frame<=frame).at(-1);}
export function celStrokes(layer,frame){return celAt(layer,frame)?.strokes||layer.strokes;}
export function sampleCels(board,frame){return {...board,layers:board.layers.map(l=>({...l,strokes:celStrokes(l,frame)}))};}
export function validateCels(layer){
 if(layer.cels===undefined)return;
 if(!Array.isArray(layer.cels)||layer.cels.length>240)throw Error('Use at most 240 cels per layer.');
 const frames=new Set();for(const c of layer.cels){if(!c||!Number.isInteger(c.frame)||c.frame<0||c.frame>=86400||frames.has(c.frame)||!CEL_KINDS.includes(c.kind)||!Array.isArray(c.strokes)||!Array.isArray(c.corrections))throw Error('Invalid drawing cel.');frames.add(c.frame);}
}
export function editableStrokes(layer,frame,corrections=false){
 if(layer.locked)throw Error('Unlock the selected layer first.');
 if(!layer.cels?.length&&!corrections)return layer.strokes;
 const cel=layer.cels?.find(c=>c.frame===frame);if(!cel)throw Error('Create a cel at this frame before drawing. Held drawings are not changed implicitly.');
 return corrections?cel.corrections:cel.strokes;
}

/** How many strokes Clear selected layer would remove (0 if locked / no editable target). */
export function clearableEditableStrokeCount(layer, frame = 0, corrections = false) {
 if (!layer || layer.locked) return 0;
 if (!layer.cels?.length && !corrections) return Array.isArray(layer.strokes) ? layer.strokes.length : 0;
 const cel = layer.cels?.find(c => c.frame === frame);
 if (!cel) return 0;
 const strokes = corrections ? cel.corrections : cel.strokes;
 return Array.isArray(strokes) ? strokes.length : 0;
}
export function moveCelFrame(layer,from,to,last){
 if(layer.locked)throw Error('Unlock the layer before moving its hold.');
 const cels=layer.cels;
 if(!cels?.some(cel=>cel.frame===from))throw Error('Choose a cel hold.');
 if(!Number.isInteger(to)||to<0||to>last)throw Error('Keep the hold inside the shot.');
 if(to!==from&&cels.some(cel=>cel.frame===to))throw Error('A cel already starts on that frame.');
 if(to===from)return;
 cels.find(cel=>cel.frame===from).frame=to;
 cels.sort((a,b)=>a.frame-b.frame);
 validateCels(layer);
}
export function createCel(layer,frame,blank=false){
 if(layer.locked)throw Error('Unlock the selected layer first.');
 if(layer.cels?.some(c=>c.frame===frame))throw Error('This frame already has a cel.');
 const strokes=blank?[]:structuredClone(celStrokes(layer,frame));layer.cels??=[];layer.cels.push({frame,kind:'key',strokes,corrections:[]});layer.cels.sort((a,b)=>a.frame-b.frame);validateCels(layer);
}
export function retimeCels(layer,start,end,offset,scale,last){
 if(layer.locked)throw Error('Unlock the selected layer first.');
 if(![start,end,offset,last].every(Number.isInteger)||start<0||end<start||!Number.isFinite(scale)||scale<=0||scale>10)throw Error('Choose a valid range, whole-frame offset and positive speed scale up to 10.');
 const copy=structuredClone(layer),selected=copy.cels?.filter(c=>c.frame>=start&&c.frame<=end)||[];if(!selected.length)throw Error('No cels in that range.');
 for(const c of selected)c.frame=start+offset+Math.round((c.frame-start)*scale);
 if(copy.cels.some(c=>c.frame<0||c.frame>last))throw Error('Retimed cels would fall outside the shot.');validateCels(copy);copy.cels.sort((a,b)=>a.frame-b.frame);return copy.cels;
}
export function inbetweenCel(layer,start){
 if(layer.locked)throw Error('Unlock the selected layer first.');
 const keys=[...(layer.cels||[])].sort((a,b)=>a.frame-b.frame),a=keys.find(c=>c.frame===start),b=keys.find(c=>c.frame>start);
 if(!a||!b||b.frame-a.frame<2)throw Error('Select a cel with a later cel at least two frames away.');
 const frame=Math.floor((a.frame+b.frame)/2),t=(frame-a.frame)/(b.frame-a.frame);
 if(a.strokes.length!==b.strokes.length)throw Error('Assisted inbetween needs matching stroke counts. Draw this breakdown manually.');
 const strokes=a.strokes.map((s,i)=>{const q=b.strokes[i],{points,...style}=s,{points:other,...otherStyle}=q;if(JSON.stringify(style)!==JSON.stringify(otherStyle)||points.length!==other.length)throw Error('Assisted inbetween needs matching tools, styles and point counts. Draw this breakdown manually.');return {...s,points:points.map((p,j)=>p.map((v,k)=>v+(other[j][k]-v)*t))};});
 return {frame,kind:'inbetween',strokes,corrections:[]};
}
// A short effect adds its own return cel without changing existing exposure starts.
export function effectCels(layer,frame,duration,last,options){
 if(layer.locked)throw Error('Unlock the selected layer first.');
 if(![frame,duration,last].every(Number.isInteger)||frame<0||duration<1||duration>24||frame+duration>last)throw Error('Use 1–24 effect frames with room for a return cel inside the shot.');
 if((layer.cels||[]).some(c=>c.frame>=frame&&c.frame<frame+duration))throw Error('Choose an unused frame range; existing drawings are never replaced.');
 const base=structuredClone(celStrokes(layer,frame)),strokes=structuredClone(base);
 if(options.kind==='smear'){
  const {axis,factor}=options;
  if(!['x','y'].includes(axis)||!Number.isFinite(factor)||factor<=1||factor>4)throw Error('Choose a smear axis and a stretch greater than 1, up to 4.');
  if(!strokes.length)throw Error('A smear needs a painted drawing to stretch.');
  let low=Infinity,high=-Infinity;const i=axis==='x'?0:1;
  for(const s of strokes)for(const p of s.points){low=Math.min(low,p[i]);high=Math.max(high,p[i]);}
  if(low===high)throw Error('This drawing has no width along the chosen axis.');
  const center=(low+high)/2;
  for(const s of strokes)for(const p of s.points){p[i]=center+(p[i]-center)*factor;if(p[i]<0||p[i]>(i===0?960:540))throw Error('The smear would leave the canvas. Reduce its stretch or move the drawing inward.');}
 }else if(options.kind==='impact'){
  const {x,y,radius,rays,color,size}=options;
  if(![x,y,radius,size].every(Number.isFinite)||radius<4||radius>250||!Number.isInteger(rays)||rays<4||rays>24||size<1||size>80||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Choose a valid impact center, radius (4–250), rays (4–24), color and line width.');
  if(x-radius<0||x+radius>960||y-radius<0||y+radius>540)throw Error('Keep the impact burst inside the canvas.');
  for(let i=0;i<rays;i++){const angle=i*Math.PI*2/rays,outer=radius*(i%2?.75:1);strokes.push({tool:'line',color,size,points:[.35,1].map(t=>[x+Math.cos(angle)*outer*t,y+Math.sin(angle)*outer*t])});}
 }else throw Error('Choose smear or impact.');
 const cels=structuredClone(layer.cels||[]);
 cels.push({frame,kind:options.kind,strokes,corrections:[]});
 if(!cels.some(c=>c.frame===frame+duration))cels.push({frame:frame+duration,kind:celAt(layer,frame)?.kind||'key',strokes:base,corrections:structuredClone(celAt(layer,frame)?.corrections||[])});
 cels.sort((a,b)=>a.frame-b.frame);validateCels({...layer,cels});return cels;
}

export const ONION_DEPTH_MAX = 5;
/** Clamp onion neighbor depth (1..ONION_DEPTH_MAX). Invalid / missing -> 1 (legacy prev+next). */
export function clampOnionDepth(n){
 const v = Math.round(Number(n));
 if(!Number.isFinite(v))return 1;
 return Math.max(1, Math.min(ONION_DEPTH_MAX, v));
}
/**
 * Neighbor cels for onion skin. previous/next are nearest-first (rank 0 = closest).
 * depth 1 matches the prior single prev + single next behavior.
 */
export function onionNeighborCels(cels, frame, depth=1){
 const d = clampOnionDepth(depth);
 const sorted = [...(cels||[])].filter(c=>c && Number.isInteger(c.frame)).sort((a,b)=>a.frame-b.frame);
 const covering = sorted.filter(c=>c.frame <= frame).at(-1);
 const prevCut = covering?.frame ?? frame;
 const before = sorted.filter(c=>c.frame < prevCut).slice(-d);
 const after = sorted.filter(c=>c.frame > frame).slice(0, d);
 return { previous: before.slice().reverse(), next: after };
}
/** Guide alpha for onion rank (0 = nearest). Nearest stays ~0.25 like the old fixed guide. */
export function onionGuideAlpha(rank, depth=1){
 const d = clampOnionDepth(depth);
 const r = Math.max(0, Math.min(d - 1, Math.floor(Number(rank)) || 0));
 return 0.25 * (1 - r / (d + 0.5));
}
/** Durable drawing onion prefs (guides only; never render into clip/PNG/Assemble). Omit/false = off; omit depth = 1. */
export function drawingWantsOnion(board){return !!board?.onion;}
export function drawingOnionDepth(board){return clampOnionDepth(board?.onionDepth??1);}
export function validateDrawingOnion(board){
 if(!board)return;
 if(board.onion!==undefined&&board.onion!==true&&board.onion!==false)throw Error('Drawing onion must be true or false.');
 if(board.onionDepth!==undefined){
  if(typeof board.onionDepth!=='number'||!Number.isInteger(board.onionDepth)||board.onionDepth<1||board.onionDepth>ONION_DEPTH_MAX)throw Error('Drawing onion depth must be an integer from 1 to '+ONION_DEPTH_MAX+'.');
 }
}
/** Apply onion + onionDepth to a drawing board (omit defaults). */
export function applyDrawingOnionPrefs(board,{onion,onionDepth}={}){
 if(!board)return board;
 if(onion)board.onion=true;else delete board.onion;
 const d=clampOnionDepth(onionDepth??board.onionDepth??1);
 if(d===1)delete board.onionDepth;else board.onionDepth=d;
 return board;
}
/** Durable Draw correction overlay mode (guides only; never render into clip/PNG/Assemble). Omit/false = draw into cel strokes. */
export function drawingWantsCorrectionOverlay(board){return !!board?.correctionOverlay;}
export function validateDrawingCorrectionOverlay(board){
 if(!board)return;
 if(board.correctionOverlay!==undefined&&board.correctionOverlay!==true&&board.correctionOverlay!==false)throw Error('Drawing correction overlay must be true or false.');
}
/** Apply correctionOverlay to a drawing board (omit default off). */
export function applyDrawingCorrectionOverlay(board,on){
 if(!board)return board;
 if(on)board.correctionOverlay=true;else delete board.correctionOverlay;
 return board;
}
export function celControls({host,board,selected,view,lastFrame,commit,validate,repaint,notify,cancel,onCelViewChange}){
 const panel=document.createElement('details');panel.className='settings';const title=document.createElement('summary');title.textContent='Cel timeline · drawings, onion skins & corrections';panel.append(title);host.append(panel);
 const field=(name,type,value)=>{const l=document.createElement('label');l.className='field';l.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;}input.setAttribute('aria-label',name);l.append(input);panel.append(l);return input;};
 const action=(name,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=()=>{try{cancel();fn();}catch(e){notify(e.message);}};panel.append(b);};
 const frame=field('Drawing cel frame','number',view.celFrame||0);frame.min=0;frame.step=1;
 frame.onchange=()=>{cancel();view.celFrame=Math.max(0,Math.min(lastFrame(),Math.round(Number(frame.value)||0)));refresh();repaint();};
 const list=field('Drawing exposure sheet','select','');list.onchange=()=>{cancel();view.celFrame=Number(list.value);refresh();repaint();};
 const kind=field('Drawing mark','select','');for(const k of CEL_KINDS)kind.add(new Option(k,k));
 const onion=field('Show neighboring drawings','checkbox','');
 const onionDepth=field('Onion skin depth (neighbors)','range','1');onionDepth.min=1;onionDepth.max=String(ONION_DEPTH_MAX);onionDepth.step=1;
 const onionDepthHint=document.createElement('p');onionDepthHint.className='hint';onionDepthHint.textContent='When onion skins are on, show this many previous (red) and next (blue) drawings. Depth 1 is the old nearest-only guide; higher values fade farther neighbors. Saved with this shot drawing (like other drawing prefs) so reload keeps your choice.';
 function syncOnionDepthUi(){const on=!!view.onion;onionDepth.parentElement.hidden=!on;onionDepthHint.hidden=!on;const d=clampOnionDepth(view.onionDepth??1);view.onionDepth=d;onionDepth.value=String(d);onionDepth.setAttribute('aria-valuetext',String(d));}
 function syncOnionFromBoard(){const b=board();view.onion=drawingWantsOnion(b);view.onionDepth=drawingOnionDepth(b);onion.checked=!!view.onion;syncOnionDepthUi();}
 function persistOnionPrefs({onion:on,onionDepth:depth}={}){commit(()=>{applyDrawingOnionPrefs(board(),{onion:on??drawingWantsOnion(board()),onionDepth:depth??drawingOnionDepth(board())});validate(board());});}
 onion.onchange=()=>{persistOnionPrefs({onion:!!onion.checked});syncOnionFromBoard();repaint();};
 onionDepth.oninput=()=>{view.onionDepth=clampOnionDepth(onionDepth.value);onionDepth.setAttribute('aria-valuetext',String(view.onionDepth));repaint();};
 onionDepth.onchange=()=>{persistOnionPrefs({onion:drawingWantsOnion(board())||!!view.onion,onionDepth:clampOnionDepth(onionDepth.value)});syncOnionFromBoard();repaint();};
 syncOnionFromBoard();
 panel.append(onionDepthHint);
 const correct=field('Draw correction overlay','checkbox','');
 const correctHint=document.createElement('p');correctHint.className='hint';correctHint.textContent='When on, brush marks go into this cel\u2019s correction overlay (guides only; never into the clip). Saved with this shot\u2019s drawing so reload keeps the mode.';
 function syncCorrectionFromBoard(){view.corrections=drawingWantsCorrectionOverlay(board());correct.checked=!!view.corrections;}
 function persistCorrectionOverlay(on){commit(()=>{applyDrawingCorrectionOverlay(board(),!!on);validate(board());});}
 correct.onchange=()=>{cancel();persistCorrectionOverlay(!!correct.checked);syncCorrectionFromBoard();repaint();};
 syncCorrectionFromBoard();
 panel.append(correctHint);
 function mutate(fn){const copy=structuredClone(board()),layer=copy.layers.find(l=>l.id===selected().id);fn(layer);validate(copy);commit(()=>Object.assign(board(),copy));}
 action('New blank cel',()=>mutate(l=>createCel(l,view.celFrame||0,true)));
 action('Duplicate held drawing into new cel',()=>mutate(l=>createCel(l,view.celFrame||0)));
 action('Mark selected cel',()=>mutate(l=>{if(l.locked)throw Error('Unlock the layer.');const c=l.cels?.find(c=>c.frame===(view.celFrame||0));if(!c)throw Error('Select the start frame of a cel.');c.kind=kind.value;}));
 action('Remove selected cel',()=>mutate(l=>{if(l.locked)throw Error('Unlock the layer.');l.cels=(l.cels||[]).filter(c=>c.frame!==(view.celFrame||0));}));
 action('Suggest matching-stroke inbetween',()=>mutate(l=>{const c=inbetweenCel(l,view.celFrame||0);if(c.frame>lastFrame())throw Error('Inbetween is outside the shot.');l.cels.push(c);l.cels.sort((a,b)=>a.frame-b.frame);notify('Editable inbetween added. Check arcs and volume; Undo restores the original.');}));
 const clearCorrectionsButton=document.createElement('button');clearCorrectionsButton.type='button';clearCorrectionsButton.textContent='Clear this cel’s corrections';function syncClearCorrectionsButton(){if(!clearCorrectionsButton)return;const layer=selected(),f=view.celFrame||0,clearable=clearableEditableStrokeCount(layer,f,true);clearCorrectionsButton.disabled=!clearable;clearCorrectionsButton.title=layer?.locked?'Unlock the layer first.':(clearable?('Clear '+clearable+' correction'+(clearable===1?'':'s')+' on this cel'):'No corrections to clear on this cel');}clearCorrectionsButton.onclick=()=>{try{cancel();const layer=selected(),f=view.celFrame||0,clearable=clearableEditableStrokeCount(layer,f,true);if(!clearable){notify(layer?.locked?'Unlock the layer first.':'No corrections to clear on this cel.');return;}mutate(l=>{editableStrokes(l,f,true).length=0;});}catch(e){notify(e.message);}};panel.append(clearCorrectionsButton);
 const effects=document.createElement('details');effects.className='settings';const effectsTitle=document.createElement('summary');effectsTitle.textContent='Smear & impact · editable drawings';effects.append(effectsTitle);panel.append(effects);
 function effectField(name,type,value){const input=field(name,type,value);effects.append(input.parentElement);return input;}
 const duration=effectField('Effect duration in frames','number',2);duration.min=1;duration.max=24;duration.step=1;
 const axis=effectField('Smear direction','select','');axis.add(new Option('Horizontal','x'));axis.add(new Option('Vertical','y'));
 const factor=effectField('Smear stretch','number',2);factor.min=1.01;factor.max=4;factor.step=.1;
 const x=effectField('Impact center X','number',480),y=effectField('Impact center Y','number',270),radius=effectField('Impact radius','number',80),rays=effectField('Impact rays','number',12),color=effectField('Impact color','color','#f4b942'),size=effectField('Impact line width','number',6);
 const insertEffect=options=>mutate(l=>{l.cels=effectCels(l,view.celFrame||0,Number(duration.value),lastFrame(),options);notify('Editable effect and return drawing added. Review the exposure, then paint or erase to refine it.');});
 action('Add short smear drawing',()=>insertEffect({kind:'smear',axis:axis.value,factor:Number(factor.value)}));effects.append(panel.lastElementChild);
 action('Add short impact burst',()=>insertEffect({kind:'impact',x:Number(x.value),y:Number(y.value),radius:Number(radius.value),rays:Number(rays.value),color:color.value,size:Number(size.value)}));effects.append(panel.lastElementChild);
 const effectNote=document.createElement('p');effectNote.textContent='Choose an unused frame in a held drawing. Effects last 1–24 frames, then restore the held drawing or use an existing cel at the return frame. Smear stretches stroke coordinates on one axis; brush widths stay fixed. Impact adds editable rays; use an empty effects layer for an isolated burst. Paint/erase either result manually. This is drawing assistance, not automatic anatomy or physical simulation.';effects.append(effectNote);
 const start=field('Retime start frame','number',0),end=field('Retime end frame','number',24),offset=field('Retime offset frames','number',0),scale=field('Retime spacing multiplier','number',1);scale.step=.1;
 action('Retime selected layer range',()=>mutate(l=>l.cels=retimeCels(l,Number(start.value),Number(end.value),Number(offset.value),Number(scale.value),lastFrame())));
 const info=document.createElement('p');info.setAttribute('role','status');panel.append(info);
 const note=document.createElement('p');note.textContent='Each drawing holds until the next cel; an empty cel creates a blank hold. Previous drawings are red, next drawings blue (farther neighbors fade when Onion skin depth is above 1). Corrections and onion skins are guides only and never render into the clip. Show neighboring drawings, Onion skin depth, and Draw correction overlay are saved with this drawing. Edit only at a cel’s start frame. New blank cel and Duplicate held drawing make the same cel without assistance. Matching-stroke assistance only adds a cel you can repaint. Use Animate rig playback to preview/export the full shot.';panel.append(note);
 function refresh(){syncOnionFromBoard();syncCorrectionFromBoard();const layer=selected(),f=view.celFrame||0,cel=celAt(layer,f);frame.max=lastFrame();frame.value=f;list.replaceChildren(...[...(layer.cels||[])].sort((a,b)=>a.frame-b.frame).map((c,i,all)=>new Option(`${c.frame}–${(all[i+1]?.frame??(lastFrame()+1))-1} · ${c.kind}`,c.frame)));list.value=String(cel?.frame??'');kind.value=cel?.kind||'key';info.textContent=cel?`Frame ${f}: ${f===cel.frame?'editable cel':'held cel from '+cel.frame} · ${(layer.cels||[]).length}/240 drawings`:'Base drawing · create cels to animate this layer.';syncClearCorrectionsButton();onCelViewChange?.();}
 return {refresh};
}
