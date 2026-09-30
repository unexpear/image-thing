export async function uploadDirectorFile(file,{signal,onProgress=()=>{}}={}){
 if(!file)return null;
 if(file.size<=64*1024*1024||!file.name.toLowerCase().endsWith('.webm')){
  const body=new FormData();body.append('image',file);body.append('type','input');body.append('subfolder','studio-director');
  const response=await fetch('/upload/image',{method:'POST',body,signal});if(!response.ok)throw Error('Upload failed: '+await response.text());return response.json();
 }
 const headers={'X-Studio-Director':'1'};let id;
 async function request(path,options){const response=await fetch('/studio/director/recordings'+path,{...options,signal,headers:{...headers,...options.headers}});if(!response.ok)throw Error('Recording upload failed: '+await response.text());return response.json();}
 try{
  const session=await request('',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size:file.size})});id=session.id;
  for(let offset=0;offset<file.size;){const chunk=file.slice(offset,offset+session.chunkBytes),result=await request('/'+id,{method:'PUT',headers:{'X-Recording-Offset':String(offset)},body:chunk});if(result.offset!==offset+chunk.size)throw Error('Recording upload offset mismatch.');offset=result.offset;onProgress(offset/file.size);}
  return await request('/'+id+'/finish',{method:'POST'});
 }catch(e){if(id)await fetch('/studio/director/recordings/'+id,{method:'DELETE',headers}).catch(()=>{});throw e;}
}
