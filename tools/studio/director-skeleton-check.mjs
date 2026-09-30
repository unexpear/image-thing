import assert from 'node:assert/strict';
import {validateSkeleton,boneWeights} from '../../simple-editor/director-skeleton-state.js';
import {validateProject,newProject} from '../../simple-editor/director-project.js';
const joints=[{name:'Root',parent:-1,position:[0,0,0]},{name:'Tip',parent:0,position:[0,1,0]}];validateSkeleton(joints);
for(const p of [[0,0,0],[0,.5,0],[1,1,0]]){const weights=boneWeights(p,joints);assert.ok(weights.every(w=>w[1]>=0&&Number.isFinite(w[1])));assert.ok(Math.abs(weights.reduce((n,w)=>n+w[1],0)-1)<1e-9);assert.equal(boneWeights(p,joints,false).length,1);}
assert.throws(()=>validateSkeleton([{name:'Cycle',parent:0,position:[0,0,0]}]));
const p=newProject();p.scenes[0].shots=[{id:'hour',seconds:3600,skeletonDraft:{model:{name:'fixture.glb',type:'input',subfolder:'studio-director'},joints},drawing:{version:1,layers:[{id:'l',name:'l',visible:true,locked:false,opacity:1,strokes:[]}],keyframes:[{frame:86399,easing:'hold',poses:[]}]}}];validateProject(p);p.scenes[0].shots[0].seconds=3601;assert.throws(()=>validateProject(p));console.log('Skeleton validation, normalized weights and one-hour shot/frame boundaries passed.');
