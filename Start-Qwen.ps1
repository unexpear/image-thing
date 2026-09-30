$ErrorActionPreference = 'Stop'
$comfyRoot = Join-Path $PSScriptRoot 'ComfyUI_windows_portable'
$logRoot = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
function Open-Studio {
    $studio = Join-Path $PSScriptRoot 'desktop\dist\Local Studio\Local Studio.exe'
    if (-not (Test-Path -LiteralPath $studio)) { throw 'Local Studio was not built. Expected desktop\dist\Local Studio\Local Studio.exe.' }
    Start-Process -FilePath $studio -WorkingDirectory (Split-Path -Parent $studio)
}
try {
    $null = Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 2
    Open-Studio
    exit 0
} catch {}
$process = Start-Process -FilePath (Join-Path $comfyRoot 'python_embeded\python.exe') -ArgumentList '-s ComfyUI\main.py --windows-standalone-build --disable-auto-launch --listen 127.0.0.1 --reserve-vram 1 --disable-smart-memory' -WorkingDirectory $comfyRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'comfy.stdout.log') -RedirectStandardError (Join-Path $logRoot 'comfy.stderr.log') -PassThru
$process.Id | Set-Content (Join-Path $logRoot 'server.pid')
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Seconds 2
    if ($process.HasExited) { throw 'ComfyUI stopped. Check logs\comfy.stderr.log.' }
    try {
        $null = Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 2
        Open-Studio
        exit 0
    } catch {}
}
throw 'ComfyUI startup timed out. Check logs\comfy.stderr.log.'
