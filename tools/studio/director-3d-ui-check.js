async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')})),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(async()=>{const {newProject}=await import('/qwen-editor/director-project.js');const p=newProject();p.scenes[0].shots=[{id:'3d-test',seconds:2,title:'Synthetic 3D motion'}];localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();const collapsed=await page.locator('.rig3d-controls').evaluate(e=>!e.open);await page.locator('.rig3d-controls>summary').click();await page.waitForSelector('[aria-label="3D character viewport"]');await page.waitForFunction(()=>document.querySelector('[aria-label="3D joint"]').options.length===15);
  await page.getByRole('button',{name:'Save 3D keyframe',exact:true}).click();
  await page.getByLabel('3D joint',{exact:true}).selectOption({label:'Left shoulder'});await page.getByLabel('Joint rotation Z',{exact:true}).fill('100');await page.getByLabel('Joint rotation Z',{exact:true}).press('Tab');
  await page.getByLabel('3D animation frame',{exact:true}).fill('47');await page.getByLabel('3D animation frame',{exact:true}).press('Tab');await page.getByRole('button',{name:'Save 3D keyframe',exact:true}).click();
  const saved=await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('studio-director-v1'))[0].scenes[0].shots[0].rig3d;return r.keys.length===2&&r.keys[1].pose[3][2]===100;});
  await page.getByLabel('3D animation frame',{exact:true}).fill('23');await page.getByLabel('3D animation frame',{exact:true}).press('Tab');await page.getByRole('button',{name:'Use 3D preview pose',exact:true}).click();const interpolation=Number(await page.getByLabel('Joint rotation Z',{exact:true}).inputValue());
  await page.getByRole('button',{name:'Save camera view',exact:true}).click();await page.getByRole('button',{name:'Play 3D poses',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="3D animation frame"]').value)>25);await page.getByRole('button',{name:'Stop 3D preview',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download animated GLB',exact:true}).click();const download=await downloadPromise;await download.saveAs('D:/dev/image thing/output/playwright/director-starter-animated.glb');
  await page.getByRole('button',{name:'Save 3D animation as shot clip',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('3D animation saved as the shot clip'));
  await page.waitForFunction(()=>document.querySelector('[aria-label="3D joint"]')?.options.length===15);
  const clip=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1'))[0].scenes[0].shots[0].media);
  await page.getByLabel('Import rigged GLB',{exact:true}).setInputFiles('D:/dev/image thing/output/playwright/director-starter-animated.glb');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Rig imported.'));
  const imported=await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('studio-director-v1'))[0].scenes[0].shots[0].rig3d;return r.model.name.endsWith('.glb')&&r.names.length===15;});
  await page.reload();await page.locator('.rig3d-controls>summary').click();await page.waitForFunction(()=>document.querySelector('[aria-label="3D joint"]')?.options.length===15);
  const reload=true;await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);await page.locator('.rig3d-viewport').first().screenshot({path:'D:/dev/image thing/output/playwright/director-3d.png'});
  return {collapsed,saved,interpolation:interpolation>40&&interpolation<60,imported,reload,mobile,clip,errors};
 }catch(e){return {error:e.message,notice:await page.locator('#notice').textContent(),panel:await page.locator('.rig3d-controls').textContent(),errors};}
 finally{await page.evaluate(b=>{for(const [k,v] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]])v===null?localStorage.removeItem(k):localStorage.setItem(k,v);},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
