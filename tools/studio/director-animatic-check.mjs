import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {shotTimeline,shotAt,frameTime,dissolvePair,applyTransitionLayers,fadeThroughOpacities,shotStripLayout,clampOverlapDuration,transitionTypeLabel,applyStripTransitionType,STRIP_DEFAULT_TRANSITION_SEC,ANIMATIC_XFADE_CSS,circleXfadeRadiusPct} from '../../simple-editor/director-animatic.js';
import {setShotTransition,SHOT_TRANSITION_XFADE,transitionXfadeName} from '../../simple-editor/director-timing.js';
import {createTransportGain, softSeekMedia, spliceSeekMedia, ensureSpliceAlt, FadeCurve, TRANSPORT_SEEK_EPSILON_SEC, TRANSPORT_LONG_SEEK_SEC} from '../../simple-editor/director-audio-edit.js';

const entries=shotTimeline({scenes:[{title:'A',shots:[{seconds:2},{seconds:3}]},{title:'B',shots:[{seconds:4}]}]});
assert.deepEqual(entries.map(e=>[e.start,e.end]),[[0,2],[2,5],[5,9]]);
assert.equal(shotAt(entries,2),entries[1]);assert.equal(shotAt(entries,9),entries[2]);assert.equal(shotAt([],0),null);
assert.equal(frameTime(1/24),'00:00:00:01');assert.equal(frameTime(14400),'04:00:00:00');

const a={seconds:4,transition:undefined};const b={seconds:4};const c={seconds:3};
setShotTransition(a,'dissolve',1);
const dissolved=shotTimeline({scenes:[{title:'S',shots:[a,b,c]}]});
assert.deepEqual(dissolved.map(e=>[e.start,e.end,e.dissolveOut]),[[0,4,1],[3,7,0],[7,10,0]]);
assert.equal(shotAt(dissolved,3.2),dissolved[1]);
const pair=dissolvePair(dissolved,3.5);
assert.ok(pair);assert.equal(pair.outgoing,dissolved[0]);assert.equal(pair.incoming,dissolved[1]);
assert.ok(Math.abs(pair.progress-0.5)<1e-9);
assert.equal(dissolvePair(dissolved,5),null);
assert.equal(dissolved[0].transitionType,'dissolve');

const wA={seconds:4};const wB={seconds:4};
setShotTransition(wA,'wipe-left',1);
const wiped=shotTimeline({scenes:[{title:'W',shots:[wA,wB]}]});
assert.deepEqual(wiped.map(e=>[e.start,e.end,e.dissolveOut,e.transitionType]),[[0,4,1,'wipe-left'],[3,7,0,'cut']]);
const wPair=dissolvePair(wiped,3.5);
assert.ok(wPair);assert.equal(wPair.outgoing.transitionType,'wipe-left');
assert.ok(Math.abs(wPair.progress-0.5)<1e-9);

const fakeOut={style:{}};const fakeIn={style:{}};
applyTransitionLayers(fakeOut,fakeIn,'wipe-left',0.5);
// wipeleft: incoming from right -> clip left half of layerIn at mid
assert.equal(fakeIn.style.clipPath,'inset(0 0 0 50.000%)');
applyTransitionLayers(fakeOut,fakeIn,'wipe-right',0.5);
assert.equal(fakeIn.style.clipPath,'inset(0 50.000% 0 0)');
applyTransitionLayers(fakeOut,fakeIn,'wipe-up',0.5);
assert.equal(fakeIn.style.clipPath,'inset(50.000% 0 0 0)');
applyTransitionLayers(fakeOut,fakeIn,'wipe-down',0.5);
assert.equal(fakeIn.style.clipPath,'inset(0 0 50.000% 0)');
applyTransitionLayers(fakeOut,fakeIn,'slide-left',0.25);
assert.equal(fakeOut.style.transform,'translateX(-25.000%)');
assert.equal(fakeIn.style.transform,'translateX(75.000%)');
applyTransitionLayers(fakeOut,fakeIn,'slide-right',0.25);
assert.equal(fakeOut.style.transform,'translateX(25.000%)');
assert.equal(fakeIn.style.transform,'translateX(-75.000%)');
applyTransitionLayers(fakeOut,fakeIn,'slide-up',0.5);
assert.equal(fakeOut.style.transform,'translateY(-50.000%)');
assert.equal(fakeIn.style.transform,'translateY(50.000%)');
applyTransitionLayers(fakeOut,fakeIn,'slide-down',0.5);
assert.equal(fakeOut.style.transform,'translateY(50.000%)');
assert.equal(fakeIn.style.transform,'translateY(-50.000%)');
applyTransitionLayers(fakeOut,fakeIn,'circle-open',0);
assert.equal(fakeIn.style.clipPath,'circle(0.000%)');
applyTransitionLayers(fakeOut,fakeIn,'circle-open',1/3);
assert.equal(fakeIn.style.clipPath,'circle(0.000%)');
applyTransitionLayers(fakeOut,fakeIn,'circle-open',0.5);
{
 const r=circleXfadeRadiusPct(0.5,'open');
 assert.ok(Math.abs(r-50/Math.SQRT2)<1e-9);
 assert.equal(fakeIn.style.clipPath,`circle(${r.toFixed(3)}%)`);
}
applyTransitionLayers(fakeOut,fakeIn,'circle-open',1);
assert.equal(fakeIn.style.clipPath,`circle(${(100/Math.SQRT2).toFixed(3)}%)`);
applyTransitionLayers(fakeOut,fakeIn,'circle-close',0);
assert.equal(fakeOut.style.clipPath,`circle(${(100/Math.SQRT2).toFixed(3)}%)`);
assert.equal(fakeOut.style.zIndex,'3');
assert.equal(fakeIn.style.zIndex,'2');
applyTransitionLayers(fakeOut,fakeIn,'circle-close',0.5);
assert.equal(fakeOut.style.clipPath,`circle(${circleXfadeRadiusPct(0.5,'close').toFixed(3)}%)`);
applyTransitionLayers(fakeOut,fakeIn,'circle-close',1);
assert.equal(fakeOut.style.clipPath,'circle(0.000%)');
applyTransitionLayers(fakeOut,fakeIn,'dissolve',0.4);
assert.equal(fakeOut.style.opacity,'0.6');
assert.equal(fakeIn.style.opacity,'0.4');
applyTransitionLayers(fakeOut,fakeIn,'cut',null);
assert.equal(fakeOut.style.opacity,'0');
assert.equal(fakeIn.style.opacity,'1');

// Mapping table: ANIMATIC_XFADE_CSS <-> SHOT_TRANSITION_XFADE (Assemble)
assert.equal(Object.keys(ANIMATIC_XFADE_CSS).length, Object.keys(SHOT_TRANSITION_XFADE).length);
for (const [studio, spec] of Object.entries(ANIMATIC_XFADE_CSS)) {
  assert.equal(spec.xfade, SHOT_TRANSITION_XFADE[studio], studio);
  assert.equal(transitionXfadeName(studio), spec.xfade, studio);
}
assert.equal(ANIMATIC_XFADE_CSS['wipe-left'].reveal, 'right');
assert.equal(ANIMATIC_XFADE_CSS['wipe-right'].reveal, 'left');
assert.equal(ANIMATIC_XFADE_CSS['wipe-up'].reveal, 'bottom');
assert.equal(ANIMATIC_XFADE_CSS['wipe-down'].reveal, 'top');
assert.equal(ANIMATIC_XFADE_CSS['circle-open'].sense, 'open');
assert.equal(ANIMATIC_XFADE_CSS['circle-close'].sense, 'close');
assert.equal(circleXfadeRadiusPct(0,'open'), 0);
assert.equal(circleXfadeRadiusPct(1,'close'), 0);
assert.ok(Math.abs(circleXfadeRadiusPct(1,'open') - 100/Math.SQRT2) < 1e-9);

// fade-black / fade-white mid plate (ffmpeg fadeblack/fadewhite shape)
assert.equal(fadeThroughOpacities('dissolve',0.5),null);
const fb0=fadeThroughOpacities('fade-black',0);
assert.deepEqual(fb0,{out:1,plate:0,in:0,color:'#000000'});
const fbMid=fadeThroughOpacities('fade-black',0.5);
assert.deepEqual(fbMid,{out:0,plate:1,in:0,color:'#000000'});
const fb1=fadeThroughOpacities('fade-black',1);
assert.deepEqual(fb1,{out:0,plate:0,in:1,color:'#000000'});
const fwQ=fadeThroughOpacities('fade-white',0.25);
assert.ok(Math.abs(fwQ.out-0.5)<1e-9);assert.ok(Math.abs(fwQ.plate-0.5)<1e-9);assert.equal(fwQ.in,0);assert.equal(fwQ.color,'#ffffff');
const fw3=fadeThroughOpacities('fade-white',0.75);
assert.equal(fw3.out,0);assert.ok(Math.abs(fw3.plate-0.5)<1e-9);assert.ok(Math.abs(fw3.in-0.5)<1e-9);

const fakePlate={style:{},hidden:true};
applyTransitionLayers(fakeOut,fakeIn,'fade-black',0.5,fakePlate);
assert.equal(fakeOut.style.opacity,'0');
assert.equal(fakeIn.style.opacity,'0');
assert.equal(fakePlate.style.opacity,'1');
assert.equal(fakePlate.style.background,'#000000');
assert.equal(fakePlate.hidden,false);
assert.equal(fakePlate.style.zIndex,'2');
applyTransitionLayers(fakeOut,fakeIn,'fade-white',0.25,fakePlate);
assert.equal(fakeOut.style.opacity,'0.5');
assert.equal(fakeIn.style.opacity,'0');
assert.equal(fakePlate.style.opacity,'0.5');
assert.equal(fakePlate.style.background,'#ffffff');
applyTransitionLayers(fakeOut,fakeIn,'cut',null,fakePlate);
assert.equal(fakePlate.hidden,true);
assert.equal(fakePlate.style.opacity,'0');

const fA={seconds:4};const fB={seconds:4};
setShotTransition(fA,'fade-black',1);
const faded=shotTimeline({scenes:[{title:'F',shots:[fA,fB]}]});
assert.equal(faded[0].transitionType,'fade-black');
assert.equal(faded[0].dissolveOut,1);
const fPair=dissolvePair(faded,3.5);
assert.ok(fPair);assert.ok(Math.abs(fPair.progress-0.5)<1e-9);

// --- soft-seek wiring contract (shot video / voice / music) ---
const here = dirname(fileURLToPath(import.meta.url));
const animaticSrc = readFileSync(join(here, '../../simple-editor/director-animatic.js'), 'utf8');
assert.match(animaticSrc, /spliceSeekMedia/);
assert.match(animaticSrc, /ensureSpliceAlt/);
assert.match(animaticSrc, /TRANSPORT_LONG_SEEK|longSeekSec|long audible/);
assert.doesNotMatch(animaticSrc, /softSeekMedia\(/);
assert.match(animaticSrc, /createTransportGain/);
assert.match(animaticSrc, /mediaBag/);
assert.match(animaticSrc, /audioBag/);
assert.match(animaticSrc, /fadeBag/);
assert.doesNotMatch(animaticSrc, /item\.currentTime\s*=\s*win\.target/);
assert.match(animaticSrc, /forceMute/);
assert.match(animaticSrc, /animatic-plate/);
assert.match(animaticSrc, /fadeThroughOpacities/);
assert.match(animaticSrc, /layerPlate/);


// Shot-style bags: video (clip sound), voice, music track — audible jump schedules EqualPower out
function mockMedia(t0 = 0){
  return {currentTime: t0, duration: 30, volume: 1, tagName: 'VIDEO', paused: false, readyState: 2};
}
const videoBag = {el: mockMedia(0), gain: createTransportGain(0.6), pendingSeek: null, volume: 1, forceMute: false};
videoBag.el.volume = 0.6;
softSeekMedia(videoBag, videoBag.el, 5, {playing: true, targetVolume: 1});
assert.equal(videoBag.pendingSeek, 5);
assert.equal(videoBag.gain.target, 0);

const voiceBag = {el: {currentTime: 1, duration: 10, volume: 0.8, tagName: 'AUDIO', paused: false, readyState: 2}, gain: createTransportGain(0.8), pendingSeek: null, volume: 1};
softSeekMedia(voiceBag, voiceBag.el, 1 + TRANSPORT_SEEK_EPSILON_SEC + 0.2, {playing: true, targetVolume: 1});
assert.ok(voiceBag.pendingSeek != null);
assert.equal(voiceBag.gain.target, 0);

const musicBag = {element: {currentTime: 0, duration: 20, volume: 0.3, tagName: 'AUDIO', paused: false, readyState: 2}, gain: createTransportGain(0.3), pendingSeek: null, volume: 0.3};
softSeekMedia(musicBag, musicBag.element, 8, {playing: true, targetVolume: 0.3});
assert.equal(musicBag.pendingSeek, 8);

// Silent / scrub seek snaps immediately (animatic seek() pauses first)
const scrubBag = {el: mockMedia(2), gain: createTransportGain(0), pendingSeek: null, volume: 1};
softSeekMedia(scrubBag, scrubBag.el, 9, {playing: false, targetVolume: 0});
assert.equal(scrubBag.el.currentTime, 9);
assert.equal(scrubBag.pendingSeek, null);

// forceMute (attached voice replaces clip sound): volume stays 0, seek still applies
const replaced = {el: mockMedia(0), gain: createTransportGain(0), pendingSeek: null, volume: 1, forceMute: true};
softSeekMedia(replaced, replaced.el, 3, {playing: true, targetVolume: 0});
assert.equal(replaced.el.currentTime, 3);
assert.equal(replaced.pendingSeek, null);


// Dual-element long jump on shot-style bag
function mockMediaDual(t0 = 0){
  return {
    currentTime: t0, duration: 30, volume: 1, tagName: 'AUDIO', paused: false, readyState: 2,
    src: 'fixture://voice', currentSrc: 'fixture://voice', muted: false, playbackRate: 1,
    cloneNode(){ return mockMediaDual(0); },
    play(){ this.paused=false; return Promise.resolve(); },
    pause(){ this.paused=true; },
    getAttribute(n){ return n==='src' ? this.src : null; },
  };
}
const dualOut = mockMediaDual(0);
const dualIn = mockMediaDual(0);
const dualBag = { el: dualOut, gain: createTransportGain(0.9), pendingSeek: null, volume: 1, alt: dualIn };
dualOut.volume = 0.9;
spliceSeekMedia(dualBag, dualOut, TRANSPORT_LONG_SEEK_SEC + 2, {
  playing: true, targetVolume: 0.9, ensureAlt: () => dualIn,
});
assert.ok(dualBag.splice?.active);
assert.equal(dualIn.currentTime, TRANSPORT_LONG_SEEK_SEC + 2);

// Short delta still soft-seeks (no dual)
const shortBag = { el: mockMediaDual(0), gain: createTransportGain(0.5), pendingSeek: null, volume: 1 };
shortBag.el.volume = 0.5;
spliceSeekMedia(shortBag, shortBag.el, 0.25, {
  playing: true, targetVolume: 0.5, ensureAlt: () => mockMediaDual(0),
});
assert.equal(shortBag.pendingSeek, 0.25);
assert.equal(shortBag.splice?.active, undefined);

assert.equal(TRANSPORT_LONG_SEEK_SEC, 0.5);
assert.ok(ensureSpliceAlt(dualOut, dualIn) === dualIn);

assert.equal(FadeCurve.EqualPower, 'equal-power');


// --- shot strip layout + overlap duration clamp ---
const stripA={seconds:4,title:'One'}; const stripB={seconds:4,title:'Two'}; const stripC={seconds:3,title:'Three'};
setShotTransition(stripA,'dissolve',1);
setShotTransition(stripB,'wipe-left',0.5);
const stripEntries=shotTimeline({scenes:[{title:'Strip',shots:[stripA,stripB,stripC]}]});
const layout=shotStripLayout(stripEntries);
assert.equal(layout.shots.length,3);
assert.equal(layout.overlaps.length,2);
assert.equal(layout.shots[0].start,0);
assert.equal(layout.shots[0].end,4);
assert.equal(layout.overlaps[0].start,3);
assert.equal(layout.overlaps[0].end,4);
assert.equal(layout.overlaps[0].durationSec,1);
assert.equal(layout.overlaps[0].transitionType,'dissolve');
assert.equal(layout.overlaps[1].transitionType,'wipe-left');
assert.ok(Math.abs(layout.overlaps[1].durationSec-0.5)<1e-9);
assert.equal(layout.total, stripEntries.at(-1).end);
assert.deepEqual(shotStripLayout([]), {total:0, shots:[], overlaps:[], seams:[]});
assert.match(transitionTypeLabel('wipe-left'), /Wipe left/i);
assert.match(transitionTypeLabel('dissolve'), /Dissolve/i);

assert.equal(clampOverlapDuration(4,4,1),1);
assert.equal(clampOverlapDuration(4,4,0),0.1);
assert.equal(clampOverlapDuration(4,4,99),3.9);
assert.equal(clampOverlapDuration(4,1,0.5),0.5);
assert.equal(clampOverlapDuration(4,1,2),0.9);
assert.equal(clampOverlapDuration(4,4,1.24),1.2);
assert.equal(clampOverlapDuration(0.05,4,1),null);
assert.equal(clampOverlapDuration(4,4,NaN),0.1);

assert.match(animaticSrc, /shotStripLayout/);
assert.match(animaticSrc, /paintShotStrip/);
assert.match(animaticSrc, /animatic-shot-strip/);
assert.match(animaticSrc, /animatic-overlap-handle/);
assert.match(animaticSrc, /clampOverlapDuration/);
assert.match(animaticSrc, /setShotTransition/);



// --- strip transition type apply + seams ---
assert.equal(STRIP_DEFAULT_TRANSITION_SEC, 1);
{
  const a = {id:'a', seconds:4, title:'A'};
  const b = {id:'b', seconds:4, title:'B'};
  const r1 = applyStripTransitionType(a, b, 'wipe-left', 1);
  assert.equal(r1.type, 'wipe-left');
  assert.equal(r1.durationSec, 1);
  assert.equal(a.transition.type, 'wipe-left');
  const r2 = applyStripTransitionType(a, b, 'circle-open', 1);
  assert.equal(r2.type, 'circle-open');
  assert.equal(r2.durationSec, 1); // duration kept
  const r3 = applyStripTransitionType(a, b, 'cut');
  assert.equal(r3.type, 'cut');
  assert.equal(a.transition, undefined);
  // promote hard cut with default duration
  const r4 = applyStripTransitionType(a, b, 'dissolve');
  assert.equal(r4.type, 'dissolve');
  assert.equal(r4.durationSec, 1);
  // too-short pair rejects
  const short = {id:'s', seconds:0.05};
  const shortNext = {id:'n', seconds:4};
  assert.throws(() => applyStripTransitionType(short, shortNext, 'dissolve', 1), /too short/i);
}
{
  const entries = shotTimeline({scenes:[{title:'S',shots:[
    {id:'1',seconds:3,title:'One'},
    {id:'2',seconds:3,title:'Two',transition:{type:'dissolve',durationSec:1}},
    {id:'3',seconds:3,title:'Three'},
  ]}]});
  // shot0 cut->seam, shot1 dissolve->overlap, shot2 last
  const layout = shotStripLayout(entries);
  assert.equal(layout.seams.length, 1);
  assert.equal(layout.seams[0].index, 0);
  assert.equal(layout.overlaps.length, 1);
  assert.equal(layout.overlaps[0].transitionType, 'dissolve');
}
assert.match(animaticSrc, /applyStripTransitionType/);
assert.match(animaticSrc, /buildStripTransitionSelect/);
assert.match(animaticSrc, /animatic-overlap-type/);
assert.match(animaticSrc, /animatic-cut-seam/);
assert.match(animaticSrc, /layout\.seams/);

console.log('Timeline checks passed: cumulative timing, cut/end boundaries, dissolve/wipe/slide/circle/fade-through overlap, dissolvePair, fadeThroughOpacities mid plate, applyTransitionLayers wipe/slide/circle ffmpeg parity + ANIMATIC_XFADE_CSS mapping table, shotStripLayout + overlap clamp/handles + strip transition type picker/seams, empty sequence and 24 fps timecode; soft-seek + dual-element splice for long jumps wired for shot video/voice/music.');
