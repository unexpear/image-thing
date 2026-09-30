import {defaultRig,layerMatrix,transformPoint,solveLimb} from './director-rig.js';
export function validateWalk(board){
 const w=board.walk;if(w===undefined)return;
 if(!w||!Number.isFinite(w.stride)||Math.abs(w.stride)<1||Math.abs(w.stride)>160||!Number.isFinite(w.lift)||w.lift<0||w.lift>60||!Number.isFinite(w.period)||w.period<12||w.period>240)throw Error('Walk needs stride 1–160, lift 0–60 and cycle 12–240 frames.');
 const root=board.layers.find(l=>l.id===w.root);
 if(!root||root.rig?.parent)throw Error('Choose an unparented torso layer for walking.');
 if(w.left===w.right)throw Error('Choose two different feet.');
 const used=new Set();
 for(const id of [w.left,w.right]){
  const foot=board.layers.find(l=>l.id===id),lower=board.layers.find(l=>l.id===foot?.rig?.parent),upper=board.layers.find(l=>l.id===lower?.rig?.parent);
  if(!foot?.rig||!lower?.rig||!upper?.rig||upper.rig.parent!==root.id)throw Error('Each foot must link to a lower leg, an upper leg, then the chosen torso.');
  for(const part of [foot,lower,upper]){if(used.has(part.id))throw Error('Walking needs two separate leg chains.');used.add(part.id);}
 }
}
// Stance lasts 60% of a cycle: its world-space anchor never moves.
export function footStep(cycle,stride,lift){
 const n=Math.floor(cycle),phase=cycle-n,u=Math.max(0,(phase-.6)/.4),smooth=u*u*(3-2*u);
 return {x:(n+smooth)*stride,y:-Math.sin(Math.PI*u)*lift,stance:phase<=.6};
}
export function sampleWalk(board,frame,reference=board){
 const w=board.walk;if(!w)return board;
 const layers=structuredClone(board.layers).map(l=>({...l,locked:false})),root=layers.find(l=>l.id===w.root),cycle=Math.max(0,frame)/w.period;
 const anchors=[w.left,w.right].map(id=>{const foot=reference.layers.find(l=>l.id===id);return transformPoint(layerMatrix(reference.layers,foot),[foot.rig.pivotX,foot.rig.pivotY]);});
 root.rig={...(root.rig||defaultRig())};root.rig.x+=cycle*w.stride;
 // Recoil and rise occur twice per cycle; the foot constraints absorb the torso motion.
 root.rig.y+=Math.sin(cycle*4*Math.PI)*Math.min(3,w.lift*.15);
 let clamped=false;
 [w.left,w.right].forEach((id,i)=>{
  const step=footStep(cycle+i*.5,w.stride,w.lift),start=footStep(i*.5,w.stride,w.lift),target=[anchors[i][0]+step.x-start.x,anchors[i][1]+step.y-start.y];
  const solved=solveLimb(layers,id,target,1);clamped ||= solved.clamped;
  for(const p of solved.poses)layers.find(l=>l.id===p.id).rig.angle=p.angle;
  // Counterrotate the foot so the sole stays level as the knee bends.
  const foot=layers.find(l=>l.id===id),parent=layers.find(l=>l.id===foot.rig.parent),matrix=layerMatrix(layers,parent);
  // Transform a world-horizontal sole direction into the parent's scaled space.
  foot.rig.angle=Math.atan2(-matrix[1],matrix[3])*180/Math.PI;
 });
 layers.forEach((layer,i)=>layer.locked=board.layers[i].locked);
 return {...board,layers,walkClamped:clamped};
}
export function createWalkControls({board,commit,button,notify}){
 const panel=document.createElement('details');panel.className='settings';panel.innerHTML='<summary>Planted-foot walk</summary><p>For a side-view character: torso → upper leg → lower leg → foot, on both sides. Start with bent knees. Positive stride walks right, negative walks left. Walk adds to pose animation; shorten the stride if the reach warning appears.</p>';
 const inputs={};
 for(const [key,label] of [['root','Walking torso'],['left','First foot'],['right','Second foot'],['stride','Distance per cycle (pixels)'],['lift','Foot lift (pixels)'],['period','Frames per walk cycle']]){
  const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;
  const input=document.createElement(['root','left','right'].includes(key)?'select':'input');input.setAttribute('aria-label',label);inputs[key]=input;
  if(input.tagName==='SELECT')for(const layer of board().layers)input.add(new Option(layer.name,layer.id));else{input.type='number';input.value={stride:30,lift:10,period:32}[key];}
  if(board().walk?.[key]!==undefined)input.value=board().walk[key];wrap.append(input);panel.append(wrap);
 }
 panel.append(button('Apply walk',()=>{try{const walk=Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.tagName==='SELECT'?i.value:Number(i.value)])),candidate={...board(),walk};validateWalk(candidate);for(let f=0;f<walk.period;f++)if(sampleWalk(candidate,f).walkClamped)throw Error('This stride exceeds the legs’ reach. Bend the resting knees, reduce stride or reduce foot lift.');commit(()=>board().walk=walk);notify('Walk enabled. Open Animate rig to play or save its clip.');}catch(e){notify(e.message);}}),button('Remove walk',()=>{commit(()=>delete board().walk);notify('Walk removed; saved poses are kept.');}));
 panel.update=()=>{for(const key of ['stride','lift','period'])if(board().walk)inputs[key].value=board().walk[key];for(const key of ['root','left','right']){const input=inputs[key],value=input.value;input.replaceChildren(...board().layers.map(l=>new Option(l.name,l.id)));input.value=board().walk?.[key]??value;} };
 return panel;
}
