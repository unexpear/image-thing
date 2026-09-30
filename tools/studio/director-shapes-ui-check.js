async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')})),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.locator('#new').click();await page.locator('#add-shot').click();await page.locator('.drawing-controls summary').click();
  const board=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('studio-director-v1')).at(-1).scenes[0].shots[0].drawing);
  async function drag(cancel=false){await page.locator('.drawing-viewport').scrollIntoViewIfNeeded();const r=await page.locator('.drawing-viewport').boundingBox();await page.mouse.move(r.x+r.width*.3,r.y+r.height*.3);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height*.6,{steps:6});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
  for(const tool of ['line','rectangle','ellipse']){await page.getByLabel('Drawing tool',{exact:true}).selectOption(tool);await drag();}
  const shapes=(await board()).layers[0].strokes.map(s=>s.tool).join(',')==='line,rectangle,ellipse';
  await page.getByLabel('Shape style',{exact:true}).selectOption('filled');await drag();const filled=(await board()).layers[0].strokes.at(-1).filled;
  await drag(true);const cancel=(await board()).layers[0].strokes.length===4;
  await page.getByRole('button',{name:'Duplicate layer',exact:true}).click();const duplicate=(await board()).layers.length===2&&(await board()).layers[1].strokes.length===4;
  await page.getByLabel('Canvas zoom',{exact:true}).selectOption('2');await page.getByLabel('Drawing tool',{exact:true}).selectOption('line');await drag();
  const points=(await board()).layers[1].strokes.at(-1).points,zoomCoords=Math.abs(points[0][0]-144)<3&&Math.abs(points[1][0]-288)<3;
  await page.getByLabel('Drawing tool',{exact:true}).selectOption('pan');await page.locator('.drawing-viewport').scrollIntoViewIfNeeded();const r=await page.locator('.drawing-viewport').boundingBox();await page.mouse.move(r.x+r.width*.7,r.y+r.height*.7);await page.mouse.down();await page.mouse.move(r.x+r.width*.3,r.y+r.height*.3,{steps:5});await page.mouse.up();
  const pan=await page.locator('.drawing-viewport').evaluate(e=>e.scrollLeft>20&&e.scrollTop>20);
  const noPanStroke=(await board()).layers[1].strokes.length===5;
  const pixel=await page.evaluate(async()=>{const {paintDrawing}=await import('/qwen-editor/director-drawing.js');const c=document.createElement('canvas');paintDrawing(c,{layers:[{visible:true,opacity:1,strokes:[{tool:'rectangle',filled:true,color:'#ff0000',size:4,points:[[150,150],[50,50]]}]}]});return [...c.getContext('2d').getImageData(100,100,1,1).data].join(',')==='255,0,0,255'&&c.width===960&&c.height===540;});
  await page.setViewportSize({width:390,height:844});const mobile=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
  return {shapes,filled,cancel,duplicate,zoomCoords,pan,noPanStroke,pixel,mobile,errors};
 }catch(e){return {error:e.message,errors,controls:await page.locator('.drawing-controls').count(),open:await page.locator('.drawing-controls').evaluate(e=>e.open),notice:await page.locator('#notice').textContent()};}finally{await page.evaluate(b=>{for(const [k,v] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]])v===null?localStorage.removeItem(k):localStorage.setItem(k,v);},backup);await page.setViewportSize({width:1366,height:900});await page.reload();}
}
