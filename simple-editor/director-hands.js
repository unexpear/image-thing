import {validateChannels,rigChannelSpecs} from './director-channels.js';
export function validateHandPoses(rig){
 const poses=rig.handPoses===undefined?[]:rig.handPoses;
 if(!Array.isArray(poses)||poses.length>32)throw Error('Keep at most 32 hand poses.');
 const names=new Set();
 for(const p of poses){
  if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>80||names.has(p.name)||!Number.isInteger(p.wrist)||p.wrist<0||p.wrist>=rig.names.length||!Array.isArray(p.joints)||!p.joints.length||p.joints.length>127||!Array.isArray(p.pose)||p.pose.length!==p.joints.length)throw Error('Invalid saved hand pose.');
  names.add(p.name);const joints=new Set();
  p.joints.forEach((j,i)=>{if(!Number.isInteger(j)||j<0||j>=rig.names.length||j===p.wrist||joints.has(j)||!Array.isArray(p.pose[i])||p.pose[i].length!==3||p.pose[i].some(v=>!Number.isFinite(v)||Math.abs(v)>360))throw Error('Invalid hand pose joints or rotations.');joints.add(j);});
 }
}
export function fingerJoints(bones,wrist){
 if(!bones[wrist])throw Error('Select a wrist joint.');
 const result=[];bones.forEach((b,i)=>{if(i===wrist)return;for(let p=b.parent;p;p=p.parent)if(p===bones[wrist]){result.push(i);break;}});
 if(!result.length)throw Error('This joint has no finger descendants. Select a wrist on a finger-capable rig.');return result;
}
export function saveHandPose(rig,bones,wrist,name){
 const next=structuredClone(rig),joints=fingerJoints(bones,wrist);next.handPoses=(next.handPoses||[]).filter(p=>p.name!==name);
 next.handPoses.push({name,wrist,joints,pose:joints.map(i=>[...rig.pose[i]])});validateHandPoses(next);return next;
}
export function blendHandPose(rig,bones,name,amount){
 validateHandPoses(rig);const saved=rig.handPoses?.find(p=>p.name===name);
 if(!saved||!Number.isFinite(amount)||amount<0||amount>1)throw Error('Choose a hand pose and blend amount from 0 to 1.');
 const current=fingerJoints(bones,saved.wrist);if(saved.joints.some(i=>!current.includes(i)))throw Error('The finger hierarchy changed. Save a new hand pose.');
 const next=structuredClone(rig);saved.joints.forEach((i,n)=>{const value=rig.pose[i].map((v,j)=>v+(saved.pose[n][j]-v)*amount);if(rig.limits?.[i]&&value.some((v,j)=>v<rig.limits[i][0][j]||v>rig.limits[i][1][j]))throw Error('Hand pose exceeds joint limits. Reduce the blend or edit the fingers.');next.pose[i]=value;});return next;
}
export function draftHandGrip(rig,bones,name,{start,close=8,hold=24,release=8,strength=1,lastFrame}){
 validateHandPoses(rig);
 const saved=rig.handPoses?.find(p=>p.name===name);
 if(!saved)throw Error('Save and select a hand pose first.');
 const current=fingerJoints(bones,saved.wrist);
 if(saved.joints.some(i=>!current.includes(i)))throw Error('The finger hierarchy changed. Save a new hand pose.');
 if(![start,close,hold,release,lastFrame].every(Number.isInteger)||start<0||close<1||hold<0||release<0||lastFrame>=86400||start+close+hold+release>lastFrame||!Number.isFinite(strength)||strength<=0||strength>1)throw Error('Use whole-frame grip timing inside the shot and strength above 0 through 1.');
 const next=structuredClone(rig);next.channels??=[];
 saved.joints.forEach((joint,n)=>saved.pose[n].forEach((target,axis)=>{
  if(rig.limits?.[joint]&&(target<rig.limits[joint][0][axis]||target>rig.limits[joint][1][axis]))throw Error('Saved grip exceeds joint limits. Edit the hand pose first.');
  const id=`joint:${joint}:${axis}`,existing=next.channels.find(c=>c.id===id);
  if(existing&&(existing.enabled===false||existing.blendTarget!==target||existing.exposure&&existing.exposure!==1))throw Error('A finger already has an incompatible or disabled channel. Edit it manually or remove it first.');
  const end=start+close+hold+release,keys=[{frame:start,value:0,easing:'smooth',kind:'key'},{frame:start+close,value:strength,easing:hold?'hold':'smooth',kind:'extreme'}];
  if(hold)keys.push({frame:start+close+hold,value:strength,easing:'smooth',kind:'breakdown'});
  if(release)keys.push({frame:end,value:0,easing:'smooth',kind:'key'});
  const sorted=[...existing?.keys||[]].sort((a,b)=>a.frame-b.frame);
  if(sorted.some(k=>k.frame>=start&&k.frame<=end)||sorted.length&&(sorted[0].frame>start&&sorted[0].value>0||sorted.at(-1).frame<end&&sorted.at(-1).value>0)||sorted.some((a,i)=>{const b=sorted[i+1];return b&&a.frame<end&&b.frame>start&&(a.value>0||b.value>0);})||!release&&sorted.some(k=>k.frame>end))throw Error('Grip overlaps saved finger animation. Choose an empty interval or edit the existing channels.');
  if(existing){existing.keys.push(...keys);existing.keys.sort((a,b)=>a.frame-b.frame);}else next.channels.push({id,blendTarget:target,keys});
 }));
 validateChannels(next.channels,rigChannelSpecs(next));return next;
}
export function handPoseControls({host,getRig,getRuntime,getFrame,lastFrame,edit,working,busy,notify}){
 const panel=document.createElement('details');panel.className='settings';const heading=document.createElement('summary');heading.textContent='Hands · reusable finger poses';panel.append(heading);host.append(panel);
 const help=document.createElement('p');help.textContent='Select a wrist with 3D joint, pose its finger bones, then save. Only descendant joints are stored; wrist, body and face stay unchanged. Load the preview pose first when editing animation, then save a 3D keyframe after blending. This does not create fingers or detect prop collisions.';panel.append(help);
 function field(label,type){const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const input=document.createElement(type==='select'?'select':'input');if(type!=='select')input.type=type;input.setAttribute('aria-label',label);wrap.append(input);panel.append(wrap);return input;}
 const name=field('Hand pose name','text'),saved=field('Saved hand pose','select'),amount=field('Hand pose blend','number');name.maxLength=80;amount.min=0;amount.max=1;amount.step=.1;amount.value=1;
 function action(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(busy())return;try{fn();}catch(e){notify(e.message);}};panel.append(b);}
 action('Save selected wrist finger pose',()=>{const r=getRuntime(),next=saveHandPose(getRig(),r.bones,r.joint,name.value.trim());edit(rig=>rig.handPoses=next.handPoses);});
 action('Blend saved fingers into working pose',()=>{const next=blendHandPose(getRig(),getRuntime().bones,saved.value,Number(amount.value));working();edit(r=>r.pose=next.pose);});
 action('Remove saved hand pose',()=>edit(r=>r.handPoses=(r.handPoses||[]).filter(p=>p.name!==saved.value)));
 const timing=document.createElement('p');timing.textContent='Animate the selected hand pose from the playhead. Closing and release blend over the underlying finger motion; zero release keeps the grip through the shot. Body, wrist and face keys stay unchanged. Adjust the generated finger blend channels under independent channels. This does not fit fingers to a prop or detect collisions.';panel.append(timing);
 const close=field('Grip closing frames','number'),hold=field('Grip hold frames','number'),release=field('Grip release frames (0 keeps grip)','number');
 for(const [input,value,min] of [[close,8,1],[hold,24,0],[release,8,0]]){input.value=value;input.min=min;input.step=1;}
 action('Animate saved grip from playhead',()=>{const next=draftHandGrip(getRig(),getRuntime().bones,saved.value,{start:getFrame(),close:Number(close.value),hold:Number(hold.value),release:Number(release.value),strength:Number(amount.value),lastFrame:lastFrame()});edit(r=>r.channels=next.channels);notify('Editable grip timing added. Scrub the shot to check finger and prop contact.');});
 return {refresh(){const value=saved.value;saved.replaceChildren(...(getRig().handPoses||[]).map(p=>new Option(p.name,p.name)));if([...saved.options].some(o=>o.value===value))saved.value=value;}};
}
