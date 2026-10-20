#!/usr/bin/env bash
# build-texutils-wasm.sh — compile BibTeX (0.99d) and makeindex (2.17) to
# WebAssembly, the way build-tex-wasm.sh compiles pdfTeX (docs/03 §4, Route B):
# the web2c-generated bibtex.c from the native pass and the sources of
# texk/makeindexk are compiled with emcc against kpathsea, each with the native
# configuration headers fixed for wasm32. BibTeX also links web2c/lib, whose
# main.c is its entry point (TeX has texmfmp.c instead); makeindex needs only
# kpathsea. Produces dist/bibtex.{mjs,wasm} (createBibtex) and
# dist/makeindex.{mjs,wasm} (createMakeindex), modules that run under the same
# runner as tex.mjs (src/ts/texengine.ts runTex).
#
# Requires: vendor/native-build with texk/web2c/bibtex.c generated and
# texk/makeindexk configured (scripts/native-texlive.sh), and emcc on PATH.
# TEXUTILS_OPT overrides the optimisation level (default -O2); objects are kept
# per level under build/texutils/obj/<level>.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TL="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
OPT="${TEXUTILS_OPT:--O2}"
OUT="$REPO/build/texutils"
OBJ="$OUT/obj/${OPT#-}"
DIST="$REPO/dist"
W2C="$TL/texk/web2c"
MIK="$TL/texk/makeindexk"
EMCC="${EMCC:-emcc}"
EMAR="${EMAR:-emar}"
JOBS="${JOBS:-8}"

[ -f "$NB/texk/web2c/bibtex.c" ] || { echo "error: run scripts/native-texlive.sh first (needs $NB/texk/web2c/bibtex.c)" >&2; exit 1; }
[ -f "$NB/texk/makeindexk/c-auto.h" ] || { echo "error: run scripts/native-texlive.sh first (needs $NB/texk/makeindexk/c-auto.h)" >&2; exit 1; }
mkdir -p "$OBJ" "$OUT/include/w2c" "$OUT/include/kpathsea" "$OUT/include/makeindexk" "$DIST"

# ---- configuration headers: take the native ones and fix them for wasm32 ---
# (the same fixes as build-tex-wasm.sh; makeindexk's c-auto.h has nothing
# size- or platform-specific that matters and is used as it is)
sed -e 's/#define SIZEOF_LONG 8/#define SIZEOF_LONG 4/' \
    "$NB/texk/kpathsea/c-auto.h" > "$OUT/include/kpathsea/c-auto.h"
cp "$NB/texk/kpathsea/paths.h" "$NB/texk/kpathsea/kpathsea.h" "$OUT/include/kpathsea/"
sed -e '/#define IPC 1/d' -e '/HAVE_APPLICATIONSERVICES/d' \
    "$NB/texk/web2c/w2c/c-auto.h" > "$OUT/include/w2c/c-auto.h"
cp "$NB/texk/makeindexk/c-auto.h" "$OUT/include/makeindexk/c-auto.h"

# The include paths mirror the native compile lines (make -n in each package):
# web2c:      -I. -I$srcdir -I./w2c -I$NB/texk -I$TL/texk
# makeindexk: -I. -I$srcdir -I$NB/texk -I$TL/texk -DUNIX -DKPATHSEA
# with the fixed headers in front. makeindex's `#include <c-auto.h>` must find
# its own header, so it gets an include list without the w2c one.
INC_W2C="-I$OUT/include -I$OUT/include/w2c -I$NB/texk/web2c -I$W2C -I$TL/texk -I$NB/texk"
INC_MIK="-I$OUT/include/makeindexk -I$OUT/include -I$MIK -I$TL/texk -I$NB/texk"
CFLAGS="$OPT -w -fno-strict-aliasing -fmacro-prefix-map=$REPO/="   # __FILE__ (assert) relative to the repository

KPSE="absolute atou cnf concat concat3 concatn db debug dir elt-dirs expand extend-fname file-p find-suffix fn fontmap getopt getopt1 hash kdefault kpathsea line magstep make-suffix path-elt pathsearch proginit progname readable rm-suffix str-list str-llist tex-file tex-glyph tex-hush tex-make tilde uppercasify variable version xbasename xcalloc xdirname xfopen xfseek xfseeko xftell xftello xgetcwd xmalloc xopendir xputenv xrealloc xstat xstrdup"
LIB="basechsuffix chartostring coredump eofeoln fprintreal inputint input2int main openclose printversion setupvar uexit usage version zround"  # lib/lib.a, main.c included
MAKEINDEX="genind mkind qsort scanid scanst sortid"

SRCS=()
for f in $KPSE;      do SRCS+=("$TL/texk/kpathsea/$f.c"); done
for f in $LIB;       do SRCS+=("$W2C/lib/$f.c"); done
for f in $MAKEINDEX; do SRCS+=("$MIK/$f.c"); done
SRCS+=("$NB/texk/web2c/bibtex.c")

objname() { echo "$OBJ/$(basename "$(dirname "$1")")-$(basename "${1%.*}").o"; }

echo "==> compiling ${#SRCS[@]} files with $EMCC ($OPT)"
pids=()
for src in "${SRCS[@]}"; do
  obj=$(objname "$src")
  case "$src" in
    */texk/kpathsea/*) flags="-DHAVE_CONFIG_H -DMAKE_KPSE_DLL -I$TL/texk/kpathsea $INC_W2C";;   # exposes kpathsea's internal API
    */texk/makeindexk/*) flags="-DHAVE_CONFIG_H -DUNIX -DKPATHSEA $INC_MIK";;
    *) flags="-DHAVE_CONFIG_H $INC_W2C";;
  esac
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    $EMCC $CFLAGS $flags -c -o "$obj" "$src" &
    pids+=($!)
    if [ ${#pids[@]} -ge "$JOBS" ]; then
      for p in "${pids[@]}"; do wait "$p" || { echo "error: compile failed" >&2; exit 1; }; done
      pids=()
    fi
  fi
done
for p in "${pids[@]+"${pids[@]}"}"; do wait "$p" || { echo "error: compile failed" >&2; exit 1; }; done

# kpathsea and web2c/lib go into archives, as natively (libkpathsea, lib/lib.a),
# so each program links only the members it uses.
rm -f "$OBJ/libkpathsea.a" "$OBJ/libweb2c.a"
$EMAR rcs "$OBJ/libkpathsea.a" $(for f in $KPSE; do objname "$TL/texk/kpathsea/$f.c"; done)
$EMAR rcs "$OBJ/libweb2c.a" $(for f in $LIB; do [ "$f" = main ] || objname "$W2C/lib/$f.c"; done)

# Link options as for tex.mjs, with less initial memory: neither program needs
# more than a few MB for an ordinary document, and memory grows if one does.
link() {  # link NAME EXPORT_NAME OBJECTS...
  local name=$1 export=$2; shift 2
  echo "==> linking dist/$name.mjs"
  $EMCC $OPT -o "$DIST/$name.mjs" "$@" \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME="$export" \
    -sENVIRONMENT=web,worker,node \
    -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=2147483648 \
    -sSTACK_SIZE=1048576 \
    -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 \
    -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
    -sEXPORTED_FUNCTIONS=_main,_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV,NODEFS,MEMFS,stringToNewUTF8,UTF8ToString,HEAPU8 \
    -sINCOMING_MODULE_JS_API=arguments,thisProgram,preRun,postRun,print,printErr,locateFile,wasmBinary,noInitialRun,onRuntimeInitialized,instantiateWasm,onExit,quit \
    -sERROR_ON_UNDEFINED_SYMBOLS=1 \
    -lnodefs.js \
    -Wno-unused-command-line-argument
}
link bibtex createBibtex "$(objname "$NB/texk/web2c/bibtex.c")" "$(objname "$W2C/lib/main.c")" "$OBJ/libweb2c.a" "$OBJ/libkpathsea.a"
link makeindex createMakeindex $(for f in $MAKEINDEX; do objname "$MIK/$f.c"; done) "$OBJ/libkpathsea.a"
ls -l "$DIST/bibtex.mjs" "$DIST/bibtex.wasm" "$DIST/makeindex.mjs" "$DIST/makeindex.wasm"
