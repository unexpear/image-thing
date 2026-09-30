import {characterSetup} from './director-performance-state.js';
import {validateRig3D,hasRigAnimation} from './director-3d-state.js';

export function validateRigAsset(asset){
 if(asset.rigSetup===undefined)return;
 const setup=asset.rigSetup;
 if(!['character','set'].includes(asset.kind)||!setup||setup.format!=='studio-character'||setup.version!==1||!setup.rig)throw Error('Invalid reusable rig library entry.');
 validateRig3D(setup.rig);
 if(hasRigAnimation(setup.rig))throw Error('Library rig setups must not contain shot animation.');
 if(JSON.stringify(setup).length>2000000)throw Error('Keep each reusable rig setup under 2 MB.');
}
export function makeRigAsset(rig,name,kind='character'){
 validateRig3D(rig);
 if(typeof name!=='string'||!name.trim()||name.length>100)throw Error('Give the reusable setup a name of 1–100 characters.');
 const asset={id:crypto.randomUUID(),kind,name:name.trim(),brief:'',rigSetup:characterSetup(rig)};validateRigAsset(asset);return asset;
}
export function instantiateRigAsset(asset){validateRigAsset(asset);if(!asset.rigSetup)throw Error('Choose a saved rig setup.');return structuredClone(asset.rigSetup.rig);}
