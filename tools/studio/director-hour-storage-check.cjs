// Read-only cleanup audit of the isolated synthetic capture profile.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const capture=JSON.parse(fs.readFileSync(path.join(root,'reports/studio/director-one-hour-check.json'),'utf8'));
if(capture.state!=='recorded')throw Error('Wait for the existing one-hour capture to finish before checking its profile.');
app.setPath('userData',path.join(root,'studio-data/director-one-hour-test'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
 const report=path.join(root,'reports/studio/director-hour-storage-check.json');
 try{
  await win.loadURL('http://127.0.0.1:8188/qwen-editor/director.html');
  const entries=await win.webContents.executeJavaScript(`(async()=>{const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('studio-recordings');const names=[];for await(const name of dir.keys())names.push(name);return names;})()`);
  if(entries.length)throw Error('Temporary recording files remain: '+entries.length);
  fs.writeFileSync(report,JSON.stringify({state:'passed',temporaryFiles:entries.length},null,2));
 }catch(e){fs.writeFileSync(report,JSON.stringify({state:'error',message:e.message}));}
 finally{app.quit();}
});
