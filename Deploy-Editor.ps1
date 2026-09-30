$ErrorActionPreference = 'Stop'
$staticRoot = Join-Path $PSScriptRoot 'ComfyUI_windows_portable/python_embeded/Lib/site-packages/comfyui_frontend_package/static'
$editorRoot = Join-Path $staticRoot 'qwen-editor'
New-Item -ItemType Directory -Force -Path $editorRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'simple-editor/qwen-editor.html') -Destination $staticRoot -Force
foreach ($name in @('app.js', 'image-controls.js', 'mesh-finishing.js', 'mesh-art.js', 'studio-client.js', 'parametric.html', 'parametric.js', 'director.html', 'director.css', 'director.js', 'director-links.js', 'director-storage.js', 'director-references.js', 'director-review.js', 'director-lipsync.js', 'director-project.js', 'director-planning.js', 'director-manuscript.js', 'director-episode-audio.js', 'director-audio-edit.js', 'director-audio-overview.js', 'director-audio-meter.js', 'director-audio-loudness.js', 'director-beat-markers.js', 'director-title-styles.js', 'director-planning-state.js', 'director-production.js', 'director-revisions.js', 'director-animatic.js', 'director-delivery.js', 'director-timing.js', 'director-drawing.js', 'director-cels.js', 'director-exposure.js', 'director-art-tools.js', 'director-walk.js', 'director-rig.js', 'director-motion.js', 'director-animation-craft.js', 'director-channels.js', 'director-path2d.js', 'director-path3d.js', 'director-room.js', 'director-set-kit.js', 'director-library-prop.js', 'director-prop-placement.js', 'director-hands.js', 'director-grip-target.js', 'director-eye-target.js', 'director-features.js', 'director-starter-upgrade.js', 'director-deformation.js', 'director-stage.js', 'director-rig-library.js', 'director-actor-library.js', 'director-facial-acting.js', 'director-motion-review.js', 'director-performance-state.js', 'director-performance-engine.js', 'director-performance-ui.js', 'director-recorder.js', 'director-upload.js', 'director-assistant.js', 'director-assistant-drafts.js', 'director-voice-takes.js', 'director-3d-state.js', 'director-rotation.js', 'director-3d-engine.js', 'director-3d.js', 'director-ik3d.js', 'director-skeleton.js', 'director-skeleton-state.js', 'director-skeleton-engine.js', 'style.css', 'cleanup.js', 'tracking.js', 'video.html', 'video.js', 'mesh.html', 'mesh.js', 'animate.api.json', 'restyle.api.json')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "simple-editor/$name") -Destination $editorRoot -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'simple-editor/vendor') -Destination $editorRoot -Recurse -Force
foreach ($name in @('demo-starlight.json', 'demo-starlight.png')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "simple-editor/$name") -Destination $editorRoot -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'workflows/Qwen Edit 2511 - Quality 8-step.api.json') -Destination (Join-Path $editorRoot 'quality.api.json') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'workflows/Qwen Edit 2511 - Quality 8-step.json') -Destination (Join-Path $editorRoot 'quality.json') -Force
Write-Output 'Qwen Studio deployed: http://127.0.0.1:8188/qwen-editor.html'



