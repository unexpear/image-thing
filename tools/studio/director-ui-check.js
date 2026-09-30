async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 await page.waitForSelector('#add-shot');
 const director=await page.evaluate(async()=>{const {newProject,validateProject,duration}=await import('/qwen-editor/director-project.js');const p=newProject();p.scenes[0].shots=Array.from({length:24},()=>({id:crypto.randomUUID(),seconds:600}));validateProject(p);let rejected=false;p.scenes[0].shots.push({id:crypto.randomUUID(),seconds:1});try{validateProject(p);}catch{rejected=true;}return {limitRejected:rejected,sceneUI:!!document.querySelector('#scene-title'),assemblyUI:!!document.querySelector('#render'),assetUI:!!document.querySelector('#add-asset')};});
 await page.goto('http://127.0.0.1:8188/qwen-editor/mesh.html');await page.waitForSelector('#art-preset');
 const art=await page.evaluate(async()=>{const {artOptions}=await import('/qwen-editor/mesh-art.js');const {buildGraph}=await import('/qwen-editor/mesh.js');const select=document.getElementById('art-preset');select.value='anime';select.dispatchEvent(new Event('change'));const o=artOptions(),g=buildGraph({front:'studio-3d-test.png'},{detail:128,faces:10000,steps:20,seed:1,...o});document.getElementById('art-spin').click();return {surface:g['26'].inputs.surface,textureLevels:g['26'].inputs.texture_levels,crease:g['18'].inputs.crease_angle,spin:document.getElementById('mesh-viewer').hasAttribute('auto-rotate'),advancedClosed:!document.getElementById('art-surface').closest('details').open};});
 await page.evaluate(()=>sessionStorage.setItem('studio-director-brief','Synthetic director handoff test'));
 await page.goto('http://127.0.0.1:8188/qwen-editor.html?director=1');await page.waitForFunction(()=>document.getElementById('prompt')?.value==='Synthetic director handoff test');
 if(errors.length)throw Error(errors.join(';'));
 return {director,art,handoff:true,errors};
}
