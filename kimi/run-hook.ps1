# Resolves this repo's kimi-hook.mjs from the script location (no hardcoded install path).
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $Dir "kimi-hook.mjs")
exit $LASTEXITCODE
