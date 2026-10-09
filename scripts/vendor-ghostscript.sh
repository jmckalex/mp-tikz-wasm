#!/usr/bin/env bash
# vendor-ghostscript.sh — copy the pinned Ghostscript wasm build (and, if
# present, its native library for the golden oracle) from the Ghostscript port
# into vendor/ghostscript/, checking every file against vendor/GHOSTSCRIPT.lock.
# The port builds them (its own build.sh, VARIANT=lean); this only pins them.
#
#   GS_DIR=~/Source/ghostscript scripts/vendor-ghostscript.sh
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GS_DIR="${GS_DIR:-$HOME/Source/ghostscript}"
OUT="$REPO/vendor/ghostscript"
mkdir -p "$OUT/native"
status=0
while read -r name sha from; do
  case "$name" in ''|'#'*) continue;; esac
  dest="$OUT/$name"
  if [ -f "$dest" ] && [ "$(shasum -a 256 "$dest" | cut -d' ' -f1)" = "$sha" ]; then continue; fi
  src="$GS_DIR/$from"
  if [ ! -f "$src" ]; then
    case "$name" in native/*) echo "  (optional) $name: $src not found; the golden oracle runs without Ghostscript" >&2; continue;; esac
    echo "error: $src not found (set GS_DIR to the Ghostscript port)" >&2; status=1; continue
  fi
  got="$(shasum -a 256 "$src" | cut -d' ' -f1)"
  if [ "$got" != "$sha" ]; then
    echo "error: $from has sha256 $got, the lock says $sha; re-pin vendor/GHOSTSCRIPT.lock deliberately if the port was rebuilt" >&2
    status=1; continue
  fi
  cp -p "$src" "$dest"; echo "  $name"
done < "$REPO/vendor/GHOSTSCRIPT.lock"
exit $status
