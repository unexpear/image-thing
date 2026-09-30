import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {
  ACTION_SAFE_INSET,
  TITLE_SAFE_INSET,
  TITLE_STYLE_CAP,
  BUILTIN_TITLE_STYLES,
  validatePreviewGuides,
  validateTitleStyles,
  validateTitleOverlay,
  validateTitleProject,
  validateShotTitleOverlay,
  ensurePreviewGuides,
  setSafeAreaGuides,
  safeAreaGuidesOn,
  safeAreaInsets,
  listTitleStyles,
  findTitleStyle,
  resolveTitleStyle,
  titleOverlayText,
  resolveTitleBurn,
  withTitleBurns,
  setTitleOverlay,
  clearTitleOverlay,
  clearableTitleOverlayCount,
  shotHasTitleOverlay,
  listTitleOverlaySources,
  copyTitleOverlayFromShot,
  addTitleStyle,
  removeTitleStyle,
  countTitleStyleLinkedShots,
  removeTitleStyleConfirmMessage,
  placementBox,
  applyTitleOverlayStyle,
} from '../../simple-editor/director-title-styles.js';
import {newProject, validateProject} from '../../simple-editor/director-project.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

// --- Source wiring ---
const projectSrc = readFileSync(join(root, 'simple-editor/director-project.js'), 'utf8');
assert.match(projectSrc, /validateTitleProject/);
assert.match(projectSrc, /director-title-styles/);

const productionSrc = readFileSync(join(root, 'simple-editor/director-production.js'), 'utf8');
assert.match(productionSrc, /validateShotTitleOverlay|validateTitleOverlay/);
assert.match(productionSrc, /titleOverlayControls/);

const animaticSrc = readFileSync(join(root, 'simple-editor/director-animatic.js'), 'utf8');
assert.match(animaticSrc, /mountSafeAreaGuides/);
assert.match(animaticSrc, /paintTitleOverlay/);
assert.match(animaticSrc, /safeAreaGuideControls/);
assert.match(animaticSrc, /safeAreaGuidesOn/);

const deliverySrc = readFileSync(join(root, 'simple-editor/director-delivery.js'), 'utf8');
assert.match(deliverySrc, /safeAreaGuideControls|titleOverlay|safe-area/);

const directorSrc = readFileSync(join(root, 'simple-editor/director.js'), 'utf8');
assert.match(directorSrc, /safeAreaGuideControls|director-title-styles/);
assert.match(directorSrc, /withTitleBurns|burnTitles/);
assert.match(directorSrc, /Burn titles into export/);

const cssSrc = readFileSync(join(root, 'simple-editor/director.css'), 'utf8');
assert.match(cssSrc, /safe-area-guides/);
assert.match(cssSrc, /safe-area-action/);
assert.match(cssSrc, /title-overlay/);

const deploySrc = readFileSync(join(root, 'Deploy-Editor.ps1'), 'utf8');
assert.match(deploySrc, /director-title-styles\.js/);

const runnerSrc = readFileSync(join(root, 'tools/studio/run-director-checks.mjs'), 'utf8');
assert.match(runnerSrc, /director-title-styles-check\.mjs/);

// --- Insets ---
assert.equal(ACTION_SAFE_INSET, 0.05);
assert.equal(TITLE_SAFE_INSET, 0.10);
assert.deepEqual(safeAreaInsets(), {action: 5, title: 10});

// --- Preview guides validate ---
validatePreviewGuides(undefined);
validatePreviewGuides({});
validatePreviewGuides({safeArea: true});
assert.throws(() => validatePreviewGuides({safeArea: 'yes'}), /true or false/);
assert.throws(() => validatePreviewGuides({safeArea: true, extra: 1}), /Unknown/);

const p = newProject();
assert.equal(safeAreaGuidesOn(p), false);
setSafeAreaGuides(p, true);
assert.equal(p.previewGuides.safeArea, true);
assert.equal(safeAreaGuidesOn(p), true);
setSafeAreaGuides(p, false);
assert.equal(p.previewGuides, undefined);
ensurePreviewGuides(p);
assert.ok(p.previewGuides);

// --- Builtin styles ---
assert.equal(BUILTIN_TITLE_STYLES.length, 3);
assert.ok(BUILTIN_TITLE_STYLES.every(s => s.id.startsWith('builtin-')));
assert.equal(listTitleStyles(p).length, 3);

// --- Title styles validate ---
validateTitleStyles(undefined);
validateTitleStyles([]);
assert.throws(() => validateTitleStyles({}), /list/);
assert.throws(() => validateTitleStyles([{id: 'builtin-title-card', name: 'X', role: 'title-card', fontSize: 'lg', fontWeight: 'bold', align: 'center', placement: 'title-safe-center'}]), /unique|reserved|builtin/);

const custom = addTitleStyle(p, {name: 'Trailer open', role: 'title-card', fontSize: 'xl', fontWeight: 'bold', align: 'center', placement: 'title-safe-center'});
assert.equal(p.titleStyles.length, 1);
assert.equal(listTitleStyles(p).length, 4);
assert.equal(findTitleStyle(p, custom.id)?.name, 'Trailer open');
const pLong = newProject(); const long = addTitleStyle(pLong, {name: 'x'.repeat(81)}); assert.equal(long.name.length, 80);

// Cap
const p2 = newProject();
for(let i = 0; i < TITLE_STYLE_CAP; i++) addTitleStyle(p2, {name: 'S' + i});
assert.throws(() => addTitleStyle(p2, {name: 'overflow'}), /already has/);

// --- Overlay validate / resolve ---
validateTitleOverlay(undefined);
validateTitleOverlay({});
validateTitleOverlay({text: 'Hello', styleId: 'builtin-lower-third', fontSize: 'md', align: 'left', placement: 'lower-third'});
assert.throws(() => validateTitleOverlay({fontSize: 'huge'}), /font size/i);
assert.throws(() => validateTitleOverlay({placement: 'center-stage'}), /placement/i);
assert.throws(() => validateTitleOverlay({text: 'x'.repeat(501)}), /500/);

const shot = {id: 's1', title: 'Open', seconds: 3, subtitle: 'From subtitle'};
assert.equal(titleOverlayText(shot), 'From subtitle');
assert.equal(resolveTitleStyle(p, shot).id, 'builtin-subtitle');

setTitleOverlay(shot, {text: 'THE SHOW', styleId: 'builtin-title-card'});
assert.equal(titleOverlayText(shot), 'THE SHOW');
assert.equal(resolveTitleStyle(p, shot).placement, 'title-safe-center');
assert.equal(resolveTitleStyle(p, shot).fontSize, 'xl');

setTitleOverlay(shot, {fontSize: 'sm', align: 'right'});
assert.equal(resolveTitleStyle(p, shot).fontSize, 'sm');
assert.equal(resolveTitleStyle(p, shot).align, 'right');
assert.equal(resolveTitleStyle(p, shot).id, 'builtin-title-card');

setTitleOverlay(shot, {styleId: custom.id});
assert.equal(resolveTitleStyle(p, shot).name, 'Trailer open');
p.scenes[0].shots.push(shot);

removeTitleStyle(p, custom.id);
assert.equal(p.titleStyles, undefined);
assert.equal(shot.titleOverlay.styleId, undefined); // cleared on remove
p.scenes[0].shots = p.scenes[0].shots.filter(s => s !== shot);

clearTitleOverlay(shot);
assert.equal(shot.titleOverlay, undefined);
assert.equal(titleOverlayText({subtitle: '  hi  '}), 'hi');

// Empty text drops field
setTitleOverlay(shot, {text: '  ', styleId: 'builtin-lower-third'});
assert.equal(shot.titleOverlay.text, undefined);
assert.equal(shot.titleOverlay.styleId, 'builtin-lower-third');

// --- Placement boxes stay inside safe insets ---
const titlePct = TITLE_SAFE_INSET * 100;
const actionPct = ACTION_SAFE_INSET * 100;
for(const place of ['title-safe-center', 'title-safe-lower', 'title-safe-upper', 'lower-third', 'upper-third']){
  const box = placementBox(place);
  assert.match(box.left, new RegExp('^' + titlePct));
  assert.match(box.right, new RegExp('^' + titlePct));
}
const actionBox = placementBox('action-safe-lower');
assert.match(actionBox.left, new RegExp('^' + actionPct));
assert.match(actionBox.bottom, new RegExp('^' + actionPct));

// --- applyTitleOverlayStyle without DOM CSS.supports crash ---
const fake = {style: {}};
applyTitleOverlayStyle(fake, resolveTitleStyle(p, {titleOverlay: {styleId: 'builtin-lower-third'}}));
assert.equal(fake.style.position, 'absolute');
assert.match(String(fake.style.fontWeight), /700|bold/i);
assert.ok(fake.style.left);

// --- Project round-trip validate ---
const proj = newProject();
setSafeAreaGuides(proj, true);
const style = addTitleStyle(proj, {name: 'End card', role: 'title-card', fontSize: 'lg', fontWeight: 'bold', align: 'center', placement: 'title-safe-center'});
proj.scenes[0].shots.push({
  id: 'shot-title',
  title: 'Titles',
  seconds: 4,
  action: '',
  camera: '',
  dialogue: '',
  subtitle: 'Optional SRT',
  titleOverlay: {text: 'END', styleId: style.id, align: 'center'},
});
validateTitleProject(proj);
validateShotTitleOverlay(proj.scenes[0].shots[0]);
validateProject(proj);

// Invalid overlay fails project validate
proj.scenes[0].shots[0].titleOverlay.fontSize = 'giant';
assert.throws(() => validateProject(proj), /font size|title/i);


// --- Assemble title burn payload ---
assert.equal(resolveTitleBurn(p, {subtitle: '  Hi  '}).text, 'Hi');
assert.equal(resolveTitleBurn(p, {subtitle: '  Hi  '}).placement, 'title-safe-lower');
assert.equal(resolveTitleBurn(p, {}), null);
const burnShot = {subtitle: 'SRT only', titleOverlay: {text: 'OPENING', styleId: 'builtin-title-card'}};
const burn = resolveTitleBurn(p, burnShot);
assert.equal(burn.text, 'OPENING');
assert.equal(burn.fontSize, 'xl');
assert.equal(burn.align, 'center');
assert.equal(burn.placement, 'title-safe-center');
const mapped = withTitleBurns(p, [burnShot, {id: 'x'}], true);
assert.equal(mapped[0].titleBurn.text, 'OPENING');
assert.equal(mapped[1].titleBurn, undefined);
assert.deepEqual(withTitleBurns(p, [burnShot], false)[0].titleBurn, undefined);
assert.throws(() => withTitleBurns(p, null, true), /list/i);

// --- Python assemble burn helpers + director wiring ---
const finishingSrc = readFileSync(join(root, 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/finishing.py'), 'utf8');
assert.match(finishingSrc, /def escape_drawtext/);
assert.match(finishingSrc, /def title_burn_vf/);
assert.match(finishingSrc, /def validate_title_burn/);
assert.match(finishingSrc, /def append_title_burn_vf/);
assert.match(finishingSrc, /Font fallback/);
const assembleSrc = readFileSync(join(root, 'ComfyUI_windows_portable/ComfyUI/custom_nodes/studio_director/__init__.py'), 'utf8');
assert.match(assembleSrc, /validate_title_burn/);
assert.match(assembleSrc, /append_title_burn_vf/);
assert.match(assembleSrc, /burnTitles/);
assert.match(assembleSrc, /title_burn/);
const burnPy = readFileSync(join(root, 'tools/studio/director-title-burn-check.py'), 'utf8');
assert.match(burnPy, /TitleBurnTests/);
assert.match(burnPy, /escape_drawtext/);



// --- Copy title overlay from another shot ---
const copyProj = newProject();
copyProj.scenes[0].title = 'Open';
const srcShot = {
  id: 'shot-src',
  title: 'Title card',
  seconds: 4,
  action: '',
  camera: '',
  dialogue: '',
  titleOverlay: {text: 'OPENING', styleId: 'builtin-title-card', align: 'center', placement: 'title-safe-center'},
};
const dstShot = {
  id: 'shot-dst',
  title: 'Lower',
  seconds: 3,
  action: '',
  camera: '',
  dialogue: '',
  titleOverlay: {text: 'LOCAL', styleId: 'builtin-lower-third', fontSize: 'md'},
};
const bareShot = {id: 'shot-bare', title: 'Bare', seconds: 2, action: '', camera: '', dialogue: ''};
copyProj.scenes[0].shots.push(srcShot, dstShot, bareShot);

assert.equal(shotHasTitleOverlay(srcShot), true);
assert.equal(shotHasTitleOverlay(bareShot), false);
assert.equal(shotHasTitleOverlay({titleOverlay: {}}), false);

const sources = listTitleOverlaySources(copyProj, dstShot.id);
assert.equal(sources.length, 1);
assert.equal(sources[0].id, 'shot-src');
assert.match(sources[0].label, /Title card/);
assert.equal(listTitleOverlaySources(copyProj, 'missing').length, 2);

// mode all
const allSummary = copyTitleOverlayFromShot(dstShot, srcShot, 'all');
assert.equal(allSummary.mode, 'all');
assert.equal(dstShot.titleOverlay.text, 'OPENING');
assert.equal(dstShot.titleOverlay.styleId, 'builtin-title-card');
assert.equal(dstShot.titleOverlay.align, 'center');
assert.equal(dstShot.titleOverlay.fontSize, undefined); // source lacked fontSize; all replaces

// restore dst then style-only
dstShot.titleOverlay = {text: 'LOCAL', styleId: 'builtin-lower-third', fontSize: 'md'};
const styleSummary = copyTitleOverlayFromShot(dstShot, srcShot, 'style');
assert.equal(styleSummary.mode, 'style');
assert.equal(dstShot.titleOverlay.text, 'LOCAL');
assert.equal(dstShot.titleOverlay.styleId, 'builtin-title-card');
assert.equal(dstShot.titleOverlay.align, 'center');
assert.equal(dstShot.titleOverlay.placement, 'title-safe-center');
assert.equal(dstShot.titleOverlay.fontSize, undefined); // source style authority drops local-only overrides

// text-only
dstShot.titleOverlay = {text: 'LOCAL', styleId: 'builtin-lower-third', fontSize: 'sm'};
const textSummary = copyTitleOverlayFromShot(dstShot, srcShot, 'text');
assert.equal(textSummary.mode, 'text');
assert.equal(dstShot.titleOverlay.text, 'OPENING');
assert.equal(dstShot.titleOverlay.styleId, 'builtin-lower-third');
assert.equal(dstShot.titleOverlay.fontSize, 'sm');

assert.throws(() => copyTitleOverlayFromShot(dstShot, bareShot, 'all'), /no title overlay/i);
assert.throws(() => copyTitleOverlayFromShot(dstShot, srcShot, 'nope'), /all, style, or text/i);
assert.throws(() => copyTitleOverlayFromShot(null, srcShot), /target/i);
const styleOnlySrc = {id: 's-style', titleOverlay: {styleId: 'builtin-subtitle', align: 'right'}};
assert.throws(() => copyTitleOverlayFromShot(dstShot, styleOnlySrc, 'text'), /no title overlay text/i);
const textOnlySrc = {id: 's-text', titleOverlay: {text: 'JUST TEXT'}};
assert.throws(() => copyTitleOverlayFromShot(dstShot, textOnlySrc, 'style'), /no title style fields/i);

// default mode is all
const again = {id: 'a', titleOverlay: {text: 'X'}};
copyTitleOverlayFromShot(again, srcShot);
assert.equal(again.titleOverlay.text, 'OPENING');
assert.equal(again.titleOverlay.styleId, 'builtin-title-card');

validateShotTitleOverlay(dstShot);
validateProject(copyProj);

// UI wiring markers
const titleSrc = readFileSync(join(root, 'simple-editor/director-title-styles.js'), 'utf8');
assert.match(titleSrc, /copyTitleOverlayFromShot/);
assert.match(titleSrc, /listTitleOverlaySources/);
assert.match(titleSrc, /shotHasTitleOverlay/);
assert.match(titleSrc, /Copy title from shot/);
assert.match(titleSrc, /Copy title overlay/);
assert.match(titleSrc, /title-overlay-copy/);
assert.match(titleSrc, /Style only \(keep local text\)/);
assert.match(titleSrc, /Text only \(keep local style\)/);
assert.match(titleSrc, /refreshTitleSources/);


// Remove custom title preset confirm (high-blast: clears styleId on linked shots)
{
  const p = newProject();
  p.scenes = [{id:'sc1', title:'S', shots:[
    {id:'a', title:'A', seconds:2, action:'', camera:'', dialogue:'', titleOverlay:{text:'Hi', styleId:'custom-1', fontSize:'lg'}},
    {id:'b', title:'B', seconds:2, action:'', camera:'', dialogue:'', titleOverlay:{styleId:'custom-1'}},
    {id:'c', title:'C', seconds:2, action:'', camera:'', dialogue:'', titleOverlay:{styleId:'other'}},
    {id:'d', title:'D', seconds:2, action:'', camera:'', dialogue:''},
  ]}];
  const style = {id:'custom-1', name:' Hero card ', role:'title-card', fontSize:'lg', fontWeight:'bold', align:'center', placement:'title-safe-center'};
  assert.equal(countTitleStyleLinkedShots(null, 'custom-1'), 0);
  assert.equal(countTitleStyleLinkedShots(p, ''), 0);
  assert.equal(countTitleStyleLinkedShots(p, 'custom-1'), 2);
  assert.equal(countTitleStyleLinkedShots(p, 'other'), 1);
  assert.equal(countTitleStyleLinkedShots(p, 'missing'), 0);
  assert.match(removeTitleStyleConfirmMessage(style, p), /Remove custom title preset "Hero card" \(title-card\)/);
  assert.match(removeTitleStyleConfirmMessage(style, p), /Clears the style link on 2 shots/);
  assert.match(removeTitleStyleConfirmMessage(style, p), /Undo restores the preset and shot style links/);
  assert.match(removeTitleStyleConfirmMessage({id:'x', name:'', role:'lower-third'}, {scenes:[]}), /Untitled preset/);
  assert.match(removeTitleStyleConfirmMessage({id:'x', name:'Solo', role:'subtitle'}, {scenes:[]}), /No shots currently use this preset/);
  assert.match(removeTitleStyleConfirmMessage({id:'x', name:'Solo'}, {scenes:[]}), /Built-in presets are not affected/);
  assert.match(removeTitleStyleConfirmMessage(null, null), /Untitled preset/);
  const titleSrcRm = readFileSync(join(root, 'simple-editor/director-title-styles.js'), 'utf8');
  assert.ok(titleSrcRm.includes('removeTitleStyleConfirmMessage(s, project)'), 'Remove preset confirm wired');
  assert.ok(titleSrcRm.includes('countTitleStyleLinkedShots(project, s.id)'), 'Remove preset linked count wired');
  assert.ok(titleSrcRm.includes('Remove preset'), 'Remove preset button present');
  console.log('Remove title preset confirm: linked-shot count + confirm copy + UI wiring.');
}



// Clear title style overrides disabled-when-empty (Clear layer / Clear corrections / Clear decided parity)
{
  assert.equal(clearableTitleOverlayCount(null), 0);
  assert.equal(clearableTitleOverlayCount({}), 0);
  assert.equal(clearableTitleOverlayCount({titleOverlay: {}}), 0);
  assert.equal(clearableTitleOverlayCount({titleOverlay: []}), 0);
  const emptyShot = {id: 'e'};
  assert.equal(clearableTitleOverlayCount(emptyShot), 0);
  const one = {id: 'o', titleOverlay: {text: 'Hi'}};
  assert.equal(clearableTitleOverlayCount(one), 1);
  const many = {id: 'm', titleOverlay: {text: 'OPEN', styleId: 'builtin-title-card', align: 'center', fontSize: 'lg'}};
  assert.equal(clearableTitleOverlayCount(many), 4);
  clearTitleOverlay(many);
  assert.equal(clearableTitleOverlayCount(many), 0);
  assert.equal(many.titleOverlay, undefined);
  // set then clear roundtrip
  setTitleOverlay(emptyShot, {styleId: 'builtin-lower-third', fontWeight: 'bold'});
  assert.equal(clearableTitleOverlayCount(emptyShot), 2);
  clearTitleOverlay(emptyShot);
  assert.equal(clearableTitleOverlayCount(emptyShot), 0);
  const titleSrcClear = readFileSync(join(root, 'simple-editor/director-title-styles.js'), 'utf8');
  assert.match(titleSrcClear, /clearableTitleOverlayCount/);
  assert.match(titleSrcClear, /syncClearOverridesButton/);
  assert.match(titleSrcClear, /Clear title style overrides/);
  assert.match(titleSrcClear, /No title style overrides to clear on this shot/);
  assert.match(titleSrcClear, /clearBtn\.disabled = !clearable/);
  assert.ok(titleSrcClear.includes('clearableTitleOverlayCount(shot)'), 'Clear button uses clearable count');
  console.log('Clear title style overrides disabled-when-empty: clearable count + UI wiring.');
}

console.log('Title styles + safe-area + Assemble burn + copy-from-shot + remove-preset-confirm + clear-overrides-disabled checks passed: validate, presets, resolve, placement, titleBurn, copy modes, remove confirm, clearable count, project wiring.');
