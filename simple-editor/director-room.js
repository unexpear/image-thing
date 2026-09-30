import {validatePerformance} from './director-performance-state.js';
import {makeSetKitAsset,applySetKit,setKitLibraryMeshes,setKitMeshNodeRefs,setKitMeshRefLibraryFallbacks,meshRefSkipKey,setKitLabel,setKitApplyPreview,setKitApplyGate,setKitApplyConfirmMessage,MAX_SET_KITS} from './director-set-kit.js';
import {recoverLibraryLinks,listAmbiguousLibraryLinks,stampLibraryLinkChoice,backfillMeshPropContentHashes,stampableMissingMeshHashCount,linkableFileMeshCount} from './director-library-prop.js';
export function addRoomLayout(rig,{name,width,depth,height,doorWidth,doorHeight,rightWall=false}){
 if(typeof name!=='string'||!name.trim()||name.length>60||![width,depth,height,doorWidth,doorHeight].every(Number.isFinite)||width<2||width>30||depth<2||depth>30||height<2||height>10||doorWidth<.5||doorWidth>width-.4||doorHeight<1||doorHeight>height-.2||typeof rightWall!=='boolean')throw Error('Use room width/depth 2–30, height 2–10, and a doorway smaller than its wall.');
 const next=structuredClone(rig);next.props??=[];const t=.12,w=(width-doorWidth)/2;
 const part=(label,position,size,color)=>next.props.push({id:crypto.randomUUID(),name:name.trim()+' · '+label,shape:'box',joint:null,position,rotation:[0,0,0],size,color});
 part('Floor',[0,-t/2,0],[width+t*2,t,depth+t*2],'#79818c');
 part('Left wall',[-width/2-t/2,height/2,0],[t,height,depth],'#b9c4c9');
 if(rightWall)part('Right wall',[width/2+t/2,height/2,0],[t,height,depth],'#b9c4c9');
 part('Door left',[-(doorWidth+w)/2,height/2,-depth/2-t/2],[w,height,t],'#c8d0ce');
 part('Door right',[(doorWidth+w)/2,height/2,-depth/2-t/2],[w,height,t],'#c8d0ce');
 part('Door lintel',[0,doorHeight+(height-doorHeight)/2,-depth/2-t/2],[doorWidth,height-doorHeight,t],'#c8d0ce');
 validatePerformance(next);return next;
}
export function roomControls({host,getRig,edit,busy,notify,getSetKits=()=>[],saveSetKit,getLibraryProps=()=>[],embedSetKitMeshes}){
 const panel=document.createElement('details');panel.className='settings';const heading=document.createElement('summary');heading.textContent='Set layout · room & doorway';panel.append(heading);host.append(panel);
 const note=document.createElement('p');note.textContent='Create an open-front room with a floor at Y=0 and doorway in the back wall (negative Z). Each piece is an editable stage prop. Camera-side walls can be omitted or removed. This adds layout geometry, not collisions or automatic foot contacts. Save a set kit below to reuse the room on another shot without replacing the character.';panel.append(note);
 function field(label,type,value){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const input=document.createElement('input');input.type=type;input.value=value;input.setAttribute('aria-label',label);if(type==='number')input.step=.1;wrap.append(input);panel.append(wrap);return input;}
 function selectField(label){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label);wrap.append(select);panel.append(wrap);return select;}
 const name=field('Room layout name','text','Room'),width=field('Room width','number',6),depth=field('Room depth','number',5),height=field('Room height','number',3),doorWidth=field('Doorway width','number',1.2),doorHeight=field('Doorway height','number',2.2),rightWall=field('Include right wall','checkbox','');
 const add=document.createElement('button');add.type='button';add.textContent='Add editable room layout';add.onclick=()=>{if(busy())return;try{const next=addRoomLayout(getRig(),{name:name.value,width:Number(width.value),depth:Number(depth.value),height:Number(height.value),doorWidth:Number(doorWidth.value),doorHeight:Number(doorHeight.value),rightWall:rightWall.checked});edit(r=>r.props=next.props);}catch(error){notify(error.message);}};panel.append(add);
 const kitNote=document.createElement('p');kitNote.className='hint';kitNote.textContent='Set kits store unattached stage props: room boxes, library-linked mesh props (re-embed from Props with GLB), and same-shot mesh refs by contentHash / prop id / name (rearrange meshes already in this shot GLB — no re-embed; survive renames when contentHash or prop id is present). Save auto-promotes uniquely matched file meshes to library links when a Props-with-GLB card matches (contentHash / file / name), so the kit can re-embed on another shot without clicking Link first. Ambiguous matches stay mesh refs (use Link + picker). Apply: mesh refs rearrange when present; missing refs with a unique library match re-embed like library entries (Body open). Legacy meshes missing contentHash get stamped on project load (and via Stamp missing mesh hashes) from Props-with-GLB cards that already have a hash. Prefer Place from asset library for new cross-shot work.';panel.append(kitNote);
 const kitName=field('Set kit name','text','Room kit');
 const kitChoice=selectField('Saved set kit');
 const kitMode=selectField('Apply mode');kitMode.append(new Option('Merge — keep current stage props, add/update kit items','merge'),new Option('Replace world — drop unmatched stage props; keep held','replace-world'));
 const modeHint=document.createElement('p');modeHint.className='hint';modeHint.textContent='Merge adds kit primitives and rearranges matched mesh refs without clearing the stage. Replace world rebuilds unattached stage props from the kit (held character props stay). Preview below updates when you change kit or mode.';panel.append(modeHint);
 const recover=document.createElement('button');recover.type='button';recover.textContent='Link file meshes to library';
 function syncLinkFileMeshesButton(){
  if(!recover)return;
  const linkable=linkableFileMeshCount(typeof getRig==='function'?getRig():null);
  recover.disabled=!linkable;
  recover.title=linkable
   ?('Try linking '+linkable+' file-only stage mesh'+(linkable===1?'':'es')+' to Props-with-GLB cards (unique matches stamp automatically)')
   :'No file-only mesh props to link';
 }
 recover.onclick=()=>{if(busy())return;try{const linkable=linkableFileMeshCount(getRig());if(!linkable){notify('No file-only mesh props to link.');syncLinkFileMeshesButton();return;}const assets=typeof getLibraryProps==='function'?getLibraryProps():[];const result=recoverLibraryLinks(getRig(),assets);edit(r=>{r.props=result.rig.props;});const parts=[];if(result.linked.length)parts.push('Linked '+result.linked.length+' mesh'+(result.linked.length===1?'':'es')+' to the asset library');if(result.already.length)parts.push(result.already.length+' already linked');if(result.ambiguous.length)parts.push(result.ambiguous.length+' ambiguous — pick below');if(result.unmatched.length)parts.push(result.unmatched.length+' still unmatched');notify(parts.length?parts.join('. ')+'.':'No file-only mesh props to link.');refreshAmbiguous();syncLinkFileMeshesButton();syncStampMissingHashesButton();}catch(error){notify(error.message);}};panel.append(recover);syncLinkFileMeshesButton();
 const stampHashes=document.createElement('button');stampHashes.type='button';stampHashes.textContent='Stamp missing mesh hashes';
 function syncStampMissingHashesButton(){
  if(!stampHashes)return;
  const stampable=stampableMissingMeshHashCount(typeof getRig==='function'?getRig():null);
  stampHashes.disabled=!stampable;
  stampHashes.title=stampable
   ?('Stamp contentHash onto '+stampable+' stage mesh'+(stampable===1?'':'es')+' missing a hash (from matching Props-with-GLB cards)')
   :'No stage meshes missing a content hash';
 }
 stampHashes.onclick=()=>{if(busy())return;try{const stampable=stampableMissingMeshHashCount(getRig());if(!stampable){notify('No stage meshes missing a content hash.');syncStampMissingHashesButton();return;}const assets=typeof getLibraryProps==='function'?getLibraryProps():[];const mesh=backfillMeshPropContentHashes(getRig(),assets);edit(r=>{r.props=mesh.rig.props;});const parts=[];if(mesh.stamped.length)parts.push('Stamped '+mesh.stamped.length+' stage mesh'+(mesh.stamped.length===1?'':'es'));if(mesh.already.length)parts.push(mesh.already.length+' already hashed');if(mesh.skipped.length)parts.push(mesh.skipped.length+' skipped (no library hash yet)');notify(parts.length?parts.join('. ')+'.':'No mesh props to stamp.');refresh();}catch(error){notify(error.message);}};panel.append(stampHashes);syncStampMissingHashesButton();
 const ambNote=document.createElement('p');ambNote.className='hint';ambNote.textContent='When more than one Props-with-GLB card matches a file mesh, choose the mesh and the library card below, then Stamp chosen library link. Unique matches still link automatically above.';panel.append(ambNote);
 const ambProp=selectField('Ambiguous mesh prop');
 const ambAsset=selectField('Matching library GLB');
 let ambiguousItems=[];
 function fillAmbiguousCandidates(){
  const item=ambiguousItems.find(entry=>entry.propId===ambProp.value);
  const previous=ambAsset.value;
  ambAsset.replaceChildren();
  for(const candidate of item?.candidates||[]){
   const label=candidate.name+(candidate.fileName?' · '+candidate.fileName:'');
   ambAsset.append(new Option(label,candidate.id));
  }
  if(previous&&[...ambAsset.options].some(o=>o.value===previous))ambAsset.value=previous;
  else if(ambAsset.options[0])ambAsset.value=ambAsset.options[0].value;
 }
 function refreshAmbiguous(){
  try{
   const assets=typeof getLibraryProps==='function'?getLibraryProps():[];
   ambiguousItems=listAmbiguousLibraryLinks(getRig(),assets);
  }catch{ambiguousItems=[];}
  const previous=ambProp.value;
  ambProp.replaceChildren();
  for(const item of ambiguousItems){
   ambProp.append(new Option(item.name+' · '+item.candidates.length+' matches',item.propId));
  }
  if(previous&&[...ambProp.options].some(o=>o.value===previous))ambProp.value=previous;
  else if(ambProp.options[0])ambProp.value=ambProp.options[0].value;
  fillAmbiguousCandidates();
  const has=ambiguousItems.length>0;
  ambNote.hidden=ambProp.parentElement.hidden=ambAsset.parentElement.hidden=stamp.hidden=!has;
 }
 ambProp.onchange=fillAmbiguousCandidates;
 const stamp=document.createElement('button');stamp.type='button';stamp.textContent='Stamp chosen library link';stamp.onclick=()=>{if(busy())return;try{const assets=typeof getLibraryProps==='function'?getLibraryProps():[];const result=stampLibraryLinkChoice(getRig(),ambProp.value,ambAsset.value,assets);edit(r=>{r.props=result.rig.props;});notify(result.already?'Mesh already linked to library asset '+result.matched+'.':'Linked "'+(ambiguousItems.find(i=>i.propId===result.propId)?.name||'mesh')+'" to library asset '+result.matched+'.');refreshAmbiguous();syncLinkFileMeshesButton();syncStampMissingHashesButton();}catch(error){notify(error.message);}};panel.append(stamp);
 refreshAmbiguous();
 const kitPreview=document.createElement('p');kitPreview.className='hint kit-apply-preview';kitPreview.setAttribute('aria-live','polite');panel.append(kitPreview);
 function syncApplyButton(){
  try{
   const asset=getSetKits().find(a=>a.id===kitChoice.value)||null;
   const libProps=typeof getLibraryProps==='function'?getLibraryProps():[];
   const gate=setKitApplyGate(asset,getRig(),libProps,{mode:kitMode.value||'merge'});
   apply.disabled=!gate.ok;
   apply.title=gate.reason||'';
   apply.dataset.needsConfirm=gate.needsConfirm?'1':'0';
   if(gate.preview){
    kitPreview.dataset.needsBody=gate.preview.needsBodyEmbed?'1':'0';
    kitPreview.dataset.willMiss=String(gate.preview.willMiss.length);
   }
  }catch(error){
   apply.disabled=true;
   apply.title=error.message||'Cannot apply set kit.';
   apply.dataset.needsConfirm='0';
  }
 }
 function updateKitPreview(){
  try{
   const asset=getSetKits().find(a=>a.id===kitChoice.value)||null;
   const libProps=typeof getLibraryProps==='function'?getLibraryProps():[];
   const preview=setKitApplyPreview(asset,getRig(),libProps,{mode:kitMode.value||'merge'});
   kitPreview.textContent=preview.text;
   kitPreview.dataset.needsBody=preview.needsBodyEmbed?'1':'0';
   kitPreview.dataset.willMiss=String(preview.willMiss.length);
  }catch(error){
   kitPreview.textContent=error.message||'Could not preview set kit.';
   kitPreview.dataset.willMiss='0';
  }
  syncApplyButton();
 }
 kitChoice.onchange=updateKitPreview;
 kitMode.onchange=updateKitPreview;
 const save=document.createElement('button');save.type='button';save.textContent='Save stage props as set kit';save.onclick=()=>{if(busy())return;try{if(!saveSetKit)throw Error('Project library is unavailable.');if(getSetKits().length>=MAX_SET_KITS)throw Error('Keep at most '+MAX_SET_KITS+' set kits in one project.');const assets=typeof getLibraryProps==='function'?getLibraryProps():[];const kit=makeSetKitAsset(getRig(),kitName.value,{libraryProps:assets});const promoted=kit.setKit.props.filter(p=>p.shape==='mesh'&&p.libraryAssetId).length;const refs=kit.setKit.props.filter(p=>p.shape==='mesh'&&p.meshNodeName&&!p.libraryAssetId).length;saveSetKit(kit);notify('Set kit saved'+(promoted||refs?' — '+[promoted?promoted+' library mesh'+(promoted===1?'':'es'):'',refs?refs+' mesh ref'+(refs===1?'':'s'):''].filter(Boolean).join(', '):'')+'. Other shots can apply it without replacing the character.');refresh();}catch(error){notify(error.message);}};panel.append(save);
 const apply=document.createElement('button');apply.type='button';apply.textContent='Apply kit to this shot';apply.onclick=async()=>{if(busy())return;try{const asset=getSetKits().find(a=>a.id===kitChoice.value)||null;const libProps=typeof getLibraryProps==='function'?getLibraryProps():[];const gate=setKitApplyGate(asset,getRig(),libProps,{mode:kitMode.value||'merge'});if(!gate.ok){notify(gate.reason);syncApplyButton();return;}if(gate.needsConfirm&&!confirm(gate.confirmMessage||setKitApplyConfirmMessage(asset,kitMode.value||'replace-world',gate.preview)))return;if(!asset)throw Error('Choose a set kit first.');const fallbacks=setKitMeshRefLibraryFallbacks(asset,getRig(),libProps,{mode:kitMode.value});const skipMeshRefKeys=new Set(fallbacks.map(f=>meshRefSkipKey(f)).filter(Boolean));const meshes=[...setKitLibraryMeshes(asset),...fallbacks.map(({libraryAssetId,name,color,position,rotation,size})=>({libraryAssetId,name,color,position,rotation,size}))];const refs=setKitMeshNodeRefs(asset);if(meshes.length&&typeof embedSetKitMeshes!=='function')throw Error('This set kit needs library mesh re-embed (linked entries or cross-shot mesh-ref fallback). Open Body on this shot to place those GLBs from the asset library.');const next=applySetKit(getRig(),asset,{mode:kitMode.value,allowPendingMeshes:meshes.length>0,skipMeshRefKeys});edit(r=>r.props=next.props);const refApplied=refs.length-fallbacks.length;const modeWord=kitMode.value==='replace-world'?'replaced unmatched world props':'merged with current stage';if(meshes.length)await embedSetKitMeshes(meshes);notify('Kit applied'+(meshes.length?' with library meshes'+(fallbacks.length?' ('+fallbacks.length+' from mesh-ref fallback)':'')+'':'')+(refApplied>0?' and mesh refs':'')+'. Held props kept; '+modeWord+'.');updateKitPreview();}catch(error){notify(error.message);}};panel.append(apply);
 function refresh(){const kits=getSetKits();const previous=kitChoice.value;kitChoice.replaceChildren();for(const asset of kits){const label=asset.setKit?setKitLabel(asset):'';kitChoice.append(new Option(asset.name+(label?' · '+label.replace(/^Set kit · /,''):''),asset.id));}if(previous&&[...kitChoice.options].some(o=>o.value===previous))kitChoice.value=previous;else if(kits[0])kitChoice.value=kits[0].id;refreshAmbiguous();syncLinkFileMeshesButton();syncStampMissingHashesButton();updateKitPreview()}
 refresh();
 return {refresh};
}