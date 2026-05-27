#!/usr/bin/env bash
# Resolves this repo's kimi-hook.mjs from the script location (no hardcoded install path).
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$DIR/kimi-hook.mjs"
