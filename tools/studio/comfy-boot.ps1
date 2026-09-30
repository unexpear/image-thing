# Detached backend boot for benchmark runs (explicit operator action).
# Mirrors Start-Qwen.ps1 but never opens a browser. Records the exact
# spawned PID in logs/server.pid. Stop with Stop-Qwen.ps1.
param([string]$Roots)
$ErrorActionPreference = 'Stop'
if (-not $Roots) { $Roots = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) }
$comfyRoot = Join-Path $Roots 'ComfyUI_windows_portable'
$logRoot = Join-Path $Roots 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$process = Start-Process -FilePath (Join-Path $comfyRoot 'python_embeded\python.exe') -ArgumentList '-s ComfyUI\main.py --windows-standalone-build --disable-auto-launch --listen 127.0.0.1 --reserve-vram 1 --disable-smart-memory' -WorkingDirectory $comfyRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'comfy.stdout.log') -RedirectStandardError (Join-Path $logRoot 'comfy.stderr.log') -PassThru
$process.Id | Set-Content (Join-Path $logRoot 'server.pid')
Write-Output ("booted pid " + $process.Id)
