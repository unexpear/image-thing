/**
 * Waveform / shot-media peaks allowlists: server + client must accept
 * .mov / .mkv / .m4v the same way as mp4/webm (ffmpeg decode on the route).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const videoExts = ['.mov', '.mkv', '.m4v', '.mp4', '.webm'];

const waveform = readFileSync(
  join(root, 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/waveform.py'),
  'utf8',
);
const suffixLine = [...waveform.split(/\r?\n/)].find((l) => l.includes('path.suffix.lower()') && l.includes('Choose an audio file'));
const audioSuffixesDecl = [...waveform.split(/\r?\n/)].find((l) => l.includes('AUDIO_SUFFIXES') && l.includes('.wav'))
  || [...waveform.split(/\r?\n/)].find((l) => l.includes("'.wav'") && l.includes("'.mp3'"));
assert.ok(suffixLine || /AUDIO_SUFFIXES/.test(waveform), 'waveform.py suffix allowlist missing');
const suffixHaystack = [suffixLine, audioSuffixesDecl, waveform].filter(Boolean).join('\n');
for (const ext of videoExts) {
  assert.ok(suffixHaystack.includes(`'${ext}'`), `waveform.py missing ${ext}`);
}

const init = readFileSync(
  join(root, 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/__init__.py'),
  'utf8',
);
const mediaLine = [...init.split(/\r?\n/)].find((l) => l.includes('Unsupported shot media format'));
assert.ok(mediaLine, 'shot media format allowlist missing');
for (const ext of ['.mov', '.mkv', '.m4v', '.mp4', '.webm']) {
  assert.ok(mediaLine.includes(`'${ext}'`), `__init__.py shot media missing ${ext}`);
}

const director = readFileSync(join(root, 'simple-editor/director.js'), 'utf8');
assert.ok(
  director.includes("video/mp4,video/webm,video/quicktime,.mov,.mkv,.m4v"),
  'shot media file input accept must list mov/mkv/m4v',
);
assert.ok(
  director.includes('/\\.(png|jpe?g|webp|mp4|webm|mov|mkv|m4v)$/i'),
  'chooseOutput filter must include mov/mkv/m4v',
);
assert.ok(
  director.includes("if(shot.media && /\\.(mp4|webm|mov|mkv|m4v)$/i.test(shot.media.name||shot.media.filename||''))"),
  'trim peaks gate must match .mp4/.webm/.mov/.mkv/.m4v (single-escaped dot)',
);
assert.ok(
  !director.includes('/\\\\.(mp4|webm|mov|mkv|m4v)$/i'),
  'trim peaks gate must not double-escape the dot',
);
assert.ok(
  director.includes("/\\.(mp4|webm|mov|mkv|m4v)$/i.test(name)?'video':'img'"),
  'preview attached shot must treat m4v as video',
);

const timing = readFileSync(join(root, 'simple-editor/director-timing.js'), 'utf8');
assert.ok(
  timing.includes('/\\.(mp4|webm|mov|mkv|m4v)$/i'),
  'director-timing isVideo must include mov/mkv/m4v',
);

const animatic = readFileSync(join(root, 'simple-editor/director-animatic.js'), 'utf8');
assert.ok(
  animatic.includes("/\\.(mp4|webm|mov|mkv|m4v)$/i.test(name)?'video':'img'"),
  'animatic preview must treat m4v as video',
);

// Server PCM + programme-loudness fallback routes (browser decode/CORS gap)
assert.ok(waveform.includes("'/studio/director/pcm'") || waveform.includes('/studio/director/pcm'), 'waveform.py must register /studio/director/pcm');
assert.ok(waveform.includes("'/studio/director/programme-loudness'") || waveform.includes('/studio/director/programme-loudness'), 'waveform.py must register /studio/director/programme-loudness');
assert.ok(/loudness_args/.test(waveform), 'programme-loudness must reuse finishing.loudness_args');
assert.ok(/pcmBase64|f32le/.test(waveform), 'PCM route must expose f32le / pcmBase64');
assert.ok(/AUDIO_SUFFIXES/.test(waveform), 'shared AUDIO_SUFFIXES allowlist');
assert.ok(/X-Studio-Director/.test(waveform), 'PCM/programme routes require Director header');

const overview = readFileSync(join(root, 'simple-editor/director-audio-overview.js'), 'utf8');
assert.ok(/fetchStudioPcm/.test(overview), 'overview must fetch studio PCM fallback');
assert.ok(/fetchProgrammeLoudnessServer/.test(overview), 'overview must fetch studio programme-loudness summary');
assert.ok(/\/studio\/director\/pcm/.test(overview), 'overview must POST /studio/director/pcm');
assert.ok(/\/studio\/director\/programme-loudness/.test(overview), 'overview must POST programme-loudness');

assert.ok(/PCM_MAX_DURATION_SEC\s*=\s*180/.test(waveform), 'waveform.py PCM_MAX_DURATION_SEC must stay 180 (memory-safe)');
assert.ok(/PcmDurationCapError|pcm_duration_cap/.test(waveform), 'PCM route must refuse over-budget clips with pcm_duration_cap (never truncate)');
assert.ok(/STUDIO_PCM_MAX_DURATION_SEC\s*=\s*180/.test(overview), 'overview STUDIO_PCM_MAX_DURATION_SEC must match server 180');
assert.ok(/overPcmBudget|STUDIO_PCM_MAX_DURATION_SEC/.test(overview), 'overview must route long clips to programme-loudness');
assert.ok(/programmeSourceLabel|full file \(studio ffmpeg\)/.test(overview), 'overview must label programme source (full file vs path)');
assert.ok(/never truncated/i.test(overview), 'overview must document never-truncated long-clip path');


console.log('Waveform allowlist checks passed: server .mov/.mkv/.m4v, shot media m4v, client accept/chooseOutput/trim/preview/animatic, PCM + programme-loudness routes, 180s PCM cap -> long-clip programme-loudness.');
