const {app,BrowserWindow,session,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),report=path.join(root,'reports/studio/director-one-hour-check.json');
app.setPath('userData',path.join(root,'studio-data/director-one-hour-test'));
const started=new Date().toISOString();
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
 let monitor;
 try{
  await win.loadURL('http://127.0.0.1:8188/qwen-editor/director.html');
  fs.writeFileSync(report,JSON.stringify({state:'running',started,seconds:0,pid:process.pid}));
  monitor=setInterval(async()=>{try{const progress=await win.webContents.executeJavaScript('window.hourCheckProgress||{}');fs.writeFileSync(report,JSON.stringify({state:'running',started,pid:process.pid,...progress}));}catch{}},30000);
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const {recordCanvas}=await import('/qwen-editor/director-recorder.js'),{uploadDirectorFile}=await import('/qwen-editor/director-upload.js'),THREE=await import('three'),{starterCharacter,jointsOf,applyPose}=await import('/qwen-editor/director-3d-engine.js');
   const scene=new THREE.Scene();scene.background=new THREE.Color('#182234');scene.add(new THREE.HemisphereLight(0xffffff,0x555555,3));const model=starterCharacter();scene.add(model);const bones=jointsOf(model),rest=bones.map(b=>b.quaternion.clone()),pose=bones.map(()=>[0,0,0]);
   const camera=new THREE.PerspectiveCamera(38,16/9,.01,100);camera.position.set(2,1.8,4);camera.lookAt(0,1,0);const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(960,540);renderer.setPixelRatio(1);
   const result=await recordCanvas({canvas:renderer.domElement,seconds:3600,active:()=>true,draw:f=>{pose[3][2]=Math.sin(f/24)*80;applyPose(bones,rest,pose);scene.updateMatrixWorld(true);renderer.render(scene,camera);},onProgress:(seconds,total,bytes)=>window.hourCheckProgress={seconds,total,bytes}});
   try{const file=await uploadDirectorFile(result.file);return {bytes:result.file.size,file,recordedSeconds:3600,width:960,height:540};}finally{await result.release();renderer.dispose();}
  })()`);
  clearInterval(monitor);fs.writeFileSync(report,JSON.stringify({state:'recorded',started,ended:new Date().toISOString(),...result},null,2));
 }catch(e){clearInterval(monitor);fs.writeFileSync(report,JSON.stringify({state:'error',started,error:e.message}));}
 finally{app.quit();}
});
setTimeout(()=>{fs.writeFileSync(report,JSON.stringify({state:'error',started,error:'One-hour recording test timed out'}));app.exit(1);},3800000).unref();
