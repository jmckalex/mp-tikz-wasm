#!/usr/bin/env bash
# native-dvisvgm.sh — configure texk/dvisvgm natively inside vendor/native-build
# to obtain config.h and the generated version.hpp that build-dvisvgm-wasm.sh
# compiles against. Run after scripts/native-texlive.sh.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
[ -f "$NB/config.log" ] || { echo "error: run scripts/native-texlive.sh first" >&2; exit 1; }
mkdir -p "$NB/texk/dvisvgm"
cd "$NB/texk/dvisvgm"
ARGS=$(grep -o 'with options ".*"' ../../config.log | head -1 | sed 's/with options "//; s/"$//' | tr -d "'")
"$SRC/texk/dvisvgm/configure" --disable-option-checking $ARGS --srcdir="$SRC/texk/dvisvgm" > configure.log 2>&1 \
  || { echo "error: dvisvgm configure failed; tail of $(pwd)/configure.log:" >&2; tail -40 configure.log >&2; exit 1; }
ls -l config.h dvisvgm-src/src/version.hpp
