import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {starterCharacter,jointsOf,faceControls,disposeObject,readRigGLB} from '../../simple-editor/director-3d-engine.js';
import {
 isLibraryStagePropGlb,libraryPropFile,libraryPropViewUrl,libraryPropLabel,libraryPropPlacementName,
 linkShotAsset,registerLibraryPropHost,getLibraryPropHost,appendLibraryPropToModel,placeLibraryPropOffline,
 stampLibraryAssetContentHash,clearLibraryAssetContentHash,libraryPropsMissingContentHash,
 ingestLibraryPropContentHash,backfillLibraryPropContentHash,backfillLibraryPropContentHashes,
 libraryAssetContentHash,hashGlbBytes,meshPropsMissingContentHash,stampableMissingMeshHashCount,backfillMeshPropContentHashes
} from '../../simple-editor/director-library-prop.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {validateRig3D} from '../../simple-editor/director-3d-state.js';

globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};

const good={id:'a1',kind:'prop',name:'Table',brief:'',file:{name:'table.glb',subfolder:'studio-director',type:'input'}};
assert.equal(isLibraryStagePropGlb(good),true);
assert.match(libraryPropLabel(good),/Library GLB.+stage prop/);
assert.equal(libraryPropPlacementName(good),'Table');
assert.equal(libraryPropFile(good),good.file);
assert.match(libraryPropViewUrl(good.file),/filename=table\.glb/);

assert.equal(isLibraryStagePropGlb({...good,kind:'character'}),false);
assert.equal(isLibraryStagePropGlb({...good,file:{name:'table.png',type:'input'}}),false);
assert.equal(isLibraryStagePropGlb({...good,setKit:{}}),false);
assert.throws(()=>libraryPropFile({...good,kind:'set'}),/prop library/);
assert.throws(()=>libraryPropFile({...good,file:undefined}),/Attach a GLB/);
assert.throws(()=>libraryPropPlacementName({...good,name:'  '}),/name/);

const shot={id:'s1',title:'Shot',assetIds:[]};
assert.equal(linkShotAsset(shot,'a1'),true);
assert.deepEqual(shot.assetIds,['a1']);
assert.equal(linkShotAsset(shot,'a1'),false);

let placed=null;
const unregister=registerLibraryPropHost('s1',{place:async asset=>{placed=asset.id;},busy:()=>false});
assert.equal(getLibraryPropHost('s1').busy(),false);
await getLibraryPropHost('s1').place(good);
assert.equal(placed,'a1');
unregister();
assert.equal(getLibraryPropHost('s1'),null);

const prop=new THREE.Group();
const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.1,.3),new THREE.MeshStandardMaterial({color:'#336699'}));
prop.add(mesh);
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),base=bones[0].position.clone();
const rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[]};
const before=JSON.stringify(rig);
const uploads=[];
const result=await appendLibraryPropToModel({
 root,rest,baseRoot:base,rig,propScene:prop,name:'Library table',baseFaces:faceControls(root).map(c=>c.base),libraryAssetId:'a1',
 upload:async file=>{uploads.push(file.name);return {name:file.name,subfolder:'studio-director',type:'input'};}
});
assert.equal(JSON.stringify(rig),before);
assert.equal(result.rig.props.length,1);
assert.equal(result.rig.props[0].shape,'mesh');
assert.equal(result.rig.props[0].name,'Library table');
assert.equal(result.rig.props[0].libraryAssetId,'a1');
assert.ok(result.rig.model?.name?.startsWith('prop-stage-'));
assert.equal(uploads.length,1);
validateRig3D(result.rig);
disposeObject(result.root);disposeObject(root);disposeObject(prop);

const glb=await new GLTFExporter().parseAsync((()=>{const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.15),new THREE.MeshStandardMaterial({color:'#aa4422'})));return g;})(),{binary:true});
const bytes=Buffer.from(glb);
const media={name:'crate.glb',subfolder:'studio-director',type:'input'};
const asset={id:'crate',kind:'prop',name:'Crate',file:media,contentHash:'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'};
const target={id:'shot-offline',title:'Offline',seconds:5};
const fetchImpl=async url=>{
 const u=String(url);
 if(u.includes('crate.glb'))return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 throw Error('unexpected fetch '+u);
};
const offline=await placeLibraryPropOffline(target,asset,{
 upload:async file=>({name:file.name,subfolder:'studio-director',type:'input'}),
 fetchImpl
});
assert.equal(offline.rig.props.length,1);
assert.equal(offline.rig.props[0].name,'Crate');
assert.equal(offline.rig.props[0].libraryAssetId,'crate');
assert.equal(offline.rig.props[0].contentHash,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
assert.ok(offline.rig.model);
validateRig3D(offline.rig);
disposeObject(offline.root);

const project=newProject();
project.assets.push(good);
project.scenes[0].shots.push({id:'shot-a',title:'A',seconds:2,action:'',camera:'',dialogue:'',assetIds:[good.id]});
validateProject(project);

assert.throws(()=>registerLibraryPropHost('',{place:async()=>{}}),/shot id/);


// Ingest / backfill contentHash on Props-with-GLB library cards
const bare={id:'bare',kind:'prop',name:'Bare',file:{name:'bare.glb',subfolder:'studio-director',type:'input'}};
assert.equal(libraryAssetContentHash(bare),'');
assert.deepEqual(libraryPropsMissingContentHash([bare,good,asset]).map(a=>a.id).sort(),['a1','bare']);
const stamped=stampLibraryAssetContentHash(bare,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
assert.equal(stamped,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
assert.equal(bare.contentHash,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
assert.equal(bare.file.contentHash,'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd');
clearLibraryAssetContentHash(bare);
assert.equal(libraryAssetContentHash(bare),'');
assert.equal(bare.file.contentHash,undefined);

const sampleBytes=new Uint8Array([9,8,7,6]).buffer;
const ingestHash=await ingestLibraryPropContentHash(bare,sampleBytes);
assert.match(ingestHash,/^[0-9a-f]{64}$/);
assert.equal(bare.contentHash,ingestHash);
assert.equal(bare.file.contentHash,ingestHash);
const expected=await hashGlbBytes(sampleBytes);
assert.equal(ingestHash,expected);

const legacy={id:'legacy',kind:'prop',name:'Legacy',file:{name:'legacy.glb',type:'input'}};
const backfillFetch=async url=>{
 if(String(url).includes('legacy.glb'))return {ok:true,arrayBuffer:async()=>sampleBytes};
 throw Error('unexpected '+url);
};
const back=await backfillLibraryPropContentHash(legacy,{fetchImpl:backfillFetch});
assert.equal(back.status,'stamped');
assert.equal(back.contentHash,expected);
assert.equal(legacy.contentHash,expected);
const again=await backfillLibraryPropContentHash(legacy,{fetchImpl:async()=>{throw Error('should not refetch');}});
assert.equal(again.status,'already');
assert.equal(again.contentHash,expected);

const need={id:'need',kind:'prop',name:'Need',file:{name:'need.glb',type:'input'}};
const batchFetch=async url=>{
 const u=String(url);
 if(u.includes('need.glb')||u.includes('legacy.glb'))return {ok:true,arrayBuffer:async()=>sampleBytes};
 throw Error('unexpected '+u);
};
const batch=await backfillLibraryPropContentHashes([need,legacy,{id:'skip',kind:'character',name:'X'}],{fetchImpl:batchFetch});
assert.equal(batch.stamped.length,1);
assert.equal(batch.stamped[0].assetId,'need');
assert.equal(batch.already.length,1);
assert.equal(batch.failed.length,0);
assert.equal(need.contentHash,expected);
assert.equal(stampLibraryAssetContentHash(bare,'zz'),'');
assert.equal((await backfillLibraryPropContentHash({id:'char',kind:'character',name:'C',file:{name:'c.glb',type:'input'}})).status,'skipped');


// Legacy stage mesh contentHash backfill from library cards (sync).
const legacyLinked={names:['Root'],props:[{id:'old',name:'Crate',shape:'mesh',color:'#abcdef',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'crate',sourceFileName:'crate.glb'}]};
const hashedCard={id:'crate',kind:'prop',name:'Crate',file:{name:'crate.glb',type:'input'},contentHash:'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'};
assert.equal(meshPropsMissingContentHash(legacyLinked).length,1);
const meshFill=backfillMeshPropContentHashes(legacyLinked,[hashedCard]);
assert.equal(meshFill.stamped.length,1);
assert.equal(meshFill.rig.props[0].contentHash,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
assert.equal(legacyLinked.props[0].contentHash,undefined);
const againMesh=backfillMeshPropContentHashes(meshFill.rig,[hashedCard]);
assert.equal(againMesh.stamped.length,0);
assert.equal(againMesh.already.length,1);
const fileOnly={names:['Root'],props:[{id:'f',name:'Crate',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],sourceFileName:'crate.glb'}]};
const byFile=backfillMeshPropContentHashes(fileOnly,[hashedCard]);
assert.equal(byFile.stamped.length,1);
assert.equal(byFile.rig.props[0].libraryAssetId,undefined);
assert.equal(byFile.rig.props[0].contentHash,'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');


// Stamp missing mesh hashes disabled-when-empty (Body Set layout chrome)
assert.equal(stampableMissingMeshHashCount(null),0);
assert.equal(stampableMissingMeshHashCount({names:['Root'],props:[]}),0);
assert.equal(stampableMissingMeshHashCount({names:['Root'],props:[{id:'box',name:'Box',shape:'box'}]}),0);
assert.equal(stampableMissingMeshHashCount(legacyLinked),1);
assert.equal(stampableMissingMeshHashCount(meshFill.rig),0);
assert.equal(stampableMissingMeshHashCount(fileOnly),1);
assert.equal(stampableMissingMeshHashCount(byFile.rig),0);
const multiMissing={names:['Root'],props:[
 {id:'a',name:'A',shape:'mesh',color:'#fff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'crate'},
 {id:'b',name:'B',shape:'mesh',color:'#fff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],sourceFileName:'crate.glb'},
 {id:'c',name:'C',shape:'mesh',color:'#fff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'},
]};
assert.equal(stampableMissingMeshHashCount(multiMissing),2);

const roomSrc=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../../simple-editor/director-room.js'),'utf8');
assert.match(roomSrc,/stampableMissingMeshHashCount/);
assert.match(roomSrc,/syncStampMissingHashesButton/);
assert.match(roomSrc,/Stamp missing mesh hashes/);
assert.match(roomSrc,/No stage meshes missing a content hash/);
assert.match(roomSrc,/stampHashes\.disabled=!stampable/);
console.log('Library GLB stage prop passed: detect/label/link, host registry, append+upload, offline starter embed, contentHash ingest/backfill, legacy mesh hash stamp, stampable count + Stamp button wiring, project validate.');