import assert from 'node:assert/strict';
import {
 normalizeLibraryMatchKey, libraryPropMatchKeys, meshPropMatchKeys,
 matchLibraryPropForMesh, resolveLibraryLinkForImport, recoverLibraryLinks, hashGlbBytes,
 isLibraryStagePropGlb, libraryLinkCandidateInfo, listAmbiguousLibraryLinks, stampLibraryLinkChoice,
 libraryAssetContentHash, linkableFileMeshCount, fileOnlyMeshProps
} from '../../simple-editor/director-library-prop.js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {makeSetKitAsset, setKitLibraryMeshes, setKitMeshNodeRefs} from '../../simple-editor/director-set-kit.js';
import {validatePerformance} from '../../simple-editor/director-performance-state.js';

assert.equal(normalizeLibraryMatchKey('Props/Oak Table.GLB'), 'oak table');
assert.equal(normalizeLibraryMatchKey('/view?filename=table.glb&subfolder=x&type=input'), 'table');
assert.equal(normalizeLibraryMatchKey(''), '');

const table={id:'lib-table',kind:'prop',name:'Oak Table',file:{name:'table.glb',subfolder:'studio-director',type:'input'}};
const crate={id:'lib-crate',kind:'prop',name:'Crate',file:{name:'crate.glb',type:'input'},contentHash:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'};
const decoy={id:'lib-decoy',kind:'prop',name:'Oak Table',file:{name:'oak-table-v2.glb',type:'input'}};
assert.equal(isLibraryStagePropGlb(table),true);
assert.ok([...libraryPropMatchKeys(table)].includes('file:table'));
assert.ok([...libraryPropMatchKeys(table)].some(k=>k.startsWith('url:')));
assert.ok([...libraryPropMatchKeys(crate)].includes('hash:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'));
assert.equal(libraryAssetContentHash(crate),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(libraryAssetContentHash(table),'');

assert.equal(matchLibraryPropForMesh({shape:'box',name:'X'},[table]).status,'skip');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'Oak Table',libraryAssetId:'lib-table'},[table]).status,'linked');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'Oak Table'},[table]).status,'match');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'Imported',sourceFileName:'table.glb'},[table]).asset.id,'lib-table');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'X',sourceUrl:'/view?filename=table.glb&subfolder=studio-director&type=input'},[table]).asset.id,'lib-table');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'X',contentHash:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'},[crate]).asset.id,'lib-crate');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'Oak Table'},[table,decoy]).status,'ambiguous');
assert.equal(matchLibraryPropForMesh({shape:'mesh',name:'Mystery'},[table]).status,'unmatched');
assert.equal(resolveLibraryLinkForImport({sourceFileName:'table.glb'},[table]),'lib-table');
assert.equal(resolveLibraryLinkForImport({name:'Mystery'},[table]),null);

const hash=await hashGlbBytes(new Uint8Array([1,2,3,4]).buffer);
assert.match(hash,/^[0-9a-f]{64}$/);

const before={
 names:['Root'],
 props:[
  {id:'mesh-table',name:'Oak Table',shape:'mesh',color:'#ffffff',joint:null,position:[1,0,0],rotation:[0,0,0],size:[1,1,1]},
  {id:'mesh-file',name:'Imported prop',shape:'mesh',color:'#abcdef',joint:null,position:[0,0,0],rotation:[0,10,0],size:[.5,.5,.5],sourceFileName:'crate.glb'},
  {id:'mesh-hash',name:'Hashed',shape:'mesh',color:'#111111',joint:null,position:[0,1,0],rotation:[0,0,0],size:[1,1,1],contentHash:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'},
  {id:'mesh-gone',name:'No Match',shape:'mesh',color:'#222222',joint:null,position:[0,0,1],rotation:[0,0,0],size:[1,1,1]},
  {id:'mesh-linked',name:'Already',shape:'mesh',color:'#333333',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'lib-table'},
  {id:'box',name:'Crate box',shape:'box',color:'#444444',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}
 ]
};
const snap=JSON.stringify(before);
const result=recoverLibraryLinks(before,[table,crate]);
assert.equal(JSON.stringify(before),snap);
assert.equal(result.linked.length,3);
assert.equal(result.already.length,1);
assert.equal(result.unmatched.length,1);
assert.equal(result.ambiguous.length,0);
assert.equal(result.rig.props.find(p=>p.id==='mesh-table').libraryAssetId,'lib-table');
assert.equal(result.rig.props.find(p=>p.id==='mesh-file').libraryAssetId,'lib-crate');
assert.equal(result.rig.props.find(p=>p.id==='mesh-file').contentHash,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(result.rig.props.find(p=>p.id==='mesh-hash').contentHash,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(result.rig.props.find(p=>p.id==='mesh-hash').libraryAssetId,'lib-crate');
assert.equal(result.rig.props.find(p=>p.id==='mesh-gone').libraryAssetId,undefined);
assert.equal(result.rig.props.find(p=>p.id==='mesh-linked').libraryAssetId,'lib-table');
assert.ok(result.rig.props.find(p=>p.id==='mesh-table').sourceFileName);
validatePerformance(result.rig);

const linkedOnly={...result.rig,props:result.rig.props.filter(p=>p.shape!=='mesh'||p.libraryAssetId)};
const kit=makeSetKitAsset(linkedOnly,'Recovered kit');
assert.equal(setKitLibraryMeshes(kit).length,4);
const legacyKit=makeSetKitAsset(before,'Legacy');
assert.equal(setKitLibraryMeshes(legacyKit).length,1);
assert.equal(setKitMeshNodeRefs(legacyKit).length,4);
assert.ok(setKitMeshNodeRefs(legacyKit).every(r=>['Oak Table','Imported prop','Hashed','No Match'].includes(r.meshNodeName)));

const ambiguous=recoverLibraryLinks({names:['Root'],props:[{id:'m',name:'Oak Table',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]},[table,decoy]);
assert.equal(ambiguous.ambiguous.length,1);
assert.equal(ambiguous.linked.length,0);

assert.throws(()=>recoverLibraryLinks(null,[table]),/character rig/);
assert.throws(()=>recoverLibraryLinks(before,null),/asset library/);

const info=libraryLinkCandidateInfo(table);
assert.equal(info.id,'lib-table');
assert.equal(info.name,'Oak Table');
assert.equal(info.fileName,'table.glb');

const ambRig={names:['Root'],props:[{id:'m',name:'Oak Table',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]};
const listed=listAmbiguousLibraryLinks(ambRig,[table,decoy]);
assert.equal(listed.length,1);
assert.equal(listed[0].propId,'m');
assert.equal(listed[0].candidates.length,2);
assert.ok(listed[0].candidates.every(c=>c.id&&c.name&&typeof c.fileName==='string'));
assert.equal(listAmbiguousLibraryLinks(before,[table,crate]).length,0);

const ambSnap=JSON.stringify(ambRig);
const stamped=stampLibraryLinkChoice(ambRig,'m','lib-decoy',[table,decoy]);
assert.equal(JSON.stringify(ambRig),ambSnap);
assert.equal(stamped.libraryAssetId,'lib-decoy');
assert.equal(stamped.matched,'Oak Table');
assert.equal(stamped.already,false);
assert.equal(stamped.rig.props[0].libraryAssetId,'lib-decoy');
assert.ok(stamped.rig.props[0].sourceFileName);
assert.equal(listAmbiguousLibraryLinks(stamped.rig,[table,decoy]).length,0);
validatePerformance(stamped.rig);

const again=stampLibraryLinkChoice(stamped.rig,'m','lib-decoy',[table,decoy]);
assert.equal(again.already,true);
assert.throws(()=>stampLibraryLinkChoice(stamped.rig,'m','lib-table',[table,decoy]),/already linked/);
assert.throws(()=>stampLibraryLinkChoice(ambRig,'m','lib-crate',[table,decoy,crate]),/does not match/);
assert.throws(()=>stampLibraryLinkChoice(ambRig,'', 'lib-table',[table]),/ambiguous mesh prop/);
assert.throws(()=>stampLibraryLinkChoice(null,'m','lib-table',[table]),/character rig/);
assert.throws(()=>stampLibraryLinkChoice(ambRig,'m','lib-table',null),/asset library/);

const enriched=recoverLibraryLinks(ambRig,[table,decoy]);
assert.equal(enriched.ambiguous[0].candidates[0].id,'lib-table');
assert.equal(enriched.ambiguous[0].candidates[0].name,'Oak Table');

// Legacy already-linked mesh missing contentHash: recover enriches from library card without re-import.
const legacyAlreadyHash={names:['Root'],props:[{id:'old',name:'Crate',shape:'mesh',color:'#abcdef',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'lib-crate',sourceFileName:'crate.glb'}]};
const enrichedHash=recoverLibraryLinks(legacyAlreadyHash,[table,crate]);
assert.equal(enrichedHash.already.length,1);
assert.equal(enrichedHash.rig.props[0].libraryAssetId,'lib-crate');
assert.equal(enrichedHash.rig.props[0].contentHash,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
// stampLibraryLinkChoice also stamps contentHash from the chosen card.
const ambHashRig={names:['Root'],props:[{id:'m',name:'Crate',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],sourceFileName:'crate.glb'}]};
const stampedHash=stampLibraryLinkChoice(ambHashRig,'m','lib-crate',[table,crate]);
assert.equal(stampedHash.rig.props[0].contentHash,'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
assert.equal(stampedHash.already,false);


// Link file meshes disabled-when-empty (Body Set layout chrome)
assert.equal(linkableFileMeshCount(null),0);
assert.equal(linkableFileMeshCount({names:['Root'],props:[]}),0);
assert.equal(linkableFileMeshCount({names:['Root'],props:[{id:'box',name:'Box',shape:'box'}]}),0);
assert.equal(linkableFileMeshCount(before),4);
assert.equal(fileOnlyMeshProps(before).length,4);
assert.equal(linkableFileMeshCount(result.rig),1);
assert.equal(result.rig.props.filter(p=>p.shape==='mesh'&&!p.libraryAssetId).length,1);
assert.equal(linkableFileMeshCount(linkedOnly),0);
assert.equal(linkableFileMeshCount(ambRig),1);
assert.equal(linkableFileMeshCount(stamped.rig),0);
assert.equal(linkableFileMeshCount(legacyAlreadyHash),0);

const roomSrc=readFileSync(join(dirname(fileURLToPath(import.meta.url)),'../../simple-editor/director-room.js'),'utf8');
assert.match(roomSrc,/linkableFileMeshCount/);
assert.match(roomSrc,/syncLinkFileMeshesButton/);
assert.match(roomSrc,/Link file meshes to library/);
assert.match(roomSrc,/No file-only mesh props to link/);
assert.match(roomSrc,/recover\.disabled=!linkable/);

console.log('Library link recovery passed: filename/url/hash/name match, ambiguous skip, stampLibraryLinkChoice picker, contentHash stamp on recover/place meta, set-kit eligibility, nonmutation, linkable count + Link button wiring.');

