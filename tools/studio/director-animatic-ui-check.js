async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0;
 const route=async r=>{requests++;await r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="blue"/></svg>'});};
 await page.route('**/view?filename=animatic-synthetic*',route);
 try{
  await page.evaluate(()=>{localStorage.setItem('studio-director-v1',JSON.stringify([{version:1,id:'animatic-test',title:'Synthetic preview',assets:[],scenes:[{id:'scene',title:'Scene',shots:[{id:'first',title:'First',seconds:1,media:{name:'animatic-synthetic.png',type:'input'}},{id:'second',title:'Second',seconds:1,action:'Missing shot placeholder'}]}]}]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.waitForSelector('#animatic');
  const lazy=requests===0;
  await page.locator('#animatic summary').click();await page.waitForFunction(()=>document.querySelector('#animatic-status').textContent.includes('Ready'));
  const image=requests===1;
  await page.getByRole('button',{name:'Forward one frame',exact:true}).click();const frame=(await page.locator('#animatic-time').textContent()).startsWith('00:00:00:01');
  await page.getByRole('button',{name:'Next shot',exact:true}).click();const placeholder=(await page.locator('.animatic-screen').textContent())==='Missing shot placeholder';
  await page.locator('#animatic-play').click();await page.waitForFunction(()=>document.querySelector('#animatic-status').textContent==='Preview finished.');
  const ended=(await page.locator('#animatic-time').textContent()).startsWith('00:00:02:00');
  await page.locator('#animatic-play').click();await page.waitForFunction(()=>document.querySelector('#animatic').classList.contains('playing'));
  await page.locator('#animatic summary').click();const hiddenPause=(await page.locator('#animatic-play').textContent())==='Play preview';
  await page.locator('#new').click();await page.locator('#animatic summary').click();const empty=await page.locator('#animatic-play').isDisabled();
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('studio-director-v1')).find(p=>p.id==='animatic-test');p.scenes[0].shots=[{id:'clip',title:'Short synthetic clip',seconds:3,media:{filename:'episode-682f148908554559b8b0490adc681456.mp4',subfolder:'Qwen-Studio/Director',type:'output'}}];localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.locator('#animatic summary').click();await page.waitForFunction(()=>document.querySelector('.animatic-screen video')?.readyState>=2);
  await page.getByLabel('Animatic timeline',{exact:true}).fill('2.5');
  const shortHold=await page.locator('.animatic-screen video').evaluate(v=>!v.muted&&v.paused&&v.currentTime>.9&&v.currentTime<=v.duration);
  await page.getByLabel('Animatic timeline',{exact:true}).fill('0');await page.locator('#animatic-play').click();await page.waitForFunction(()=>document.querySelector('.animatic-screen video')?.currentTime>.1);
  const videoPlay=await page.locator('.animatic-screen video').evaluate(v=>!v.paused);
  await page.locator('#animatic-play').click();
  await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {lazy,image,frame,placeholder,ended,hiddenPause,empty,shortHold,videoPlay,mobile,errors};
 }finally{await page.unroute('**/view?filename=animatic-synthetic*',route);await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
