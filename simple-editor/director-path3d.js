import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {setRigTravelPoint} from './director-channels.js';

export function travelSpace(bone,base){
 bone.updateWorldMatrix(true,false);const parent=bone.parent?.matrixWorld||new THREE.Matrix4();
 if(Math.abs(parent.determinant())<1e-10)throw Error('The joint parent has zero scale. Apply scale before editing travel.');
 if(!Array.isArray(base)||base.length!==3||base.some(v=>!Number.isFinite(v)))throw Error('The joint rest position is unavailable. Reopen its model.');
 const inverse=parent.clone().invert();
 return world=>{const local=new THREE.Vector3(...world).applyMatrix4(inverse);return local.toArray().map((v,i)=>v-base[i]);};
}

export function travelGizmo({scene,camera,canvas,orbit,getContext,commit,draw,notify,onValues}){
 const proxy=new THREE.Object3D(),control=new TransformControls(camera,canvas),helper=control.getHelper();scene.add(proxy,helper);control.attach(proxy);control.setMode('translate');control.setSpace('world');control.setSize(.8);
 let enabled=false,suspended=false,drag=null,draft=null,disposed=false,drawing=false;
 canvas.tabIndex=0;
 function redraw(){if(drawing||disposed)return;drawing=true;try{draw();}finally{drawing=false;}}
 function cancel(){drag=null;draft=null;control.reset();control.dragging=false;orbit.enabled=!suspended;sync();redraw();}
 function sync(){
  if(disposed)return;const ctx=getContext(),visible=enabled&&!suspended&&ctx.active&&!!ctx.bones?.[ctx.joint];
  if(control.enabled!==visible)control.enabled=visible;helper.visible=visible;
  if(!visible){drag=null;draft=null;control.dragging=false;orbit.enabled=!suspended;return;}
  if(!drag){ctx.bones[ctx.joint].getWorldPosition(proxy.position);proxy.updateMatrixWorld(true);}
 }
 control.addEventListener('change',redraw);
 control.addEventListener('mouseDown',()=>{
  try{const c=getContext();if(!enabled||suspended||!c.active)throw Error('Select an active shot first.');
   if(c.rig.contacts?.some(k=>k.joint===c.joint&&c.frame>=k.start&&c.frame<=k.end))throw Error('This joint is pinned at this frame. Edit the contact or move the body instead.');
   const bone=c.bones[c.joint],convert=travelSpace(bone,c.joint===0?c.baseRoot.toArray():bone.userData.studioRestPosition);
   drag={...c,convert,rig:structuredClone(c.rig)};draft=null;orbit.enabled=false;canvas.focus();
  }catch(e){cancel();notify(e.message);}
 });
 control.addEventListener('objectChange',()=>{
  if(!drag)return;
  try{const c=getContext();if(c.signature!==drag.signature||c.frame!==drag.frame||c.joint!==drag.joint)throw Error('The shot or selection changed. Drag cancelled.');
   const values=drag.convert(proxy.position.toArray());draft=setRigTravelPoint(drag.rig,drag.joint,drag.frame,values,drag.lastFrame);onValues(values);redraw();
  }catch(e){cancel();notify(e.message);}
 });
 control.addEventListener('mouseUp',()=>{
  const start=drag,next=draft;drag=null;draft=null;orbit.enabled=!suspended;
  if(start&&next){const c=getContext();if(c.signature===start.signature&&c.frame===start.frame&&c.joint===start.joint&&c.active){commit(next);notify('3D travel point saved. Undo restores the previous path; review contacts after moving.');}else notify('The shot changed. Drag cancelled.');}
  sync();redraw();
 });
 const key=e=>{if(e.key==='Escape'&&drag){e.preventDefault();cancel();notify('Travel drag cancelled.');}};
 const lost=()=>{if(drag){cancel();notify('Travel drag cancelled.');}};
 canvas.addEventListener('keydown',key);canvas.addEventListener('pointercancel',lost);
 sync();return {setEnabled(value){enabled=value;cancel();},setSuspended(value){suspended=value;cancel();},sync,draft:()=>draft,
  dispose(){disposed=true;canvas.removeEventListener('keydown',key);canvas.removeEventListener('pointercancel',lost);control.dispose();proxy.removeFromParent();helper.removeFromParent();drag=null;draft=null;}};
}
