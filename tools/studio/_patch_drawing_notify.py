from pathlib import Path
p = Path('simple-editor/director-drawing.js')
t = p.read_text(encoding='utf-8')
old = "notify(selected().name+' follows '+name+' in the 3D preview and recording. Download animated GLB embeds it on that joint.');"
new = "notify(selected().name+' follows '+name+' in the 3D preview and recording. Download animated GLB embeds it as a mesh-aware card on that joint (joint bounds + depth).');"
if old not in t:
    raise SystemExit('drawing notify miss')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8', newline='')
print('drawing.js notify updated')
