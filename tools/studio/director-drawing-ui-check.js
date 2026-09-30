async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const results={};
 try{
  await page.locator('#new').click();await page.locator('#title').fill('Synthetic drawing check');await page.locator('#add-shot').click();
  results.lazy=await page.locator('.storyboard-canvas').count()===0;
  await page.locator('.drawing-controls summary').click();await page.waitForSelector('.storyboard-canvas');
  const draw=async()=>{await page.locator('.storyboard-canvas').scrollIntoViewIfNeeded();const r=await page.locator('.storyboard-canvas').boundingBox();await page.mouse.move(r.x+r.width*.3,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.7,r.y+r.height*.5,{steps:12});await page.mouse.up();};
  await draw();
  const drawing=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0].drawing);
  results.stroke=(await drawing()).layers[0].strokes.length===1;
  await page.getByRole('button',{name:'Undo last edit',exact:true}).click();results.undo=((await drawing())?.layers[0].strokes.length||0)===0;
  await page.getByRole('button',{name:'Redo last edit',exact:true}).click();results.redo=(await drawing()).layers[0].strokes.length===1;
  await page.getByRole('button',{name:'Add layer',exact:true}).click();
  await page.getByLabel('Layer name',{exact:true}).fill('Ink');await page.getByLabel('Layer name',{exact:true}).press('Tab');
  await page.getByLabel('Brush color',{exact:true}).fill('#ff0000');await draw();
  results.layers=(await drawing()).layers[1].name==='Ink'&&(await drawing()).layers[1].strokes.length===1;
  await page.getByLabel('Locked Ink',{exact:true}).check();await draw();results.lock=(await drawing()).layers[1].strokes.length===1;
  await page.getByLabel('Locked Ink',{exact:true}).uncheck();await page.getByLabel('Visible Ink',{exact:true}).uncheck();results.hide=(await drawing()).layers[1].visible===false;
  await page.getByLabel('Visible Ink',{exact:true}).check();await page.getByRole('button',{name:'Lower layer',exact:true}).click();results.order=(await drawing()).layers[0].name==='Ink';
  await page.getByLabel('Layer opacity (%)',{exact:true}).fill('40');await page.getByLabel('Layer opacity (%)',{exact:true}).press('Tab');results.opacity=(await drawing()).layers[0].opacity===.4;
  await page.reload();await page.locator('.drawing-controls summary').click();results.persist=(await drawing()).layers.length===2;
  results.pixels=await page.evaluate(async()=>{
   const {paintDrawing}=await import('/qwen-editor/director-drawing.js');const c=document.createElement('canvas');
   const stroke=(tool,color)=>({tool,color,size:40,points:[[100,100]]});
   const b={layers:[{visible:true,opacity:1,strokes:[stroke('brush','#0000ff')]},{visible:true,opacity:1,strokes:[stroke('brush','#ff0000'),stroke('eraser','#000000')]}]};
   paintDrawing(c,b);const p=[...c.getContext('2d').getImageData(100,100,1,1).data];
   b.layers[1].strokes.pop();b.layers[1].opacity=.5;paintDrawing(c,b);const q=[...c.getContext('2d').getImageData(100,100,1,1).data];
   return p[0]===0&&p[2]===255&&p[3]===255&&q[0]>120&&q[0]<135&&q[2]>120&&q[2]<135;
  });
  await page.getByRole('button',{name:'Save drawing as shot image',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Drawing saved as the shot image'));
  results.attached=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0].media.name.startsWith('storyboard-'));
  await page.waitForSelector('.storyboard-canvas');
  results.pngMatches=await page.evaluate(async()=>{const shot=JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0],f=shot.media;const r=await fetch('/view?'+new URLSearchParams({filename:f.name,subfolder:f.subfolder,type:f.type}));const image=await createImageBitmap(await r.blob()),canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const a=ctx.getImageData(0,0,960,540).data,b=document.querySelector('.storyboard-canvas').getContext('2d').getImageData(0,0,960,540).data;image.close();return a.every((n,i)=>n===b[i]);});
  await page.locator('.drawing-controls').screenshot({path:'D:/dev/image thing/output/playwright/director-drawing.png'});
  await page.setViewportSize({width:390,height:844});results.mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  await page.evaluate(()=>{const original=window.fetch;window.fetch=(url,...args)=>url==='/upload/image'?new Promise(resolve=>window.finishDrawingUpload=()=>resolve(new Response(JSON.stringify({name:'synthetic-delayed.png',type:'input',subfolder:'studio-director-test'}),{status:200}))):original(url,...args);});
  await page.getByRole('button',{name:'Save drawing as shot image',exact:true}).click();await page.waitForFunction(()=>typeof window.finishDrawingUpload==='function');await page.locator('#new').click();await page.evaluate(()=>window.finishDrawingUpload());
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('selected project changed'));
  results.uploadIsolation=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots.length===0);
  return {...results,errors};
 }finally{await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
