async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const {recordCanvas}=await import('/qwen-editor/director-recorder.js'),canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const ctx=canvas.getContext('2d');let maxElapsed=0;
  const result=await recordCanvas({canvas,seconds:35,active:()=>true,draw:f=>{ctx.fillStyle='#102030';ctx.fillRect(0,0,640,360);ctx.fillStyle='#ee3311';ctx.fillRect(f/24*10,100,40,80);},onProgress:t=>maxElapsed=t});
  const file=result.file;const form=new FormData();form.append('image',file);form.append('subfolder','studio-director-test');form.append('type','input');let uploaded;
  try{const response=await fetch('/upload/image',{method:'POST',body:form});if(!response.ok)throw Error('Upload failed');uploaded=await response.json();}finally{await result.release();}
  const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('studio-recordings');let removed=false;try{await dir.getFileHandle(file.name);}catch(e){removed=e.name==='NotFoundError';}
  const video=document.createElement('video');video.muted=true;video.src='/view?'+new URLSearchParams({filename:uploaded.name,subfolder:uploaded.subfolder,type:uploaded.type});document.body.append(video);
  try{await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=reject;video.currentTime=33;});ctx.drawImage(video,0,0);const pix=ctx.getImageData(350,120,1,1).data;return {longerThan30:maxElapsed===35,seek33:video.currentTime===33,movingArtwork:pix[0]>170&&pix[1]<90,temporaryFileRemoved:removed,bytes:file.size,file:uploaded};}finally{video.remove();}
 });
}
