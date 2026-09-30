# Cartoon Director: drawing, characters and long episodes

Open Local Studio and choose **Director**. In an existing window, reload with Ctrl+R after an update. The beginner view stays simple; drawing, rigging and finishing controls open when you need them.

**Local creative assistants** adds editable Bonsai shot drafts (Needle remains an experimental alternative), Bonsai writing (with Occamy/ZGCM alternatives), Kokoro speech, and R2T2 audio transcription.

**Generate speech** turns a line of dialogue into a local recording on the CPU, so it runs alongside image and video generation instead of waiting for the GPU. Choose the target shot, generate, preview the take, then **Attach generated voice to target shot**. Dialogue is limited to 1,000 characters; record long narration as separate takes. Editing the text after generating requires generating again. Every take is PCM16 WAV at 24,000 Hz, brought to a Ã¢Ë†â€™3 dB peak so lines arrive at a consistent level whichever engine made them.

Two engines are installed, and the right one depends on the line:

| | Kokoro | Chatterbox |
| --- | --- | --- |
| Speed | about 2.4Ãƒâ€” realtime | about 10Ãƒâ€” realtime |
| Voices | 28 installed English voices | its own voice, or one cloned from a sample |
| Control | speed, 0.5 to 1.5 | delivery 0.0Ã¢â‚¬â€œ1.5, pacing 0.1Ã¢â‚¬â€œ1.0 |
| Suits | narration and calm lines, fast enough to iterate on | lines that need effort or emotion |

**Kokoro** reads everything at one level. That is not a casting problem: speed is its only control, so a shouted line and a whispered line come out the same. Use it for narration and for anything you expect to rewrite several times.

**Chatterbox** performs the line. **Delivery** runs from 0.0 flat through 0.5 natural to 1.5 theatrical, and lowering **pacing** tightens a fast, urgent reading. It costs roughly ten seconds of work per second of speech, so treat it as rendering a line rather than drafting one.

**Reference voice** is how two characters share one engine. Chatterbox has a single default voice, so without a reference every character sounds identical. Upload a few seconds of any speech Ã¢â‚¬â€ a Kokoro take works well Ã¢â‚¬â€ and Chatterbox copies that voice while supplying the delivery Kokoro cannot. Generating a neutral sample per character in a different Kokoro voice gives each one a distinct, repeatable voice.

Recordings are written to the ComfyUI input folder Ã¢â‚¬â€ **Clear all photos & generations deletes them, including takes already attached to a shot**, so download a copy of anything you want to keep. There is no automatic lip-sync, word timing or speaker labelling. Chatterbox output carries Resemble AI's inaudible Perth watermark. Writing guides cover trailer beats/timing and character continuity. Review drafts before applying; the durable draft inbox keeps Accept/Reject history — **Clear decided drafts** frees slots and disables when nothing is clearable; project Undo restores edits. See [setup, comparison and limits](reports/studio/local-assistants-comparison-2026-09-20.md).

**Watch & edit a demo cartoon trailer** previews The Last Starlight, animation pass 2: six clips, 36 seconds, original 2D cutout animation and music. It adds continuous repair acting, articulated reach/contact poses, curved flight and eased scene dissolves. **Add demo as a new episode** preserves existing projects. Motion and transitions are baked into the clips; keep their order for the intended continuity. The revised source is `tools/studio/make-demo-trailer-v2.py`, and the MP4, project and storyboards are in `output/demo-starlight-v2`. The standalone preview is 30 fps; Director assembly is 24 fps.

The experimental **Hermes + Needle** reviewer is separate from the Director UI. Run `Start-Cartoon-Assistant.ps1` for the example, or pass `-Prompt` with a short review request. It uses Bonsai for reasoning, a local cartoon-review skill, and Needle on CPU through MCP. It temporarily switches to a 64K-context server with cache in system RAM, then restores the normal Bonsai server. Finish other Studio generation first. Results are written to `reports/studio/hermes-needle-review.json`; this reviewer does not render footage or apply project edits. See the [workflow gap log](reports/studio/cartoon-workflow-gaps.md).

## Timing & cutting check

Attaching a two-second clip to a seven-second shot does not give you seven seconds
of animation. The assembler holds the clip's last frame, and the rest of the shot
is a still image. **Timing & cutting check** measures that and reports it in the
episode's own numbers: how many shots, the total length, the average shot length,
and what share of the running time is really moving footage rather than a frozen
frame. Each note is a button that jumps to the shot it is about.

It flags:

- **Held frame** Ã¢â‚¬â€ the shot runs longer than the clip covering it. The note gives
  the frozen seconds, the clip length and a shot length that would fit. A held
  pose is allowed in animation, but a live hold keeps something moving: a blink,
  a breath, drifting steam. A frozen video frame does not.
- **Dialogue overrun** Ã¢â‚¬â€ attached audio is longer than the shot, so the line is
  cut off. The note gives the length the shot needs.
- **Rhythm** Ã¢â‚¬â€ three or more consecutive shots of exactly the same length, which
  turns the cutting into a metronome.
- **Too short** Ã¢â‚¬â€ under 0.7 seconds a cut registers as a flicker, not an image.
- **Staging** Ã¢â‚¬â€ the shot has no camera / framing note.
- **Screen direction** Ã¢â‚¬â€ a shot reads screen-right straight after a screen-left
  shot with no wide shot between to re-establish the geography, which is the
  180-degree line.

The average-shot-length band it compares against is roughly 4Ã¢â‚¬â€œ6.2 seconds, which
is where most modern sequences sit: about 4 seconds for action, 5 for adventure,
6 for science fiction. A deliberately fast-cut chase will read as "faster than
usual" and that is fine. These are editorial defaults, not rules you must follow;
they live in `RULES` at the top of `simple-editor/director-timing.js`.

The assistant's **Animation timing & cutting** writing guide covers the same
ground for planning rather than checking: timing and spacing in frames, holds
that stay alive, anticipation, follow-through, arcs, shot length and screen
direction. Pick it under Writing assistant.

## Build an episode

Scene cards include **Copy scene plan** (All / Fields only / Beat links only) so a new or split scene can reuse another scene's purpose, script and beat links. Undo restores. Split still leaves the plan on the original scene only.


1. Create an episode, then scenes and shots. On a shot card, **Earlier** / **Later** reorder inside the current scene; **Reorder in scene** jumps to Start, End, or After another shot in this scene (same shot id). **Move to scene** sends the shot to another scene (Place: End of scene, Start of scene, or After a chosen shot in the destination). The shot keeps its id, so Follow-shot episode audio, drafts and voice-take targets stay linked. **Copy to scene** places a new-id duplicate in another scene with the same Place choices; the original stays, and Follow-shot / drafts / voice-take targets stay on the original. Undo restores. **Split scene here** (not the first shot) moves that shot and later into a new scene after this one (default title: current title + " (cont.)", or Scene N); a rename prompt follows (Cancel keeps the default; scene title field stays editable). Shot ids stay so Follow-shot / drafts / voice-take targets stay linked, and the scene plan stays on the original. One Undo restores the split and rename. **Join with next scene** appends the next scene's shots onto this one and removes that scene record (its plan is dropped). Undo restores split/join. Set each shot's duration in seconds: 1Ã¢â‚¬â€œ3,600. The assembled episode can contain up to four hours.
2. Use drawing layers for 2D work, **3D character Ã‚Â· rig & animation** for a character, or attach finished media to the shot.
3. Set poses at different frames. The timeline is 24 frames per second: frame 24 is one second; a one-hour shot ends at frame 86,399. Choose constant speed, smooth motion or held poses.
4. Save the animation as the shot clip. Recording runs in real time at 960 Ãƒâ€” 540. A one-hour recording takes an hour: keep the window visible and the laptop awake. A Cancel button is available during recording and upload.
5. Attach optional shot audio, then open **Assemble episode** and choose **Assemble MP4**. The laptop draft is 640 Ãƒâ€” 360; larger export sizes do not add detail to a smaller source clip. The assembler trims clips or holds their last frame to match the shot duration. On a video shot card, **Hold last frame** (integer 0-3600s, presets 0/1/2/3) authors an intentional freeze after the trimmed clip; **Playback speed** (0.5x-2x, presets 0.5/0.75/1/1.25/1.5/2) retimes the trimmed clip in animatic and Assemble with clamp-on-type and a live Fit preview; Fit shot to clip uses floor(trimmed source / speed) then adds hold. Animatic caption/strip note hold and non-1x speed when set. Animatic **shot strip** under the scrubber shows shot blocks, colored transition overlaps, and hard-cut seams: click to seek; drag an overlap handle to change duration; use the type menu on an overlap or seam to change (or clear) the outgoing transition without leaving the preview (same types as the shot-card Transition control; Undo restores). Shot-card Transition select still works. Under **Production, cast & review**, **Copy title from shot** pulls another shot's title overlay for continuity — mode **Copy all** (text & style), **Style only** (keep local text), or **Text only** (keep local style); Undo restores. Animatic preview and Assemble burn-in both use the copied overlay.

An hour can be assembled from many short shots. You do not need a single uninterrupted recording. This duration applies to authored animation and assembled media; the separate AI video generator still produces short clips.

## Make a 3D character move

Use the included starter character or import a self-contained rigged GLB under 50 MB with up to 128 joints. Select a joint, change its rotation and save a keyframe. Imported animation clips are not brought into this editor; it creates its own shot animation.

Open **Joint limits, targets & loops** for:

- Per-axis rotation limits, and positioning a hand or foot with a two-joint limb solver.
- Root movement through the scene and existing face/shape controls from an imported model.
- Up to 32 named poses to save and recall.
- Repeating the interval between the first and last keyframe. Make those poses match for a seamless loop.

There are up to 120 pose keys per 3D shot. Drawing animation has its own repeat-keyframes option. **Use 3D preview pose** copies the displayed frame into the working pose before editing it. **Save camera view** keeps the framing. **Key camera** stores framing on the playhead (hold, linear, smooth, or bezier into the next key). On the Camera stage, **Copy camera** pulls another shot's camera onto this shot for multi-shot continuity — mode **Copy all** (framing & keys), **Keys only** (keep local saved view), or **Framing only** (keep local camera keys). **Key timing** defaults to **Stretch to shot length** (remaps 24 fps key frames from the source duration onto this shot) or **Keep absolute times**; Undo restores. **Download animated GLB** exports the skeleton, skin weights and authored rotation, root and shape animation for other 3D tools. Under the 3D frame scrubber, the **performance scrub strip** (Camera / Body / Face) shows camera keys, contact holds, prop attachments, body-travel weight, face keys, expression keys, eye tracks and mouth cues as clickable lanes so you can jump the playhead without digging through panels. **Show lanes** chips filter which groups appear (All / Camera / Body / Face / Expression / Eye / Mouth); the filter saves with the shot and Undo restores.

## Give a static character a skeleton

1. Open **Build skeleton & paint weights** and import an ordinary static GLB under 50 MB, with at most 200,000 vertices. Existing skinning, instances and shape-key geometry are not accepted by this builder. Apply mirrored or zero-scale transforms in a modeling app first.
2. Align the suggested joints with the model. The humanoid suggestion assumes Y-up and arms spread sideways. Rename joints, edit positions, pick a point on the mesh, add child joints or remove leaf joints. A parent must precede its child in the list.
3. Bind using smooth four-influence weights or rigid nearest-bone weights. These are distance-based starting weights and need inspection around shoulders, hips and overlapping surfaces.
4. Turn on the weight heatmap: red follows the selected joint; blue does not. Use Add or Remove influence, brush radius and strength to correct weights. Undo keeps the last five strokes.
5. Choose **Save bound rig to shot**, then pose and check the joints in the main 3D panel. This replaces that shot's prior rig animation; project Undo can restore it. Joint drafts save as you edit, but painted weights are kept only after saving the bound rig. Changing joints requires binding again.

## Saving and practical limits

Projects save in the current desktop/browser profile. Download project JSON backups regularly. JSON contains references to uploaded media, not copies of the files; preserve the ComfyUI input/output folders too. Browser and desktop project storage are separate.

Recordings stream to temporary disk storage instead of accumulating the entire video in memory. Larger recordings upload in small chunks, with progress and cancellation. The recorder caps output at 640 MB; keep several GB free for long recordings and episode assembly. Closing or hiding the recording view cancels capture. A crash or power loss can leave temporary files; this version does not resume interrupted recordings.

This is a local character-animation workflow, not a complete replacement for a professional 3D suite. Automatic facial creation, retargeting, cloth/hair simulation and persistent whole-body foot-balance constraints are not included. Keyed cameras and cross-shot camera copy are available; multi-character stage tools are limited compared with a full 3D suite. Face controls require shapes already in the model. Root motion affects the first root bone. Capture smoothness depends on model complexity and laptop load.

## Verification

The real-time one-hour synthetic 3D capture completed and uploaded 145,124,012 bytes. Its assembled MP4 contains 86,400 frames and lasts 3,600.021 seconds; decoded motion and browser seeking at 59:57Ã¢â‚¬â€œ59:58 both passed. Temporary recording storage was empty afterward. Results are in `reports/studio/director-hour-final-check.json` and `director-hour-playback-check.txt`.

That endurance run exposed a 2.314-second startup hold caused by waiting for the recorder's delayed start event. Drawing now begins when recording is requested. A targeted before/after desktop test removed the hold (10-second clips changed from 10.82 to 9.97 seconds), and a fresh 35-second moving capture and cancellation/cleanup checks passed. The full-hour endurance run was before this isolated timing correction; its raw WebM lasts 3,602.238 seconds, while episode assembly produces the requested one-hour MP4. Capture is real-time and may drop frames; the test captured 74,480 video packets, and assembly produced the 24 fps delivery file.

A one-hour animated GLB export preserves 15 joints, root motion and rotation with 86,401 samples, and passes the Khronos validator. Skeleton editing, binding, painting/undo, persistence, advanced pose controls, 2D/3D recording and upload cancellation also have automated checks. These results use synthetic fixtures, not personal media, and do not guarantee the same smoothness for every imported character.

Implementation references: [Three.js skinning](https://threejs.org/docs/pages/SkinnedMesh.html), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html), [private disk storage](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), and [aiohttp streaming](https://docs.aiohttp.org/en/stable/streams.html).


## Drawing finish and planted-foot walk (September 20)

In a shot, open **Drawing & layers**. The **Brush finish** menu offers solid ink,
tapered ink, fine selective detail, and shadow/highlight marks clipped to existing
paint on the selected layer. Mark strength controls opacity. Place highlights on
light-facing edges, use darker marks under overlapping parts, and use fine detail
for seams and small wear marks. These are manually painted lighting marks, not
automatic surface relighting. **Check light and dark values** is a preview-only
grayscale view; saved images and clips retain their colors. Finishes apply to the
brush, while geometric tools retain their existing behavior. **Tablet pressure controls width** and **Tablet pressure controls opacity** (both on by default) scale brush and eraser size and paint/erase strength from stylus force; mouse and finger stay at full Brush size and opacity so existing mouse work is unchanged. Untick either box to disable that channel; opacity-only capture keeps full width. Tapered and detail finishes still multiply on top of pressure. Strokes store optional pressureOpacity / pressureWidth flags with the pressure channel so replay matches capture. Soft pressureOpacity strokes use max-opacity compositing inside the stroke bitmap so overlapping round segments keep the intended per-point opacity (not flow-like alpha pile-up); the finished bitmap still blits once for brush source-over / eraser destination-out. **Minimum opacity (%)** (0-90, default 0) floors light stylus fades when opacity pressure is on: alpha maps into [floor, 1] and is stored on the stroke as opacityFloor so replay matches; 0 keeps the prior full fade. **Stroke stabilizer** (0-100, default off) is a lazy-mouse lag for freehand brush and eraser only: the stored path trails the tip so shaky lines smooth out; lift completes a short catch-up to the tip. Line, rectangle and ellipse ignore it. **Show neighboring drawings** and **Onion skin depth (neighbors)** (1-5, when onion is on) are saved on the shot drawing (`drawing.onion` / `drawing.onionDepth`, like `over3d`) so reload keeps the artist choice; depth 1 matches the old nearest-only guide and farther neighbors fade (previous red, next blue). **Draw correction overlay** is also saved on the drawing (`drawing.correctionOverlay`; omit/false = off) so reload keeps correction-mode drawing into cel corrections rather than strokes. Onion skins and corrections remain guides only and never render into the clip. **Clear selected layer** disables when the selected layer has nothing clearable at the current cel frame (locked, held without a cel start, or already empty); when Draw correction overlay is on it clears corrections instead of strokes. Undo restores. Cel timeline **Clear this cel’s corrections** likewise disables when the current cel has no corrections (or the layer is locked / no cel start); Undo restores via the same drawing commit.

In **Animate rig Ã¢â€ â€™ Planted-foot walk**, choose an unparented torso and two feet.
Each chain must be torso Ã¢â€ â€™ upper leg Ã¢â€ â€™ lower leg Ã¢â€ â€™ foot. Use a bent-knee resting
pose. Set distance per cycle, lift and cycle length, then Apply walk. Play poses
and Save animation as shot clip both use the same sampler. A planted foot holds
its world position for 60% of the cycle; the remaining 40% swings to its next
contact. Feet stay level. Excessive reach is rejected when applying the preset
and reported during preview if later pose edits make it unreachable. Walking is
currently a side-view 2D layer-rig tool; it is not an automatic 3D gait generator.
Torso translation in other keyframes can still exceed reach; check the whole shot.

All marks and walk settings are stored in project backups; older drawings need
no migration. Removing the walk preserves saved keyframes. Large travel can take
a character outside the 960 Ãƒâ€” 540 drawing stage: keep shots short or reduce stride.

Implementation references: [Canvas compositing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation)
and [Blender contact/recoil/passing walk poses](https://docs.blender.org/api/htmlI/x8053.html).

Trailer pass 3 lives in `output/demo-starlight-v3/the-last-starlight-v3.mp4`.
Its authored animation remains baked video; the new editor controls are reusable
on your own layered drawings, rather than editable controls over the demo pixels.

**Animation-pass gates:** Blocking → Breakdowns → Polish are manual craft approvals on saved revisions. Production overview lists B/Bd/P (with gate filter); Delivery reminds when Animation is Ready/Approved without those passes. Flips never invent revisions or auto-verify craft.


### Remove asset confirm (2026-09-29)
Cast & assets **Remove asset** confirms before delete (set kits / rig setups / linked shots called out; Undo restores). Helpers: `countAssetLinkedShots`, `removeAssetConfirmMessage`. Distinct from set-kit Apply confirm.

### Set-kit Apply confirm + disabled (2026-09-29)
Body → Set layout → Apply kit disables when no kit / missing mesh refs; Replace world confirms (Undo restores). Helpers: `setKitApplyGate`, `setKitApplyConfirmMessage`.

### Remove title preset confirm (2026-09-29)
Production → Title card / lower-third style → custom **Remove preset** confirms before delete (names preset + role; linked-shot `styleId` clear called out; Undo restores). Helpers: `countTitleStyleLinkedShots`, `removeTitleStyleConfirmMessage`. Distinct from Clear title style overrides and copy-from-shot.

### Clear title style overrides disabled (2026-09-29)
Production → Title card / lower-third style → **Clear title style overrides** disables when the shot has no durable `titleOverlay` fields (subtitle-only fallback does not count). Title explains clearable field count. `clearableTitleOverlayCount` + `syncClearOverridesButton`. Undo restores. Distinct from Remove title preset and from copy title overlay.


### Clear motion review guides disabled (2026-09-29)
3D motion paths & contact review → **Clear motion review guides** disables when no session guide set is on the scene. Title shows the clearable count (0/1). Handler no-ops with a status message when empty. Syncs after calculate, clear, animation-change refresh, and panel open. Guides stay session-only (excluded from recording/export); no project JSON.
### Clear unsaved frame marks disabled (2026-09-29)
Animation passes → revisions & frame review → **Clear unsaved frame marks** disables when there are no session annotation strokes (and no in-progress stroke). Title shows the clearable count. Handler no-ops with a status message when empty. Distinct from Resolve revision note (saved marks stay on the note).

### Assemble export gates (2026-09-29)
**Assemble episode** → **Assemble MP4** stays disabled until every shot has attachable media (Delivery Assembly checks: clip or finished storyboard panels). Title names the first issue. **Check exported audio loudness** stays disabled until a finished Assemble export exists (and while Assemble is running). Soft-mux remux / Burn titles unchanged. Helpers: `assembleReadyGate`, `assembleLoudnessGate`; `syncAssembleExportButtons` on poll + project refresh.

### Assistant Apply disabled when empty / invalid (2026-09-29)
Apply / Download controls in Local creative assistants stay disabled until the editable result and target are valid (empty draft, wrong project, missing target, no voice audio, or no eye shape for expression script). Titles explain why. `syncApplyButtons` updates live as you edit. Project Undo still restores applied text / shot / audio / keys.

### Copy reference video from another shot (2026-09-29)
Silhouette & reference review **Copy reference from shot**: Copy all (file & layout), Layout only (keep local file), or File only (keep local layout). Continuity with Camera / Title / Acting copy. Undo restores. Helpers: `shotHasReferenceVideo`, `listReferenceVideoSources`, `copyReferenceVideoFromShot`.

### Copy transition from another shot (2026-09-29)
Shot card **Transition into next shot** gained **Copy transition from shot** (Camera / Title / Reference / Acting parity). Modes: Copy all | Type only | Duration only. Sources are other episode shots with a durable overlap transition (dissolve / wipe / slide / fade / circle). Hard cuts are not sources. Copy button disables when no sources. Undo via Project Undo. Distinct from animatic strip type picker and from Clear transition.
### Clear mouth morph map disabled (2026-09-29)
Face / Lip-sync mouth morph map ? **Clear mouth morph map** disables when `rig.mouthMap` has no entries. Title shows the clearable count. Handler no-ops with a status message when empty. Helper: `clearableMouthMapCount`. Distinct from denser Face style polish.

### Stamp missing mesh hashes disabled (2026-09-29)
Body **Set layout** **Stamp missing mesh hashes** disables when no stage mesh is missing a `contentHash`. Title shows how many meshes could still be stamped from matching Props-with-GLB cards. Distinct from set-kit Apply (already gated) and from asset-library Backfill.


### Link file meshes disabled (2026-09-29)
Body **Set layout** **Link file meshes to library** disables when no file-only stage mesh remains (no `libraryAssetId`). Title shows how many meshes could still be linked to Props-with-GLB cards. Distinct from Stamp missing mesh hashes and from set-kit Apply.
## Remove selected layer disabled-when-not-removable (2026-09-29)

Draw board **Remove selected layer** disables when the drawing has only one layer, the selected layer is locked, or another layer parents to it via `rig.parent`. `drawingLayerRemoveGate` drives disabled + title; Undo still restores a successful remove. Distinct from Clear selected layer (content wipe).


## Add / Duplicate layer disabled at MAX_LAYERS (2026-09-29)

Draw board **Add layer** and **Duplicate layer** disable when the drawing already has 12 layers (`MAX_LAYERS`). `drawingLayerAddGate` drives disabled + title; Undo still restores a successful add/duplicate. Distinct from Remove selected layer (keep-one / locked / child-parent).

## Detach drawing-from-joint disabled when nothing parented (2026-09-29)
Body / Face **Drawing follows a joint** **Detach drawing from joint** disables when the chosen drawing layer has no `joint` (already screen space). Draw board **Moves with joint** → **None** is guarded the same way (no empty undo). `drawingDetachFromJointGate(layer)` drives disabled + title; `syncDetachFollowButton` on layer select / refreshFollow. Undo still restores a successful detach.

## Parent drawing-to-joint disabled when no layer or joint chosen (2026-09-29)
Body / Face **Drawing follows a joint** **Parent layer to selected joint** disables when no Draw layer is chosen or the selected 3D joint is not in view. Draw board **Moves with joint** attach is guarded the same way. `drawingParentToJointGate(layer, jointName)` drives disabled + title; `syncDetachFollowButton` also syncs the Parent button on layer select / refreshFollow / joint change. Undo still restores a successful parent.

## Apply prop placement nudge disabled when no stage prop (2026-09-29)
Body **Stage · prop placement** **Apply prop placement nudge** and the ±X / Y / Z / Yaw buttons disable when the shot has no saved stage prop or none is selected. Title shows the gate reason (add a prop first, or select one). Custom XYZ / yaw / scale fields and the prop dropdown grey the same way when empty. Keyboard nudges stay silent when nothing is selected. Undo still restores placement after a successful nudge. Distinct from Parent / Detach / Add / Remove layer gates.