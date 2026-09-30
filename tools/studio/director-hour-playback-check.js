async (page,descriptor)=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async ref=>{
  const video=document.createElement('video');video.muted=true;video.preload='auto';video.src='/view?'+new URLSearchParams({filename:ref.name||ref.filename,subfolder:ref.subfolder,type:ref.type});
  document.body.append(video);
  function event(name,action){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error(name+' timed out')),30000);const good=()=>finish(),bad=()=>finish(Error('Video decode failed'));function finish(error){clearTimeout(timer);video.removeEventListener(name,good);video.removeEventListener('error',bad);error?reject(error):resolve();}video.addEventListener(name,good,{once:true});video.addEventListener('error',bad,{once:true});action?.();});}
  try{
   if(video.readyState<2)await event('loadeddata');
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');
   await event('seeked',()=>video.currentTime=3597);ctx.drawImage(video,0,0,960,540);const a=ctx.getImageData(0,0,960,540).data;
   await event('seeked',()=>video.currentTime=3598);ctx.drawImage(video,0,0,960,540);const b=ctx.getImageData(0,0,960,540).data;
   let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>25)changed++;
   return {seekNearEnd:Math.abs(video.currentTime-3598)<.1,visibleMotion:changed>200,changedPixels:changed,width:video.videoWidth,height:video.videoHeight};
  }finally{video.pause();video.removeAttribute('src');video.load();video.remove();}
 },descriptor);
}
