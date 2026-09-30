async page=>{
 await page.goto('http://127.0.0.1:8188/qwen-editor/director.html');
 return await page.evaluate(async()=>{
  const {recordCanvas}=await import('/qwen-editor/director-recorder.js'),canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('studio-recordings',{create:true});
  const entries=async()=>{const names=[];for await(const name of dir.keys())names.push(name);return names.sort();};const before=await entries();
  const controller=new AbortController();setTimeout(()=>controller.abort(),250);let cancelled='',changed='',invalid='';
  try{await recordCanvas({canvas,seconds:2,signal:controller.signal,active:()=>true,draw:()=>canvas.getContext('2d').fillRect(0,0,64,64)});}catch(e){cancelled=e.message;}
  const start=performance.now();try{await recordCanvas({canvas,seconds:2,active:()=>performance.now()-start<250,draw:()=>canvas.getContext('2d').fillRect(0,0,64,64)});}catch(e){changed=e.message;}
  try{await recordCanvas({canvas,seconds:3601,active:()=>true,draw:()=>{}});}catch(e){invalid=e.message;}
  return {cancellation:cancelled.includes('cancelled'),staleShot:changed.includes('shot or view changed'),limit:invalid.includes('3600'),temporaryCleanup:JSON.stringify(before)===JSON.stringify(await entries())};
 });
}
