import assert from 'node:assert/strict';
import * as THREE from 'three';
import {travelGizmo} from '../../simple-editor/director-path3d.js';
class Canvas extends EventTarget{style={};focus(){} }
const canvas=new Canvas(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),bone=new THREE.Bone();bone.position.y=1;scene.add(bone);
const rig={names:['Root'],pose:[[0,0,0]],keys:[]},ctx={rig,bones:[bone],baseRoot:bone.position.clone(),joint:0,frame:12,lastFrame:100,signature:'original',active:true},orbit={enabled:true},commits=[],messages=[];
let gizmo;gizmo=travelGizmo({scene,camera,canvas,orbit,getContext:()=>ctx,commit:value=>commits.push(value),draw:()=>gizmo?.sync(),notify:message=>messages.push(message),onValues:()=>{}});
const helper=scene.children.find(o=>o.isTransformControlsRoot),control=helper.controls;
gizmo.setEnabled(true);
function begin(){control.dragging=true;control.dispatchEvent({type:'mouseDown'});control.object.position.x+=.5;control.dispatchEvent({type:'objectChange'});}
begin();assert.ok(gizmo.draft());assert.equal(commits.length,0);assert.equal(orbit.enabled,false);
const escape=new Event('keydown',{cancelable:true});Object.defineProperty(escape,'key',{value:'Escape'});canvas.dispatchEvent(escape);assert.equal(gizmo.draft(),null);assert.equal(orbit.enabled,true);control.dispatchEvent({type:'mouseUp'});assert.equal(commits.length,0);
begin();canvas.dispatchEvent(new Event('pointercancel'));assert.equal(gizmo.draft(),null);assert.equal(orbit.enabled,true);assert.equal(commits.length,0);
begin();ctx.signature='changed';control.dispatchEvent({type:'mouseUp'});assert.equal(commits.length,0);assert.equal(orbit.enabled,true);ctx.signature='original';
begin();ctx.active=false;gizmo.sync();assert.equal(gizmo.draft(),null);assert.equal(orbit.enabled,true,'Losing active view must restore orbit');ctx.active=true;gizmo.sync();
begin();gizmo.setSuspended(true);assert.equal(helper.visible,false);assert.equal(gizmo.draft(),null);assert.equal(orbit.enabled,false);gizmo.setSuspended(false);assert.equal(orbit.enabled,true);
begin();control.dispatchEvent({type:'mouseUp'});assert.equal(commits.length,1);assert.equal(commits[0].channels.length,3);assert.equal(rig.channels,undefined);
gizmo.dispose();assert.equal(scene.children.some(o=>o.isTransformControlsRoot),false);
console.log('Gizmo event lifecycle passed: Escape, pointer cancel, stale project, inactive view, suspension, one commit and cleanup. Uses real TransformControls with a synthetic canvas, not live browser input.');
