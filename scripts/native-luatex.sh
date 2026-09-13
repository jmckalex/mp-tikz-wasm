#!/usr/bin/env bash
# native-luatex.sh — build LuaTeX natively in vendor/native-build (Route B, as
# for pdfTeX) and record every compile command, so scripts/build-luatex-wasm.sh
# can compile exactly the same sources with the same flags under emcc.
#
#   scripts/native-luatex.sh            build if the log is missing, then parse
#   scripts/native-luatex.sh --rebuild  clean the LuaTeX objects and rebuild
#
# Produces build/native-luatex.log, build/native-luatex-compiles.json and
# vendor/native-build/texk/web2c/luatex (a native LuaTeX of the pinned source,
# useful as an oracle).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$REPO/scripts/native-common.sh"
LOG="$REPO/build/native-luatex.log"
[ -f "$NB/texk/web2c/Makefile" ] || { echo "error: run scripts/native-texlive.sh first" >&2; exit 1; }
mkdir -p "$REPO/build"
if [ "${1:-}" = "--rebuild" ] || [ ! -f "$LOG" ]; then
  find "$NB/texk/web2c/luatexdir" -name '*.o' -delete
  rm -f "$NB"/texk/web2c/{libluatex,libluatexspecific,libff,libluamisc,libluasocket,libluaffi,libunilib,libmd5}.a "$NB/texk/web2c/luatex"
  echo "==> the libraries luatex links besides those of pdftex (lua53, pplib, zziplib)"
  for lib in lua53 pplib zziplib; do native_package libs/$lib; done
  echo "==> native LuaTeX build (make -C texk/web2c luatex V=1)"
  make -C "$NB/texk/web2c" luatex V=1 -j"${JOBS:-8}" > "$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
fi
python3 - "$LOG" "$NB" "$REPO/vendor/texlive-source" "$REPO/build/native-luatex-compiles.json" <<'PY'
import re, shlex, json, os, sys
log, NB, TL, out = sys.argv[1:]
bases = [NB+'/texk/web2c', TL+'/texk/web2c', NB+'/libs/lua53', TL+'/libs/lua53', NB+'/libs/pplib', TL+'/libs/pplib', NB+'/libs/zziplib', TL+'/libs/zziplib']
def resolve(p):
    for b in bases:
        q = os.path.normpath(os.path.join(b, p))
        if os.path.exists(q): return q
    return p
compiles = []
for l in open(log):
    # parallel make interleaves output, so a command may be glued to a warning line
    i = l.find('gcc -DHAVE_CONFIG_H')
    if i < 0 or ' -c ' not in l: continue
    l = l[i:]
    src = None
    bt = re.search(r"`test -f '([^']+)' \|\| echo '([^']+)'`\1", l)
    if bt: src = bt.group(2) + bt.group(1); l = l.replace(bt.group(0), ' SRCPLACEHOLDER ')
    toks = shlex.split(l)[1:]
    flags = []; i = 0
    while i < len(toks):
        t = toks[i]
        if t in ('-MT', '-MF', '-o'): i += 2; continue
        if t in ('-MD', '-MP', '-c', '-g', '-O2', '-fPIC', '-DPIC', '-fno-common', 'SRCPLACEHOLDER') or t.startswith('-W'): i += 1; continue
        if t.endswith('.c'):
            if src is None: src = t
            i += 1; continue
        flags.append(t); i += 1
    compiles.append({'src': resolve(src), 'flags': ' '.join(flags)})
json.dump(compiles, open(out, 'w'), indent=0)
print(f"==> {len(compiles)} compile commands recorded in {os.path.relpath(out)}")
PY
ls -l "$NB/texk/web2c/luatex" 2>/dev/null | awk '{print "==> native luatex:", $5, "bytes"}'
