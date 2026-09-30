import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addRoomLayout} from '../../simple-editor/director-room.js';
import {makeSetKitAsset,applySetKit,validateSetKitAsset,worldStageProps,setKitLibraryMeshes,setKitMeshNodeRefs,setKitMeshRefLibraryFallbacks,meshRefSkipKey,embedSetKitLibraryMeshes,applyLibraryMeshKitTransform,setKitLabel,summarizeSetKit,setKitApplyPreview,setKitApplyGate,setKitApplyConfirmMessage,SET_KIT_FORMAT,backfillSetKitMeshRefContentHashes,backfillProjectLegacyContentHashes} from '../../simple-editor/director-set-kit.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {deliveryChecks} from '../../simple-editor/director-delivery.js';
import {STAGES} from '../../simple-editor/director-production.js';

const base={names:['Root','Hand'],props:[{id:'held',name:'Cup',shape:'box',color:'#ffaa00',joint:1,position:[0,0,0],rotation:[0,0,0],size:[.1,.1,.1]}]};
const roomed=addRoomLayout(base,{name:'Hall',width:6,depth:5,height:3,doorWidth:1.2,doorHeight:2.2});
assert.equal(worldStageProps(roomed).length,5);
assert.equal(roomed.props.filter(p=>p.joint!==null).length,1);

const before=JSON.stringify(roomed);
const kit=makeSetKitAsset(roomed,'Hall kit',{brief:'Open hall'});
assert.equal(JSON.stringify(roomed),before);
assert.equal(kit.kind,'set');
assert.equal(kit.setKit.format,SET_KIT_FORMAT);
assert.equal(kit.setKit.props.length,5);
assert.ok(kit.setKit.props.every(p=>p.joint===null&&!p.attachments&&p.firstFrame===undefined));
assert.equal(kit.setKit.props.some(p=>p.id==='held'),false);
assert.equal(setKitLibraryMeshes(kit).length,0);
assert.equal(setKitMeshNodeRefs(kit).length,0);
assert.match(setKitLabel(kit),/5 stage props/);

const project=newProject();
project.assets.push(kit);
validateProject(project);

const merged=applySetKit(roomed,kit,{mode:'merge'});
assert.equal(JSON.stringify(roomed),before);
assert.equal(merged.props.filter(p=>p.joint!==null).length,1);
assert.equal(merged.props.filter(p=>p.joint===null).length,10);
assert.equal(new Set(merged.props.map(p=>p.id)).size,merged.props.length);

const replaced=applySetKit(roomed,kit,{mode:'replace-world'});
assert.equal(replaced.props.filter(p=>p.joint!==null).map(p=>p.id).join(),'held');
assert.equal(replaced.props.filter(p=>p.joint===null).length,5);
assert.ok(replaced.props.every(p=>p.id!==kit.setKit.props[0].id));

const empty={names:['Root'],props:[]};
assert.throws(()=>makeSetKitAsset(empty,'Empty'),/stage props|room layout/);
assert.throws(()=>makeSetKitAsset(roomed,''),/name/);
const blankMeshRig={names:['Root'],props:[{id:'mesh',name:'   ',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]};
assert.throws(()=>makeSetKitAsset(blankMeshRig,'Meshy'),/library GLB link|mesh name|Mesh stage props/);
assert.throws(()=>applySetKit(roomed,{id:'x',kind:'set',name:'Bad',setKit:{format:SET_KIT_FORMAT,version:1,props:[]}},{mode:'merge'}),/1-24|1–24|need/);

const linkedMeshRig={names:['Root'],props:[
 {id:'table',name:'Table',shape:'mesh',color:'#aabbcc',joint:null,position:[1,0,2],rotation:[0,45,0],size:[1.2,1,1.2],libraryAssetId:'lib-table'},
 {id:'box',name:'Crate',shape:'box',color:'#112233',joint:null,position:[0,0,0],rotation:[0,0,0],size:[.5,.5,.5]}
]};
const meshKit=makeSetKitAsset(linkedMeshRig,'Furnished');
assert.equal(meshKit.setKit.props.length,2);
assert.equal(setKitLibraryMeshes(meshKit).length,1);
assert.equal(setKitMeshNodeRefs(meshKit).length,0);
assert.equal(setKitLibraryMeshes(meshKit)[0].libraryAssetId,'lib-table');
assert.match(setKitLabel(meshKit),/library mesh/);
assert.throws(()=>applySetKit(linkedMeshRig,meshKit,{mode:'merge'}),/library mesh props|Body/);
const primitivesOnly=applySetKit(linkedMeshRig,meshKit,{mode:'replace-world',allowPendingMeshes:true});
assert.equal(primitivesOnly.props.filter(p=>p.shape==='box').length,1);
assert.equal(primitivesOnly.props.filter(p=>p.shape==='mesh').length,0);

let embedCalls=0;
const embedded=await embedSetKitLibraryMeshes(primitivesOnly,setKitLibraryMeshes(meshKit),{
 resolveLibraryAsset:id=>id==='lib-table'?{id:'lib-table',kind:'prop',name:'Table',file:{name:'table.glb',type:'input'}}:null,
 embed:async(rig,asset,{name,libraryAssetId})=>{
  embedCalls++;
  assert.equal(asset.id,'lib-table');
  assert.equal(name,'Table');
  assert.equal(libraryAssetId,'lib-table');
  const propId='placed-'+embedCalls;
  const next=structuredClone(rig);
  next.props=[...(next.props||[]),{id:propId,name,shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId}];
  return {rig:next,propId};
 }
});
assert.equal(embedCalls,1);
const placed=embedded.props.find(p=>p.shape==='mesh');
assert.equal(placed.libraryAssetId,'lib-table');
assert.deepEqual(placed.position,[1,0,2]);
assert.deepEqual(placed.rotation,[0,45,0]);
assert.deepEqual(placed.size,[1.2,1,1.2]);
assert.equal(placed.color,'#aabbcc');

const stamped=applyLibraryMeshKitTransform(
 {names:['Root'],props:[{id:'p1',name:'X',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]},
 'p1',
 {libraryAssetId:'lib-table',name:'Table',color:'#aabbcc',position:[1,0,2],rotation:[0,45,0],size:[1.2,1,1.2]}
);
assert.deepEqual(stamped.props[0].position,[1,0,2]);

// Same-shot mesh-ref-by-name: unlinked mesh saves as meshNodeName; apply rearranges without embed.
const namedMeshRig={names:['Root','Hand'],props:[
 {id:'held',name:'Cup',shape:'box',color:'#ffaa00',joint:1,position:[0,0,0],rotation:[0,0,0],size:[.1,.1,.1]},
 {id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]},
 {id:'lamp',name:'Lamp',shape:'mesh',color:'#112233',joint:null,position:[2,0,0],rotation:[0,10,0],size:[.4,.8,.4]},
 {id:'crate',name:'Crate',shape:'box',color:'#445566',joint:null,position:[1,0,1],rotation:[0,0,0],size:[.5,.5,.5]}
]};
const refKit=makeSetKitAsset(namedMeshRig,'Lounge layout');
assert.equal(setKitLibraryMeshes(refKit).length,0);
assert.equal(setKitMeshNodeRefs(refKit).length,2);
assert.deepEqual(setKitMeshNodeRefs(refKit).map(r=>r.meshNodeName).sort(),['Lamp','Sofa']);
assert.match(setKitLabel(refKit),/mesh ref/);
const sofaEntry=refKit.setKit.props.find(p=>p.meshNodeName==='Sofa');
sofaEntry.position=[3,0,-1];
sofaEntry.rotation=[0,90,0];
sofaEntry.size=[1.5,1,1];
sofaEntry.color='#ff0000';
const rearranged=applySetKit(namedMeshRig,refKit,{mode:'merge'});
assert.equal(JSON.stringify(namedMeshRig.props.find(p=>p.id==='sofa').position),JSON.stringify([0,0,0]));
const sofaAfter=rearranged.props.find(p=>p.id==='sofa');
assert.equal(sofaAfter.id,'sofa');
assert.deepEqual(sofaAfter.position,[3,0,-1]);
assert.deepEqual(sofaAfter.rotation,[0,90,0]);
assert.deepEqual(sofaAfter.size,[1.5,1,1]);
assert.equal(sofaAfter.color,'#ff0000');
assert.equal(rearranged.props.filter(p=>p.joint!==null).length,1);
assert.equal(rearranged.props.filter(p=>p.shape==='mesh').length,2);

const missingTarget={names:['Root'],props:[{id:'only',name:'Other',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]};
assert.throws(()=>applySetKit(missingTarget,refKit,{mode:'merge'}),/no matching mesh stage prop|Sofa|contentHash|Import or place|no mesh stage prop named/);

const replacedRefs=applySetKit(namedMeshRig,refKit,{mode:'replace-world'});
assert.equal(replacedRefs.props.filter(p=>p.joint!==null).map(p=>p.id).join(),'held');
assert.equal(replacedRefs.props.filter(p=>p.shape==='mesh').length,2);
assert.equal(replacedRefs.props.find(p=>p.id==='sofa').position.join(),'3,0,-1');
assert.equal(replacedRefs.props.filter(p=>p.joint===null&&p.shape==='box').length,1);

const dupNames={names:['Root'],props:[
 {id:'a',name:'Table',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]},
 {id:'b',name:'Table',shape:'mesh',color:'#000000',joint:null,position:[1,0,0],rotation:[0,0,0],size:[1,1,1]}
]};
assert.throws(()=>makeSetKitAsset(dupNames,'Dup'),/unique names|mesh refs/);

assert.throws(()=>validateSetKitAsset({
 id:'bad',kind:'set',name:'Both',setKit:{format:SET_KIT_FORMAT,version:1,props:[
  {id:'m1',name:'X',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'lib',meshNodeName:'X'}
 ]}
}),/either libraryAssetId|not both/);

kit.kind='prop';
assert.throws(()=>validateSetKitAsset(kit),/kind/);
kit.kind='set';

const shot={id:'shot-a',title:'A',seconds:2,action:'Walk',media:{name:'fixture.png'},production:Object.fromEntries(STAGES.map(x=>[x,'Not needed'])),assetIds:[kit.id]};
project.scenes[0].shots=[shot];
let issues=deliveryChecks(project);
assert.ok(issues.some(i=>i.kind==='Assets'&&/Hall kit/.test(i.message)&&/Not started/.test(i.message)));
kit.readiness='Approved';
issues=deliveryChecks(project);
assert.equal(issues.filter(i=>i.kind==='Assets').length,0);
validateProject(project);
project.assets.push(meshKit);
project.assets.push(refKit);
validateProject(project);

const full={names:['Root'],props:Array.from({length:20},(_,i)=>({id:'w'+i,name:'Wall '+i,shape:'box',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}))};
const fat=makeSetKitAsset(addRoomLayout({names:['Root'],props:[]},{name:'Extra',width:6,depth:5,height:3,doorWidth:1.2,doorHeight:2.2}),'Extra');
assert.throws(()=>applySetKit(full,fat,{mode:'merge'}),/24/);
assert.equal(applySetKit(full,fat,{mode:'replace-world'}).props.length,5);


// Mesh-ref identity hardening: contentHash preferred, then stable prop id, then name.
const sofaHash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const lampHash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const hashedMeshRig={names:['Root'],props:[
 {id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:sofaHash},
 {id:'lamp',name:'Lamp',shape:'mesh',color:'#112233',joint:null,position:[2,0,0],rotation:[0,10,0],size:[.4,.8,.4],contentHash:lampHash}
]};
const hashKit=makeSetKitAsset(hashedMeshRig,'Hashed lounge');
assert.equal(setKitMeshNodeRefs(hashKit).length,2);
const sofaRef=hashKit.setKit.props.find(p=>p.meshNodeName==='Sofa');
assert.equal(sofaRef.contentHash,sofaHash);
assert.equal(setKitMeshNodeRefs(hashKit).find(r=>r.meshNodeName==='Sofa').contentHash,sofaHash);
sofaRef.position=[5,0,-2];
sofaRef.rotation=[0,45,0];
sofaRef.size=[2,1,1];
sofaRef.color='#00ff00';
// Artist renames Sofa -> Couch; contentHash still matches (name alone would miss).
const renamed={names:['Root'],props:[
 {id:'sofa',name:'Couch',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:sofaHash},
 {id:'lamp',name:'Lamp',shape:'mesh',color:'#112233',joint:null,position:[2,0,0],rotation:[0,10,0],size:[.4,.8,.4],contentHash:lampHash}
]};
const byHash=applySetKit(renamed,hashKit,{mode:'merge'});
const couch=byHash.props.find(p=>p.id==='sofa');
assert.equal(couch.id,'sofa');
assert.equal(couch.name,'Sofa');
assert.deepEqual(couch.position,[5,0,-2]);
assert.deepEqual(couch.rotation,[0,45,0]);
assert.deepEqual(couch.size,[2,1,1]);
assert.equal(couch.color,'#00ff00');
assert.equal(couch.contentHash,sofaHash);

// No contentHash: stable prop id survives rename when display name changed.
const idOnlyRig={names:['Root'],props:[
 {id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]},
 {id:'lamp',name:'Lamp',shape:'mesh',color:'#112233',joint:null,position:[2,0,0],rotation:[0,10,0],size:[.4,.8,.4]}
]};
const idKit=makeSetKitAsset(idOnlyRig,'Id lounge');
assert.equal(idKit.setKit.props.find(p=>p.meshNodeName==='Sofa').contentHash,undefined);
idKit.setKit.props.find(p=>p.meshNodeName==='Sofa').position=[9,0,0];
const renamedNoHash={names:['Root'],props:[
 {id:'sofa',name:'Couch',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]},
 {id:'lamp',name:'Lamp',shape:'mesh',color:'#112233',joint:null,position:[2,0,0],rotation:[0,10,0],size:[.4,.8,.4]}
]};
const byId=applySetKit(renamedNoHash,idKit,{mode:'merge'});
assert.deepEqual(byId.props.find(p=>p.id==='sofa').position,[9,0,0]);
assert.equal(byId.props.find(p=>p.id==='sofa').name,'Sofa');

// Name fallback: new prop id + matching display name (no hash).
const nameFallbackRig={names:['Root'],props:[
 {id:'brand-new',name:'Sofa',shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}
]};
const nameKit=makeSetKitAsset({names:['Root'],props:[
 {id:'old-sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[1,0,1],rotation:[0,30,0],size:[1.2,1,1]}
]},'Name only');
const byName=applySetKit(nameFallbackRig,nameKit,{mode:'merge'});
assert.equal(byName.props.find(p=>p.id==='brand-new').name,'Sofa');
assert.deepEqual(byName.props.find(p=>p.id==='brand-new').position,[1,0,1]);

// contentHash wins over a conflicting renamed sibling with the same old name.
const conflictRig={names:['Root'],props:[
 {id:'real',name:'Other',shape:'mesh',color:'#111111',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:sofaHash},
 {id:'decoy',name:'Sofa',shape:'mesh',color:'#222222',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:lampHash}
]};
const conflictKit=makeSetKitAsset(hashedMeshRig,'Conflict');
conflictKit.setKit.props=conflictKit.setKit.props.filter(p=>p.meshNodeName==='Sofa');
conflictKit.setKit.props[0].position=[7,0,7];
const resolved=applySetKit(conflictRig,conflictKit,{mode:'merge'});
assert.deepEqual(resolved.props.find(p=>p.id==='real').position,[7,0,7]);
assert.deepEqual(resolved.props.find(p=>p.id==='decoy').position,[0,0,0]);

// Cross-shot: save auto-promotes unique library match to libraryAssetId.
const crossHash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const libSofa={id:'lib-sofa',kind:'prop',name:'Cross Sofa GLB',file:{name:'sofa.glb',type:'input',subfolder:''},contentHash:crossHash};
const unlinkedSofaRig={names:['Root'],props:[
 {id:'sofa',name:'CrossSofa',shape:'mesh',color:'#aabbcc',joint:null,position:[3,0,1],rotation:[0,15,0],size:[1.5,1,1],contentHash:crossHash}
]};
const promotedKit=makeSetKitAsset(unlinkedSofaRig,'Promoted sofa',{libraryProps:[libSofa]});
assert.equal(setKitLibraryMeshes(promotedKit).length,1);
assert.equal(setKitMeshNodeRefs(promotedKit).length,0);
assert.equal(setKitLibraryMeshes(promotedKit)[0].libraryAssetId,'lib-sofa');
assert.deepEqual(setKitLibraryMeshes(promotedKit)[0].position,[3,0,1]);

// Without libraryProps, same mesh stays a mesh-ref with contentHash.
const refOnlyKit=makeSetKitAsset(unlinkedSofaRig,'Ref sofa');
assert.equal(setKitMeshNodeRefs(refOnlyKit).length,1);
assert.equal(setKitLibraryMeshes(refOnlyKit).length,0);
assert.equal(refOnlyKit.setKit.props[0].contentHash,crossHash);

// Apply on empty shot: mesh-ref missing -> library fallback by contentHash.
const emptyShot={names:['Root'],props:[]};
const fallbacks=setKitMeshRefLibraryFallbacks(refOnlyKit,emptyShot,[libSofa],{mode:'merge'});
assert.equal(fallbacks.length,1);
assert.equal(fallbacks[0].libraryAssetId,'lib-sofa');
assert.deepEqual(fallbacks[0].position,[3,0,1]);
assert.equal(meshRefSkipKey(fallbacks[0]),'hash:'+crossHash);
const crossSkip=new Set([meshRefSkipKey(fallbacks[0])]);
const pendingOnly=applySetKit(emptyShot,refOnlyKit,{mode:'merge',allowPendingMeshes:true,skipMeshRefKeys:crossSkip});
assert.equal(pendingOnly.props.filter(p=>p.shape==='mesh').length,0);
let crossEmbed=0;
const crossShot=await embedSetKitLibraryMeshes(pendingOnly,fallbacks.map(({libraryAssetId,name,color,position,rotation,size})=>({libraryAssetId,name,color,position,rotation,size})),{
 resolveLibraryAsset:id=>id==='lib-sofa'?libSofa:null,
 embed:async(rig,asset,{name,libraryAssetId})=>{
  crossEmbed++;
  const propId='cross-'+crossEmbed;
  const next=structuredClone(rig);
  next.props=[...(next.props||[]),{id:propId,name,shape:'mesh',color:'#ffffff',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId,contentHash:crossHash}];
  return {rig:next,propId};
 }
});
assert.equal(crossEmbed,1);
const placedCross=crossShot.props.find(p=>p.shape==='mesh');
assert.equal(placedCross.libraryAssetId,'lib-sofa');
assert.deepEqual(placedCross.position,[3,0,1]);

// Same-shot still rearranges without fallback when mesh is present.
assert.equal(setKitMeshRefLibraryFallbacks(refOnlyKit,unlinkedSofaRig,[libSofa],{mode:'merge'}).length,0);
const sameShotRearranged=applySetKit(unlinkedSofaRig,refOnlyKit,{mode:'merge'});
assert.equal(sameShotRearranged.props.find(p=>p.id==='sofa').contentHash,crossHash);

// No library match and missing mesh still throws.
assert.throws(()=>applySetKit(emptyShot,refOnlyKit,{mode:'merge'}),/no matching mesh|library GLB link/i);


// Apply UX preview: contents + merge/replace consequences + mesh-ref outcomes.
const previewEmpty=setKitApplyPreview(null,{names:['Root'],props:[]},[],{mode:'merge'});
assert.match(previewEmpty.text,/Choose a saved set kit/i);
assert.equal(previewEmpty.summary,null);

const summaryRoom=summarizeSetKit(kit);
assert.equal(summaryRoom.total,5);
assert.equal(summaryRoom.primitives.length,5);
assert.equal(summaryRoom.libraryMeshes.length,0);
assert.equal(summaryRoom.meshRefs.length,0);

const mergePreview=setKitApplyPreview(kit,roomed,[],{mode:'merge'});
assert.equal(mergePreview.summary.total,5);
assert.match(mergePreview.text,/Kit: 5 props/i);
assert.match(mergePreview.text,/5 primitives/i);
assert.match(mergePreview.text,/Merge:/i);
assert.match(mergePreview.text,/5 world/i);
assert.equal(mergePreview.needsBodyEmbed,false);
assert.equal(mergePreview.willMiss.length,0);

const replacePreview=setKitApplyPreview(kit,roomed,[],{mode:'replace-world'});
assert.match(replacePreview.text,/Replace world:/i);
assert.match(replacePreview.text,/drops unmatched stage props/i);
assert.match(replacePreview.text,/keeps 1 held/i);

// Mesh-ref rearrange vs missing named in preview.
const sofaHashPrev='a'.repeat(64);
const namedPrev={names:['Root','Hand'],props:[
 {id:'held',name:'Cup',shape:'box',color:'#ffaa00',joint:1,position:[0,0,0],rotation:[0,0,0],size:[.1,.1,.1]},
 {id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],contentHash:sofaHashPrev}
]};
const refKitPrev=makeSetKitAsset(namedPrev,'Preview sofa');
const rearrangePrev=setKitApplyPreview(refKitPrev,namedPrev,[],{mode:'merge'});
assert.equal(rearrangePrev.rearrange.length,1);
assert.match(rearrangePrev.text,/Mesh refs rearrange/i);
assert.match(rearrangePrev.text,/Sofa/i);
const missPrev=setKitApplyPreview(refKitPrev,{names:['Root'],props:[]},[],{mode:'merge'});
assert.equal(missPrev.willMiss.length,1);
assert.match(missPrev.text,/Missing with no library match/i);
assert.throws(()=>setKitApplyPreview(kit,roomed,[],{mode:'nope'}),/merge or replace-world/);


// Legacy set-kit mesh-ref contentHash backfill + project migrate.
const legacyRefKit={id:'kit-legacy',kind:'set',name:'Legacy refs',brief:'',readiness:'Not started',setKit:{format:'studio-set-kit',version:1,props:[{id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[1,0,0],rotation:[0,0,0],size:[1,1,1],meshNodeName:'Sofa'},{id:'box',name:'Box',shape:'box',color:'#111111',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1]}]}};
const libForRef={id:'lib-sofa',kind:'prop',name:'Sofa',file:{name:'sofa.glb',type:'input',subfolder:''},contentHash:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'};
const kitFill=backfillSetKitMeshRefContentHashes(legacyRefKit,[libForRef]);
assert.equal(kitFill.stamped.length,1);
assert.equal(kitFill.asset.setKit.props.find(p=>p.meshNodeName==='Sofa').contentHash,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
assert.equal(legacyRefKit.setKit.props.find(p=>p.meshNodeName==='Sofa').contentHash,undefined);
const proj={assets:[libForRef,{id:'kit-legacy',kind:'set',name:'Legacy refs',brief:'',readiness:'Not started',setKit:structuredClone(legacyRefKit.setKit)}],scenes:[{shots:[{rig3d:{names:['Root'],props:[{id:'sofa',name:'Sofa',shape:'mesh',color:'#ccddee',joint:null,position:[0,0,0],rotation:[0,0,0],size:[1,1,1],libraryAssetId:'lib-sofa'}]}}]}]};
const migrated=backfillProjectLegacyContentHashes(proj);
assert.ok(migrated.meshStamped>=1);
assert.ok(migrated.kitStamped>=1);
assert.equal(proj.scenes[0].shots[0].rig3d.props[0].contentHash,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
assert.equal(proj.assets.find(a=>a.kind==='set').setKit.props.find(p=>p.meshNodeName==='Sofa').contentHash,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');


// Apply gate: disabled with no kit / missing mesh refs; replace-world needs confirm.
const gateEmpty=setKitApplyGate(null,{names:['Root'],props:[]},[],{mode:'merge'});
assert.equal(gateEmpty.ok,false);
assert.match(gateEmpty.reason,/Choose a saved set kit/i);
assert.equal(gateEmpty.needsConfirm,false);

const gateMerge=setKitApplyGate(kit,roomed,[],{mode:'merge'});
assert.equal(gateMerge.ok,true);
assert.equal(gateMerge.needsConfirm,false);
assert.match(gateMerge.reason,/Merge kit/i);

const gateReplace=setKitApplyGate(kit,roomed,[],{mode:'replace-world'});
assert.equal(gateReplace.ok,true);
assert.equal(gateReplace.needsConfirm,true);
assert.match(gateReplace.confirmMessage,/Replace world/i);
assert.match(gateReplace.confirmMessage,/Hall kit/);
assert.match(gateReplace.confirmMessage,/Undo restores/i);
assert.match(setKitApplyConfirmMessage(kit,'replace-world',gateReplace.preview),/Drops unmatched stage props/i);

const missGate=setKitApplyGate(refKitPrev,{names:['Root'],props:[]},[],{mode:'merge'});
assert.equal(missGate.ok,false);
assert.equal(missGate.needsConfirm,false);
assert.match(missGate.reason,/Missing mesh refs/i);
assert.ok(missGate.preview.willMiss.length>=1);

assert.throws(()=>setKitApplyGate(kit,roomed,[],{mode:'nope'}),/merge or replace-world/);

// UI wiring markers (Apply confirm + disabled sync).
const roomSrc=readFileSync(new URL('../../simple-editor/director-room.js', import.meta.url),'utf8');
assert.match(roomSrc,/setKitApplyGate/);
assert.match(roomSrc,/setKitApplyConfirmMessage/);
assert.match(roomSrc,/syncApplyButton/);
assert.match(roomSrc,/gate\.needsConfirm&&!confirm/);
assert.match(roomSrc,/apply\.disabled=!gate\.ok/);
assert.match(roomSrc,/dataset\.needsConfirm/);

console.log('Set kit passed: world props, merge/replace, library mesh refs + embed transform, same-shot mesh-ref-by-name, mesh-ref identity (contentHash/id/name), cross-shot mesh-ref library fallback + save promote, apply UX preview, apply gate confirm/disabled, legacy mesh-ref hash backfill + project migrate, project validate, delivery readiness, capacity.');
