# Cartoon planning in Director

Open Cartoon Director in Local Studio. Existing episodes keep their original picture and audio behavior. The new panels start collapsed, and no AI model is needed for planning.

1. **Story Room**: write the premise, audience, theme, world rules and ending. Add story beats, move them earlier or later, or **Place** them at Start / End / After another beat (**Reorder beat**; same beat id; Undo restores), **Remove beat (confirms first; Undo restores)** — clears scene links and payoff setup links to that beat — **Clear all beats** (disabled when empty; confirms first; Undo restores) wipes the whole Story Room beat list and clears scene beat links — and link a payoff to its setup. Distinct from episode-audio beat markers. Act / sequence is a freeform label, not a required story formula.
2. **Character, set & asset library**: add character wants, needs, flaws and change under Character arc & production readiness. Track whether each asset is ready. Use the existing shot cast controls to select which assets that shot requires.
3. **Scene plan**: identify the scene's purpose, character goal, obstacle, turn and outcome. Write its script and select the beats it covers. **Copy scene plan** pulls fields and/or linked beats from another scene (All / Fields only / Beat links only); Undo restores. Useful after Split, which keeps the plan on the original scene only.
4. **Storyboard panels & sound tracks**: add successive drawings inside one shot. Upload a drawing per panel, or use Add main drawing as panel after saving a drawing with the existing drawing tools. Reorder with Panel earlier / later, or **Place** them at Start / End / After another panel (**Reorder panel**; same panel id and frames; Undo restores), duplicate, **Remove panel (confirms first; Undo restores)**, and time panels in frames at 24 fps. Fit panel timing to shot distributes the shot's available frames proportionally.
5. Choose **Storyboard panels** as Picture source for rough preview/export, or **Finished shot / main attachment** to use the finished clip. The finished clip is kept when switching. Panel frames must exactly match the shot duration for export; rough preview holds the final panel if the plan is short.
6. **Sound tracks**: layer dialogue, music and effects with start times relative to the shot and levels from 0 to 1. Main attached audio still replaces clip audio. Additional tracks mix with that base and stop at the shot cut. Empty tracks remain planning notes. Keep combined levels low enough to avoid clipping. These shot tracks stop at cuts. For continuous sound, use the Episode audio timeline described below. Reorder with Track earlier / later, or **Place** them at Start / End / After another track (**Reorder track**; same track id and cues; Undo restores). **Remove sound track (confirms first; Undo restores)**.
7. **Approve current shot plan**: records the current story, linked beats, scene script, shot timing and linked asset designs. Later changes raise a Planning checks reminder (shot-linked reminders are clickable and open that shot's plan, same jump as Delivery; episode beat notes stay as text); they do not overwrite existing animation or prevent draft exports. Approve again after reviewing. Asset readiness is checked separately. These are record checks, not an AI judgment of story or animation quality.
8. **Export planning document** downloads a readable plan. Download project includes the editable planning records, panels and sound references. As before, media files are references rather than embedded copies; keep the source files and project backups.

The local assistant's **Use target shot brief** and image/video build briefs now include the premise, world rules and scene purpose/goal/turn. No model runs automatically.

Limits: 500 beats per episode, 300 panels per shot, 12 additional sound tracks per shot. Existing shot and episode duration limits remain. Shot cards can send a shot to another scene (**Move to scene**, Place: End / Start / After shot N in the destination) or **Copy to scene** (new shot id; original stays; same Place choices); Earlier / Later stay in-scene. **Reorder in scene** jumps a shot to Start / End / After another shot in the same scene (same shot id; Undo restores). **Split scene here** (not the first shot) moves that shot and later into a new scene after this one with a fresh scene id and default title "Title (cont.)" / Scene N; a rename prompt follows (Cancel keeps the default). Shot ids stay. **Join with next scene (confirms first; Undo restores)** appends the following scene's shots and removes that scene record (its plan is dropped). Empty source scenes are allowed. Linked episode audio Follow-shot clips keep the same shot id and rematch their episode start. Each panel is encoded sequentially on CPU, so many short panels increase export time. Browser preview can buffer; review the exported movie for final timing and sound.

## Research used

- [Toon Boom pre-production workflow](https://learn.toonboom.com/modules/animation-workflow/topic/pre-production): script, designs, boards, voice and animatic iteration.
- [Toon Boom storyboard structure](https://docs.toonboom.com/help/storyboard-pro-24/storyboard/structure/about-storyboard-structure.html): multiple panels describe the actions inside a shot. Director retains its existing scene/shot naming.
- [Pixar in a Box](https://www.khanacademy.org/pixar): character and story structure planning.
- [Autodesk task pipelines](https://help.autodesk.com/cloudhelp/ENU/SG-Producer/files/pr-scheduling-tasks/SG_Producer_pr_scheduling_tasks_pr_tasks_pipeline_steps_html.html): linked asset and shot work.
- [FFmpeg filter reference](https://ffmpeg.org/ffmpeg-filters.html): audio trimming, timestamp reset, delay, padding and mixing. Installed filter help was also checked.
- [HTML media seeking](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime): preview timing and seeking.

## Verification

`tools/studio/director-planning-check.mjs` verifies legacy projects, links, revision and asset reminders, panel timing boundaries, assembly offsets, JSON round trips, story-beat Place/Reorder (Start / End / After), storyboard panel Place/Reorder (Start / End / After), sound-track Place/Reorder (Start / End / After), destructive Remove confirms (beat/panel/track), and invalid imports. Existing project, production, animatic and delivery checks also pass.

`tools/studio/director-planning-render-check.py` uses only synthetic solid-color boards and a tone. It verifies 72 video frames with a fractional-second panel boundary, correct picture order, continuous voice across the cut, delayed sound mixing and invalid-request rejection. Results: `reports/studio/director-planning-render-check.json`.

UI checks covered creation, beat/scene linking, upload of both panels and an audio track, preview seeking across the cut, real assembly, reload persistence and undo. Packaged desktop smoke tests passed for playback, project preservation, drawing recording, skeleton loading and navigation.


## Episode audio timeline

**Episode audio timeline Ã‚Â· music, ambience & dialogue** adds up to 32 audio clips across the whole episode. Each clip has an episode start time, a source trim (Skip into source), a duration, level, mute, fade in and fade out. Overlap clips to mix them; overlapping fades allow manual crossfades. The lane bars show where each clip sits against the episode duration. Reorder clips in the list with **Place** Start of list / End of list / After another clip (**Reorder clip**; same clip id and episode timing fields; order-only; Undo restores). Distinct from shot sound-track Place. List order does not change episode start times.

These clips continue across shot and scene cuts in Animatic preview and assembled MP4 exports. They mix over existing shot audio. Export mixes the soundtrack after picture assembly without re-encoding the picture. No additional AI model is used.

Clip timing is absolute: rearranging shots does not move the music. Short source files stop naturally unless **Loop source to fill clip duration** is enabled on the clip (source restarts from Skip-into-source until the planned duration ends; clip fades still apply once on the episode window). Optional **Loop restart crossfade** (seconds, default off) softens each restart: preview approximates with a dual-element splice ramp; Assemble builds an afade overlap unit then aloops it. The episode end clips any overhanging sound. Fades are relative to the planned clip duration, so set that duration to the usable source length for a fade at the actual end of a short file. Muted and empty clips are omitted from export. Waveform editing and dialogue ducking are described below.

Project download/import and Undo include the timeline. The unused-voice cleanup protects files used by episode clips in loaded projects.

Verification: `tools/studio/director-episode-audio-check.mjs` covers validation, persistence round trip, trimming, fades, seeking, mute and preview lifecycle. `tools/studio/director-episode-audio-render-check.py` checks a real four-shot movie using synthetic audio: continuous sound across cuts, source trim, fade envelopes, start/end silence, mute exclusion and unchanged video frame count. Results are in `reports/studio/director-episode-audio-render-check.json`.


## Waveform editing and dialogue ducking

On an attached episode audio clip, open **Waveform Ã‚Â· trim & split**, then **Load waveform**. Waveforms are generated locally, one file at a time, as 1,800 amplitude peaks; the full decoded audio is not retained in browser memory. The overview is approximate, not a sample-level editor.

Drag a source range or enter its start/end times, then choose **Trim to waveform selection**. Click the waveform or move **Source playhead** and choose **Split at source playhead**. Zoom to selection and Show full source change the view only. Trims keep the episode start in place. Splits retain continuous source and episode timing and preserve the outer fades; split outside existing fade regions. Source files are never overwritten. Use Undo to restore edits.

Enable **Automatically lower episode music and ambience under dialogue** to duck those episode clips. Mark voice clips as **dialogue** in the episode timeline, or use shot sound tracks marked **Dialogue**. Adjust the remaining music level (default 25%), fade-down (0.2s) and fade-up (0.5s). Close dialogue ranges are joined to avoid rapid pumping. Preview and export use the same envelope.

Ducking follows planned dialogue ranges, including pauses within them; it does not detect speech acoustically. Main shot voice attachments (`shot.audio`) are included when their role is Dialogue Ã¢â‚¬â€ or Auto with lip-sync / a matching voice take Ã¢â‚¬â€ using lip-sync duration, a matching voice-take length, or the shot length when unknown. Main attachments tagged Music, Ambience, or Effects (or Auto with a music-ish filename such as `bgm`, `bed`, `score`, `ambience`) do not open duck windows. Promote-from-voice-library sets `audioRole` to dialogue. Shot dialogue tracks that have been trimmed in the waveform overview duck only for that usable duration; untrimmed dialogue tracks still cover from their start through the shot end. Shot-based music is not ducked by this episode control. Put continuous music in episode music/ambience clips. Keep dialogue duration accurate when the source ends before its planned range.

Tests: `director-audio-edit-check.mjs` checks trim/split, fade bounds and ducking ramps. `director-audio-edit-render-check.py` verifies local peaks and an exported mix: the measured music ratio was approximately 0.251 for the configured 0.25 level, returning to its original level afterward. UI checks covered source selection, trimming, splitting and Undo. Existing episode audio export tests still pass.

## Project protection and finishing update
Director now offers disk snapshots and recovery, project-with-media ZIP backups, missing-file relinking, optional shot-linked episode audio, image-reference handoff, local review tools, editable Rhubarb mouth cues, reusable export checkpoints and two-pass web audio balancing. See reports/studio/director-gap-fill-2026-09-23.md for verified behavior and practical limits.

