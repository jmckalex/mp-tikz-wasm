#!/usr/bin/env bash
# build-texmf.sh — assemble build/texmf, the flattened TeX/MetaPost tree that
# tex.wasm and mplib.wasm read (docs/06 §1, §3). Sourced from the local TeX
# Live (the oracle), so the bundle and the golden files agree by construction.
#
# Layout:
#   web2c/texmf.cnf          fonts/tfm/*.tfm (flat)      metapost/base/*.mp
#   tex/plain/**  tex/generic/**  tex/latex/**            fonts/vf/*.vf (flat)
#   fonts/type1/*.pfb (flat)  fonts/map/{mpost,psfonts,texfonts}.map  ls-R
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$REPO/build/texmf}"
TEXMF="$(kpsewhich -var-value TEXMFDIST)"
[ -d "$TEXMF" ] || { echo "error: no TeX Live found" >&2; exit 1; }
echo "==> assembling $OUT from $TEXMF"
rm -rf "$OUT"
mkdir -p "$OUT"/{web2c,tex/plain/base,tex/plain/config,tex/generic,tex/latex,fonts/tfm,fonts/vf,fonts/type1,fonts/map,fonts/enc,metapost/base}

cp "$REPO/bundles/texmf.cnf" "$OUT/web2c/texmf.cnf"

# --- TeX macro packages -------------------------------------------------------
cp "$TEXMF"/tex/plain/base/*.tex "$OUT/tex/plain/base/"
cp "$TEXMF"/tex/plain/config/{tex,etex}.ini "$OUT/tex/plain/config/"
mkdir -p "$OUT/tex/generic/etex" && cp "$TEXMF/tex/luatex/hyph-utf8/etex.src" "$OUT/tex/generic/etex/etex.src"
cp -R "$TEXMF/tex/plain/etex" "$OUT/tex/plain/etex"
# a minimal language.def / language.dat: US English only (keeps latex.fmt small)
mkdir -p "$OUT/tex/generic/config"
printf '%%%% language.def for tex.wasm: US English only\n\\addlanguage{USenglish}{hyphen}{}{0}{0}\n\\uselanguage{USenglish}\n' > "$OUT/tex/generic/config/language.def"
printf '%%%% language.dat for tex.wasm: US English only\nenglish hyphen.tex\n=usenglish\n=USenglish\n' > "$OUT/tex/generic/config/language.dat"
for d in hyphen tex-ini-files pdftex unicode-data iftex kvsetkeys kvdefinekeys ltxcmds pdftexcmds infwarerr etexcmds atbegshi atveryend; do
  [ -d "$TEXMF/tex/generic/$d" ] && cp -R "$TEXMF/tex/generic/$d" "$OUT/tex/generic/$d"
done
for d in base tex-ini-files l3kernel l3backend l3packages amsmath amsfonts amscls tools graphics graphics-cfg graphics-def latexconfig \
         xcolor pgf tikz-cd psnfss kvoptions etoolbox xkeyval geometry booktabs mathtools; do
  [ -d "$TEXMF/tex/latex/$d" ] && cp -R "$TEXMF/tex/latex/$d" "$OUT/tex/latex/$d"
done
# pgf's generic part lives under tex/generic/pgf
[ -d "$TEXMF/tex/generic/pgf" ] && cp -R "$TEXMF/tex/generic/pgf" "$OUT/tex/generic/pgf"
# drop documentation-ish files that are never input
find "$OUT/tex" \( -name '*.dtx' -o -name '*.ins' -o -name '*.pdf' -o -name 'README*' -o -name 'CHANGES*' \) -delete

# --- fonts ------------------------------------------------------------------
for d in cm amsfonts/cmextra amsfonts/symbols amsfonts/euler latex-fonts knuth-lib; do
  find "$TEXMF/fonts/tfm/public/$d" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
done
for d in cm cmextra symbols euler latxfont; do
  find "$TEXMF/fonts/type1/public/amsfonts/$d" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
done
# MetaPost looks for mpost.map first, then psfonts.map (psout.w). Build both
# from the dvips map fragments of the fonts we ship.
cat "$TEXMF"/fonts/map/dvips/amsfonts/{cm,cmextra,symbols,euler,latxfont}.map > "$OUT/fonts/map/mpost.map"
cp "$OUT/fonts/map/mpost.map" "$OUT/fonts/map/psfonts.map"
cp "$TEXMF/fonts/map/fontname/texfonts.map" "$OUT/fonts/map/texfonts.map"

# --- MetaPost ---------------------------------------------------------------
cp "$TEXMF"/metapost/base/*.mp "$OUT/metapost/base/"
for d in metaobj featpost mcf2graph metauml cmarrows roundrect shapes splines mpcolornames; do
  [ -d "$TEXMF/metapost/$d" ] && mkdir -p "$OUT/metapost/$d" && find "$TEXMF/metapost/$d" -name '*.mp' -exec cp {} "$OUT/metapost/$d/" \;
done
# the TeX-side helper that mpost uses for btex (needed by mfplain? no) — nothing else

# --- ls-R database for kpathsea ------------------------------------------------
(cd "$OUT" && {
  echo "% ls-R -- filename database for kpathsea; do not change this line."
  find . -type d | sort | while read -r d; do
    echo; echo "$d:"
    ls -1 "$d"
  done
} > ls-R)
echo "==> $(find "$OUT" -type f | wc -l | tr -d ' ') files, $(du -sh "$OUT" | cut -f1)"
