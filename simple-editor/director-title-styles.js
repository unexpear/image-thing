/**
 * Title styles + safe-area guides for Cartoon Director (manual-first).
 * Artists toggle action/title-safe overlays on Animatic / Assemble preview,
 * and apply durable title-card / lower-third / subtitle style fields.
 * Animatic preview paints titles; Assemble can burn them into the MP4 via ffmpeg drawtext
 * when "Burn titles into export" is on. Soft captions (SRT as mov_text) are a separate Assemble option.
 */
export const ACTION_SAFE_INSET = 0.05; // 5% each edge → 90% action frame
export const TITLE_SAFE_INSET = 0.10;  // 10% each edge → 80% title frame
export const TITLE_STYLE_CAP = 24;
export const TITLE_TEXT_MAX = 500;
export const TITLE_NAME_MAX = 80;

export const TITLE_ROLES = Object.freeze(['title-card', 'lower-third', 'subtitle']);
export const TITLE_FONT_SIZES = Object.freeze(['sm', 'md', 'lg', 'xl']);
export const TITLE_FONT_WEIGHTS = Object.freeze(['normal', 'bold']);
export const TITLE_ALIGNS = Object.freeze(['left', 'center', 'right']);
/** Placement keeps text inside title-safe or action-safe margins. */
export const TITLE_PLACEMENTS = Object.freeze([
  'title-safe-center',
  'title-safe-lower',
  'title-safe-upper',
  'action-safe-lower',
  'lower-third',
  'upper-third',
]);

/** Built-in presets (not stored; resolve by id when shot references them). */
export const BUILTIN_TITLE_STYLES = Object.freeze([
  Object.freeze({
    id: 'builtin-title-card',
    name: 'Title card',
    role: 'title-card',
    fontSize: 'xl',
    fontWeight: 'bold',
    align: 'center',
    placement: 'title-safe-center',
  }),
  Object.freeze({
    id: 'builtin-lower-third',
    name: 'Lower third',
    role: 'lower-third',
    fontSize: 'md',
    fontWeight: 'bold',
    align: 'left',
    placement: 'lower-third',
  }),
  Object.freeze({
    id: 'builtin-subtitle',
    name: 'Subtitle',
    role: 'subtitle',
    fontSize: 'sm',
    fontWeight: 'normal',
    align: 'center',
    placement: 'title-safe-lower',
  }),
]);

const FONT_SIZE_VH = Object.freeze({ sm: 3.2, md: 4.6, lg: 6.5, xl: 9 });

function isPlainObject(v){
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function optionalString(v, label, max){
  if(v === undefined) return;
  if(typeof v !== 'string') throw Error(label + ' must be text.');
  if(v.length > max) throw Error(label + ' stays within ' + max + ' characters.');
}

function requireEnum(v, allowed, label){
  if(!allowed.includes(v)) throw Error(label + ' must be one of: ' + allowed.join(', ') + '.');
}

/** Broadcast-style insets as CSS percentages (each side). */
export function safeAreaInsets(){
  return {
    action: ACTION_SAFE_INSET * 100,
    title: TITLE_SAFE_INSET * 100,
  };
}

export function validatePreviewGuides(guides){
  if(guides === undefined) return;
  if(!isPlainObject(guides)) throw Error('Preview guides must be an object.');
  if(guides.safeArea !== undefined && typeof guides.safeArea !== 'boolean')
    throw Error('Safe-area guide toggle must be true or false.');
  for(const key of Object.keys(guides)){
    if(key !== 'safeArea') throw Error('Unknown preview guide field: ' + key);
  }
}

export function ensurePreviewGuides(project){
  if(!project || typeof project !== 'object') throw Error('Preview guides need a project.');
  if(project.previewGuides === undefined) project.previewGuides = {};
  validatePreviewGuides(project.previewGuides);
  return project.previewGuides;
}

export function setSafeAreaGuides(project, on){
  const guides = ensurePreviewGuides(project);
  const next = !!on;
  if(next) guides.safeArea = true;
  else delete guides.safeArea;
  if(!Object.keys(guides).length) delete project.previewGuides;
  return !!guides.safeArea;
}

export function safeAreaGuidesOn(project){
  return !!(project?.previewGuides?.safeArea);
}

function validateStyleFields(style, {requireId = false, requireName = false} = {}){
  if(!isPlainObject(style)) throw Error('Title style must be an object.');
  if(requireId){
    if(typeof style.id !== 'string' || !style.id) throw Error('Title styles need unique IDs.');
  }else if(style.id !== undefined && (typeof style.id !== 'string' || !style.id)){
    throw Error('Title style id must be nonempty text.');
  }
  if(requireName){
    if(typeof style.name !== 'string' || !style.name.trim()) throw Error('Title styles need a name.');
    if(style.name.length > TITLE_NAME_MAX) throw Error('Title style names stay within ' + TITLE_NAME_MAX + ' characters.');
  }else{
    optionalString(style.name, 'Title style name', TITLE_NAME_MAX);
  }
  if(style.role !== undefined) requireEnum(style.role, TITLE_ROLES, 'Title style role');
  if(style.fontSize !== undefined) requireEnum(style.fontSize, TITLE_FONT_SIZES, 'Title font size');
  if(style.fontWeight !== undefined) requireEnum(style.fontWeight, TITLE_FONT_WEIGHTS, 'Title font weight');
  if(style.align !== undefined) requireEnum(style.align, TITLE_ALIGNS, 'Title align');
  if(style.placement !== undefined) requireEnum(style.placement, TITLE_PLACEMENTS, 'Title placement');
  for(const key of Object.keys(style)){
    if(!['id', 'name', 'role', 'fontSize', 'fontWeight', 'align', 'placement'].includes(key))
      throw Error('Unknown title style field: ' + key);
  }
}

export function validateTitleStyles(styles){
  if(styles === undefined) return;
  if(!Array.isArray(styles)) throw Error('Title styles must be a list.');
  if(styles.length > TITLE_STYLE_CAP) throw Error('Keep at most ' + TITLE_STYLE_CAP + ' custom title styles.');
  const ids = new Set();
  for(const style of styles){
    validateStyleFields(style, {requireId: true, requireName: true});
    if(ids.has(style.id) || BUILTIN_TITLE_STYLES.some(b => b.id === style.id))
      throw Error('Title styles need unique IDs (builtin-* are reserved).');
    ids.add(style.id);
    // Custom presets must fully specify look so resolve never depends on missing fields.
    requireEnum(style.role, TITLE_ROLES, 'Title style role');
    requireEnum(style.fontSize, TITLE_FONT_SIZES, 'Title font size');
    requireEnum(style.fontWeight, TITLE_FONT_WEIGHTS, 'Title font weight');
    requireEnum(style.align, TITLE_ALIGNS, 'Title align');
    requireEnum(style.placement, TITLE_PLACEMENTS, 'Title placement');
  }
}

export function validateTitleOverlay(overlay){
  if(overlay === undefined) return;
  if(!isPlainObject(overlay)) throw Error('Title overlay must be an object.');
  optionalString(overlay.text, 'Title overlay text', TITLE_TEXT_MAX);
  if(overlay.styleId !== undefined){
    if(typeof overlay.styleId !== 'string' || !overlay.styleId)
      throw Error('Title style id must be nonempty text.');
  }
  if(overlay.fontSize !== undefined) requireEnum(overlay.fontSize, TITLE_FONT_SIZES, 'Title font size');
  if(overlay.fontWeight !== undefined) requireEnum(overlay.fontWeight, TITLE_FONT_WEIGHTS, 'Title font weight');
  if(overlay.align !== undefined) requireEnum(overlay.align, TITLE_ALIGNS, 'Title align');
  if(overlay.placement !== undefined) requireEnum(overlay.placement, TITLE_PLACEMENTS, 'Title placement');
  for(const key of Object.keys(overlay)){
    if(!['text', 'styleId', 'fontSize', 'fontWeight', 'align', 'placement'].includes(key))
      throw Error('Unknown title overlay field: ' + key);
  }
}

/** Project-level validate (previewGuides + titleStyles). */
export function validateTitleProject(project){
  if(!project) return;
  validatePreviewGuides(project.previewGuides);
  validateTitleStyles(project.titleStyles);
}

/** Shot-level titleOverlay validate (call from production). */
export function validateShotTitleOverlay(shot){
  if(!shot) return;
  validateTitleOverlay(shot.titleOverlay);
}

export function listTitleStyles(project){
  const custom = Array.isArray(project?.titleStyles) ? project.titleStyles : [];
  return [...BUILTIN_TITLE_STYLES, ...custom];
}

export function findTitleStyle(project, styleId){
  if(!styleId) return null;
  return listTitleStyles(project).find(s => s.id === styleId) || null;
}

const DEFAULT_RESOLVED = Object.freeze({
  id: 'builtin-subtitle',
  name: 'Subtitle',
  role: 'subtitle',
  fontSize: 'sm',
  fontWeight: 'normal',
  align: 'center',
  placement: 'title-safe-lower',
});

/**
 * Resolve effective style for a shot: builtin/custom preset + optional per-shot overrides.
 */
export function resolveTitleStyle(project, shot){
  const overlay = shot?.titleOverlay;
  const fromId = overlay?.styleId ? findTitleStyle(project, overlay.styleId) : null;
  const base = fromId || (
    overlay?.styleId ? DEFAULT_RESOLVED : (
      // No styleId: prefer lower-third when explicit title text differs from subtitle role default
      overlay?.text?.trim() ? BUILTIN_TITLE_STYLES.find(s => s.id === 'builtin-title-card') : DEFAULT_RESOLVED
    )
  );
  return {
    id: base.id,
    name: base.name,
    role: base.role,
    fontSize: overlay?.fontSize || base.fontSize || 'sm',
    fontWeight: overlay?.fontWeight || base.fontWeight || 'normal',
    align: overlay?.align || base.align || 'center',
    placement: overlay?.placement || base.placement || 'title-safe-lower',
  };
}

/** Text shown in preview: titleOverlay.text, else shot.subtitle. */
export function titleOverlayText(shot){
  const explicit = shot?.titleOverlay?.text;
  if(typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const sub = shot?.subtitle;
  if(typeof sub === 'string' && sub.trim()) return sub.trim();
  return '';
}

/**
 * Resolved payload for Assemble ffmpeg burn-in (null when no on-screen title text).
 * Matches preview: titleOverlay.text, else shot.subtitle.
 */
export function resolveTitleBurn(project, shot){
  const text = titleOverlayText(shot);
  if(!text) return null;
  const style = resolveTitleStyle(project, shot);
  return {
    text,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    align: style.align,
    placement: style.placement,
  };
}

/** Attach titleBurn on shots when Assemble "Burn titles into export" is enabled. */
export function withTitleBurns(project, shots, burnOn){
  if(!burnOn) return shots;
  if(!Array.isArray(shots)) throw Error('Assemble shots must be a list.');
  return shots.map(shot => {
    const titleBurn = resolveTitleBurn(project, shot);
    return titleBurn ? {...shot, titleBurn} : shot;
  });
}

export function setTitleOverlay(shot, patch){
  if(!shot || typeof shot !== 'object') throw Error('Title overlay needs a shot.');
  if(patch === null){
    delete shot.titleOverlay;
    return;
  }
  if(!isPlainObject(patch)) throw Error('Title overlay patch must be an object.');
  shot.titleOverlay = {...(shot.titleOverlay || {}), ...patch};
  // Drop empty text so subtitle fallback stays active.
  if(shot.titleOverlay.text !== undefined && !String(shot.titleOverlay.text).trim())
    delete shot.titleOverlay.text;
  if(shot.titleOverlay.styleId === '') delete shot.titleOverlay.styleId;
  validateTitleOverlay(shot.titleOverlay);
  if(!Object.keys(shot.titleOverlay).length) delete shot.titleOverlay;
  return shot.titleOverlay;
}

export function clearTitleOverlay(shot){
  if(shot) delete shot.titleOverlay;
}

/** How many durable titleOverlay fields Clear would remove (0 when empty / subtitle-only). */
export function clearableTitleOverlayCount(shot){
  const o = shot?.titleOverlay;
  if(!o || typeof o !== 'object' || Array.isArray(o)) return 0;
  return Object.keys(o).length;
}

/** True when shot has durable titleOverlay fields (not subtitle-only fallback). */
export function shotHasTitleOverlay(shot){
  const o = shot?.titleOverlay;
  return !!(o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length);
}

/** Other episode shots that already have a title overlay (for continuity copy). */
export function listTitleOverlaySources(project, excludeShotId){
  const out = [];
  for(const scene of project?.scenes || []){
    for(const shot of scene.shots || []){
      if(shot.id === excludeShotId || !shotHasTitleOverlay(shot)) continue;
      const o = shot.titleOverlay;
      const sceneTitle = scene.title || 'Scene';
      const shotTitle = shot.title || 'Untitled shot';
      const bits = [sceneTitle + ' / ' + shotTitle];
      if(o.text) bits.push('text');
      if(o.styleId) bits.push('preset');
      const overrides = ['fontSize', 'fontWeight', 'align', 'placement'].filter(k => o[k] !== undefined);
      if(overrides.length) bits.push(overrides.length + ' override' + (overrides.length === 1 ? '' : 's'));
      out.push({
        id: shot.id,
        sceneId: scene.id,
        sceneTitle,
        shotTitle,
        hasText: !!o.text,
        hasStyle: !!(o.styleId || overrides.length),
        label: bits.join(' · '),
      });
    }
  }
  return out;
}

const TITLE_OVERLAY_STYLE_KEYS = Object.freeze(['styleId', 'fontSize', 'fontWeight', 'align', 'placement']);

/**
 * Copy title overlay from sourceShot onto targetShot.
 * mode 'all' (default): replace entire titleOverlay.
 * mode 'style': copy style fields only; keep local text.
 * mode 'text': copy text only; keep local style fields.
 * Mutates targetShot; validates. Caller should wrap in change()/Undo.
 */
export function copyTitleOverlayFromShot(targetShot, sourceShot, mode='all'){
  if(!targetShot || typeof targetShot !== 'object' || Array.isArray(targetShot))
    throw Error('Title overlay copy needs a target shot.');
  if(!sourceShot || typeof sourceShot !== 'object' || Array.isArray(sourceShot))
    throw Error('Source shot is missing.');
  if(!shotHasTitleOverlay(sourceShot))
    throw Error('Source shot has no title overlay to copy.');
  const m = mode == null || mode === '' ? 'all' : mode;
  if(m !== 'all' && m !== 'style' && m !== 'text')
    throw Error('Title overlay copy mode must be all, style, or text.');
  const src = sourceShot.titleOverlay;

  if(m === 'all'){
    targetShot.titleOverlay = structuredClone(src);
    validateTitleOverlay(targetShot.titleOverlay);
    return {mode: 'all', fields: Object.keys(targetShot.titleOverlay), hadText: !!src.text};
  }

  if(m === 'text'){
    const text = src.text;
    if(text === undefined || !String(text).trim())
      throw Error('Source shot has no title overlay text to copy.');
    setTitleOverlay(targetShot, {text});
    return {mode: 'text', fields: ['text'], hadText: true};
  }

  // style: source style fields become the style authority; local text kept.
  const patch = {};
  for(const k of TITLE_OVERLAY_STYLE_KEYS){
    if(src[k] !== undefined) patch[k] = src[k];
  }
  if(!Object.keys(patch).length)
    throw Error('Source shot has no title style fields to copy.');
  const keepText = targetShot.titleOverlay?.text;
  const next = {...patch};
  if(keepText !== undefined) next.text = keepText;
  targetShot.titleOverlay = next;
  validateTitleOverlay(targetShot.titleOverlay);
  if(!Object.keys(targetShot.titleOverlay).length) delete targetShot.titleOverlay;
  return {mode: 'style', fields: Object.keys(patch), hadText: keepText !== undefined};
}

export function addTitleStyle(project, fields){
  if(!project || typeof project !== 'object') throw Error('Title styles need a project.');
  project.titleStyles ??= [];
  if(project.titleStyles.length >= TITLE_STYLE_CAP)
    throw Error('This project already has ' + TITLE_STYLE_CAP + ' custom title styles.');
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'title-style-' + Date.now();
  const style = {
    id,
    name: (fields?.name || 'Custom title').trim().slice(0, TITLE_NAME_MAX) || 'Custom title',
    role: TITLE_ROLES.includes(fields?.role) ? fields.role : 'title-card',
    fontSize: TITLE_FONT_SIZES.includes(fields?.fontSize) ? fields.fontSize : 'lg',
    fontWeight: TITLE_FONT_WEIGHTS.includes(fields?.fontWeight) ? fields.fontWeight : 'bold',
    align: TITLE_ALIGNS.includes(fields?.align) ? fields.align : 'center',
    placement: TITLE_PLACEMENTS.includes(fields?.placement) ? fields.placement : 'title-safe-center',
  };
  validateStyleFields(style, {requireId: true, requireName: true});
  project.titleStyles.push(style);
  validateTitleStyles(project.titleStyles);
  return style;
}


/** How many shots reference this custom title style via titleOverlay.styleId. */
export function countTitleStyleLinkedShots(project, styleId){
  if(!project || !Array.isArray(project.scenes) || typeof styleId !== 'string' || !styleId) return 0;
  let n = 0;
  for(const scene of project.scenes){
    if(!scene || !Array.isArray(scene.shots)) continue;
    for(const shot of scene.shots){
      if(shot?.titleOverlay?.styleId === styleId) n++;
    }
  }
  return n;
}

/**
 * Confirm copy before Remove preset (custom title style).
 * High-blast: deletes the reusable preset and clears styleId on linked shots.
 */
export function removeTitleStyleConfirmMessage(style, project){
  const raw = (style && typeof style.name === 'string') ? style.name.trim() : '';
  const name = raw || 'Untitled preset';
  const role = (style && typeof style.role === 'string' && style.role) ? style.role : 'title-card';
  const bits = ['Remove custom title preset "' + name + '" (' + role + ') from this project?'];
  const linked = countTitleStyleLinkedShots(project, style && style.id);
  if(linked > 0){
    bits.push('', 'Clears the style link on ' + linked + ' shot' + (linked === 1 ? '' : 's') + ' (text and other overrides stay).');
  }else{
    bits.push('', 'No shots currently use this preset.');
  }
  bits.push('', 'Built-in presets are not affected. Undo restores the preset' + (linked > 0 ? ' and shot style links' : '') + '.');
  return bits.join('\n');
}

export function removeTitleStyle(project, id){
  if(!project?.titleStyles) return false;
  const before = project.titleStyles.length;
  project.titleStyles = project.titleStyles.filter(s => s.id !== id);
  const removed = project.titleStyles.length < before;
  if(!project.titleStyles.length) delete project.titleStyles;
  // Clear shot references to the removed style.
  if(removed){
    for(const scene of project.scenes || []){
      for(const shot of scene.shots || []){
        if(shot.titleOverlay?.styleId === id) delete shot.titleOverlay.styleId;
        if(shot.titleOverlay && !Object.keys(shot.titleOverlay).length) delete shot.titleOverlay;
      }
    }
  }
  return removed;
}

/** CSS inset % for a placement (keeps text inside the named safe region). */
export function placementBox(placement){
  const title = TITLE_SAFE_INSET * 100;
  const action = ACTION_SAFE_INSET * 100;
  const p = TITLE_PLACEMENTS.includes(placement) ? placement : 'title-safe-lower';
  if(p === 'title-safe-center'){
    return { top: title + '%', right: title + '%', bottom: title + '%', left: title + '%', justifyContent: 'center', alignItems: 'center' };
  }
  if(p === 'title-safe-upper'){
    return { top: title + '%', right: title + '%', bottom: 'auto', left: title + '%', justifyContent: 'flex-start', alignItems: 'flex-start' };
  }
  if(p === 'title-safe-lower'){
    return { top: 'auto', right: title + '%', bottom: title + '%', left: title + '%', justifyContent: 'flex-end', alignItems: 'flex-end' };
  }
  if(p === 'action-safe-lower'){
    return { top: 'auto', right: action + '%', bottom: action + '%', left: action + '%', justifyContent: 'flex-end', alignItems: 'flex-end' };
  }
  if(p === 'upper-third'){
    return { top: title + '%', right: title + '%', bottom: 'auto', left: title + '%', justifyContent: 'flex-start', alignItems: 'flex-start', maxHeight: '28%' };
  }
  // lower-third: bottom title-safe band
  return { top: 'auto', right: title + '%', bottom: title + '%', left: title + '%', justifyContent: 'flex-end', alignItems: 'flex-end', maxHeight: '28%' };
}

/** Apply resolved style onto a title overlay element. */
export function applyTitleOverlayStyle(el, style){
  if(!el) return;
  const resolved = style || DEFAULT_RESOLVED;
  const box = placementBox(resolved.placement);
  el.style.position = 'absolute';
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.pointerEvents = 'none';
  el.style.boxSizing = 'border-box';
  el.style.zIndex = '6';
  el.style.margin = '0';
  el.style.padding = '0.35em 0.5em';
  el.style.top = box.top;
  el.style.right = box.right;
  el.style.bottom = box.bottom;
  el.style.left = box.left;
  el.style.justifyContent = box.justifyContent;
  el.style.alignItems = resolved.align === 'left' ? 'flex-start'
    : resolved.align === 'right' ? 'flex-end' : 'center';
  if(box.maxHeight) el.style.maxHeight = box.maxHeight;
  else el.style.maxHeight = '';
  el.style.textAlign = resolved.align || 'center';
  el.style.fontWeight = resolved.fontWeight === 'bold' ? '700' : '500';
  el.style.fontSize = (FONT_SIZE_VH[resolved.fontSize] || FONT_SIZE_VH.sm) + 'cqh';
  // Fallback when container query units unavailable
  if(typeof CSS === 'undefined' || !CSS.supports?.('font-size', '1cqh')){
    el.style.fontSize = (FONT_SIZE_VH[resolved.fontSize] || FONT_SIZE_VH.sm) + 'vh';
  }
  el.style.lineHeight = '1.25';
  el.style.color = '#f4f7ff';
  el.style.textShadow = '0 1px 2px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.45)';
  el.style.whiteSpace = 'pre-wrap';
  el.style.overflowWrap = 'anywhere';
  el.style.overflow = 'hidden';
}

/**
 * Mount action + title safe rectangles inside an animatic/preview screen.
 * Returns { root, setVisible(on), refresh() }.
 */
export function mountSafeAreaGuides(screen){
  if(!screen) throw Error('Safe-area guides need a preview screen.');
  let root = screen.querySelector('.safe-area-guides');
  if(!root){
    root = document.createElement('div');
    root.className = 'safe-area-guides';
    root.setAttribute('aria-hidden', 'true');
    const action = document.createElement('div');
    action.className = 'safe-area-rect safe-area-action';
    action.title = 'Action safe (5% inset)';
    const title = document.createElement('div');
    title.className = 'safe-area-rect safe-area-title';
    title.title = 'Title safe (10% inset)';
    const labelA = document.createElement('span');
    labelA.className = 'safe-area-label';
    labelA.textContent = 'Action';
    const labelT = document.createElement('span');
    labelT.className = 'safe-area-label safe-area-label-title';
    labelT.textContent = 'Title';
    action.append(labelA);
    title.append(labelT);
    root.append(action, title);
    screen.append(root);
  }
  const insets = safeAreaInsets();
  const actionEl = root.querySelector('.safe-area-action');
  const titleEl = root.querySelector('.safe-area-title');
  if(actionEl){
    actionEl.style.inset = insets.action + '%';
  }
  if(titleEl){
    titleEl.style.inset = insets.title + '%';
  }
  function setVisible(on){
    root.hidden = !on;
    root.classList.toggle('is-visible', !!on);
  }
  return {
    root,
    setVisible,
    refresh(){
      const insets2 = safeAreaInsets();
      if(actionEl) actionEl.style.inset = insets2.action + '%';
      if(titleEl) titleEl.style.inset = insets2.title + '%';
    },
  };
}

/**
 * Ensure a title overlay node exists on the screen and paint shot text + style.
 * Returns the overlay element (hidden when no text).
 */
export function paintTitleOverlay(screen, project, shot){
  if(!screen) return null;
  let el = screen.querySelector('.title-overlay');
  if(!el){
    el = document.createElement('div');
    el.className = 'title-overlay';
    el.setAttribute('aria-hidden', 'true');
    screen.append(el);
  }
  // container-type for cqh font sizing
  if(getComputedStyle(screen).containerType === 'normal' || !screen.style.containerType){
    screen.style.containerType = 'size';
  }
  const text = titleOverlayText(shot);
  if(!text){
    el.hidden = true;
    el.textContent = '';
    return el;
  }
  el.hidden = false;
  el.textContent = text;
  applyTitleOverlayStyle(el, resolveTitleStyle(project, shot));
  return el;
}

/** Compact checkbox + hint for Animatic / Assemble. */
export function safeAreaGuideControls(parent, project, {change, onToggle} = {}){
  const box = document.createElement('div');
  box.className = 'safe-area-guide-controls';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Safe-area guides');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const label = document.createElement('label');
  label.className = 'safe-area-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = safeAreaGuidesOn(project);
  input.setAttribute('aria-label', 'Show action and title safe-area guides');
  input.onchange = () => {
    try{
      const run = () => setSafeAreaGuides(project, input.checked);
      if(typeof change === 'function') change(run);
      else run();
      onToggle?.(safeAreaGuidesOn(project));
    }catch(e){
      input.checked = safeAreaGuidesOn(project);
      status.textContent = e.message;
    }
  };
  label.append(input, document.createTextNode(' Show safe-area guides (action 5% / title 10%)'));
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Guides are preview-only on Animatic and Assemble review. They are not burned into the MP4. Keep title cards and lower-thirds inside the inner title-safe box.';
  box.append(label, hint, status);
  parent.append(box);
  return {
    root: box,
    refresh(){
      input.checked = safeAreaGuidesOn(project);
    },
    setProject(next){
      project = next;
      input.checked = safeAreaGuidesOn(project);
    },
  };
}

/**
 * Production UI: title overlay text + style preset + size/weight/align/placement.
 * Extends existing subtitle authoring without replacing SRT export.
 */
export function titleOverlayControls(panel, project, shot, {change} = {}){
  const box = document.createElement('div');
  let clearBtn = null;
  let syncClearOverridesButton = () => {};
  box.className = 'title-overlay-controls';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Title style');
  box.append((() => {
    const h = document.createElement('h4');
    h.textContent = 'Title card / lower-third style';
    return h;
  })());
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Optional on-screen title for Animatic preview and Assemble burn-in. Leave title text empty to use the subtitle field (preview + burn). Placement stays inside title-safe / action-safe margins. Copy title from another shot for multi-shot continuity. Burn titles and Embed soft captions are separate Assemble options; Delivery can still export a standalone SRT.';
  box.append(hint);

  const overlay = shot.titleOverlay || {};

  const textLabel = document.createElement('label');
  textLabel.className = 'field';
  textLabel.append(document.createTextNode('Title overlay text (optional)'));
  const text = document.createElement('textarea');
  text.rows = 2;
  text.maxLength = TITLE_TEXT_MAX;
  text.placeholder = 'Leave empty to use subtitle text in preview';
  text.value = overlay.text || '';
  text.setAttribute('aria-label', 'Title overlay text');
  let textGroup = Symbol();
  text.onfocus = () => { textGroup = Symbol(); };
  text.oninput = () => {
    change?.(() => {
      setTitleOverlay(shot, {text: text.value});
    }, {redraw: false, group: textGroup});
    syncClearOverridesButton();
  };
  textLabel.append(text);
  box.append(textLabel);

  const styleLabel = document.createElement('label');
  styleLabel.className = 'field';
  styleLabel.append(document.createTextNode('Style preset'));
  const styleSelect = document.createElement('select');
  styleSelect.setAttribute('aria-label', 'Title style preset');
  function fillStyles(){
    styleSelect.replaceChildren();
    styleSelect.append(new Option('Default (auto)', ''));
    for(const s of listTitleStyles(project)){
      styleSelect.append(new Option(
        (s.id.startsWith('builtin-') ? '' : 'Custom · ') + s.name + ' · ' + s.role,
        s.id,
      ));
    }
    styleSelect.value = shot.titleOverlay?.styleId || '';
  }
  fillStyles();
  styleSelect.onchange = () => {
    change?.(() => {
      if(styleSelect.value) setTitleOverlay(shot, {styleId: styleSelect.value});
      else {
        if(shot.titleOverlay) delete shot.titleOverlay.styleId;
        if(shot.titleOverlay && !Object.keys(shot.titleOverlay).length) delete shot.titleOverlay;
      }
    });
    syncFieldsFromResolved();
  };
  styleLabel.append(styleSelect);
  box.append(styleLabel);

  function fieldSelect(labelText, aria, values, labels, current, onPick){
    const lab = document.createElement('label');
    lab.className = 'field';
    lab.append(document.createTextNode(labelText));
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', aria);
    values.forEach((v, i) => sel.append(new Option(labels[i] || v, v)));
    sel.value = current;
    sel.onchange = () => onPick(sel);
    lab.append(sel);
    box.append(lab);
    return sel;
  }

  const resolved = () => resolveTitleStyle(project, shot);

  const sizeSel = fieldSelect(
    'Font size',
    'Title font size',
    TITLE_FONT_SIZES,
    ['Small', 'Medium', 'Large', 'Extra large'],
    resolved().fontSize,
    (sel) => { change?.(() => setTitleOverlay(shot, {fontSize: sel.value})); syncClearOverridesButton(); },
  );
  const weightSel = fieldSelect(
    'Font weight',
    'Title font weight',
    TITLE_FONT_WEIGHTS,
    ['Regular', 'Bold'],
    resolved().fontWeight,
    (sel) => { change?.(() => setTitleOverlay(shot, {fontWeight: sel.value})); syncClearOverridesButton(); },
  );
  const alignSel = fieldSelect(
    'Align',
    'Title align',
    TITLE_ALIGNS,
    ['Left', 'Center', 'Right'],
    resolved().align,
    (sel) => { change?.(() => setTitleOverlay(shot, {align: sel.value})); syncClearOverridesButton(); },
  );
  const placeSel = fieldSelect(
    'Safe placement',
    'Title safe placement',
    TITLE_PLACEMENTS,
    [
      'Title-safe center',
      'Title-safe lower',
      'Title-safe upper',
      'Action-safe lower',
      'Lower third',
      'Upper third',
    ],
    resolved().placement,
    (sel) => { change?.(() => setTitleOverlay(shot, {placement: sel.value})); syncClearOverridesButton(); },
  );

  function syncFieldsFromResolved(){
    const r = resolved();
    sizeSel.value = r.fontSize;
    weightSel.value = r.fontWeight;
    alignSel.value = r.align;
    placeSel.value = r.placement;
    fillStyles();
    text.value = shot.titleOverlay?.text || '';
    syncClearOverridesButton();
  }

  const copyHint = document.createElement('p');
  copyHint.className = 'hint';
  copyHint.textContent = 'Copy title overlay from another shot for continuity. Copy all replaces text and style. Style only keeps this shot\'s title text. Text only keeps this shot\'s style. Undo restores.';
  box.append(copyHint);

  const copyBox = document.createElement('div');
  copyBox.className = 'title-overlay-copy actions';
  copyBox.setAttribute('role', 'group');
  copyBox.setAttribute('aria-label', 'Copy title overlay from another shot');

  const copyLabel = document.createElement('label');
  copyLabel.className = 'field';
  copyLabel.append(document.createTextNode('Copy title from shot'));
  const copySelect = document.createElement('select');
  copySelect.setAttribute('aria-label', 'Copy title overlay from shot');
  copyLabel.append(copySelect);

  const copyModeLabel = document.createElement('label');
  copyModeLabel.className = 'field';
  copyModeLabel.append(document.createTextNode('Copy mode'));
  const copyMode = document.createElement('select');
  copyMode.setAttribute('aria-label', 'Title overlay copy mode');
  copyMode.append(new Option('Copy all (text & style)', 'all'));
  copyMode.append(new Option('Style only (keep local text)', 'style'));
  copyMode.append(new Option('Text only (keep local style)', 'text'));
  copyMode.value = 'all';
  copyModeLabel.append(copyMode);

  function findShotById(id){
    for(const scene of project?.scenes || []){
      const found = scene.shots?.find(s => s.id === id);
      if(found) return found;
    }
    return null;
  }

  function refreshTitleSources(){
    const sources = listTitleOverlaySources(project, shot.id);
    const prev = copySelect.value;
    copySelect.replaceChildren(new Option(sources.length ? 'Choose a shot with a title overlay\u2026' : 'No other shots with a title overlay yet', ''));
    for(const s of sources) copySelect.append(new Option(s.label, s.id));
    if(sources.some(s => s.id === prev)) copySelect.value = prev;
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy title overlay';
  copyBtn.onclick = () => {
    const sourceId = copySelect.value;
    if(!sourceId){
      status.textContent = 'Choose another shot that already has a title overlay.';
      return;
    }
    const sourceShot = findShotById(sourceId);
    if(!sourceShot || !shotHasTitleOverlay(sourceShot)){
      status.textContent = 'Source shot no longer has a title overlay.';
      refreshTitleSources();
      return;
    }
    const mode = copyMode.value || 'all';
    let summary = null;
    try{
      change?.(() => { summary = copyTitleOverlayFromShot(shot, sourceShot, mode); });
    }catch(e){
      status.textContent = e.message;
      return;
    }
    syncFieldsFromResolved();
    refreshTitleSources();
    paintCustom();
    const title = sourceShot.title || 'Untitled shot';
    const bits = mode === 'style'
      ? ('Copied title style from "' + title + '"; kept this shot\'s text')
      : mode === 'text'
        ? ('Copied title text from "' + title + '"; kept this shot\'s style')
        : ('Copied title overlay (' + (summary?.fields || []).join(', ') + ') from "' + title + '"');
    status.textContent = bits + '. Undo restores this shot\'s previous title overlay.';
  };

  copyBox.append(copyLabel, copyModeLabel, copyBtn);
  box.append(copyBox);
  refreshTitleSources();

  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const actions = document.createElement('div');
  actions.className = 'actions';
  clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear title style overrides';
  syncClearOverridesButton = () => {
    if(!clearBtn) return;
    const clearable = clearableTitleOverlayCount(shot);
    clearBtn.disabled = !clearable;
    clearBtn.title = clearable
      ? ('Clear ' + clearable + ' title overlay field' + (clearable === 1 ? '' : 's') + ' on this shot')
      : 'No title style overrides to clear on this shot';
  };
  clearBtn.onclick = () => {
    const clearable = clearableTitleOverlayCount(shot);
    if(!clearable){
      status.textContent = 'No title style overrides to clear on this shot.';
      syncClearOverridesButton();
      return;
    }
    change?.(() => clearTitleOverlay(shot));
    syncFieldsFromResolved();
    refreshTitleSources();
    status.textContent = 'Cleared title style overrides. Undo restores.';
  };
  syncClearOverridesButton();
  const addPreset = document.createElement('button');
  addPreset.type = 'button';
  addPreset.textContent = 'Save current as project preset';
  addPreset.onclick = () => {
    try{
      change?.(() => {
        const r = resolved();
        const created = addTitleStyle(project, {
          name: (shot.title || r.name || 'Custom') + ' style',
          role: r.role,
          fontSize: r.fontSize,
          fontWeight: r.fontWeight,
          align: r.align,
          placement: r.placement,
        });
        setTitleOverlay(shot, {styleId: created.id});
      });
      syncFieldsFromResolved();
    }catch(e){
      status.textContent = e.message;
    }
  };
  actions.append(clearBtn, addPreset);
  box.append(actions);
  box.append(status);

  // Project custom preset list (remove)
  const customBox = document.createElement('div');
  customBox.className = 'title-style-presets';
  function paintCustom(){
    customBox.replaceChildren();
    const customs = project.titleStyles || [];
    if(!customs.length){
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No custom project presets yet. Built-ins: Title card, Lower third, Subtitle.';
      customBox.append(p);
      return;
    }
    for(const s of customs){
      const row = document.createElement('div');
      row.className = 'title-style-preset-row';
      const span = document.createElement('span');
      span.textContent = s.name + ' · ' + s.role + ' · ' + s.fontSize + '/' + s.align;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove preset';
      rm.onclick = () => {
        if(!confirm(removeTitleStyleConfirmMessage(s, project))) return;
        const linked = countTitleStyleLinkedShots(project, s.id);
        const label = (typeof s.name === 'string' && s.name.trim()) ? s.name.trim() : 'Untitled preset';
        change?.(() => removeTitleStyle(project, s.id));
        syncFieldsFromResolved();
        paintCustom();
        status.textContent = 'Removed preset "' + label + '"' + (linked ? ' (cleared style link on ' + linked + ' shot' + (linked === 1 ? '' : 's') + ')' : '') + '. Undo restores.';
      };
      row.append(span, rm);
      customBox.append(row);
    }
  }
  paintCustom();
  box.append(customBox);

  panel.append(box);
  return {root: box, refresh(){ syncFieldsFromResolved(); refreshTitleSources(); paintCustom(); }};
}
