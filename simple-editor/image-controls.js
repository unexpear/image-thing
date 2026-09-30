const box=document.createElement('details');box.className='settings';
box.innerHTML=`<summary>Advanced editing <span>References & painted mask</span></summary><p class="hint">Picture 1 is your main image. Add up to two references and refer to Picture 2 or Picture 3 in your prompt.</p><input id="extra-refs" type="file" accept="image/png,image/jpeg,image/webp" multiple><div id="extra-ref-list"></div><label><input id="mask-enabled" type="checkbox"> Edit only the painted area</label><p class="hint">Paint white to edit; erase to protect. Unpainted areas are preserved at the selected output size. Masks stay in this tab until you change the source.</p><div class="mask-tools"><label>Brush <input id="mask-brush" type="range" min="4" max="100" value="30"></label><label><input id="mask-erase" type="checkbox"> Erase</label><button id="mask-clear" type="button">Clear mask</button></div><canvas id="edit-mask" width="512" height="512" aria-label="Paint the area to edit"></canvas><p id="extra-status" role="status" class="hint">Choose a source image to paint.</p>`;
document.querySelector('#editor .settings').before(box);
const $=id=>document.getElementById(id),canvas=$('edit-mask'),ctx=canvas.getContext('2d');
let refs=[],pending=false,sourceReady=false,stroke=false,last=null,sourceVersion=0,sourceLoad=Promise.resolve(),maskVersion=0,restoring=false;
const filename=x=>[x.subfolder,x.name||x.filename].filter(Boolean).join('/');
async function upload(file){const form=new FormData();form.append('image',file);form.append('subfolder','qwen-studio');form.append('type','input');const r=await fetch('/upload/image',{method:'POST',body:form});if(!r.ok)throw Error('Upload failed.');return r.json();}
function list(){ $('extra-ref-list').replaceChildren();refs.forEach((ref,i)=>{const row=document.createElement('p');row.textContent=`Picture ${i+2}: ${ref.name} `;const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';remove.disabled=pending;remove.onclick=()=>{refs.splice(i,1);list();};row.append(remove);$('extra-ref-list').append(row);}); }
$('extra-refs').onchange=async()=>{const files=[...$('extra-refs').files];if(refs.length+files.length>2){$('extra-status').textContent='Two extra references maximum.';return;}pending=true;$('extra-refs').disabled=true;list();try{for(const file of files){if(file.size>30*1024*1024)throw Error('Each reference must be under 30 MB.');refs.push(await upload(file));}$('extra-status').textContent='References ready.';}catch(e){$('extra-status').textContent=e.message;}finally{pending=false;$('extra-refs').disabled=false;$('extra-refs').value='';list();}};
export function setMaskSource(source){
 const version=++sourceVersion;++maskVersion;restoring=false;stroke=false;last=null;canvas.style.backgroundImage='none';sourceReady=false;ctx.clearRect(0,0,canvas.width,canvas.height);$('mask-enabled').checked=false;
 sourceLoad=new Promise(resolve=>{const image=new Image();const url='/view?'+new URLSearchParams({filename:source.name||source.filename,subfolder:source.subfolder||'',type:source.type||'input'});
 image.onload=()=>{if(version!==sourceVersion){resolve();return;}const scale=Math.min(1,768/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.style.backgroundImage=`url("${url}")`;sourceReady=true;$('extra-status').textContent='Paint over the area you want to change.';resolve();};
 image.onerror=()=>{if(version===sourceVersion)$('extra-status').textContent='Source could not load for masking.';resolve();};image.src=url;});return sourceLoad;
}
function point(e){const rect=canvas.getBoundingClientRect();return[(e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height];}
function paint(e){if(!stroke)return;const p=point(e);ctx.globalCompositeOperation=$('mask-erase').checked?'destination-out':'source-over';ctx.strokeStyle='white';ctx.fillStyle='white';ctx.lineWidth=Number($('mask-brush').value);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(...(last||p));ctx.lineTo(...p);ctx.stroke();ctx.beginPath();ctx.arc(...p,ctx.lineWidth/2,0,2*Math.PI);ctx.fill();last=p;}
canvas.onpointerdown=e=>{if(!sourceReady||restoring)return;stroke=true;last=null;canvas.setPointerCapture(e.pointerId);$('mask-enabled').checked=true;paint(e);};canvas.onpointermove=paint;canvas.onpointerup=canvas.onpointercancel=()=>{stroke=false;last=null;};
$('mask-clear').onclick=()=>{++maskVersion;restoring=false;stroke=false;last=null;ctx.clearRect(0,0,canvas.width,canvas.height);$('mask-enabled').checked=false;};
export async function restoreReferences(extra){
 const revision=++maskVersion,version=sourceVersion;
 refs=structuredClone(extra?.refs||[]);list();stroke=false;last=null;
 ctx.clearRect(0,0,canvas.width,canvas.height);
 restoring=!!extra?.masked;$('mask-enabled').checked=restoring;
 if(!restoring)return;
 $('extra-status').textContent='Restoring saved mask…';
 try{
  await sourceLoad;
  if(revision!==maskVersion||version!==sourceVersion)return;
  if(!sourceReady||!extra.mask)throw Error('Saved mask unavailable.');
  const image=new Image();image.src='/view?'+new URLSearchParams({filename:extra.mask.name||extra.mask.filename,subfolder:extra.mask.subfolder||'',type:'input'});
  await image.decode();
  if(revision!==maskVersion||version!==sourceVersion)return;
  ctx.globalCompositeOperation='source-over';ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixels.data.length;i+=4){pixels.data[i+3]=pixels.data[i];pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}
  ctx.putImageData(pixels,0,0);$('extra-status').textContent='Saved references and mask restored.';
 }catch{
  if(revision===maskVersion&&version===sourceVersion)$('extra-status').textContent='Saved mask unavailable. Repaint the area or turn off masking.';
 }finally{
  if(revision===maskVersion&&version===sourceVersion)restoring=false;
 }
}
export async function applyImageControls(graph){
 if(pending)throw Error('Wait for reference uploads to finish.');
 if(restoring)throw Error('Wait for the saved mask to finish loading, or clear it.');
 const extra={refs:structuredClone(refs),masked:false};
 refs.forEach((ref,i)=>{const load=String(40+i*4),scale=String(41+i*4),encode=String(42+i*4),positive=String(43+i*4),negative=String(60+i);graph[load]={class_type:'LoadImage',inputs:{image:filename(ref)}};graph[scale]={class_type:'ImageScaleToTotalPixels',inputs:{image:[load,0],upscale_method:'area',megapixels:0.140625,resolution_steps:8}};graph[encode]={class_type:'VAEEncode',inputs:{pixels:[scale,0],vae:['3',0]}};for(const id of ['6','7'])graph[id].inputs[`image${i+2}`]=[scale,0];for(const [id,target] of [[positive,'8'],[negative,'9']]){graph[id]={class_type:'ReferenceLatent',inputs:{conditioning:graph[target].inputs.conditioning,latent:[encode,0]}};graph[target].inputs.conditioning=[id,0];}});
 if($('mask-enabled').checked){
  if(!sourceReady)throw Error('Load a source image before painting.');
  const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;if(!data.some((v,i)=>i%4===3&&v>0))throw Error('Paint an area to edit, or turn off the mask.');
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const context=output.getContext('2d');context.fillStyle='black';context.fillRect(0,0,output.width,output.height);context.drawImage(canvas,0,0);const blob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not save the painted mask.');const file=await upload(new File([blob],'mask-'+crypto.randomUUID()+'.png',{type:'image/png'}));extra.masked=true;extra.mask=file;
  graph['70']={class_type:'LoadImage',inputs:{image:filename(file)}};graph['71']={class_type:'ImageToMask',inputs:{image:['70',0],channel:'red'}};graph['72']={class_type:'SetLatentNoiseMask',inputs:{samples:['10',0],mask:['71',0]}};graph['14'].inputs.latent_image=['72',0];graph['73']={class_type:'ImageCompositeMasked',inputs:{destination:['5',0],source:['15',0],mask:['71',0],x:0,y:0,resize_source:false}};graph['16'].inputs.images=['73',0];
 }
 return extra;
}
