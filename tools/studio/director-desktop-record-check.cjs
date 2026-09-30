const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/studio/director-desktop-record-check.json');
app.setPath('userData',path.join(root,'studio-data/director-record-test'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
 try{
  await win.loadURL('http://127.0.0.1:8188/qwen-editor/director.html');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const {recordCanvas}=await import('/qwen-editor/director-recorder.js');
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
   const result=await recordCanvas({canvas,seconds:1,active:()=>true,draw:f=>{ctx.fillStyle=f%2?'red':'blue';ctx.fillRect(0,0,320,180);}});
   const bytes=result.file.size;await result.release();
   document.getElementById('add-shot').click();document.querySelector('.rig3d-controls').open=true;
   const deadline=Date.now()+15000;while(!document.querySelector('[aria-label="3D joint"]')?.options.length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
   return {diskRecording:bytes>0,bytes,joints:document.querySelector('[aria-label="3D joint"]')?.options.length,nodeUnavailable:typeof require==='undefined'};
  })()`);
  fs.writeFileSync(report,JSON.stringify(result,null,2));
 }catch(e){fs.writeFileSync(report,JSON.stringify({error:e.message}));}
 finally{app.quit();}
});
setTimeout(()=>{fs.writeFileSync(report,JSON.stringify({error:'Desktop test timed out'}));app.exit(1);},30000).unref();
