#!/usr/bin/env node
/**
 * Run core Cartoon Director unit checks from the studio root.
 * Requires `npm install` once so `three` resolves from tools/studio-three/package.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const three = join(root, 'node_modules', 'three', 'package.json');
if (!existsSync(three)) {
  console.error('Missing node_modules/three. From the studio root run: npm install');
  process.exit(2);
}

const checks = [
  'director-planning-check.mjs',
  'director-project-check.mjs',
  'director-assistant-drafts-check.mjs',
  'director-voice-takes-check.mjs',
  'director-lipsync-check.mjs',
  'director-production-check.mjs',
  'director-revisions-check.mjs',
  'director-delivery-check.mjs',
  'director-animatic-check.mjs',
  'director-episode-audio-check.mjs',
  'director-audio-edit-check.mjs',
  'director-audio-overview-check.mjs',
  'director-beat-markers-check.mjs',
  'director-title-styles-check.mjs',
  'director-audio-meter-check.mjs',
  'director-waveform-check.mjs',
  'director-timing-check.mjs',
  'director-features-check.mjs',
  'director-performance-check.mjs',
  'director-set-kit-check.mjs',
  'director-library-prop-check.mjs',
  'director-library-link-recover-check.mjs',
  'director-prop-placement-check.mjs',
  'director-room-check.mjs',
  'director-motion-check.mjs',
  'director-motion-review-check.mjs',
  'director-facial-acting-check.mjs',
  'director-grip-target-check.mjs',
  'director-camera-check.mjs',
  'director-acting-copy-check.mjs',
  'director-drawing-check.mjs',
  'director-cels-check.mjs',
  'director-parent-drawing-check.mjs',
  'director-screen-drawing-check.mjs',
];

let failed = 0;
for (const name of checks) {
  const script = join(root, 'tools', 'studio', name);
  process.stdout.write(`\n=== ${name} ===\n`);
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: process.env });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failed += 1;
    console.error(`${name} FAILED (exit ${result.status})`);
  } else {
    console.log(`${name} PASS`);
  }
}
console.log(`\nDone: ${checks.length - failed} PASS / ${failed} FAIL`);
process.exit(failed ? 1 : 0);
