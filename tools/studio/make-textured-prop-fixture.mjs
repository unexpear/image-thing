import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
// Reuse our synthetic circle image as an unmistakable texture; no personal media.
const input=await fs.readFile('reports/studio/fixtures/static-prop.glb');
const jsonLength=input.readUInt32LE(12),json=JSON.parse(input.subarray(20,20+jsonLength).toString());
const bin=input.subarray(20+jsonLength);
const png=await fs.readFile('reports/studio/fixtures/cel-recorded-middle.png');
json.images=[{uri:'data:image/png;base64,'+png.toString('base64')}];
json.textures=[{source:0}];
json.materials[0].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];
json.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};
const text=Buffer.from(JSON.stringify(json)),chunk=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(chunk);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+chunk.length+bin.length,8);header.writeUInt32LE(chunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
const output=Buffer.concat([header,chunk,bin]),report=await validateBytes(output);assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));
await fs.writeFile('reports/studio/fixtures/textured-prop.glb',output);
console.log('Validator-clean textured synthetic prop written.');
