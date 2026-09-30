async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(()=>{const shot={id:'test-shot',title:'Test shot',seconds:5,media:{name:'synthetic.png',type:'input'}};localStorage.setItem('studio-director-v1',JSON.stringify([{version:1,id:'test-project',title:'Synthetic production check',assets:[{id:'hero',name:'Hero',kind:'character'}],scenes:[{id:'scene',title:'Scene',shots:[shot]}]}]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.waitForSelector('.production-controls');
  const collapsed=await page.locator('.production-controls').evaluate(e=>!e.open);
  await page.locator('.production-controls summary').click();
  await page.getByLabel('Animation status',{exact:true}).selectOption('Needs changes');
  const stayedOpen=await page.locator('.production-controls').evaluate(e=>e.open);
  await page.getByRole('button',{name:'Use no visual assets',exact:true}).click();
  await page.getByRole('button',{name:'Save attached media as version',exact:true}).click();
  await page.getByLabel('Feedback',{exact:true}).fill('Fix the silhouette');
  await page.getByLabel('Frame (24 fps, starting at 0)',{exact:true}).fill('24');
  await page.getByRole('button',{name:'Add review note',exact:true}).click();
  
  const sceneFilter=await page.locator('#production-scene-filter');
  const sceneOptions=await sceneFilter.evaluate(sel=>[...sel.options].map(o=>({value:o.value,label:o.textContent})));
  const sceneFilterOk=sceneOptions.some(o=>o.value==='all')&&sceneOptions.some(o=>o.value==='scene'&&/Scene/.test(o.label));
  await sceneFilter.selectOption('scene');
  const sceneNarrow=(await page.locator('#production-rows button').count())>=1;
  await sceneFilter.selectOption('all');

  const statusFilter=await page.locator('#production-status-filter');
  const statusOptions=await statusFilter.evaluate(sel=>[...sel.options].map(o=>o.value));
  const statusFilterOk=statusOptions.includes('missing-media')&&statusOptions.includes('open-notes')&&statusOptions.includes('needs-changes')&&statusOptions.includes('ready-for-review');
  await statusFilter.selectOption('open-notes');
  const openNotesFilter=(await page.locator('#production-rows button').count())>=1;
  await statusFilter.selectOption('missing-media');
  const missingFilterEmpty=(await page.locator('#production-rows button').count())===0;
  await statusFilter.selectOption('all');

  const noteAdded=(await page.locator('#production-counts').textContent()).includes('1 open notes');
  await page.getByRole('button',{name:'Resolve note',exact:true}).click();
  const resolved=(await page.locator('#production-counts').textContent()).includes('0 open notes');
  await page.locator('#director-undo').click();
  const undo=(await page.locator('#production-counts').textContent()).includes('1 open notes');
  await page.reload();await page.locator('.production-controls summary').click();
  const persisted=await page.getByLabel('Animation status',{exact:true}).inputValue()==='Needs changes';
  await page.getByRole('button',{name:'Use this version',exact:true}).click();
  const stored=await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('studio-director-v1'))[0],s=p.scenes[0].shots[0];return s.assetIds.length===0&&s.versions.length===1&&s.media.name==='synthetic.png'&&!s.audio;});
  await page.setViewportSize({width:390,height:844});
  const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {collapsed,stayedOpen,sceneFilterOk,sceneNarrow,statusFilterOk,openNotesFilter,missingFilterEmpty,noteAdded,resolved,undo,persisted,stored,mobile,errors};
 }finally{await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
