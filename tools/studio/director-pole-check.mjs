import assert from 'node:assert/strict';
import * as THREE from 'three';
import {starterCharacter,jointsOf,applyPose} from '../../simple-editor/director-3d-engine.js';
import {solveRigIK} from '../../simple-editor/director-ik3d.js';
const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),rig={pose:bones.map(()=>[0,0,0])};
const target=[.4,1.25,.4],pole=[1,.8,0];
function solve(p){applyPose(bones,rest,rig.pose);return solveRigIK(root,bones,rest,rig,5,target,p);}
const before=JSON.stringify(rig),normal=solve(null),orientation=bones[5].getWorldQuaternion(new THREE.Quaternion()),directed=solve(pole);
assert.ok(bones[5].getWorldQuaternion(new THREE.Quaternion()).angleTo(orientation)<1e-6);
assert.ok(normal.distance<.002);assert.ok(directed.distance<.002);assert.equal(directed.poleApplied,true);assert.equal(directed.poleLimited,false);assert.equal(JSON.stringify(rig),before);
const start=bones[3].getWorldPosition(new THREE.Vector3()),axis=bones[5].getWorldPosition(new THREE.Vector3()).sub(start).normalize();
const bend=bones[4].getWorldPosition(new THREE.Vector3()).sub(start),wanted=new THREE.Vector3(...pole).sub(start);bend.addScaledVector(axis,-bend.dot(axis));wanted.addScaledVector(axis,-wanted.dot(axis));assert.ok(bend.normalize().dot(wanted.normalize())>.99999);
const lengths=[bones[4].position.length(),bones[5].position.length()];assert.ok(Math.abs(lengths[0]-.42)<1e-6);assert.ok(Math.abs(lengths[1]-.38)<1e-6);
root.rotation.set(.1,.6,.2);root.scale.setScalar(1.5);assert.ok(solve([2,.2,1]).pose.flat().every(Number.isFinite));root.rotation.set(0,0,0);root.scale.setScalar(1);
rig.limits=bones.map(()=>null);rig.limits[3]=[[0,0,0],[0,0,0]];const constrained=solve(pole);assert.deepEqual(constrained.pose[3],[0,0,0]);assert.equal(constrained.poleLimited,true);
delete rig.limits;assert.throws(()=>solve([NaN,0,0]),/bend target/);
applyPose(bones,rest,rig.pose);const shoulder=bones[3].getWorldPosition(new THREE.Vector3());assert.throws(()=>solveRigIK(root,bones,rest,rig,5,target,shoulder.toArray()),/away from/);
console.log('Pole authoring passed: endpoint, requested bend plane, lengths, source isolation, transformed parent, limits and invalid target handling.');
