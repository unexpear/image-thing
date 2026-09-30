# Ensure Cartoon Director check runners can resolve `three`.
# Vendored package: tools/studio-three/package
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'package.json'))) {
  throw "Expected studio package.json at $root"
}
Push-Location $root
try {
  if (-not (Test-Path 'node_modules\three\package.json')) {
    Write-Host 'Installing local three (file:tools/studio-three/package)...'
    npm install --omit=dev --no-fund --no-audit
  } else {
    Write-Host 'node_modules/three already present.'
  }
  node -e "import('three').then(m=>console.log('three', m.REVISION))"
} finally {
  Pop-Location
}