import {appendStaticProp} from './director-stage.js';
import {readRigGLB,disposeObject,starterCharacter,jointsOf,faceControls} from './director-3d-engine.js';
import {validateRig3D} from './director-3d-state.js';

export const LIBRARY_PROP_MAX_BYTES=50*1024*1024;
export const LIBRARY_PROP_MAX_PROPS=24;

const hosts=new Map();

function mediaName(file){
 return file?.name||file?.filename||'';
}

/** True when an asset library card can place its attached GLB as a static stage prop. */
export function isLibraryStagePropGlb(asset){
 if(!asset||asset.kind!=='prop'||asset.setKit||asset.rigSetup||!asset.file)return false;
 const name=mediaName(asset.file);
 return typeof name==='string'&&/\.glb$/i.test(name)&&!/[\\/]/.test(name);
}

export function libraryPropFile(asset){
 if(!asset||asset.kind!=='prop')throw Error('Choose a prop library entry with a GLB.');
 if(asset.setKit)throw Error('Set kits apply from Body · Set layout, not as mesh props.');
 if(asset.rigSetup)throw Error('Rig setups load from Character continuity, not as stage props.');
 const file=asset.file;
 if(!file)throw Error('Attach a GLB to this prop asset first.');
 const name=mediaName(file);
 if(typeof name!=='string'||!name||/[\\/]/.test(name)||!/\.glb$/i.test(name))throw Error('Library stage props need a local .glb file.');
 if(file.type!==undefined&&!['input','output'].includes(file.type||'input'))throw Error('Invalid prop media type.');
 if(file.subfolder!==undefined&&(typeof file.subfolder!=='string'||file.subfolder.split(/[\\/]/).includes('..')))throw Error('Invalid prop media path.');
 return file;
}

export function libraryPropViewUrl(file){
 const f=file||{};
 return '/view?'+new URLSearchParams({filename:mediaName(f),subfolder:f.subfolder||'',type:f.type||'input'});
}

export function libraryPropLabel(asset){
 if(!isLibraryStagePropGlb(asset))return '';
 return 'Library GLB · stage prop';
}

export function libraryPropPlacementName(asset){
 const raw=typeof asset?.name==='string'?asset.name.trim():'';
 if(!raw||raw.length>100)throw Error('Give the prop asset a name of 1-100 characters before placing it.');
 return raw;
}

export function linkShotAsset(shot,assetId){
 if(!shot||typeof assetId!=='string'||!assetId)return false;
 shot.assetIds??=[];
 if(shot.assetIds.includes(assetId))return false;
 shot.assetIds=[...shot.assetIds,assetId];
 return true;
}

/** Live Body-stage hosts remount after place. Asset cards prefer a host when open. */
export function registerLibraryPropHost(shotId,api){
 if(typeof shotId!=='string'||!shotId||!api||typeof api.place!=='function')throw Error('Library prop host requires a shot id and place().');
 hosts.set(shotId,api);
 return ()=>{if(hosts.get(shotId)===api)hosts.delete(shotId);};
}

export function getLibraryPropHost(shotId){
 return hosts.get(shotId)||null;
}

export async function loadLibraryPropScene(asset,{fetchImpl=fetch}={}){
 const file=libraryPropFile(asset);
 const response=await fetchImpl(libraryPropViewUrl(file));
 if(!response.ok)throw Error('The prop GLB is missing. Restore project media first.');
 const buffer=await response.arrayBuffer();
 if(buffer.byteLength>LIBRARY_PROP_MAX_BYTES)throw Error('Use a GLB under 50 MB.');
 return readRigGLB(buffer,{requireRig:false});
}

/**
 * Embed a loaded static prop scene into a shot model, upload the combined GLB, return
 * {root,rig,data,propId}. Caller disposes result.root if unused. Source propScene is not disposed.
 */
export async function appendLibraryPropToModel({root,rest,baseRoot,rig,propScene,name,baseFaces,upload,libraryAssetId,sourceFileName,sourceUrl,contentHash}){
 if(typeof upload!=='function')throw Error('Upload is required to save the combined stage model.');
 const propName=typeof name==='string'?name.trim():'';
 if(!propName||propName.length>100)throw Error('Give the stage prop a name of 1-100 characters.');
 const current=(rig?.props||[]).length;
 if(current>=LIBRARY_PROP_MAX_PROPS)throw Error('Use at most 24 stage props. Remove one before placing another library GLB.');
 const result=await appendStaticProp({root,rest,baseRoot,rig,prop:propScene,name:propName,baseFaces,libraryAssetId,sourceFileName,sourceUrl,contentHash});
 try{
  result.rig.model=await upload(new File([result.data],'prop-stage-'+crypto.randomUUID()+'.glb',{type:'model/gltf-binary'}));
  validateRig3D(result.rig);
  return result;
 }catch(error){
  if(result.root)disposeObject(result.root);
  throw error;
 }
}

/**
 * Offline / no-open-Body path: load shot model (or starter), append library GLB, upload.
 * Does not remount a live viewport · prefer getLibraryPropHost(shot.id).place when Body is open.
 */
export async function placeLibraryPropOffline(shot,asset,{upload,fetchImpl=fetch}={}){
 if(!shot)throw Error('Choose a shot first.');
 libraryPropFile(asset);
 const propName=libraryPropPlacementName(asset);
 let imported,model,result;
 try{
  imported=await loadLibraryPropScene(asset,{fetchImpl});
  let rest,baseRoot,rig,baseFaces;
  if(shot.rig3d?.model){
   const f=shot.rig3d.model;
   const response=await fetchImpl('/view?'+new URLSearchParams({filename:f.name||f.filename||'',subfolder:f.subfolder||'',type:f.type||'input'}));
   if(!response.ok)throw Error('The shot character model is missing. Restore project media or open Body · Use starter character first.');
   model=await readRigGLB(await response.arrayBuffer());
   const bones=jointsOf(model);
   if(bones.length!==shot.rig3d.names.length){disposeObject(model);model=null;throw Error('This shot GLB skeleton no longer matches the saved joint count. Reopen Body and fix the rig first.');}
   rest=bones.map(b=>b.quaternion.clone());
   baseRoot=bones[0].position.clone();
   baseFaces=faceControls(model).map(c=>c.base);
   rig=shot.rig3d;
  }else{
   model=starterCharacter();
   const bones=jointsOf(model);
   rest=bones.map(b=>b.quaternion.clone());
   baseRoot=bones[0].position.clone();
   baseFaces=faceControls(model).map(c=>c.base);
   rig=shot.rig3d&&shot.rig3d.names?.length===bones.length?shot.rig3d:{version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[]};
  }
  const file=libraryPropFile(asset);const hash=libraryAssetContentHash(asset);result=await appendLibraryPropToModel({root:model,rest,baseRoot,rig,propScene:imported,name:propName,baseFaces,upload,libraryAssetId:asset.id,sourceFileName:mediaName(file),sourceUrl:libraryPropViewUrl(file),contentHash:hash||undefined});
  disposeObject(model);model=null;
  const nextRig=result.rig;
  const nextRoot=result.root;
  result.root=null;
  return {rig:nextRig,root:nextRoot,propId:result.propId};
 }finally{
  if(imported)disposeObject(imported);
  if(model)disposeObject(model);
  if(result?.root)disposeObject(result.root);
 }
}

const libraryIdOk=id=>typeof id==='string'&&id.trim()&&id.length<=100&&!/[\\/]/.test(id);
const hashOk=h=>typeof h==='string'&&/^[0-9a-f]{64}$/i.test(h.trim());

/** SHA-256 hex from a Props-with-GLB card (asset or media file), else ''. */
export function libraryAssetContentHash(asset){
 if(!asset)return '';
 if(hashOk(asset.contentHash))return asset.contentHash.trim().toLowerCase();
 try{
  const file=libraryPropFile(asset);
  if(hashOk(file.contentHash))return file.contentHash.trim().toLowerCase();
 }catch{/* no GLB */}
 return '';
}

/** Basename stem lowercased: strips path, query, and trailing .glb. */
export function normalizeLibraryMatchKey(value){
 if(typeof value!=='string')return '';
 let text=value.trim().toLowerCase().replace(/\\/g,'/');
 const q=text.indexOf('?');
 if(q>=0){
  const params=new URLSearchParams(text.slice(q+1));
  const fromQuery=params.get('filename');
  if(fromQuery)text=fromQuery.trim().toLowerCase();
  else text=text.slice(0,q);
 }
 const slash=text.lastIndexOf('/');
 if(slash>=0)text=text.slice(slash+1);
 return text.replace(/\.glb$/i,'').trim();
}

/** Match keys for a prop-library GLB: asset name, file stem, view URL, optional content hash. */
export function libraryPropMatchKeys(asset){
 const keys=new Set();
 if(!isLibraryStagePropGlb(asset))return keys;
 const nameKey=normalizeLibraryMatchKey(asset.name);
 if(nameKey)keys.add('name:'+nameKey);
 try{
  const file=libraryPropFile(asset);
  const fileKey=normalizeLibraryMatchKey(mediaName(file));
  if(fileKey)keys.add('file:'+fileKey);
  const url=libraryPropViewUrl(file);
  if(url)keys.add('url:'+url);
  const hash=libraryAssetContentHash(asset);
  if(hash)keys.add('hash:'+hash);
 }catch{/* non-GLB or invalid media skipped */}
 return keys;
}

/** Match keys for a stage mesh prop: display name, stamped source file/url/hash. */
export function meshPropMatchKeys(prop){
 const keys=new Set();
 if(!prop||prop.shape!=='mesh')return keys;
 const nameKey=normalizeLibraryMatchKey(prop.name);
 if(nameKey)keys.add('name:'+nameKey);
 if(typeof prop.sourceFileName==='string'&&prop.sourceFileName.trim()){
  const fileKey=normalizeLibraryMatchKey(prop.sourceFileName);
  if(fileKey){
   keys.add('file:'+fileKey);
   keys.add('name:'+fileKey);
  }
 }
 if(typeof prop.sourceUrl==='string'&&prop.sourceUrl.trim())keys.add('url:'+prop.sourceUrl.trim());
 if(hashOk(prop.contentHash))keys.add('hash:'+prop.contentHash.trim().toLowerCase());
 return keys;
}

/**
 * Find a unique library prop GLB for a stage mesh by filename / url / hash / name.
 * Returns {status:'linked'|'match'|'ambiguous'|'unmatched'|'skip', asset?, assets?, assetId?}.
 */
export function matchLibraryPropForMesh(prop,assets){
 if(!prop||prop.shape!=='mesh')return {status:'skip'};
 if(libraryIdOk(prop.libraryAssetId))return {status:'linked',assetId:prop.libraryAssetId.trim()};
 const want=meshPropMatchKeys(prop);
 if(!want.size)return {status:'unmatched'};
 const hits=[];
 for(const asset of assets||[]){
  if(!isLibraryStagePropGlb(asset))continue;
  const have=libraryPropMatchKeys(asset);
  let hit=false;
  for(const key of want){if(have.has(key)){hit=true;break;}}
  if(hit)hits.push(asset);
 }
 const unique=[...new Map(hits.map(a=>[a.id,a])).values()];
 if(unique.length===1)return {status:'match',asset:unique[0]};
 if(unique.length>1)return {status:'ambiguous',assets:unique};
 return {status:'unmatched'};
}

/** Resolve a library id at import time from name / source file / url / hash. */
export function resolveLibraryLinkForImport({name,sourceFileName,sourceUrl,contentHash}={},assets=[]){
 const result=matchLibraryPropForMesh({shape:'mesh',name,sourceFileName,sourceUrl,contentHash},assets);
 if(result.status==='match')return result.asset.id;
 return null;
}

function applyLibraryLinkStamp(prop,asset){
 prop.libraryAssetId=asset.id;
 if(!prop.sourceFileName){
  try{prop.sourceFileName=mediaName(libraryPropFile(asset));}catch{/* keep unset */}
 }
 if(!prop.sourceUrl){
  try{prop.sourceUrl=libraryPropViewUrl(libraryPropFile(asset));}catch{/* keep unset */}
 }
 if(!hashOk(prop.contentHash)){
  const hash=libraryAssetContentHash(asset);
  if(hash)prop.contentHash=hash;
 }
}

/** Compact candidate label for ambiguous-match picker UI. */
export function libraryLinkCandidateInfo(asset){
 const id=typeof asset?.id==='string'?asset.id:'';
 const name=typeof asset?.name==='string'?asset.name.trim():'';
 let fileName='';
 try{fileName=mediaName(libraryPropFile(asset));}catch{/* keep empty */}
 return {id,name:name||id||'Library prop',fileName};
}

/**
 * Stamp libraryAssetId onto file-only mesh props that uniquely match a library GLB.
 * Leaves already-linked props alone. Does not change geometry.
 */
export function recoverLibraryLinks(rig,assets){
 if(!rig||!Array.isArray(rig.names))throw Error('Choose a shot with a character rig first.');
 if(!Array.isArray(assets))throw Error('Project asset library is required.');
 const next=structuredClone(rig);
 next.props??=[];
 const linked=[],unmatched=[],ambiguous=[],already=[];
 for(const prop of next.props){
  if(!prop||prop.shape!=='mesh')continue;
  const result=matchLibraryPropForMesh(prop,assets);
  if(result.status==='linked'){const asset=(assets||[]).find(a=>a&&a.id===result.assetId);if(asset)applyLibraryLinkStamp(prop,asset);already.push({propId:prop.id,name:prop.name,libraryAssetId:result.assetId});continue;}
  if(result.status==='match'){
   applyLibraryLinkStamp(prop,result.asset);
   linked.push({propId:prop.id,name:prop.name,libraryAssetId:result.asset.id,matched:result.asset.name});
   continue;
  }
  if(result.status==='ambiguous'){
   ambiguous.push({propId:prop.id,name:prop.name,candidates:result.assets.map(libraryLinkCandidateInfo)});
   continue;
  }
  unmatched.push({propId:prop.id,name:prop.name});
 }
 return {rig:next,linked,unmatched,ambiguous,already};
}

/**
 * File-only mesh props that match more than one Props-with-GLB card (read-only).
 * Does not stamp links. Use stampLibraryLinkChoice after the artist picks.
 */
export function listAmbiguousLibraryLinks(rig,assets){
 if(!rig||!Array.isArray(rig.names))throw Error('Choose a shot with a character rig first.');
 if(!Array.isArray(assets))throw Error('Project asset library is required.');
 const out=[];
 for(const prop of rig.props||[]){
  if(!prop||prop.shape!=='mesh')continue;
  const result=matchLibraryPropForMesh(prop,assets);
  if(result.status!=='ambiguous')continue;
  out.push({propId:prop.id,name:prop.name,candidates:result.assets.map(libraryLinkCandidateInfo)});
 }
 return out;
}

/**
 * Artist disambiguation: stamp one chosen Props-with-GLB card onto a file-only mesh prop.
 * Asset must be among the current match hits for that mesh. Does not change geometry.
 */
export function stampLibraryLinkChoice(rig,propId,assetId,assets){
 if(!rig||!Array.isArray(rig.names))throw Error('Choose a shot with a character rig first.');
 if(!Array.isArray(assets))throw Error('Project asset library is required.');
 if(typeof propId!=='string'||!propId.trim())throw Error('Choose an ambiguous mesh prop first.');
 if(!libraryIdOk(assetId))throw Error('Choose a Props-with-GLB library card.');
 const next=structuredClone(rig);
 next.props??=[];
 const prop=next.props.find(p=>p&&p.id===propId);
 if(!prop||prop.shape!=='mesh')throw Error('Choose a mesh stage prop to link.');
 if(libraryIdOk(prop.libraryAssetId)){
  if(prop.libraryAssetId.trim()===assetId.trim()){
   const already=assets.find(a=>a&&a.id===prop.libraryAssetId.trim());
   if(already)applyLibraryLinkStamp(prop,already);
   return {rig:next,propId:prop.id,libraryAssetId:prop.libraryAssetId.trim(),matched:already?.name||prop.libraryAssetId.trim(),already:true};
  }
  throw Error('That mesh is already linked to a different library card.');
 }
 const asset=assets.find(a=>a&&a.id===assetId.trim());
 if(!asset||!isLibraryStagePropGlb(asset))throw Error('Choose a prop library card with a GLB attached.');
 const match=matchLibraryPropForMesh(prop,assets);
 if(match.status==='match'){
  if(match.asset.id!==asset.id)throw Error('That library card is not the unique match for this mesh.');
 }else if(match.status==='ambiguous'){
  if(!match.assets.some(a=>a.id===asset.id))throw Error('That library card does not match this mesh (name, file, URL, or hash).');
 }else if(match.status==='unmatched'){
  throw Error('That library card does not match this mesh (name, file, URL, or hash).');
 }else{
  throw Error('That stage prop cannot take a library link.');
 }
 applyLibraryLinkStamp(prop,asset);
 return {rig:next,propId:prop.id,libraryAssetId:asset.id,matched:asset.name,already:false};
}

/** Persist SHA-256 on a Props-with-GLB card (asset + attached file when present). Returns normalized hash or ''. */
export function stampLibraryAssetContentHash(asset, hash){
 if(!asset||!hashOk(hash))return '';
 const norm=hash.trim().toLowerCase();
 asset.contentHash=norm;
 try{
  const file=asset.file;
  if(file&&typeof file==='object')file.contentHash=norm;
 }catch{/* keep asset-level hash */}
 return norm;
}

/** Clear stamped hash when the GLB is detached or replaced without a digest. */
export function clearLibraryAssetContentHash(asset){
 if(!asset)return;
 delete asset.contentHash;
 try{if(asset.file&&typeof asset.file==='object')delete asset.file.contentHash;}catch{/* ignore */}
}

/** Props-with-GLB cards that lack a usable contentHash (need ingest or backfill). */
export function libraryPropsMissingContentHash(assets){
 return (assets||[]).filter(a=>isLibraryStagePropGlb(a)&&!libraryAssetContentHash(a));
}

/**
 * Ingest-time stamp from local GLB bytes, a File/Blob, or a precomputed SHA-256 hex.
 * Call after attaching a .glb to a library card. Mutates asset.
 */
export async function ingestLibraryPropContentHash(asset, source,{hashFn=hashGlbBytes}={}){
 if(!asset)throw Error('Choose an asset library card.');
 let hash='';
 if(typeof source==='string'&&hashOk(source))hash=source.trim().toLowerCase();
 else if(source instanceof ArrayBuffer||(typeof ArrayBuffer!=='undefined'&&ArrayBuffer.isView&&ArrayBuffer.isView(source)))hash=await hashFn(source);
 else if(source&&typeof source.arrayBuffer==='function')hash=await hashFn(await source.arrayBuffer());
 else throw Error('Provide GLB bytes or a SHA-256 hex digest to stamp.');
 return stampLibraryAssetContentHash(asset,hash);
}

/**
 * Fetch attached GLB and stamp contentHash when the card lacks one.
 * Returns {status:'stamped'|'already'|'skipped', contentHash?, assetId?}.
 */
export async function backfillLibraryPropContentHash(asset,{fetchImpl=fetch,hashFn=hashGlbBytes}={}){
 if(!isLibraryStagePropGlb(asset))return {status:'skipped',assetId:asset?.id};
 const existing=libraryAssetContentHash(asset);
 if(existing)return {status:'already',contentHash:existing,assetId:asset.id};
 const file=libraryPropFile(asset);
 const response=await fetchImpl(libraryPropViewUrl(file));
 if(!response.ok)throw Error('The prop GLB is missing. Restore project media first.');
 const buffer=await response.arrayBuffer();
 if(buffer.byteLength>LIBRARY_PROP_MAX_BYTES)throw Error('Use a GLB under 50 MB.');
 const hash=await hashFn(buffer);
 stampLibraryAssetContentHash(asset,hash);
 return {status:'stamped',contentHash:hash,assetId:asset.id};
}

/**
 * One-click batch: stamp missing hashes on Props-with-GLB cards. Mutates matching assets.
 * Already-hashed cards are reported without refetch.
 */
export async function backfillLibraryPropContentHashes(assets,{fetchImpl=fetch,hashFn=hashGlbBytes}={}){
 const stamped=[],already=[],failed=[];
 for(const asset of assets||[]){
  if(!isLibraryStagePropGlb(asset))continue;
  try{
   const result=await backfillLibraryPropContentHash(asset,{fetchImpl,hashFn});
   if(result.status==='stamped')stamped.push({assetId:asset.id,name:asset.name,contentHash:result.contentHash});
   else if(result.status==='already')already.push({assetId:asset.id,name:asset.name,contentHash:result.contentHash});
  }catch(e){
   failed.push({assetId:asset.id,name:asset.name,error:String(e?.message||e)});
  }
 }
 return {stamped,already,failed};
}

/** Stage mesh props that lack a usable contentHash. */
export function meshPropsMissingContentHash(rig){
 return (rig?.props||[]).filter(p=>p&&p.shape==='mesh'&&!hashOk(p.contentHash));
}

/** File-only stage mesh props (no libraryAssetId) — Link file meshes candidates. */
export function fileOnlyMeshProps(rig){
 return (rig?.props||[]).filter(p=>p&&p.shape==='mesh'&&!libraryIdOk(p.libraryAssetId));
}

/** How many file-only stage meshes Link file meshes to library could still try. */
export function linkableFileMeshCount(rig){
 return fileOnlyMeshProps(rig).length;
}

/** How many stage meshes Stamp missing mesh hashes could still fill. */
export function stampableMissingMeshHashCount(rig){
 return meshPropsMissingContentHash(rig).length;
}

/**
 * Stamp contentHash on legacy stage mesh props from linked / uniquely matched library cards.
 * Sync only (uses hashes already on Props-with-GLB cards). Does not change geometry or force new links.
 * Unique matches get hash + missing sourceFileName/sourceUrl; libraryAssetId stays as-is.
 * Returns {rig, stamped, already, skipped}.
 */
export function backfillMeshPropContentHashes(rig,assets){
 if(!rig||!Array.isArray(rig.names))throw Error('Choose a shot with a character rig first.');
 if(!Array.isArray(assets))throw Error('Project asset library is required.');
 const next=structuredClone(rig);
 next.props??=[];
 const stamped=[],already=[],skipped=[];
 for(const prop of next.props){
  if(!prop||prop.shape!=='mesh')continue;
  if(hashOk(prop.contentHash)){
   already.push({propId:prop.id,name:prop.name,contentHash:prop.contentHash.trim().toLowerCase()});
   continue;
  }
  let asset=null;
  if(libraryIdOk(prop.libraryAssetId)){
   asset=(assets||[]).find(a=>a&&a.id===prop.libraryAssetId.trim())||null;
   if(asset&&!isLibraryStagePropGlb(asset))asset=null;
  }else{
   const result=matchLibraryPropForMesh(prop,assets);
   if(result.status==='match')asset=result.asset;
  }
  if(!asset){skipped.push({propId:prop.id,name:prop.name,reason:'no-library-match'});continue;}
  const hash=libraryAssetContentHash(asset);
  if(!hash){skipped.push({propId:prop.id,name:prop.name,reason:'library-missing-hash',assetId:asset.id});continue;}
  prop.contentHash=hash;
  if(!prop.sourceFileName){
   try{prop.sourceFileName=mediaName(libraryPropFile(asset));}catch{/* keep unset */}
  }
  if(!prop.sourceUrl){
   try{prop.sourceUrl=libraryPropViewUrl(libraryPropFile(asset));}catch{/* keep unset */}
  }
  stamped.push({propId:prop.id,name:prop.name,contentHash:hash,assetId:asset.id});
 }
 return {rig:next,stamped,already,skipped};
}

export async function hashGlbBytes(buffer){
 const bytes=buffer instanceof ArrayBuffer?buffer:buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
