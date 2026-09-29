#!/usr/bin/env bash
# Thin wrapper so `make e2e` works from any shell.
set -euo pipefail
exec node "$(dirname "$0")/e2e-smoke.mjs" "$@"
