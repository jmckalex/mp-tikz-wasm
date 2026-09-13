#!/usr/bin/env bash
# native-dvisvgm.sh — configure texk/dvisvgm natively inside vendor/native-build
# to obtain config.h and the generated version.hpp that build-dvisvgm-wasm.sh
# compiles against, and prepare libs/potrace (its config.h and header links,
# which the wasm build also uses). Run after scripts/native-texlive.sh.
#
# dvisvgm is configured with --disable-build, as make's recursion would do for
# a package it is not going to build (dvisvgm is `--enable-dvisvgm=no` in this
# tree): that skips its link tests against zlib, FreeType and kpathsea —
# FreeType is not built natively — and leaves config.h unchanged.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/scripts/native-common.sh"
[ -f "$NB/config.log" ] || { echo "error: run scripts/native-texlive.sh first" >&2; exit 1; }
native_package libs/potrace
native_configure texk/dvisvgm --disable-build
ls -l "$NB/texk/dvisvgm/config.h" "$NB/texk/dvisvgm/dvisvgm-src/src/version.hpp" "$NB/libs/potrace/include/potracelib.h"
