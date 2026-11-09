#!/usr/bin/env bash
# Print SRI sha384 hashes for dist/main.mjs and dist/main.css
set -euo pipefail

DIST="$(cd "$(dirname "$0")/.." && pwd)/dist"

for f in main.mjs main.css; do
  [ -f "$DIST/$f" ] || { echo "missing $DIST/$f (run bun run build:hosted)" >&2; exit 1; }
  echo "$f: sha384-$(openssl dgst -sha384 -binary "$DIST/$f" | openssl base64 -A)"
done
