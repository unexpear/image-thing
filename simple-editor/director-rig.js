export const defaultRig=()=>({parent:null,pivotX:480,pivotY:270,x:0,y:0,angle:0,stretch:1,stretchAxis:'y'});
export function validateRigs(layers){
 const byId=new Map(layers.map(l=>[l.id,l]));
 for(const layer of layers){
  const rig=layer.rig;if(rig===undefined)continue;
  if(!rig||typeof rig!=='object'||(rig.parent!==null&&!byId.has(rig.parent)))throw Error('Rig parent must be a layer in this drawing.');
  if(rig.stretch!==undefined&&(!Number.isFinite(rig.stretch)||rig.stretch<.25||rig.stretch>4))throw Error('Stretch must be between 0.25 and 4.');
  if(rig.stretchAxis!==undefined&&!['x','y'].includes(rig.stretchAxis))throw Error('Choose horizontal or vertical stretch.');
  for(const [key,min,max] of [['pivotX',0,960],['pivotY',0,540],['x',-1920,1920],['y',-1080,1080],['angle',-360,360]])if(!Number.isFinite(rig[key])||rig[key]<min||rig[key]>max)throw Error('Rig '+key+' is outside its allowed range.');
  const visited=new Set();let current=layer;
  while(current){if(visited.has(current.id))throw Error('Rig links cannot form a cycle.');visited.add(current.id);current=byId.get(current.rig?.parent);}
 }
}
export function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function layerMatrix(layers,layer){
 const chain=[],seen=new Set();let current=layer;
 while(current){if(seen.has(current.id))throw Error('Rig links cannot form a cycle.');seen.add(current.id);chain.unshift(current);const parent=current.rig?.parent;current=parent==null?undefined:layers.find(l=>l.id===parent);}
 let matrix=[1,0,0,1,0,0];
 for(const l of chain){const r=l.rig||defaultRig(),angle=r.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),stretch=r.stretch??1,sx=r.stretchAxis==='x'?stretch:1/stretch,sy=1/sx,a=c*sx,b=s*sx,d=c*sy,e=-s*sy;matrix=multiply(matrix,[a,b,e,d,r.x+r.pivotX-a*r.pivotX-e*r.pivotY,r.y+r.pivotY-b*r.pivotX-d*r.pivotY]);}
 return matrix;
}
export const transformPoint=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export function localPoint(matrix,p){const [a,b,c,d,x,y]=matrix,det=a*d-b*c;return [(d*(p[0]-x)-c*(p[1]-y))/det,(-b*(p[0]-x)+a*(p[1]-y))/det];}
// Solve rotations in the upper joint's parent space; translations and pivots stay fixed.
export function solveLimb(layers,endId,target,bend=1){
 const end=layers.find(l=>l.id===endId),lower=layers.find(l=>l.id===end?.rig?.parent),upper=layers.find(l=>l.id===lower?.rig?.parent);
 if(!end?.rig||!lower?.rig||!upper?.rig)throw Error('Select a hand or foot linked to a lower limb, which is linked to an upper limb. Set all three pivots first.');
 if([end,lower,upper].some(l=>l.locked))throw Error('Unlock all three limb parts first.');
 if(!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite))throw Error('Invalid limb target.');
 if([upper,lower].some(l=>Math.abs((l.rig.stretch??1)-1)>1e-8))return solveScaledLimb(layers,endId,target,bend);
 const a=upper.rig,b=lower.rig,c=end.rig,parent=layers.find(l=>l.id===a.parent),p=localPoint(parent?layerMatrix(layers,parent):[1,0,0,1,0,0],target);
 const v=[b.pivotX+b.x-a.pivotX,b.pivotY+b.y-a.pivotY],w=[c.pivotX+c.x-b.pivotX,c.pivotY+c.y-b.pivotY];
 const l1=Math.hypot(...v),l2=Math.hypot(...w),dx=p[0]-a.pivotX-a.x,dy=p[1]-a.pivotY-a.y,d=Math.hypot(dx,dy);
 if(l1<1||l2<1)throw Error('Separate the shoulder, elbow and hand pivots (or hip, knee and foot) before positioning the limb.');
 const beta=(bend<0?-1:1)*Math.acos(Math.max(-1,Math.min(1,(d*d-l1*l1-l2*l2)/(2*l1*l2))));
 const wrap=r=>((r*180/Math.PI+180)%360+360)%360-180;
 return {poses:[{id:upper.id,angle:wrap(Math.atan2(dy,dx)-Math.atan2(l2*Math.sin(beta),l1+l2*Math.cos(beta))-Math.atan2(v[1],v[0]))},{id:lower.id,angle:wrap(beta+Math.atan2(v[1],v[0])-Math.atan2(w[1],w[0]))}],clamped:d>l1+l2+0.001||d<Math.abs(l1-l2)-0.001};
}
function solveScaledLimb(layers,endId,target,bend){
 const copy=structuredClone(layers),end=copy.find(l=>l.id===endId),lower=copy.find(l=>l.id===end.rig.parent),upper=copy.find(l=>l.id===lower.rig.parent),wrap=a=>((a+180)%360+360)%360-180;
 const point=()=>transformPoint(layerMatrix(copy,end),[end.rig.pivotX,end.rig.pivotY]);
 // A slight bend gives a straight chain a direction for inward targets.
 lower.rig.angle=wrap(lower.rig.angle+(bend<0?-1:1)*.5);
 for(let n=0;n<160;n++){
  for(const joint of [lower,upper]){const r=joint.rig,parent=copy.find(l=>l.id===r.parent),m=parent?layerMatrix(copy,parent):[1,0,0,1,0,0],p=localPoint(m,point()),q=localPoint(m,target),origin=[r.pivotX+r.x,r.pivotY+r.y];if(Math.hypot(p[0]-origin[0],p[1]-origin[1])<1e-8)continue;const delta=Math.atan2(q[1]-origin[1],q[0]-origin[0])-Math.atan2(p[1]-origin[1],p[0]-origin[0]);r.angle=wrap(r.angle+delta*180/Math.PI);}
  const p=point();if(Math.hypot(p[0]-target[0],p[1]-target[1])<.01)break;
 }
 const p=point();return {poses:[upper,lower].map(l=>({id:l.id,angle:l.rig.angle})),clamped:Math.hypot(p[0]-target[0],p[1]-target[1])>.5};
}
export function createRigControls({board,selected,commit,button,notify,view,repaint,setTool}){
 const panel=document.createElement('details');panel.className='settings rig-controls';panel.innerHTML='<summary>Rig & pose selected layer</summary><p class="hint">Draw body parts on separate layers in their resting positions. Set each joint pivot, then choose a parent: hand → arm → torso. Parent movement carries its children. Parenting or changing pivots may move an already posed part. Visibility and opacity stay per layer. Save the drawing as a shot image to use this pose.</p>';
 const controls=document.createElement('div');controls.className='drawing-toolbar';panel.append(controls);
 function label(text,input){const l=document.createElement('label');l.className='field';l.textContent=text;input.setAttribute('aria-label',text);l.append(input);controls.append(l);return input;}
 const parent=label('Parent layer',document.createElement('select'));
 function edit(fn){if(selected().locked){notify('Unlock the selected layer before changing its rig.');return;}const candidate=structuredClone(board()),layer=candidate.layers.find(l=>l.id===selected().id);layer.rig??=defaultRig();fn(layer.rig);try{validateRigs(candidate.layers);}catch(e){notify(e.message);update();return;}commit(()=>selected().rig=layer.rig);}
 parent.onchange=()=>edit(r=>r.parent=parent.value||null);
 const fields=[];
 for(const [key,text,min,max] of [['pivotX','Pivot X',0,960],['pivotY','Pivot Y',0,540],['x','Move X',-1920,1920],['y','Move Y',-1080,1080],['angle','Rotation (degrees)',-360,360]]){
  const input=label(text,document.createElement('input'));input.type='number';input.min=min;input.max=max;input.step=1;input.onchange=()=>edit(r=>r[key]=Number(input.value));fields.push([key,input]);
 }
 const actions=document.createElement('div');actions.className='actions';actions.append(button('Pick joint on canvas',()=>{if(selected().locked){notify('Unlock the selected layer first.');return;}setTool('pivot');notify('Click the selected part’s joint on the canvas.');}),button('Reset selected pose',()=>edit(r=>{r.x=0;r.y=0;r.angle=0;})));panel.append(actions);
 const stretchAxis=label('Squash / stretch axis',document.createElement('select'));stretchAxis.add(new Option('Vertical','y'));stretchAxis.add(new Option('Horizontal','x'));stretchAxis.onchange=()=>edit(r=>r.stretchAxis=stretchAxis.value);
 const stretch=label('Area-preserving stretch',document.createElement('input'));stretch.type='number';stretch.min=.25;stretch.max=4;stretch.step=.05;stretch.onchange=()=>edit(r=>r.stretch=Number(stretch.value));
 const stretchNote=document.createElement('p');stretchNote.textContent='1 is neutral. A value below 1 squashes the selected axis and widens the other axis; above 1 stretches it. Area is preserved around the joint pivot. Child parts inherit the transform. Save pose keys or use the independent stretch channel to animate.';panel.append(stretchNote);
 actions.append(button('Reset selected stretch',()=>edit(r=>r.stretch=1)));
 function update(){const active=selected(),rig=active.rig||defaultRig();parent.replaceChildren(new Option('None · root',''));for(const l of board().layers){if(l.id===active.id)continue;let p=l,descendant=false;const seen=new Set();while(p&&!seen.has(p.id)){seen.add(p.id);if(p.id===active.id){descendant=true;break;}p=board().layers.find(x=>x.id===p.rig?.parent);}if(!descendant)parent.add(new Option(l.name,l.id));}parent.value=rig.parent||'';parent.disabled=active.locked;for(const [key,input] of fields){input.value=rig[key];input.disabled=active.locked;}}
 const bend=label('Elbow / knee bend',document.createElement('select'));bend.add(new Option('Direction A','1'));bend.add(new Option('Direction B','-1'));
 actions.append(button('Position hand / foot',()=>{setTool('ik');notify('Select the hand or foot layer, then click its destination on the drawing. Its two parent joints will bend.');}));
 const baseUpdate=update;update=()=>{baseUpdate();const r=selected().rig||defaultRig();stretch.value=r.stretch??1;stretchAxis.value=r.stretchAxis||'y';stretch.disabled=stretchAxis.disabled=selected().locked;};
 panel.open=!!view.rigOpen;panel.ontoggle=()=>{view.rigOpen=panel.open;repaint();};
 function position(target){try{const result=solveLimb(board().layers,selected().id,target,Number(bend.value));commit(()=>{for(const pose of result.poses)board().layers.find(l=>l.id===pose.id).rig.angle=pose.angle;});notify(result.clamped?'Target was not reached. Check pivots and stretch, or move the target closer.':'Limb positioned. Save this pose as a keyframe to animate it.');}catch(e){notify(e.message);}}
 return {panel,update,position,pick(point){edit(r=>{r.pivotX=point[0];r.pivotY=point[1];});},drawJoint(canvas){if(!panel.open)return;const layer=selected(),rig=layer.rig||defaultRig(),p=transformPoint(layerMatrix(board().layers,layer),[rig.pivotX,rig.pivotY]),ctx=canvas.getContext('2d');ctx.save();ctx.strokeStyle='#00a5b5';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p[0],p[1],9,0,Math.PI*2);ctx.moveTo(p[0]-15,p[1]);ctx.lineTo(p[0]+15,p[1]);ctx.moveTo(p[0],p[1]-15);ctx.lineTo(p[0],p[1]+15);ctx.stroke();ctx.restore();}};
}
