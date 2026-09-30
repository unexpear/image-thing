async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const {starterCharacter,jointsOf,exportRigGLB}=await import('/qwen-editor/director-3d-engine.js'),root=starterCharacter(),bones=jointsOf(root),rest=bones.map(b=>b.quaternion.clone()),pose=bones.map(()=>[0,0,0]),end=structuredClone(pose);end[3][2]=60;
  const rig={version:1,model:null,names:bones.map(b=>b.name),pose,root:[0,0,0],keys:[{frame:0,easing:'linear',pose,root:[0,0,0]},{frame:86399,easing:'linear',pose:end,root:[2,0,0]}]},start=performance.now();
  const data=await exportRigGLB(root,bones,rest,rig,3600),view=new DataView(data),json=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,view.getUint32(12,true))));
  const samplers=json.animations[0].samplers,times=samplers.map(s=>json.accessors[s.input]);
  const form=new FormData();form.append('image',new File([data],'one-hour-rig-synthetic.glb',{type:'model/gltf-binary'}));form.append('type','input');form.append('subfolder','studio-director-test');const response=await fetch('/upload/image',{method:'POST',body:form});
  return {duration3600:times.every(a=>a.max[0]===3600),samples86401:times.every(a=>a.count===86401),skeleton:json.skins[0].joints.length===15,rootAndRotation:json.animations[0].channels.some(c=>c.target.path==='translation')&&json.animations[0].channels.some(c=>c.target.path==='rotation'),uploaded:response.ok,bytes:data.byteLength,elapsedSeconds:(performance.now()-start)/1000};
 });
}
