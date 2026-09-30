import fs from 'node:fs';
import assert from 'node:assert/strict';
import {validateBytes} from '../blender/node_modules/gltf-validator/module.mjs';
const files=['output/playwright/director-starter-animated.glb','output/playwright/director-bound-test.glb','ComfyUI_windows_portable/ComfyUI/input/studio-director-test/advanced-rig-synthetic.glb','ComfyUI_windows_portable/ComfyUI/input/studio-director-test/one-hour-rig-synthetic.glb'];
for(const file of files){const bytes=fs.readFileSync(file),report=await validateBytes(new Uint8Array(bytes),{maxIssues:30});assert.equal(report.issues.numErrors,0,JSON.stringify(report.issues));console.log(JSON.stringify({file,...report.issues}));}
