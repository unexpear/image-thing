import * as THREE from 'three';
export const EYE_STYLES=['round','oval','button','almond'],EAR_STYLES=['round','pointed','wide','cup'],MOUTH_STYLES=['line','closed','smile','open','wide','round','bite','teeth','pucker','frown'],BROW_STYLES=['straight','raised','angled','thick'];
const hex=value=>/^#[0-9a-f]{6}$/i.test(value);
const num=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const placement=value=>value&&num(value.scale,.2,4)&&num(value.spread,0,2)&&num(value.height,-1,1)&&num(value.depth,-1,1);
const look=value=>value===undefined||(Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000));
function checkSet(set,styles,kind){
 if(!set||Array.isArray(set)||!styles.includes(set.style)||!hex(set.color)||!placement(set)||(set.linked!==undefined&&typeof set.linked!=='boolean')||!look(set.look))throw Error('Invalid '+kind+' set.');
 for(const side of ['left','right'])if(set[side]!==undefined&&(!placement(set[side])||!look(set[side].look)))throw Error('Invalid '+kind+' side.');
}
const named=value=>typeof value==='string'&&value.trim()&&value.trim().length<=40;
export function validateFeatures(rig){
 if(rig.features===undefined&&rig.featureKeys===undefined&&rig.featureExpressions===undefined)return;
 const features=rig.features;
 if(features!==undefined){
  if(!features||Array.isArray(features)||typeof features!=='object'||(features.snap!==undefined&&typeof features.snap!=='boolean'))throw Error('Invalid eye and ear set.');
  if(features.eyes!==undefined)checkSet(features.eyes,EYE_STYLES,'eye');
  if(features.ears!==undefined)checkSet(features.ears,EAR_STYLES,'ear');
  if(features.mouth!==undefined)checkSet(features.mouth,MOUTH_STYLES,'mouth');
  if(features.brows!==undefined)checkSet(features.brows,BROW_STYLES,'brow');
 }
 const expressions=rig.featureExpressions||[];
 if(rig.featureExpressions!==undefined&&(!Array.isArray(expressions)||expressions.length>32))throw Error('Use at most 32 face expressions.');
 const names=new Set();
 for(const expression of expressions){if(!expression||!named(expression.name)||names.has(expression.name.trim().toLowerCase()))throw Error('Each face expression needs its own name.');names.add(expression.name.trim().toLowerCase());if(expression.eyes)checkSet(expression.eyes,EYE_STYLES,'eye');if(expression.ears)checkSet(expression.ears,EAR_STYLES,'ear');if(expression.mouth)checkSet(expression.mouth,MOUTH_STYLES,'mouth');if(expression.brows)checkSet(expression.brows,BROW_STYLES,'brow');}
 const keys=rig.featureKeys||[];
 if(rig.featureKeys!==undefined&&(!Array.isArray(keys)||keys.length>64))throw Error('Use at most 64 expression keys.');
 const frames=new Set();
 for(const key of keys){if(!key||!Number.isInteger(key.frame)||key.frame<0||key.frame>=86400||frames.has(key.frame))throw Error('Expression keys need unique frames.');frames.add(key.frame);if(key.eyes)checkSet(key.eyes,EYE_STYLES,'eye');if(key.ears)checkSet(key.ears,EAR_STYLES,'ear');if(key.mouth)checkSet(key.mouth,MOUTH_STYLES,'mouth');if(key.brows)checkSet(key.brows,BROW_STYLES,'brow');}
}
export function sidePlacement(set,side){
 const shared={scale:set.scale,spread:set.spread,height:set.height,depth:set.depth};
 return set.linked===false&&set[side]?{...shared,...set[side]}:shared;
}
export function headBone(bones){return bones.find(bone=>/head$/i.test(bone.name||'')&&!/phone/i.test(bone.name||''))||null;}
const eyeName=bone=>/eye/i.test(bone?.name||'')&&!/brow|lid|lash/i.test(bone?.name||'');
function disposeNode(node){node.traverse(child=>{child.geometry?.dispose();const materials=[].concat(child.material||[]);for(const material of materials)material.dispose?.();});node.removeFromParent();}
export function removeFeatureMeshes(root){const nodes=[];root?.traverse(child=>{if(child.userData.studioFeature)nodes.push(child);});for(const node of nodes)disposeNode(node);}
function eyeGroup(style,color){
 const group=new THREE.Group(),whiteMaterial=new THREE.MeshStandardMaterial({color:'#f7f1e8',roughness:.35}),pupilMaterial=new THREE.MeshStandardMaterial({color,roughness:.25});
 const white=style==='button'?new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.012,20),whiteMaterial):new THREE.Mesh(new THREE.SphereGeometry(.045,18,12),whiteMaterial);
 const pupil=new THREE.Mesh(new THREE.SphereGeometry(.016,12,10),pupilMaterial);
 if(style==='button'){white.rotation.x=Math.PI/2;pupil.position.z=.012;}else{pupil.position.z=.032;if(style==='oval')white.scale.set(1,1.35,.85);if(style==='almond')white.scale.set(1.35,.62,.8);}
 group.add(white,pupil);return group;
}
function earGroup(style,color){
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,roughness:.7});
 const mesh=style==='pointed'?new THREE.Mesh(new THREE.ConeGeometry(.045,.16,16),material):new THREE.Mesh(new THREE.SphereGeometry(style==='wide'?0.07:0.055,16,12),material);
 if(style==='wide')mesh.scale.set(1.5,.72,.38);
 if(style==='cup')mesh.scale.set(.82,1.08,.42);
 group.add(mesh);return group;
}
function mouthGroup(style,color){
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,roughness:.55});
 const enamel=()=>new THREE.MeshStandardMaterial({color:'#f2efe6',roughness:.45});
 let mesh;
 if(style==='open'){mesh=new THREE.Mesh(new THREE.SphereGeometry(.05,16,12),material);mesh.scale.set(1.15,.72,.55);}
 else if(style==='wide'){mesh=new THREE.Mesh(new THREE.SphereGeometry(.055,16,12),material);mesh.scale.set(1.55,.95,.5);}
 else if(style==='round'){mesh=new THREE.Mesh(new THREE.SphereGeometry(.042,16,12),material);mesh.scale.set(1,.95,.95);}
 else if(style==='pucker'){mesh=new THREE.Mesh(new THREE.SphereGeometry(.032,12,10),material);mesh.scale.set(.85,.85,1.35);mesh.position.z=.02;}
 else if(style==='closed'){mesh=new THREE.Mesh(new THREE.BoxGeometry(.12,.022,.02),material);}
 else if(style==='line'){mesh=new THREE.Mesh(new THREE.BoxGeometry(.16,.012,.02),material);}
 else if(style==='bite'){
  mesh=new THREE.Mesh(new THREE.BoxGeometry(.12,.014,.02),material);
  const teeth=new THREE.Mesh(new THREE.BoxGeometry(.1,.012,.015),enamel());
  teeth.position.set(0,.012,.01);group.add(teeth);
 }
 else if(style==='teeth'){
  mesh=new THREE.Mesh(new THREE.SphereGeometry(.05,16,12),material);mesh.scale.set(1.25,.55,.5);
  const bar=new THREE.Mesh(new THREE.BoxGeometry(.1,.018,.012),enamel());
  bar.position.set(0,.008,.03);group.add(bar);
 }
 else if(style==='smile'){mesh=new THREE.Mesh(new THREE.TorusGeometry(.055,.012,8,18,Math.PI),material);mesh.rotation.z=Math.PI;}
 else if(style==='frown'){mesh=new THREE.Mesh(new THREE.TorusGeometry(.055,.012,8,18,Math.PI),material);mesh.rotation.x=Math.PI;}
 else mesh=new THREE.Mesh(new THREE.BoxGeometry(.16,.012,.02),material);
 group.add(mesh);return group;
}
function browGroup(style,color,side){
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,roughness:.6});
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(style==='thick'?0.09:0.07,style==='thick'?0.028:0.012,.016),material);
 if(style==='raised')mesh.rotation.z=(side==='left'?-1:1)*.25;
 if(style==='angled')mesh.rotation.z=(side==='left'?1:-1)*.45;
 group.add(mesh);return group;
}
function place(group,parent,side,values,boneOffset){
 parent.add(group);group.userData.featureSide=side;
 const x=side==='center'?0:side==='left'?values.spread:-values.spread;
 group.position.set(boneOffset?0:x,values.height,values.depth);
 group.scale.setScalar(values.scale);
}
const surfaceRay=new THREE.Raycaster();
function seatOnHead(group,head,root,side,values){
 const origin=head.getWorldPosition(new THREE.Vector3()),facing=new THREE.Vector3(side==='left'?Math.max(values.spread,.02):side==='right'?-Math.max(values.spread,.02):0,values.height,.45).normalize();
 const start=origin.clone().addScaledVector(facing,1.6);
 surfaceRay.set(start,facing.clone().negate());surfaceRay.near=0;surfaceRay.far=3;
 const hit=surfaceRay.intersectObject(root,true).find(item=>item.object?.isMesh&&!item.object.parent?.userData?.studioFeature);
 if(!hit)return false;
 const normal=hit.face?.normal?hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize():facing;
 const point=hit.point.clone().addScaledVector(normal,values.depth);
 head.worldToLocal(point);group.position.copy(point);group.scale.setScalar(values.scale);return true;
}
export function applyFeatureSets(root,bones,rig){
 removeFeatureMeshes(root);const features=rig?.features;if(!features)return;
 const head=headBone(bones);if(!head)return;
 const eyes=bones.filter(eyeName),used=new Set(),snap=features.snap===true;
 if(features.eyes)for(const side of ['left','right']){
  const namedBone=eyes.find(bone=>new RegExp(side,'i').test(bone.name)&&!used.has(bone));
  const parent=snap?head:(namedBone||head);if(namedBone)used.add(namedBone);
  const values=sidePlacement(features.eyes,side),group=eyeGroup(features.eyes.style,features.eyes.color);group.userData.studioFeature='eye';
  place(group,parent,side,values,!snap&&!!namedBone);
  if(snap)seatOnHead(group,head,root,side,values);
 }
 if(features.ears)for(const side of ['left','right']){const values=sidePlacement(features.ears,side),group=earGroup(features.ears.style,features.ears.color);group.userData.studioFeature='ear';place(group,head,side,values,false);if(snap)seatOnHead(group,head,root,side,values);}
 if(features.brows)for(const side of ['left','right']){const values=sidePlacement(features.brows,side),group=browGroup(features.brows.style,features.brows.color,side);group.userData.studioFeature='brow';place(group,head,side,values,false);if(snap)seatOnHead(group,head,root,side,values);}
 if(features.mouth){const values=sidePlacement(features.mouth,'center'),group=mouthGroup(features.mouth.style,features.mouth.color);group.userData.studioFeature='mouth';place(group,head,'center',values,false);group.scale.x*=Math.max(.4,values.spread);if(snap)seatOnHead(group,head,root,'center',values);}
}
const lerp=(a,b,t)=>a+(b-a)*t;
const lerpColor=(a,b,t)=>{const from=new THREE.Color(a),to=new THREE.Color(b);return '#'+from.lerp(to,t).getHexString();};
function lerpSet(a,b,t){
 if(!a)return b;if(!b||t<=0)return a;if(t>=1)return b;
 const set={...a,style:a.style,scale:lerp(a.scale,b.scale,t),spread:lerp(a.spread,b.spread,t),height:lerp(a.height,b.height,t),depth:lerp(a.depth,b.depth,t),color:lerpColor(a.color,b.color,t)};
 if(a.look&&b.look)set.look=a.look.map((value,index)=>lerp(value,b.look[index],t));
 return set;
}
export function sampleFeatures(rig,frame){
 const base=rig?.features;if(!base||frame==null||!rig.featureKeys?.length)return base;
 const keys=[...rig.featureKeys].sort((a,b)=>a.frame-b.frame);
 let before=keys[0],after=keys.at(-1);
 for(const key of keys){if(key.frame<=frame)before=key;if(key.frame>=frame){after=key;break;}}
 const span=after.frame-before.frame,t=span<=0||frame<=before.frame?0:Math.min(1,(frame-before.frame)/span);
 return {...base,eyes:lerpSet(before.eyes||base.eyes,after.eyes||base.eyes,t),ears:lerpSet(before.ears||base.ears,after.ears||base.ears,t),mouth:lerpSet(before.mouth||base.mouth,after.mouth||base.mouth,t),brows:lerpSet(before.brows||base.brows,after.brows||base.brows,t)};
}
export function expressionScriptLines(text){
 const fenced=[...String(text||'').matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(match=>match[1]);
 const source=fenced.length?fenced.join('\n'):String(text||'');
 const lines=source.split(/\n/).map(line=>line.trim()).filter(line=>/^\d+\s+\S+$/.test(line));
 if(!lines.length)throw Error('The draft has no expression lines. Use a frame and a name, such as: 24 notice');
 return lines.join('\n');
}
export function compileFeatureScript(rig,text,lastFrame){
 const lines=String(text||'').split(/\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
 if(!lines.length)throw Error('Write one expression per line, such as: 24 notice');
 if(!rig.features?.eyes)throw Error('Apply an eye set before writing an expression script.');
 const expressions=new Map((rig.featureExpressions||[]).map(expression=>[expression.name.trim().toLowerCase(),expression]));
 const keys=[];
 for(const line of lines){
  const match=line.match(/^(\d+)\s+(.+)$/);
  if(!match)throw Error('Use a frame and an expression name, such as: 24 notice');
  const frame=Number(match[1]),name=match[2].trim();
  if(!Number.isInteger(frame)||frame<0||frame>lastFrame)throw Error('Frame '+frame+' is outside this shot.');
  if(keys.some(key=>key.frame===frame))throw Error('Two expressions land on frame '+frame+'. Nothing was written.');
  if(/^blink$/i.test(name)&&!expressions.has('blink')){
   const shut=Math.min(lastFrame,frame+2),open=Math.min(lastFrame,frame+6);
   const carry=part=>part?structuredClone(part):undefined;
   for(const [at,scale] of [[frame,rig.features.eyes.scale],[shut,Math.max(.2,rig.features.eyes.scale*.3)],[open,rig.features.eyes.scale]]){if(keys.some(key=>key.frame===at))throw Error('The blink overlaps frame '+at+'. Nothing was written.');keys.push({frame:at,eyes:{...structuredClone(rig.features.eyes),scale},ears:carry(rig.features.ears),mouth:carry(rig.features.mouth),brows:carry(rig.features.brows)});}
   continue;
  }
  const expression=expressions.get(name.toLowerCase());
  if(!expression)throw Error('Save an expression named '+name+' first. Nothing was written.');
  const carry=part=>part?structuredClone(part):undefined;
  keys.push({frame,eyes:structuredClone(expression.eyes||rig.features.eyes),ears:carry(expression.ears||rig.features.ears),mouth:carry(expression.mouth||rig.features.mouth),brows:carry(expression.brows||rig.features.brows)});
 }
 const next=structuredClone(rig);next.featureKeys=keys.sort((a,b)=>a.frame-b.frame);return next;
}
export function keyFeatureFrame(rig,frame,lastFrame){
 if(!rig.features?.eyes)throw Error('Set an eye shape first.');
 if(!Number.isInteger(frame)||frame<0||frame>lastFrame)throw Error('That frame is outside this shot.');
 const copy=part=>part?structuredClone(part):undefined;
 const next=structuredClone(rig);
 next.featureKeys=[...(next.featureKeys||[]).filter(key=>key.frame!==frame),{frame,eyes:copy(rig.features.eyes),ears:copy(rig.features.ears),mouth:copy(rig.features.mouth),brows:copy(rig.features.brows)}].sort((a,b)=>a.frame-b.frame);
 validateFeatures(next);return next;
}
export function clearFeatureFrame(rig,frame){
 if(!Number.isInteger(frame)||frame<0)throw Error('Choose an expression key frame.');
 const next=structuredClone(rig);
 if(!(next.featureKeys||[]).some(key=>key.frame===frame))throw Error('No expression key is on that frame.');
 next.featureKeys=next.featureKeys.filter(key=>key.frame!==frame);
 if(!next.featureKeys.length)delete next.featureKeys;
 return next;
}
export function featureControls({host,getRig,edit,notify,getTarget,getLinked,getFrame=()=>0,lastFrame=()=>86399,isBusy=()=>false}){
 const panel=document.createElement('details');panel.className='settings';panel.append(Object.assign(document.createElement('summary'),{textContent:'Face editor · eyes, brows, mouth and ears'}));host.append(panel);
 const note=document.createElement('p');note.textContent='This is the face editor for the cartoon engine. Color, shape, size, distance, height and sink update the character directly and record through the same preview as everything else. Snap seats each part on the head; sink moves it along that surface. Match keeps a pair symmetrical. A shot script writes saved expressions as normal keys you can still edit. It does not run during playback.';panel.append(note);
 function field(name,type,value){const label=document.createElement('label');label.className='field';label.textContent=name;const input=document.createElement(type==='select'?'select':'input');if(type!=='select'){input.type=type;input.value=value;}input.setAttribute('aria-label',name);label.append(input);panel.append(label);return input;}
 function choice(input,values){for(const value of values)input.add(new Option(value,value));}
 const eyeStyle=field('Eye shape','select'),eyeColor=field('Eye color','color','#1c2430');choice(eyeStyle,EYE_STYLES);
 const eyeScale=field('Eye size','number',1),eyeSpread=field('Distance apart','number',.1),eyeHeight=field('Up or down','number',.28),eyeDepth=field('Sink in or out','number',.22);
 const eyeMatchLabel=document.createElement('label');eyeMatchLabel.className='field';eyeMatchLabel.textContent='Match both eyes';const eyeMatch=document.createElement('input');eyeMatch.type='checkbox';eyeMatch.checked=true;eyeMatch.setAttribute('aria-label','Match both eyes');eyeMatchLabel.append(eyeMatch);panel.append(eyeMatchLabel);
 const mouthStyle=field('Mouth shape','select'),mouthColor=field('Mouth color','color','#8d3a3a');choice(mouthStyle,MOUTH_STYLES);
 const mouthScale=field('Mouth size','number',1),mouthWidth=field('Mouth width','number',1),mouthHeight=field('Mouth up or down','number',.1),mouthDepth=field('Mouth sink in or out','number',.22);
 const browStyle=field('Brow shape','select'),browColor=field('Brow color','color','#3a2a24');choice(browStyle,BROW_STYLES);
 const browScale=field('Brow size','number',1),browSpread=field('Brow distance apart','number',.1),browHeight=field('Brow up or down','number',.4),browDepth=field('Brow sink in or out','number',.2);
 const browMatchLabel=document.createElement('label');browMatchLabel.className='field';browMatchLabel.textContent='Match both brows';const browMatch=document.createElement('input');browMatch.type='checkbox';browMatch.checked=true;browMatch.setAttribute('aria-label','Match both brows');browMatchLabel.append(browMatch);panel.append(browMatchLabel);
 const earStyle=field('Ear shape','select'),earColor=field('Ear color','color','#f6c28b');choice(earStyle,EAR_STYLES);
 const earScale=field('Ear size','number',1),earSpread=field('Ear distance apart','number',.28),earHeight=field('Ear up or down','number',.24),earDepth=field('Ear sink in or out','number',0);
 const earMatchLabel=document.createElement('label');earMatchLabel.className='field';earMatchLabel.textContent='Match both ears';const earMatch=document.createElement('input');earMatch.type='checkbox';earMatch.checked=true;earMatch.setAttribute('aria-label','Match both ears');earMatchLabel.append(earMatch);panel.append(earMatchLabel);
 const snapLabel=document.createElement('label');snapLabel.className='field';snapLabel.textContent='Snap parts to the head';const snap=document.createElement('input');snap.type='checkbox';snap.setAttribute('aria-label','Snap parts to the head');snapLabel.append(snap);panel.append(snapLabel);
 const side=field('Side to edit when unmatched','select');for(const [label,value] of [['Left','left'],['Right','right']])side.add(new Option(label,value));
 for(const input of [eyeScale,earScale,mouthScale,browScale]){input.min=.2;input.max=4;input.step=.05;}
 for(const input of [eyeSpread,earSpread,browSpread]){input.min=0;input.max=2;input.step=.01;}
 mouthWidth.min=.2;mouthWidth.max=2;mouthWidth.step=.05;
 for(const input of [eyeHeight,eyeDepth,earHeight,earDepth,mouthHeight,mouthDepth,browHeight,browDepth]){input.min=-1;input.max=1;input.step=.01;}
 const read=input=>Number(input.value);
 function numbers(){return {scale:read(eyeScale),spread:read(eyeSpread),height:read(eyeHeight),depth:read(eyeDepth)};}
 function earNumbers(){return {scale:read(earScale),spread:read(earSpread),height:read(earHeight),depth:read(earDepth)};}
 function mouthNumbers(){return {scale:read(mouthScale),spread:read(mouthWidth),height:read(mouthHeight),depth:read(mouthDepth)};}
 function browNumbers(){return {scale:read(browScale),spread:read(browSpread),height:read(browHeight),depth:read(browDepth)};}
 function commit(){edit(rig=>{const previous=rig.features||{};const eyes={style:eyeStyle.value,color:eyeColor.value,...numbers(),linked:eyeMatch.checked,look:previous.eyes?.look};const ears={style:earStyle.value,color:earColor.value,...earNumbers(),linked:earMatch.checked};const mouth={style:mouthStyle.value,color:mouthColor.value,...mouthNumbers(),linked:true,look:previous.mouth?.look};const brows={style:browStyle.value,color:browColor.value,...browNumbers(),linked:browMatch.checked};if(!eyeMatch.checked){eyes.left=previous.eyes?.left;eyes.right=previous.eyes?.right;eyes[side.value]={...numbers(),look:previous.eyes?.[side.value]?.look};}if(!earMatch.checked){ears.left=previous.ears?.left;ears.right=previous.ears?.right;ears[side.value]=earNumbers();}if(!browMatch.checked){brows.left=previous.brows?.left;brows.right=previous.brows?.right;brows[side.value]=browNumbers();}rig.features={...previous,eyes,ears,mouth,brows,snap:snap.checked};});}
 for(const input of [eyeStyle,eyeColor,eyeScale,eyeSpread,eyeHeight,eyeDepth,eyeMatch,earStyle,earColor,earScale,earSpread,earHeight,earDepth,earMatch,mouthStyle,mouthColor,mouthScale,mouthWidth,mouthHeight,mouthDepth,browStyle,browColor,browScale,browSpread,browHeight,browDepth,browMatch,snap])input.addEventListener('change',()=>{if(isBusy())return;try{commit();}catch(error){notify(error.message);}});
 function button(name,fn){const control=document.createElement('button');control.type='button';control.textContent=name;control.onclick=()=>{if(isBusy())return;try{fn();}catch(error){notify(error.message);}};panel.append(control);}
 button('Aim eye set at the target above',()=>{const target=getTarget();edit(rig=>{if(!rig.features?.eyes)throw Error('Set an eye shape first.');if(getLinked())rig.features.eyes.look=target;else{rig.features.eyes.linked=false;rig.features.eyes[side.value]={...(rig.features.eyes[side.value]||{}),look:target};}});notify(getLinked()?'Both eyes look at that point.':'The '+side.value+' eye looks at that point.');});
 const expressionName=field('Expression name','text','Rest');
 button('Save face expression',()=>edit(rig=>{const name=expressionName.value.trim();if(!rig.features?.eyes||!name)throw Error('Set the eyes and name the expression first.');const copy=part=>part?structuredClone(part):undefined;rig.featureExpressions=(rig.featureExpressions||[]).filter(expression=>expression.name.toLowerCase()!==name.toLowerCase());rig.featureExpressions.push({name,eyes:copy(rig.features.eyes),ears:copy(rig.features.ears),mouth:copy(rig.features.mouth),brows:copy(rig.features.brows)});}));
 const script=document.createElement('textarea');script.rows=5;script.setAttribute('aria-label','Expression script');script.placeholder='0 rest\n24 notice\n36 blink';panel.append(script);
 const scriptNote=document.createElement('p');scriptNote.textContent='One frame and one saved expression per line. blink, if you have not saved that name, dips the eye size and returns. The result is ordinary expression keys. Body animation is left alone. A bad line writes nothing.';panel.append(scriptNote);
 button('Write expression script',()=>edit(rig=>Object.assign(rig,compileFeatureScript(rig,script.value,lastFrame()))));
 const keyFrame=field('Expression key frame','number',getFrame());keyFrame.min=0;keyFrame.step=1;
 button('Key this face at that frame',()=>edit(rig=>Object.assign(rig,keyFeatureFrame(rig,Math.round(Number(keyFrame.value)),lastFrame()))));
 button('Remove expression key at that frame',()=>edit(rig=>Object.assign(rig,clearFeatureFrame(rig,Math.round(Number(keyFrame.value))))));
 const manual=document.createElement('p');manual.textContent='Pick Mouth shape by hand (line, closed, smile, open, wide, round, bite, teeth, pucker, frown) and key the frame. Lip-sync Write Face mouth keys fills the same keys from A-H/X cues. When a skinned GLB has mouthMap morph indices, Face seek/scrub and those keys also drive the mapped morph targets. The expression script writes these same keys too.';panel.append(manual);
 button('Remove eye and ear set',()=>edit(rig=>{delete rig.features;}));
}
