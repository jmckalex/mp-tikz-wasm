#!/usr/bin/env bash
# build-luatex-wasm.sh — compile LuaTeX (DVI mode use) to WebAssembly.
#
# Route B, as for pdfTeX: the sources and flags come from the native build's
# compile log (scripts/native-luatex.sh → build/native-luatex-compiles.json),
# with the substitutions wasm needs: our fixed c-auto.h, Emscripten's zlib and
# libpng ports, no dlopen, no luaffi (a stub table instead), and our patched
# mplib in place of the native tangle. Lua 5.3, pplib and zziplib are compiled
# from the vendored sources with the flags TeX Live gives them.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TL="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
GEN="$REPO/build/gen"
PATCHED="$REPO/build/patched"
OUT="$REPO/build/luatex"
DIST="$REPO/dist"
W2C="$TL/texk/web2c"
JSON="$REPO/build/native-luatex-compiles.json"
EMCC="${EMCC:-emcc}"
JOBS="${JOBS:-8}"
OPT="${LUATEX_OPT:--O2}"

[ -f "$JSON" ] || { echo "error: run scripts/native-luatex.sh first" >&2; exit 1; }
[ -f "$GEN/mp.c" ] || { echo "error: run make tangle first (needs $GEN/mp.c)" >&2; exit 1; }
mkdir -p "$OUT/obj" "$OUT/include/w2c" "$OUT/include/kpathsea" "$OUT/include/zzip" "$DIST"

# ---- configuration headers: the native ones, fixed for wasm32 ---------------
sed -e 's/#define SIZEOF_LONG 8/#define SIZEOF_LONG 4/' "$NB/texk/kpathsea/c-auto.h" > "$OUT/include/kpathsea/c-auto.h"
cp "$NB/texk/kpathsea/paths.h" "$NB/texk/kpathsea/kpathsea.h" "$OUT/include/kpathsea/"
sed -e '/#define IPC 1/d' -e '/HAVE_APPLICATIONSERVICES/d' "$NB/texk/web2c/w2c/c-auto.h" > "$OUT/include/w2c/c-auto.h"
sed -e 's/#define ZZIP_SIZEOF_LONG  8/#define ZZIP_SIZEOF_LONG  4/' "$NB/libs/zziplib/include/zzip/_config.h" > "$OUT/include/zzip/_config.h"

COMMON="$OPT -w -fno-strict-aliasing -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -I$OUT/include"
LUADEFS="-DLUA_COMPAT_MODULE -DLUA_COMPAT_5_2 -DLUAI_HASHLIMIT=6 -DLUA_USE_POSIX -D_LARGEFILE64_SOURCE -D_FILE_OFFSET_BITS=64 -D_LARGEFILE_SOURCE -I$NB/libs/lua53/include"

# ---- the compile list: recorded native commands, rewritten -----------------
# object name, source, flags — one per line, tab-separated
node -e '
const fs = require("fs");
const NB = process.argv[1], TL = process.argv[2], OUT = process.argv[3], GEN = process.argv[4];
const list = JSON.parse(fs.readFileSync(process.argv[5], "utf8"));
const lines = [];
for (const c of list) {
  if (/\/luaffi\//.test(c.src)) continue;                       // no C FFI in wasm
  // The native mplib is replaced by our patched tangle: the web2c-root tangles
  // (mp, psout, tfmin, mpmath*, mpstrings) are recompiled from build/gen and the
  // mplibdir core (avl, decNumber, decContext) from build/patched, as the
  // mplib-*/mputil-* entries added below. Skip the native copies here — their
  // recorded path is the VPATH srcdir fallback, which for the generated tangles
  // does not exist (docs/14 §10). lmplib.c, the LuaTeX-to-mplib binding, is kept.
  if (/\/texk\/web2c\/(mp|psout|tfmin|mpmath|mpmathdouble|mpmathdecimal|mpstrings)\.c$/.test(c.src)) continue;
  if (/\/mplibdir\/(avl|decNumber|decContext)\.c$/.test(c.src)) continue;
  let f = c.flags.split(" ").filter(Boolean);
  f = f.map((t) => t === "-I." ? `-I${NB}/texk/web2c` : t === "-I./w2c" ? `-I${NB}/texk/web2c/w2c` : t.replace(/^-I\.\.\/\.\.\/\.\.\/texlive-source\//, `-I${TL}/`))
       .filter((t) => !/libs\/(zlib|libpng|harfbuzz)\/include/.test(t) && t !== "-DLUA_USE_DLOPEN" && !/extra_version_info|^\+-%Y/.test(t));
  f.push("-Dextra_version_info=-wasm");
  if (/\/mplibdir\//.test(c.src)) f.unshift(`-I${GEN}`);          // lmplib.c against our tangled mplib headers
  const name = c.src.replace(/.*\/texk\/web2c\//, "").replace(/\.c$/, "").replace(/\//g, "-");
  lines.push([name, c.src, f.join(" ")].join("\t"));
}
fs.writeFileSync(`${OUT}/compile-list.tsv`, lines.join("\n") + "\n");
console.log(`==> ${lines.length} recorded compile commands (luaffi excluded)`);
' "$NB" "$TL" "$OUT" "$GEN" "$JSON"

# ---- libraries and shared web2c sources -----------------------------------
add() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$OUT/compile-list.tsv"; }
for f in "$TL"/libs/lua53/lua53-src/src/*.c; do
  case "$(basename "$f")" in lua.c|luac.c) continue;; esac
  add "lua53-$(basename "${f%.c}")" "$f" "$LUADEFS"
done
for f in "$TL"/libs/pplib/pplib-src/src/pp*.c "$TL"/libs/pplib/pplib-src/src/util/*.c; do
  case "$(basename "$f")" in pptest*) continue;; esac
  add "pplib-$(basename "${f%.c}")" "$f" "-I$NB/libs/pplib/include -I$TL/libs/pplib/pplib-src/src -I$TL/libs/pplib/pplib-src/src/util"
done
for f in dir err fetch file info plugin stat write zip; do
  add "zzip-$f" "$TL/libs/zziplib/zziplib-src/zzip/$f.c" "-I$NB/libs/zziplib/include -I$TL/libs/zziplib/zziplib-src"
done
KPSE="absolute atou cnf concat concat3 concatn db debug dir elt-dirs expand extend-fname file-p find-suffix fn fontmap getopt getopt1 hash kdefault kpathsea line magstep make-suffix path-elt pathsearch proginit progname readable rm-suffix str-list str-llist tex-file tex-glyph tex-hush tex-make tilde uppercasify variable version xbasename xcalloc xdirname xfopen xfseek xfseeko xftell xftello xgetcwd xmalloc xopendir xputenv xrealloc xstat xstrdup"
for f in $KPSE; do add "kpathsea-$f" "$TL/texk/kpathsea/$f.c" "-DHAVE_CONFIG_H -DMAKE_KPSE_DLL -I$TL/texk/kpathsea -I$TL/texk -I$NB/texk"; done
LIB="basechsuffix chartostring coredump eofeoln fprintreal inputint input2int openclose printversion setupvar uexit usage version zround"  # luatex.c defines main
W2CFLAGS="-DHAVE_CONFIG_H -I$NB/texk/web2c -I$NB/texk/web2c/w2c -I$W2C -I$W2C/w2c -I$TL/texk -I$NB/texk"
for f in $LIB; do add "lib-$f" "$W2C/lib/$f.c" "$W2CFLAGS"; done
add "libmd5-md5" "$W2C/libmd5/md5.c" "$W2CFLAGS -I$W2C/libmd5"
# our patched mplib (the tangle used for mplib.wasm) in place of the native libmplibcore/libmputil;
# no svgout: LuaTeX stubs the SVG and PNG backends in luatexdir/lua/mplibstuff.c
for f in mp psout tfmin mpmath mpmathdouble mpmathdecimal mpstrings; do add "mplib-$f" "$GEN/$f.c" "$W2CFLAGS -I$GEN -I$PATCHED -I$W2C/mplibdir -I$REPO/src/c/include/stub"; done
for f in avl decNumber decContext; do add "mputil-$f" "$PATCHED/$f.c" "$W2CFLAGS -I$PATCHED -I$W2C/mplibdir"; done
add "stub-ffi" "$REPO/src/c/luatex/ffi-stub.c" "$LUADEFS"

# ---- compile ----------------------------------------------------------------
TOTAL=$(wc -l < "$OUT/compile-list.tsv" | tr -d ' ')
echo "==> compiling $TOTAL files with $EMCC ($OPT)"
OBJS=()
# ---- source patches: patches/luatex/*.patch are applied to copies under
# $OUT/patched (the vendored tree is never modified); a source that has a
# patched copy is compiled from the copy, under the same object name and flags.
PL="$OUT/patched"; rm -rf "$PL"; mkdir -p "$PL"
for p in "$REPO"/patches/luatex/*.patch; do
  [ -f "$p" ] || continue
  echo "==> applying $(basename "$p")"
  for f in $(sed -n 's|^+++ b/\([^[:space:]]*\).*|\1|p' "$p"); do mkdir -p "$PL/$(dirname "$f")"; [ -f "$PL/$f" ] || cp "$W2C/$f" "$PL/$f"; done
  patch -s -p1 -d "$PL" < "$p"
done

n=0
while IFS=$'\t' read -r name src flags; do
  obj="$OUT/obj/$name.o"; OBJS+=("$obj")
  rel="${src#$W2C/}"; [ -f "$PL/$rel" ] && src="$PL/$rel"   # a patched copy replaces its source
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    # shellcheck disable=SC2086
    $EMCC $COMMON $flags -c -o "$obj" "$src" &
    n=$((n+1)); if [ $((n % JOBS)) = 0 ]; then wait; fi
  fi
done < "$OUT/compile-list.tsv"
wait

echo "==> linking dist/luatex.mjs"
$EMCC $OPT -sUSE_ZLIB=1 -sUSE_LIBPNG=1 -o "$DIST/luatex.mjs" "${OBJS[@]}" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createLuaTeX \
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
ls -l "$DIST/luatex.mjs" "$DIST/luatex.wasm"
