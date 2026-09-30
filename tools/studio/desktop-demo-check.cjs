// Runs only from the packaged app's explicit --smoke-test --demo-test mode.
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function checkDesktop(win,Menu,root){
 const wc=win.webContents;
 const backup=await wc.executeJavaScript(`({data:localStorage.getItem('studio-director-v1'),selection:localStorage.getItem('studio-director-v1-selection')})`);
 const result={};
 const reload=()=>new Promise((resolve,reject)=>{wc.once('did-finish-load',resolve);wc.once('did-fail-load',(_e,code,message)=>reject(Error(code+': '+message)));wc.reload();});
 try{
  await wc.executeJavaScript(`(async()=>{const {newProject}=await import('/qwen-editor/director-project.js');const p=newProject();p.title='Desktop preserved test';localStorage.setItem('studio-director-v1',JSON.stringify([p]));localStorage.removeItem('studio-director-v1-selection');})()`);
  await reload();
  result.demo=await wc.executeJavaScript(`(async()=>{
   const wait=async(fn)=>{const end=Date.now()+20000;while(!fn()){if(Date.now()>end)throw Error('Desktop check timed out');await new Promise(r=>setTimeout(r,50));}};
   const video=document.querySelector('video[src*="the-last-starlight-demo-v3"]');if(!video)throw Error('Revised desktop demo missing');video.closest('details').open=true;
   video.muted=true;video.load();await wait(()=>video.readyState>=1);video.currentTime=13;await wait(()=>!video.seeking&&video.readyState>=2);await video.play();await new Promise(r=>setTimeout(r,1100));video.pause();
   const playback={seconds:video.duration,width:video.videoWidth,height:video.videoHeight,advanced:video.currentTime>13.5,canDecodeH264:video.canPlayType('video/mp4; codecs="avc1.42E01E"')};
   [...document.querySelectorAll('button')].find(b=>b.textContent==='Add demo as a new episode').click();
   await wait(()=>JSON.parse(localStorage.getItem('studio-director-v1')).length===2);
   const library=JSON.parse(localStorage.getItem('studio-director-v1'));
   return {playback,preserved:library[0].title==='Desktop preserved test',shots:library[1].scenes[0].shots.length,seconds:library[1].scenes[0].shots.reduce((n,s)=>n+s.seconds,0),planner:document.querySelector('[aria-label="Shot planner"]').value};
  })()`,true);
  await reload();
  result.persistence=await wc.executeJavaScript(`JSON.parse(localStorage.getItem('studio-director-v1')).some(p=>p.title==='The Last Starlight · animation pass 3')`);
  result.animation=await wc.executeJavaScript(`(async()=>{
   const {recordCanvas}=await import('/qwen-editor/director-recorder.js');const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');
   const recording=await recordCanvas({canvas:c,seconds:1,active:()=>true,draw:f=>{ctx.fillStyle='#153e4e';ctx.fillRect(0,0,320,180);ctx.fillStyle='#ffc65c';ctx.fillRect(f*8,70,25,25);}});
   let bytes;try{bytes=recording.file.size;}finally{await recording.release();}
   const {starterCharacter,jointsOf}=await import('/qwen-editor/director-3d-engine.js');
   return {recordedBytes:bytes,skeletonJoints:jointsOf(starterCharacter()).length,nodeUnavailable:typeof require==='undefined'};
  })()`);
  const voiceName='kokoro-da268d6d383b4e7196da4a4e61051306.wav';
  if(fs.existsSync(path.join(root,'ComfyUI_windows_portable/ComfyUI/input/studio-voices',voiceName))){
   result.voice=await wc.executeJavaScript(`(async()=>{const audio=new Audio('/view?filename=${voiceName}&subfolder=studio-voices&type=input');audio.muted=true;document.body.append(audio);try{await audio.play();await new Promise(r=>setTimeout(r,900));return {duration:audio.duration,advanced:audio.currentTime>.5,error:audio.error?.message||null};}finally{audio.pause();audio.remove();}})()`,true);
   if(!result.voice.advanced||result.voice.error)throw Error('Desktop voice playback failed');
  }
  const menu=Menu.getApplicationMenu().items.find(i=>i.label==='Studio').submenu;
  result.navigation=[];
  for(const label of ['Images','Video','3D','Cartoon Director']){
   const loaded=new Promise(resolve=>wc.once('did-finish-load',resolve));menu.items.find(i=>i.label===label).click();await loaded;
   result.navigation.push({label,url:wc.getURL(),hasDocument:await wc.executeJavaScript(`!!document.body&&document.body.children.length>0`)});
  }
  result.ok=result.demo.playback.advanced&&result.demo.playback.width===1280&&result.demo.preserved&&result.demo.shots===6&&result.demo.seconds===36&&result.demo.planner==='bonsai'&&result.persistence&&result.animation.recordedBytes>0&&result.animation.skeletonJoints>=15&&result.animation.nodeUnavailable&&result.navigation.every(x=>x.hasDocument);
  fs.writeFileSync(path.join(root,'reports/studio/desktop-demo-check.json'),JSON.stringify(result,null,2));
  if(!result.ok)throw Error('Desktop workflow assertion failed. See desktop-demo-check.json.');
  return result;
 }finally{
  if(!wc.getURL().includes('/director.html'))await wc.loadURL('http://127.0.0.1:8188/qwen-editor/director.html');
  await wc.executeJavaScript(`(()=>{const b=${JSON.stringify(backup)};for(const [k,v] of [['studio-director-v1',b.data],['studio-director-v1-selection',b.selection]])if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);})()`);
 }
};
