async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const T=await import('three'),{starterCharacter,jointsOf,applyPose,applyChannels,faceControls,exportRigGLB}=await import('/qwen-editor/director-3d-engine.js'),{solveRigIK}=await import('/qwen-editor/director-ik3d.js'),{sampleRig3D,sampleChannel,validateRig3D}=await import('/qwen-editor/director-3d-state.js');
  const root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),rig={version:1,model:null,names:bones.map(b=>b.name),pose:bones.map(()=>[0,0,0]),keys:[]};
  const reach=solveRigIK(root,bones,rest,rig,5,[.55,1.05,.3]);applyPose(bones,rest,rig.pose);const straight=solveRigIK(root,bones,rest,rig,5,[.36,.95,0]);
  applyPose(bones,rest,rig.pose);rig.limits=rig.names.map(()=>null);rig.limits[3]=rig.limits[4]=[[0,0,0],[0,0,0]];const locked=solveRigIK(root,bones,rest,rig,5,[.55,1.05,.3]);delete rig.limits;
  let mesh;root.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});const attr=mesh.geometry.attributes.position.clone();attr.name='Smile';for(let i=0;i<attr.count;i++)if(attr.getY(i)>1.7)attr.setX(i,attr.getX(i)+.2);mesh.geometry.morphAttributes.position=[attr];mesh.updateMorphTargets();const faces=faceControls(root),baseRoot=bones[0].position.clone();rig.face=[0];rig.root=[0,0,0];const p0=structuredClone(rig.pose),p1=structuredClone(p0);p1[3][2]=60;rig.keys=[{frame:0,easing:'linear',pose:p0,root:[0,0,0],face:[0]},{frame:24,easing:'linear',pose:p1,root:[1,0,0],face:[1]}];validateRig3D(rig);
  applyChannels(bones,baseRoot,faces,rig,12);const channels=Math.abs(bones[0].position.x-.5)<1e-8&&mesh.morphTargetInfluences[0]===.5;rig.loop=true;const loop=sampleRig3D(rig,24+12)[3][2]===30&&sampleChannel(rig,86400-12,'root',[0,0,0])[0]===.5;rig.loop=false;
  const data=await exportRigGLB(root,bones,rest,rig,2,baseRoot,faces),view=new DataView(data),json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,view.getUint32(12,true))));
  const tracks=json.animations[0].channels.map(c=>c.target.path);
  const body=new FormData();body.append('image',new File([data],'advanced-rig-synthetic.glb',{type:'model/gltf-binary'}));body.append('type','input');body.append('subfolder','studio-director-test');const response=await fetch('/upload/image',{method:'POST',body});
  return {ik:reach.distance<.01,straightIK:straight.distance<.01,limits:locked.pose[3].every(v=>v===0)&&locked.pose[4].every(v=>v===0),rootAndFace:channels,loop,exportRotation:tracks.includes('rotation'),exportRoot:tracks.includes('translation'),exportFace:tracks.includes('weights'),uploaded:response.ok,distances:[reach.distance,straight.distance]};
 });
}
