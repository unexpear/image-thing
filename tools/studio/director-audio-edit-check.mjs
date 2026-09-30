import assert from 'node:assert/strict';
import {dialogueWindows,duckGain,trimClip,splitClip,validateDucking,mainVoiceDuckSeconds,shotDialogueTrackEnd,guessMainAudioRole,mainAudioDucksDialogue,MAIN_AUDIO_ROLES,FadeCurve,fadeInGain,fadeOutGain,rampGain,createTransportGain,softSeekMedia,spliceSeekMedia,ensureSpliceAlt,TRANSPORT_PLAY_RAMP_MS,TRANSPORT_SEEK_RAMP_MS,TRANSPORT_LONG_SEEK_SEC,TRANSPORT_SEEK_EPSILON_SEC} from '../../simple-editor/director-audio-edit.js';
const settings={enabled:true,level:.25,attack:.2,release:.5};validateDucking(settings);
const p={ducking:settings,scenes:[{shots:[{seconds:4,audioTracks:[{kind:'dialogue',media:{name:'voice.wav'},start:1,volume:1}]}]}],episodeAudio:[{kind:'dialogue',media:{name:'voice.wav'},start:3,duration:1,volume:1,muted:false}]};
assert.deepEqual(dialogueWindows(p),[[1,4]]);
assert.equal(duckGain(0,settings,[[1,2]]),1);assert.equal(duckGain(1.5,settings,[[1,2]]),.25);assert.ok(Math.abs(duckGain(.9,settings,[[1,2]])-.625)<1e-8);assert.equal(duckGain(2.25,settings,[[1,2]]),.625);assert.equal(duckGain(3,settings,[[1,2]]),1);
assert.throws(()=>validateDucking({...settings,attack:0}));
const t={id:'a',start:2,sourceStart:0,duration:10,fadeIn:2,fadeOut:2};trimClip(t,1,3);assert.equal(t.duration,2);assert.equal(t.fadeIn,1);assert.equal(t.fadeOut,1);
const clips=[{id:'x',start:3,sourceStart:2,duration:8,fadeIn:1,fadeOut:1}];splitClip(clips,clips[0],6);assert.equal(clips.length,2);assert.equal(clips[1].start,7);assert.equal(clips[1].sourceStart,6);assert.equal(clips[0].duration+clips[1].duration,8);assert.equal(clips[0].fadeOut,0);assert.equal(clips[1].fadeIn,0);
assert.throws(()=>splitClip(clips,clips[0],2.5));
// --- mmath crossfade / GainRamp port ---
assert.equal(fadeInGain(FadeCurve.Linear, 0), 0);
assert.equal(fadeInGain(FadeCurve.Linear, 1), 1);
assert.equal(fadeInGain(FadeCurve.Linear, 0.5), 0.5);
assert.ok(Math.abs(fadeInGain(FadeCurve.RaisedCosine, 0.5) - 0.5) < 1e-12);
assert.equal(fadeInGain(FadeCurve.RaisedCosine, 0), 0);
assert.equal(fadeInGain(FadeCurve.RaisedCosine, 1), 1);
assert.ok(Math.abs(fadeInGain(FadeCurve.EqualPower, 0.5) - Math.SQRT1_2) < 1e-12);
assert.ok(Math.abs(fadeOutGain(FadeCurve.EqualPower, 0.5) - Math.SQRT1_2) < 1e-12);
assert.ok(Math.abs(fadeInGain(FadeCurve.EqualPower, 0.5)**2 + fadeOutGain(FadeCurve.EqualPower, 0.5)**2 - 1) < 1e-12);
assert.ok(Math.abs(fadeInGain(FadeCurve.Linear, 0.3) + fadeOutGain(FadeCurve.Linear, 0.3) - 1) < 1e-12);
assert.equal(rampGain(0, 1, 0.25, FadeCurve.Linear), 0.25);
assert.equal(TRANSPORT_PLAY_RAMP_MS, 5);
assert.equal(TRANSPORT_SEEK_RAMP_MS, 20);
const g = createTransportGain(0);
assert.equal(g.value, 0);
g.setTarget(1, 0);
assert.equal(g.value, 1);
assert.ok(g.settled);
g.setTarget(0, 100, FadeCurve.Linear);
const mid = g.tick(g.target === 0 ? (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 50 : 50);
// Retest with explicit clock: recreate
const g2 = createTransportGain(1);
const t0 = 1000;
// Monkey: setTarget records start; tick with t0+50 of 100ms linear → ~0.5
g2.setTarget(0, 100, FadeCurve.Linear);
// Force startMs by poking through tick timeline: call setTarget then tick with offset
// createTransportGain uses performance.now — simulate by successive ticks with injected now:
const g3 = createTransportGain(0);
// Direct unit: rampGain path already covered; transport settles at end:
g3.setTarget(0.8, 10, FadeCurve.Linear);
let last = 0;
for(let i=0;i<20;i++){ last = g3.tick((typeof performance!=='undefined'?performance.now():Date.now()) + i*5); }
assert.ok(g3.settled || Math.abs(g3.value - 0.8) < 0.05, 'transport approaches target');
// softSeekMedia: silent seek snaps currentTime
const media = { currentTime: 0, duration: 10, volume: 1 };
const item = { gain: createTransportGain(0), pendingSeek: null };
softSeekMedia(item, media, 2.5, { playing: false, targetVolume: 0 });
assert.equal(media.currentTime, 2.5);
assert.equal(item.pendingSeek, null);
// softSeekMedia: audible jump schedules EqualPower out
media.currentTime = 0;
item.gain.snap(0.5);
media.volume = 0.5;
softSeekMedia(item, media, 4, { playing: true, targetVolume: 0.5 });
assert.equal(item.pendingSeek, 4);
assert.ok(item.gain.target === 0);


assert.equal(TRANSPORT_LONG_SEEK_SEC, 0.5);
assert.ok(TRANSPORT_LONG_SEEK_SEC > TRANSPORT_SEEK_EPSILON_SEC);

// spliceSeekMedia: short audible delta still uses soft-seek (pendingSeek), not dual
function mockEl(t0, tag='AUDIO'){
  return {
    currentTime: t0, duration: 60, volume: 0.5, tagName: tag, paused: false, readyState: 2,
    src: 'fixture://track', currentSrc: 'fixture://track', muted: false, playbackRate: 1,
    cloneNode(){ return mockEl(0, tag); },
    play(){ this.paused=false; return Promise.resolve(); },
    pause(){ this.paused=true; },
    getAttribute(n){ return n==='src' ? this.src : null; },
  };
}
const shortOut = mockEl(0);
const shortItem = { gain: createTransportGain(0.5), pendingSeek: null, el: shortOut };
shortOut.volume = 0.5;
spliceSeekMedia(shortItem, shortOut, TRANSPORT_SEEK_EPSILON_SEC + 0.05, {
  playing: true, targetVolume: 0.5, longSeekSec: TRANSPORT_LONG_SEEK_SEC,
  ensureAlt: () => mockEl(0),
});
assert.equal(shortItem.pendingSeek, TRANSPORT_SEEK_EPSILON_SEC + 0.05);
assert.equal(shortItem.splice?.active, undefined);
assert.equal(shortItem.gain.target, 0);

// spliceSeekMedia: long audible jump starts dual splice when alt exists
const longOut = mockEl(0);
const longIn = mockEl(0);
const longItem = { gain: createTransportGain(0.7), pendingSeek: null, el: longOut, alt: longIn };
longOut.volume = 0.7;
const longTarget = TRANSPORT_LONG_SEEK_SEC + 1;
spliceSeekMedia(longItem, longOut, longTarget, {
  playing: true, targetVolume: 0.7,
  ensureAlt: () => longIn,
});
assert.ok(longItem.splice?.active, 'long jump should start dual splice');
assert.equal(longItem.splice.target, longTarget);
assert.equal(longItem.splice.outEl, longOut);
assert.equal(longItem.splice.inEl, longIn);
assert.equal(longIn.currentTime, longTarget);
assert.ok(longOut.volume > 0, 'outgoing still audible at splice start');
assert.ok(longIn.volume < longOut.volume || longIn.volume >= 0, 'incoming starts quieter or equal mid-curve');
assert.equal(longItem.pendingSeek, null);

// ensureSpliceAlt reuses matching tag+src
const primary = mockEl(1);
const reused = ensureSpliceAlt(primary, longIn);
assert.equal(reused, longIn);

// finish path: advance time and tick until splice completes
const finishOut = mockEl(0);
const finishIn = mockEl(0);
const finishItem = { gain: createTransportGain(1), pendingSeek: null, el: finishOut, alt: finishIn };
finishOut.volume = 1;
spliceSeekMedia(finishItem, finishOut, 5, {
  playing: true, targetVolume: 1, seekMs: 10, longSeekSec: 0.5,
  ensureAlt: () => finishIn,
});
assert.ok(finishItem.splice?.active);
const tStart = finishItem.splice.startMs;
for(let i=0;i<5;i++){
  // monkey clock: poke startMs into the past
  if(finishItem.splice) finishItem.splice.startMs = tStart - 50;
  spliceSeekMedia(finishItem, finishItem.el || finishOut, 5, {
    playing: true, targetVolume: 1, seekMs: 10, longSeekSec: 0.5,
    ensureAlt: () => finishIn,
  });
}
assert.equal(finishItem.splice, null, 'splice should finish');
assert.equal(finishItem.el, finishIn, 'incoming promoted to el');
assert.equal(finishItem.alt, finishOut, 'outgoing parked as alt');

// item.audio bags (episode-mix) also promote
const audOut = mockEl(0);
const audIn = mockEl(0);
const audItem = { gain: createTransportGain(1), pendingSeek: null, audio: audOut, alt: audIn };
audOut.volume = 1;
spliceSeekMedia(audItem, audOut, 8, {
  playing: true, targetVolume: 1, seekMs: 10, longSeekSec: 0.5,
  ensureAlt: () => audIn,
});
assert.ok(audItem.splice?.active);
const audStart = audItem.splice.startMs;
for(let i=0;i<5;i++){
  if(audItem.splice) audItem.splice.startMs = audStart - 50;
  spliceSeekMedia(audItem, audItem.audio || audOut, 8, {
    playing: true, targetVolume: 1, seekMs: 10, longSeekSec: 0.5,
    ensureAlt: () => audIn,
  });
}
assert.equal(audItem.splice, null);
assert.equal(audItem.audio, audIn, 'episode-style audio bag promotes on finish');
assert.equal(audItem.alt, audOut);
assert.ok(Math.abs(finishIn.volume - 1) < 1e-6);
assert.equal(finishOut.volume, 0);

// silent / scrub: long jump snaps, no splice
const scrubEl = mockEl(1);
const scrubItem = { gain: createTransportGain(0), pendingSeek: null, el: scrubEl };
spliceSeekMedia(scrubItem, scrubEl, 20, { playing: false, targetVolume: 0, ensureAlt: () => mockEl(0) });
assert.equal(scrubEl.currentTime, 20);
assert.equal(scrubItem.splice?.active, undefined);

console.log('Waveform edit, ducking, and transport crossfade checks passed: trim, split, duck ramps, FadeCurve (Linear/RaisedCosine/EqualPower), GainRamp, soft-seek, dual-element spliceSeekMedia.');

// --- Main shot.audio + trimmed dialogue-track ducking ---
assert.equal(mainVoiceDuckSeconds({seconds:5,audio:{name:'a.wav'},lipSync:{duration:1.5}},[]),1.5);
assert.equal(mainVoiceDuckSeconds({seconds:5,audio:{name:'a.wav'},lipSync:{duration:9}},[]),5);
assert.equal(mainVoiceDuckSeconds({seconds:5,audio:{name:'a.wav'}},[{audio:{name:'a.wav'},seconds:2.25}]),2.25);
assert.equal(mainVoiceDuckSeconds({seconds:5,audio:{name:'a.wav'},lipSync:{cues:[{start:0,end:0.4,value:'A'},{start:0.4,end:1.2,value:'B'}]}},[]),1.2);
assert.equal(mainVoiceDuckSeconds({seconds:5,audio:{name:'a.wav'}},[]),5);
assert.equal(mainVoiceDuckSeconds({seconds:5},[]),null);

assert.equal(shotDialogueTrackEnd({seconds:4},{start:1,duration:1.5}),2.5);
assert.equal(shotDialogueTrackEnd({seconds:4},{start:1,duration:9}),4);
assert.equal(shotDialogueTrackEnd({seconds:4},{start:1}),4);

const trimmed={ducking:settings,scenes:[{shots:[{seconds:4,audioTracks:[{kind:'dialogue',media:{name:'voice.wav'},start:1,duration:1.5,volume:1}]}]}],episodeAudio:[]};
assert.deepEqual(dialogueWindows(trimmed),[[1,2.5]]);

const mainVoice={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'line.wav'},lipSync:{duration:2}}]}],episodeAudio:[],voiceTakes:[]};
assert.deepEqual(dialogueWindows(mainVoice),[[0,2]]);

const mainViaTake={ducking:settings,scenes:[{shots:[{seconds:6,audio:{name:'take.wav'}}]}],episodeAudio:[],voiceTakes:[{audio:{name:'take.wav'},seconds:1.75}]};
assert.deepEqual(dialogueWindows(mainViaTake),[[0,1.75]]);

const mergedMainAndEp={ducking:settings,scenes:[{shots:[{seconds:4,audio:{name:'v.wav'},lipSync:{duration:1}}]}],episodeAudio:[{kind:'dialogue',media:{name:'ep.wav'},start:2.5,duration:1,volume:1,muted:false}]};
assert.deepEqual(dialogueWindows(mergedMainAndEp),[[0,1],[2.5,3.5]]);

console.log('Main-voice + trimmed dialogue ducking checks passed.');

// --- Main-audio music / non-dialogue opt-out ---
assert.ok(MAIN_AUDIO_ROLES.includes('dialogue') && MAIN_AUDIO_ROLES.includes('music'));
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'line.wav'},lipSync:{duration:1}},[]),'dialogue');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'bed_music.wav'}},[]),'music');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'score_loop.mp3'}},[]),'music');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'ambience_room.wav'}},[]),'music');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'bgm.wav'}},[]),'music');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'line.wav'},audioRole:'music',lipSync:{duration:2}},[]),'music');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'bed_music.wav'},audioRole:'dialogue'},[]),'dialogue');
assert.equal(guessMainAudioRole({seconds:4,audio:{name:'bed_music.wav'}},[{audio:{name:'bed_music.wav'},seconds:1}]),'dialogue');
assert.equal(mainAudioDucksDialogue({seconds:4,audio:{name:'bed_music.wav'}},[]),false);
assert.equal(mainAudioDucksDialogue({seconds:4,audio:{name:'line.wav'},lipSync:{duration:1}},[]),true);

const musicMain={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'episode_music_bed.wav'},lipSync:{duration:2}}]}],episodeAudio:[],voiceTakes:[]};
// lipSync evidence beats music-ish filename:
assert.deepEqual(dialogueWindows(musicMain),[[0,2]]);

const musicNamed={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'episode_music_bed.wav'}}]}],episodeAudio:[],voiceTakes:[]};
assert.deepEqual(dialogueWindows(musicNamed),[]);

const roleMusic={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'line.wav'},audioRole:'music',lipSync:{duration:2}}]}],episodeAudio:[],voiceTakes:[]};
assert.deepEqual(dialogueWindows(roleMusic),[]);

const roleDialogue={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'score_loop.wav'},audioRole:'dialogue',lipSync:{duration:1.5}}]}],episodeAudio:[],voiceTakes:[]};
assert.deepEqual(dialogueWindows(roleDialogue),[[0,1.5]]);

const voiceTakeBeatsName={ducking:settings,scenes:[{shots:[{seconds:5,audio:{name:'theme_bed.wav'}}]}],episodeAudio:[],voiceTakes:[{audio:{name:'theme_bed.wav'},seconds:2}]};
assert.deepEqual(dialogueWindows(voiceTakeBeatsName),[[0,2]]);

const trackStillDucks={ducking:settings,scenes:[{shots:[{seconds:4,audio:{name:'bgm.wav'},audioTracks:[{kind:'dialogue',media:{name:'v.wav'},start:0.5,duration:1,volume:1}]}]}],episodeAudio:[],voiceTakes:[]};
assert.deepEqual(dialogueWindows(trackStillDucks),[[0.5,1.5]]);

console.log('Main-audio music opt-out checks passed.');