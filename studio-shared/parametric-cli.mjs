// Fixed headless entry point for managed parametric_mesh jobs.
// Usage: node parametric-cli.mjs --job ID --staging DIR --params-file JSON
// Params: {recipe, recipe_params}. Writes parametric.glb, recipe.json,
// statistics.json; validates the GLB when --validator is given; writes
// outputs.json. No browser, DOM, WebGL, or network.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { build, statistics, toGlb, GENERATOR_VERSION } from './parametric-core.mjs';

function args() {
  const out = {};
  let key = null;
  for (const tok of process.argv.slice(2)) {
    if (tok === '--') continue;
    if (tok.startsWith('--')) { key = tok.slice(2).replace(/-/g, '_'); out[key] = true; }
    else if (key) { out[key] = tok; key = null; }
  }
  return out;
}

const a = args();
const staging = a.staging;
const params = JSON.parse(readFileSync(a.params_file, 'utf8'));
const { recipe, recipe_params } = params;
if (typeof recipe !== 'string') throw new Error('recipe (id) required');

const { geometry, material, resolvedParams } = build(recipe, recipe_params || {});
const glb = toGlb(geometry, material);
writeFileSync(`${staging}/parametric.glb`, glb);
const recipeDoc = { recipe, schema_version: 1, generator: `studio-parametric-core ${GENERATOR_VERSION}`,
  units: 'metres', params: resolvedParams, material };
writeFileSync(`${staging}/recipe.json`, JSON.stringify(recipeDoc, null, 1));
const stats = statistics(geometry);
writeFileSync(`${staging}/statistics.json`, JSON.stringify(stats, null, 1));

let validation = 'unvalidated';
if (a.validator && a.node) {
  const vrep = `${staging}/validation.json`;
  const r = spawnSync(a.node, [a.validator, '--in', `${staging}/parametric.glb`, '--json', vrep], { timeout: 120000 });
  const vdoc = JSON.parse(readFileSync(vrep, 'utf8'));
  validation = vdoc.verdict;
  if (r.status !== 0 || vdoc.verdict !== 'pass')
    throw new Error(`parametric output validation failed: ${JSON.stringify(vdoc.findings)}`);
}
writeFileSync(`${staging}/outputs.json`, JSON.stringify(
  { files: ['parametric.glb', 'recipe.json', 'statistics.json'], validation: validation === 'pass' ? 'pass' : 'failed' }));
console.log(JSON.stringify({ recipe, stats, validation }));
