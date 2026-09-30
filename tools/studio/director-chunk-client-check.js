async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const {uploadDirectorFile}=await import('/qwen-editor/director-upload.js');
  // Transport fixture only: intentionally not a playable WebM.
  const fixture=new File([new Uint8Array([0x1a,0x45,0xdf,0xa3]),new Uint8Array(65*1024*1024)],'transport-check.webm');
  const original=window.fetch,controller=new AbortController(),sessions=[],progress=[];
  window.fetch=async(...args)=>{const response=await original(...args);if(args[0]==='/studio/director/recordings'&&args[1]?.method==='POST')sessions.push((await response.clone().json()).id);return response;};
  let cancelled=false,invalid=false;
  try{
   try{await uploadDirectorFile(fixture,{signal:controller.signal,onProgress:p=>{progress.push(p);controller.abort();}});}catch(e){cancelled=e.name==='AbortError';}
   const wrong=new File([new Uint8Array(65*1024*1024)],'invalid-transport.webm');
   try{await uploadDirectorFile(wrong);}catch(e){invalid=e.message.includes('Expected a WebM');}
   const statuses=[];for(const id of sessions){const response=await original('/studio/director/recordings/'+id+'/finish',{method:'POST',headers:{'X-Studio-Director':'1'}});statuses.push(response.status);}
   return {abortPropagated:cancelled,progress:progress.length===1&&progress[0]>0&&progress[0]<1,invalidRejected:invalid,sessionsCleaned:statuses.length===2&&statuses.every(s=>s===404)};
  }finally{window.fetch=original;}
 });
}
