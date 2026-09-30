import {validateCels,celAt,celStrokes,sampleCels,editableStrokes,clearableEditableStrokeCount,celControls,clampOnionDepth,onionNeighborCels,onionGuideAlpha,validateDrawingOnion,drawingWantsOnion,drawingOnionDepth,validateDrawingCorrectionOverlay,drawingWantsCorrectionOverlay} from './director-cels.js';
import {validateArtStroke,paintArtStroke,paintValueCheck,validateStrokePoint,strokeUsesPressure,paintPressureStroke,pointXY,clampStabilizer,stabilizeStep,stabilizeCatchUp,clampOpacityFloor} from './director-art-tools.js';
import {validateRigs,layerMatrix,localPoint,createRigControls} from './director-rig.js';
import {validateMotion,createMotionControls} from './director-motion.js';
import {pictureNote} from './director-planning-state.js';
export const BOARD_WIDTH=960,BOARD_HEIGHT=540,MAX_LAYERS=12,MAX_POINTS=20000,MAX_STROKES=1000;
export const LAYER_BLENDS={'source-over':'Normal','multiply':'Multiply · shadow','screen':'Screen · light','overlay':'Overlay · contrast','soft-light':'Soft light · finishing'};
export const newLayer=name=>({id:crypto.randomUUID(),name,visible:true,locked:false,opacity:1,strokes:[]});
export const newDrawing=()=>({version:1,layers:[newLayer('Sketch')]});
/** Gate for Remove selected layer (keep-one / locked / child-parent). */
export function drawingLayerRemoveGate(board, layer){
 if(!board||!Array.isArray(board.layers)||!layer)return{ok:false,reason:'No layer selected.'};
 if(!board.layers.some(l=>l.id===layer.id))return{ok:false,reason:'That layer is no longer on this drawing.'};
 if(board.layers.length<=1)return{ok:false,reason:'Keep at least one layer. You can clear it instead.'};
 if(layer.locked)return{ok:false,reason:'Unlock the layer first.'};
 if(board.layers.some(l=>l.rig?.parent===layer.id))return{ok:false,reason:'Set the child layers to another parent or None before removing this part.'};
 return{ok:true,reason:'Remove this layer. Undo restores.'};
}
/** Gate for Add layer / Duplicate layer (cap at MAX_LAYERS). */
export function drawingLayerAddGate(board){
 if(!board||!Array.isArray(board.layers))return{ok:false,reason:'No drawing loaded.'};
 if(board.layers.length>=MAX_LAYERS)return{ok:false,reason:'This drawing already has '+MAX_LAYERS+' layers.'};
 return{ok:true,reason:'Add or duplicate a layer (up to '+MAX_LAYERS+').'};
}
/** Gate for Detach drawing from joint / Moves-with-joint None (needs a parented layer). */
export function drawingDetachFromJointGate(layer){
 if(!layer)return{ok:false,reason:'Choose a drawing layer. Paint it under Draw storyboard first.'};
 if(typeof layer.joint!=='string'||!layer.joint.trim())return{ok:false,reason:'This layer is already in screen space (not parented to a joint).'};
 return{ok:true,reason:'Detach from '+layer.joint+'. Undo can parent it again.'};
}
/** Gate for Parent drawing to joint / Moves-with-joint attach (needs a layer + joint). */
export function drawingParentToJointGate(layer, jointName){
 if(!layer)return{ok:false,reason:'Choose a drawing layer. Paint it under Draw storyboard first.'};
 if(typeof jointName!=='string'||!jointName.trim())return{ok:false,reason:'Choose a joint that is in this view.'};
 return{ok:true,reason:'Parent '+(layer.name||'layer')+' to '+jointName.trim()+'. Undo restores the previous drawing.'};
}
export function validateDrawing(board){
 if(board===undefined)return;
 if(!board||board.version!==1||!Array.isArray(board.layers)||board.layers.length<1||board.layers.length>MAX_LAYERS)throw Error('A drawing needs 1–12 layers.');
 if(board.over3d!==undefined&&typeof board.over3d!=='boolean')throw Error('Invalid 3D drawing-pass setting.');
 if(board.sceneColorMsaa!==undefined){
  const n=Math.floor(Number(board.sceneColorMsaa));
  if(!Number.isFinite(n)||![0,2,4,8].includes(n))throw Error('Invalid Overlay/Soft-light MSAA sample count (use 0, 2, 4, or 8).');
 }
 validateDrawingOnion(board);
 validateDrawingCorrectionOverlay(board);
 const ids=new Set();let points=0,strokes=0;
 for(const layer of board.layers){
  if(!layer||typeof layer.id!=='string'||!layer.id||ids.has(layer.id)||typeof layer.name!=='string'||typeof layer.visible!=='boolean'||typeof layer.locked!=='boolean'||!Number.isFinite(layer.opacity)||layer.opacity<0||layer.opacity>1||!Array.isArray(layer.strokes))throw Error('Invalid drawing layer.');
  if(layer.blend!==undefined&&!Object.hasOwn(LAYER_BLENDS,layer.blend))throw Error('Invalid layer blend mode.');
  if(layer.ink!==undefined&&typeof layer.ink!=='boolean')throw Error('Invalid ink-pass setting.');
  if(layer.joint!==undefined&&(typeof layer.joint!=='string'||!layer.joint.trim()||layer.joint.length>200))throw Error('Invalid drawing joint.');
  if(layer.jointAnchor!==undefined&&(!Array.isArray(layer.jointAnchor)||layer.jointAnchor.length!==2||layer.jointAnchor.some(n=>!Number.isFinite(n)||Math.abs(n)>1e6)))throw Error('Invalid drawing joint anchor.');
  if(layer.placement!==undefined&&layer.placement!=='billboard'&&layer.placement!=='conform'&&layer.placement!=='decal'&&layer.placement!=='joint-bounds')throw Error('Invalid drawing card placement.');
  ids.add(layer.id);validateCels(layer);const allStrokes=[...layer.strokes,...(layer.cels||[]).flatMap(c=>[...c.strokes,...c.corrections])];strokes+=allStrokes.length;
  for(const s of allStrokes){
   if(!s||!['brush','eraser','line','rectangle','ellipse'].includes(s.tool)||!/^#[0-9a-f]{6}$/i.test(s.color)||!Number.isFinite(s.size)||s.size<1||s.size>80||!Array.isArray(s.points)||!s.points.length||(s.filled!==undefined&&typeof s.filled!=='boolean'))throw Error('Invalid drawing stroke.');
   if(['line','rectangle','ellipse'].includes(s.tool)&&s.points.length!==2)throw Error('Shapes need a start and end point.');
   validateArtStroke(s);points+=s.points.length;
   for(const p of s.points)if(!validateStrokePoint(p,BOARD_WIDTH,BOARD_HEIGHT))throw Error('Invalid drawing coordinates.');
  }
 }
 if(points>(board.layers.some(l=>l.cels?.length)?200000:MAX_POINTS)||strokes>(board.layers.some(l=>l.cels?.length)?10000:MAX_STROKES))throw Error('Drawing limit reached. Save a PNG or simplify this shot before adding more strokes.');
 validateRigs(board.layers);
 validateMotion(board);
}
function paintStroke(ctx,s){
 if(paintArtStroke(ctx,s))return;
 ctx.globalCompositeOperation=s.tool==='eraser'?'destination-out':'source-over';ctx.strokeStyle=s.color;ctx.fillStyle=s.color;ctx.lineWidth=s.size;ctx.lineCap='round';ctx.lineJoin='round';
 if(['line','rectangle','ellipse'].includes(s.tool)){
  const a=pointXY(s.points[0]),b=pointXY(s.points[1]),x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(b[0]-a[0]),h=Math.abs(b[1]-a[1]);ctx.beginPath();
  if(s.tool==='line'){ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
  else{if(s.tool==='rectangle')ctx.rect(x,y,w,h);else ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);if(s.filled)ctx.fill();else ctx.stroke();}
  return;
 }
 if(strokeUsesPressure(s)&&(s.tool==='brush'||s.tool==='eraser')){
  paintPressureStroke(ctx,s);
  return;
 }
 const p0=pointXY(s.points[0]);
 ctx.beginPath();ctx.arc(p0[0],p0[1],s.size/2,0,Math.PI*2);ctx.fill();
 if(s.points.length>1){ctx.beginPath();ctx.moveTo(...p0);for(const p of s.points.slice(1))ctx.lineTo(...pointXY(p));ctx.stroke();}
}
// Erasure takes place on each transparent layer before compositing onto paper.
export function paintDrawing(canvas,board,draft=null,scratch=document.createElement('canvas'),transparent=false,background=null,options={}){
 canvas.width=BOARD_WIDTH;canvas.height=BOARD_HEIGHT;scratch.width=BOARD_WIDTH;scratch.height=BOARD_HEIGHT;
 const ctx=canvas.getContext('2d'),layerCtx=scratch.getContext('2d');if(background)ctx.drawImage(background,0,0,BOARD_WIDTH,BOARD_HEIGHT);else if(!transparent){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);}
 for(const layer of board.layers){
  if(!layer.visible||(options.skipInk&&layer.ink))continue;if(options.skipSceneColorBlends&&(layer.blend==='overlay'||layer.blend==='soft-light'))continue;if(options.skipLive3dPlacements&&layer.joint&&layer.placement!=='billboard')continue;
  layerCtx.clearRect(0,0,BOARD_WIDTH,BOARD_HEIGHT);for(const stroke of layer.strokes)paintStroke(layerCtx,stroke);
  if(draft&&draft.layerId===layer.id)paintStroke(layerCtx,draft.stroke);
  const place=options.places?.[layer.id];
  ctx.save();if(layer.joint&&place&&layer.jointAnchor)ctx.translate(place[0]-layer.jointAnchor[0],place[1]-layer.jointAnchor[1]);ctx.transform(...layerMatrix(board.layers,layer));ctx.globalAlpha=layer.opacity;ctx.globalCompositeOperation=layer.blend||'source-over';ctx.drawImage(scratch,0,0);ctx.restore();
 }
 ctx.globalAlpha=1;
}
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const jointProjectors=new Map();
export function setJointProjector(shotId,fn){if(fn)jointProjectors.set(shotId,fn);else jointProjectors.delete(shotId);}
export function projectJoint(shotId,name){return jointProjectors.get(shotId)?.(name)??null;}
export function drawingControls(card,shot,{change,button,tell,upload,isCurrent,undo,redo,canUndo,canRedo,view}){
 const panel=el('details',null,'drawing-controls settings');panel.dataset.shotId=shot.id;panel.append(el('summary','Draw storyboard · layers'));
 panel.append(el('p','960 × 540 storyboard canvas. Drawings and layers are kept in your project backup. Save drawing as shot image to update the animatic; later brush edits need saving again.','hint'));
 const body=el('div');panel.append(body);card.append(panel);
 let canvas,scratch,list,status,undoButton,redoButton,saveButton,addLayerButton,duplicateLayerButton,clearLayerButton,removeLayerButton,viewport,rigUI=null,motionUI=null,celUI=null,pan=null,draft=null,pointer=null,raf=0,initialized=false,busy=false;
 view.tool??='brush';view.color??='#1a2335';view.size??=6;view.zoom??=1;view.filled??=false;view.art??='ink';view.strength??=1;view.pressureWidth??=true;view.pressureOpacity??=true;view.stabilizer??=0;view.opacityFloor??=0;
 const empty=newDrawing();
 const board=()=>shot.drawing||empty;
 // Durable onion + correction-overlay prefs on the drawing (like over3d); hydrate session view once per session map entry.
 if(view.onion===undefined)view.onion=drawingWantsOnion(board());
 if(view.onionDepth===undefined)view.onionDepth=drawingOnionDepth(board());
 if(view.corrections===undefined)view.corrections=drawingWantsCorrectionOverlay(board());
 const selected=()=>board()?.layers.find(l=>l.id===view.layer)||board()?.layers.at(-1);
 const notify=text=>{if(status)status.textContent=text;tell(text);};
 function repaint(){if(canvas&&panel.open){paintDrawing(canvas,sampleCels(board(),view.celFrame||0),view.corrections?null:draft,scratch,false,null,{skipInk:!!view.hideInk});
   const layer=selected(),f=view.celFrame||0,overlay=document.createElement('canvas');
   function guide(strokes,color,alpha){const layers=board().layers.map(l=>({...l,blend:'source-over',visible:l.id===layer.id,strokes:l.id===layer.id?strokes:[]}));paintDrawing(overlay,{...board(),layers},null,scratch,true);const ctx=overlay.getContext('2d');if(color){ctx.globalCompositeOperation='source-in';ctx.fillStyle=color;ctx.fillRect(0,0,960,540);}const out=canvas.getContext('2d');out.save();out.globalAlpha=alpha;out.drawImage(overlay,0,0);out.restore();}
   if(view.onion){const depth=clampOnionDepth(view.onionDepth??1);const {previous,next}=onionNeighborCels(layer.cels,f,depth);for(let i=previous.length-1;i>=0;i--)guide(previous[i].strokes,'#dc4650',onionGuideAlpha(i,depth));for(let i=next.length-1;i>=0;i--)guide(next[i].strokes,'#328dcc',onionGuideAlpha(i,depth));}
   if(view.corrections){const c=celAt(layer,f);guide([...(c?.corrections||[]),...(draft?[draft.stroke]:[])],null,.8);}if(view.valueCheck)paintValueCheck(canvas);rigUI?.drawJoint(canvas);}}
 function syncClearLayerButton(){if(!clearLayerButton)return;const layer=selected(),f=view.celFrame||0,corr=!!view.corrections,clearable=clearableEditableStrokeCount(layer,f,corr);clearLayerButton.disabled=!clearable;clearLayerButton.title=layer.locked?'Unlock the layer first.':(clearable?('Clear '+clearable+(corr?' correction':' stroke')+(clearable===1?'':'s')+(corr?' on this cel':'')):(corr?'No corrections to clear on this cel':'Nothing to clear on this layer'));}
 function syncRemoveLayerButton(){if(!removeLayerButton)return;const gate=drawingLayerRemoveGate(board(),selected());removeLayerButton.disabled=!gate.ok;removeLayerButton.title=gate.reason||'';}
 function syncAddLayerButtons(){if(!addLayerButton&&!duplicateLayerButton)return;const gate=drawingLayerAddGate(board());if(addLayerButton){addLayerButton.disabled=!gate.ok;addLayerButton.title=gate.ok?'Add a layer (up to '+MAX_LAYERS+').':(gate.reason||'');}if(duplicateLayerButton){duplicateLayerButton.disabled=!gate.ok;duplicateLayerButton.title=gate.ok?'Duplicate the selected layer (up to '+MAX_LAYERS+').':(gate.reason||'');}}
 function refresh(){
  if(!initialized)return;view.layer=selected().id;list.replaceChildren();
  for(const layer of [...board().layers].reverse()){
   const row=el('div',null,'drawing-layer');row.classList.toggle('selected',layer.id===view.layer);
   const select=button(layer.name||'Unnamed layer',()=>{view.layer=layer.id;refresh();});select.setAttribute('aria-pressed',String(layer.id===view.layer));row.append(select);
   for(const [key,label] of [['visible','Visible'],['locked','Locked'],['ink','Ink']]){const l=el('label',label),input=el('input');input.type='checkbox';input.checked=!!layer[key];input.setAttribute('aria-label',label+' '+layer.name);input.onchange=()=>commit(()=>layer[key]=input.checked);l.prepend(input);row.append(l);}list.append(row);
  }
  const active=selected();body.querySelector('[data-control=name]').value=active.name;body.querySelector('[data-control=opacity]').value=Math.round(active.opacity*100);
  const followSelect=body.querySelector('[data-control=joint]');if(followSelect){const names=shot.rig3d?.names||[];followSelect.replaceChildren(new Option('None · screen',''));for(const name of names)followSelect.add(new Option(name,name));if(active.joint&&!names.includes(active.joint))followSelect.add(new Option(active.joint,active.joint));followSelect.value=active.joint||'';const detachGate=drawingDetachFromJointGate(active);followSelect.title=detachGate.ok?(detachGate.reason||''):('Already in screen space. Choose a joint to parent.');}
  body.querySelector('[data-control=blend]').value=active.blend||'source-over';
  const placeSelect=body.querySelector('[data-control=placement]');if(placeSelect){placeSelect.value=active.placement||'joint-bounds';placeSelect.disabled=!active.joint;}
  undoButton.disabled=!canUndo();redoButton.disabled=!canRedo();syncClearLayerButton();syncRemoveLayerButton();syncAddLayerButtons();rigUI?.update();motionUI?.update();celUI?.refresh();repaint();
 }
 function commit(fn){change(()=>{shot.drawing??=empty;fn();},{redraw:false});panel.dispatchEvent(new CustomEvent('director-exposure',{bubbles:true}));if(isCurrent()&&panel.isConnected)refresh();}
 function cancelDraft(){draft=null;pan=null;pointer=null;cancelAnimationFrame(raf);repaint();}
 function finish(e){
  if(!draft||e.pointerId!==pointer)return;
  const saved=draft;draft=null;pointer=null;cancelAnimationFrame(raf);
  if(!isCurrent()||!panel.isConnected)return;
  commit(()=>{editableStrokes(selected(),view.celFrame||0,!!view.corrections).push(saved.stroke);validateDrawing(board());});
 }
 async function saveImage(){
  if(busy)return;busy=true;saveButton.disabled=true;const snapshot=JSON.stringify(board());
  try{
   const output=document.createElement('canvas');paintDrawing(output,sampleCels(board(),view.celFrame||0));
   const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not create the storyboard PNG.');
   const file=await upload(new File([blob],'storyboard-'+crypto.randomUUID()+'.png',{type:'image/png'}));
   if(!isCurrent()||JSON.stringify(board())!==snapshot)throw Error('The drawing or selected project changed while saving. Save again to attach the intended drawing.');
   change(()=>{shot.drawing??=empty;shot.media=file;});tell('Drawing saved as the shot image. Its editable layers remain in the project.'+pictureNote(shot));
  }catch(e){notify(e.message);}finally{busy=false;saveButton.disabled=false;}
 }
 function init(){
  if(initialized)return;
  if(!isCurrent())return;initialized=true;
  const toolbar=el('div',null,'drawing-toolbar');
  function control(label,input){const l=el('label',label,'field');input.setAttribute('aria-label',label);l.append(input);toolbar.append(l);return input;}
  const tool=control('Drawing tool',el('select'));for(const name of ['brush','eraser','line','rectangle','ellipse','pan','pivot','ik'])tool.add(new Option(name==='ik'?'Position limb':name,name));tool.value=view.tool;tool.onchange=()=>{view.tool=tool.value;canvas.style.cursor=view.tool==='pan'?'grab':'crosshair';};
  const color=control('Brush color',el('input'));color.type='color';color.value=view.color;color.oninput=()=>view.color=color.value;
  const size=control('Brush size',el('input'));size.type='range';size.min=1;size.max=80;size.value=view.size;size.oninput=()=>view.size=Number(size.value);
  const pressureWidth=control('Tablet pressure controls width',el('input'));pressureWidth.type='checkbox';pressureWidth.checked=!!view.pressureWidth;pressureWidth.onchange=()=>view.pressureWidth=pressureWidth.checked;
  const pressureOpacity=control('Tablet pressure controls opacity',el('input'));pressureOpacity.type='checkbox';pressureOpacity.checked=!!view.pressureOpacity;pressureOpacity.onchange=()=>view.pressureOpacity=pressureOpacity.checked;
  const opacityFloor=control('Minimum opacity (%)',el('input'));opacityFloor.type='range';opacityFloor.min=0;opacityFloor.max=90;opacityFloor.step=5;opacityFloor.value=Math.round(clampOpacityFloor(view.opacityFloor)*100);opacityFloor.title='When Tablet pressure controls opacity is on, light stylus force fades only down to this percent of Mark strength (0 = full fade to invisible; default). Stored on each stroke so replay matches.';opacityFloor.oninput=()=>view.opacityFloor=Number(opacityFloor.value)/100;
  const stabilizer=control('Stroke stabilizer',el('input'));stabilizer.type='range';stabilizer.min=0;stabilizer.max=100;stabilizer.step=5;stabilizer.value=Math.round(clampStabilizer(view.stabilizer)*100);stabilizer.title='0 = raw pointer. Higher values lag the brush behind the tip (lazy mouse) for smoother freehand lines. Shapes stay exact.';stabilizer.oninput=()=>view.stabilizer=Number(stabilizer.value)/100;
  const finishMode=control('Brush finish',el('select'));for(const [value,label] of [['ink','Solid ink'],['taper','Tapered ink'],['detail','Fine selective detail'],['shadow','Shadow · inside painted area'],['highlight','Highlight · inside painted area']])finishMode.add(new Option(label,value));finishMode.value=view.art;
  finishMode.onchange=()=>{view.art=finishMode.value;if(view.art==='shadow'){view.color='#26354d';view.strength=.3;}else if(view.art==='highlight'){view.color='#fff0ca';view.strength=.45;}else view.strength=1;color.value=view.color;strength.value=view.strength*100;};
  const strength=control('Mark strength (%)',el('input'));strength.type='range';strength.min=5;strength.max=100;strength.value=view.strength*100;strength.oninput=()=>view.strength=Number(strength.value)/100;
  const values=control('Check light and dark values',el('input'));values.type='checkbox';values.checked=!!view.valueCheck;values.onchange=()=>{view.valueCheck=values.checked;repaint();};
  const fill=control('Shape style',el('select'));fill.add(new Option('Outline','outline'));fill.add(new Option('Filled','filled'));fill.value=view.filled?'filled':'outline';fill.onchange=()=>view.filled=fill.value==='filled';
  const zoom=control('Canvas zoom',el('select'));for(const [label,value] of [['Fit',1],['150%',1.5],['200%',2],['300%',3]])zoom.add(new Option(label,String(value)));zoom.value=String(view.zoom);zoom.onchange=()=>{view.zoom=Number(zoom.value);canvas.style.width=(view.zoom*100)+'%';viewport.scrollTo(0,0);};
  const actions=el('div',null,'actions');undoButton=button('Undo last edit',undo);redoButton=button('Redo last edit',redo);actions.append(undoButton,redoButton);
  viewport=el('div',null,'drawing-viewport');canvas=el('canvas');canvas.className='storyboard-canvas';canvas.setAttribute('aria-label','Storyboard drawing canvas');canvas.tabIndex=0;canvas.style.width=(view.zoom*100)+'%';canvas.style.cursor=view.tool==='pan'?'grab':'crosshair';scratch=el('canvas');viewport.append(canvas);
  canvas.onkeydown=e=>{if(e.key==='Escape'){cancelDraft();e.preventDefault();}};
  canvas.onpointerdown=e=>{
   if(e.button!==0||draft||pan||busy)return;
   if(view.tool==='pan'){e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointer=e.pointerId;pan={x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};return;}
   const layer=selected();
   try{editableStrokes(layer,view.celFrame||0,!!view.corrections);}catch(e){notify(e.message);return;}
   if(!layer.visible||layer.locked){notify('Select a visible, unlocked layer to draw.');return;}
   if(view.tool==='pivot'){e.preventDefault();rigUI.pick(point(e));return;}
   if(view.tool==='ik'){e.preventDefault();const r=canvas.getBoundingClientRect();rigUI.position([(e.clientX-r.left)/r.width*BOARD_WIDTH,(e.clientY-r.top)/r.height*BOARD_HEIGHT]);return;}
   const count=board().layers.reduce((n,l)=>n+celStrokes(l,view.celFrame||0).reduce((m,s)=>m+s.points.length,0),0);
   const shape=['line','rectangle','ellipse'].includes(view.tool);
   if(count+(shape?2:1)>MAX_POINTS||board().layers.reduce((n,l)=>n+l.strokes.length,0)>=MAX_STROKES){notify('Drawing limit reached. Save a PNG or clear an unused layer.');return;}
   e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointer=e.pointerId;
   const brushLike=view.tool==='brush'||view.tool==='eraser';const useP=!shape&&(view.pressureWidth||view.pressureOpacity)&&brushLike;const stroke={tool:view.tool,art:view.art,strength:view.strength,color:view.color,size:view.size,filled:view.filled,points:shape?[point(e),point(e)]:[point(e,useP)]};if(!shape&&brushLike&&view.pressureOpacity)stroke.pressureOpacity=true;if(!shape&&brushLike&&!view.pressureWidth&&view.pressureOpacity)stroke.pressureWidth=false;if(!shape&&brushLike&&view.pressureOpacity){const fl=clampOpacityFloor(view.opacityFloor);if(fl>0)stroke.opacityFloor=fl;}draft={layerId:layer.id,remaining:Math.min(2000,MAX_POINTS-count),stroke};if(!shape&&brushLike){const first=stroke.points[0];draft.stab={x:first[0],y:first[1]};}repaint();
  };
  function stylusPressure(e){
   if(!view.pressureWidth&&!view.pressureOpacity)return undefined;
   // Mouse / touch keep full Brush size and opacity (Pointer Events report a constant mid pressure).
   if(e.pointerType==='mouse'||e.pointerType==='touch')return 1;
   const raw=Number(e.pressure);
   if(!Number.isFinite(raw)||raw<=0)return 0.05;
   return Math.round(Math.min(1,Math.max(0.05,raw))*1000)/1000;
  }
  function point(e,withPressure=false){
   const r=canvas.getBoundingClientRect(),p=localPoint(layerMatrix(board().layers,selected()),[(e.clientX-r.left)/r.width*BOARD_WIDTH,(e.clientY-r.top)/r.height*BOARD_HEIGHT]);
   const xy=[Math.round(Math.max(0,Math.min(BOARD_WIDTH,p[0]))*10)/10,Math.round(Math.max(0,Math.min(BOARD_HEIGHT,p[1]))*10)/10];
   if(!withPressure)return xy;
   const pr=stylusPressure(e);
   return pr===undefined?xy:[xy[0],xy[1],pr];
  }
  function appendBrushPoint(ev){
   const useP=(view.pressureWidth||view.pressureOpacity)&&(draft.stroke.tool==='brush'||draft.stroke.tool==='eraser');
   const tip=point(ev,useP),points=draft.stroke.points,last=points.at(-1);
   const strength=clampStabilizer(view.stabilizer);
   const p=strength>0&&draft.stab ? stabilizeStep(draft.stab, tip, strength) : tip;
   if(Math.hypot(p[0]-last[0],p[1]-last[1])<1.5){
    // Update pressure on a near-stationary tip so force changes still register.
    if(useP&&tip.length===3&&last.length===3&&tip[2]!==last[2])last[2]=tip[2];
    return false;
   }
   if(points.length>=draft.remaining){status.textContent='Stroke limit reached. Lift the pointer to begin a new stroke.';return false;}
   points.push(p);return true;
  }
  canvas.onpointermove=e=>{if(e.pointerId!==pointer)return;if(pan){viewport.scrollLeft=pan.left+pan.x-e.clientX;viewport.scrollTop=pan.top+pan.y-e.clientY;return;}if(!draft)return;let changed=false;if(['line','rectangle','ellipse'].includes(draft.stroke.tool)){draft.stroke.points[1]=point(e);changed=true;}else{const events=(typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():null);const batch=(events&&events.length)?events:[e];for(const ev of batch){if(appendBrushPoint(ev))changed=true;}}if(changed){cancelAnimationFrame(raf);raf=requestAnimationFrame(repaint);}};
  canvas.onpointerup=e=>{canvas.onpointermove(e);if(pan)cancelDraft();else{if(draft?.stab&&clampStabilizer(view.stabilizer)>0&&(draft.stroke.tool==='brush'||draft.stroke.tool==='eraser')){const useP=(view.pressureWidth||view.pressureOpacity);const tip=point(e,useP);const room=Math.max(0,draft.remaining-draft.stroke.points.length);const extra=stabilizeCatchUp(draft.stab,tip,view.stabilizer,Math.min(24,room));for(const p of extra){if(draft.stroke.points.length>=draft.remaining)break;const last=draft.stroke.points.at(-1);if(last&&Math.hypot(p[0]-last[0],p[1]-last[1])<0.25){if(p.length===3&&last.length===3)last[2]=p[2];continue;}draft.stroke.points.push(p);}}finish(e);}};canvas.onpointercancel=cancelDraft;canvas.onlostpointercapture=cancelDraft;
  list=el('div',null,'drawing-layers');
  const layerTools=el('div',null,'drawing-toolbar');
  const nameLabel=el('label','Layer name','field'),name=el('input');name.dataset.control='name';name.onchange=()=>commit(()=>selected().name=name.value);nameLabel.append(name);
  const opacityLabel=el('label','Layer opacity (%)','field'),opacity=el('input');opacity.dataset.control='opacity';opacity.type='number';opacity.min=0;opacity.max=100;opacity.step=1;opacity.onchange=()=>{const value=Number(opacity.value);if(!Number.isFinite(value)||value<0||value>100){notify('Opacity must be between 0 and 100.');refresh();return;}commit(()=>selected().opacity=value/100);};opacityLabel.append(opacity);layerTools.append(nameLabel,opacityLabel);
  const blendLabel=el('label','Layer blending','field'),blend=el('select');blend.dataset.control='blend';blend.setAttribute('aria-label','Layer blending');for(const [value,label] of Object.entries(LAYER_BLENDS))blend.add(new Option(label,value));blend.onchange=()=>{if(selected().locked){notify('Unlock the layer before changing its blending.');refresh();return;}commit(()=>selected().blend=blend.value);};blendLabel.append(blend);layerTools.append(blendLabel);
  const followLabel=el('label','Moves with joint','field'),follow=el('select');follow.dataset.control='joint';follow.setAttribute('aria-label','Moves with joint');follow.onchange=()=>{const name=follow.value;if(!name){const gate=drawingDetachFromJointGate(selected());if(!gate.ok){notify(gate.reason||'Already in screen space.');refresh();return;}commit(()=>{delete selected().joint;delete selected().jointAnchor;delete selected().placement;});notify('This layer stays in screen space.');return;}const parentGate=drawingParentToJointGate(selected(),name);if(!parentGate.ok){notify(parentGate.reason||'Choose a drawing layer and joint.');refresh();return;}const point=projectJoint(shot.id,name);if(!point){notify('Open the 3D character view, then choose the joint again so this drawing locks to where that joint is now.');refresh();return;}commit(()=>{selected().joint=name;selected().jointAnchor=point;});notify(selected().name+' follows '+name+' as a depth-tested card in the 3D preview, the recording, and Download animated GLB. Billboard is the screen slide. Conform bends with nearby bones. Decal sticks to the surface.');};followLabel.append(follow);layerTools.append(followLabel);
  const placeLabel=el('label','GLB card style','field'),place=el('select');place.dataset.control='placement';place.setAttribute('aria-label','GLB card style');
  place.add(new Option('Mesh-aware flat (default)','joint-bounds'));place.add(new Option('Billboard (screen FOV)','billboard'));place.add(new Option('Conform (bends with nearby bones)','conform'));place.add(new Option('Decal (projects onto mesh)','decal'));
  place.onchange=()=>{if(!selected().joint){notify('Parent this layer to a joint first.');refresh();return;}const v=place.value;commit(()=>{if(v==='joint-bounds')delete selected().placement;else selected().placement=v;});panel.dispatchEvent(new CustomEvent('director-drawing-changed',{bubbles:true,detail:{shotId:shot.id,reason:'placement'}}));notify(v==='decal'?selected().name+' uses a live 3D mesh-projected decal in the Director viewport (and Download animated GLB): host triangles + bone weights; adaptive card→mesh raycast UVs clipped to a fitted Bezier contour (on hyperbolic in-cell iso densify) of the drawing alpha (stroke/ink) with edge remesh; planar host-tri fallback is ink-clipped too.':v==='conform'?selected().name+' uses a live 3D skinned conforming card in the Director viewport (and Download animated GLB): multi-bone weights; bends with the mesh.':v==='billboard'?selected().name+' stays a screen slide in the viewport and exports as a screen-sized card.':selected().name+' is a depth-tested card on the joint in the viewport, the recording, and Download animated GLB.');};
  placeLabel.append(place);layerTools.append(placeLabel);
  layerTools.append(el('p','Blend this layer with everything below it. Multiply darkens; Screen lightens; Overlay and Soft light adjust contrast. Download animated GLB maps Multiply → MultiplyBlending, Screen → true CustomBlending (ONE/ONE_MINUS_SRC_COLOR), and Overlay/Soft light → custom MeshBasicMaterial shaders (Director auto scene-color multipass binds the real scene; no manual bind). glTF only keeps alphaMode=BLEND + opacity; extras store the Draw blend name — external viewers show Normal alpha blend. Mark a layer as Ink to keep linework as its own pass: Hide ink pass previews color without those layers and is not saved. Visible ink is included in saved images, playback and recording. Choose Moves with joint while the 3D view is open to parent this layer to a bone. Screen space stays the default. A parented layer is a depth-tested card on that joint in the 3D preview, the recording, and Download animated GLB. Billboard keeps the screen slide. Choose GLB card style · Conform for a multi-bone skinned planar card, or Decal to project onto nearby host mesh triangles with host bone weights (adaptive card→mesh ray density when samples hit; fitted Bezier contour (on hyperbolic in-cell iso densify) clip + edge remesh so thin strokes stay hard without texel stair-steps (not soft AABB/MS edges); planar host-tri fallback ink-clipped; not a host UV atlas). Mesh-aware, Conform, and Decal show as that card in the Director viewport. A screen-space layer exports as a camera-facing overlay plane on the Shot camera in Download animated GLB. Onion skins and correction marks stay guides. Use layer opacity for strength. Blend modes use Three.js materials as noted under Layer blending; glTF portability limits apply (extras only for Overlay/Screen/Soft light/Multiply). Animate it with the opacity property under 2D independent channels (0 transparent, 1 opaque); its keys override this working value during playback. White paper is part of the background; paint a base color below light effects.','hint'));
  const hideInk=el('label','Hide ink pass'),hideInkInput=el('input');hideInkInput.type='checkbox';hideInkInput.checked=!!view.hideInk;hideInkInput.setAttribute('aria-label','Hide ink pass');hideInkInput.onchange=()=>{view.hideInk=hideInkInput.checked;repaint();};hideInk.prepend(hideInkInput);layerTools.append(hideInk);
  const layerActions=el('div',null,'actions');
  addLayerButton=button('Add layer',()=>{const gate=drawingLayerAddGate(board());if(!gate.ok){notify(gate.reason||'Cannot add another layer.');syncAddLayerButtons();return;}commit(()=>{const layer=newLayer('Layer '+(board().layers.length+1));board().layers.push(layer);view.layer=layer.id;});});
  duplicateLayerButton=button('Duplicate layer',()=>{const gate=drawingLayerAddGate(board());if(!gate.ok){notify(gate.reason||'Cannot duplicate this layer.');syncAddLayerButtons();return;}const copy=structuredClone(selected());copy.id=crypto.randomUUID();copy.name+=' (copy)';const candidate=structuredClone(board());candidate.layers.push(copy);try{validateDrawing(candidate);}catch(e){notify(e.message);return;}commit(()=>{board().layers.splice(board().layers.indexOf(selected())+1,0,copy);view.layer=copy.id;});});
  layerActions.append(addLayerButton,duplicateLayerButton);syncAddLayerButtons();
  for(const [label,delta] of [['Raise layer',1],['Lower layer',-1]])layerActions.append(button(label,()=>commit(()=>{const layers=board().layers,i=layers.indexOf(selected()),j=i+delta;if(j>=0&&j<layers.length)[layers[i],layers[j]]=[layers[j],layers[i]];})));
  clearLayerButton=button('Clear selected layer',()=>{const layer=selected(),f=view.celFrame||0,corr=!!view.corrections;if(layer.locked){notify('Unlock the layer first.');return;}const clearable=clearableEditableStrokeCount(layer,f,corr);if(!clearable){notify(corr?'No corrections to clear on this cel.':'Nothing to clear on this layer.');return;}commit(()=>editableStrokes(layer,f,corr).length=0);});removeLayerButton=button('Remove selected layer',()=>{const gate=drawingLayerRemoveGate(board(),selected());if(!gate.ok){notify(gate.reason||'Cannot remove this layer.');syncRemoveLayerButton();return;}commit(()=>{const id=selected().id;board().channels=board().channels?.filter(c=>!c.id.startsWith(`layer:${id}:`));board().layers.splice(board().layers.indexOf(selected()),1);for(const key of board().keyframes||[])key.poses=key.poses.filter(p=>p.id!==id);});});layerActions.append(clearLayerButton,removeLayerButton);syncRemoveLayerButton();
  saveButton=button('Save drawing as shot image',saveImage);status=el('p','Layers are listed topmost first. Brush and eraser affect only the selected layer.','hint');status.setAttribute('role','status');
  rigUI=createRigControls({board,selected,commit,button,notify,view,repaint,setTool:value=>{view.tool=value;tool.value=value;canvas.style.cursor='crosshair';}});
  motionUI=createMotionControls({board,selected,shot,commit,change,button,notify,upload,isCurrent,paint:paintDrawing,view});
  celUI=celControls({host:body,board,selected,view,lastFrame:()=>shot.seconds*24-1,commit,validate:validateDrawing,repaint,notify,cancel:cancelDraft,onCelViewChange:syncClearLayerButton});
  body.append(toolbar,actions,el('p','Brush finishes work with the brush tool. Shade or highlight existing paint on the same layer; use fine detail sparingly for seams, scratches and reflected edges. Tablet pressure controls width and Tablet pressure controls opacity scale brush and eraser size and paint/erase strength from stylus force (both on by default; mouse and finger stay at full Brush size and opacity; tapered/detail finishes still multiply). Untick either box to disable that channel; opacity-only strokes keep full width. Soft pressure fades keep the intended opacity where round segments overlap (max-opacity within the stroke, not flow pile-up). Minimum opacity (%) floors light stylus fades when opacity pressure is on (0 = full fade; stored on the stroke). Stroke stabilizer (0-100, default off) lags freehand brush/eraser behind the tip for smoother lines; line/rectangle/ellipse stay exact. Value check is preview only. Zoom for detail, then use the pan tool to drag the view. Escape cancels the current mark. View zoom does not change the saved image.','hint'),viewport,list,layerTools,layerActions,rigUI.panel,motionUI.panel,saveButton,status);panel.parentElement?.addEventListener('director-drawing-refresh',()=>{if(initialized&&panel.isConnected)refresh();});refresh();
 }
 panel.ontoggle=()=>{if(panel.open){init();repaint();}else cancelDraft();};
}

