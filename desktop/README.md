# Local Studio desktop

Launch **Local Studio** from the Windows desktop shortcut, or run `dist/Local Studio/Local Studio.exe`. This app uses the existing workspace and ComfyUI models; it is not a standalone bundle of the models.

- A dedicated desktop window with native menus and shortcuts: Ctrl+1 Director, Ctrl+2 Images, Ctrl+3 Video, Ctrl+4 3D.
- Connects to ComfyUI at 127.0.0.1:8188. If unavailable and no recorded backend process is alive, starts the existing portable Python backend hidden, with the same flags as the launcher.
- Closing the app leaves ComfyUI running so queued work can finish. Existing Stop Qwen scripts remain available.
- Media stays in the existing ComfyUI input/output folders.
- Desktop project storage is `studio-data/desktop-profile`. Browser storage is separate: use Download project in the browser, then Import project in the desktop window for existing episodes.
- Help includes Reconnect, Verify model files and Open backend log. Studio includes Open output folder.

**Help → Verify model files…** re-checks the installed models against their manifests, which the app otherwise never does after they were downloaded. Choose the quick pass to confirm every file is present at its recorded size, that the Qwen text encoder still pairs with its vision projector, and that each workflow resolves; choose the full hash check to also re-read about 30 GB and recompute every SHA-256, which takes about a minute and is the only pass that catches a file whose bytes changed without its size changing. Finish any generation first. The result dialog reports the summary and can open `reports/studio/model-verification.json`, which names each failing file and what to do about it. The same checks run from the workspace as `python verify_models.py [--full]`.

Build from this directory:

```powershell
npm ci
node node_modules/electron/install.js
./Build-Desktop.ps1
```

Electron 44.3.0 is pinned in package-lock.json. The installation package exposes its binary installer explicitly. Build-Desktop.ps1 copies the runtime and application files into `dist/Local Studio`, writes the workspace path and creates the desktop shortcut. Close the desktop app before rebuilding. Rebuild if the workspace moves.

Security settings: renderer sandbox enabled, Node integration disabled, context isolation enabled, no preload bridge, permission requests denied, and renderer navigation/new windows restricted to the local backend origin. No shell-command execution is exposed to editor pages.

Verification (20 September 2026): the packaged executable passed both existing-backend and cold-start checks in its isolated smoke profile. It automatically started the stopped, idle ComfyUI backend and then passed 720p trailer playback, adding the revised six-clip demo while preserving another project, persistence across reload, native menu navigation to Images/Video/3D/Director, one-second canvas recording, and loading the 15-joint starter skeleton. Renderer Node access remained unavailable; layout had no horizontal overflow. Prior smoke-profile project storage was restored. Normal user profiles and personal media were not inspected or modified. Reports: `reports/studio/desktop-demo-check.json` and `reports/studio/desktop-cold-start-check.json` in the workspace.

To repeat the isolated checks: run the packaged executable with `--smoke-test --demo-test`. The check closes its own hidden window and leaves the backend running. These checks cover the desktop workflows above, not fresh image/video/mesh AI generations.

Electron references: https://www.electronjs.org/docs/latest/api/browser-window ; https://www.electronjs.org/docs/latest/tutorial/security ; https://www.electronjs.org/docs/latest/api/app .
