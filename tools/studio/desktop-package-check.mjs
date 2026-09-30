import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const packaged=path.join(root,'desktop/dist/Local Studio/resources/app');
const checks=[];
for(const name of ['main.cjs','starting.html','package.json']){
 const source=await readFile(path.join(root,'desktop',name));
 assert.ok(source.equals(await readFile(path.join(packaged,name))),`Packaged ${name} is stale`);
 checks.push(`Packaged ${name} matches source`);
}
const config=JSON.parse((await readFile(path.join(packaged,'workspace.json'),'utf8')).replace(/^\uFEFF/,''));
assert.equal(path.resolve(config.root).toLowerCase(),path.resolve(root).toLowerCase());
const files=(await readdir(path.join(root,'simple-editor'))).filter(name=>/^director.*\.(js|css|html)$/.test(name));
for(const name of files){
 const response=await fetch(`http://127.0.0.1:8188/qwen-editor/${name}`,{signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,200,`Cannot serve ${name}`);
 const served=Buffer.from(await response.arrayBuffer());
 assert.ok(served.equals(await readFile(path.join(root,'simple-editor',name))),`Served ${name} is stale`);
}
checks.push(`${files.length} Director files served byte-identical to source`);
const report={ok:true,checked:new Date().toISOString(),checks,limits:'Packaging and HTTP delivery only. Does not launch or verify native menus, desktop rendering, recording, storage or GPU behavior.'};
await writeFile(path.join(root,'reports/studio/desktop-package-check.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
