async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.locator('#new').click();await page.locator('#add-shot').click();
  const collapsed=await page.locator('#director-delivery').evaluate(e=>!e.open);
  await page.locator('#director-delivery summary').click();
  const missing=(await page.locator('#delivery-count').textContent()).includes('1 assembly gaps');
  await page.locator('#delivery-issues button').first().click();
  const jump=await page.locator('.production-controls').evaluate(e=>e.open);
  await page.getByLabel('Subtitle text (whole shot)',{exact:true}).fill('Hello audience');
  const focused=await page.getByLabel('Subtitle text (whole shot)',{exact:true}).evaluate(e=>e===document.activeElement);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0].subtitle==='Hello audience');
  await page.locator('#director-undo').click();const undo=await page.getByLabel('Subtitle text (whole shot)',{exact:true}).inputValue()==='';
  await page.locator('#director-redo').click();
  const csvEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export shot list CSV',exact:true}).click();const csv=(await csvEvent).suggestedFilename()==='episode-shot-list.csv';
  const srtEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export subtitles SRT',exact:true}).click();const srt=(await srtEvent).suggestedFilename()==='episode-subtitles.srt';
  await page.reload();await page.locator('.production-controls summary').click();const reload=await page.getByLabel('Subtitle text (whole shot)',{exact:true}).inputValue()==='Hello audience';
  await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {collapsed,missing,jump,focused,stored,undo,csv,srt,reload,mobile,errors};
 }finally{await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
