import {validateChannels,rigChannelSpecs} from './director-channels.js';
export const EYE_ROLES=['blinkLeft','blinkRight','lookLeft','lookRight','lookUp','lookDown'];
export function validateEyeMap(rig){
 if(rig.eyeMap===undefined)return;
 if(!rig.eyeMap||Array.isArray(rig.eyeMap)||typeof rig.eyeMap!=='object')throw Error('Invalid eye mapping.');
 const used=new Set();for(const [role,index] of Object.entries(rig.eyeMap)){if(!EYE_ROLES.includes(role)||!(index===null||Number.isInteger(index)&&index>=0&&index<(rig.face?.length||0)))throw Error('Map eyes to existing facial shapes.');if(index!==null){if(used.has(index)||Object.values(rig.mouthMap||{}).includes(index))throw Error('Eye controls need distinct shapes that are not mapped to mouth cues.');used.add(index);}}
}
function mapped(rig,role){const i=rig.eyeMap?.[role];if(!Number.isInteger(i))throw Error('Map '+role+' to a facial shape first.');return i;}
function insert(rig,index,keys,blendTarget){
 rig.channels??=[];const id='face:'+index;let c=rig.channels.find(c=>c.id===id);
 if(c&&(c.enabled===false||c.blendTarget!==blendTarget))throw Error('This eye already has a different or disabled channel. Edit that channel manually or remove it first.');
 if(!c){c={id,keys:[],...(blendTarget===undefined?{}:{blendTarget})};rig.channels.push(c);}
 const start=keys[0].frame,end=keys.at(-1).frame;if(c.keys.some(k=>k.frame>=start&&k.frame<=end))throw Error('Eye gesture overlaps saved keys. Choose an empty interval.');
 const sorted=[...c.keys].sort((a,b)=>a.frame-b.frame);for(let i=1;i<sorted.length;i++){const a=sorted[i-1],b=sorted[i];if(a.frame<end&&b.frame>start&&(blendTarget===undefined||a.value>0||b.value>0))throw Error('Eye gesture overlaps an existing transition. Choose an empty interval.');}
 c.keys.push(...keys);c.keys.sort((a,b)=>a.frame-b.frame);
}
export function draftEyeBlink(rig,{start,close=2,hold=1,open=4,lag=0,strength=1,lastFrame,side='both'}){
 const next=structuredClone(rig);validateEyeMap(next);
 if(![start,close,hold,open,lag,lastFrame].every(Number.isInteger)||start<0||close<1||open<1||hold<0||lag<0||!Number.isFinite(strength)||strength<0||strength>1||!['left','right','both'].includes(side))throw Error('Use valid whole-frame blink timing and strength from 0 to 1.');
 for(const role of side==='both'?['blinkLeft','blinkRight']:[side==='left'?'blinkLeft':'blinkRight']){
  const first=start+(role==='blinkRight'&&side==='both'?lag:0),end=first+close+hold+open;if(end>lastFrame)throw Error('The blink extends beyond the shot.');
  const keys=[{frame:first,value:0,easing:'smooth',kind:'key'},{frame:first+close,value:strength,easing:'hold',kind:'extreme'}];if(hold)keys.push({frame:first+close+hold,value:strength,easing:'smooth',kind:'breakdown'});else keys.at(-1).easing='smooth';keys.push({frame:end,value:0,easing:'smooth',kind:'key'});insert(next,mapped(next,role),keys,1);
 }
 validateChannels(next.channels,rigChannelSpecs(next));return next;
}
export function draftGaze(rig,{start,duration,x,y,lastFrame,face}){
 const next=structuredClone(rig);validateEyeMap(next);
 if(!Number.isInteger(start)||start<0||!Number.isInteger(duration)||duration<1||start+duration>lastFrame||![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=1))throw Error('Use a valid gaze duration and horizontal/vertical values from -1 to 1.');
 for(const [role,target] of [['lookLeft',Math.max(0,-x)],['lookRight',Math.max(0,x)],['lookUp',Math.max(0,y)],['lookDown',Math.max(0,-y)]]){const i=mapped(next,role);insert(next,i,[{frame:start,value:face[i],easing:'smooth',kind:'key'},{frame:start+duration,value:target,easing:'smooth',kind:'key'}]);}
 validateChannels(next.channels,rigChannelSpecs(next));return next;
}
