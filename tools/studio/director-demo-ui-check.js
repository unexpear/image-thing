async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.evaluate(async()=>{const {newProject}=await import('/qwen-editor/director-project.js');const p=newProject();p.title='Synthetic preserved project';localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');});await page.reload();
  await page.getByText('Watch & edit a demo cartoon trailer',{exact:true}).click();
  const playback=await page.locator('video[src*="the-last-starlight-demo"]').evaluate(async video=>{video.load();await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('Video could not load')),{once:true});});video.currentTime=3;await new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));video.muted=true;await video.play();await new Promise(resolve=>setTimeout(resolve,700));video.pause();return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,advanced:video.currentTime>3.1};});
  await page.getByRole('button',{name:'Add demo as a new episode',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('studio-director-v1')).length===2);
  const project=await page.evaluate(()=>{const library=JSON.parse(localStorage.getItem('studio-director-v1'));return {count:library.length,preserved:library[0].title==='Synthetic preserved project',shots:library[1].scenes[0].shots.length,seconds:library[1].scenes[0].shots.reduce((n,s)=>n+s.seconds,0)};});
  await page.getByText('Local creative assistants',{exact:true}).click();
  const defaultPlanner=await page.getByLabel('Shot planner',{exact:true}).inputValue();
  await page.getByLabel('Assistant task',{exact:true}).selectOption('write');
  await page.getByLabel('Writing guide',{exact:true}).selectOption('trailer');
  const guide=await page.getByLabel('Writing guide',{exact:true}).inputValue();
  await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {playback,project,defaultPlanner,guide,mobile,errors};
 }finally{
  await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]])if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);},backup);
  await page.setViewportSize({width:1280,height:900});
 }
}
