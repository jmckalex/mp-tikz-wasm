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
# Some distributions package fonts in a sibling tree rather than in TEXMFDIST
# (Debian's lmodern installs Latin Modern under /usr/share/texmf), so a few
# lookups below search every configured TeX tree. `tree_with REL` echoes the
# first tree that contains REL.
TEXMF_TREES="$(kpsewhich -expand-path '$TEXMF' 2>/dev/null | tr ':' '\n' | awk 'NF && !seen[$0]++')"
tree_with() { for t in $TEXMF_TREES; do [ -e "$t/$1" ] && { echo "$t"; return 0; }; done; return 1; }
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
# chemfig, simplekv (chemfig's key-value parser) and circuitikz's generic half
# are here for parity with TikZJax, which shipped them; embedders replacing it
# (Folio) have notes that use them. They land in the tex-plain bundle, which
# claims tex/generic/ apart from pgf and tikz-cd.
for d in hyphen tex-ini-files pdftex unicode-data iftex kvsetkeys kvdefinekeys ltxcmds pdftexcmds infwarerr etexcmds atbegshi atveryend xkeyval gettitlestring bigintcalc bitset intcalc uniquecounter tikz-cd pdfescape stringenc luatex85 \
         chemfig simplekv circuitikz; do
  [ -d "$TEXMF/tex/generic/$d" ] && cp -R "$TEXMF/tex/generic/$d" "$OUT/tex/generic/$d"
done
# spath3 is here for its TikZ libraries rather than for its own sake: pgf does
# not ship `calligraphy` (or `knots`), so \usetikzlibrary{calligraphy} fails
# without this package's four files — 284 KB, and they carry their own
# dependency (\RequirePackage{spath3}) in the same directory.
for d in base tex-ini-files l3kernel l3backend l3packages amsmath amsfonts amscls tools graphics graphics-cfg graphics-def latexconfig \
         xcolor pgf tikz-cd pgfplots spath3 psnfss kvoptions etoolbox xkeyval geometry booktabs mathtools \
         ec standalone varwidth preview currfile filehook fontenc \
         hyperref hycolor kvsetkeys refcount rerunfilecheck atveryend letltxmacro auxhook url listings fp imakeidx todonotes firstaid \
         circuitikz tikz-3dplot epstopdf-pkg grfext fontaxes figureversions; do
  [ -d "$TEXMF/tex/latex/$d" ] && cp -R "$TEXMF/tex/latex/$d" "$OUT/tex/latex/$d"
done
# circuitikz keeps every earlier release for LaTeX's rollback (\usepackage{circuitikz}[=v0.9.3],
# or \usepackage{circuitikz-0.9.3}): twelve frozen copies, 8.8 MB of the 8.9 MB it
# would add. The current release is circuitikz.sty plus the generic pgfcirc*.tex
# files, so the old ones stay behind and asking for one fails as "not found".
rm -f "$OUT"/tex/latex/circuitikz/circuitikz-*.sty "$OUT"/tex/latex/circuitikz/circuitikz-*-body.tex
# PDF output (mp.latex(..., { output: 'pdf' })): graphics' pdftex.def needs
# epstopdf-base (above) and ConTeXt's supp-pdf.mkii, its MetaPost-to-PDF converter,
# which the tex// search finds at its TeX Live path.
t="$(tree_with tex/context/base/mkii/supp-pdf.mkii || true)"
if [ -n "$t" ]; then mkdir -p "$OUT/tex/context/base/mkii" && cp "$t/tex/context/base/mkii/supp-pdf.mkii" "$OUT/tex/context/base/mkii/"
else echo "warning: supp-pdf.mkii not found in any TeX tree; LaTeX PDF output will stop" >&2; fi
# this project's own TeX files (bundles/tex): the svg.attributes TikZ library.
# tex/generic, so plain TeX finds it too; it rides in the tex-plain bundle.
mkdir -p "$OUT/tex/generic/mp-tikz-wasm"
cp "$REPO"/bundles/tex/*.tex "$OUT/tex/generic/mp-tikz-wasm/"
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
# --- OpenType fonts under LuaTeX (luaotfload) ---------------------------------
# luaotfload is what gives \usepackage{fontspec} real OTF/TTF loading. It needs
# no HarfBuzz: its default node mode shapes in Lua on top of the FontForge-derived
# fontloader already compiled into luatex.wasm, so the engine needed no change.
# The four Lua packages are its own dependency chain -- lua-uni-algos supplies
# lua-uni-case, which luaotfload-database requires and nothing else pulls in.
# Faces are found through OPENTYPEFONTS/TTFONTS, so a host can drop a system
# font into fonts/opentype (or fonts/truetype) and \setmainfont[Path=...] finds it.
mkdir -p "$OUT/tex/luatex" "$OUT/fonts/opentype/public" "$OUT/fonts/truetype"
# Searched in every TeX tree (distributions split packages across trees), and a
# missing one is named: silently skipped, it surfaced only as a LuaLaTeX run with
# no DVI in make-fontdb.
otf_pkg() {   # otf_pkg tex/luatex luaotfload
  local t; if t="$(tree_with "$1/$2")"; then cp -R "$t/$1/$2" "$OUT/$1/$2"
  else echo "warning: $1/$2 not found in any TeX tree; OpenType fonts will not work" >&2; fi
}
for d in luaotfload lualibs luatexbase lua-uni-algos; do otf_pkg tex/luatex "$d"; done
# luaotfload's configuration (found through kpse, so a document's own
# ./luaotfload.conf still wins). A face the host supplies with addFiles() sits in
# the working directory, which luaotfload's name index leaves out unless
# scan-local is on: \setmainfont{Optima} then fell back to a *file* called
# Optima (the first face of Optima.ttc) and fontspec could not resolve
# Optima/B, /I, /BI, so bold and italic came out regular. With scan-local, the
# rescan that a missed name already triggers also reads the working directory.
# luaotfload never saves an index with such entries, so the prebuilt one is
# untouched (make-fontdb.mjs turns it off while building that).
if [ -d "$OUT/tex/luatex/luaotfload" ]; then
  printf '%s\n' '; mp-tikz-wasm: index faces in the working directory (addFiles) when a name misses' \
    '[db]' '  scan-local = true' > "$OUT/tex/luatex/luaotfload/luaotfload.conf"
fi
for d in fontspec unicode-math; do otf_pkg tex/latex "$d"; done
# lualatex-math is unicode-math's LuaTeX half -- \usepackage{unicode-math} loads it
# and stops dead without it. It sits under tex/lualatex, which TEXINPUTS.dvilualatex
# searches first and nothing else in this tree uses.
mkdir -p "$OUT/tex/lualatex"
for d in lualatex-math; do otf_pkg tex/lualatex "$d"; done
# Latin Modern in OpenType, so fontspec and unicode-math work with no host fonts
# at all (the text family rides with the machinery, the maths font on its own).
# Searched in every configured TeX tree, not just TEXMFDIST: Ubuntu's
# fonts-lmodern installs these under /usr/share/texmf, as it does the Type 1
# faces below, and a tree without them ships an opentype bundle that fails at
# the first \setmainfont.
for d in lm lm-math; do
  t="$(tree_with "fonts/opentype/public/$d" || true)"
  if [ -n "$t" ]; then
    cp -R "$t/fonts/opentype/public/$d" "$OUT/fonts/opentype/public/$d"
  else
    echo "  warning: OpenType Latin Modern ($d) not found in any TeX tree — install lmodern / fonts-lmodern; fontspec documents will fail" >&2
  fi
done
# Patches to the macro packages copied above: patches/texmf/*.patch, unified
# diffs against this tree, applied with -p1. One so far: luaotfload.sty gains
# the shipout hook its DVI module needs and only the LaTeX kernel provides, so
# OpenType fonts work under plain LuaTeX as well (docs/14 §15). A patch whose
# target is missing from this TeX Live is skipped; one that fails to apply
# stops the build rather than shipping a silently stock file.
for p in "$REPO"/patches/texmf/*.patch; do
  [ -f "$p" ] || continue
  target="$(sed -n 's|^+++ b/||p' "$p" | head -1)"
  if [ -f "$OUT/$target" ]; then
    echo "==> applying $(basename "$p")"
    patch -s -t -p1 -d "$OUT" < "$p"
  else
    echo "  skipping $(basename "$p"): $target is not in this TeX Live" >&2
  fi
done

# pgf's and pgfplots' generic parts live under tex/generic
for d in pgf pgfplots; do [ -d "$TEXMF/tex/generic/$d" ] && cp -R "$TEXMF/tex/generic/$d" "$OUT/tex/generic/$d"; done
# --- PostScript: the opt-in `ghostscript` bundle ----------------------------------
# dvisvgm runs PostScript specials through Ghostscript (src/ts/ghostscript.ts)
# and, as dvips does, first runs dvips's own PostScript headers: tex.pro defines
# TeXDict, special.pro and color.pro what graphicx's and color's dvips drivers
# write, l3backend-dvips.pro the kernel's. Those go in the `ghostscript` bundle
# with the PSTricks family, macros and .pro headers alike: every pst-* package
# this TeX Live has, except the three that are mostly data (pst-geo's maps,
# pst-poker's and pst-flags' artwork: 36 MB of the family's 46), and multido,
# which PSTricks loads.
mkdir -p "$OUT/dvips"
for d in base l3backend; do
  t="$(tree_with "dvips/$d" || true)"; [ -n "$t" ] && cp -R "$t/dvips/$d" "$OUT/dvips/$d"
done
for top in dvips tex/generic tex/latex; do
  t="$(tree_with "$top/pstricks" || true)"; [ -n "$t" ] || { echo "  warning: $top/pstricks not found in any TeX tree; PSTricks will not work" >&2; continue; }
  mkdir -p "$OUT/$top"
  for dir in "$t/$top/pstricks" "$t/$top/pstricks-add" "$t/$top"/pst-*; do
    [ -d "$dir" ] || continue
    case "$(basename "$dir")" in pst-geo|pst-poker|pst-flags) continue;; esac
    cp -R "$dir" "$OUT/$top/$(basename "$dir")"
  done
done
for top in tex/generic tex/latex; do
  t="$(tree_with "$top/multido" || true)"; [ -n "$t" ] && mkdir -p "$OUT/$top" && cp -R "$t/$top/multido" "$OUT/$top/multido"
done
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
LMTREE="$(tree_with fonts/tfm/public/lm || true)"
if [ -n "$LMTREE" ]; then
  find "$LMTREE/fonts/tfm/public/lm" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
  find "$LMTREE/fonts/type1/public/lm" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
  find "$LMTREE/fonts/enc/dvips/lm" -name '*.enc' -exec cp {} "$OUT/fonts/enc/" \;
  LMSTY="$(tree_with tex/latex/lm || true)"; [ -n "$LMSTY" ] && cp -R "$LMSTY/tex/latex/lm" "$OUT/tex/latex/lm"
else
  echo "  warning: Latin Modern (lm) not found in any TeX tree — install the lmodern package; LaTeX text output will differ" >&2
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
# --- URW Classico (the opt-in `classico` bundle) -----------------------------
# Hermann Zapf's revision of Optima for URW++ (CTAN: classico). NOT part of TeX
# Live: URW released the fonts under the Aladdin Free Public License, which allows
# non-commercial distribution only (NOTICE.md, licenses/COPYING.AFPL). So it is
# taken from whichever TeX tree has it -- here texmf-local, from CTAN's
# classico.tds.zip -- and skipped with a note where none does (CI, for one).
CLTREE="$(tree_with tex/latex/classico/classico.sty || true)"
if [ -n "$CLTREE" ]; then
  cp -R "$CLTREE/tex/latex/classico" "$OUT/tex/latex/classico"
  find "$CLTREE/fonts/tfm/urw/classico" -name '*.tfm' -exec cp {} "$OUT/fonts/tfm/" \;
  find "$CLTREE/fonts/vf/urw/classico" -name '*.vf' -exec cp {} "$OUT/fonts/vf/" \;
  find "$CLTREE/fonts/type1/urw/classico" -name '*.pfb' -exec cp {} "$OUT/fonts/type1/" \;
  find "$CLTREE/fonts/enc/dvips/classico" -name '*.enc' -exec cp {} "$OUT/fonts/enc/" \;
  # the TrueType faces, which classico.sty asks fontspec for under LuaLaTeX
  mkdir -p "$OUT/fonts/truetype/urw/classico" && cp "$CLTREE"/fonts/truetype/urw/classico/*.ttf "$OUT/fonts/truetype/urw/classico/"
else
  echo "note: URW Classico (classico) is in no TeX tree here; the classico bundle will be empty" >&2
fi
# MetaPost looks for mpost.map first, then psfonts.map (psout.w); pdfTeX in PDF
# mode and dvisvgm read pdftex.map / ps2pk.map. All are built from the dvips map
# fragments of the fonts we ship; a fragment absent from this TeX Live is skipped.
: > "$OUT/fonts/map/mpost.map"
for rel in fonts/map/dvips/amsfonts/cm.map fonts/map/dvips/amsfonts/cmextra.map fonts/map/dvips/amsfonts/symbols.map \
           fonts/map/dvips/amsfonts/euler.map fonts/map/dvips/amsfonts/latxfont.map fonts/map/dvips/lm/lm.map \
           fonts/map/dvips/tetex/ps2pk35.map fonts/map/dvips/classico/classico.map; do
  t="$(tree_with "$rel" || true)"; [ -n "$t" ] && cat "$t/$rel" >> "$OUT/fonts/map/mpost.map"
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
