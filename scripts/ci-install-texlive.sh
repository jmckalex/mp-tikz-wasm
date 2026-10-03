#!/usr/bin/env bash
# ci-install-texlive.sh DIR — install the TeX Live 2025 packages the build
# copies from (build-texmf.sh), from the frozen historic tlnet-final, into DIR.
#
# CI's texmf tree has to come from TeX Live 2025: the engines are built from
# TeX Live 2025 sources, and luaotfload in particular only works with the
# LuaTeX it was written for (Ubuntu's TeX Live 2023 packages scanned no fonts
# under this LuaTeX 1.21, so the opentype bundle could not be built or tested).
# tlnet-final never changes, so the installation is cached on the key of this
# file; a second run with DIR already installed does nothing.
#
# The package list is what owns the files in build/texmf according to TeX Live
# 2025's texlive.tlpdb, plus kpathsea (kpsewhich, which build-texmf uses) and
# texlive-scripts (tetex/ps2pk35.map, folded into mpost.map). If build-texmf
# starts copying something new, add its package here.
set -euo pipefail
DEST="${1:?usage: ci-install-texlive.sh DIR}"
[ -x "$DEST/bin/"*/kpsewhich ] 2>/dev/null && { echo "==> TeX Live 2025 already in $DEST"; exit 0; }

MIRRORS=(
  https://ftp.tu-chemnitz.de/pub/tug/historic/systems/texlive/2025/tlnet-final
  https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/2025/tlnet-final
  https://mirrors.tuna.tsinghua.edu.cn/tex-historic-archive/systems/texlive/2025/tlnet-final
)
PACKAGES="kpathsea texlive-scripts
  amscls amsfonts amsmath atbegshi atveryend auxhook avantgar babel bigintcalc bitset
  bookman booktabs chemfig circuitikz cm cmarrows courier currfile dvips ec epstopdf-pkg etex etexcmds
  etoolbox featpost filehook firstaid fontname fontspec fp geometry gettitlestring graphics
  graphics-cfg graphics-def helvetic hycolor hyperref hyph-utf8 hyphen-ancientgreek
  hyphen-base hyphen-greek iftex imakeidx infwarerr intcalc knuth-lib kvdefinekeys
  kvoptions kvsetkeys l3backend l3kernel l3packages latex latex-fonts latexconfig
  letltxmacro listings lm lm-math ltxcmds lua-uni-algos lualatex-math lualibs luaotfload
  luatex85 luatexbase mathtools mcf2graph metaobj metapost metauml mpcolornames mptopdf ncntrsbk
  palatino pdfescape pdftex pdftexcmds pgf pgfplots plain preview psnfss refcount
  rerunfilecheck roundrect shapes simplekv spath3 splines standalone stringenc symbol
  tex-ini-files tikz-3dplot tikz-cd times todonotes tools unicode-data unicode-math
  uniquecounter url varwidth xcolor xkeyval zapfchan zapfding"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
REPO=""
for m in "${MIRRORS[@]}"; do
  echo "==> installer from $m"
  if curl -fsSL --retry 2 -m 300 -o "$WORK/install-tl-unx.tar.gz" "$m/install-tl-unx.tar.gz"; then REPO="$m"; break; fi
  echo "    failed; trying the next mirror"
done
[ -n "$REPO" ] || { echo "error: no TeX Live 2025 mirror answered" >&2; exit 1; }
tar -xzf "$WORK/install-tl-unx.tar.gz" -C "$WORK"
cat > "$WORK/profile" <<PROFILE
selected_scheme scheme-infraonly
TEXDIR $DEST
TEXMFLOCAL $DEST/texmf-local
TEXMFSYSVAR $DEST/texmf-var
TEXMFSYSCONFIG $DEST/texmf-config
TEXMFHOME \$HOME/texmf
tlpdbopt_install_docfiles 0
tlpdbopt_install_srcfiles 0
tlpdbopt_autobackup 0
instopt_adjustpath 0
instopt_letter 0
PROFILE
"$WORK"/install-tl-*/install-tl -no-interaction -profile "$WORK/profile" -repository "$REPO"
TLMGR="$(ls -d "$DEST"/bin/*)/tlmgr"
# shellcheck disable=SC2086
"$TLMGR" --repository "$REPO" install $PACKAGES
echo "==> TeX Live 2025 in $DEST: $("$(ls -d "$DEST"/bin/*)/kpsewhich" -var-value TEXMFDIST)"
