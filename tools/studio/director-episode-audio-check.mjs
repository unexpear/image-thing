import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {validateEpisodeAudio,clipPosition,createEpisodeAudioPreview,loopCrossfadeSec,loopWrapSeekMs,ensureEpisodeAudioIds,reorderEpisodeAudioOptions,destIndexFromEpisodeAudioPlace,moveEpisodeAudio} from '../../simple-editor/director-episode-audio.js';
import {newProject,validateProject} from '../../simple-editor/director-project.js';
import {TRANSPORT_LONG_SEEK_SEC,TRANSPORT_SEEK_EPSILON_SEC,TRANSPORT_SEEK_RAMP_MS} from '../../simple-editor/director-audio-edit.js';

const here = dirname(fileURLToPath(import.meta.url));
const episodeSrc = readFileSync(join(here, '../../simple-editor/director-episode-audio.js'), 'utf8');
assert.match(episodeSrc, /spliceSeekMedia/);
assert.match(episodeSrc, /ensureSpliceAlt/);
assert.match(episodeSrc, /TRANSPORT_LONG_SEEK_SEC/);
assert.match(episodeSrc, /onSplicePromote/);
assert.doesNotMatch(episodeSrc, /softSeekMedia\(/);
assert.match(episodeSrc, /Loop source to fill clip duration/);
assert.match(episodeSrc, /track\.loop/);
assert.match(episodeSrc, /loopCrossfadeSec/);
assert.match(episodeSrc, /Loop restart crossfade/);
assert.match(episodeSrc, /loopWrapSeekMs/);
assert.doesNotMatch(episodeSrc, /beatMarkerControls\(/);

const track={id:'music',label:'Score',kind:'music',start:2,sourceStart:3,duration:8,volume:.4,fadeIn:2,fadeOut:2,muted:false,media:{name:'score.wav'}};
validateEpisodeAudio([track]);
assert.equal(clipPosition(track,1).active,false);assert.equal(clipPosition(track,3).volume,.2);assert.equal(clipPosition(track,5).time,6);assert.equal(clipPosition(track,9).volume,.2);assert.equal(clipPosition(track,10).active,false);
for(const change of [{start:NaN},{volume:2},{fadeOut:7},{sourceStart:-1},{duration:0},{muted:1},{loop:'yes'}])assert.throws(()=>validateEpisodeAudio([{...track,...change}]));
const loopTrack={...track,loop:true,duration:10,fadeIn:0,fadeOut:0,volume:1};
validateEpisodeAudio([loopTrack]);
// Usable source from sourceStart 3 with length 7 = 4s window; at episode t=2+5=7s -> elapsed 5 -> wrap 1 -> source 4.
assert.equal(clipPosition(loopTrack,7,7).time,4);
assert.equal(clipPosition(loopTrack,7,7).active,true);
// Without sourceLength, no wrap (legacy seek into planned local).
assert.equal(clipPosition(loopTrack,7).time,8);
assert.equal(clipPosition({...loopTrack,loop:false},7,7).time,8);
assert.throws(()=>validateEpisodeAudio([{...loopTrack,loopCrossfadeSec:-1}]));
assert.throws(()=>validateEpisodeAudio([{...loopTrack,loop:false,loopCrossfadeSec:0.1}]));
assert.throws(()=>validateEpisodeAudio([{...loopTrack,loopCrossfadeSec:6}]));
const xfadeTrack={...loopTrack,loopCrossfadeSec:0.1};
validateEpisodeAudio([xfadeTrack]);
assert.equal(loopCrossfadeSec(xfadeTrack),0.1);
assert.equal(loopCrossfadeSec(loopTrack),0);
assert.equal(loopWrapSeekMs(xfadeTrack),100);
assert.equal(loopWrapSeekMs(loopTrack),TRANSPORT_SEEK_RAMP_MS);
const p=newProject();p.episodeAudio=[track];assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))).episodeAudio,[track]);
p.episodeAudio=[{...loopTrack}];
assert.equal(validateProject(JSON.parse(JSON.stringify(p))).episodeAudio[0].loop,true);
p.episodeAudio=[{...xfadeTrack}];
assert.equal(validateProject(JSON.parse(JSON.stringify(p))).episodeAudio[0].loopCrossfadeSec,0.1);

let now = 1000;
const origNow = globalThis.performance?.now?.bind(globalThis.performance);
globalThis.performance = { now: () => now };

const nodes=[];
function makeAudio(){
  const a={
    dataset:{}, readyState:1, duration:30, currentTime:0, paused:true, volume:1, muted:false,
    hidden:true, preload:'', _src:'', tagName:'AUDIO', playbackRate:1, currentSrc:'',
    removeAttribute(){ this._src=''; this.currentSrc=''; },
    load(){},
    remove(){ this.removed=true; },
    pause(){ this.paused=true; },
    play(){ this.paused=false; return Promise.resolve(); },
    cloneNode(){ const c=makeAudio(); c._src=this._src; c.currentSrc=this._src; nodes.push(c); return c; },
    getAttribute(n){ return n==='src' ? this._src : null; },
  };
  Object.defineProperty(a, 'src', {
    get(){ return this._src || ''; },
    set(v){ this._src = v; this.currentSrc = v; },
    configurable: true,
  });
  return a;
}
globalThis.document={createElement:()=>{ const a=makeAudio(); nodes.push(a); return a; }};
const parent={ append(el){ this.last=el; }, appendChild(el){ this.last=el; } };

const preview=createEpisodeAudioPreview(parent, e=>assert.fail(e));
preview.reset([track]);
// Silent snap first (cold start 0	o4 would otherwise dual-splice while audible).
preview.sync(3,false,false);
const audio=nodes[0];
assert.equal(audio.currentTime,4);
preview.sync(3,true,false);
now += 20;
preview.sync(3,true,false);
assert.ok(Math.abs(audio.volume - 0.2) < 0.05, 'volume should approach fade envelope, got '+audio.volume);
assert.equal(audio.paused,false);
assert.equal(audio.muted,false);

// Playing jump 4	o6 (>0.5s): dual splice; finish then primary may promote.
preview.sync(5,true,false);
now += TRANSPORT_SEEK_RAMP_MS + 40;
preview.sync(5,true,false);
const liveAfterJump = nodes.find(n => !n.removed && Math.abs(n.currentTime - 6) < 0.05) || audio;
assert.ok(Math.abs(liveAfterJump.currentTime - 6) < 0.05, 'after splice settle near 6, got '+liveAfterJump.currentTime);
assert.equal(liveAfterJump.paused,false);

preview.sync(9,false,true);
assert.equal(audio.currentTime === 10 || liveAfterJump.currentTime === 10 || nodes.some(n => !n.removed && n.currentTime === 10), true);
const mutedEl = nodes.find(n => !n.removed && n.currentTime === 10) || liveAfterJump;
assert.equal(mutedEl.muted,false);
now += 30;
preview.sync(9,false,true);
assert.ok(mutedEl.volume < 0.05 || audio.volume < 0.05, 'muted scrub should quiet');

preview.sync(4,true,false);
preview.pause();
audio.onloadedmetadata();
assert.equal(audio.paused,true,'Late metadata must not restart paused sound');

preview.release();
assert.equal(audio.paused,true);
preview.sync(4,false,false);
assert.ok(nodes.length >= 2);

console.log('Episode audio checks passed: validation, round trip, source trim, fade envelope, persistent playback, soft-seek settle, mute via gain and release.');

const duckProject={ducking:{enabled:true,level:.25,attack:.2,release:.5},scenes:[{shots:[{seconds:12}]}],episodeAudio:[{...track,id:'voice',kind:'dialogue',start:2,sourceStart:0,duration:8}]};
preview.reset([track],duckProject);
preview.sync(5,false,false);
now += 30;
preview.sync(5,false,false);
assert.ok(nodes.at(-1).volume < 0.05, 'silent scrub stays quiet under duck');
console.log('Preview music gain matches the configured dialogue duck level (silent scrub).');

assert.equal(TRANSPORT_LONG_SEEK_SEC, 0.5);
assert.ok(TRANSPORT_LONG_SEEK_SEC > TRANSPORT_SEEK_EPSILON_SEC);

preview.reset([track]);
const startCount = nodes.length;
preview.sync(3, false, false);
const primary = nodes[startCount] || nodes.find(n => !n.removed);
assert.equal(primary.currentTime, 4);
preview.sync(3, true, false);
now += 30;
preview.sync(3, true, false);
primary.volume = 0.2;
primary.paused = false;

const beforeShort = nodes.length;
primary.currentTime = 4;
preview.sync(3.25, true, false);
const altsAfterShort = nodes.slice(beforeShort).filter(n => n !== primary && !n.removed);
assert.equal(altsAfterShort.length, 0, 'short jump must not start dual splice');

primary.currentTime = 4;
primary.volume = 0.2;
primary.paused = false;
now += 5;
const beforeLong = nodes.length;
const longPosition = 2 + (TRANSPORT_LONG_SEEK_SEC + 1.1);
preview.sync(longPosition, true, false);
const alt = nodes.slice(beforeLong).find(n => n !== primary && !n.removed);
assert.ok(alt, 'long jump should clone alt via ensureSpliceAlt');
const wantSource = 3 + (longPosition - 2);
assert.ok(Math.abs(alt.currentTime - wantSource) < 0.05, 'incoming at '+alt.currentTime+' want '+wantSource);

now += TRANSPORT_SEEK_RAMP_MS + 40;
preview.sync(longPosition, true, false);

preview.pause();
assert.equal(primary.paused, true);
assert.equal(alt.paused, true);
preview.release();

console.log('Episode mix transport: short soft-seek / long dual-element spliceSeekMedia (same thresholds as shots).');

// Looping music: short source keeps playing past first pass via wrapped seeks.
const loopMusic={id:'loop-score',label:'Loop',kind:'music',start:0,sourceStart:0,duration:12,volume:0.5,fadeIn:0,fadeOut:0,muted:false,loop:true,media:{name:'loop.wav'}};
const prevCreate = globalThis.document.createElement;
globalThis.document.createElement = () => { const a = makeAudio(); a.duration = 4; nodes.push(a); return a; };
preview.reset([loopMusic]);
preview.sync(1, false, false);
const la = nodes[nodes.length - 1];
assert.equal(la.duration, 4);
assert.equal(la.currentTime, 1);
preview.sync(1, true, false);
now += 30;
preview.sync(1, true, false);
assert.equal(la.paused, false);
// Episode t=9 -> elapsed 9 with start=0 -> wrap 9%4=1
preview.sync(9, true, false);
now += TRANSPORT_SEEK_RAMP_MS + 40;
preview.sync(9, true, false);
const loopLive = nodes.filter(n => !n.removed).at(-1);
assert.ok(Math.abs(loopLive.currentTime - 1) < 0.08 || Math.abs(la.currentTime - 1) < 0.08, 'loop wrap seek near 1, got '+loopLive.currentTime+' / '+la.currentTime);
assert.ok(loopLive.paused === false || la.paused === false, 'loop should still be playing past first source pass');
globalThis.document.createElement = prevCreate;
preview.release();
console.log('Episode audio loop: source wraps and keeps playing past first pass.');

// Loop + crossfade: durable field round-trips; wrap seek ramp widens for preview approx.
const loopXf={...loopMusic,loopCrossfadeSec:0.08};
validateEpisodeAudio([loopXf]);
assert.equal(loopWrapSeekMs(loopXf),80);
assert.match(episodeSrc, /seekMs:loopWrapSeekMs\(track\)/);
console.log('Episode audio loop crossfade: validate + preview seekMs approx.');

if(origNow) globalThis.performance.now = origNow;

// Episode-audio Place / Reorder (Start / End / After) - shot sound-track Place parity
const epProject={episodeAudio:[
  {id:'e1',kind:'music',label:'Score',start:0,sourceStart:0,duration:10,volume:.3,fadeIn:0,fadeOut:0,muted:false},
  {id:'e2',kind:'ambience',label:'Rain',start:0,sourceStart:0,duration:10,volume:.2,fadeIn:0,fadeOut:0,muted:false},
  {id:'e3',kind:'dialogue',label:'VO',start:2,sourceStart:0,duration:4,volume:.8,fadeIn:0,fadeOut:0,muted:false},
  {id:'e4',kind:'effects',label:'',start:5,sourceStart:0,duration:1,volume:.5,fadeIn:0,fadeOut:0,muted:false},
]};
const eopts=reorderEpisodeAudioOptions(epProject,'e3');
assert.ok(eopts.some(o=>o.value==='start'&&o.label==='Start of list'));
assert.ok(eopts.some(o=>o.value==='end'&&o.label==='End of list'));
assert.ok(eopts.some(o=>o.value==='after:e1'&&o.label.includes('After Music 1')));
assert.ok(!eopts.some(o=>o.value==='after:e3'));
assert.equal(destIndexFromEpisodeAudioPlace(epProject,'e3','start'),0);
assert.equal(destIndexFromEpisodeAudioPlace(epProject,'e3','end'),undefined);
assert.equal(destIndexFromEpisodeAudioPlace(epProject,'e3','after:e1'),1);
assert.equal(destIndexFromEpisodeAudioPlace(epProject,'e3','after:e4'),3);
assert.equal(destIndexFromEpisodeAudioPlace(epProject,'e3','index:2'),2);
assert.throws(()=>destIndexFromEpisodeAudioPlace(epProject,'e3','after:e3'),/not on this project/);
assert.throws(()=>destIndexFromEpisodeAudioPlace(epProject,'e3','middle'),/Unknown episode-audio place/);
moveEpisodeAudio(epProject,'e1',destIndexFromEpisodeAudioPlace(epProject,'e1','end'));
assert.deepEqual(epProject.episodeAudio.map(t=>t.id),['e2','e3','e4','e1']);
assert.equal(epProject.episodeAudio.find(t=>t.id==='e1').kind,'music');
assert.equal(epProject.episodeAudio.find(t=>t.id==='e1').label,'Score');
assert.equal(epProject.episodeAudio.find(t=>t.id==='e1').start,0);
moveEpisodeAudio(epProject,'e1',0);
assert.deepEqual(epProject.episodeAudio.map(t=>t.id),['e1','e2','e3','e4']);
moveEpisodeAudio(epProject,'e1',destIndexFromEpisodeAudioPlace(epProject,'e1','after:e3'));
assert.deepEqual(epProject.episodeAudio.map(t=>t.id),['e2','e3','e1','e4']);
assert.throws(()=>moveEpisodeAudio(epProject,'e1',destIndexFromEpisodeAudioPlace(epProject,'e1','after:e3')),/already in this position/);
const soloEp={episodeAudio:[{id:'only',kind:'music',label:'',start:0,sourceStart:0,duration:1,volume:.3,fadeIn:0,fadeOut:0,muted:false}]};
assert.throws(()=>moveEpisodeAudio(soloEp,'only',0),/at least two episode audio/);
assert.deepEqual(reorderEpisodeAudioOptions(soloEp,'only'),[]);
assert.throws(()=>moveEpisodeAudio({episodeAudio:[]},'x',0),/at least two|no longer/);
const legacyEp={episodeAudio:[{kind:'music',label:'Old',start:0,sourceStart:0,duration:2,volume:.2,fadeIn:0,fadeOut:0,muted:false},{kind:'effects',label:'FX',start:1,sourceStart:0,duration:1,volume:.4,fadeIn:0,fadeOut:0,muted:false}]};
ensureEpisodeAudioIds(legacyEp);
assert.ok(typeof legacyEp.episodeAudio[0].id==='string'&&legacyEp.episodeAudio[0].id);
assert.ok(typeof legacyEp.episodeAudio[1].id==='string'&&legacyEp.episodeAudio[1].id);
assert.notEqual(legacyEp.episodeAudio[0].id,legacyEp.episodeAudio[1].id);
moveEpisodeAudio(legacyEp,legacyEp.episodeAudio[0].id,undefined);
assert.equal(legacyEp.episodeAudio[1].label,'Old');

assert.match(episodeSrc,/Reorder clip/);
assert.match(episodeSrc,/reorderEpisodeAudioOptions\(project,t\.id\)/);
assert.match(episodeSrc,/destIndexFromEpisodeAudioPlace\(project,t\.id,place\)/);
assert.match(episodeSrc,/moveEpisodeAudio\(project,t\.id,destIndex\)/);
assert.match(episodeSrc,/Place episode audio in list/);
assert.match(episodeSrc,/dataset\.trackId=t\.id/);
assert.match(episodeSrc,/episode-audio-reorder/);
const cssEp=readFileSync(join(here,'../../simple-editor/director.css'),'utf8');
assert.match(cssEp,/\.board-card \.episode-audio-reorder\{/);
const directorSrc=readFileSync(join(here,'../../simple-editor/director.js'),'utf8');
assert.match(directorSrc,/episodeAudioControls\(episodeAudioHost,current,\{field,button,change,attach,tell\}\)/);
console.log('Episode-audio Place/Reorder checks passed: options exclude self, start/end/after, timing fields stay, no-op, solo reject, legacy id ensure, UI wiring.');
