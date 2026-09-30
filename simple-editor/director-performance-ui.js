import {roomControls} from './director-room.js';
import {handPoseControls} from './director-hands.js';
import {keyPropGrip} from './director-grip-target.js';
import * as THREE from 'three';
import {characterSetup,addBlink,sampleFace,performanceScrubTracks,PERFORMANCE_SCRUB_LANE_GROUPS,defaultPerformanceScrubLanes,normalizePerformanceScrubLanes,performanceScrubLanesAllOn,filterPerformanceScrubTracks} from './director-performance-state.js';
import {validateContactChains,attachmentEvent} from './director-performance-engine.js';
import {keyRangeControls} from './director-animation-craft.js';
import {EYE_ROLES,draftEyeBlink,draftGaze} from './director-facial-acting.js';
import {sampleChannel} from './director-3d-state.js';
import {makeRigAsset,instantiateRigAsset} from './director-rig-library.js';
export function performanceControls({host,getRig,getRuntime,getFrame,lastFrame,edit,notify,draw,previewFrame,working,loadSetup,busy,getSetups=()=>[],saveSetup,getSetKits=()=>[],saveSetKit,getLibraryProps=()=>[],embedSetKitMeshes,focus='all'}){
 const panel=document.createElement('details');panel.className='settings';panel.dataset.toolStage=focus==='face'?'face':focus==='body'?'body':'shared';const summary=document.createElement('summary');summary.textContent=focus==='face'?'Face · expressions, blinks and gaze':focus==='body'?'Body · props, contacts and acting':'Character continuity · props, contacts & acting';panel.append(summary);host.append(panel);
 const note=document.createElement('p');note.textContent=focus==='face'?'Expressions, blinks and gaze write ordinary facial keys or face-channel keys. Props and contacts stay on Body. Edit the resulting keys to correct a helper.':focus==='body'?'Saved props follow their chosen joint. Contact holds lock a hand or foot over an inclusive frame range. Facial keys, blinks and gaze stay on Face.':'Saved props follow their chosen joint. Contact holds lock a hand or foot in place over an inclusive frame range. Facial keys run separately from body keys; mouth cues override mapped mouth shapes. All settings stay in the project.';panel.append(note);
 let part='body';
 function field(name,type='text',value=''){const label=document.createElement('label');label.className='field';label.dataset.toolPart=part;label.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;}input.setAttribute('aria-label',name);label.append(input);panel.append(label);return input;}
 function action(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.dataset.toolPart=part;b.onclick=async()=>{if(busy())return;try{await fn();}catch(e){notify(e.message);}};panel.append(b);return b;}
 function keep(node){node.dataset.toolPart=part;panel.append(node);return node;}
 const propSelect=field('Saved stage prop','select'),propName=field('Prop name','text','Held prop'),shape=field('Prop shape','select');for(const s of ['box','sphere','cylinder'])shape.add(new Option(s,s));
 const importedOption=new Option('Imported mesh · original materials','mesh');importedOption.disabled=true;shape.add(importedOption);
 const parent=field('Prop attachment','select'),color=field('Prop color','color','#e7a44d');
 const vectors=(name,defaults)=>['X','Y','Z'].map((axis,i)=>{const f=field(name+' '+axis,'number',defaults[i]);f.step=.05;return f;});
 const position=vectors('Prop local position',[0,0,0]),rotation=vectors('Prop local rotation',[0,0,0]),size=vectors('Prop size',[.2,.2,.2]);
 const values=fields=>fields.map(f=>Number(f.value));
 function showProp(){const p=getRig().props?.find(p=>p.id===propSelect.value);if(!p)return;propName.value=p.name;shape.value=p.shape;color.value=p.color;parent.value=p.joint===null?'world':String(p.joint);[position,rotation,size].forEach((fs,i)=>fs.forEach((f,j)=>f.value=p[['position','rotation','size'][i]][j]));}
 propSelect.onchange=showProp;
 function prop(id){return {id,name:propName.value.trim(),shape:shape.value,color:color.value,joint:parent.value==='world'?null:Number(parent.value),position:values(position),rotation:values(rotation),size:values(size)};}
 action('Add persistent prop',()=>{if(shape.value==='mesh')throw Error('Use Import static prop GLB to add another mesh, or select a primitive shape.');edit(r=>{r.props??=[];r.props.push(prop(crypto.randomUUID()));});});
 action('Update selected prop',()=>edit(r=>{const i=r.props?.findIndex(p=>p.id===propSelect.value);if(i===undefined||i<0)throw Error('Select a prop first.');const saved=r.props[i],updated=prop(propSelect.value);if(saved.shape==='mesh'&&updated.shape!=='mesh')throw Error('Keep the imported mesh shape, or remove this prop and add a primitive.');r.props[i]={...saved,...updated};}));
 action('Remove selected prop',()=>edit(r=>r.props=(r.props||[]).filter(p=>p.id!==propSelect.value)));
 const appearanceNote=document.createElement('p');appearanceNote.className='hint';appearanceNote.textContent='Creation timing: select a prop and choose the 3D animation frame above. A timed prop is hidden before that frame and remains afterward. Working pose shows all props for editing. Library setups clear shot appearance timing; later shots retain the object unless you remove it.';keep(appearanceNote);
 action('Make selected prop appear at this frame',()=>{const frame=getFrame();if(!Number.isInteger(frame)||frame<0||frame>lastFrame())throw Error('Choose a frame inside the shot.');edit(r=>{const p=r.props?.find(p=>p.id===propSelect.value);if(!p)throw Error('Select a prop first.');p.firstFrame=frame;});previewFrame();notify('Prop appears from frame '+frame+' and remains afterward. Scrub earlier to check its creation.');});
 action('Keep selected prop present from start',()=>{edit(r=>{const p=r.props?.find(p=>p.id===propSelect.value);if(!p)throw Error('Select a prop first.');delete p.firstFrame;});previewFrame();notify('Prop is present throughout this shot.');});
 {const before=panel.childElementCount;const roomUI=roomControls({host:panel,getRig,edit,busy,notify,getSetKits,saveSetKit,getLibraryProps,embedSetKitMeshes});for(const node of [...panel.children].slice(before))node.dataset.toolPart=part;panel._roomKitRefresh=roomUI?.refresh;}
 const attachmentKeys=field('Saved prop attachment event','select');
 action('Switch attachment at this frame · keep position',()=>{const id=propSelect.value;if(!id)throw Error('Select a prop first.');const joint=parent.value==='world'?null:Number(parent.value);previewFrame();const {root,bones}=getRuntime(),key=attachmentEvent(root,bones,id,joint,getFrame());edit(r=>{const p=r.props.find(p=>p.id===id);p.attachments=[...(p.attachments||[]).filter(k=>k.frame!==key.frame),key].sort((a,b)=>a.frame-b.frame);});});
 action('Remove selected attachment event',()=>edit(r=>{const p=r.props?.find(p=>p.id===propSelect.value);if(p)p.attachments=(p.attachments||[]).filter(k=>k.frame!==Number(attachmentKeys.value));}));
 const attachmentNote=document.createElement('p');attachmentNote.textContent='Choose a saved prop and a new Prop attachment, then switch at the current frame. Its displayed position is kept. Stage releases it; a joint carries it. Events hold until the next switch and can be scrubbed backwards. Move the hand to the prop before pickup. This does not create reaching motion or gravity. Updating the base prop leaves events intact.';keep(attachmentNote);
 const gripPanel=document.createElement('details');gripPanel.className='settings';gripPanel.dataset.toolPart=part;const gripTitle=document.createElement('summary');gripTitle.textContent='Grip target · align hand to prop';gripPanel.append(gripTitle);panel.append(gripPanel);
 const gripNote=document.createElement('p');gripNote.textContent='Choose a saved stage prop and the hand in 3D joint. Specify the wrist position and rotation in the prop’s local coordinates. Align saves an arm pose key and attachment event together, keeping the prop in place at this frame. Review neighboring frames: inserting a key changes interpolation. Fingers remain separately editable; no collision fitting is performed.';gripPanel.append(gripNote);
 const gripPosition=vectors('Grip wrist position',[0,0,0]),gripRotation=vectors('Grip wrist rotation',[0,0,0]);for(const input of [...gripPosition,...gripRotation])gripPanel.append(input.parentElement);
 gripPanel.append(action('Align hand and key pickup',()=>{const runtime=getRuntime(),next=keyPropGrip({...runtime,rig:getRig(),frame:getFrame(),lastFrame:lastFrame(),propId:propSelect.value,position:values(gripPosition),rotation:values(gripRotation)});edit(r=>Object.assign(r,next));previewFrame();notify('Hand aligned and pickup keyed. Prop position preserved at this frame; review approach, grip and later attachment events.');}));
 const originalShowProp=showProp;propSelect.onchange=()=>{originalShowProp();refreshAttachments();};
 function refreshAttachments(){const p=getRig().props?.find(p=>p.id===propSelect.value);options(attachmentKeys,(p?.attachments||[]).map(k=>['Frame '+k.frame+' · '+(k.joint===null?'Stage':getRig().names[k.joint]),k.frame]));}
 const contactEnd=field('Contact end frame','number',24);contactEnd.min=0;contactEnd.max=86399;contactEnd.step=1;
 const contacts=field('Saved contact hold','select');
 action('Pin selected hand / foot here',()=>{draw();const {root,bones,joint}=getRuntime();root.updateMatrixWorld(true);const c={id:crypto.randomUUID(),joint,start:getFrame(),end:Number(contactEnd.value),target:bones[joint].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[joint].getWorldQuaternion(new THREE.Quaternion()).toArray()};if(c.end>lastFrame())throw Error('The contact extends beyond the shot.');validateContactChains(bones,[...(getRig().contacts||[]),c]);edit(r=>{r.contacts??=[];r.contacts.push(c);});});
 action('Remove selected contact hold',()=>edit(r=>r.contacts=(r.contacts||[]).filter(c=>c.id!==contacts.value)));
 const contactNote=document.createElement('p');contactNote.textContent='Select a hand/foot using 3D joint above. Pin the displayed pose; scrub the range to check reach. Contacts do not move the body automatically. An unreachable hold blocks export rather than silently sliding.';keep(contactNote);
 part='face';
 const expressionName=field('Expression name'),expression=field('Saved facial expression','select'),strength=field('Expression blend amount','number',1);strength.min=0;strength.max=1;strength.step=.1;
 function requireFace(){if(!getRuntime().morphs.length)throw Error('This character has no facial shapes. Import a GLB with facial morph targets; the block starter has none.');}
 action('Save working facial expression',()=>{requireFace();edit(r=>{r.face??=getRuntime().morphs.map(c=>c.base);r.expressions=(r.expressions||[]).filter(p=>p.name!==expressionName.value.trim());r.expressions.push({name:expressionName.value.trim(),face:[...r.face]});});});
 action('Blend expression into working face',()=>{requireFace();const p=getRig().expressions?.find(p=>p.name===expression.value),amount=Number(strength.value);if(!p||!Number.isFinite(amount)||amount<0||amount>1)throw Error('Choose an expression and a blend amount from 0 to 1.');working();edit(r=>r.face=p.face.map((v,i)=>(r.face?.[i]??getRuntime().morphs[i].base)*(1-amount)+v*amount));});
 action('Remove selected expression',()=>edit(r=>r.expressions=(r.expressions||[]).filter(p=>p.name!==expression.value)));
 const facialKeys=field('Facial key','select');
 action('Save facial key only',()=>{requireFace();edit(r=>{r.face??=getRuntime().morphs.map(c=>c.base);const previous=r.faceKeys?.find(k=>k.frame===getFrame());r.faceKeys=(r.faceKeys||[]).filter(k=>k.frame!==getFrame());r.faceKeys.push({...previous,frame:getFrame(),easing:previous?.easing||'smooth',face:[...r.face]});r.faceKeys.sort((a,b)=>a.frame-b.frame);});});
 action('Load selected facial key',()=>{const key=getRig().faceKeys?.find(k=>k.frame===Number(facialKeys.value));if(!key)throw Error('Select a facial key.');working();edit(r=>r.face=[...key.face]);});
 action('Remove selected facial key',()=>edit(r=>r.faceKeys=(r.faceKeys||[]).filter(k=>k.frame!==Number(facialKeys.value))));
 const faceTiming=(()=>{const before=panel.childElementCount;const control=keyRangeControls({host:panel,label:'Facial',getKeys:()=>getRig().faceKeys||[],getFrame,lastFrame,isBusy:busy,notify,save:keys=>edit(r=>r.faceKeys=keys)});for(const node of [...panel.children].slice(before))node.dataset.toolPart=part;return control;})();
 const eyelid=field('Blink shape control','select');
 action('Add editable six-frame blink',()=>{requireFace();const index=Number(eyelid.value);if(Object.values(getRig().mouthMap||{}).includes(index))throw Error('Choose an eyelid shape that is not mapped to a mouth cue.');edit(r=>{r.face??=getRuntime().morphs.map(c=>c.base);addBlink(r,getFrame(),index,lastFrame());});});
 const faceNote=document.createElement('p');faceNote.textContent='The six-frame blink is three facial keys. Set the face and use Save facial key only at this frame, two frames later, and six frames later. The button only writes those keys.';keep(faceNote);
 const eyePanel=document.createElement('details');eyePanel.className='settings';eyePanel.dataset.toolPart=part;const eyeSummary=document.createElement('summary');eyeSummary.textContent='Eye acting · gaze, blinks & asymmetry';eyePanel.append(eyeSummary);panel.append(eyePanel);
 const eyeNote=document.createElement('p');eyeNote.textContent='Map shapes explicitly: 0 is neutral and 1 is fully closed or looking in the named direction. Independent eyelid blinks blend over the existing face and return to it. Gaze uses directional shapes, not a physical target in the scene. Missing eye shapes must be authored in the model. The same blink and gaze are face-channel keys: set the value and use Save 3D channel key at playhead. Edit that key to correct a helper.';eyePanel.append(eyeNote);
 function eyeField(name,type,value){const input=field(name,type,value);eyePanel.append(input.parentElement);return input;}
 function eyeAction(name,fn){eyePanel.append(action(name,fn));}
 const roleNames={blinkLeft:'Left eyelid',blinkRight:'Right eyelid',lookLeft:'Look left',lookRight:'Look right',lookUp:'Look up',lookDown:'Look down'},eyeMaps=Object.fromEntries(EYE_ROLES.map(role=>[role,eyeField(roleNames[role]+' shape','select')]));
 eyeAction('Save eye shape mapping',()=>{requireFace();edit(r=>{r.face??=getRuntime().morphs.map(c=>c.base);r.eyeMap=Object.fromEntries(EYE_ROLES.map(role=>[role,eyeMaps[role].value===''?null:Number(eyeMaps[role].value)]));});});
 const blinkSide=eyeField('Blink eyes','select');for(const s of ['both','left','right'])blinkSide.add(new Option(s,s));
 const blinkClose=eyeField('Blink closing frames','number',2),blinkHold=eyeField('Blink closed frames','number',1),blinkOpen=eyeField('Blink opening frames','number',4),blinkLag=eyeField('Right eye delay frames','number',0),blinkStrength=eyeField('Blink strength','number',1);
 for(const f of [blinkClose,blinkHold,blinkOpen,blinkLag]){f.min=f===blinkHold||f===blinkLag?0:1;f.step=1;}blinkStrength.min=0;blinkStrength.max=1;blinkStrength.step=.05;
 eyeAction('Add editable eyelid-only blink',()=>{requireFace();const next=draftEyeBlink(getRig(),{start:getFrame(),close:Number(blinkClose.value),hold:Number(blinkHold.value),open:Number(blinkOpen.value),lag:Number(blinkLag.value),strength:Number(blinkStrength.value),lastFrame:lastFrame(),side:blinkSide.value});edit(r=>Object.assign(r,next));});
 const gazeX=eyeField('Gaze horizontal (-1 left, 1 right)','number',0),gazeY=eyeField('Gaze vertical (-1 down, 1 up)','number',0),gazeFrames=eyeField('Gaze shift frames','number',4);for(const f of [gazeX,gazeY]){f.min=-1;f.max=1;f.step=.1;}gazeFrames.min=1;gazeFrames.step=1;
 eyeAction('Add editable gaze shift',()=>{requireFace();const r=getRig(),f=getFrame(),face=sampleChannel(r,f,'face',getRuntime().morphs.map(c=>c.base)),next=draftGaze(r,{start:f,duration:Number(gazeFrames.value),x:Number(gazeX.value),y:Number(gazeY.value),lastFrame:lastFrame(),face});edit(r=>Object.assign(r,next));});
 const editNote=document.createElement('p');editNote.textContent='Scrub the 3D timeline to review. Adjust individual keys and curves under independent channels. Eyelid values there are blend weights (0 keeps the underlying face; 1 closes the lid). Existing incompatible channels and overlapping gestures are left unchanged.';eyePanel.append(editNote);
 part='body';
 action('Download reusable character setup',()=>{const data=characterSetup(getRig()),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='studio-character.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
 const setup=field('Load reusable character setup','file');setup.accept='.json';setup.onchange=async()=>{if(busy()||!setup.files[0])return;try{const f=setup.files[0];if(f.size>4*1024*1024)throw Error('Character setup must be under 4 MB.');const data=JSON.parse(await f.text());if(data.format!=='studio-character'||data.version!==1)throw Error('Choose a Studio character setup JSON.');await loadSetup(data.rig);}catch(e){notify(e.message);}finally{setup.value='';}};
 const reuseNote=document.createElement('p');reuseNote.textContent='Character setup keeps the model reference, working pose, props and expression library. It starts without shot animation or contact holds. For moving to another computer, also back up the project media. Loading replaces this shot’s rig; project Undo restores it.';keep(reuseNote);
 const libraryName=field('Rig library entry name'),libraryKind=field('Rig library entry type','select');libraryKind.append(new Option('Character','character'),new Option('Cast / stage setup','set'));
 const libraryChoice=field('Project rig library','select');
 action('Save working rig to project library',()=>{if(!saveSetup)throw Error('Project library is unavailable.');if(getSetups().length>=32)throw Error('Keep at most 32 rig setups in one project.');saveSetup(makeRigAsset(getRig(),libraryName.value,libraryKind.value));notify('Rig setup saved in the project library. Other shots can load an independent copy.');});
 action('Replace shot rig from project library',async()=>{const asset=getSetups().find(a=>a.id===libraryChoice.value);if(!asset)throw Error('Choose a rig library entry first.');await loadSetup(instantiateRigAsset(asset));});
 const libraryNote=document.createElement('p');libraryNote.textContent='Saves the whole current character or cast, including working pose, props, named poses and expressions. Shot animation, contact holds and prop switching events are cleared. Each loaded shot is independent; library changes do not overwrite it. Use Back up project + all media to move the saved models too.';keep(libraryNote);
 function options(select,items){const old=select.value;select.replaceChildren(...items.map(([text,value])=>new Option(text,value)));if(items.some(([,v])=>String(v)===old))select.value=old;}
 function refresh(){const r=getRig();if(!r)return;options(parent,[['Stage (unattached)','world'],...r.names.map((n,i)=>[n,i])]);options(propSelect,(r.props||[]).map(p=>[p.name+(p.firstFrame>0?' · appears at '+p.firstFrame:''),p.id]));options(contacts,(r.contacts||[]).map(c=>[r.names[c.joint]+' · '+c.start+'–'+c.end,c.id]));options(expression,(r.expressions||[]).map(p=>[p.name,p.name]));options(facialKeys,(r.faceKeys||[]).map(k=>['Face frame '+k.frame,k.frame]));options(eyelid,getRuntime().morphs.map((c,i)=>[c.name,i]));faceTiming.refresh();}
 const refreshBase=refresh;
 const hands=(()=>{const before=panel.childElementCount;const control=handPoseControls({host:panel,getRig,getRuntime,getFrame,lastFrame,edit,working,busy,notify});for(const node of [...panel.children].slice(before))node.dataset.toolPart='body';return control;})();
 if(focus==='body'||focus==='face'){const drop=focus==='body'?'face':'body';for(const node of [...panel.querySelectorAll(`[data-tool-part="${drop}"]`)])node.remove();}
 return {refresh:()=>{refreshBase();refreshAttachments();hands.refresh();options(libraryChoice,getSetups().map(a=>[a.name,a.id]));panel._roomKitRefresh?.();const r=getRig();for(const role of EYE_ROLES){options(eyeMaps[role],[['Not mapped',''],...getRuntime().morphs.map((c,i)=>[c.name,i])]);eyeMaps[role].value=r.eyeMap?.[role]===null||r.eyeMap?.[role]===undefined?'':String(r.eyeMap[role]);}}};
}

export function performanceScrubStrip({host,getRig,getFrame,lastFrame,seek,busy=()=>false,insertAfter=null,getLanes=null,setLanes=null}){
 const box=document.createElement('div');box.className='performance-scrub-strip';box.dataset.toolStage='shared';box.setAttribute('role','group');box.setAttribute('aria-label','Performance camera, contact, attachment, weight, face, expression, eye and mouth tracks');
 const note=document.createElement('p');note.className='hint';note.textContent='Camera keys, contacts, prop attachments, body-travel weight, face keys, expression keys, eye tracks, and mouth cues on one scrub strip (Camera / Body / Face). Use Show lanes to hide dense groups; All restores every group. Click a span, mark, or empty lane to jump the 3D playhead. Lane filter saves with the shot (Undo restores).';
 const filterBar=document.createElement('div');filterBar.className='performance-scrub-filter';filterBar.setAttribute('role','group');filterBar.setAttribute('aria-label','Show performance scrub lanes');
 const filterLabel=document.createElement('span');filterLabel.className='performance-scrub-filter-label';filterLabel.textContent='Show lanes';
 const chipHost=document.createElement('div');chipHost.className='performance-scrub-filter-chips';
 filterBar.append(filterLabel,chipHost);
 const lanes=document.createElement('div');lanes.className='performance-scrub-lanes';
 const empty=document.createElement('p');empty.className='hint performance-scrub-empty';empty.textContent='No camera keys, contacts, attachments, body-travel weight, face/expression keys, eye tracks, or mouth cues yet.';
 const status=document.createElement('p');status.className='hint';status.setAttribute('role','status');
 box.append(note,filterBar,lanes,empty,status);
 if(insertAfter?.parentNode)insertAfter.insertAdjacentElement('afterend',box);else host.append(box);
 const chipButtons=new Map();
 function readLanes(){
  if(typeof getLanes==='function')return normalizePerformanceScrubLanes(getLanes());
  return defaultPerformanceScrubLanes();
 }
 function writeLanes(next){
  if(typeof setLanes==='function')setLanes(normalizePerformanceScrubLanes(next));
 }
 function syncChips(){
  const cur=readLanes(),allOn=performanceScrubLanesAllOn(cur);
  const allBtn=chipButtons.get('__all__');
  if(allBtn){allBtn.setAttribute('aria-pressed',allOn?'true':'false');allBtn.classList.toggle('is-on',allOn);}
  for(const g of PERFORMANCE_SCRUB_LANE_GROUPS){
   const btn=chipButtons.get(g.id);if(!btn)continue;
   const on=!!cur[g.id];
   btn.setAttribute('aria-pressed',on?'true':'false');
   btn.classList.toggle('is-on',on);
  }
 }
 function makeChip(id,label,onClick){
  const btn=document.createElement('button');btn.type='button';btn.className='performance-scrub-filter-chip';btn.textContent=label;
  btn.dataset.laneGroup=id;btn.setAttribute('aria-pressed','true');btn.classList.add('is-on');
  btn.onclick=e=>{e.preventDefault();if(busy())return;onClick();};
  chipHost.append(btn);chipButtons.set(id,btn);return btn;
 }
 makeChip('__all__','All',()=>{writeLanes(defaultPerformanceScrubLanes());paint();});
 for(const g of PERFORMANCE_SCRUB_LANE_GROUPS){
  makeChip(g.id,g.label,()=>{
   const cur=readLanes();
   cur[g.id]=!cur[g.id];
   writeLanes(cur);
   paint();
  });
 }
 function paint(){
  const rig=getRig()||{},model=performanceScrubTracks(rig,lastFrame()),playhead=Math.max(0,Math.min(model.last,Number(getFrame())||0));
  const lanePrefs=readLanes();
  const visible=filterPerformanceScrubTracks(model.tracks,lanePrefs);
  const filteredOut=model.tracks.length>0&&visible.length===0;
  syncChips();
  lanes.replaceChildren();
  empty.hidden=model.tracks.length>0&&!filteredOut;
  if(filteredOut){
   empty.hidden=false;
   empty.textContent='All tracks hidden by lane filter. Click All or enable a lane group above.';
  }else{
   empty.textContent='No camera keys, contacts, attachments, body-travel weight, face/expression keys, eye tracks, or mouth cues yet.';
  }
  const shown=visible.length,total=model.tracks.length;
  status.textContent=total?(filteredOut?'Playhead frame '+playhead+' · '+total+' track'+(total===1?'':'s')+' hidden by filter.':shown<total?'Playhead frame '+playhead+' · showing '+shown+' of '+total+' performance track'+(total===1?'':'s')+'.':'Playhead frame '+playhead+' · '+total+' performance track'+(total===1?'':'s')+'.'):'';
  for(const track of visible){
   const row=document.createElement('div');row.className='performance-scrub-row';row.dataset.kind=track.kind;
   const label=document.createElement('span');label.className='performance-scrub-label';label.textContent=track.name;
   const lane=document.createElement('div');lane.className='performance-scrub-track';lane.setAttribute('role','presentation');lane.title='Click to scrub · '+track.name;
   const end=Math.max(1,model.last);
   function place(el,frame,widthFrames){el.style.left=(frame/end*100)+'%';if(widthFrames!=null)el.style.width=Math.max(widthFrames/end*100,.6)+'%';}
   for(const span of track.spans||[]){
    const bar=document.createElement('button');bar.type='button';bar.className='performance-scrub-span';place(bar,span.start,span.end-span.start+1);
    bar.title=track.name+' · '+span.label+' · frames '+span.start+'–'+span.end;bar.setAttribute('aria-label',bar.title);
    bar.onclick=e=>{e.stopPropagation();if(!busy())seek(span.start);};lane.append(bar);
   }
   for(const mark of track.marks||[]){
    const dot=document.createElement('button');dot.type='button';dot.className='performance-scrub-mark';place(dot,mark.frame);dot.style.width='';
    dot.title=track.name+' · '+mark.label+' @ '+mark.frame;dot.setAttribute('aria-label',dot.title);
    dot.onclick=e=>{e.stopPropagation();if(!busy())seek(mark.frame);};lane.append(dot);
   }
   const head=document.createElement('div');head.className='performance-scrub-playhead';head.style.left=(playhead/end*100)+'%';lane.append(head);
   lane.onclick=e=>{
    if(busy()||e.target!==lane)return;
    const rect=lane.getBoundingClientRect();if(!rect.width)return;
    seek(Math.round(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*model.last));
   };
   row.append(label,lane);lanes.append(row);
  }
 }
 paint();
 return {element:box,refresh:paint};
}
