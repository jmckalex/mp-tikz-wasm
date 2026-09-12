#!/usr/bin/env bash
# check-nosystem.sh FILE.wasm — fail if the wasm module imports or defines any
# process-spawning symbol (docs/02 §5.3, docs/10 §3).
set -euo pipefail
WASM="$1"
BAD='system|popen|execvp|execv|execl|fork|vfork|posix_spawn'
if command -v wasm-objdump >/dev/null 2>&1; then
  if wasm-objdump -x "$WASM" | grep -E "\\b($BAD)\\b" ; then
    echo "error: process-spawning symbol found in $WASM" >&2; exit 1
  fi
else
  # Fall back to scanning the import/export name strings in the binary.
  if strings "$WASM" | grep -xE "($BAD)" ; then
    echo "error: process-spawning symbol found in $WASM" >&2; exit 1
  fi
fi
echo "ok: no process-spawning symbols in $WASM"
