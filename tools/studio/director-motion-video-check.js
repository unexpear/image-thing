async page=>{
 return await page.evaluate(async()=>{
  const video=document.createElement('video');video.muted=true;video.src='/view?'+new URLSearchParams({filename:'rig-animation-dd6e187b-98b8-4064-9b0d-57d0c86ffa28.webm',subfolder:'studio-director',type:'input'});document.body.append(video);
  try{
   await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Decode failed'));});
   await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=0.25;});
   const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);const first=ctx.getImageData(0,0,960,540).data;
   await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=reject;video.currentTime=1.5;});ctx.drawImage(video,0,0);const later=ctx.getImageData(0,0,960,540).data;
   let changed=0,red=0,firstRed=0;for(let i=0;i<first.length;i+=4){if(Math.abs(first[i+1]-later[i+1])>30)changed++;if(later[i]>200&&later[i+1]<70)red++;if(first[i]>200&&first[i+1]<70)firstRed++;}
   return {actualMotion:changed>200&&changed<10000,visibleArtwork:red>200&&firstRed>200,changedPixels:changed,firstRed};
  }finally{video.remove();}
 });
}
