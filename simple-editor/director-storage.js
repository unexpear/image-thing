export function createProjectStorage({getProject,getLibrary,button,tell,host,change,upload,applyImportedProject}){
 const timers=new Map();let chain=Promise.resolve();
 async function request(action,project){const response=await fetch('/studio/director/project/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Director':'1'},body:JSON.stringify(project)});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'Project storage unavailable.');}return response;}
 function schedule(project=getProject()){clearTimeout(timers.get(project.id));const snapshot=structuredClone(project);timers.set(project.id,setTimeout(()=>{timers.delete(project.id);chain=chain.catch(()=>{}).then(()=>request('save',snapshot)).catch(error=>tell('Browser copy saved; disk backup failed: '+error.message));},1200));}
 const missingHost=document.createElement('div');host.after(missingHost);
 const check=button('Check project media',async()=>{check.disabled=true;try{const owner=getProject(),data=await(await request('check',owner)).json();missingHost.replaceChildren();tell(data.missing.length?`${data.missing.length} missing media references. Choose replacement files below.`:`${data.files} media files found. This checks availability, not artistic quality.`);for(const ref of data.missing){const label=document.createElement('label');label.className='field';label.textContent='Replace missing '+(ref.name||ref.filename);const input=document.createElement('input');input.type='file';input.onchange=async()=>{try{if(!input.files[0])return;const replacement=await upload(input.files[0]);if(getProject()!==owner)throw Error('Return to the original project to relink media.');const key=f=>JSON.stringify([f.type||'input',f.subfolder||'',f.name||f.filename]);change(()=>{function visit(value){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object'){if(key(value)===key(ref)){for(const k of Object.keys(value))delete value[k];Object.assign(value,replacement);}else Object.values(value).forEach(visit);}}visit(owner);});label.remove();tell('Replacement attached. Check project media again to verify.');}catch(e){tell(e.message);}};label.append(input);missingHost.append(label);}}catch(error){tell(error.message);}finally{check.disabled=false;}});
 const pack=button('Back up project + all media',async()=>{pack.disabled=true;tell('Packaging project and media…');try{const response=await request('package',structuredClone(getProject()));const {url}=await response.json();const a=document.createElement('a');a.href=url;a.download='cartoon-project.zip';a.click();tell('Backup ready. Contains the project, media, and restoration instructions.');}catch(error){tell(error.message);}finally{pack.disabled=false;}});
 async function importZip(file){
  if(!file)return;
  if(!/\.zip$/i.test(file.name||''))throw Error('Choose a cartoon-project.zip backup.');
  if(file.size>2*1024*1024*1024)throw Error('Project ZIP must be 2 GB or smaller.');
  if(typeof applyImportedProject!=='function'||typeof getLibrary!=='function')throw Error('ZIP import UI is not wired.');
  tell('Importing project ZIP…');
  const body=new FormData();body.append('file',file,file.name||'cartoon-project.zip');
  // Always import under a new id first so an existing disk snapshot is never overwritten before confirm.
  const response=await fetch('/studio/director/project/import?collision=new',{method:'POST',headers:{'X-Studio-Director':'1'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'ZIP import failed.');
  const imported=data.project;
  if(!imported||typeof imported.id!=='string')throw Error('Import did not return a project.');
  const archivedId=data.archivedId;
  const library=getLibrary();
  const existing=typeof archivedId==='string'?library.find(p=>p.id===archivedId):null;
  let mode='new';
  let orphanDiscarded=false;
  if(existing){
   const replace=window.confirm(`A project with this id already exists ("${existing.title}").\n\nOK = replace that browser copy with the ZIP.\nCancel = keep both (imported copy keeps a new id).`);
   if(replace){
    mode='replace';
    const orphanId=imported.id;
    imported.id=archivedId;
    if(typeof imported.title==='string')imported.title=imported.title.replace(/\s*\(imported\)\s*$/,'');
    // Discard the temporary collision=new disk snapshot so it does not linger after confirm-replace.
    try{
     const discardBody={version:1,id:orphanId,scenes:[]};
     const discardResponse=await request('discard',discardBody);
     const discardData=await discardResponse.json().catch(()=>({}));
     orphanDiscarded=!!discardData.discarded;
    }catch(_){
     // Best-effort: import still succeeds; orphan folder may remain until a later cleanup.
     orphanDiscarded=false;
    }
   }
  }
  applyImportedProject(imported,{mode,files:data.files,restored:data.restored,reused:data.reused,renamed:data.renamed,rewritten:data.rewritten,archivedId,orphanDiscarded});
  tell(`Imported ZIP (${mode}): ${data.files||0} media files available (${data.restored||0} written, ${data.reused||0} already present, ${data.renamed||0} renamed on collision). Validated.`);
 }
 const importLabel=document.createElement('label');importLabel.className='import-control';importLabel.append(document.createTextNode('Import project ZIP '));
 const importInput=document.createElement('input');importInput.type='file';importInput.accept='.zip,application/zip';importInput.setAttribute('aria-label','Import project ZIP');
 importInput.onchange=async()=>{const file=importInput.files&&importInput.files[0];importInput.value='';if(!file)return;importInput.disabled=true;pack.disabled=true;check.disabled=true;try{await importZip(file);}catch(error){tell(error.message);}finally{importInput.disabled=false;pack.disabled=false;check.disabled=false;}};
 importLabel.append(importInput);
 host.after(check,pack,importLabel);
 return {schedule,importZip};
}
