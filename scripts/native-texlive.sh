#!/usr/bin/env bash
# native-texlive.sh — the native web2c pass (docs/03 §4.2 Route B): configure
# the pinned TeX Live source and build pdftex natively. This produces the
# web2c-generated C (pdftexini.c, pdftex0.c, pdftex-pool.c, pdftexd.h, ...) and
# the generated config headers that scripts/build-tex-wasm.sh compiles with
# emcc, plus a native pdftex binary from the exact pinned source.
#
# Only `make -C texk/web2c pdftex` is wanted; `--disable-all-pkgs` does not
# disable the other web2c engines and a full `make` would build (and on macOS
# fail on) xetex. The packages pdftex needs (kpathsea; zlib, libpng and xpdf;
# web2c itself) are therefore configured and built one at a time — see
# scripts/native-common.sh for why they have to be configured at all.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/scripts/native-common.sh"
[ -f "$SRC/configure" ] || { echo "error: run scripts/extract-vendor.sh first" >&2; exit 1; }
mkdir -p "$NB"
cd "$NB"
if [ ! -f Makefile ]; then
  echo "==> configuring (native)"
  # The source is named by a relative path on purpose: it ends up in the #line
  # directives of every tangled C file (and so in anything that embeds
  # __FILE__), which keeps the generated sources identical between machines.
  ../texlive-source/configure --disable-all-pkgs --enable-pdftex --enable-web2c --without-x --disable-shared \
    --disable-native-texlive-build --prefix="$REPO/vendor/native-install" > configure.log 2>&1 \
    || fail "configure" "$NB/configure.log"
fi
echo "==> kpathsea and the libraries pdftex links (zlib, libpng, xpdf)"
native_package texk/kpathsea
for lib in zlib libpng xpdf; do native_package libs/$lib; done
echo "==> web2c: pdftex (generates the web2c C)"
native_configure texk/web2c
native_build texk/web2c pdftex
ls -l texk/web2c/pdftex texk/web2c/pdftex0.c
echo "==> native pdftex: $(texk/web2c/pdftex --version | head -1)"
