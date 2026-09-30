const {app,BrowserWindow,Menu,shell,dialog,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const config=path.join(__dirname,'workspace.json');
const root=fs.existsSync(config)?JSON.parse(fs.readFileSync(config,'utf8').replace(/^\uFEFF/,'' )).root:path.resolve(__dirname,'..');
const base='http://127.0.0.1:8188';
const smoke=process.argv.includes('--smoke-test');
const profile=path.join(root,'studio-data',smoke?'desktop-smoke-profile':'desktop-profile');
fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
app.setName('Local Studio');app.setAppUserModelId('LocalStudio.Desktop');
let win,connecting=false,closing=false;
const local=url=>{try{return new URL(url).origin===base;}catch{return false;}};
async function ready(){try{const r=await fetch(base+'/system_stats',{signal:AbortSignal.timeout(2000)});const body=await r.json();return r.ok&&!!body.system;}catch{return false;}}
function backendAlive(){try{const pid=Number(fs.readFileSync(path.join(root,'logs','server.pid'),'utf8').trim());if(!Number.isSafeInteger(pid)||pid<1)return false;process.kill(pid,0);return true;}catch{return false;}}
function startBackend(){
 const cwd=path.join(root,'ComfyUI_windows_portable'),python=path.join(cwd,'python_embeded','python.exe');
 if(!fs.existsSync(python))throw Error('ComfyUI was not found in this Studio workspace.');
 const logs=path.join(root,'logs');fs.mkdirSync(logs,{recursive:true});
 const out=fs.openSync(path.join(logs,'comfy.stdout.log'),'a'),err=fs.openSync(path.join(logs,'comfy.stderr.log'),'a');
 try{const child=spawn(python,['-s','ComfyUI/main.py','--windows-standalone-build','--disable-auto-launch','--listen','127.0.0.1','--reserve-vram','1','--disable-smart-memory'],{cwd,detached:true,windowsHide:true,stdio:['ignore',out,err]});child.on('error',e=>{if(!closing)dialog.showErrorBox('Backend could not start',e.message);});if(child.pid)fs.writeFileSync(path.join(logs,'server.pid'),String(child.pid));child.unref();}finally{fs.closeSync(out);fs.closeSync(err);}
}
async function connect(){
 if(connecting||!win||win.isDestroyed())return;connecting=true;
 try{
  if(!await ready()){
   await win.loadFile(path.join(__dirname,'starting.html'));
   if(!backendAlive())startBackend();
   const deadline=Date.now()+240000;
   while(!await ready()){
    if(closing)return;
    if(Date.now()>deadline)throw Error('ComfyUI is taking longer than expected. Open the backend log from the Help menu, then use Reconnect.');
    await new Promise(resolve=>setTimeout(resolve,1500));
   }
  }
  if(!closing)await win.loadURL(base+'/qwen-editor/director.html');
 }catch(e){if(!closing){if(smoke)fs.writeFileSync(path.join(root,'reports','studio','desktop-smoke.json'),JSON.stringify({ok:false,error:e.message}));else dialog.showErrorBox('Studio connection',e.message);}}
 finally{connecting=false;}
}
async function navigate(route){if(!await ready()){await connect();return;}await win.loadURL(base+route);}
let verifying=false;
async function verifyModels(){
 if(verifying)return;
 const python=path.join(root,'ComfyUI_windows_portable','python_embeded','python.exe'),script=path.join(root,'verify_models.py');
 if(!fs.existsSync(python)||!fs.existsSync(script))return dialog.showErrorBox('Verify model files','The verification script or the bundled Python was not found in this Studio workspace.');
 const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Quick check','Full hash check','Cancel'],defaultId:0,cancelId:2,title:'Verify model files',message:'Check the installed models against their manifests?',detail:'Quick check confirms every model file is present at its recorded size, that the Qwen vision projector still pairs with its text encoder, and that every workflow resolves. It takes a moment.\n\nFull hash check also re-reads about 30 GB and recomputes every SHA-256. It takes several minutes and is the one that catches a file that went bad after it was downloaded. Finish any generation first.'});
 if(choice.response===2)return;
 verifying=true;
 const report=path.join(root,'reports','studio','model-verification.json');
 const args=[script,'--quiet','--json',report];
 if(choice.response===1)args.splice(1,0,'--full');
 win.setTitle('Local Studio · Verifying model files…');
 let output='';
 const child=spawn(python,args,{cwd:root,windowsHide:true});
 child.stdout.on('data',data=>{output+=data;});
 child.stderr.on('data',data=>{output+=data;});
 child.on('error',error=>{verifying=false;win.setTitle('Local Studio · Creative workspace');dialog.showErrorBox('Verify model files',error.message);});
 child.on('close',async code=>{
  verifying=false;win.setTitle('Local Studio · Creative workspace');
  const summary=output.trim().split('\n').filter(Boolean).pop()||'The check produced no output.';
  const passed=code===0;
  const answer=await dialog.showMessageBox(win,{type:passed?'info':'error',buttons:['Close','Open report'],defaultId:0,cancelId:0,title:'Verify model files',message:passed?'All model checks passed.':'Some model checks failed.',detail:summary+(passed?'':'\n\nOpen the report to see which files failed and what to do about each one. A file that fails its hash needs downloading again; generations made with it are unreliable.')});
  if(answer.response===1)shell.openPath(report);
 });
}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  win=new BrowserWindow({title:'Local Studio',width:1440,height:960,minWidth:800,minHeight:600,backgroundColor:'#0c1018',show:!smoke,autoHideMenuBar:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webviewTag:false}});
  win.webContents.on('will-navigate',(event,url)=>{if(!local(url))event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>{if(local(url))win.loadURL(url);return {action:'deny'};});
  win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('Local Studio · Creative workspace');});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Studio',submenu:[{label:'Cartoon Director',accelerator:'CmdOrCtrl+1',click:()=>navigate('/qwen-editor/director.html')},{label:'Images',accelerator:'CmdOrCtrl+2',click:()=>navigate('/qwen-editor.html')},{label:'Video',accelerator:'CmdOrCtrl+3',click:()=>navigate('/qwen-editor/video.html')},{label:'3D',accelerator:'CmdOrCtrl+4',click:()=>navigate('/qwen-editor/mesh.html')},{type:'separator'},{label:'Open output folder',click:()=>shell.openPath(path.join(root,'ComfyUI_windows_portable','ComfyUI','output'))},{type:'separator'},{role:'quit'}]},
   {role:'editMenu'},
   {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
   {label:'Help',submenu:[{label:'Reconnect to ComfyUI',click:connect},{label:'Verify model files…',click:verifyModels},{label:'Open backend log',click:()=>shell.openPath(path.join(root,'logs','comfy.stderr.log'))},{label:'Desktop project storage',click:()=>dialog.showMessageBox(win,{type:'info',title:'Your local projects',message:'Media is shared with your existing Studio.',detail:'This desktop app keeps its own persistent project profile. To move an existing browser episode, use Download project in the browser and Import project here. Closing this window leaves ComfyUI running so jobs can finish.'})}]}
  ]));
  await connect();
  if(smoke){
   const timeout=setTimeout(()=>{fs.writeFileSync(path.join(root,'reports','studio','desktop-smoke.json'),JSON.stringify({ok:false,error:'Desktop smoke check timed out'}));app.exit(1);},90000);
   try{if(process.argv.includes('--demo-test'))await require(path.join(root,'tools/studio/desktop-demo-check.cjs'))(win,Menu,root);const result=await win.webContents.executeJavaScript(`({director:!!document.getElementById('add-shot'),styled:!!document.querySelector('link[href*="director.css"]'),nodeUnavailable:typeof require==='undefined',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})`);const help=Menu.getApplicationMenu().items.find(item=>item.label==='Help');const verify=help&&help.submenu.items.find(item=>item.label==='Verify model files…');result.verifyMenu=!!(verify&&typeof verify.click==='function');result.verifyScript=fs.existsSync(path.join(root,'verify_models.py'));fs.writeFileSync(path.join(root,'reports','studio','desktop-smoke.json'),JSON.stringify({ok:result.director&&result.styled&&result.nodeUnavailable&&!result.overflow&&result.verifyMenu&&result.verifyScript,...result},null,2));}catch(e){fs.writeFileSync(path.join(root,'reports','studio','desktop-smoke.json'),JSON.stringify({ok:false,error:e.message}));}
   clearTimeout(timeout);app.quit();
  }
 });
 app.on('before-quit',()=>{closing=true;});
 app.on('window-all-closed',()=>app.quit());
}
