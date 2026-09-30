const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),phase=process.argv[2]||'before';
if(!['before','after'].includes(phase))throw Error('Choose before or after.');
app.setPath('userData',path.join(root,'studio-data/director-startup-test'));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 const report=path.join(root,'reports/studio/director-startup-'+phase+'.json');
 try{
  await win.loadURL('http://127.0.0.1:8188/qwen-editor/director.html');
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const {recordCanvas}=await import('/qwen-editor/director-recorder.js'),{uploadDirectorFile}=await import('/qwen-editor/director-upload.js'),T=await import('three'),{starterCharacter,jointsOf,applyPose}=await import('/qwen-editor/director-3d-engine.js');
   let startDelay=0,startTime=0;const Native=MediaRecorder;window.MediaRecorder=class extends Native{constructor(...args){super(...args);this.addEventListener('start',()=>startDelay=(performance.now()-startTime)/1000);}start(...args){startTime=performance.now();return super.start(...args);}};
   const scene=new T.Scene();scene.background=new T.Color('#182234');scene.add(new T.HemisphereLight(0xffffff,0x555555,3));const model=starterCharacter();scene.add(model);const bones=jointsOf(model),rest=bones.map(b=>b.quaternion.clone()),pose=bones.map(()=>[0,0,0]);
   const camera=new T.PerspectiveCamera(38,16/9,.01,100);camera.position.set(2,1.8,4);camera.lookAt(0,1,0);const renderer=new T.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(960,540);
   const result=await recordCanvas({canvas:renderer.domElement,seconds:10,active:()=>true,draw:f=>{pose[3][2]=Math.sin(f/24)*80;applyPose(bones,rest,pose);scene.updateMatrixWorld(true);renderer.render(scene,camera);}});
   try{return {startDelay,file:await uploadDirectorFile(result.file),bytes:result.file.size};}finally{await result.release();renderer.dispose();window.MediaRecorder=Native;}
  })()`);
  fs.writeFileSync(report,JSON.stringify({state:'recorded',...result},null,2));
 }catch(e){fs.writeFileSync(report,JSON.stringify({state:'error',message:e.message}));}finally{app.quit();}
});
