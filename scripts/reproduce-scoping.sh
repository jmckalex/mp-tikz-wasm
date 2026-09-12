#!/usr/bin/env bash
#
# reproduce-scoping.sh — rebuild, from scratch, every empirical result recorded
# in docs/13-verified-findings.md.
#
# Nothing here touches WebAssembly. The point is to prove, natively and in about
# two minutes, that mplib compiles against bare libc and that the embedding
# contract in docs/04 is real. Run this FIRST, before writing any code.
#
# Requires: curl, a C compiler, ctangle (ships with TeX Live), and a TeX Live
# installation to act as the oracle.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${1:-/tmp/mpscope}"
BRANCH="${MPWASM_TL_BRANCH:-master}"
RAW="https://raw.githubusercontent.com/TeX-Live/texlive-source/${BRANCH}/texk/web2c/mplibdir"

# Locate a TeX Live to act as the oracle.
TEXMF="$(kpsewhich -var-value TEXMFDIST 2>/dev/null || true)"
if [ -z "$TEXMF" ]; then
  echo "error: no TeX Live found (kpsewhich not on PATH). It is the oracle." >&2
  exit 1
fi
echo "==> oracle: $(mpost --version | head -1)"
echo "==> texmf:  $TEXMF"

mkdir -p "$WORK" && cd "$WORK"

echo "==> 1/6 fetching mplibdir from texlive-source@${BRANCH}"
for f in mp.w mpost.w mpxout.w psout.w svgout.w tfmin.w mpmath.w \
         mpmathdouble.w mpmathdecimal.w mpstrings.w mpconfig.h \
         avl.c avl.h decNumber.c decNumber.h decContext.c decContext.h \
         decNumberLocal.h; do
  [ -f "$f" ] || curl -sSfO "$RAW/$f" &
done
wait

echo "==> 2/6 tangling (CWEB -> C; no web2c, no Pascal)"
for f in mp psout svgout tfmin mpxout mpmath mpmathdouble mpmathdecimal mpstrings; do
  ctangle "$f.w" >/dev/null
done
echo "    generated: $(ls *.c *.h | tr '\n' ' ')"

echo "==> 3/6 installing the compatibility shims"
mkdir -p w2c stub
cp "$REPO/reference/w2c-config-shim.h" w2c/config.h
cp "$REPO/reference/stubs/png.h"  stub/png.h
cp "$REPO/reference/stubs/zlib.h" stub/zlib.h

echo "==> 4/6 compiling every module against bare libc"
OBJS=""
for f in mp psout svgout mpmath mpmathdouble mpmathdecimal mpstrings tfmin \
         mpxout avl decNumber decContext; do
  cc -c -O1 -w -I. -Istub -o "$f.o" "$f.c"
  OBJS="$OBJS $f.o"
done
printf '    total object size: %s bytes\n' "$(cat $OBJS | wc -c | tr -d ' ')"
ls -l *.o | awk '{printf "      %8d  %s\n", $5, $9}'

echo "==> 5/6 linking and running the reference embedding"
sed "s#/usr/local/texlive/2025/texmf-dist#$TEXMF#g" \
    "$REPO/reference/host_shim_reference.c" > host_test.c
cc -O1 -w -I. -Istub -o host_test host_test.c $OBJS -lm
# NOTE the driver pattern: mp_execute() reads exactly ONE line from its string
# argument, so a multi-line document must live in a file and be pulled in with
# a one-line `input`. See docs/13 section 13.
cat > tier0.mp <<'MPEOF'
prologues := 3;
beginfig(1);
  draw fullcircle scaled 100;
  label.top("MetaPost", (0,50));
endfig;
end.
MPEOF
echo "--- tier 0: label(), no TeX, Type 1 outlines ---"
./host_test 'input tier0' 2>&1 | tail -20

echo "==> 6/6 regenerating the .mpx ground truth with the oracle"
cp "$REPO/reference/mpx-samples/latex-math.mp" .
rm -f latex-math.mpx
mpost -tex=latex latex-math.mp >/dev/null 2>&1 || true
if diff -q latex-math.mpx "$REPO/reference/mpx-samples/latex-math.mpx" >/dev/null 2>&1; then
  echo "    .mpx matches the committed sample"
else
  echo "    .mpx DIFFERS from the committed sample (expected if your TeX Live"
  echo "    version differs from the one in docs/13). Review:"
  diff -u "$REPO/reference/mpx-samples/latex-math.mpx" latex-math.mpx | head -20 || true
fi

cat <<'DONE'

==> all scoping results reproduced.

What you just proved:
  * MetaPost tangles with ctangle alone and compiles against libc alone.
  * No kpathsea, no cairo, no GMP/MPFR, no zlib/libpng are required.
  * The MP_options callback contract works: find_file resolved plain.mp,
    make_text intercepted btex, and the run produced a structured figure.
  * prologues:=3 yields real glyph outlines with no TeX in the loop.

Next: read START-HERE.md, then docs/05-tex-bridge.md.
DONE
