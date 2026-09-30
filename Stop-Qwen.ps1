$ErrorActionPreference = 'Stop'
$pidPath = Join-Path $PSScriptRoot 'logs\server.pid'
if (-not (Test-Path -LiteralPath $pidPath)) { exit 0 }
$serverProcessId = [int](Get-Content -LiteralPath $pidPath)
$process = Get-Process -Id $serverProcessId -ErrorAction SilentlyContinue
if (-not $process) { exit 0 }
$expectedPython = Join-Path $PSScriptRoot 'ComfyUI_windows_portable\python_embeded\python.exe'
if ($process.Path -ne $expectedPython) { throw 'PID belongs to another program; refusing to stop it.' }
$queue = Invoke-RestMethod 'http://127.0.0.1:8188/queue' -TimeoutSec 3
if ($queue.queue_running.Count -gt 0 -or $queue.queue_pending.Count -gt 0) {
    Write-Host 'An edit is running or queued. Finish or cancel it in ComfyUI, then try again.'
    Read-Host 'Press Enter to close'
    exit 1
}
Stop-Process -Id $serverProcessId
