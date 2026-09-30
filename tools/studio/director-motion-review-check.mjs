import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,applyRigFrame} from '../../simple-editor/director-3d-engine.js';
import {reviewRigMotion,clearableMotionReviewGuideCount} from '../../simple-editor/director-motion-review.js';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),baseRoot=bones[0].position.clone(),pose=bones.map(()=>[0,0,0]);
const rig={version:1,model:null,names:bones.map(b=>b.name),pose,keys:[],channels:[{id:'root:0',keys:[{frame:0,value:0,easing:'linear'},{frame:24,value:.08,easing:'linear'}]}]};
root.updateMatrixWorld(true);rig.contacts=[{id:'foot',joint:11,start:0,end:24,target:bones[11].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[11].getWorldQuaternion(new THREE.Quaternion()).toArray()}];
applyRigFrame(root,bones,rest,baseRoot,[],rig,12);const transforms=()=>JSON.stringify(bones.map(b=>[b.position.toArray(),b.quaternion.toArray(),b.scale.toArray()])),before=transforms(),source=JSON.stringify(rig);
const args={root,bones,rest,baseRoot,morphs:[],rig,joint:11,start:0,end:24};
const report=await reviewRigMotion(args);assert.equal(report.issueFrames,0);assert.equal(report.points.length,25);assert.ok(report.maxContactError<=.01);assert.ok(report.maxStep<.01);assert.equal(report.supportFrames,25);assert.ok(report.balanceFrames>0);assert.equal(transforms(),before);assert.equal(JSON.stringify(rig),source);
const planted=structuredClone(rig);planted.channels=[];planted.contacts.push({id:'other',joint:14,start:0,end:24,target:bones[14].getWorldPosition(new THREE.Vector3()).toArray(),orientation:bones[14].getWorldQuaternion(new THREE.Quaternion()).toArray()});const quiet=await reviewRigMotion({...args,rig:planted});assert.equal(quiet.issueFrames,0);assert.equal(quiet.supportFrames,25);assert.equal(quiet.balanceFrames,0);
const moving=await reviewRigMotion({...args,joint:0});assert.ok(moving.maxStep>.003);assert.equal(transforms(),before);
const bad=structuredClone(rig);bad.contacts[0].target=[100,100,100];const failed=await reviewRigMotion({...args,rig:bad});assert.equal(failed.issueFrames,25);assert.equal(failed.issues[0].frame,0);assert.ok(failed.maxContactError>100);assert.equal(transforms(),before);
const controller=new AbortController();await assert.rejects(()=>reviewRigMotion({...args,signal:controller.signal,onProgress:()=>controller.abort()}),/cancelled/);assert.equal(transforms(),before);
await assert.rejects(()=>reviewRigMotion({...args,end:-1}),/valid frame/);
const unplanted=structuredClone(rig);unplanted.contacts[0].joint=5;unplanted.names=bones.map(b=>b.name);const hand=await reviewRigMotion({...args,rig:unplanted,joint:5});assert.equal(hand.supportFrames,0);assert.equal(hand.balanceFrames,0);

// Clear motion review guides disabled-when-empty (Clear unsaved marks / Clear title overrides parity)
{
  assert.equal(clearableMotionReviewGuideCount(null), 0);
  assert.equal(clearableMotionReviewGuideCount(undefined), 0);
  assert.equal(clearableMotionReviewGuideCount(false), 0);
  assert.equal(clearableMotionReviewGuideCount({}), 1, "any present guide group counts as one clearable set");
  assert.equal(clearableMotionReviewGuideCount({name:"Motion review guides"}), 1);
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const src = readFileSync(join(rootDir, "simple-editor/director-motion-review.js"), "utf8");
  assert.match(src, /clearableMotionReviewGuideCount/);
  assert.match(src, /syncClearMotionGuidesButton/);
  assert.match(src, /Clear motion review guides/);
  assert.match(src, /No motion review guides to clear/);
  assert.ok(src.includes("clearGuidesBtn.disabled=!clearable"), "Clear motion guides disabled sync");
  assert.ok(src.includes("clearableMotionReviewGuideCount(guide)"), "Clear button uses clearable count");
  console.log("Clear motion review guides disabled-when-empty: clearable count + UI wiring.");
}
console.log('Motion review passed: path samples, contact diagnostics, planted-foot balance proxy, frame locations, cancellation, pose restoration and nonmutation, clear-guides-disabled.');
