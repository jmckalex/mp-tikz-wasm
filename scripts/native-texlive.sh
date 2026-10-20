#!/usr/bin/env bash
# native-texlive.sh — the native web2c pass (docs/03 §4.2 Route B): configure
# the pinned TeX Live source and build pdftex natively. This produces the
# web2c-generated C (pdftexini.c, pdftex0.c, pdftex-pool.c, pdftexd.h, ...) and
# the generated config headers that scripts/build-tex-wasm.sh compiles with
# emcc, plus a native pdftex binary from the exact pinned source.
#
# After pdftex it builds BibTeX (`make -C texk/web2c bibtex`: tangle and
# convert generate bibtex.c and bibtex.h) and configures and builds
# texk/makeindexk (for its generated c-auto.h). scripts/build-texutils-wasm.sh
# compiles those with emcc; the native bibtex and makeindex binaries, from the
# same pinned source, are what scripts/smoke-texutils.mjs can be checked
# against besides TeX Live's own. Both steps leave pdftex alone.
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
echo "==> web2c: bibtex (generates bibtex.c and bibtex.h)"
native_build texk/web2c bibtex
echo "==> native bibtex: $(texk/web2c/bibtex --version | head -1)"
echo "==> makeindexk (generates its c-auto.h)"
native_package texk/makeindexk
echo "==> native makeindex: $(texk/makeindexk/makeindex < /dev/null 2>&1 | head -1)"
