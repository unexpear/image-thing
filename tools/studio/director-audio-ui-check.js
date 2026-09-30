async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 const backup=await page.evaluate(()=>({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // A tiny silent PCM WAV exercises decoding and playback without personal media.
 try{
  await page.evaluate(()=>{localStorage.setItem('studio-director-v1',JSON.stringify([{version:1,id:'audio-test',title:'Synthetic audio test',assets:[],scenes:[{id:'scene',title:'Scene',shots:[{id:'one',title:'Voice shot',seconds:3,audio:{name:'audio-check.wav',subfolder:'studio-director-test',type:'input'}},{id:'two',title:'Silent shot',seconds:1}]}]}]));localStorage.removeItem('studio-director-v1-selection');});
  await page.reload();await page.locator('#animatic summary').click();await page.waitForFunction(()=>document.querySelector('#animatic audio')?.readyState>=2);
  await page.locator('#animatic-play').click();await page.waitForFunction(()=>document.querySelector('#animatic audio')?.currentTime>.1);
  const playing=await page.locator('#animatic audio').evaluate(a=>!a.paused&&!a.muted);
  await page.locator('#animatic-sound').click();const muted=await page.locator('#animatic audio').evaluate(a=>a.muted);
  await page.locator('#animatic-sound').click();const unmuted=await page.locator('#animatic audio').evaluate(a=>!a.muted);
  await page.getByLabel('Animatic timeline',{exact:true}).fill('0.5');
  const seek=await page.locator('#animatic audio').evaluate(a=>a.paused&&Math.abs(a.currentTime-.5)<.05);
  await page.getByLabel('Animatic timeline',{exact:true}).fill('2');await page.locator('#animatic-play').click();
  const tail=await page.locator('#animatic audio').evaluate(a=>a.paused&&a.currentTime>=.99);
  await page.getByRole('button',{name:'Next shot',exact:true}).click();const released=await page.locator('#animatic audio').count()===0;
  await page.getByRole('button',{name:'Previous shot',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#animatic audio')?.readyState>=2);
  await page.locator('#animatic-play').click();await page.locator('#animatic summary').click();
  await page.waitForFunction(()=>!document.querySelector('#animatic audio'));const closed=true;
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('studio-director-v1'))[0];p.scenes[0].shots[0].media={filename:'episode-682f148908554559b8b0490adc681456.mp4',subfolder:'Qwen-Studio/Director',type:'output'};localStorage.setItem('studio-director-v1',JSON.stringify([p]));});
  await page.reload();await page.locator('#animatic summary').click();await page.waitForFunction(()=>document.querySelector('#animatic audio')?.readyState>=2&&document.querySelector('#animatic video')?.readyState>=2);
  const replacement=await page.evaluate(()=>document.querySelector('#animatic video').muted&&!document.querySelector('#animatic audio').muted);
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('studio-director-v1'))[0];p.scenes[0].shots[0].audio.name='audio-check-missing.wav';localStorage.setItem('studio-director-v1',JSON.stringify([p]));});
  await page.reload();await page.locator('#animatic summary').click();await page.waitForFunction(()=>document.querySelector('#animatic-audio-status').textContent.includes('unavailable'));
  const failure=await page.locator('#animatic video').evaluate(v=>v.muted);
  return {playing,muted,unmuted,seek,tail,released,closed,replacement,failure,errors};
 }finally{await page.evaluate(b=>{for(const [key,value] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}},backup);await page.reload();}
}
