$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$electronRoot = Join-Path $PSScriptRoot 'node_modules/electron/dist'
if (-not (Test-Path -LiteralPath (Join-Path $electronRoot 'electron.exe'))) { throw 'Run npm ci, then node node_modules/electron/install.js in the desktop directory first.' }
$appRoot = Join-Path $PSScriptRoot 'dist/Local Studio'
New-Item -ItemType Directory -Force -Path $appRoot | Out-Null
Copy-Item -Path (Join-Path $electronRoot '*') -Destination $appRoot -Recurse -Force
$appResources = Join-Path $appRoot 'resources/app'
New-Item -ItemType Directory -Force -Path $appResources | Out-Null
foreach ($name in @('main.cjs','starting.html','package.json')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $appResources -Force }
@{root=$workspaceRoot} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $appResources 'workspace.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $appRoot 'electron.exe') -Destination (Join-Path $appRoot 'Local Studio.exe') -Force
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktopPath 'Local Studio.lnk'))
$shortcut.TargetPath = Join-Path $appRoot 'Local Studio.exe'
$shortcut.WorkingDirectory = $appRoot
$shortcut.Description = 'Images, video, 3D and Cartoon Director · local workspace'
$shortcut.Save()
Write-Output "Desktop app: $(Join-Path $appRoot 'Local Studio.exe')"
