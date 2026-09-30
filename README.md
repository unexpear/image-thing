# Local Qwen Image Edit

Installed in `D:\dev\image thing\ComfyUI_windows_portable` on September 6, 2026.

For Cartoon Director's drawing, skeleton builder, 3D animation and one-hour shots, see [the animation guide](DIRECTOR-ANIMATION.md).

## Start and edit

1. Double-click **Start Qwen Edit.cmd**. ComfyUI starts in the background and opens **Qwen Studio** at <http://127.0.0.1:8188/qwen-editor.html>.
2. Drop in a PNG/JPG/WebP, or click the upload area to choose your image.
3. Describe your edit, choose **Quick edit (4 steps)** or **More refinement (8 steps)**, and click **Create edit**.
4. Watch processing stages, sampling progress, elapsed time, queue count, and memory usage. Loading models has no reliable percentage, so its progress bar is indeterminate.
5. Compare the original, download the PNG, reuse settings, or choose **Edit this result** for another pass. New Studio outputs are in `ComfyUI_windows_portable/ComfyUI/output/Qwen-Studio`.

**Fine-tune settings** includes a 384-ish lightweight draft, the default 512-ish size, a slower 724-ish option, additional LoRAs, strength, and a repeatable seed. Dimensions preserve aspect ratio. A blank seed randomizes each run; history records the actual seed. More steps do not guarantee a better edit.

Studio uses the existing Q2 GGUF model and tiled decoder. No larger model or extra service was installed. Smaller images reduce processing work; they do not shrink model weights. The 384/724 options have not yet been benchmarked here.

Use **Open ComfyUI** for the full node editor. The supplied workflows start with a blank image input: choose or upload your image in the required Load Image node before running. No sample photo is bundled. **Export workflow** saves a graph with your selected image; new output PNGs also contain the graph. Existing workflows remain available.

Recent edits are remembered in this browser, and recent Qwen runs are imported from backend history. Refreshing reconnects tracking. Jobs started in another browser show queue/history status; detailed live events belong to the browser that submitted them. Cancellation targets only the selected job. Backend restarts clear its in-memory queue/history; completed PNG files remain on disk.

Studio source is in `simple-editor/`. Run `Deploy-Editor.ps1` after editing it or upgrading the frontend package. It copies only Studio assets and workflow templates into the frontend static directory. No restart is required.

API behavior was checked against installed `server.py` and the official [routes](https://docs.comfy.org/development/comfyui-server/comms_routes) and [messages](https://docs.comfy.org/development/comfyui-server/comms_messages) documentation.

Studio validation: a real 512×512, 4-step browser submission completed in 64.62 seconds and saved `Qwen-Studio/Edit_00001_.png`. Browser checks passed for upload, original/result switching, settings reuse, editing a result, refresh recovery, and a 390-pixel-wide layout. Simulated responses verified validation-error display, 8-step/384-size request construction, and job-specific cancellation without interrupting real work. The smaller draft size was validated in the request, not benchmarked by rendering.

The server stays running when you close the browser. Use **Stop Qwen Edit.cmd** when finished to release its resources. It does not start automatically with Windows.

The canvas hides text when zoomed far out. Scroll up to zoom in. Press **.** to fit the graph on screen.

## Video mode

Open **Video →** from Studio, or go to <http://127.0.0.1:8188/qwen-editor/video.html>.

- **Animate a photo:** upload an image and describe motion. The image conditions the first frame using the native VACE control mask.
- **Add a reference photo:** optionally upload a second photo to guide a subject or background. This means two photos total for animation: the first-frame photo and one extra reference. Video restyles also accept one extra photo. References persist in drafts and new saved settings. Use 4-step or standard 20-step processing; Gentle variation does not support the extra reference. The installed native VACE node uses only one `reference_image`, so additional reference batches are not exposed. Extra conditioning can increase memory use and does not guarantee exact identity/style preservation.
- **Restyle a video:** upload MP4/WebM/MOV, describe the desired scene, and optionally choose a start time. Outline guidance allows freer changes; original-frame guidance keeps more source information. This is generative restyling, not an exact object replacement tool.
- Defaults: 384-pixel long edge, roughly 2 seconds (33 frames at 16 fps), 4-step CausVid acceleration, H.264 MP4. Restyles keep source audio if present; photo animations are silent. Options include 1/3-second lengths, 512-pixel long edge, seed, source guidance strength, and a slower 20-step preset without the acceleration LoRA.
- Preview playback, download, live stage/step progress, animated loading, elapsed time, job-specific cancellation, and recent video history are included.
- Video drafts now restore the source, prompt, mode, and settings after refreshing. **Reuse settings** restores a new run's exact seed and controls without starting another generation. **Restyle this result** copies a completed clip into local input and prepares it for another edit. New jobs also store these settings in backend history metadata.
- Queue positions and live-versus-polling connection status are shown. The browser tab indicates active work or completion. Clip uploads with known duration reject start times beyond the end before queuing.
- A pre-run summary shows actual output dimensions, duration, frame count, and sampling steps. In video-restyle mode, pause the source and choose **Start the edit at this frame** to copy its playback position (rounded down to tenths of a second). The summary explains when the source ends before the requested section. Recent runs show timestamps and highlight the selected run.
- Output files: `ComfyUI_windows_portable/ComfyUI/output/Qwen-Studio/Video`. Short sources hold their final frame. **Source audio** can keep or mute audio; the first audio track is trimmed to the same start and output duration, converted to stereo 48 kHz, and encoded in the MP4. Missing/short audio remains silent. Inputs are limited to 300 MB in the UI. HDR/rotation-specific workflows have not been verified.

**Compare before / after** shows the source next to the result when source metadata is available. The result player's play, pause, and seek controls drive both sides, accounting for the selected start offset. Source playback is muted to avoid doubled audio. Short sources freeze at the end; photo sources show a still image. Browser synchronization corrects drift and is not a frame-accurate editing timeline.

**Gentle variation** is an experimental restyle preset: original frames initialize the sampler, 20 steps, denoise 0.6, CFG 3, original-frame VACE guidance 1. It preserved more of the test room but followed the requested sofa recolor less well. It took 215.94 seconds for a 1-second draft. This is a preservation-versus-edit-strength tradeoff, not a quality guarantee. The 4-step default remains unchanged.

See `VIDEO-BENCHMARK.md` for the same-seed comparison: 4-step tests took 12–21 seconds; standard 20-step tests took 85–150 seconds. Sampled total GPU use peaked at 5.31–7.31 GiB. The first run included loading overhead, and thermal/system/cache conditions differed. Tests used one 384×384 sofa clip, so these results do not establish face/identity preservation.

Audio validation used a four-second fixture with 440 Hz then 880 Hz tones. Trimming at 0.5 and 2.5 seconds returned the correct tone; end padding and absent-audio checks passed. The exported MP4 retained the expected 880 Hz audio and matching approximately 1.0625-second video/audio durations. Browser checks passed for comparison offset, play/pause synchronization, mobile layout, and the submitted audio/gentle graph settings.

Installed Wan2.1 VACE 1.3B FP16, UMT5 XXL scaled FP8, Wan2.1 VAE, and matching 1.3B CausVid LoRA (about 11.4 GB combined). SHA256 checks passed; pinned revisions and hashes are in `downloads/video-model-manifest.json`. The compact FP16 video diffusion model fits with the existing offloading settings; the Qwen image model remains GGUF. No global dependencies were changed.

Validation on this laptop: 17 frames at 384×384 completed in **23.22 seconds** for animation; a browser-submitted 33-frame restyle completed in **31.73 seconds**. Both MP4s were decoded and checked; browser playback and refresh recovery passed. Short accelerated clips can blur, flicker, or change scene details. Larger clips and the 20-step preset will take longer.

The small `custom_nodes/studio_video` decoder resizes frames before assembling the image tensor, seeks to the selected time, samples at 16 fps, and caps output at 49 frames / 512 pixels per dimension. Checks passed for bounded output shape, seeking, short-clip padding, invalid paths, and a start time beyond the source. The backend needs a restart after changes to that custom node. `build_video_workflows.py` generates the two API workflows, and `Deploy-Editor.ps1` deploys their UI assets.

Sources: [official ComfyUI VACE workflows](https://docs.comfy.org/tutorials/video/wan/vace), [Wan VACE 1.3B model](https://huggingface.co/Wan-AI/Wan2.1-VACE-1.3B), and bundled `video_wan_vace_14B_ref2v.json` / `video_wan_vace_14B_v2v.json` notes describing the matching 1.3B model, CausVid strength 0.7, and 4-step/CFG 1 versus 20-step/CFG 6 settings. The decoder follows [PyAV video](https://pyav.org/docs/stable/api/video.html) and [container](https://pyav.org/docs/stable/api/container.html) APIs.

## Image defaults for this laptop

- GPU: NVIDIA RTX 3070 Ti Laptop, 8 GB VRAM; system RAM: about 32 GB.
- Qwen-Image-Edit-2511 Q2_K GGUF diffusion model.
- Qwen2.5-VL-7B-Instruct UD-Q4_K_XL GGUF text encoder and matching BF16 vision projector.
- Qwen image VAE and 4-step Lightning BF16 LoRA.
- One image per run, 0.25 megapixels (512×512 for a square image); aspect ratio preserved.
- 4 steps, CFG 1, Euler sampler, simple schedule, shift 3.1, fixed seed 42, denoise 1.
- ComfyUI manages GPU/RAM offloading; launcher reserves 1 GB VRAM and enables aggressive model offloading. Tiled output decoding reduces VAE memory demand.
- Reference latents use the same resolution as the output. The VAE socket on each text-encode node is deliberately unconnected: connecting it would force a 1MP reference and cause framing drift at this lower output resolution.

For more detail, try increasing the **megapixels** widget to **0.5**, then **1.0**. These larger settings have not been benchmarked on this laptop. They need more memory and time. Return to 0.25 if memory errors occur. Unload other GPU models before editing.

**Standard 40-step** is also provided: it uses the same Q2 base model without the Lightning LoRA, with CFG 4. It is much slower and has not been benchmarked here. Q2 compression remains a quality limitation in both workflows.

## Versions and integrity

- ComfyUI portable v0.34.0, commit `12d5279438bfefc058a269eae805ceab6047777f`.
- ComfyUI-GGUF commit `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`.
- Embedded Python and PyTorch 2.13.0+cu130; gguf 0.19.0.
- The portable archive and all five model files passed SHA-256 verification. Model revisions, sizes, and hashes are recorded in `downloads/model-manifest.json`.
- `pip check` passed. No global Python packages were changed.
- Server is bound to localhost (`127.0.0.1`). No login or paid API is required for these workflows.

Downloads are checksummed while they are being fetched, and nothing checked them again afterwards. `verify_models.py` re-verifies an existing installation, which is what you want after a bad shutdown, a disk problem, or any run whose output looks wrong for no clear reason. A corrupted weight file loads without complaint and quietly degrades results rather than raising an error.

```bash
python verify_models.py
```

That quick pass confirms every file in all four manifests is present at its recorded size, that the Qwen text encoder still pairs with its vision projector, that every workflow resolves, and that the local-model bridge's paths exist. Add `--full` to re-read about 30 GB and recompute every SHA-256, which is the only check that catches a file whose bytes changed without its size changing; it took 49.6 seconds here. `--json PATH` writes the full report. The exit code is 0 when everything passes and 1 when anything fails. In the desktop app the same checks are on **Help → Verify model files…**, which offers the quick or full pass and can open the report. `tools/studio/verify-models-check.py` covers the verifier itself against corrupted, truncated, missing and ambiguously-paired fixtures.

Logs are in `logs/comfy.stderr.log` and `logs/comfy.stdout.log`. API workflow copies and their editable UI counterparts are in `workflows/`.

## Verified result

The final fast workflow completed a 512×512 sofa recoloring edit in **65.13 seconds** on this laptop, with no out-of-memory error. The text encoder and VAE had been loaded by an earlier test, so a fresh first run can take longer. The result retained the full sofa and room framing and changed the upholstery to blue; some fine details changed, as expected from generative editing.

Result: `ComfyUI_windows_portable/ComfyUI/output/Qwen-Edit-2511/Lightning_00002_.png`.
Execution record: `logs/test-result-aligned.json`. The browser workflow's exported prompt was checked for the intended model connections and sampling settings.

## Sources

- [ComfyUI Windows Portable](https://docs.comfy.org/installation/comfyui_portable_windows)
- [Official Qwen Edit 2511 workflow](https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511)
- [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)
- [Unsloth setup guide](https://unsloth.ai/docs/models/tutorials/qwen-image-2512)
- [Qwen Edit 2511 GGUF models](https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF)
- [Lightning LoRA](https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning)

## Local frontend fixes

The bundled frontend 1.49.6 opened a Z-Image starter graph with uninstalled models, causing a “2 errors found” notice. Fresh sessions now default to the installed Qwen fast workflow. If an existing browser restores the old starter graph, open **Workflows → Qwen Edit 2511 - Fast 4-step** once.

A one-expression readiness guard fixes the app-mode listener reading the graph before initialization. Empty optional CSS, node-template storage, and the subgraphs directory were initialized to resolve startup 404s. Model execution code and saved workflows were not changed by these fixes.

The original frontend asset and patch manifest are in `backups/frontend-startup-1.49.6/`. `fix_frontend_startup.py` reapplies the scoped fixes to this exact frontend build and rejects unexpected versions. A ComfyUI frontend update may replace the local asset; review the new version before reapplying. The original source map belongs to the upstream asset and was retained unchanged.

## Quality preset and additional LoRAs

The **Quality 8-step** preset uses the matching `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` at strength 1, 8 steps, CFG 1. Its checksum was verified against the publisher; details are in `downloads/lightning8-manifest.json`. It retains the Q2 base and 512px memory target. Quality depends on the edit; eight steps is an alternative to compare, not a guarantee of better results.

For another LoRA, put a Qwen-Image-Edit-2511-compatible `.safetensors` file in `ComfyUI_windows_portable/ComfyUI/models/loras`, refresh the model list or page, then select it in **Additional LoRA - OFF at strength 0**. Change its strength from 0 to the model author's recommendation. Zero leaves this additional loader disabled. Do not enable a second copy of Lightning on top of the active Lightning loader. Other model families' LoRAs are not interchangeable.

There is no content-filter or moderation node in these local workflows. This does not guarantee that the base model follows every prompt. No “uncensored” model replacement was installed: the inspected merge's own model card reports weaker editing, and its quality advantage was not verified.

The `qwen_local_launcher` frontend extension handles the explicit `?qwen=quality8` link after browser tab restoration, opening Qwen in a new workflow tab. It resolves the stale Z-Image example's missing `qwen_3_4b.safetensors` / `z_image_turbo_bf16.safetensors` errors without deleting browser drafts or installing unrelated models.

Verification: tested the direct link against a browser session holding the broken Z-Image draft. The quality preset opened with 19 valid nodes, the 8-step LoRA at strength 1, and the additional loader disabled at strength 0; no browser errors or missing-model notice remained. The model reached sampling successfully, but the first eight-step test was canceled from the interface before completion. Eight-step output quality has not yet been visually verified. The earlier completed four-step tests remain the confirmed performance baseline.
