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
# keep formats already built by tex.wasm (scripts/make-formats.mjs) across rebuilds
KEEP="$(mktemp -d)"; cp "$OUT"/web2c/*.fmt "$KEEP/" 2>/dev/null || true
rm -rf "$OUT"
mkdir -p "$OUT"/{web2c,tex/plain/base,tex/plain/config,tex/generic,tex/latex,fonts/tfm,fonts/vf,fonts/type1,fonts/map,fonts/enc,metapost/base}

cp "$REPO/bundles/texmf.cnf" "$OUT/web2c/texmf.cnf"
cp "$KEEP"/*.fmt "$OUT/web2c/" 2>/dev/null || true; rm -rf "$KEEP"

# --- TeX macro packages -------------------------------------------------------
cp "$TEXMF"/tex/plain/base/*.tex "$OUT/tex/plain/base/"
cp "$TEXMF"/tex/plain/config/{tex,etex}.ini "$OUT/tex/plain/config/"
# plain-TeX front ends of pgf/pgfplots (\input tikz)
for d in pgf pgfplots; do [ -d "$TEXMF/tex/plain/$d" ] && cp -R "$TEXMF/tex/plain/$d" "$OUT/tex/plain/$d"; done
mkdir -p "$OUT/tex/generic/etex" && cp "$TEXMF/tex/luatex/hyph-utf8/etex.src" "$OUT/tex/generic/etex/etex.src"
cp -R "$TEXMF/tex/plain/etex" "$OUT/tex/plain/etex"
# a minimal language.def / language.dat: US English only (keeps latex.fmt small)
mkdir -p "$OUT/tex/generic/config"
# the first line must match etex.src's header check ("%% e-TeX V2.0;2")
printf '%%%% e-TeX V2.0;2\n%%%% language.def for tex.wasm: US English only\n\\addlanguage{USenglish}{hyphen}{}{0}{0}\n\\uselanguage{USenglish}\n' > "$OUT/tex/generic/config/language.def"
printf '%%%% language.dat for tex.wasm: US English only\nenglish hyphen.tex\n=usenglish\n=USenglish\n' > "$OUT/tex/generic/config/language.dat"
for d in hyphen tex-ini-files pdftex unicode-data iftex kvsetkeys kvdefinekeys ltxcmds pdftexcmds infwarerr etexcmds atbegshi atveryend xkeyval gettitlestring bigintcalc bitset intcalc uniquecounter tikz-cd pdfescape stringenc luatex85; do
  [ -d "$TEXMF/tex/generic/$d" ] && cp -R "$TEXMF/tex/generic/$d" "$OUT/tex/generic/$d"
done
for d in base tex-ini-files l3kernel l3backend l3packages amsmath amsfonts amscls tools graphics graphics-cfg graphics-def latexconfig \
         xcolor pgf tikz-cd pgfplots psnfss kvoptions etoolbox xkeyval geometry booktabs mathtools \
         ec standalone varwidth preview currfile filehook fontenc \
         hyperref hycolor kvsetkeys refcount rerunfilecheck atveryend letltxmacro auxhook url listings fp imakeidx todonotes firstaid; do
  [ -d "$TEXMF/tex/latex/$d" ] && cp -R "$TEXMF/tex/latex/$d" "$OUT/tex/latex/$d"
done
# LuaTeX in DVI mode (dviluatex.fmt, dvilualatex.fmt): its etex.src loads
# hyphenation through Lua, babel's format-time hyphenation config has a
# LuaTeX variant, and language.dat.lua describes the (single) language.
mkdir -p "$OUT/tex/luatex/hyph-utf8" "$OUT/tex/generic/babel"
cp "$TEXMF/tex/luatex/hyph-utf8/etex.src" "$OUT/tex/luatex/hyph-utf8/"
[ -f "$TEXMF/tex/luatex/hyph-utf8/luatex-hyphen.lua" ] && cp "$TEXMF/tex/luatex/hyph-utf8/luatex-hyphen.lua" "$OUT/tex/luatex/hyph-utf8/"
cp "$TEXMF/tex/generic/babel/hyphen.cfg" "$TEXMF/tex/generic/babel/luababel.def" "$OUT/tex/generic/babel/"
cat > "$OUT/tex/generic/config/language.dat.lua" <<'LUA'
-- language.dat.lua for luatex.wasm: US English only, dumped in the format
return {
  ["english"] = { loader = "hyphen.tex", special = "language0", lefthyphenmin = 2, righthyphenmin = 3, synonyms = { "usenglish", "USenglish", "american" } },
}
LUA
# pgf's and pgfplots' generic parts live under tex/generic
for d in pgf pgfplots; do [ -d "$TEXMF/tex/generic/$d" ] && cp -R "$TEXMF/tex/generic/$d" "$OUT/tex/generic/$d"; done
# drop documentation-ish files that are never input
find "$OUT/tex" \( -name '*.dtx' -o -name '*.ins' -o -name '*.pdf' -o -name 'README*' -o -name 'CHANGES*' \) -delete

# --- the TikZ snapshot format (docs/14 §8) -------------------------------------
# tikz.fmt is latex.fmt plus pgf, its common libraries, pgfplots and tikz-cd,
# preloaded with \RequirePackage before any \documentclass (the documented way
# to load packages ahead of the class). tikz.ini wraps latex.ini: it lets
# latex.ltx run and intercepts its final \dump to load the packages first.
# Only behaviour-neutral packages go in: nothing here changes the output of a
# document that does not use it.
mkdir -p "$OUT/tex/latex/mp-tikz-wasm"
cat > "$OUT/tex/latex/mp-tikz-wasm/tikz-snapshot.tex" <<'INI'
% tikz-snapshot.tex — read by tikz.ini in place of latex.ltx's final \dump.
% pgf loads its own dependencies with \usepackage, which latex.ltx forbids
% before \documentclass; \documentclass re-establishes the real \usepackage.
% Only libraries that are purely definitional are preloaded: `bending`,
% `babel`, `external`, `patterns.meta` and \pgfplotsset{compat=...} change
% the output of documents that did not ask for them, so they stay out
% (scripts/golden-tikz.mjs proves tikz.fmt and latex.fmt give identical pages).
\let\usepackage\RequirePackage
\def\pgfsysdriver{pgfsys-dvisvgm.def}
\RequirePackage{tikz}
\usetikzlibrary{arrows.meta,calc,positioning,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,shapes.callouts,decorations.pathmorphing,decorations.pathreplacing,decorations.markings,decorations.text,decorations.shapes,patterns,shadings,shadows,fadings,mindmap,fit,backgrounds,matrix,trees,intersections,through,angles,quotes,3d,math,plotmarks,scopes,chains,automata,petri,er,topaths,perspective,graphs}
\RequirePackage{pgfplots}
\RequirePackage{tikz-cd}
% loading libraries allocated pgf/svg object ids; start documents from the
% same counters a plain latex.fmt run would
\makeatletter
\global\pgf@sys@id@count=0 \global\pgf@sys@svg@objectcount=0 \global\pgf@sys@svg@scopecount=0 \global\pgf@sys@svg@type@count=0
\makeatother
INI
cat > "$OUT/tex/latex/mp-tikz-wasm/tikz.ini" <<'INI'
% tikz.ini — like latex.ini, but load tikz-snapshot.tex before dumping
\catcode`\{=1 \catcode`\}=2 \catcode`\#=6
\ifx\pdfoutput\undefined \else \ifx\pdfoutput\relax \else \input pdftexconfig \pdfoutput=0 \fi\fi
\scrollmode
\let\mpwasmrealdump\dump
\def\dump{\let\dump\mpwasmrealdump \input tikz-snapshot.tex \dump}
% latex.ltx insists on virgin catcodes (it checks that { is not yet a brace)
\catcode`\{=12 \catcode`\}=12 \catcode`\#=12
\input latex.ltx
\endinput
INI

# --- fonts ------------------------------------------------------------------
for d in cm amsfonts/cmextra amsfonts/symbols amsfonts/euler latex-fonts knuth-lib; do
  find "$TEXMF/fonts/tfm/public/$d" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
done
# EC metrics: \usepackage[T1]{fontenc} loads T1/cmr at once, before lmodern (or
# anything else) can redirect it; the outlines (cm-super, 60 MB) are not shipped
find "$TEXMF/fonts/tfm/jknappen/ec" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
for d in cm cmextra symbols euler latxfont; do
  find "$TEXMF/fonts/type1/public/amsfonts/$d" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
done
# Latin Modern: T1/TS1-encoded text fonts for \usepackage[T1]{fontenc} and
# \usepackage{lmodern} (TikZ documents, LaTeX text). Type 1 outlines are
# fetched lazily per font, so the 9 MB only costs what a document uses.
if [ -d "$TEXMF/fonts/tfm/public/lm" ]; then
  find "$TEXMF/fonts/tfm/public/lm" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
  find "$TEXMF/fonts/type1/public/lm" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
  find "$TEXMF/fonts/enc/dvips/lm" -name '*.enc' -exec cp {} "$OUT/fonts/enc/" \;
  cp -R "$TEXMF/tex/latex/lm" "$OUT/tex/latex/lm"
else
  echo "  warning: Latin Modern (lm) not in $TEXMF — install the lmodern package; LaTeX text output will differ" >&2
fi
# The 35 standard PostScript fonts (psnfss: times, helvetica, courier, palatino,
# bookman, avant garde, new century, zapf chancery, symbol, dingbats) as URW
# Type 1 clones: LaTeX reads the T1-encoded metrics, dvisvgm resolves them
# through the virtual fonts to the 8r raw metrics and the URW outlines.
for d in avantgar bookman courier helvetic ncntrsbk palatino symbol times zapfchan zapfding; do
  [ -d "$TEXMF/fonts/tfm/adobe/$d" ] && find "$TEXMF/fonts/tfm/adobe/$d" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
  [ -d "$TEXMF/fonts/vf/adobe/$d" ] && find "$TEXMF/fonts/vf/adobe/$d" -name '*.vf' -exec cp {} "$OUT/fonts/vf/" \;
  [ -d "$TEXMF/fonts/type1/urw/$d" ] && find "$TEXMF/fonts/type1/urw/$d" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
done
[ -f "$TEXMF/fonts/enc/dvips/base/8r.enc" ] && cp "$TEXMF/fonts/enc/dvips/base/8r.enc" "$OUT/fonts/enc/"
# MetaPost looks for mpost.map first, then psfonts.map (psout.w); pdfTeX in PDF
# mode and dvisvgm read pdftex.map / ps2pk.map. All are built from the dvips map
# fragments of the fonts we ship; a fragment absent from this TeX Live is skipped.
: > "$OUT/fonts/map/mpost.map"
for m in "$TEXMF"/fonts/map/dvips/amsfonts/{cm,cmextra,symbols,euler,latxfont}.map "$TEXMF/fonts/map/dvips/lm/lm.map" "$TEXMF/fonts/map/dvips/tetex/ps2pk35.map"; do
  [ -f "$m" ] && cat "$m" >> "$OUT/fonts/map/mpost.map"
done
cp "$OUT/fonts/map/mpost.map" "$OUT/fonts/map/psfonts.map"
cp "$OUT/fonts/map/mpost.map" "$OUT/fonts/map/pdftex.map"
cp "$OUT/fonts/map/mpost.map" "$OUT/fonts/map/ps2pk.map"
[ -f "$TEXMF/fonts/map/fontname/texfonts.map" ] && cp "$TEXMF/fonts/map/fontname/texfonts.map" "$OUT/fonts/map/texfonts.map"

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
