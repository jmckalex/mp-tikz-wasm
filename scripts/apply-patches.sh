#!/usr/bin/env bash
# apply-patches.sh SRCDIR DESTDIR — copy the mplibdir sources to DESTDIR and
# apply patches/*.patch in order. The vendored tree is never modified.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$1"; DEST="$2"
mkdir -p "$DEST"
rm -f "$DEST"/*.w "$DEST"/*.c "$DEST"/*.h
cp "$SRC"/*.w "$SRC"/*.c "$SRC"/*.h "$DEST"/
for p in "$REPO"/patches/*.patch; do
  [ -f "$p" ] || continue
  echo "==> applying $(basename "$p")"
  patch -s -p1 -d "$DEST" < "$p"
done
