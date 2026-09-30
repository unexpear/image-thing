// Media chunks are written in order to private temporary disk storage, not retained in RAM.
// The caller must release the returned file after upload has finished.
export async function recordCanvas({canvas,seconds,draw,active,onProgress=()=>{},signal}){
 if(!Number.isInteger(seconds)||seconds<1||seconds>3600)throw Error('Record a shot between 1 and 3600 seconds.');
 const mime=globalThis.MediaRecorder&&['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
 if(!mime||!canvas.captureStream||!navigator.storage?.getDirectory)throw Error('Disk-backed recording requires the current Local Studio desktop app or Edge.');
 const check=()=>{if(signal?.aborted)throw Error('Recording cancelled.');if(!active())throw Error('Recording cancelled because the shot or view changed.');};
 check();const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('studio-recordings',{create:true}),name='recording-'+crypto.randomUUID()+'.webm';
 let writer,stream,recorder,timer,queue=Promise.resolve(),failure=null,pending=0,bytes=0,closed=false;
 const release=async()=>{try{await dir.removeEntry(name);}catch(e){if(e.name!=='NotFoundError')throw e;}};
 let cancel=()=>{};
 try{
  const handle=await dir.getFileHandle(name,{create:true});writer=await handle.createWritable();check();draw(0);stream=canvas.captureStream(24);
  // 1 Mbps targets ~450 MB for one hour; long recordings use chunked local upload.
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:1000000});
  await new Promise((resolve,reject)=>{
   const fail=error=>{failure??=error instanceof Error?error:Error(String(error));clearInterval(timer);if(recorder.state!=='inactive')recorder.stop();else reject(failure);};
   cancel=()=>fail(Error('Recording cancelled.'));signal?.addEventListener('abort',cancel,{once:true});
   recorder.ondataavailable=e=>{
    if(!e.data.size||failure)return;
    pending+=e.data.size;bytes+=e.data.size;
    if(pending>16*1024*1024||bytes>640*1024*1024){fail(Error('Recording cannot keep up with disk storage or exceeded the 640 MB recording budget. Try a simpler or shorter shot.'));return;}
    queue=queue.then(()=>writer.write(e.data)).then(()=>{pending-=e.data.size;}).catch(fail);
   };
   recorder.onerror=e=>fail(e.error||Error('Video recording failed.'));
   recorder.onstop=()=>{clearInterval(timer);resolve();};
   // The start event can arrive after encoding has begun. Draw from start(),
   // otherwise its delay becomes a frozen first frame and extends the clip.
   const start=performance.now();
   recorder.start(1000);
   timer=setInterval(()=>{try{check();const elapsed=(performance.now()-start)/1000;draw(Math.min(seconds*24-1,Math.floor(elapsed*24)));onProgress(Math.min(elapsed,seconds),seconds,bytes);if(elapsed>=seconds){clearInterval(timer);recorder.stop();}}catch(e){fail(e);}},1000/24);
  });
  await queue;if(failure)throw failure;check();await writer.close();closed=true;
  const file=await handle.getFile();if(!file.size)throw Error('Recording produced an empty clip.');
  return {file:new File([file],name,{type:mime}),release};
 }catch(e){await queue.catch(()=>{});if(writer&&!closed)await writer.abort().catch(()=>{});await release().catch(()=>{});throw e;}
 finally{clearInterval(timer);signal?.removeEventListener('abort',cancel);if(recorder&&recorder.state!=='inactive')recorder.stop();stream?.getTracks().forEach(t=>t.stop());}
}
