import * as THREE from 'three';
import {applyRigFrame} from './director-3d-engine.js';

// Review every frame; only the displayed trajectory is downsampled for long shots.
export async function reviewRigMotion({root,bones,rest,baseRoot,morphs,rig,joint,start,end,signal,onProgress=()=>{}}){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=86400||!Number.isInteger(joint)||!bones[joint])throw Error('Choose a joint and a valid frame range.');
 const saved=[];root.traverse(o=>saved.push({o,parent:o.parent,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone(),face:o.morphTargetInfluences?.slice()}));
 const points=[],issues=[],stride=Math.max(1,Math.ceil((end-start+1)/4000)),position=new THREE.Vector3(),rotation=new THREE.Quaternion();let maxStep=0,maxStepFrame=start,previous=null,issueFrames=0,maxContactError=0,maxOrientationError=0,supportFrames=0,balanceFrames=0,maxBalanceOffset=0,maxBalanceFrame=start;
 try{
  for(let frame=start;frame<=end;frame++){
   if(signal?.aborted)throw Error('Motion review cancelled.');
   const sampled=applyRigFrame(root,bones,rest,baseRoot,morphs,rig,frame);root.updateMatrixWorld(true);bones[joint].getWorldPosition(position);
   const step=previous?position.distanceTo(previous):0;if(step>maxStep){maxStep=step;maxStepFrame=frame;}previous=position.clone();
   if((frame-start)%stride===0||frame===end)points.push({frame,position:position.toArray()});
   const contacts=[];for(const c of rig.contacts||[]){if(frame<c.start||frame>c.end)continue;const bone=bones[c.joint],error=bone.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...c.target)),angle=bone.getWorldQuaternion(rotation).angleTo(new THREE.Quaternion(...c.orientation));maxContactError=Math.max(maxContactError,error);maxOrientationError=Math.max(maxOrientationError,angle);if(error>.01||angle>.02)contacts.push({joint:c.joint,id:c.id,error,angle});}
   if(sampled.warnings.length||contacts.length){issueFrames++;if(issues.length<200)issues.push({frame,warnings:sampled.warnings,contacts});}
   const feet=(rig.contacts||[]).filter(c=>frame>=c.start&&frame<=c.end&&/foot|toe/i.test(bones[c.joint]?.name||''));
   if(feet.length){supportFrames++;const planted=feet.map(c=>bones[c.joint].getWorldPosition(new THREE.Vector3())),support=planted.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/planted.length),com=bones.reduce((sum,b)=>sum.add(b.getWorldPosition(new THREE.Vector3())),new THREE.Vector3()).multiplyScalar(1/bones.length),offset=Math.hypot(com.x-support.x,com.z-support.z);let radius=.08;for(const p of planted)radius=Math.max(radius,Math.hypot(p.x-support.x,p.z-support.z));if(offset>radius+.02)balanceFrames++;if(offset>maxBalanceOffset){maxBalanceOffset=offset;maxBalanceFrame=frame;}}
   if((frame-start)%48===0){onProgress(frame-start+1,end-start+1);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  return {start,end,joint,points,stride,issues,issueFrames,maxStep,maxStepFrame,maxContactError,maxOrientationError,supportFrames,balanceFrames,maxBalanceOffset,maxBalanceFrame};
 }finally{for(const {o,parent,p,q,s,face} of saved){if(parent&&o.parent!==parent)parent.add(o);o.position.copy(p);o.quaternion.copy(q);o.scale.copy(s);if(face)o.morphTargetInfluences.splice(0,face.length,...face);}root.updateMatrixWorld(true);}
}

/** How many motion-review guide sets Clear motion review guides would remove (session scene overlay). */
export function clearableMotionReviewGuideCount(guide){
 return guide ? 1 : 0;
}
export function motionReviewControls({host,scene,runtime,getRig,lastFrame,active,isBusy,setBusy,stop,draw,seek,notify}){
 const panel=document.createElement('details');panel.className='settings';const summary=document.createElement('summary');summary.textContent='3D motion paths & contact review';panel.append(summary);host.append(panel);
 const note=document.createElement('p');note.textContent='Review the selected joint’s world-space path and every contact on every frame in this range. Yellow dots show sampled frames; larger gaps mean faster movement. Planted foot contacts also estimate balance from the average joint position against the foot span. These guides are excluded from recording and export. This is reach, orientation and a joint-average proxy, not body mass, collision or a physics solve.';panel.append(note);
 function field(name,value){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=name;const input=document.createElement('input');input.type='number';input.min=0;input.step=1;input.value=value;input.setAttribute('aria-label',name);wrap.append(input);panel.append(wrap);return input;}
 const start=field('Motion review start frame',0),end=field('Motion review end frame',24),status=document.createElement('p');status.setAttribute('role','status');panel.append(status);const results=document.createElement('div');panel.append(results);
 let controller=null,guide=null,fingerprint=null,disposed=false;
 function button(name,fn){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;panel.append(b);return b;}
 const signature=()=>JSON.stringify([getRig(),lastFrame(),runtime().joint]);
 let clearGuidesBtn;
 function syncClearMotionGuidesButton(){
  if(!clearGuidesBtn)return;
  const clearable=clearableMotionReviewGuideCount(guide);
  clearGuidesBtn.disabled=!clearable;
  clearGuidesBtn.title=clearable
   ? ('Clear '+clearable+' motion review guide set'+(clearable===1?'':'s')+' from the 3D view')
   : 'No motion review guides to clear';
 }
 function clear(){guide?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});guide?.removeFromParent();guide=null;fingerprint=null;results.replaceChildren();syncClearMotionGuidesButton();}
 function refresh(){if(fingerprint&&fingerprint!==signature()){clear();status.textContent='Animation changed. Calculate a fresh motion review.';}start.max=end.max=lastFrame();syncClearMotionGuidesButton();}
 const run=button('Calculate motion path & check contacts',async()=>{
  if(controller||isBusy()||!active())return;const first=Number(start.value),last=Number(end.value);if(last>lastFrame()){notify('Review range extends beyond the shot.');return;}
  stop();clear();controller=new AbortController();const before=signature();run.disabled=true;cancel.hidden=false;setBusy(true);
  try{const rig=structuredClone(getRig()),rt=runtime(),report=await reviewRigMotion({...rt,rig,start:first,end:last,signal:controller.signal,onProgress:(n,total)=>{if(!active()||signature()!==before)controller.abort();status.textContent='Checking frame '+(first+n-1)+' · '+Math.round(n/total*100)+'%';}});
   if(disposed||!active()||signature()!==before)throw Error('Animation changed or the panel closed. Recalculate the review.');
   guide=new THREE.Group();guide.name='Motion review guides';const geometry=new THREE.BufferGeometry().setFromPoints(report.points.map(p=>new THREE.Vector3(...p.position)));guide.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x2bdab9,depthTest:false})));guide.add(new THREE.Points(geometry.clone(),new THREE.PointsMaterial({color:0xffd46b,size:5,sizeAttenuation:false,depthTest:false})));guide.renderOrder=100;scene.add(guide);fingerprint=before;syncClearMotionGuidesButton();
   const balance=report.supportFrames?' Balance proxy: largest horizontal offset '+report.maxBalanceOffset.toFixed(4)+' units at frame '+report.maxBalanceFrame+'; '+report.balanceFrames+' frames place the joint average outside the planted-foot span.':' No planted foot contacts in this range, so balance was not estimated.';
   status.textContent=(report.end-report.start+1)+' frames checked · '+report.issueFrames+' frames with contact problems. Largest joint step: '+report.maxStep.toFixed(4)+' units at frame '+report.maxStepFrame+'. Maximum contact error: '+report.maxContactError.toFixed(4)+' units / '+(report.maxOrientationError*180/Math.PI).toFixed(2)+'°. Display path spacing: '+report.stride+' frame(s).'+balance;
   const jump=(label,frame)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(!controller)seek(frame);};results.append(b);};jump('Inspect largest step · frame '+report.maxStepFrame,report.maxStepFrame);
   for(const issue of report.issues)jump('Contact issue · frame '+issue.frame,issue.frame);
   if(report.issueFrames>report.issues.length){const p=document.createElement('p');p.textContent='Showing the first 200 problem frames. Narrow the range to inspect later frames.';results.append(p);}
  }catch(e){if(!disposed){status.textContent=e.message;notify(e.message);}}finally{controller=null;if(!disposed){setBusy(false);run.disabled=false;cancel.hidden=true;draw();}}
 });
 const cancel=button('Cancel motion review',()=>controller?.abort());cancel.hidden=true;
 clearGuidesBtn=button('Clear motion review guides',()=>{
  if(controller||isBusy())return;
  const clearable=clearableMotionReviewGuideCount(guide);
  if(!clearable){status.textContent='No motion review guides to clear.';syncClearMotionGuidesButton();return;}
  clear();status.textContent='Motion guides cleared.';draw();
 });
 syncClearMotionGuidesButton();
 panel.addEventListener('toggle',()=>{if(panel.open)refresh();});
 return {refresh,setVisible:visible=>{if(guide)guide.visible=visible;},dispose:()=>{disposed=true;controller?.abort();clear();}};
}
