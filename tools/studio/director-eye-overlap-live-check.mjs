import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sampleRig3D,sampleChannel,validateRig3D} from '../../simple-editor/director-3d-state.js';
const read=async name=>JSON.parse((await fs.readFile('reports/studio/fixtures/'+name,'utf8')).replace(/^\uFEFF/,''));
const before=(await read('continuous-composite-project.json')).scenes[0].shots[0],after=(await read('continuous-eye-overlap-project.json')).scenes[0].shots[0];
const a=before.rig3d,b=after.rig3d;validateRig3D(b);
const nonLids=r=>({...r,channels:r.channels.filter(c=>!['face:0','face:1'].includes(c.id))});
assert.deepEqual(nonLids(a),nonLids(b));assert.deepEqual(before.drawing,after.drawing);
for(let f=0;f<192;f++){
 assert.deepEqual(sampleRig3D(a,f),sampleRig3D(b,f));
 assert.deepEqual(sampleChannel(a,f,'root',[0,0,0]),sampleChannel(b,f,'root',[0,0,0]));
 const previous=sampleChannel(a,f,'face',a.face),next=sampleChannel(b,f,'face',b.face);
 assert.deepEqual(previous.slice(2),next.slice(2));if(f<=52||f>=96)assert.deepEqual(previous,next);
}
assert.deepEqual(sampleChannel(b,72,'face',b.face).slice(0,2),[.6,.12]);
assert.equal(b.channels.find(c=>c.id==='face:0').keys.find(k=>k.frame===64).kind,'breakdown');
assert.equal(b.channels.find(c=>c.id==='face:0').keys.find(k=>k.frame===88).kind,'extreme');
assert.deepEqual(b.channels.find(c=>c.id==='face:1').keys.filter(k=>k.frame>47&&k.frame<96).map(k=>k.frame),[58,70,90]);
assert.notEqual(before.media.name,after.media.name);
console.log('Continuous eye acting: 192 body/root frames unchanged, gaze/fingers/contacts/props/drawing unchanged; only hesitation eyelids changed, existing blinks retained, labels and retimed right-lid keys saved.');
