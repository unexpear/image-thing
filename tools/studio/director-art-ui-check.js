async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>Object.fromEntries(['studio-director-v1','studio-director-v1-selection'].map(k=>[k,localStorage.getItem(k)])));
 const results={};
 try{
  await page.locator('#new').click();await page.locator('#add-shot').click();await page.locator('.drawing-controls > summary').click();
  for(const mode of ['taper','detail','shadow','highlight'])await page.getByLabel('Brush finish',{exact:true}).selectOption(mode);
  results.controls=await page.getByLabel('Mark strength (%)',{exact:true}).inputValue()==='45';
  await page.getByLabel('Check light and dark values',{exact:true}).check();
  await page.locator('.motion-controls > summary').click();await page.getByText('Planted-foot walk',{exact:true}).click();
  results.walkUI=await page.getByLabel('Distance per cycle (pixels)',{exact:true}).isVisible();
  await page.getByRole('button',{name:'Apply walk',exact:true}).click();
  results.invalidRig=await page.locator('#notice').textContent().then(t=>t.includes('different feet'));
  results.pixels=await page.evaluate(async()=>{
   const {paintDrawing,validateDrawing}=await import('/qwen-editor/director-drawing.js');
   const {paintValueCheck}=await import('/qwen-editor/director-art-tools.js');
   const c=document.createElement('canvas'),layer={id:'a',name:'a',visible:true,locked:false,opacity:1,strokes:[{tool:'rectangle',filled:true,color:'#80a0c0',size:4,points:[[100,100],[300,300]]},{tool:'brush',art:'shadow',strength:.5,color:'#000000',size:60,points:[[50,150],[350,150]]}]},board={version:1,layers:[layer]};
   validateDrawing(JSON.parse(JSON.stringify(board)));paintDrawing(c,board);const ctx=c.getContext('2d'),pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
   const outside=pixel(60,150),shadow=pixel(200,150),base=pixel(200,220);paintValueCheck(c);const gray=pixel(200,220);
   return outside.slice(0,3).every(v=>v===255)&&shadow[0]<base[0]&&gray[0]===gray[1]&&gray[1]===gray[2];
  });
  await page.evaluate(()=>{
   const data=JSON.parse(localStorage.getItem('studio-director-v1'));
   const part=(id,parent,x,y)=>({id,name:id,visible:true,locked:false,opacity:1,strokes:[{tool:'ellipse',filled:true,color:'#608090',size:4,points:[[x-10,y-10],[x+10,y+10]]}],rig:{parent,pivotX:x,pivotY:y,x:0,y:0,angle:0}});
   data.at(-1).scenes[0].shots[0].drawing={version:1,layers:[part('body',null,300,200),part('lu','body',300,220),part('ll','lu',320,260),part('lf','ll',300,300),part('ru','body',315,220),part('rl','ru',335,260),part('rf','rl',315,300)]};localStorage.setItem('studio-director-v1',JSON.stringify(data));
  });
  await page.reload();await page.locator('.drawing-controls > summary').click();await page.locator('.motion-controls > summary').click();await page.getByText('Planted-foot walk',{exact:true}).click();
  for(const [label,value] of [['Walking torso','body'],['First foot','lf'],['Second foot','rf']])await page.getByLabel(label,{exact:true}).selectOption(value);
  await page.getByLabel('Distance per cycle (pixels)',{exact:true}).fill('20');await page.getByLabel('Foot lift (pixels)',{exact:true}).fill('8');await page.getByLabel('Frames per walk cycle',{exact:true}).fill('48');await page.getByRole('button',{name:'Apply walk',exact:true}).click();
  results.walkSaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0].drawing.walk?.stride===20);
  await page.getByRole('button',{name:'Play poses',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('[aria-label="Animation frame"]').value)>2);
  results.walkPlaying=true;await page.getByRole('button',{name:'Stop preview',exact:true}).click();
  return results;
 }finally{await page.evaluate(b=>{for(const [k,v] of Object.entries(b))v===null?localStorage.removeItem(k):localStorage.setItem(k,v);},backup);await page.reload();}
}
