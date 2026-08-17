$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $root "dsh-runtime"
$appRoot = Join-Path $runtimeRoot "app"
$manifest = Join-Path $root "dsh\runtime-package.json"
$node = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path $manifest)) {
    throw "Runtime manifest missing: $manifest"
}

Remove-Item $runtimeRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item $appRoot -ItemType Directory -Force | Out-Null
Copy-Item $node (Join-Path $runtimeRoot "node.exe")
Copy-Item $manifest (Join-Path $appRoot "package.json")

Push-Location $appRoot
try {
    pnpm.cmd install --prod --ignore-workspace --config.node-linker=hoisted --config.symlink=false --config.confirmModulesPurge=false --config.dangerouslyAllowAllBuilds=true
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm install for the Harness runtime failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$entry = Join-Path $appRoot "node_modules\@deepseek-ai\dsh-sdk-jsonrpc-demo\lib\bin.js"
if (-not (Test-Path $entry)) {
    throw "Harness runtime entry missing after install: $entry"
}

Write-Host "Prepared DeepSeek Harness runtime at $runtimeRoot"