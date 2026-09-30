async page => {
  await page.goto('http://127.0.0.1:8188/qwen-editor.html');
  await page.waitForSelector('#edit-mask',{state:'attached'});
  return await page.evaluate(async()=>{
    const controls=await import('/qwen-editor/image-controls.js');
    await controls.setMaskSource({name:'studio-3d-test.png'});
    const NativeImage=window.Image;let release;
    window.Image=class extends NativeImage{
      async decode(){await new Promise(resolve=>release=resolve);return super.decode();}
    };
    const canvas=document.getElementById('edit-mask');
    const empty=()=>!canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v);
    const result={};
    try{
      const pending=controls.restoreReferences({masked:true,mask:{name:'studio-3d-test.png'}});
      await Promise.resolve();
      try{await controls.applyImageControls({});result.blocksDuringLoad=false;}catch(e){result.blocksDuringLoad=e.message.includes('finish loading');}
      document.getElementById('mask-clear').click();release();await pending;
      result.clearSurvivesLateLoad=empty()&&!document.getElementById('mask-enabled').checked;
      const older=controls.restoreReferences({masked:true,mask:{name:'studio-3d-test.png'}});
      await Promise.resolve();
      await controls.restoreReferences({refs:[]});release();await older;
      result.newSelectionSurvivesLateLoad=empty()&&!document.getElementById('mask-enabled').checked;
    }finally{window.Image=NativeImage;}
    await controls.restoreReferences({masked:true,mask:{name:'studio-3d-test.png'}});
    result.restoreWaitsForPixels=!empty();
    await controls.restoreReferences({masked:true});
    result.missingMaskClearsOldPixels=empty()&&document.getElementById('mask-enabled').checked;
    try{await controls.applyImageControls({});result.blocksMissingMask=false;}catch(e){result.blocksMissingMask=e.message.includes('Paint an area');}
    if(Object.values(result).some(value=>value!==true))throw Error(JSON.stringify(result));
    return result;
  });
}
