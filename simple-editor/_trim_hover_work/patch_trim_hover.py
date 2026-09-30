# -*- coding: utf-8 -*-
"""Patch overview helpers + media-trim scrub hover time chip. ENGINE ONLY."""
from pathlib import Path

ROOT = Path(r"D:\dev\image thing")
OVERVIEW = ROOT / "simple-editor" / "director-audio-overview.js"
DIRECTOR = ROOT / "simple-editor" / "director.js"
CSS = ROOT / "simple-editor" / "director.css"
CHECK = ROOT / "tools" / "studio" / "director-audio-overview-check.mjs"

# --- 1) director-audio-overview.js: add sibling helpers, refactor hover draw ---
ov = OVERVIEW.read_text(encoding="utf-8")

helpers = '''export function formatOverviewTime(sec){
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  if(m > 0){
    const whole = Math.floor(r);
    const frac = Math.round((r - whole) * 100);
    return `${m}:${String(whole).padStart(2, '0')}.${String(frac).padStart(2, '0')}`;
  }
  return `${r.toFixed(2)}s`;
}

/** Map pointer clientX within an element rect to [0, duration] seconds. */
export function hoverTimeFromClientX(clientX, rect, duration){
  const w = Math.max(1, Number(rect?.width) || 0);
  const left = Number(rect?.left) || 0;
  const x = Math.max(0, Math.min(w, (Number(clientX) || 0) - left));
  const d = Math.max(0, Number(duration) || 0);
  if(d <= 0) return 0;
  return (x / w) * d;
}

/**
 * Dashed ghost + time chip at hoverTime (overview canvas + media-trim scrub).
 * Pass xOf(sec) for windowed overview mapping, or duration for linear [0,duration]\u2192[0,width].
 */
export function drawHoverTimeChip(ctx, hoverTime, {
  width,
  height,
  xOf = null,
  duration = null,
  suffix = ' \\u00b7 seek',
  chipTop = 4,
} = {}){
  if(!ctx || hoverTime == null || !Number.isFinite(hoverTime)) return;
  const w = Math.max(1, Math.floor(Number(width) || 0));
  const h = Math.max(1, Math.floor(Number(height) || 0));
  let hx;
  if(typeof xOf === 'function') hx = xOf(hoverTime);
  else {
    const d = Math.max(0, Number(duration) || 0);
    hx = d > 0 ? (hoverTime / d) * w : 0;
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(hx + 0.5, 0);
  ctx.lineTo(hx + 0.5, h);
  ctx.stroke();
  ctx.setLineDash([]);
  const label = formatOverviewTime(hoverTime) + (suffix || '');
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const pad = 5;
  const tw = ctx.measureText(label).width + pad * 2;
  const th = 16;
  let lx = hx + 8;
  if(lx + tw > w - 2) lx = hx - tw - 8;
  lx = Math.max(2, Math.min(w - tw - 2, lx));
  const ty = Math.max(2, Number(chipTop) || 4);
  ctx.fillStyle = 'rgba(10, 16, 26, 0.88)';
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(lx, ty, tw, th);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8f0ff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx + pad, ty + th / 2);
  ctx.restore();
}

'''

# Fix the suffix default — write real middle-dot via unicode escape in the file content
helpers = helpers.replace("suffix = ' \\u00b7 seek'", "suffix = ' \u00b7 seek'")
helpers = helpers.replace("[0,duration]\\u2192[0,width]", "[0,duration]\u2192[0,width]")

old_fmt_start = ov.find("export function formatOverviewTime")
old_ab = ov.find("export function overviewAbRegion")
if old_fmt_start < 0 or old_ab < 0:
    raise SystemExit("markers missing for formatOverviewTime / overviewAbRegion")
if "export function hoverTimeFromClientX" in ov:
    print("helpers already present; skipping overview helper insert")
else:
    ov = ov[:old_fmt_start] + helpers + ov[old_ab:]
    print("inserted hoverTimeFromClientX + drawHoverTimeChip")

# Replace inline hover block with helper call
# Find the hover ghost block uniquely
ghost = "// Hover ghost (spectrum_app tooltip-at-mouse analogue)"
gi = ov.find(ghost)
if gi < 0:
    raise SystemExit("hover ghost marker missing")
# end at playhead needle comment
needle = ov.find("// Playhead needle", gi)
if needle < 0:
    raise SystemExit("playhead needle marker missing after hover")
# Check if already refactored
block = ov[gi:needle]
if "drawHoverTimeChip(ctx, hoverTime" in block:
    print("drawOverviewCanvas already uses drawHoverTimeChip")
else:
    replacement = (
        "// Hover ghost (spectrum_app tooltip-at-mouse analogue)\n"
        "  drawHoverTimeChip(ctx, hoverTime, {width: w, height: h, xOf});\n"
        "  "
    )
    ov = ov[:gi] + replacement + ov[needle:]
    print("refactored drawOverviewCanvas hover to drawHoverTimeChip")

OVERVIEW.write_text(ov, encoding="utf-8", newline="\n")
print("wrote", OVERVIEW)

# --- 2) director.js: import + wire trim scrub hover ---
dj = DIRECTOR.read_text(encoding="utf-8")

old_imp = "import {audioOverviewControls} from './director-audio-overview.js';"
new_imp = "import {audioOverviewControls, formatOverviewTime, hoverTimeFromClientX, drawHoverTimeChip} from './director-audio-overview.js';"
if "hoverTimeFromClientX" in dj and "drawHoverTimeChip" in dj.split("from './director-audio-overview.js'")[0]:
    print("director.js import already updated")
elif old_imp in dj:
    dj = dj.replace(old_imp, new_imp, 1)
    print("updated director.js import")
else:
    raise SystemExit("audioOverviewControls import not found")

# Replace mediaTrimScrub function body carefully
start = dj.find("/** Duration scrub bar with in/out handles")
end = dj.find("\n\nfunction render(", start)
if start < 0 or end < 0:
    raise SystemExit(f"mediaTrimScrub bounds missing start={start} end={end}")

new_scrub = r'''/** Duration scrub bar with in/out handles + cached audio/luminance peaks under the track. */
function mediaTrimScrub(parent, shot, {change}){
  const box=document.createElement('div');box.className='media-trim-scrub';box.setAttribute('role','group');box.setAttribute('aria-label','Source in and out scrub');
  const status=document.createElement('p');status.className='hint media-trim-scrub-status';status.setAttribute('role','status');status.textContent='Loading clip duration for scrub handles\u2026';
  const track=document.createElement('div');track.className='media-trim-track';
  const peaksCanvas=document.createElement('canvas');peaksCanvas.className='media-trim-peaks';peaksCanvas.setAttribute('aria-hidden','true');peaksCanvas.width=600;peaksCanvas.height=48;
  const rangeFill=document.createElement('div');rangeFill.className='media-trim-range';
  const hoverCanvas=document.createElement('canvas');hoverCanvas.className='media-trim-hover';hoverCanvas.setAttribute('aria-hidden','true');hoverCanvas.width=600;hoverCanvas.height=48;
  const inRange=document.createElement('input');inRange.type='range';inRange.min='0';inRange.step='0.001';inRange.disabled=true;inRange.setAttribute('aria-label','Source in handle');
  const outRange=document.createElement('input');outRange.type='range';outRange.min='0';outRange.step='0.001';outRange.disabled=true;outRange.setAttribute('aria-label','Source out handle');
  track.append(peaksCanvas,rangeFill,hoverCanvas,inRange,outRange);box.append(status,track);parent.append(box);
  let peaksInfo=null;
  let hoverTime=null;
  let clipDuration=null;
  const alive=()=>box.isConnected;
  function peaksNote(){
    if(!peaksInfo)return 'loading peaks\u2026';
    if(peaksInfo.kind==='audio')return 'audio waveform';
    if(peaksInfo.kind==='luminance')return 'silent audio \u00b7 luminance strip';
    if(peaksInfo.kind==='silent')return peaksInfo.note||'silent (scrub only)';
    return peaksInfo.note||'peaks unavailable';
  }
  function redrawHover(){
    const w=hoverCanvas.clientWidth||hoverCanvas.width||600;
    const h=hoverCanvas.clientHeight||hoverCanvas.height||48;
    if(hoverCanvas.width!==w)hoverCanvas.width=w;
    if(hoverCanvas.height!==h)hoverCanvas.height=h;
    const ctx=hoverCanvas.getContext('2d');
    if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    if(hoverTime==null||!Number.isFinite(clipDuration)||clipDuration<=0)return;
    drawHoverTimeChip(ctx,hoverTime,{width:w,height:h,duration:clipDuration,suffix:''});
  }
  function paint(duration){const trim=mediaTrim(shot.media);const inn=trim.sourceIn;const out=scrubOutHandleSeconds(trim.sourceOut,duration);inRange.max=String(duration);outRange.max=String(duration);inRange.value=String(inn);outRange.value=String(out);const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';const outLabel=trim.sourceOut==null?'end of file':trim.sourceOut.toFixed(3)+'s';const hoverNote=hoverTime==null?'':(' \u00b7 hover '+formatOverviewTime(hoverTime));status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+outLabel+' \u00b7 '+peaksNote()+hoverNote+' (scrub writes the same source in/out as the numeric fields; works with playback speed and hold; hover time).';if(peaksInfo?.peaks)drawMediaPeaks(peaksCanvas,peaksInfo.peaks,peaksInfo.kind);redrawHover();}
  function livePaint(duration){let inn=Number(inRange.value);let out=Number(outRange.value);if(inn>=out){if(document.activeElement===inRange)inn=Math.max(0,out-0.001);else out=Math.min(duration,inn+0.001);inRange.value=String(inn);outRange.value=String(out);}const left=(inn/duration)*100;const right=(out/duration)*100;rangeFill.style.left=left+'%';rangeFill.style.width=Math.max(0,right-left)+'%';const hoverNote=hoverTime==null?'':(' \u00b7 hover '+formatOverviewTime(hoverTime));status.textContent='Clip '+duration.toFixed(2)+'s \u00b7 In '+inn.toFixed(3)+'s \u00b7 Out '+out.toFixed(3)+'s'+hoverNote+' (release to save).';redrawHover();}
  function commit(duration){change(()=>{const next=scrubHandlesToTrim(Number(inRange.value),Number(outRange.value),duration);setMediaTrim(shot.media,next.sourceIn,next.sourceOut);});}
  probeClipDuration(shot.media).then(async duration=>{
    if(!alive())return;
    if(!Number.isFinite(duration)||duration<=0){status.textContent='Could not read clip duration for scrub handles. Use the numeric source in/out fields.';return;}
    clipDuration=duration;
    inRange.disabled=false;outRange.disabled=false;paint(duration);
    inRange.oninput=()=>livePaint(duration);outRange.oninput=()=>livePaint(duration);
    inRange.onchange=()=>commit(duration);outRange.onchange=()=>commit(duration);
    track.onpointermove=e=>{
      hoverTime=hoverTimeFromClientX(e.clientX,track.getBoundingClientRect(),duration);
      livePaint(duration);
    };
    track.onpointerleave=()=>{hoverTime=null;paint(duration);};
    try{
      peaksInfo=await loadMediaPeaks(shot.media,duration,alive);
      if(!alive())return;
      if(peaksInfo?.peaks)drawMediaPeaks(peaksCanvas,peaksInfo.peaks,peaksInfo.kind);
      paint(duration);
    }catch(e){
      if(!alive())return;
      peaksInfo={kind:'none',peaks:null,note:String(e?.message||e)};
      paint(duration);
    }
  });
}
'''

dj = dj[:start] + new_scrub + dj[end:]
DIRECTOR.write_text(dj, encoding="utf-8", newline="\n")
print("wrote", DIRECTOR)

# --- 3) CSS ---
css = CSS.read_text(encoding="utf-8")
if ".media-trim-hover" not in css:
    old = """.media-trim-peaks{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;border-radius:5px}
.media-trim-range{position:absolute;top:0;bottom:0;left:0;width:100%;background:rgba(69,102,142,.55);border-radius:5px;pointer-events:none;z-index:1}
.media-trim-track input[type=range]{position:absolute;inset:0;width:100%;height:48px;margin:0;padding:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none;accent-color:#f7c977;z-index:2}"""
    new = """.media-trim-peaks{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:0;border-radius:5px}
.media-trim-range{position:absolute;top:0;bottom:0;left:0;width:100%;background:rgba(69,102,142,.55);border-radius:5px;pointer-events:none;z-index:1}
.media-trim-hover{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;z-index:2;border-radius:5px}
.media-trim-track{cursor:crosshair}
.media-trim-track input[type=range]{position:absolute;inset:0;width:100%;height:48px;margin:0;padding:0;background:transparent;pointer-events:none;-webkit-appearance:none;appearance:none;accent-color:#f7c977;z-index:3}"""
    if old not in css:
        raise SystemExit("CSS block for media-trim not found exactly")
    css = css.replace(old, new, 1)
    CSS.write_text(css, encoding="utf-8", newline="\n")
    print("wrote", CSS)
else:
    print("CSS already has media-trim-hover")

# --- 4) Tests ---
chk = CHECK.read_text(encoding="utf-8")
old_imp_chk = """import {
  maxPoolPeaks,
  normalizePeaksDisplay,
  AUDIO_OVERVIEW_BINS,
  formatOverviewTime,
  overviewAbRegion,
  overviewNeedleTime,
} from '../../simple-editor/director-audio-overview.js';"""
new_imp_chk = """import {
  maxPoolPeaks,
  normalizePeaksDisplay,
  AUDIO_OVERVIEW_BINS,
  formatOverviewTime,
  hoverTimeFromClientX,
  drawHoverTimeChip,
  overviewAbRegion,
  overviewNeedleTime,
} from '../../simple-editor/director-audio-overview.js';"""
if "hoverTimeFromClientX" not in chk:
    if old_imp_chk not in chk:
        raise SystemExit("check import block not found")
    chk = chk.replace(old_imp_chk, new_imp_chk, 1)
    tests = """
assert.equal(hoverTimeFromClientX(50, {left: 0, width: 100}, 10), 5);
assert.equal(hoverTimeFromClientX(-5, {left: 0, width: 100}, 10), 0);
assert.equal(hoverTimeFromClientX(250, {left: 0, width: 100}, 10), 10);
assert.equal(hoverTimeFromClientX(25, {left: 10, width: 100}, 4), 0.6);
assert.equal(hoverTimeFromClientX(0, {left: 0, width: 100}, 0), 0);
{
  const calls = [];
  const ctx = {
    save(){calls.push('save');},
    restore(){calls.push('restore');},
    beginPath(){},
    moveTo(){},
    lineTo(){},
    stroke(){},
    fill(){},
    rect(){},
    fillText(t){calls.push(['text', t]);},
    setLineDash(){},
    measureText(t){return {width: String(t).length * 6};},
    strokeStyle: '', fillStyle: '', lineWidth: 0, font: '', textBaseline: '',
  };
  drawHoverTimeChip(ctx, 12.5, {width: 200, height: 48, duration: 25, suffix: ''});
  assert.ok(calls.includes('save'));
  assert.ok(calls.includes('restore'));
  assert.deepEqual(calls.find(c => Array.isArray(c) && c[0] === 'text'), ['text', '12.50s']);
  drawHoverTimeChip(ctx, 65.5, {width: 200, height: 48, xOf: t => t, suffix: ' \\u00b7 seek'});
}
""".replace("suffix: ' \\u00b7 seek'", "suffix: ' \u00b7 seek'")
    # insert before final console.log
    marker = "console.log('Audio overview + mmathen vendor checks passed"
    mi = chk.find(marker)
    if mi < 0:
        raise SystemExit("console.log marker missing in check")
    chk = chk[:mi] + tests + "\n" + chk[mi:]
    # update console.log message slightly
    chk = chk.replace(
        "Audio overview + mmathen vendor checks passed: max-pool, normalize, needle/A-B helpers, crossfade helpers, soft-seek, vendored headers present, build_* omitted.",
        "Audio overview + mmathen vendor checks passed: max-pool, normalize, needle/A-B helpers, hover time chip helpers, crossfade helpers, soft-seek, vendored headers present, build_* omitted.",
    )
    CHECK.write_text(chk, encoding="utf-8", newline="\n")
    print("wrote", CHECK)
else:
    print("check already has hoverTimeFromClientX")

print("PATCH OK")
