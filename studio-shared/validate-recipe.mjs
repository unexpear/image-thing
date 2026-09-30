// Admission-time recipe validation (fixed entry point, JSON over stdio).
// Usage: node validate-recipe.mjs <params-file>; exits 0 + resolved recipe
// on stdout, nonzero + message on stderr when invalid.
import { readFileSync } from 'node:fs';
import { build, statistics, RECIPES, GENERATOR_VERSION } from './parametric-core.mjs';

const params = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!RECIPES[params.recipe_id]) {
  console.error(`unknown recipe ${params.recipe_id}`);
  process.exit(2);
}
try {
  const { resolvedParams, material } = build(params.recipe_id, params.parameters || {});
  console.log(JSON.stringify({ recipe_id: params.recipe_id,
    generator: GENERATOR_VERSION, resolvedParams, material,
    stats: statistics(build(params.recipe_id, params.parameters || {}).geometry) }));
} catch (e) {
  console.error(String(e.message || e));
  process.exit(2);
}
