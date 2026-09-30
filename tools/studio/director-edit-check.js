async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');await page.waitForSelector('#add-shot');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const broken='synthetic-invalid-project-'+Date.now();
 try{
  await page.locator('#new').click();await page.locator('#title').fill('Synthetic editing test');
  // Inspect persistence without blurring the active field.
  const savedWhileFocused=await page.evaluate(()=>document.activeElement.id==='title'&&JSON.parse(localStorage.getItem('studio-director-v1')).some(p=>p.title==='Synthetic editing test'));
  await page.locator('#add-shot').click();
  await page.getByLabel('Action / storyboard brief',{exact:true}).fill('A tiny robot waves.');
  const focused=await page.getByLabel('Action / storyboard brief',{exact:true}).evaluate(e=>e===document.activeElement);
  await page.getByRole('button',{name:'Duplicate',exact:true}).click();
  const duplicated=await page.locator('#shots article').count()===2;
  await page.locator('#director-undo').click();const undo=await page.locator('#shots article').count()===1;
  await page.locator('#director-redo').click();const redo=await page.locator('#shots article').count()===2;
  await page.locator('#duplicate-scene').click();const scenes=await page.locator('#scenes button').count()===2;
  await page.reload();await page.waitForSelector('#scene-title');
  const restored=await page.locator('#title').inputValue()==='Synthetic editing test'&&(await page.locator('#scene-title').inputValue()).endsWith('(copy)');
  await page.locator('#remove-scene').click();const removed=await page.locator('#scenes button').count()===1;
  await page.locator('#director-undo').click();const sceneUndo=await page.locator('#scenes button').count()===2;
  await page.evaluate(()=>{const original=window.fetch;window.fetch=(url,...args)=>url==='/upload/image'?new Promise(resolve=>window.finishTestUpload=()=>resolve(new Response(JSON.stringify({name:'synthetic-only.png',subfolder:'studio-director-test',type:'input'}),{status:200}))):original(url,...args);});
  await page.getByLabel('Storyboard image or clip',{exact:true}).first().setInputFiles('D:/dev/image thing/ComfyUI_windows_portable/ComfyUI/input/studio-director-test/red.png');
  await page.waitForFunction(()=>!!window.finishTestUpload);
  await page.locator('#new').click();await page.evaluate(()=>window.finishTestUpload());
  await page.waitForFunction(()=>document.getElementById('notice').textContent.includes('original shot or project changed'));
  const uploadOwnerIsolation=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).filter(p=>p.title==='Synthetic editing test'||p.title==='Untitled cartoon').every(p=>p.scenes.every(s=>s.shots.every(x=>x.media?.name!=='synthetic-only.png'))));
  await page.evaluate(value=>localStorage.setItem('studio-director-v1',value),broken);await page.reload();await page.waitForSelector('#new');
  const recoveryPreserved=await page.evaluate(value=>Object.keys(localStorage).some(k=>k.startsWith('studio-director-v1-recovery-')&&localStorage.getItem(k)===value),broken);
  const recoveryDownload=await page.getByRole('button',{name:'Download saved-data recovery',exact:true}).count()===1;
  const result={savedWhileFocused,focused,duplicated,undo,redo,scenes,restored,removed,sceneUndo,uploadOwnerIsolation,recoveryPreserved,recoveryDownload,errors};
  if(Object.entries(result).some(([k,v])=>k!=='errors'&&!v)||errors.length)throw Error(JSON.stringify(result));return result;
 }finally{
  await page.evaluate(value=>{for(const k of Object.keys(localStorage))if(k.startsWith('studio-director-v1-recovery-')&&localStorage.getItem(k)===value)localStorage.removeItem(k);},broken);
  await page.evaluate(backup=>{for(const [key,value] of [['studio-director-v1',backup.data],['studio-director-v1-selection',backup.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);
  await page.reload();
 }
}
