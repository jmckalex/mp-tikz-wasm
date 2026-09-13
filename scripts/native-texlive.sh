#!/usr/bin/env bash
# native-texlive.sh — the native web2c pass (docs/03 §4.2 Route B): configure
# the pinned TeX Live source and build pdftex natively. This produces the
# web2c-generated C (pdftexini.c, pdftex0.c, pdftex-pool.c, pdftexd.h, ...) and
# the generated config headers that scripts/build-tex-wasm.sh compiles with
# emcc, plus a native pdftex binary from the exact pinned source.
#
# Only `make -C texk/web2c pdftex` is needed; `--disable-all-pkgs` does not
# disable the other web2c engines and a full `make` would build (and on macOS
# fail on) xetex.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
[ -f "$SRC/configure" ] || { echo "error: run scripts/extract-vendor.sh first" >&2; exit 1; }
mkdir -p "$NB"
cd "$NB"
if [ ! -f Makefile ]; then
  echo "==> configuring (native)"
  "$SRC/configure" --disable-all-pkgs --enable-pdftex --enable-web2c --without-x --disable-shared \
    --disable-native-texlive-build --prefix="$REPO/vendor/native-install" > configure.log 2>&1 \
    || { echo "error: configure failed; tail of $NB/configure.log:" >&2; tail -40 configure.log >&2; exit 1; }
fi
# Each step logs to a file; on failure the tail is printed so that CI shows why.
fail() { echo "error: $1 failed; tail of $NB/$2:" >&2; tail -60 "$2" >&2; exit 1; }
echo "==> building the libraries pdftex needs (kpathsea, zlib, libpng, xpdf, md5)"
make -j"${JOBS:-8}" -C libs > make-libs.log 2>&1 || true
make -j"${JOBS:-8}" -C texk/kpathsea > make-kpathsea.log 2>&1 || fail "make -C texk/kpathsea" make-kpathsea.log
echo "==> building pdftex (generates the web2c C)"
make -j"${JOBS:-8}" -C texk/web2c pdftex > make-pdftex.log 2>&1 || fail "make -C texk/web2c pdftex" make-pdftex.log
ls -l texk/web2c/pdftex texk/web2c/pdftex0.c
echo "==> native pdftex: $(texk/web2c/pdftex --version | head -1)"
