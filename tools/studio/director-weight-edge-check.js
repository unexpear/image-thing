async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const T=await import('three'),{paintSkinWeights,inspectStaticMesh,bindSkeleton}=await import('/qwen-editor/director-skeleton-engine.js');
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0],3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,1,2,3],4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([.4,.3,.2,.1],4));
  const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());mesh.skeleton=new T.Skeleton(Array.from({length:5},()=>new T.Bone()));mesh.updateMatrixWorld();const p=new T.Vector3(),before=Array.from(geometry.attributes.skinWeight.array);
  const removed=paintSkinWeights(mesh,p,4,1,.1,'remove'),unchanged=before.every((v,i)=>v===geometry.attributes.skinWeight.array[i]);
  paintSkinWeights(mesh,p,4,1,.05,'add');const index=geometry.attributes.skinIndex.array,weight=geometry.attributes.skinWeight.array,added=weight[index.indexOf(4)]>0,normalized=Math.abs([...weight].reduce((a,b)=>a+b,0)-1)<1e-6;
  let empty=false,mirrored=false;try{inspectStaticMesh(new T.Group());}catch{empty=true;}const staticMesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());staticMesh.scale.x=-1;try{inspectStaticMesh(staticMesh);}catch{mirrored=true;}staticMesh.scale.x=1;const bound=await bindSkeleton(staticMesh,[{name:'Root',parent:-1,position:[0,0,0]}]);let allBound=true;bound.traverse(o=>{if(o.isSkinnedMesh)for(let i=0;i<o.geometry.attributes.skinWeight.count;i++)allBound&&=o.geometry.attributes.skinWeight.getX(i)===1;});
  return {removeMissingPreservesWeights:removed===0&&unchanged,lowStrengthAddsNewJoint:added,normalized,emptyRejected:empty,mirroredRejected:mirrored,ordinaryBinding:allBound};
 });
}
