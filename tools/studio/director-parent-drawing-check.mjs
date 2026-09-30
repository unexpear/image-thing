import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,exportRigGLB,attachParentDrawings,localParentDrawingTRS,bakeParentDrawingBillboards,applyPose,parentDrawingHoldAt,parentDrawingSampleFrames,parentDrawingChangeFrames,collapseParentDrawingFrames,evenPickFrames,MAX_PARENT_DRAWING_CELS,drawingMaterialBlend,DRAW_BLEND_TO_THREE,DRAW_BLEND_SHADER_GLSL,DRAW_BLEND_GLTF_LIMITS,setDrawingBlendSceneColor,applyDrawingBlendShader,drawingBlendNeedsSceneColor,collectDrawingBlendSceneColorMaterials,drawingBlendSceneNeedsMultipass,createDrawingBlendSceneColorPass,disposeDrawingBlendSceneColorPass,DRAWING_BLEND_SCENE_COLOR_MSAA,DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES,normalizeDrawingBlendSceneColorMsaa,drawingBlendSceneColorSampleCount,ensureDrawingBlendSceneColorTarget,parentDrawingJointExtent,parentDrawingSurfaceAnchor,parentDrawingOcclusion,parentDrawingPlacement,parentDrawingInfluenceBones,packParentDrawingSkin,parentDrawingBoneProximityWeights,buildConformParentDrawingMesh,CONFORM_PARENT_DRAWING_SEGMENTS,buildDecalParentDrawingMesh,parentDrawingCardFrame,parentDrawingProjectToCardUV,parentDrawingCardPoint,parentDrawingRayTriangle,parentDrawingCardRaycastUV,parentDrawingWantsLive3dPreview,MAX_DECAL_PARENT_DRAWING_TRIS,DECAL_PARENT_DRAWING_RAY_GRID,DECAL_PARENT_DRAWING_RAY_GRID_MIN,DECAL_PARENT_DRAWING_RAY_GRID_MAX,DECAL_PARENT_DRAWING_RAY_REF_SPAN,DECAL_PARENT_DRAWING_MIN_RAY_HITS,DECAL_PARENT_DRAWING_INK_ALPHA,decalRayGridDims,parentDrawingTexturePixels,parentDrawingInkAlphaAt,parentDrawingInkFootprintUV,parentDrawingInkContoursUV,parentDrawingPointInInkContours,parentDrawingSegmentInkCrossing,DECAL_PARENT_DRAWING_HYPERBOLIC_ISO_MAX_SAMPLES,DECAL_PARENT_DRAWING_BEZIER_FIT_SAMPLES,DECAL_PARENT_DRAWING_BEZIER_FIT_CORNER_RAD,DECAL_PARENT_DRAWING_BEZIER_FIT_MAX_CHORD,fitParentDrawingInkContourRingBezier} from '../../simple-editor/director-3d-engine.js';
import {validateDrawing,newDrawing} from '../../simple-editor/director-drawing.js';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';

globalThis.self=globalThis;
const PNG_1X1=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height||Math.floor(data.length/4/width);}};
globalThis.document={createElement(tag){if(tag!=='canvas')return {};const canvas={width:1,height:1,getContext(){return{translate(){},scale(){},putImageData(){},drawImage(){}};},toBlob(cb){cb(new Blob([PNG_1X1],{type:'image/png'}));}};return canvas;}};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}};
globalThis.ProgressEvent=class{constructor(type,props){Object.assign(this,{type},props);}};

const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(bone=>bone.quaternion.clone()),base=bones[0].position.clone();
const handIndex=bones.findIndex(b=>b.name==='Left hand');
const rig={version:1,model:null,names:bones.map(bone=>bone.name),pose:bones.map(()=>[0,0,0]),keys:[{frame:0,pose:bones.map(()=>[0,0,0])},{frame:12,pose:bones.map((b,i)=>i===handIndex?[0,0,40]:[0,0,0])}]};
const camera=new THREE.PerspectiveCamera(38,16/9,.01,100);camera.position.set(0,1.2,3.2);camera.lookAt(0,1.1,0);camera.updateMatrixWorld(true);

function solidTexture(r,g,b,a=255){
 const data=new Uint8Array([r,g,b,a]),texture=new THREE.DataTexture(data,1,1);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
/** w×h DataTexture; fill(x,y,set) paints ink. flipY matches CanvasTexture. */
function blobTexture(w,h,fill){
 const data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;data[i]=0;data[i+1]=0;data[i+2]=0;data[i+3]=0;
  fill(x,y,(r,g,b,a)=>{data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;});
 }
 const texture=new THREE.DataTexture(data,w,h);texture.needsUpdate=true;texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;return texture;
}

const hand=bones[handIndex];
assert.ok(hand);
root.updateMatrixWorld(true);
const liveTexture=solidTexture(220,40,40,255);
const liveItem={id:'fx-live',name:'Live mark',joint:hand.name,jointAnchor:[480,270],opacity:.85,width:960,height:540,texture:liveTexture};
const live=attachParentDrawings(root,bones,[liveItem],camera);
assert.equal(live.length,1);
assert.equal(live[0].parent,hand);
assert.equal(live[0].name,'Live mark');
assert.ok(live[0].material.map);
assert.ok(live[0].scale.x>0.01&&live[0].scale.y>0.01);
const facing=new THREE.Quaternion();live[0].getWorldQuaternion(facing);
assert.ok(facing.angleTo(camera.quaternion)<1e-4,'static attach should face camera');
hand.remove(live[0]);live[0].geometry.dispose();live[0].material.dispose();liveTexture.dispose();

// Mesh-aware defaults: joint-bounds size, surface anchor, depthWrite occlusion.
root.updateMatrixWorld(true);
const extent=parentDrawingJointExtent(hand,root);
assert.ok(extent>0.05,'joint extent should reflect hand/child/skin span');
const surf=parentDrawingSurfaceAnchor(hand,root,camera);
assert.equal(surf.fromMesh,true,'starter hand should hit weighted skinned verts');
assert.ok(surf.point.distanceTo(hand.getWorldPosition(new THREE.Vector3()))<0.5,'surface near bone');
assert.deepEqual(parentDrawingOcclusion({}),{key:'mesh',depthWrite:true,depthTest:true,note:'Mesh (depthWrite + depthTest)'});
assert.equal(parentDrawingOcclusion({occlusion:'overlay'}).depthWrite,false);
const meshTex=solidTexture(40,180,220,255);
const meshItem={id:'fx-mesh',name:'Mesh card',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:meshTex};
const meshCards=attachParentDrawings(root,bones,[meshItem],camera);
assert.equal(meshCards.length,1);
assert.equal(meshCards[0].material.depthWrite,true,'default parent cards write depth');
assert.equal(meshCards[0].userData.studioParentDrawingPlacement,'joint-bounds');
assert.equal(meshCards[0].userData.studioParentDrawingOcclusion,'mesh');
const meshScale=meshCards[0].scale.x;
assert.ok(meshScale>0.05&&meshScale<2,'joint-bounds card is body-sized, not screen-huge');
const billTex=solidTexture(220,40,40,255);
const billItem={id:'fx-bill',name:'Bill card',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:billTex,placement:'billboard',occlusion:'overlay'};
const billCards=attachParentDrawings(root,bones,[billItem],camera);
assert.equal(billCards[0].material.depthWrite,false,'overlay occlusion disables depthWrite');
assert.equal(billCards[0].userData.studioParentDrawingPlacement,'billboard');
assert.ok(billCards[0].scale.x>meshScale*2,'billboard FOV scale larger than joint-bounds at this camera');
hand.remove(meshCards[0]);meshCards[0].geometry.dispose();meshCards[0].material.dispose();meshTex.dispose();
hand.remove(billCards[0]);billCards[0].geometry.dispose();billCards[0].material.dispose();billTex.dispose();

assert.throws(()=>attachParentDrawings(new THREE.Scene(),bones,[{joint:hand.name,texture:solidTexture(1,2,3)}],null),/shot camera/);

const texture=solidTexture(220,40,40,255);
const parentDrawings=[{id:'fx-1',name:'Impact mark',joint:hand.name,jointAnchor:[480,270],opacity:.85,width:960,height:540,texture}];

const bare=await exportRigGLB(root,bones,rest,{...rig,keys:[]},1,base,[]);
const bareJson=JSON.parse(Buffer.from(bare).subarray(20,20+Buffer.from(bare).readUInt32LE(12)).toString());
assert.equal(bareJson.textures,undefined);

const data=await exportRigGLB(root,bones,rest,rig,1,base,[],{parentDrawings,camera});
const report=await validateBytes(new Uint8Array(data));
assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
const json=JSON.parse(Buffer.from(data).subarray(20,20+Buffer.from(data).readUInt32LE(12)).toString());
assert.ok(json.textures?.length>=1,'expected embedded drawing texture');
assert.ok(json.images?.length>=1,'expected embedded drawing image');
assert.ok(json.materials?.some(m=>m.pbrMetallicRoughness?.baseColorTexture),'expected textured material');
const drawingNode=json.nodes.find(n=>n.name==='Impact mark');
assert.ok(drawingNode,'drawing node missing');
function ancestors(index){
 const list=[];let i=index;
 while(true){const parent=json.nodes.findIndex(n=>n.children?.includes(i));if(parent<0)break;list.push(json.nodes[parent]);i=parent;}
 return list;
}
const drawingIndex=json.nodes.indexOf(drawingNode);
const chain=ancestors(drawingIndex);
assert.ok(chain.some(n=>n.name===hand.name),`drawing not under ${hand.name}: `+chain.map(n=>n.name).join(' > '));
assert.ok(drawingNode.mesh!==undefined,'drawing node should reference a mesh');

assert.ok(json.animations?.length>=1,'expected animation clip with billboard tracks');
const clip=json.animations[0];
const samplerPaths=[];
for(const ch of clip.channels||[]){
 const node=json.nodes[ch.target.node];
 if(node?.name==='Impact mark')samplerPaths.push(ch.target.path);
}
assert.ok(samplerPaths.includes('rotation'),'drawing should have baked rotation track');
assert.ok(samplerPaths.includes('translation'),'drawing should have baked translation track');
assert.ok(samplerPaths.includes('scale'),'drawing should have baked scale track');

const bakeTexture=solidTexture(10,200,40,255);
const bakeItem={id:'fx-bake',name:'Bake mark',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:bakeTexture};
const bakeMeshes=attachParentDrawings(root,bones,[bakeItem],camera);
const tracks=[];
const baked=await bakeParentDrawingBillboards(root,bones,rest,base,[],rig,1,bakeMeshes,[bakeItem],camera,tracks);
assert.equal(baked,true);
assert.equal(tracks.length,3);
const rotTrack=tracks.find(t=>t.name.endsWith('.quaternion'));
assert.ok(rotTrack);
const q0=new THREE.Quaternion().fromArray(rotTrack.values,0);
const q12=new THREE.Quaternion().fromArray(rotTrack.values,12*4);
assert.ok(q0.angleTo(q12)>1e-3,'billboard local rotation should change as the joint turns');
applyPose(bones,rest,rig.keys[1].pose);root.updateMatrixWorld(true);
const expected=localParentDrawingTRS(hand,bakeItem,camera);
assert.ok(q12.angleTo(expected.quaternion)<1e-3,'frame-12 bake matches helper');

hand.remove(bakeMeshes[0]);bakeMeshes[0].geometry.dispose();bakeMeshes[0].material.dispose();bakeTexture.dispose();
texture.dispose();

assert.equal(parentDrawingHoldAt([{frame:0},{frame:12},{frame:20}],11).frame,0);
assert.equal(parentDrawingHoldAt([{frame:0},{frame:12},{frame:20}],12).frame,12);
assert.equal(parentDrawingHoldAt([{frame:0},{frame:12},{frame:20}],19).frame,12);

const texA=solidTexture(220,40,40,255),texB=solidTexture(40,40,220,255);
const celItem={id:'fx-cel',name:'Cel mark',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:texA,displayFrame:0,cels:[{frame:0,texture:texA},{frame:12,texture:texB}]};
const celMeshes=attachParentDrawings(root,bones,[celItem],camera);
assert.equal(celMeshes.length,2,'multi-cel should attach one plane per ink hold');
assert.ok(celMeshes.some(m=>m.name.includes('f0'))&&celMeshes.some(m=>m.name.includes('f12')));
assert.ok(celMeshes.find(m=>m.userData.studioParentDrawingCelFrame===0).scale.length()>1e-4,'frame-0 hold visible at displayFrame 0');
assert.ok(celMeshes.find(m=>m.userData.studioParentDrawingCelFrame===12).scale.lengthSq()===0,'later hold starts hidden');

const celTracks=[];
const celBaked=await bakeParentDrawingBillboards(root,bones,rest,base,[],rig,1,celMeshes,[celItem],camera,celTracks);
assert.equal(celBaked,true);
assert.equal(celTracks.length,6,'two meshes x TRS tracks');
const mesh0=celMeshes.find(m=>m.userData.studioParentDrawingCelFrame===0);
const mesh12=celMeshes.find(m=>m.userData.studioParentDrawingCelFrame===12);
const scale0=celTracks.find(t=>t.name===mesh0.uuid+'.scale');
const scale12=celTracks.find(t=>t.name===mesh12.uuid+'.scale');
assert.ok(scale0&&scale12);
const s0at0=new THREE.Vector3().fromArray(scale0.values,0).length();
const s0at12=new THREE.Vector3().fromArray(scale0.values,12*3).length();
const s12at0=new THREE.Vector3().fromArray(scale12.values,0).length();
const s12at12=new THREE.Vector3().fromArray(scale12.values,12*3).length();
assert.ok(s0at0>1e-4&&s0at12===0,'first cel visible then hidden');
assert.ok(s12at0===0&&s12at12>1e-4,'second cel hidden then visible');

for(const mesh of celMeshes){hand.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}

const celData=await exportRigGLB(root,bones,rest,rig,1,base,[],{parentDrawings:[celItem],camera});
const celReport=await validateBytes(new Uint8Array(celData));
assert.equal(celReport.issues.numErrors,0,JSON.stringify(celReport.issues));
const celJson=JSON.parse(Buffer.from(celData).subarray(20,20+Buffer.from(celData).readUInt32LE(12)).toString());
assert.ok((celJson.images?.length||0)>=2,'expected two cel images');
assert.ok((celJson.textures?.length||0)>=2,'expected two cel textures');
const celNodes=celJson.nodes.filter(n=>n.name?.startsWith('Cel mark'));
assert.equal(celNodes.length,2,'two drawing nodes in glTF');

const staticRig={version:1,model:null,names:bones.map(bone=>bone.name),pose:bones.map(()=>[0,0,0]),keys:[]};
const staticData=await exportRigGLB(root,bones,rest,staticRig,1,base,[],{parentDrawings:[celItem],camera});
const staticJson=JSON.parse(Buffer.from(staticData).subarray(20,20+Buffer.from(staticData).readUInt32LE(12)).toString());
assert.ok(staticJson.animations?.length>=1,'cel steps require an animation clip even without body keys');

texA.dispose();texB.dispose();

// Denser walk / pose inbetween sampling with smart collapse under MAX_PARENT_DRAWING_CELS.
const layerA={id:'L1',name:'Ink',cels:[{frame:0},{frame:24}]};
const boardStatic={layers:[layerA],keyframes:[{frame:0,easing:'hold',poses:[]},{frame:24,easing:'hold',poses:[]}]};
const staticFrames=parentDrawingSampleFrames(boardStatic,layerA,47);
assert.deepEqual(staticFrames,[0,24,47],'hold-only stays on change points');

const boardWalk={layers:[layerA],walk:{root:'t',left:'a',right:'b',stride:30,lift:10,period:24},keyframes:[]};
const walkFrames=parentDrawingSampleFrames(boardWalk,layerA,95);
assert.ok(walkFrames.length>3,'walk densifies between anchors');
assert.ok(walkFrames.length<=MAX_PARENT_DRAWING_CELS,'walk respects cel cap');
assert.equal(walkFrames[0],0);assert.equal(walkFrames.at(-1),95);
assert.ok(walkFrames.includes(24),'walk keeps cel anchor');
const walkAnchors=parentDrawingChangeFrames(boardWalk,layerA,95);
for(const f of walkAnchors)assert.ok(walkFrames.includes(f)||walkAnchors.size>MAX_PARENT_DRAWING_CELS,'anchors preferred when under cap');

const boardPose={layers:[layerA],keyframes:[{frame:0,easing:'smooth',poses:[]},{frame:48,easing:'smooth',poses:[]}]};
const poseFrames=parentDrawingSampleFrames(boardPose,layerA,48);
assert.ok(poseFrames.length>3,'pose blend densifies');
assert.ok(poseFrames.includes(0)&&poseFrames.includes(48));
assert.ok(poseFrames.some(f=>f>0&&f<48),'pose inbetweens present');

const boardHoldPose={layers:[layerA],keyframes:[{frame:0,easing:'hold',poses:[]},{frame:48,easing:'hold',poses:[]}]};
assert.deepEqual(parentDrawingSampleFrames(boardHoldPose,layerA,48),[0,24,48],'hold pose does not densify');

const many=[...Array(80)].map((_,i)=>i);
const collapsed=collapseParentDrawingFrames(many,new Set([0,24,79]),48);
assert.equal(collapsed.length,48);
assert.ok(collapsed.includes(0)&&collapsed.includes(24)&&collapsed.includes(79),'collapse keeps anchors');
assert.deepEqual(evenPickFrames([0,1,2,3,4],3),[0,2,4]);

const longWalk={layers:[{id:'L1',name:'Ink'}],walk:{root:'t',left:'a',right:'b',stride:20,lift:8,period:16}};
const longFrames=parentDrawingSampleFrames(longWalk,longWalk.layers[0],24*10-1); // 10s shot
assert.equal(longFrames.length,MAX_PARENT_DRAWING_CELS,'long walk collapses to cap');


// Draw blend -> Three.js materials (true Screen CustomBlending; Overlay/Soft-light shaders).
assert.equal(drawingMaterialBlend('multiply').blending, THREE.MultiplyBlending);
assert.equal(drawingMaterialBlend('screen').blending, THREE.CustomBlending);
assert.equal(drawingMaterialBlend('screen').blendDst, THREE.OneMinusSrcColorFactor);
assert.equal(drawingMaterialBlend('screen').three, 'CustomBlending(Screen)');
assert.equal(drawingMaterialBlend('overlay').three, 'ShaderOverlay');
assert.equal(drawingMaterialBlend('overlay').needsSceneColor, true);
assert.equal(drawingMaterialBlend('soft-light').three, 'ShaderSoftLight');
assert.ok(DRAW_BLEND_SHADER_GLSL.overlay.includes('studioBlendOverlay'));
assert.ok(DRAW_BLEND_SHADER_GLSL.softLight.includes('studioBlendSoftLight'));
assert.ok(DRAW_BLEND_GLTF_LIMITS.includes('glTF has no canvas blend modes'));
assert.equal(drawingMaterialBlend(undefined).key, 'source-over');
assert.ok(Object.keys(DRAW_BLEND_TO_THREE).includes('multiply'));
const mulTex = solidTexture(80, 40, 20, 255);
const mulItem = {id:'fx-mul',name:'Mul mark',joint:hand.name,jointAnchor:[480,270],opacity:1,blend:'multiply',width:960,height:540,texture:mulTex};
const mulMeshes = attachParentDrawings(root,bones,[mulItem],camera);
assert.equal(mulMeshes[0].material.blending, THREE.MultiplyBlending);
assert.equal(mulMeshes[0].material.premultipliedAlpha, true);
assert.equal(mulMeshes[0].userData.studioDrawingBlend, 'multiply');
assert.equal(mulMeshes[0].material.userData.studioDrawingBlendThree, 'MultiplyBlending');
hand.remove(mulMeshes[0]);mulMeshes[0].geometry.dispose();mulMeshes[0].material.dispose();mulTex.dispose();
const scrTex = solidTexture(40, 180, 220, 255);
const scrItem = {id:'fx-scr',name:'Scr mark',joint:hand.name,jointAnchor:[480,270],opacity:.8,blend:'screen',width:960,height:540,texture:scrTex};
const scrMeshes = attachParentDrawings(root,bones,[scrItem],camera);
assert.equal(scrMeshes[0].material.blending, THREE.CustomBlending);
assert.equal(scrMeshes[0].material.blendSrc, THREE.OneFactor);
assert.equal(scrMeshes[0].material.blendDst, THREE.OneMinusSrcColorFactor);
assert.equal(scrMeshes[0].material.premultipliedAlpha, true);
assert.equal(scrMeshes[0].userData.studioDrawingBlendThree, 'CustomBlending(Screen)');
hand.remove(scrMeshes[0]);scrMeshes[0].geometry.dispose();scrMeshes[0].material.dispose();scrTex.dispose();
const ovTex = solidTexture(200, 200, 40, 255);
const ovLive = attachParentDrawings(root,bones,[{id:'fx-ov-live',name:'Ov live',joint:hand.name,jointAnchor:[480,270],opacity:1,blend:'overlay',width:960,height:540,texture:ovTex}],camera);
assert.equal(ovLive[0].material.userData.studioDrawingBlendThree, 'ShaderOverlay');
assert.equal(ovLive[0].material.userData.studioDrawingBlendNeedsSceneColor, true);
assert.equal(typeof ovLive[0].material.onBeforeCompile, 'function');
assert.ok(String(ovLive[0].material.userData.studioDrawingBlendGltf||'').includes('glTF') || String(ovLive[0].material.userData.studioDrawingBlendGltf||'').includes('Not in glTF'));
setDrawingBlendSceneColor(ovLive[0].material, ovTex, 64, 64);
assert.equal(ovLive[0].material.blending, THREE.NoBlending);
assert.equal(ovLive[0].material.userData.studioDrawingBlendSceneBound, true);
setDrawingBlendSceneColor(ovLive[0].material, null, 0, 0);
assert.equal(ovLive[0].material.blending, THREE.NormalBlending);
// Auto scene-color multipass helpers (Director viewport; collect/dispose need no WebGL).
assert.equal(drawingBlendNeedsSceneColor('overlay'), true);
assert.equal(drawingBlendNeedsSceneColor('soft-light'), true);
assert.equal(drawingBlendNeedsSceneColor('screen'), false);
assert.equal(drawingBlendNeedsSceneColor('multiply'), false);
assert.ok(drawingBlendSceneNeedsMultipass(root), 'live overlay mesh should flag multipass');
assert.ok(collectDrawingBlendSceneColorMaterials(root).some(e => e.material === ovLive[0].material));
assert.ok(DRAW_BLEND_GLTF_LIMITS.includes('multipass') || DRAW_BLEND_GLTF_LIMITS.includes('auto-binds'));
const pass = createDrawingBlendSceneColorPass();
assert.equal(pass.active, false);
assert.equal(pass.target, null);
assert.equal(pass.samples, 0);
assert.equal(pass.preferred, DRAWING_BLEND_SCENE_COLOR_MSAA);
assert.equal(DRAWING_BLEND_SCENE_COLOR_MSAA, 4);
assert.deepEqual([...DRAWING_BLEND_SCENE_COLOR_MSAA_CHOICES], [0, 2, 4, 8]);
assert.equal(normalizeDrawingBlendSceneColorMsaa(undefined), 4);
assert.equal(normalizeDrawingBlendSceneColorMsaa(null), 4);
assert.equal(normalizeDrawingBlendSceneColorMsaa(''), 4);
assert.equal(normalizeDrawingBlendSceneColorMsaa(2), 2);
assert.equal(normalizeDrawingBlendSceneColorMsaa(8), 8);
assert.equal(normalizeDrawingBlendSceneColorMsaa(0), 0);
assert.equal(normalizeDrawingBlendSceneColorMsaa(3), 4, 'invalid snaps to default');
assert.equal(normalizeDrawingBlendSceneColorMsaa('8'), 8);
assert.equal(normalizeDrawingBlendSceneColorMsaa(16, 2), 2, 'out-of-list uses fallback');
assert.equal(drawingBlendSceneColorSampleCount(null), 0);
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: false, maxSamples: 8 } }), 0, 'WebGL1 falls back to 0');
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 0 } }), 0, 'no maxSamples');
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 1 } }), 0, 'maxSamples<2');
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 8 } }), 4, 'clamp preferred 4');
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 2 } }), 2, 'clamp to maxSamples');
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 8 } }, 0), 0);
assert.equal(drawingBlendSceneColorSampleCount({ capabilities: { isWebGL2: true, maxSamples: 8 } }, 8), 8);
{
  const mockGl2 = { capabilities: { isWebGL2: true, maxSamples: 8 }, outputColorSpace: THREE.SRGBColorSpace, domElement: { width: 64, height: 48 } };
  const msaaPass = createDrawingBlendSceneColorPass();
  const rt = ensureDrawingBlendSceneColorTarget(mockGl2, msaaPass, 64, 48);
  assert.ok(rt, 'MSAA RT allocated without live GL');
  assert.equal(msaaPass.samples, 4);
  assert.equal(rt.samples, 4);
  assert.equal(msaaPass.width, 64);
  assert.equal(msaaPass.height, 48);
  const same = ensureDrawingBlendSceneColorTarget(mockGl2, msaaPass, 64, 48);
  assert.equal(same, rt, 'reuse RT when size+samples match');
  const rt8 = ensureDrawingBlendSceneColorTarget(mockGl2, msaaPass, 64, 48, 8);
  assert.notEqual(rt8, same, 'preferred change recreates RT');
  assert.equal(msaaPass.samples, 8, 'preferred 8 allocates 8');
  assert.equal(msaaPass.preferred, 8);
  const rt0 = ensureDrawingBlendSceneColorTarget(mockGl2, msaaPass, 64, 48, 0);
  assert.equal(msaaPass.samples, 0, 'preferred 0 -> aliased');
  assert.equal(msaaPass.preferred, 0);
  const rt2 = ensureDrawingBlendSceneColorTarget(mockGl2, msaaPass, 64, 48, 2);
  assert.equal(msaaPass.samples, 2);
  assert.equal(msaaPass.preferred, 2);

  const mockGl1 = { capabilities: { isWebGL2: false, maxSamples: 0 }, outputColorSpace: THREE.SRGBColorSpace, domElement: { width: 64, height: 48 } };
  const fallback = ensureDrawingBlendSceneColorTarget(mockGl1, msaaPass, 64, 48);
  assert.ok(fallback);
  assert.equal(msaaPass.samples, 0, 'WebGL1 recreate drops MSAA');
  assert.equal(fallback.samples, 0);
  disposeDrawingBlendSceneColorPass(msaaPass);
  assert.equal(msaaPass.samples, 0);
  assert.equal(msaaPass.target, null);
}
disposeDrawingBlendSceneColorPass(pass);
hand.remove(ovLive[0]);ovLive[0].geometry.dispose();ovLive[0].material.dispose();
assert.equal(drawingBlendSceneNeedsMultipass(root), false, 'multipass flag clears after overlay mesh removed');
const ovData = await exportRigGLB(root,bones,rest,rig,1,base,[],{parentDrawings:[{id:'fx-ov',name:'Ov mark',joint:hand.name,jointAnchor:[480,270],opacity:1,blend:'overlay',width:960,height:540,texture:ovTex}],camera});
const ovJson = JSON.parse(Buffer.from(ovData).subarray(20,20+Buffer.from(ovData).readUInt32LE(12)).toString());
const ovMat = ovJson.materials?.find(m => m.extras?.studioDrawingBlend === 'overlay');
assert.ok(ovMat, 'overlay blend should land in material extras');
assert.equal(ovMat.extras.studioDrawingBlendThree, 'ShaderOverlay');
assert.equal(ovMat.extras.studioDrawingBlendNeedsSceneColor, true);
assert.equal(ovMat.alphaMode, 'BLEND');
ovTex.dispose();




// Conforming / skinned parent cards (opt-in placement:'conform').
assert.equal(parentDrawingPlacement({}), 'joint-bounds');
assert.equal(parentDrawingPlacement({placement:'billboard'}), 'billboard');
assert.equal(parentDrawingPlacement({placement:'conform'}), 'conform');
assert.equal(parentDrawingPlacement({placement:'decal'}), 'decal');
const packed=packParentDrawingSkin([{bi:5,w:2},{bi:4,w:1},{bi:3,w:.5}],15,5);
assert.equal(new Set(packed.indices).size,4,'glTF joints must be unique');
assert.ok(Math.abs(packed.weights.reduce((a,w)=>a+w,0)-1)<1e-9);
const influ=parentDrawingInfluenceBones(hand);
assert.ok(influ.includes(hand)&&influ.length>=2);
root.updateMatrixWorld(true);
const prox=parentDrawingBoneProximityWeights(hand.getWorldPosition(new THREE.Vector3()),hand,bones);
assert.equal(new Set(prox.indices).size,4);
assert.ok(prox.weights[0]>0.2);
const confTex=solidTexture(240,120,40,255);
const confItem={id:'fx-conf',name:'Conform mark',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:confTex,placement:'conform'};
const confMeshes=attachParentDrawings(root,bones,[confItem],camera);
assert.equal(confMeshes.length,1);
assert.equal(confMeshes[0].isSkinnedMesh,true,'conform attaches a SkinnedMesh');
assert.equal(confMeshes[0].userData.studioParentDrawingPlacement,'conform');
assert.notEqual(confMeshes[0].parent,hand,'conform card is not a bone child (avoids double transform)');
assert.ok(confMeshes[0].parent===root||confMeshes[0].parent?.isScene,'conform lives under output root');
assert.equal(confMeshes[0].geometry.attributes.skinIndex.itemSize,4);
assert.equal(confMeshes[0].geometry.attributes.position.count,(CONFORM_PARENT_DRAWING_SEGMENTS+1)**2);
let multiBoneVerts=0;
const sw=confMeshes[0].geometry.attributes.skinWeight;
for(let i=0;i<sw.count;i++){let n=0;for(let k=0;k<4;k++)if(sw.getComponent(i,k)>0.05)n++;if(n>1)multiBoneVerts++;}
assert.ok(multiBoneVerts>0,'some verts use more than one bone');
const hostInversesBefore=(()=>{let h=null;root.traverse(m=>{if(m.isSkinnedMesh&&m!==confMeshes[0]&&m.skeleton)h=m;});return h.skeleton.boneInverses.map(m=>m.clone());})();
// Host boneInverses must survive conform bind (fresh Skeleton share).
{
 let host=null;root.traverse(m=>{if(m.isSkinnedMesh&&m!==confMeshes[0])host=m;});
 assert.ok(host.skeleton.boneInverses.every((m,i)=>m.equals(hostInversesBefore[i])),'host skeleton inverses preserved');
}
const elbow=bones.find(b=>b.name==='Left elbow');
const v0=new THREE.Vector3();confMeshes[0].applyBoneTransform(0,v0);
const before=v0.clone();
elbow.rotation.z+=0.7;root.updateMatrixWorld(true);confMeshes[0].skeleton.update();
const after=new THREE.Vector3();confMeshes[0].applyBoneTransform(0,after);
assert.ok(after.distanceTo(before)>0.02,'conform card deforms when a nearby bone rotates');
elbow.rotation.z-=0.7;root.updateMatrixWorld(true);confMeshes[0].skeleton.update();

const confData=await exportRigGLB(root,bones,rest,rig,1,base,[],{parentDrawings:[confItem],camera});
const confReport=await validateBytes(new Uint8Array(confData));
assert.equal(confReport.issues.numErrors,0,JSON.stringify(confReport.issues.messages?.filter(m=>m.severity===0).slice(0,8)));
const confJson=JSON.parse(Buffer.from(confData).subarray(20,20+Buffer.from(confData).readUInt32LE(12)).toString());
const confNode=confJson.nodes.find(n=>n.name==='Conform mark');
assert.ok(confNode,'conform node in glTF');
assert.ok(confNode.skin!==undefined,'conform node references a skin');
assert.ok((confJson.skins?.length||0)>=1);
// Conform should not be under the hand bone.
{
 const idx=confJson.nodes.indexOf(confNode);
 let parent=confJson.nodes.findIndex(n=>n.children?.includes(idx));
 const names=[];
 while(parent>=0){names.push(confJson.nodes[parent].name);parent=confJson.nodes.findIndex(n=>n.children?.includes(parent));}
 assert.ok(!names.includes(hand.name),'conform not parented under hand bone in glTF');
}
// Multi-cel conform: scale tracks only (no TRS billboard bake on skinned mesh).
const confTexA=solidTexture(240,120,40,255),confTexB=solidTexture(40,120,240,255);
const confCelItem={id:'fx-conf-cel',name:'Conform cel',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:confTexA,displayFrame:0,placement:'conform',cels:[{frame:0,texture:confTexA},{frame:12,texture:confTexB}]};
const confCelMeshes=attachParentDrawings(root,bones,[confCelItem],camera);
assert.equal(confCelMeshes.length,2);
assert.ok(confCelMeshes.every(m=>m.isSkinnedMesh));
const confCelTracks=[];
const confCelBaked=await bakeParentDrawingBillboards(root,bones,rest,base,[],rig,1,confCelMeshes,[confCelItem],camera,confCelTracks);
assert.equal(confCelBaked,true);
assert.equal(confCelTracks.length,2,'conform multi-cel writes scale tracks only');
assert.ok(confCelTracks.every(t=>t.name.endsWith('.scale')));
for(const mesh of confCelMeshes){mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
confTexA.dispose();confTexB.dispose();

// Mesh-projected decal (opt-in placement:'decal') — host triangles + host weights + denser card raycast UVs (planar fallback).
root.updateMatrixWorld(true);
const frame=parentDrawingCardFrame(hand,{jointAnchor:[480,270],width:960,height:540},camera,root);
assert.ok(frame.planeW>0.05&&frame.planeH>0.05,'card frame sized from joint bounds');
const uvC=parentDrawingProjectToCardUV(frame.center,frame);
assert.ok(Math.abs(uvC.u-0.5)<1e-5&&Math.abs(uvC.v-0.5)<1e-5,'frame center projects to UV 0.5,0.5');
const decalTex=solidTexture(40,220,90,255);
const decalItem={id:'fx-decal',name:'Decal mark',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:decalTex,placement:'decal'};
const decalMeshes=attachParentDrawings(root,bones,[decalItem],camera);
assert.equal(decalMeshes.length,1);
assert.equal(decalMeshes[0].isSkinnedMesh,true,'decal attaches a SkinnedMesh');
assert.equal(decalMeshes[0].userData.studioParentDrawingPlacement,'decal');
assert.ok((decalMeshes[0].userData.studioParentDrawingDecalTris||0)>=1,'decal clones at least one host triangle');
assert.ok(decalMeshes[0].geometry.attributes.uv,'decal has UVs');
assert.equal(decalMeshes[0].userData.studioParentDrawingDecalMode,'ray-grid','starter hand decal uses denser card→mesh ray-grid UVs');
assert.ok((decalMeshes[0].userData.studioParentDrawingDecalRays||0)>=DECAL_PARENT_DRAWING_MIN_RAY_HITS,'ray-grid recorded enough hits');
assert.ok((decalMeshes[0].userData.studioParentDrawingDecalTris||0)>6,'ray-grid denser than planar host-tri clone');
{
 const grid=decalMeshes[0].userData.studioParentDrawingDecalRayGrid;
 assert.ok(grid&&grid.nx>=DECAL_PARENT_DRAWING_RAY_GRID_MIN&&grid.ny>=DECAL_PARENT_DRAWING_RAY_GRID_MIN,'ray-grid records adaptive nx/ny');
 assert.ok(grid.nx<=DECAL_PARENT_DRAWING_RAY_GRID_MAX&&grid.ny<=DECAL_PARENT_DRAWING_RAY_GRID_MAX,'adaptive grid respects max cap');
}
{
 const duv=decalMeshes[0].geometry.attributes.uv;
 let nearCenter=0;
 for(let i=0;i<duv.count;i++){
  const u=duv.getX(i),v=duv.getY(i);
  if(u>=0&&u<=1&&v>=0&&v<=1)nearCenter++;
 }
 assert.ok(nearCenter===duv.count,'ray-grid UVs stay in card 0..1');
}
assert.ok(decalMeshes[0].material.polygonOffset,'decal uses polygonOffset against z-fight');
// Card point + ray×triangle unit checks
{
 const mid=parentDrawingCardPoint(0.5,0.5,frame);
 assert.ok(mid.distanceTo(frame.center)<1e-6,'card UV 0.5,0.5 is frame center');
 const w0=frame.center.clone().addScaledVector(frame.right,-0.1).addScaledVector(frame.up,-0.1);
 const w1=frame.center.clone().addScaledVector(frame.right,0.1).addScaledVector(frame.up,-0.1);
 const w2=frame.center.clone().addScaledVector(frame.up,0.12);
 const origin=frame.center.clone().addScaledVector(frame.normal,0.2);
 const dir=frame.normal.clone().multiplyScalar(-1);
 const hit=parentDrawingRayTriangle(origin,dir,w0,w1,w2);
 assert.ok(hit&&hit.t>0,'ray hits synthetic card-facing triangle');
 const cast=parentDrawingCardRaycastUV(0.5,0.5,frame,[{i0:0,i1:1,i2:2,w0,w1,w2}]);
 assert.ok(cast&&cast.u===0.5&&cast.v===0.5,'card raycastUV returns sample UV');
 assert.ok(DECAL_PARENT_DRAWING_RAY_GRID>=8);
 assert.ok(DECAL_PARENT_DRAWING_RAY_GRID_MIN>=4&&DECAL_PARENT_DRAWING_RAY_GRID_MAX>=DECAL_PARENT_DRAWING_RAY_GRID);
 assert.ok(DECAL_PARENT_DRAWING_RAY_REF_SPAN>0);
 // Adaptive dims: REF_SPAN world axis → reference cells; tiny UV floors at MIN; wide aspect anisotropic; large+ bump caps at MAX.
 {
  const atRef=decalRayGridDims({planeW:DECAL_PARENT_DRAWING_RAY_REF_SPAN,planeH:DECAL_PARENT_DRAWING_RAY_REF_SPAN},{u0:0,u1:1,v0:0,v1:1},0);
  assert.equal(atRef.nx,DECAL_PARENT_DRAWING_RAY_GRID,'REF_SPAN full U → reference nx');
  assert.equal(atRef.ny,DECAL_PARENT_DRAWING_RAY_GRID,'REF_SPAN full V → reference ny');
  const tiny=decalRayGridDims({planeW:DECAL_PARENT_DRAWING_RAY_REF_SPAN,planeH:DECAL_PARENT_DRAWING_RAY_REF_SPAN},{u0:0.45,u1:0.55,v0:0.45,v1:0.55},0);
  assert.equal(tiny.nx,DECAL_PARENT_DRAWING_RAY_GRID_MIN,'tiny UV floors at MIN');
  assert.equal(tiny.ny,DECAL_PARENT_DRAWING_RAY_GRID_MIN,'tiny UV floors at MIN');
  const wide=decalRayGridDims({planeW:DECAL_PARENT_DRAWING_RAY_REF_SPAN*2,planeH:DECAL_PARENT_DRAWING_RAY_REF_SPAN*0.5},{u0:0,u1:1,v0:0,v1:1},0);
  assert.ok(wide.nx>wide.ny,'wide card is anisotropic (more nx)');
  const huge=decalRayGridDims({planeW:2,planeH:2},{u0:0,u1:1,v0:0,v1:1},80);
  assert.equal(huge.nx,DECAL_PARENT_DRAWING_RAY_GRID_MAX,'large card + cand bump caps at MAX');
  assert.equal(huge.ny,DECAL_PARENT_DRAWING_RAY_GRID_MAX);
  const denser=decalRayGridDims({planeW:DECAL_PARENT_DRAWING_RAY_REF_SPAN*1.5,planeH:DECAL_PARENT_DRAWING_RAY_REF_SPAN*1.5},{u0:0,u1:1,v0:0,v1:1},0);
  assert.ok(denser.nx>DECAL_PARENT_DRAWING_RAY_GRID,'larger than REF_SPAN is denser');
 }
}

// Ink footprint helpers + silhouette clip on Decal ray-grid
{
 assert.ok(DECAL_PARENT_DRAWING_INK_ALPHA>=1);
 const fullPix=parentDrawingTexturePixels(solidTexture(10,20,30,255));
 assert.ok(fullPix&&fullPix.width===1);
 assert.equal(parentDrawingInkAlphaAt(fullPix,0.5,0.5),255);
 const fullFoot=parentDrawingInkFootprintUV(fullPix);
 assert.ok(fullFoot&&fullFoot.u0===0&&fullFoot.u1===1);
 const emptyPix=parentDrawingTexturePixels(solidTexture(0,0,0,0));
 assert.equal(parentDrawingInkFootprintUV(emptyPix),null,'fully transparent → no footprint');
 const blob=blobTexture(32,32,(x,y,set)=>{
  const dx=x-15.5,dy=y-15.5;if(dx*dx+dy*dy<=36)set(40,220,90,255);
 });
 const blobPix=parentDrawingTexturePixels(blob);
 const foot=parentDrawingInkFootprintUV(blobPix);
 assert.ok(foot&&foot.opaque>10,'blob has opaque texels');
 assert.ok(foot.u1-foot.u0<0.9&&foot.v1-foot.v0<0.9,'blob footprint tighter than full card');
 assert.ok(parentDrawingInkAlphaAt(blobPix,0.5,0.5)>DECAL_PARENT_DRAWING_INK_ALPHA,'center opaque');
 assert.ok(parentDrawingInkAlphaAt(blobPix,0.02,0.02)<=DECAL_PARENT_DRAWING_INK_ALPHA,'corner transparent');
 blob.dispose();
}

// Hyperbolic in-cell iso-contour helpers
{
 const stroke=blobTexture(64,64,(x,y,set)=>{
  // Thin diagonal stroke — AABB is loose; contour should hug the ink.
  if(Math.abs((x-y))<=1 && x>=8 && x<56)set(40,220,90,255);
 });
 const pix=parentDrawingTexturePixels(stroke);
 const cont=parentDrawingInkContoursUV(pix);
 assert.ok(cont&&cont.rings.length>=1,'stroke has contour rings');
 assert.ok(cont.segments.length>=8,'stroke has contour segments');
 assert.equal(cont.mode,'fitted-bezier');
 let diag=0;for(const seg of cont.segments){if(Math.abs(seg.u1-seg.u0)>1e-9&&Math.abs(seg.v1-seg.v0)>1e-9)diag++;}
 assert.ok(diag>=1,'diagonal iso segment (not pure texel stair-steps)');
 assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'stroke center inside contour');
 assert.ok(!parentDrawingPointInInkContours(cont,0.1,0.9),'far corner outside contour');
 const foot=cont.footprint;
 assert.ok(foot.u1-foot.u0<0.95&&foot.v1-foot.v0<0.95,'contour footprint tighter than full card');
 const cross=parentDrawingSegmentInkCrossing(cont,0.1,0.9,0.5,0.5);
 assert.ok(cross&&cross.t>0&&cross.t<1,'segment crosses contour');
 stroke.dispose();
}

// Soft-edge: iso sits between texels (not on integer pixel corners only)
{
 const soft=blobTexture(32,32,(x,y,set)=>{
  // Left half opaque, right half transparent — crossing should be threshold-lerp near half.
  if(x<16)set(40,220,90,255);
 });
 const pix=parentDrawingTexturePixels(soft);
 const cont=parentDrawingInkContoursUV(pix);
 assert.ok(cont&&cont.mode==='fitted-bezier','soft-edge fitted-bezier mode');
 let nearHalf=0;
 for(const seg of cont.segments){
  const um=(seg.u0+seg.u1)*0.5;
  if(Math.abs(um-0.5)<0.08 && Math.abs(seg.u1-seg.u0)<0.02)nearHalf++;
 }
 assert.ok(nearHalf>=1,'soft-edge vertical iso near half');
 assert.ok(parentDrawingPointInInkContours(cont,0.25,0.5),'ink side inside');
 assert.ok(!parentDrawingPointInInkContours(cont,0.75,0.5),'clear side outside');
 soft.dispose();
}

// Soft circle: hyperbolic in-cell samples densify curved iso (less faceted than MS chords)
{
 assert.ok(DECAL_PARENT_DRAWING_HYPERBOLIC_ISO_MAX_SAMPLES>=2,'hyperbolic sample cap exported');
 const softC=blobTexture(64,64,(x,y,set)=>{
  const dx=x-31.5,dy=y-31.5;
  const r=Math.sqrt(dx*dx+dy*dy);
  const a=Math.max(0,Math.min(255,Math.round(255*(1-r/20))));
  set(40,220,90,a);
 });
 const pix=parentDrawingTexturePixels(softC);
 const cont=parentDrawingInkContoursUV(pix);
 assert.ok(cont&&cont.mode==='fitted-bezier','soft-circle fitted-bezier mode');
 assert.ok(cont.segments.length>=48,'hyperbolic densifies soft circle vs sparse MS chords');
 let bowed=0;
 for(const ring of cont.rings){
  for(let i=0;i<ring.length-2;i++){
   const a=ring[i],b=ring[i+1],c=ring[i+2];
   const cross=(b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u);
   if(Math.abs(cross)>1e-7)bowed++;
  }
 }
 assert.ok(bowed>=4,'in-cell hyperbola yields non-collinear micro-segments');
 assert.ok(parentDrawingPointInInkContours(cont,0.5,0.5),'soft-circle center inside');
 assert.ok(!parentDrawingPointInInkContours(cont,0.05,0.05),'soft-circle corner outside');
 softC.dispose();
}

// Fitted stroke Bezier on top of hyperbolic densify
{
 assert.ok(DECAL_PARENT_DRAWING_BEZIER_FIT_SAMPLES>=3,'bezier sample cap exported');
 assert.ok(DECAL_PARENT_DRAWING_BEZIER_FIT_CORNER_RAD>0&&DECAL_PARENT_DRAWING_BEZIER_FIT_MAX_CHORD>0,'bezier keypoint thresholds');
 const softC=blobTexture(64,64,(x,y,set)=>{
  const dx=x-31.5,dy=y-31.5;
  const r=Math.sqrt(dx*dx+dy*dy);
  const a=Math.max(0,Math.min(255,Math.round(255*(1-r/20))));
  set(40,220,90,a);
 });
 const pix=parentDrawingTexturePixels(softC);
 const hypOnly=parentDrawingInkContoursUV(pix,undefined,{fitBezier:false});
 const fitted=parentDrawingInkContoursUV(pix);
 assert.ok(hypOnly&&hypOnly.mode==='hyperbolic-iso','opt-out keeps hyperbolic-iso');
 assert.ok(fitted&&fitted.mode==='fitted-bezier','default mode is fitted-bezier');
 assert.equal(fitted.sourceMode,'hyperbolic-iso','source densify remains hyperbolic-iso');
 assert.ok(fitted.segments.length>=32,'fitted soft-circle keeps dense remesh segments');
 // Circularity proxy: UV radii from soft-circle center should stay tight after Bezier fit.
 function radiiStats(cont){
  const rs=[];
  for(const ring of cont.rings){
   for(let i=0;i<ring.length-1;i++){
    const p=ring[i];
    rs.push(Math.hypot(p.u-0.5,p.v-0.5));
   }
  }
  const mean=rs.reduce((a,b)=>a+b,0)/Math.max(1,rs.length);
  let v=0;for(const r of rs)v+=(r-mean)*(r-mean);
  const sd=Math.sqrt(v/Math.max(1,rs.length));
  return {mean,sd,cv:sd/Math.max(mean,1e-9),n:rs.length};
 }
 const hypR=radiiStats(hypOnly),fitR=radiiStats(fitted);
 assert.ok(fitR.n>=16,'fitted ring has enough samples');
 assert.ok(fitR.cv<=hypR.cv*1.25+0.02,'fitted soft-circle stays similarly circular');
 const square=[
  {u:0.2,v:0.2},{u:0.8,v:0.2},{u:0.8,v:0.8},{u:0.2,v:0.8},{u:0.2,v:0.2}
 ];
 const bez=fitParentDrawingInkContourRingBezier(square,{samples:4,cornerRad:0.01,maxChord:0.5});
 assert.ok(bez.length>square.length,'fit densifies keypoint ring');
 const a0=bez[0],a1=bez[bez.length-1];
 assert.ok(Math.abs(a0.u-a1.u)<1e-9&&Math.abs(a0.v-a1.v)<1e-9,'fitted ring stays closed');
 assert.ok(parentDrawingPointInInkContours(fitted,0.5,0.5),'fitted soft-circle center inside');
 assert.ok(!parentDrawingPointInInkContours(fitted,0.05,0.05),'fitted soft-circle corner outside');
 const lens=fitted.segments.map(s=>Math.hypot(s.u1-s.u0,s.v1-s.v0)).filter(L=>L>1e-9).sort((a,b)=>a-b);
 const mid=lens[Math.floor(lens.length/2)]||1e-9;
 const maxL=lens[lens.length-1]||0;
 assert.ok(maxL/mid<12,'fitted chords are not wildly uneven');
 softC.dispose();
}


// Silhouette-clipped Decal: transparent border should tighten UV bounds / mark silhouette
{
 const silTex=blobTexture(64,64,(x,y,set)=>{
  // Large ink island with transparent border so ray-grid still hits, but footprint clips edges.
  if(x>=6&&x<58&&y>=6&&y<58)set(40,220,90,255);
 });
 const silItem={id:'fx-decal-sil',name:'Decal sil',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:silTex,placement:'decal'};
 const silMeshes=attachParentDrawings(root,bones,[silItem],camera);
 assert.equal(silMeshes.length,1);
 assert.equal(silMeshes[0].userData.studioParentDrawingDecalMode,'ray-grid');
 const sil=silMeshes[0].userData.studioParentDrawingDecalSilhouette;
 assert.ok(sil,'silhouette metadata recorded');
 assert.equal(sil.mode,'fitted-bezier','fitted Bezier contour mode');
 assert.ok((sil.contourSegments|0)>=4,'contour segments recorded');
 assert.ok(sil.footprint,'ink footprint recorded');
 assert.ok(sil.footprint.u1-sil.footprint.u0<1,'footprint U span < full card');
 assert.ok(sil.footprint.v1-sil.footprint.v0<1,'footprint V span < full card');
 const ub=silMeshes[0].userData.studioParentDrawingDecalUVBounds;
 assert.ok(ub.u1-ub.u0<=(sil.footprint.u1-sil.footprint.u0)+1e-6,'ray UV window ⊆ ink footprint U');
 assert.ok(ub.v1-ub.v0<=(sil.footprint.v1-sil.footprint.v0)+1e-6,'ray UV window ⊆ ink footprint V');
 const duv=silMeshes[0].geometry.attributes.uv;
 let outside=0;
 for(let i=0;i<duv.count;i++){
  const u=duv.getX(i),v=duv.getY(i);
  if(u<sil.footprint.u0-0.02||u>sil.footprint.u1+0.02||v<sil.footprint.v0-0.02||v>sil.footprint.v1+0.02)outside++;
 }
 assert.equal(outside,0,'decal verts stay inside ink footprint (padded)');
 root.remove(silMeshes[0]);silMeshes[0].geometry.dispose();silMeshes[0].material.dispose();silTex.dispose();
}

assert.notEqual(decalMeshes[0].parent,hand,'decal is not a bone child');
assert.ok(decalMeshes[0].parent===root||decalMeshes[0].parent?.isScene,'decal lives under output root');
{
 let host=null;root.traverse(m=>{if(m.isSkinnedMesh&&m!==decalMeshes[0])host=m;});
 const hostSi=host.geometry.attributes.skinIndex,decalSi=decalMeshes[0].geometry.attributes.skinIndex;
 assert.ok(decalSi.count>=3,'decal has skinned verts');
 // Host bone index for Left hand should appear in decal weights for some verts.
 const handBi=host.skeleton.bones.indexOf(hand);
 let hit=0;
 const sw=decalMeshes[0].geometry.attributes.skinWeight;
 for(let i=0;i<decalSi.count;i++){
  for(let k=0;k<4;k++)if(decalSi.getComponent(i,k)===handBi&&sw.getComponent(i,k)>0.05)hit++;
 }
 assert.ok(hit>0,'decal reuses host hand bone weights');
}
const hostInversesDecal=(()=>{let h=null;root.traverse(m=>{if(m.isSkinnedMesh&&m!==decalMeshes[0]&&m.skeleton)h=m;});return h.skeleton.boneInverses.map(m=>m.clone());})();
{
 let host=null;root.traverse(m=>{if(m.isSkinnedMesh&&m!==decalMeshes[0])host=m;});
 assert.ok(host.skeleton.boneInverses.every((m,i)=>m.equals(hostInversesDecal[i])),'host skeleton inverses preserved after decal');
}
{
 const v0=new THREE.Vector3();decalMeshes[0].applyBoneTransform(0,v0);
 const before=v0.clone();
 hand.rotation.z+=0.55;root.updateMatrixWorld(true);decalMeshes[0].skeleton.update();
 const after=new THREE.Vector3();decalMeshes[0].applyBoneTransform(0,after);
 assert.ok(after.distanceTo(before)>0.01,'decal deforms with host bone');
 hand.rotation.z-=0.55;root.updateMatrixWorld(true);decalMeshes[0].skeleton.update();
}
const decalData=await exportRigGLB(root,bones,rest,rig,1,base,[],{parentDrawings:[decalItem],camera});
const decalReport=await validateBytes(new Uint8Array(decalData));
assert.equal(decalReport.issues.numErrors,0,JSON.stringify(decalReport.issues.messages?.filter(m=>m.severity===0).slice(0,8)));
const decalJson=JSON.parse(Buffer.from(decalData).subarray(20,20+Buffer.from(decalData).readUInt32LE(12)).toString());
const decalNode=decalJson.nodes.find(n=>n.name==='Decal mark');
assert.ok(decalNode,'decal node in glTF');
assert.ok(decalNode.skin!==undefined,'decal node references a skin');
assert.ok(MAX_DECAL_PARENT_DRAWING_TRIS>=64);
// Direct builder + null host path
{
 const built=buildDecalParentDrawingMesh(hand,decalItem,camera,root,decalMeshes[0].material);
 assert.ok(built?.isSkinnedMesh);
 built.geometry.dispose();
}
// Multi-cel decal: scale tracks only
const decalTexA=solidTexture(40,220,90,255),decalTexB=solidTexture(220,40,200,255);
const decalCelItem={id:'fx-decal-cel',name:'Decal cel',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:decalTexA,displayFrame:0,placement:'decal',cels:[{frame:0,texture:decalTexA},{frame:12,texture:decalTexB}]};
const decalCelMeshes=attachParentDrawings(root,bones,[decalCelItem],camera);
assert.equal(decalCelMeshes.length,2);
assert.ok(decalCelMeshes.every(m=>m.isSkinnedMesh&&m.userData.studioParentDrawingPlacement==='decal'));
const decalCelTracks=[];
const decalCelBaked=await bakeParentDrawingBillboards(root,bones,rest,base,[],rig,1,decalCelMeshes,[decalCelItem],camera,decalCelTracks);
assert.equal(decalCelBaked,true);
assert.equal(decalCelTracks.length,2,'decal multi-cel writes scale tracks only');
assert.ok(decalCelTracks.every(t=>t.name.endsWith('.scale')));
for(const mesh of decalCelMeshes){mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
decalTexA.dispose();decalTexB.dispose();

root.remove(decalMeshes[0]);decalMeshes[0].geometry.dispose();decalMeshes[0].material.dispose();decalTex.dispose();

root.remove(confMeshes[0]);confMeshes[0].geometry.dispose();confMeshes[0].material.dispose();confTex.dispose();

// Live preview matches the GLB card. Billboard stays a screen slide.
assert.equal(parentDrawingWantsLive3dPreview({placement:'conform'}),true);
assert.equal(parentDrawingWantsLive3dPreview({placement:'decal'}),true);
assert.equal(parentDrawingWantsLive3dPreview({placement:'billboard'}),false);
assert.equal(parentDrawingWantsLive3dPreview({}),true);
assert.equal(parentDrawingWantsLive3dPreview({placement:'joint-bounds'}),true);
{
 const liveTex=solidTexture(90,180,40,255);
 const liveConf={id:'fx-live-conf',name:'Live conform',joint:hand.name,jointAnchor:[480,270],opacity:1,width:960,height:540,texture:liveTex,placement:'conform'};
 assert.ok(parentDrawingWantsLive3dPreview(liveConf));
 const liveMeshes=attachParentDrawings(root,bones,[liveConf],camera);
 assert.equal(liveMeshes.length,1);
 assert.equal(liveMeshes[0].userData.studioParentDrawingPlacement,'conform');
 assert.ok(liveMeshes[0].isSkinnedMesh,'live conform preview reuses skinned builder');
 liveMeshes[0].parent?.remove(liveMeshes[0]);liveMeshes[0].geometry.dispose();liveMeshes[0].material.dispose();liveTex.dispose();
}

// validateDrawing sceneColorMsaa
{
  const board = newDrawing();
  validateDrawing(board);
  board.sceneColorMsaa = 4; validateDrawing(board);
  board.sceneColorMsaa = 0; validateDrawing(board);
  board.sceneColorMsaa = 8; validateDrawing(board);
  board.sceneColorMsaa = 2; validateDrawing(board);
  delete board.sceneColorMsaa; validateDrawing(board);
  board.sceneColorMsaa = 3;
  assert.throws(() => validateDrawing(board), /MSAA sample count/);
  board.sceneColorMsaa = 16;
  assert.throws(() => validateDrawing(board), /MSAA sample count/);
  board.sceneColorMsaa = '4';
  validateDrawing(board); // floor Number ok for numeric string of allowed value
}

console.log('Parent drawing glTF checks passed: live joint-card preview (billboard stays a screen slide), bone-parented textured plane, mesh-aware joint-bounds+surface+depthWrite (billboard/overlay opt-out), conform multi-bone SkinnedMesh (opt-in), decal host-triangle projection with denser card→mesh raycast UVs + planar fallback (opt-in), billboard TRS bake, stepped cel texture holds, denser walk/pose sampling with smart collapse, Draw blend->Three.js material mapping (Multiply/Screen CustomBlending/Overlay+Soft-light shaders + auto scene-color multipass helpers with MSAA when WebGL2 allows + durable sample-count knob (0/2/4/8)), validator clean, skipped without drawings, requires camera.');
