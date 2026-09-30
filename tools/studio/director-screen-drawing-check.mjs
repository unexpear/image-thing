import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,exportRigGLB,attachScreenDrawings,localScreenDrawingTRS,bakeScreenDrawingOverlays,ensureShotCamera,MAX_SCREEN_DRAWING_CELS,MAX_PARENT_DRAWING_CELS,parentDrawingSampleFrames,drawingMaterialBlend,DRAW_BLEND_TO_THREE,DRAW_BLEND_SHADER_GLSL,setDrawingBlendSceneColor,drawingBlendNeedsSceneColor,collectDrawingBlendSceneColorMaterials,drawingBlendSceneNeedsMultipass,createDrawingBlendSceneColorPass,disposeDrawingBlendSceneColorPass,DRAWING_BLEND_SCENE_COLOR_MSAA,DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES,normalizeDrawingBlendSceneColorMsaa,drawingBlendSceneColorSampleCount,ensureDrawingBlendSceneColorTarget} from '../../simple-editor/director-3d-engine.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';

globalThis.self=globalThis;
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height||Math.floor(data.length/4/width);}};
globalThis.document={createElement(tag){if(tag!=='canvas')return {};const canvas={width:1,height:1,getContext(){return{translate(){},scale(){},putImageData(){},drawImage(){}};},toBlob(cb){cb(new Blob([PNG_1X1],{type:'image/png'}));}};return canvas;}};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};

const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(bone=>bone.quaternion.clone()),base=bones[0].position.clone();
const rig={version:1,model:null,names:bones.map(bone=>bone.name),pose:bones.map(()=>[0,0,0]),keys:[{frame:0,pose:bones.map(()=>[0,0,0])},{frame:12,pose:bones.map(()=>[0,0,0])}]};
const camera=new THREE.PerspectiveCamera(38,16/9,.01,100);camera.position.set(0,1.2,3.2);camera.lookAt(0,1.1,0);camera.updateMatrixWorld(true);

function solidTexture(r,g,b,a=255){
 const data=new Uint8Array([r,g,b,a]),texture=new THREE.DataTexture(data,1,1);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}

assert.equal(MAX_SCREEN_DRAWING_CELS,MAX_PARENT_DRAWING_CELS);

const scene=new THREE.Scene();
const shot=ensureShotCamera(scene,camera);
assert.equal(shot.name,'Shot camera');
assert.equal(ensureShotCamera(scene,camera),shot,'ensure reuses existing Shot camera');

const liveTexture=solidTexture(40,180,220,255);
const liveItem={id:'hud-live',name:'HUD mark',opacity:.9,width:960,height:540,texture:liveTexture};
const live=attachScreenDrawings(shot,[liveItem]);
assert.equal(live.length,1);
assert.equal(live[0].parent,shot);
assert.equal(live[0].name,'HUD mark');
assert.ok(live[0].material.map);
assert.ok(live[0].material.depthTest===false,'overlay should skip depth test');
assert.ok(live[0].position.z<0,'plane sits in front of camera (-Z)');
assert.ok(live[0].scale.x>0.01&&live[0].scale.y>0.01);
const expected=localScreenDrawingTRS(shot,liveItem);
assert.ok(live[0].position.distanceTo(expected.position)<1e-6);
assert.ok(live[0].scale.distanceTo(expected.scale)<1e-6);
shot.remove(live[0]);live[0].geometry.dispose();live[0].material.dispose();liveTexture.dispose();

assert.throws(()=>attachScreenDrawings(null,[{texture:solidTexture(1,2,3)}]),/shot camera/);

const texture=solidTexture(220,40,40,255);
const screenDrawings=[{id:'hud-1',name:'Flash overlay',opacity:.85,width:960,height:540,texture}];

const bare=await exportRigGLB(root,bones,rest,{...rig,keys:[]},1,base,[]);
const bareJson=JSON.parse(Buffer.from(bare).subarray(20,20+Buffer.from(bare).readUInt32LE(12)).toString());
assert.equal(bareJson.textures,undefined);

const data=await exportRigGLB(root,bones,rest,rig,1,base,[],{screenDrawings,camera});
const report=await validateBytes(new Uint8Array(data));
assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
const json=JSON.parse(Buffer.from(data).subarray(20,20+Buffer.from(data).readUInt32LE(12)).toString());
assert.ok(json.textures?.length>=1,'expected embedded screen drawing texture');
assert.ok(json.images?.length>=1,'expected embedded screen drawing image');
assert.ok(json.cameras?.length>=1,'expected Shot camera in glTF');
const drawingNode=json.nodes.find(n=>n.name==='Flash overlay');
assert.ok(drawingNode,'screen drawing node missing');
function ancestors(index){
 const list=[];let i=index;
 while(true){const parent=json.nodes.findIndex(n=>n.children?.includes(i));if(parent<0)break;list.push(json.nodes[parent]);i=parent;}
 return list;
}
const drawingIndex=json.nodes.indexOf(drawingNode);
const chain=ancestors(drawingIndex);
assert.ok(chain.some(n=>n.name==='Shot camera'),'drawing not under Shot camera: '+chain.map(n=>n.name).join(' > '));
assert.ok(drawingNode.mesh!==undefined,'drawing node should reference a mesh');

// Camera keys path: screen overlays still parent under baked Shot camera.
const camRig={...rig,cameraKeys:[{frame:0,position:[0,1.2,3.2],target:[0,1.1,0]},{frame:12,position:[0.4,1.3,3.0],target:[0,1.1,0],easing:'smooth'}]};
const camData=await exportRigGLB(root,bones,rest,camRig,1,base,[],{screenDrawings,camera});
const camReport=await validateBytes(new Uint8Array(camData));
assert.equal(camReport.issues.numErrors,0,JSON.stringify(camReport.issues));
const camJson=JSON.parse(Buffer.from(camData).subarray(20,20+Buffer.from(camData).readUInt32LE(12)).toString());
const camDrawing=camJson.nodes.find(n=>n.name==='Flash overlay');
assert.ok(camDrawing);
function ancestorsOf(doc,index){
 const list=[];let i=index;
 while(true){const parent=doc.nodes.findIndex(n=>n.children?.includes(i));if(parent<0)break;list.push(doc.nodes[parent]);i=parent;}
 return list;
}
assert.ok(ancestorsOf(camJson,camJson.nodes.indexOf(camDrawing)).some(n=>n.name==='Shot camera'),'camera-keyed export keeps overlay under Shot camera');

texture.dispose();

const texA=solidTexture(220,40,40,255),texB=solidTexture(40,40,220,255);
const celItem={id:'hud-cel',name:'Cel HUD',opacity:1,width:960,height:540,texture:texA,displayFrame:0,cels:[{frame:0,texture:texA},{frame:12,texture:texB}]};
const celShot=ensureShotCamera(new THREE.Scene(),camera);
const celMeshes=attachScreenDrawings(celShot,[celItem]);
assert.equal(celMeshes.length,2,'multi-cel should attach one plane per ink hold');
assert.ok(celMeshes.some(m=>m.name.includes('f0'))&&celMeshes.some(m=>m.name.includes('f12')));
assert.ok(celMeshes.find(m=>m.userData.studioScreenDrawingCelFrame===0).scale.length()>1e-4);
assert.ok(celMeshes.find(m=>m.userData.studioScreenDrawingCelFrame===12).scale.lengthSq()===0);

const celTracks=[];
const celBaked=await bakeScreenDrawingOverlays(1,celMeshes,[celItem],celTracks);
assert.equal(celBaked,true);
assert.equal(celTracks.length,2,'two meshes x scale tracks only (camera-local TRS fixed)');
const mesh0=celMeshes.find(m=>m.userData.studioScreenDrawingCelFrame===0);
const mesh12=celMeshes.find(m=>m.userData.studioScreenDrawingCelFrame===12);
const scale0=celTracks.find(t=>t.name===mesh0.uuid+'.scale');
const scale12=celTracks.find(t=>t.name===mesh12.uuid+'.scale');
assert.ok(scale0&&scale12);
const s0at0=new THREE.Vector3().fromArray(scale0.values,0).length();
const s0at12=new THREE.Vector3().fromArray(scale0.values,12*3).length();
const s12at0=new THREE.Vector3().fromArray(scale12.values,0).length();
const s12at12=new THREE.Vector3().fromArray(scale12.values,12*3).length();
assert.ok(s0at0>1e-4&&s0at12===0,'first cel visible then hidden');
assert.ok(s12at0===0&&s12at12>1e-4,'second cel hidden then visible');

for(const mesh of celMeshes){celShot.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}

const celData=await exportRigGLB(root,bones,rest,rig,1,base,[],{screenDrawings:[celItem],camera});
const celReport=await validateBytes(new Uint8Array(celData));
assert.equal(celReport.issues.numErrors,0,JSON.stringify(celReport.issues));
const celJson=JSON.parse(Buffer.from(celData).subarray(20,20+Buffer.from(celData).readUInt32LE(12)).toString());
assert.ok((celJson.images?.length||0)>=2,'expected two cel images');
const celNodes=celJson.nodes.filter(n=>n.name?.startsWith('Cel HUD'));
assert.equal(celNodes.length,2,'two screen drawing nodes in glTF');

const staticRig={version:1,model:null,names:bones.map(bone=>bone.name),pose:bones.map(()=>[0,0,0]),keys:[]};
const staticData=await exportRigGLB(root,bones,rest,staticRig,1,base,[],{screenDrawings:[celItem],camera});
const staticJson=JSON.parse(Buffer.from(staticData).subarray(20,20+Buffer.from(staticData).readUInt32LE(12)).toString());
assert.ok(staticJson.animations?.length>=1,'cel steps require an animation clip even without body keys');
assert.ok(staticJson.cameras?.length>=1,'static export still embeds Shot camera for overlays');

texA.dispose();texB.dispose();

// Parent+screen together: joint child + camera child.
const hand=bones.find(b=>b.name==='Left hand');
assert.ok(hand);
const parentTex=solidTexture(10,200,40,255),screenTex=solidTexture(200,10,200,255);
const both=await exportRigGLB(root,bones,rest,rig,1,base,[],{
 parentDrawings:[{id:'p1',name:'Parent mark',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:parentTex}],
 screenDrawings:[{id:'s1',name:'Screen mark',opacity:1,width:960,height:540,texture:screenTex}],
 camera
});
const bothReport=await validateBytes(new Uint8Array(both));
assert.equal(bothReport.issues.numErrors,0,JSON.stringify(bothReport.issues));
const bothJson=JSON.parse(Buffer.from(both).subarray(20,20+Buffer.from(both).readUInt32LE(12)).toString());
assert.ok(bothJson.nodes.some(n=>n.name==='Parent mark'));
assert.ok(bothJson.nodes.some(n=>n.name==='Screen mark'));
parentTex.dispose();screenTex.dispose();

// Sampler reuse still works for screen layers (no joint).
const layer={id:'S1',name:'FX',cels:[{frame:0},{frame:24}]};
const board={layers:[layer],keyframes:[{frame:0,easing:'hold',poses:[]},{frame:24,easing:'hold',poses:[]}]};
assert.deepEqual(parentDrawingSampleFrames(board,layer,47),[0,24,47]);


// Screen overlay blend modes (same mapping as parent: true Screen + Overlay/Soft-light shaders).
const mulHudTex = solidTexture(90, 20, 20, 255);
const mulHud = attachScreenDrawings(shot, [{id:'hud-mul',name:'Mul HUD',opacity:1,blend:'multiply',width:960,height:540,texture:mulHudTex}]);
assert.equal(mulHud[0].material.blending, THREE.MultiplyBlending);
assert.equal(mulHud[0].userData.studioDrawingBlend, 'multiply');
assert.equal(mulHud[0].material.depthTest, false);
shot.remove(mulHud[0]);mulHud[0].geometry.dispose();mulHud[0].material.dispose();mulHudTex.dispose();
const addHudTex = solidTexture(20, 200, 255, 255);
const addHud = attachScreenDrawings(shot, [{id:'hud-add',name:'Add HUD',opacity:.7,blend:'screen',width:960,height:540,texture:addHudTex}]);
assert.equal(addHud[0].material.blending, THREE.CustomBlending);
assert.equal(addHud[0].material.blendDst, THREE.OneMinusSrcColorFactor);
assert.equal(addHud[0].userData.studioDrawingBlendThree, 'CustomBlending(Screen)');
assert.equal(drawingMaterialBlend('screen').note.includes('Screen'), true);
shot.remove(addHud[0]);addHud[0].geometry.dispose();addHud[0].material.dispose();addHudTex.dispose();
const softTex = solidTexture(180, 180, 180, 255);
const softLive = attachScreenDrawings(shot, [{id:'hud-soft-live',name:'Soft live',opacity:1,blend:'soft-light',width:960,height:540,texture:softTex}]);
assert.equal(softLive[0].material.userData.studioDrawingBlendThree, 'ShaderSoftLight');
assert.equal(typeof softLive[0].material.onBeforeCompile, 'function');
assert.ok(DRAW_BLEND_SHADER_GLSL.softLight.includes('studioBlendSoftLight'));
setDrawingBlendSceneColor(softLive[0].material, softTex, 32, 32);
assert.equal(softLive[0].material.userData.studioDrawingBlendSceneBound, true);
assert.equal(drawingBlendNeedsSceneColor('soft-light'), true);
{
  const probe = new THREE.Group();
  probe.add(softLive[0]);
  assert.ok(drawingBlendSceneNeedsMultipass(probe));
  assert.equal(collectDrawingBlendSceneColorMaterials(probe).length, 1);
  probe.remove(softLive[0]);
}
const scPass = createDrawingBlendSceneColorPass();
assert.equal(scPass.target, null);
assert.equal(scPass.samples, 0);
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 4 } }), 4);
assert.deepEqual([...DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES], [0, 2, 4, 8]);
assert.equal(normalizeDrawingBlendSceneColorMsaa(undefined), 4);
assert.equal(normalizeDrawingBlendSceneColorMsaa(0), 0);
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 8 } }, normalizeDrawingBlendSceneColorMsaa(8)), 8);
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 8 } }, normalizeDrawingBlendSceneColorMsaa(0)), 0);

{
  const mock = { capabilities: { isWebGL2: true, maxSamples: 4 }, outputColorSpace: THREE.SRGBColorSpace };
  const rt = ensureDrawingBlendSceneColorTarget(mock, scPass, 32, 32);
  assert.equal(scPass.samples, 4);
  assert.equal(rt.samples, 4);
  const rt2 = ensureDrawingBlendSceneColorTarget(mock, scPass, 32, 32, 2);
  assert.equal(scPass.samples, 2, 'preferred 2 from pass');
  assert.equal(scPass.preferred, 2);
  assert.notEqual(rt2, rt);
}
disposeDrawingBlendSceneColorPass(scPass);
assert.equal(scPass.samples, 0);
shot.remove(softLive[0]);softLive[0].geometry.dispose();softLive[0].material.dispose();
const softData = await exportRigGLB(root,bones,rest,rig,1,base,[],{screenDrawings:[{id:'hud-soft',name:'Soft HUD',opacity:1,blend:'soft-light',width:960,height:540,texture:softTex}],camera});
const softJson = JSON.parse(Buffer.from(softData).subarray(20,20+Buffer.from(softData).readUInt32LE(12)).toString());
const softMat = softJson.materials?.find(m => m.extras?.studioDrawingBlend === 'soft-light');
assert.ok(softMat, 'soft-light blend should land in material extras');
assert.equal(softMat.extras.studioDrawingBlendThree, 'ShaderSoftLight');
assert.equal(softMat.extras.studioDrawingBlendNeedsSceneColor, true);
assert.ok(String(softMat.extras.studioDrawingBlendNote||'').toLowerCase().includes('soft'));
softTex.dispose();

console.log('Screen drawing glTF checks passed: camera-child overlay planes, ensureShotCamera, stepped cel holds, camera-keyed path, parent+screen together, Draw blend->Three.js material mapping (Screen CustomBlending / Overlay+Soft-light shaders + multipass helpers with MSAA when WebGL2 allows + sample-count knob), validator clean, skipped without drawings.');
