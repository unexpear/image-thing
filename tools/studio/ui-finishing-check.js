async page => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8188/qwen-editor.html');
  await page.waitForSelector('#edit-mask',{state:'attached'});
  const imageResult=await page.evaluate(async()=>{
    const controls=await import('/qwen-editor/image-controls.js');
    await controls.setMaskSource({name:'studio-3d-test.png',type:'input'});
    await controls.restoreReferences({refs:[{name:'studio-3d-test.png'},{name:'studio-3d-test.png'}]});
    const canvas=document.getElementById('edit-mask');canvas.closest('details').open=true;
    return {collapsedInitially:!document.querySelector('#editor details:not(:first-of-type)')?.open,canvasReady:canvas.width>0};
  });
  await page.locator('#edit-mask').scrollIntoViewIfNeeded();
  const bounds=await page.locator('#edit-mask').boundingBox();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height/2);await page.mouse.up();
  const imageGraph=await page.evaluate(async()=>{
    const {applyImageControls,restoreReferences}=await import('/qwen-editor/image-controls.js');
    const graph=await (await fetch('/qwen-editor/quality.api.json')).json();
    graph['4'].inputs.image='studio-3d-test.png';
    const extra=await applyImageControls(graph);
    await restoreReferences(extra);
    return {graph,extra,painted:document.getElementById('mask-enabled').checked};
  });
  await page.goto('http://127.0.0.1:8188/qwen-editor/mesh.html');
  await page.waitForSelector('#finish-uv',{state:'attached'});
  const meshResult=await page.evaluate(async()=>{
    const {buildGraph}=await import('/qwen-editor/mesh.js');
    const graph=buildGraph({front:'studio-3d-test.png'},{detail:128,faces:5000,steps:10,seed:1,uv:true,texture:'studio-3d-test.png',collision:true});
    return {graph,collapsed:!document.getElementById('finish-uv').closest('details').open};
  });
  const glbChecks=await page.evaluate(async()=>{
    const {validateGlb}=await import('/qwen-editor/mesh-finishing.js');
    const doc=JSON.stringify({asset:{version:'2.0'},meshes:[{primitives:[]}],buffers:[{byteLength:4}]});
    const json=new TextEncoder().encode(doc.padEnd(Math.ceil(doc.length/4)*4,' '));
    const data=new ArrayBuffer(32+json.length);const view=new DataView(data);
    for(const [offset,value] of [[0,0x46546c67],[4,2],[8,data.byteLength],[12,json.length],[16,0x4e4f534a],[20+json.length,4],[24+json.length,0x004e4942]])view.setUint32(offset,value,true);
    new Uint8Array(data,20,json.length).set(json);const valid=validateGlb(data).includes('passed');
    view.setUint32(8,1,true);let rejected=false;try{validateGlb(data);}catch{rejected=true;}
    return {validContainer:valid,rejectsTruncated:rejected};
  });
  const validation=await page.evaluate(async({imageGraph,meshResult})=>{
    const info=await (await fetch('/object_info')).json();const issues=[];
    for(const [label,graph] of [['image',imageGraph.graph],['mesh',meshResult.graph]]){
      for(const [id,node] of Object.entries(graph)){
        const schema=info[node.class_type];if(!schema){issues.push(`${label} ${id}: missing ${node.class_type}`);continue;}
        for(const input of Object.keys(schema.input.required||{}))if(!(input in node.inputs))issues.push(`${label} ${id}: missing ${input}`);
        for(const [name,value] of Object.entries(node.inputs)){
          const expected=schema.input.required?.[name]||schema.input.optional?.[name];
          if(!expected){issues.push(`${label} ${id}: unknown ${name}`);continue;}
          if(Array.isArray(value)&&value.length===2&&typeof value[1]==='number'){
            const source=graph[value[0]];const output=source&&info[source.class_type]?.output[value[1]];
            if(!String(expected[0]).split(',').includes(output))issues.push(`${label} ${id}.${name}: ${output} != ${expected[0]}`);
          }else if(node.class_type!=='LoadImage'&&Array.isArray(expected[0])&&!expected[0].includes(value))issues.push(`${label} ${id}.${name}: unsupported value`);
        }
      }
    }
    return issues;
  },{imageGraph,meshResult});
  return {image:imageResult,referenceCount:imageGraph.extra.refs.length,mask:imageGraph.extra.masked,maskRestored:imageGraph.painted,meshFinishingCollapsed:meshResult.collapsed,graphIssues:validation,glbChecks,errors};
}

