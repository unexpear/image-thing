export function imageReferences(project,shot){
 const image=f=>f&&/\.(png|jpe?g|webp)$/i.test(f.name||f.filename||'');
 const assets=project.assets.filter(a=>['character','set','prop'].includes(a.kind)&&(shot.assetIds===undefined||shot.assetIds.includes(a.id))&&image(a.file));
 const refs=[...(image(shot.media)?[{label:'Shot storyboard',file:shot.media}]:[]),...assets.map(a=>({label:a.name,file:a.file}))];
 const seen=new Set();return refs.filter(r=>{const key=JSON.stringify([r.file.type||'input',r.file.subfolder||'',r.file.name||r.file.filename]);if(seen.has(key))return false;seen.add(key);return true;});
}
export async function loadDirectorReferences(setSource,restoreReferences){
 if(new URLSearchParams(location.search).get('director')!=='1')return;
 const stored=sessionStorage.getItem('studio-director-references');if(!stored)return;
 const references=JSON.parse(stored);if(!Array.isArray(references)||references.length>3)throw Error('Choose at most three Director reference images.');
 const files=[];
 for(const item of references){const f=item.file;const response=await fetch('/view?'+new URLSearchParams({filename:f.name||f.filename,subfolder:f.subfolder||'',type:f.type||'input'}));if(!response.ok)throw Error('Director reference is missing: '+item.label);const blob=await response.blob();if(blob.size>30*1024*1024)throw Error('Director reference is too large: '+item.label);const form=new FormData();form.append('image',blob,f.name||f.filename);form.append('subfolder','director-references');form.append('type','input');const uploaded=await fetch('/upload/image',{method:'POST',body:form});if(!uploaded.ok)throw Error('Could not prepare reference: '+item.label);files.push(await uploaded.json());}
 if(files.length){setSource(files[0]);await restoreReferences({refs:files.slice(1)});}
 sessionStorage.removeItem('studio-director-references');
}
