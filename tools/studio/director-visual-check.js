async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');await page.waitForSelector('#add-shot');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 try{
  await page.evaluate(async()=>{const {newProject}=await import('/qwen-editor/director-project.js');const p=newProject();p.title='The Paper Moon';p.style='Hand-painted worlds, soft colors, expressive silhouettes.';p.synopsis='A young inventor follows a paper moon across the sleeping city.';p.scenes[0].title='01 · Rooftop discovery';p.scenes[0].shots=[{id:crypto.randomUUID(),title:'A light on the rooftops',seconds:6,action:'The inventor spots a glowing paper moon above the rooftops.',camera:'Wide establishing shot · slow push in',dialogue:'What are you doing up there?'}];localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.waitForSelector('#shots article');await page.setViewportSize({width:1366,height:950});
  await page.screenshot({path:'D:/dev/image thing/reports/studio/director-ui-desktop.png',fullPage:true});
  const desktop=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,shots:document.getElementById('shot-count').textContent}));
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'D:/dev/image thing/reports/studio/director-ui-mobile.png',fullPage:true});
  const mobile=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth}));
  if(desktop.overflow||mobile.overflow)throw Error(JSON.stringify({desktop,mobile}));return {desktop,mobile};
 }finally{await page.evaluate(b=>{for(const[k,v]of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}},backup);await page.setViewportSize({width:1366,height:950});await page.reload();}
}
