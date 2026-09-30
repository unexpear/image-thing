async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')})),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(async()=>{const {newProject}=await import('/qwen-editor/director-project.js'),{newLayer}=await import('/qwen-editor/director-drawing.js'),{defaultRig}=await import('/qwen-editor/director-rig.js');const p=newProject(),torso=newLayer('Torso'),arm=newLayer('Arm');torso.id='torso';arm.id='arm';torso.rig={...defaultRig(),pivotX:300,pivotY:200};arm.strokes=[{tool:'brush',color:'#ff0000',size:20,points:[[400,200]]}];p.scenes[0].shots=[{id:'test-shot',seconds:3,title:'Synthetic puppet',drawing:{version:1,layers:[torso,arm]}}];localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.locator('.drawing-controls summary').click();await page.waitForSelector('.rig-controls');const collapsed=await page.locator('.rig-controls').evaluate(e=>!e.open);await page.locator('.rig-controls summary').click();
  await page.getByLabel('Parent layer',{exact:true}).selectOption('torso');
  await page.locator('.drawing-layers').getByRole('button',{name:'Torso',exact:true}).click();
  const cycleExcluded=await page.getByLabel('Parent layer',{exact:true}).locator('option').count()===1;
  await page.getByLabel('Rotation (degrees)',{exact:true}).fill('90');await page.getByLabel('Rotation (degrees)',{exact:true}).press('Tab');
  const childFollows=await page.locator('.storyboard-canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(300,300,1,1).data;return p[0]===255&&p[1]===0;});
  await page.getByRole('button',{name:'Remove selected layer',exact:true}).click();const deletionGuard=(await page.locator('#notice').textContent()).includes('child layers');
  await page.getByRole('button',{name:'Undo last edit',exact:true}).click();const undo=await page.getByLabel('Rotation (degrees)',{exact:true}).inputValue()==='0';await page.getByRole('button',{name:'Redo last edit',exact:true}).click();
  await page.getByLabel('Locked Torso',{exact:true}).check();const lock=await page.getByLabel('Rotation (degrees)',{exact:true}).isDisabled();await page.getByLabel('Locked Torso',{exact:true}).uncheck();
  await page.reload();await page.locator('.drawing-controls summary').click();await page.locator('.rig-controls summary').click();const parent=await page.getByLabel('Parent layer',{exact:true}).inputValue()==='torso';
  await page.getByRole('button',{name:'Pick joint on canvas',exact:true}).click();await page.locator('.storyboard-canvas').scrollIntoViewIfNeeded();let box=await page.locator('.storyboard-canvas').boundingBox();await page.mouse.click(box.x+box.width*300/960,box.y+box.height*300/540);
  const pivot=Math.abs(Number(await page.getByLabel('Pivot X',{exact:true}).inputValue())-400)<2&&Math.abs(Number(await page.getByLabel('Pivot Y',{exact:true}).inputValue())-200)<2;
  await page.getByLabel('Drawing tool',{exact:true}).selectOption('brush');await page.locator('.storyboard-canvas').scrollIntoViewIfNeeded();box=await page.locator('.storyboard-canvas').boundingBox();await page.mouse.click(box.x+box.width*300/960,box.y+box.height*320/540);
  const posedDrawing=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('studio-director-v1'))[0].scenes[0].shots[0].drawing.layers[1].strokes.at(-1).points[0];return Math.abs(s[0]-420)<2&&Math.abs(s[1]-200)<2;});
  await page.getByRole('button',{name:'Save drawing as shot image',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Drawing saved as the shot image'));
  const png=await page.evaluate(async()=>{const s=JSON.parse(localStorage.getItem('studio-director-v1'))[0].scenes[0].shots[0],f=s.media;const res=await fetch('/view?'+new URLSearchParams({filename:f.name,subfolder:f.subfolder,type:f.type})),image=await createImageBitmap(await res.blob()),c=document.createElement('canvas');c.width=960;c.height=540;c.getContext('2d').drawImage(image,0,0);image.close();const pix=c.getContext('2d').getImageData(300,300,1,1).data;return pix[0]===255&&pix[1]===0;});
  await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {collapsed,cycleExcluded,childFollows,deletionGuard,undo,lock,parent,pivot,posedDrawing,png,mobile,errors};
 }finally{await page.evaluate(b=>{for(const [k,v] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]])v===null?localStorage.removeItem(k):localStorage.setItem(k,v);},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
