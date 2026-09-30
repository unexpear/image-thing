import {validatePerformance} from './director-performance-state.js';
import {matchLibraryPropForMesh,libraryAssetContentHash,backfillMeshPropContentHashes,isLibraryStagePropGlb} from './director-library-prop.js';

export const SET_KIT_FORMAT='studio-set-kit';
export const MAX_SET_KITS=48;
export const MAX_SET_KIT_BYTES=500000;

const nameOk=n=>typeof n==='string'&&n.trim()&&n.length<=100;
const vec=(v,n,max)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=max);
const libraryIdOk=id=>typeof id==='string'&&id.trim()&&id.length<=100&&!/[\\/]/.test(id);
const meshNodeNameOk=n=>nameOk(n)&&!/[\\/]/.test(n);
const hashOk=h=>typeof h==='string'&&/^[0-9a-f]{64}$/i.test(h.trim());
const normHash=h=>h.trim().toLowerCase();

/** Stage props parked on the set (joint null), not held by a character. */
export function worldStageProps(rig){
 return (rig?.props||[]).filter(p=>p&&p.joint===null);
}

function kitProp(source){
 if(!source||!nameOk(source.id)||!nameOk(source.name)||source.joint!==null||!vec(source.position,3,10000)||!vec(source.rotation,3,360)||!vec(source.size,3,100)||source.size.some(n=>n<=0)||!/^#[0-9a-f]{6}$/i.test(source.color)){
  throw Error('Set kits keep unattached stage props with valid name, color, and placement.');
 }
 if(['box','sphere','cylinder'].includes(source.shape)){
  return {id:source.id,name:source.name,shape:source.shape,color:source.color,joint:null,position:[...source.position],rotation:[...source.rotation],size:[...source.size]};
 }
 if(source.shape==='mesh'){
  const hasLib=libraryIdOk(source.libraryAssetId);
  const hasNode=meshNodeNameOk(source.meshNodeName);
  if(hasLib&&hasNode)throw Error('Mesh set-kit props use either libraryAssetId (re-embed) or meshNodeName (same-shot mesh), not both.');
  if(hasLib){
   return {id:source.id,name:source.name,shape:'mesh',color:source.color,joint:null,position:[...source.position],rotation:[...source.rotation],size:[...source.size],libraryAssetId:source.libraryAssetId.trim()};
  }
  if(hasNode){
   const entry={id:source.id,name:source.name,shape:'mesh',color:source.color,joint:null,position:[...source.position],rotation:[...source.rotation],size:[...source.size],meshNodeName:source.meshNodeName.trim()};
   if(hashOk(source.contentHash))entry.contentHash=normHash(source.contentHash);
   return entry;
  }
  throw Error('Mesh set-kit props need a libraryAssetId (library GLB re-embed) or meshNodeName (mesh already in this shot model). Place from the asset library, or keep the mesh name so the kit can rearrange it in-shot.');
 }
 throw Error('Set kits keep stage box, sphere, cylinder, library-linked mesh, or same-shot mesh-ref props only.');
}

/** Library mesh entries in a set kit (geometry stays shot-model-bound; re-embed on apply). */
export function setKitLibraryMeshes(asset){
 if(!asset?.setKit)return [];
 validateSetKitAsset(asset);
 return asset.setKit.props.filter(p=>p.shape==='mesh'&&libraryIdOk(p.libraryAssetId)).map(p=>({
  libraryAssetId:p.libraryAssetId,
  name:p.name,
  color:p.color,
  position:[...p.position],
  rotation:[...p.rotation],
  size:[...p.size]
 }));
}

/** Same-shot mesh refs: rearrange/show nodes already in the shot GLB by contentHash, prop id, or name (no re-embed). */
export function setKitMeshNodeRefs(asset){
 if(!asset?.setKit)return [];
 validateSetKitAsset(asset);
 return asset.setKit.props.filter(p=>p.shape==='mesh'&&meshNodeNameOk(p.meshNodeName)&&!libraryIdOk(p.libraryAssetId)).map(p=>{
  const entry={
   meshNodeName:p.meshNodeName,
   id:p.id,
   name:p.name,
   color:p.color,
   position:[...p.position],
   rotation:[...p.rotation],
   size:[...p.size]
  };
  if(hashOk(p.contentHash))entry.contentHash=normHash(p.contentHash);
  return entry;
 });
}

export function validateSetKitAsset(asset){
 if(asset.setKit===undefined)return;
 if(asset.kind!=='set')throw Error('Set kits must use asset kind "set".');
 const kit=asset.setKit;
 if(!kit||kit.format!==SET_KIT_FORMAT||kit.version!==1||!Array.isArray(kit.props))throw Error('Invalid reusable set kit.');
 if(kit.props.length<1||kit.props.length>24)throw Error('Set kits need 1-24 stage props.');
 const ids=new Set();
 const nodeNames=new Set();
 const hashes=new Set();
 for(const p of kit.props){
  const clean=kitProp(p);
  if(ids.has(clean.id))throw Error('Set kit props need unique IDs.');
  ids.add(clean.id);
  if(clean.meshNodeName){
   if(nodeNames.has(clean.meshNodeName))throw Error('Set kit mesh node names must be unique within the kit.');
   nodeNames.add(clean.meshNodeName);
  }
  if(clean.contentHash){
   if(hashes.has(clean.contentHash))throw Error('Set kit mesh content hashes must be unique within the kit.');
   hashes.add(clean.contentHash);
  }
  if(p.attachments!==undefined||p.firstFrame!==undefined)throw Error('Set kits must not contain shot appearance timing or attachment events.');
 }
 if(JSON.stringify(kit).length>MAX_SET_KIT_BYTES)throw Error('Keep each set kit under 500 KB.');
}

export function makeSetKitAsset(rig,name,{brief='',libraryProps=[]}={}){
 if(!nameOk(name)||name.length>100)throw Error('Give the set kit a name of 1-100 characters.');
 if(typeof brief!=='string'||brief.length>4000)throw Error('Keep the set kit brief under 4,000 characters.');
 let sourceRig=rig;
 if(Array.isArray(libraryProps)&&libraryProps.length){
  try{
   const filled=backfillMeshPropContentHashes(rig,libraryProps);
   if(filled.stamped.length)sourceRig=filled.rig;
  }catch{/* keep original stage props */}
 }
 const world=worldStageProps(sourceRig);
 if(!world.length)throw Error('Add stage props or a room layout first. Held (joint-attached) props stay with the character.');
 const nodeNames=new Set();
 for(const p of world){
  if(p.shape!=='mesh')continue;
  if(libraryIdOk(p.libraryAssetId))continue;
  const promoted=matchLibraryPropForMesh(p,libraryProps);
  if(promoted.status==='match')continue;
  if(!meshNodeNameOk(p.name))throw Error('Mesh stage props need a library GLB link or a clear mesh name before saving a set kit. Place them from the asset library, recover a library link, or rename the mesh so the kit can reference it in this shot model.');
  if(nodeNames.has(p.name.trim()))throw Error('Mesh stage props need unique names to save as same-shot mesh refs. Rename duplicates, or link them to the asset library.');
  nodeNames.add(p.name.trim());
 }
 const props=world.map(p=>{
  if(p.shape==='mesh'&&!libraryIdOk(p.libraryAssetId)){
   const promoted=matchLibraryPropForMesh(p,libraryProps);
   if(promoted.status==='match'){
    return kitProp({id:p.id,name:p.name,shape:'mesh',color:p.color,joint:null,position:p.position,rotation:p.rotation,size:p.size,libraryAssetId:promoted.asset.id});
   }
   const source={id:p.id,name:p.name,shape:'mesh',color:p.color,joint:null,position:p.position,rotation:p.rotation,size:p.size,meshNodeName:p.name.trim()};
   if(hashOk(p.contentHash))source.contentHash=normHash(p.contentHash);
   else{
    const hit=matchLibraryPropForMesh(p,libraryProps);
    if(hit.status==='match'){
     const hash=libraryAssetContentHash(hit.asset);
     if(hash)source.contentHash=hash;
    }
   }
   return kitProp(source);
  }
  return kitProp({id:p.id,name:p.name,shape:p.shape,color:p.color,joint:null,position:p.position,rotation:p.rotation,size:p.size,libraryAssetId:p.libraryAssetId});
 });
 const asset={id:crypto.randomUUID(),kind:'set',name:name.trim(),brief,readiness:'Not started',setKit:{format:SET_KIT_FORMAT,version:1,props}};
 validateSetKitAsset(asset);
 return asset;
}

/** Prefer contentHash, then stable prop id, then display name — so artist renames do not break same-shot mesh refs. */
function findMeshRefTarget(pool,ref){
 const meshes=(pool||[]).filter(p=>p&&p.shape==='mesh'&&p.joint===null);
 if(hashOk(ref.contentHash)){
  const want=normHash(ref.contentHash);
  const byHash=meshes.filter(p=>hashOk(p.contentHash)&&normHash(p.contentHash)===want);
  if(byHash.length===1)return byHash[0];
  if(byHash.length>1){
   const byId=byHash.find(p=>p.id===ref.id);
   if(byId)return byId;
   const byName=byHash.find(p=>typeof p.name==='string'&&p.name===ref.meshNodeName);
   if(byName)return byName;
  }
 }
 if(nameOk(ref.id)){
  const byId=meshes.find(p=>p.id===ref.id);
  if(byId)return byId;
 }
 return meshes.find(p=>typeof p.name==='string'&&p.name===ref.meshNodeName)||null;
}

function meshRefMissingError(ref){
 const bits=['Shot model has no matching mesh stage prop'];
 if(meshNodeNameOk(ref.meshNodeName))bits.push('for "'+ref.meshNodeName+'"');
 bits.push('(tried contentHash, prop id, then name).');
 bits.push('Import or place that mesh in this shot first, or save the kit with a library GLB link so it can re-embed.');
 return Error(bits.join(' '));
}

function applyMeshNodeRef(world,previousWorld,ref,mode){
 const pool=mode==='replace-world'?previousWorld:world;
 const match=findMeshRefTarget(pool,ref);
 if(!match)throw meshRefMissingError(ref);
 const updated={...structuredClone(match),name:ref.name,color:ref.color,position:[...ref.position],rotation:[...ref.rotation],size:[...ref.size],joint:null};
 delete updated.attachments;
 delete updated.firstFrame;
 if(hashOk(ref.contentHash)&&!hashOk(updated.contentHash))updated.contentHash=normHash(ref.contentHash);
 if(mode==='replace-world'){
  world.push(updated);
  return world;
 }
 const index=world.findIndex(p=>p.id===match.id);
 if(index<0)throw meshRefMissingError(ref);
 world[index]=updated;
 return world;
}

export function meshRefSkipKey(ref){
 if(hashOk(ref?.contentHash))return 'hash:'+normHash(ref.contentHash);
 if(meshNodeNameOk(ref?.meshNodeName))return 'name:'+ref.meshNodeName.trim();
 return '';
}

/**
 * Mesh refs missing on the target shot but uniquely matching a Props-with-GLB card
 * (contentHash / file / name). Returned as library mesh placements so Body can
 * re-embed them for cross-shot apply without the mesh already present.
 */
export function setKitMeshRefLibraryFallbacks(asset,rig,libraryProps=[],{mode='merge'}={}){
 validateSetKitAsset(asset);
 if(!asset?.setKit)return [];
 if(!['merge','replace-world'].includes(mode))throw Error('Choose merge or replace-world for the set kit.');
 const previousWorld=worldStageProps(rig);
 const pool=previousWorld;
 const fallbacks=[];
 for(const ref of setKitMeshNodeRefs(asset)){
  if(findMeshRefTarget(pool,ref))continue;
  const probe={shape:'mesh',name:ref.meshNodeName,contentHash:ref.contentHash,id:ref.id};
  const matched=matchLibraryPropForMesh(probe,libraryProps);
  if(matched.status!=='match')continue;
  const entry={
   libraryAssetId:matched.asset.id,
   name:ref.name,
   color:ref.color,
   position:[...ref.position],
   rotation:[...ref.rotation],
   size:[...ref.size],
   meshNodeName:ref.meshNodeName
  };
  if(hashOk(ref.contentHash))entry.contentHash=normHash(ref.contentHash);
  else{
   const hash=libraryAssetContentHash(matched.asset);
   if(hash)entry.contentHash=hash;
  }
  fallbacks.push(entry);
 }
 return fallbacks;
}

/**
 * Apply primitive (box/sphere/cylinder) set-kit props and same-shot mesh refs into the rig.
 * Library mesh entries are returned separately — Body must re-embed them via embedSetKitLibraryMeshes
 * (geometry stays in the shot model). Pass allowPendingMeshes:true when the caller will embed.
 * Mesh-ref entries rearrange existing mesh props in this shot (same id / geometry); match by
 * contentHash, then stable prop id, then meshNodeName; no embed.
 */
export function applySetKit(rig,asset,{mode='merge',allowPendingMeshes=false,skipMeshRefKeys=null}={}){
 validateSetKitAsset(asset);
 if(!asset.setKit)throw Error('Choose a set kit library entry first.');
 if(!['merge','replace-world'].includes(mode))throw Error('Choose merge or replace-world for the set kit.');
 const libraryMeshes=setKitLibraryMeshes(asset);
 const nodeRefs=setKitMeshNodeRefs(asset);
 if(libraryMeshes.length&&!allowPendingMeshes)throw Error('This set kit includes library mesh props. Apply it from Body so those GLBs can be re-embedded from the asset library.');
 const next=structuredClone(rig);
 next.props??=[];
 const held=next.props.filter(p=>p.joint!==null);
 const previousWorld=next.props.filter(p=>p.joint===null);
 let world=mode==='replace-world'?[]:previousWorld.map(p=>structuredClone(p));
 const incoming=asset.setKit.props.filter(p=>p.shape!=='mesh').map(p=>({...kitProp(p),id:crypto.randomUUID()}));
 for(const ref of nodeRefs){
  const skipKey=meshRefSkipKey(ref);
  if(skipMeshRefKeys instanceof Set&&skipKey&&skipMeshRefKeys.has(skipKey))continue;
  world=applyMeshNodeRef(world,previousWorld,ref,mode);
 }
 if(held.length+world.length+incoming.length+libraryMeshes.length>24)throw Error('Use at most 24 stage props. Remove some, or apply with Replace world props.');
 next.props=[...held,...world,...incoming];
 validatePerformance(next);
 return next;
}

/** After embed, stamp saved kit placement onto the new mesh prop. */
export function applyLibraryMeshKitTransform(rig,propId,entry){
 if(!rig||typeof propId!=='string'||!propId)throw Error('Choose the placed mesh prop.');
 if(!entry||!libraryIdOk(entry.libraryAssetId)||!nameOk(entry.name)||!/^#[0-9a-f]{6}$/i.test(entry.color)||!vec(entry.position,3,10000)||!vec(entry.rotation,3,360)||!vec(entry.size,3,100)||entry.size.some(n=>n<=0))throw Error('Invalid library mesh set-kit placement.');
 const next=structuredClone(rig);
 const prop=(next.props||[]).find(p=>p.id===propId);
 if(!prop||prop.shape!=='mesh')throw Error('Library mesh geometry is missing from the shot model after place.');
 prop.name=entry.name;
 prop.color=entry.color;
 prop.position=[...entry.position];
 prop.rotation=[...entry.rotation];
 prop.size=[...entry.size];
 prop.libraryAssetId=entry.libraryAssetId.trim();
 prop.joint=null;
 validatePerformance(next);
 return next;
}

/**
 * Re-embed each library mesh kit entry into the shot model.
 * resolveLibraryAsset(id) -> prop asset; embed(rig, asset, {name, libraryAssetId}) -> {rig, propId}.
 */
export async function embedSetKitLibraryMeshes(rig,meshes,{resolveLibraryAsset,embed}={}){
 if(!Array.isArray(meshes))throw Error('Library mesh set-kit list is required.');
 if(typeof resolveLibraryAsset!=='function'||typeof embed!=='function')throw Error('Body embed hooks are required to place library mesh set-kit props.');
 let next=rig;
 for(const entry of meshes){
  if(!entry||!libraryIdOk(entry.libraryAssetId))throw Error('Each mesh set-kit entry needs a libraryAssetId.');
  const asset=resolveLibraryAsset(entry.libraryAssetId.trim());
  if(!asset)throw Error('Set kit mesh "'+entry.name+'" needs library prop "'+entry.libraryAssetId+'" still in this project.');
  const placed=await embed(next,asset,{name:entry.name,libraryAssetId:entry.libraryAssetId.trim()});
  if(!placed?.rig||!placed.propId)throw Error('Library mesh embed did not return a prop.');
  next=applyLibraryMeshKitTransform(placed.rig,placed.propId,entry);
 }
 return next;
}


/** Breakdown of kit contents for Apply preview (primitives / library meshes / same-shot mesh refs). */

/**
 * Stamp contentHash on legacy set-kit meshNodeName refs from uniquely matching Props-with-GLB cards.
 * Skips library-linked kit meshes and hash collisions within the kit. Returns {asset, stamped, already, skipped}.
 */
export function backfillSetKitMeshRefContentHashes(asset,libraryProps=[]){
 if(!asset?.setKit)return {asset,stamped:[],already:[],skipped:[]};
 if(asset.kind!=='set')throw Error('Set kits must use asset kind "set".');
 const next=structuredClone(asset);
 const stamped=[],already=[],skipped=[];
 const used=new Set();
 for(const prop of next.setKit.props||[]){
  if(hashOk(prop?.contentHash))used.add(normHash(prop.contentHash));
 }
 for(const prop of next.setKit.props||[]){
  if(!prop||prop.shape!=='mesh')continue;
  if(libraryIdOk(prop.libraryAssetId))continue;
  if(!meshNodeNameOk(prop.meshNodeName))continue;
  if(hashOk(prop.contentHash)){
   already.push({id:prop.id,name:prop.name,meshNodeName:prop.meshNodeName,contentHash:normHash(prop.contentHash)});
   continue;
  }
  const probe={shape:'mesh',name:prop.meshNodeName,id:prop.id,contentHash:prop.contentHash};
  const matched=matchLibraryPropForMesh(probe,libraryProps);
  if(matched.status!=='match'){skipped.push({id:prop.id,name:prop.name,meshNodeName:prop.meshNodeName,reason:matched.status||'no-library-match'});continue;}
  const hash=libraryAssetContentHash(matched.asset);
  if(!hash){skipped.push({id:prop.id,name:prop.name,meshNodeName:prop.meshNodeName,reason:'library-missing-hash',assetId:matched.asset.id});continue;}
  if(used.has(hash)){skipped.push({id:prop.id,name:prop.name,meshNodeName:prop.meshNodeName,reason:'hash-collision',contentHash:hash});continue;}
  prop.contentHash=hash;
  used.add(hash);
  stamped.push({id:prop.id,name:prop.name,meshNodeName:prop.meshNodeName,contentHash:hash,assetId:matched.asset.id});
 }
 validateSetKitAsset(next);
 return {asset:next,stamped,already,skipped};
}

/**
 * One-shot project migrate: stamp missing contentHash on shot mesh stage props and set-kit mesh refs.
 * Mutates project in place. Sync only (needs library card hashes already present).
 */
export function backfillProjectLegacyContentHashes(project){
 if(!project||!Array.isArray(project.assets))throw Error('Project is required.');
 const libraryProps=project.assets.filter(a=>isLibraryStagePropGlb(a));
 const summary={meshStamped:0,meshAlready:0,meshSkipped:0,kitStamped:0,kitAlready:0,kitSkipped:0,shots:0,kits:0};
 for(const scene of project.scenes||[]){
  for(const shot of scene.shots||[]){
   if(!shot?.rig3d||!Array.isArray(shot.rig3d.names))continue;
   const missing=(shot.rig3d.props||[]).some(p=>p&&p.shape==='mesh'&&!hashOk(p.contentHash));
   if(!missing)continue;
   const result=backfillMeshPropContentHashes(shot.rig3d,libraryProps);
   shot.rig3d=result.rig;
   summary.meshStamped+=result.stamped.length;
   summary.meshAlready+=result.already.length;
   summary.meshSkipped+=result.skipped.length;
   if(result.stamped.length)summary.shots++;
  }
 }
 for(const asset of project.assets){
  if(!asset||asset.kind!=='set'||!asset.setKit)continue;
  const needs=(asset.setKit.props||[]).some(p=>p&&p.shape==='mesh'&&meshNodeNameOk(p.meshNodeName)&&!libraryIdOk(p.libraryAssetId)&&!hashOk(p.contentHash));
  if(!needs)continue;
  const result=backfillSetKitMeshRefContentHashes(asset,libraryProps);
  asset.setKit=result.asset.setKit;
  summary.kitStamped+=result.stamped.length;
  summary.kitAlready+=result.already.length;
  summary.kitSkipped+=result.skipped.length;
  if(result.stamped.length)summary.kits++;
 }
 return summary;
}

export function summarizeSetKit(asset){
 if(!asset?.setKit)return {primitives:[],libraryMeshes:[],meshRefs:[],total:0};
 validateSetKitAsset(asset);
 const primitives=[],libraryMeshes=[],meshRefs=[];
 for(const p of asset.setKit.props){
  if(p.shape==='mesh'&&libraryIdOk(p.libraryAssetId)){
   libraryMeshes.push({name:p.name,libraryAssetId:p.libraryAssetId});
  }else if(p.shape==='mesh'&&meshNodeNameOk(p.meshNodeName)){
   const entry={name:p.name,meshNodeName:p.meshNodeName,id:p.id};
   if(hashOk(p.contentHash))entry.contentHash=normHash(p.contentHash);
   meshRefs.push(entry);
  }else if(['box','sphere','cylinder'].includes(p.shape)){
   primitives.push({name:p.name,shape:p.shape});
  }
 }
 return {primitives,libraryMeshes,meshRefs,total:asset.setKit.props.length};
}

function listNames(items,limit=6){
 const names=items.map(i=>i.name||i.meshNodeName||'prop').filter(Boolean);
 if(!names.length)return '';
 if(names.length<=limit)return names.join(', ');
 return names.slice(0,limit).join(', ')+', +'+(names.length-limit)+' more';
}

/**
 * Artist-facing Apply preview: kit contents, merge vs replace consequences, and
 * mesh-ref outcomes on the current shot (rearrange / library fallback / missing).
 */
export function setKitApplyPreview(asset,rig,libraryProps=[],{mode='merge'}={}){
 if(!asset?.setKit){
  return {mode,summary:null,held:0,worldCount:0,rearrange:[],willFallback:[],willMiss:[],needsBodyEmbed:false,text:'Choose a saved set kit to preview what Apply will place on this shot.'};
 }
 validateSetKitAsset(asset);
 if(!['merge','replace-world'].includes(mode))throw Error('Choose merge or replace-world for the set kit.');
 const summary=summarizeSetKit(asset);
 const world=worldStageProps(rig);
 const held=(rig?.props||[]).filter(p=>p&&p.joint!==null).length;
 const fallbacks=setKitMeshRefLibraryFallbacks(asset,rig,libraryProps,{mode});
 const fallbackKeys=new Set(fallbacks.map(f=>meshRefSkipKey(f)).filter(Boolean));
 const rearrange=[],willFallback=[],willMiss=[];
 for(const ref of setKitMeshNodeRefs(asset)){
  if(findMeshRefTarget(world,ref))rearrange.push(ref.name||ref.meshNodeName);
  else if(fallbackKeys.has(meshRefSkipKey(ref)))willFallback.push(ref.name||ref.meshNodeName);
  else willMiss.push(ref.name||ref.meshNodeName);
 }
 const libCount=summary.libraryMeshes.length+willFallback.length;
 const bits=[];
 bits.push('Kit: '+summary.total+' prop'+(summary.total===1?'':'s'));
 const parts=[];
 if(summary.primitives.length)parts.push(summary.primitives.length+' primitive'+(summary.primitives.length===1?'':'s')+(listNames(summary.primitives)?' ('+listNames(summary.primitives)+')':''));
 if(summary.libraryMeshes.length)parts.push(summary.libraryMeshes.length+' library mesh'+(summary.libraryMeshes.length===1?'':'es')+(listNames(summary.libraryMeshes)?' ('+listNames(summary.libraryMeshes)+')':''));
 if(summary.meshRefs.length)parts.push(summary.meshRefs.length+' mesh ref'+(summary.meshRefs.length===1?'':'s')+(listNames(summary.meshRefs)?' ('+listNames(summary.meshRefs)+')':''));
 if(parts.length)bits.push(parts.join('; ')+'.');
 if(mode==='replace-world'){
  bits.push('Replace world: drops unmatched stage props ('+world.length+' on stage now); keeps '+held+' held prop'+(held===1?'':'s')+'; kit primitives and matched mesh refs rebuild the stage.');
 }else{
  bits.push('Merge: keeps current stage props ('+world.length+' world + '+held+' held); adds kit primitives and updates matched mesh refs in place.');
 }
 if(rearrange.length)bits.push('Mesh refs rearrange on this shot: '+rearrange.slice(0,6).join(', ')+(rearrange.length>6?', +'+(rearrange.length-6)+' more':'')+'.');
 if(willFallback.length)bits.push('Missing mesh refs re-embed from library: '+willFallback.slice(0,6).join(', ')+(willFallback.length>6?', +'+(willFallback.length-6)+' more':'')+' (Body open).');
 if(willMiss.length)bits.push('Missing with no library match (Apply will fail until linked or placed): '+willMiss.slice(0,6).join(', ')+(willMiss.length>6?', +'+(willMiss.length-6)+' more':'')+'.');
 if(libCount>0&&!willMiss.length)bits.push('Library meshes need Body open to re-embed ('+libCount+').');
 return {mode,summary,held,worldCount:world.length,rearrange,willFallback,willMiss,needsBodyEmbed:libCount>0,text:bits.join(' ')};
}


/**
 * Confirm copy before Apply with Replace world (drops unmatched stage props; Undo restores).
 */
export function setKitApplyConfirmMessage(asset, mode='replace-world', preview=null){
 const name=(asset&&typeof asset.name==='string'&&asset.name.trim())?asset.name.trim():'Untitled set kit';
 const p=preview||{worldCount:0,held:0,summary:null};
 const world=Number(p.worldCount)||0;
 const held=Number(p.held)||0;
 const kitN=p.summary?.total??(Array.isArray(asset?.setKit?.props)?asset.setKit.props.length:0);
 if(mode!=='replace-world'){
  return 'Apply set kit "'+name+'" (merge)?\n\nAdds kit props and updates matched mesh refs. Undo restores.';
 }
 return 'Apply set kit "'+name+'" with Replace world?\n\nDrops unmatched stage props ('+world+' on stage now); keeps '+held+' held prop'+(held===1?'':'s')+'. Kit rebuilds the stage with '+kitN+' prop'+(kitN===1?'':'s')+'. Undo restores.';
}

/**
 * Whether Apply kit should be enabled, and whether replace-world needs confirm.
 * Disabled reasons match the live preview (choose kit / missing mesh refs).
 */
export function setKitApplyGate(asset,rig,libraryProps=[],{mode='merge'}={}){
 const preview=setKitApplyPreview(asset,rig,libraryProps,{mode});
 if(!asset?.setKit){
  return {ok:false,reason:'Choose a saved set kit first.',needsConfirm:false,confirmMessage:'',preview};
 }
 if(!['merge','replace-world'].includes(mode))throw Error('Choose merge or replace-world for the set kit.');
 if(preview.willMiss.length){
  const names=preview.willMiss.slice(0,4).join(', ')+(preview.willMiss.length>4?', +'+(preview.willMiss.length-4)+' more':'');
  return {
   ok:false,
   reason:'Missing mesh refs with no library match: '+names+'. Link or place them first, or Apply will fail.',
   needsConfirm:false,
   confirmMessage:'',
   preview
  };
 }
 const needsConfirm=mode==='replace-world';
 return {
  ok:true,
  reason:needsConfirm
   ?'Replace world drops unmatched stage props; held character props stay. Confirm before Apply. Undo restores.'
   :'Merge kit into this shot\'s stage. Undo restores.',
  needsConfirm,
  confirmMessage:needsConfirm?setKitApplyConfirmMessage(asset,mode,preview):'',
  preview
 };
}

export function setKitLabel(asset){
 if(!asset?.setKit?.props)return '';
 const n=asset.setKit.props.length;
 const lib=asset.setKit.props.filter(p=>p.shape==='mesh'&&libraryIdOk(p.libraryAssetId)).length;
 const refs=asset.setKit.props.filter(p=>p.shape==='mesh'&&meshNodeNameOk(p.meshNodeName)&&!libraryIdOk(p.libraryAssetId)).length;
 const base='Set kit · '+n+' stage prop'+(n===1?'':'s');
 const bits=[];
 if(lib)bits.push(lib+' library mesh'+(lib===1?'':'es'));
 if(refs)bits.push(refs+' mesh ref'+(refs===1?'':'s'));
 return bits.length?base+' · '+bits.join(' · '):base;
}
