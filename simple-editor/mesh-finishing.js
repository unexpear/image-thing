import {artOptions,styleGraph} from './mesh-art.js';
const $=id=>document.getElementById(id);
const controls=document.createElement('details');controls.className='settings';
controls.innerHTML=`<summary>Advanced finishing</summary><label class="field"><span><input type="checkbox" id="finish-uv"> Unwrap UVs for texturing</span></label><label class="field">Base-color texture (optional)<input id="finish-texture" type="file" accept="image/png,image/jpeg,image/webp"></label><p class="hint">Attaches your texture to a new UV atlas. Best for a simple surface texture; a reference photo will not automatically line up with the object. Texture selection enables UVs. No AI texture model is loaded.</p><label class="field"><span><input id="finish-collision" type="checkbox"> Export a separate box collision mesh</span></label><p class="hint">A lightweight bounding box, not a fitted collision hull. Assign it as collision in your game engine. Geometry checks run on every new export.</p>`;
$('create-mesh').before(controls);
const report=document.createElement('div');report.id='mesh-checks';report.className='hint';report.setAttribute('role','status');$('mesh-download').parentElement.after(report);
const collision=document.createElement('a');collision.id='mesh-collision';collision.className='download';collision.textContent='Download collision GLB ↓';collision.setAttribute('download','');collision.hidden=true;$('mesh-download').after(collision);
$('finish-texture').onchange=()=>{if($('finish-texture').files.length)$('finish-uv').checked=true;};
export async function finishingOptions(){
 const file=$('finish-texture').files[0];let texture;
 const art=artOptions();if(file&&art.surface==='flat')throw Error('Remove the texture or choose Matte; flat solid color does not use a texture.');
 if(file){if(file.size>30*1024*1024)throw Error('Use a texture under 30 MB.');const body=new FormData();body.append('image',file);body.append('subfolder','studio-3d');body.append('type','input');const response=await fetch('/upload/image',{method:'POST',body});if(!response.ok)throw Error('Texture upload failed.');const data=await response.json();texture=[data.subfolder,data.name].filter(Boolean).join('/');}
 return {uv:$('finish-uv').checked||!!texture,texture,collision:$('finish-collision').checked,...art};
}
export function finishGraph(graph,options){
 let mesh=['18',0];
 if(options.uv){graph['20']={class_type:'UnwrapMesh',inputs:{mesh:['17',0],segmenter:'adaptive',resolution:1024,padding:2,weld_distance:0}};graph['18'].inputs.mesh=['20',0];}
 if(options.texture){graph['21']={class_type:'LoadImage',inputs:{image:options.texture}};graph['25']={class_type:'ImageScale',inputs:{image:['21',0],upscale_method:'area',width:1024,height:1024,crop:'disabled'}};graph['22']={class_type:'ApplyTextureToMesh',inputs:{mesh,base_color:['25',0]}};mesh=['22',0];}
 mesh=styleGraph(graph,options,mesh);
 graph['23']={class_type:'StudioMeshExportCheck',inputs:{mesh}};graph['19'].inputs.mesh=['23',0];
 if(options.collision)graph['24']={class_type:'SaveGLB',inputs:{mesh:['23',1],filename_prefix:'Qwen-Studio/3D/collision_box'}};
 return graph;
}
export function renderFinishing(job,view){
 collision.hidden=!job?.collision;if(job?.collision)collision.href=view(job.collision);
 const r=job?.checks;report.replaceChildren();if(!r)return;
 const summary=document.createElement('p');summary.textContent=`Geometry checked · ${r.triangles.toLocaleString()} triangles · UVs: ${r.uvs?'yes':'no'} · texture: ${r.texture?'yes':'no'}`;report.append(summary);
 for(const message of [...r.warnings,r.note]){const p=document.createElement('p');p.textContent=message;report.append(p);}
 for(const [label,file] of [['Asset',job.output],['Collision',job.collision]]){
  if(!file)continue;const url=view(file);let check=exportChecks.get(url);
  if(!check){check={message:'Checking GLB file…'};exportChecks.set(url,check);fetch(url).then(response=>{if(!response.ok)throw Error('File unavailable');return response.arrayBuffer();}).then(data=>{check.message=validateGlb(data);}).catch(e=>{check.message='Export check failed: '+e.message;});}
  const p=document.createElement('p');p.textContent=label+': '+check.message;report.append(p);
 }
}
const exportChecks=new Map();
export function validateGlb(data){
 if(data.byteLength<20)throw Error('Incomplete GLB header.');const bytes=new DataView(data);
 if(bytes.getUint32(0,true)!==0x46546c67||bytes.getUint32(4,true)!==2||bytes.getUint32(8,true)!==data.byteLength)throw Error('Invalid GLB header or file length.');
 let offset=12,doc,binLength=0;
 while(offset<data.byteLength){if(offset+8>data.byteLength)throw Error('Incomplete GLB chunk.');const length=bytes.getUint32(offset,true),type=bytes.getUint32(offset+4,true);if(length%4||offset+8+length>data.byteLength)throw Error('Invalid GLB chunk length.');if(offset===12){if(type!==0x4e4f534a)throw Error('Missing JSON chunk.');doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data,offset+8,length)));}else if(type===0x004e4942)binLength=length;offset+=8+length;}
 if(doc?.asset?.version!=='2.0'||!doc.meshes?.length)throw Error('Missing glTF 2.0 mesh.');
 const buffer=doc.buffers?.[0];if(!buffer||buffer.uri||buffer.byteLength>binLength||binLength-buffer.byteLength>3)throw Error('Missing or invalid embedded geometry buffer.');
 for(const view of doc.bufferViews||[]){if(view.buffer!==0||(view.byteOffset||0)<0||view.byteLength<0||(view.byteOffset||0)+view.byteLength>buffer.byteLength)throw Error('Geometry or texture data lies outside the file.');}
 return 'GLB structure and embedded data checks passed. Verify appearance and engine import.';
}
