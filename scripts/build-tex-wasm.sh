#!/usr/bin/env bash
# build-tex-wasm.sh — compile pdfTeX (DVI mode) to WebAssembly (docs/03 §4,
# Route B: the web2c-generated C from the native pass is compiled with emcc).
#
# Requires: vendor/native-build with texk/web2c/pdftex{ini,0,-pool}.c generated
# (scripts/native-texlive.sh), and emcc on PATH.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TL="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
OUT="$REPO/build/tex"
DIST="$REPO/dist"
W2C="$TL/texk/web2c"
EMCC="${EMCC:-emcc}"
JOBS="${JOBS:-8}"
OPT="${TEX_OPT:--O2}"

[ -f "$NB/texk/web2c/pdftex0.c" ] || { echo "error: run scripts/native-texlive.sh first (needs $NB/texk/web2c/pdftex0.c)" >&2; exit 1; }
mkdir -p "$OUT/obj" "$OUT/include/w2c" "$OUT/include/kpathsea" "$DIST"

# ---- configuration headers: take the native ones and fix them for wasm32 ---
sed -e 's/#define SIZEOF_LONG 8/#define SIZEOF_LONG 4/' \
    "$NB/texk/kpathsea/c-auto.h" > "$OUT/include/kpathsea/c-auto.h"
cp "$NB/texk/kpathsea/paths.h" "$NB/texk/kpathsea/kpathsea.h" "$OUT/include/kpathsea/"
sed -e '/#define IPC 1/d' -e '/HAVE_APPLICATIONSERVICES/d' \
    "$NB/texk/web2c/w2c/c-auto.h" > "$OUT/include/w2c/c-auto.h"

INC="-I$OUT/include -I$TL/libs/xpdf/xpdf-src -I$OUT/include/w2c -I$NB/texk/web2c -I$W2C -I$TL/texk -I$W2C/libmd5 -I$W2C/pdftexdir -I$W2C/synctexdir -I$NB/texk"
DEFS="-DHAVE_CONFIG_H -DPDF_PARSER_ONLY -D__SyncTeX__ -DSYNCTEX_ENGINE_H=\"synctex-pdftex.h\""
CFLAGS="$OPT -w -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -fno-strict-aliasing"

KPSE="absolute atou cnf concat concat3 concatn db debug dir elt-dirs expand extend-fname file-p find-suffix fn fontmap getopt getopt1 hash kdefault kpathsea line magstep make-suffix path-elt pathsearch proginit progname readable rm-suffix str-list str-llist tex-file tex-glyph tex-hush tex-make tilde uppercasify variable version xbasename xcalloc xdirname xfopen xfseek xfseeko xftell xftello xgetcwd xmalloc xopendir xputenv xrealloc xstat xstrdup"
LIB="basechsuffix chartostring coredump eofeoln fprintreal inputint input2int openclose printversion setupvar uexit usage version zround"  # no main.c: texmfmp.c defines main
PDFTEX="avl avlstuff epdf mapfile pkin subfont tounicode utils vfpacket writeenc writefont writeimg writejbig2 writejpg writepng writet1 writet3 writettf writezip pdftexextra"

SRCS=()
for f in $KPSE;   do SRCS+=("$TL/texk/kpathsea/$f.c"); done
for f in $LIB;    do SRCS+=("$W2C/lib/$f.c"); done
for f in $PDFTEX; do SRCS+=("$W2C/pdftexdir/$f.c"); done
SRCS+=("$W2C/libmd5/md5.c" "$W2C/synctexdir/synctex.c" "$REPO/src/c/tex/pdftoepdf-stub.c")
SRCS+=("$NB/texk/web2c/pdftexini.c" "$NB/texk/web2c/pdftex0.c" "$NB/texk/web2c/pdftex-pool.c")

echo "==> compiling $((${#SRCS[@]})) files with $EMCC ($OPT)"
OBJS=()
pids=()
n=0
for src in "${SRCS[@]}"; do
  obj="$OUT/obj/$(basename "$(dirname "$src")")-$(basename "${src%.*}").o"
  OBJS+=("$obj")
  extra=""
  case "$src" in */texk/kpathsea/*) extra="-DMAKE_KPSE_DLL -I$TL/texk/kpathsea";; esac   # exposes kpathsea's internal API
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    $EMCC $CFLAGS $DEFS $extra $INC -c -o "$obj" "$src" &
    pids+=($!)
    n=$((n+1))
    if [ $((n % JOBS)) = 0 ]; then wait; fi
  fi
done
wait
for p in "${pids[@]}"; do :; done

echo "==> linking dist/tex.mjs"
$EMCC $OPT -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -o "$DIST/tex.mjs" "${OBJS[@]}" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createTex \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=2147483648 \
  -sSTACK_SIZE=8388608 \
  -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=1 \
  -sEXPORTED_FUNCTIONS=_main,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=FS,callMain,ENV,NODEFS,MEMFS,stringToNewUTF8,UTF8ToString,HEAPU8 \
  -sINCOMING_MODULE_JS_API=arguments,thisProgram,preRun,postRun,print,printErr,locateFile,wasmBinary,noInitialRun,onRuntimeInitialized,instantiateWasm,onExit,quit \
  -sERROR_ON_UNDEFINED_SYMBOLS=1 \
  -lnodefs.js \
  -Wno-unused-command-line-argument
ls -l "$DIST/tex.mjs" "$DIST/tex.wasm"
