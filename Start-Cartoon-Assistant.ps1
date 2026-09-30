param([string]$Prompt)
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'tools/studio/run-hermes-studio.py'
$python = 'D:\ai\Local-Models\bridge-runtime\Scripts\python.exe'
if ($Prompt) { & $python $runner $Prompt } else { & $python $runner }
if ($LASTEXITCODE -ne 0) { throw 'The cartoon assistant did not finish. See reports/studio/hermes-needle-review.json and logs/hermes-bonsai.log.' }
