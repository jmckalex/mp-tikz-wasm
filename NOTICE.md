# Licences (NOTICE)

mp-tikz-wasm is a build of several upstream programs plus its own glue.
Each part keeps its licence; the table says what applies to what.

| Part | Licence | Notes |
| --- | --- | --- |
| `src/`, `scripts/`, `site/`, `test/`, `docs/` (this project's own code and documents) | LGPL-3.0-or-later | so that the whole `mplib.wasm` can be distributed under one licence |
| MetaPost (`mplib`: `mp.w`, `psout.w`, `svgout.w`, …) | public domain | Taco Hoekwater, Luigi Scarso, John Hobby; TeX Live 2025 |
| `avl.c` (in `mplib.wasm`) | LGPL-3.0-or-later | hence `mplib.wasm` is LGPL-3.0-or-later; the sources, the patches in `patches/` and a reproducible build (`make wasm`) are in this repository |
| decNumber (in `mplib.wasm`) | ICU licence | |
| pdfTeX, kpathsea (`tex.wasm`) | GPL-2.0-or-later / LGPL-2.1-or-later | `tex.wasm` is distributed under the GPL |
| LuaTeX (`luatex.wasm`) | GPL-2.0-or-later | includes Lua 5.3 (MIT), pplib (Paweł Jackowski, permissive; see `libs/pplib` in the TeX Live source), zziplib (LGPL-2.1-or-later or MPL-1.1), the fontforge-derived font loader (BSD-3-Clause), kpathsea, and our patched mplib; `luatex.wasm` is distributed under the GPL |
| dvisvgm (`dvisvgm.wasm`) | GPL-3.0-or-later | includes FreeType (FTL), potrace (GPL-2.0-or-later), clipper (Boost), woff2 and brotli (MIT), xxHash (BSD), the URW base-14 CFF fonts as distributed by dvisvgm |
| BibTeX (`bibtex.wasm`) | BibTeX's own terms (as Knuth's TeX) / LGPL-2.1-or-later (kpathsea) | Oren Patashnik's BibTeX 0.99d with web2c's change file and `lib/` (public domain), from the pinned TeX Live 2025 source, unmodified: `bibtex.web` is "available under the same terms as Donald Knuth's TeX program". Built by `scripts/build-texutils-wasm.sh` |
| makeindex (`makeindex.wasm`) | **MakeIndex Distribution Notice** (`licenses/COPYING.makeindex`) / LGPL-2.1-or-later (kpathsea) | Pehong Chen, Nelson Beebe and the TeX Live project; makeindex 2.17 from the pinned TeX Live 2025 source (`texk/makeindexk`, see `vendor/SOURCES.lock`), unmodified. The notice allows copying and distribution; whoever ships the binary without its source must include the notice conspicuously and say where the source is: here, `vendor/texlive-source/texk/makeindexk` after `scripts/extract-vendor.sh`, or TeX Live's own source |
| Computer Modern, AMS and Latin Modern fonts (`bundles/`) | Knuth's licence / AMS / GUST Font License | |
| EB Garamond and Garamond-Math (`bundles/latex-doc`, opt-in) | **SIL Open Font License 1.1** (`licenses/OFL-1.1.txt`) | EB Garamond: The EB Garamond Project Authors (Georg Duffner, Octavio Pardo), four of its faces; Garamond-Math: Yuansheng Zhao. From TeX Live's `ebgaramond` and `garamond-math`, unmodified |
| The `latex-doc` bundle's macro packages, BibTeX and makeindex styles (`bundles/latex-doc`, opt-in) | LPPL 1.3c, 1.3 or 1.2, and package-specific free licences | tcolorbox, cleveref, thmtools, natbib, caption, adjustbox, soul, setspace, multirow, fancyhdr, csquotes, float, fvextra, fancyvrb, microtype, titling, babel and its languages, and the rest: LPPL; enumitem and titlesec: MIT; greek-fontenc: LPPL or BSD-2-Clause; babel-hungarian: LPPL or GPL; BibTeX's standard styles: Patashnik's terms in `btxbst.doc` (changed copies must be renamed). From TeX Live 2025, unmodified |
| Hyphenation patterns (`bundles/latex-doc`, opt-in: `tex/generic/hyph-utf8`) | each file's own free licence, stated in its header | hyph-utf8 (MIT); the patterns: MIT, LPPL, BSD-3-Clause (Portuguese), the Unlicense (Galician), public domain (Finnish), GPL (Czech, Slovak), and several with a choice of MIT, LPPL, LGPL, MPL or GPL. The Romanian patterns (Adrian Rezus, 1995–96) state a copyright but no licence; TeX Live distributes them, and so do we |
| URW Classico fonts (`bundles/classico`, opt-in) | **Aladdin Free Public License** (`licenses/COPYING.AFPL`) | (URW)++ Design & Development, 2000 and 2013; the LaTeX support (`classico.sty`, `.fd`, metrics) by Michael Sharpe, from CTAN's `classico`. The AFPL allows modification and **non-commercial** distribution only, which is why TeX Live does not include it: anyone redistributing this project's bundles in a commercial product must leave the `classico` bundle out. Not part of TeX Live; built from a local install. |
| LaTeX, PGF/TikZ, pgfplots and the other macro packages (`bundles/`) | LPPL 1.3c and package-specific free licences | see each package's header in TeX Live |
| Ghostscript (`dist/ghostscript/`: `gs.mjs`, `gs.wasm`; opt-in, released as an archive of its own) | **GNU AGPL v3** (`dist/ghostscript/COPYING`; `LICENSE` says which parts it covers) | Artifex Software. Ghostscript 10.08.0 built to WebAssembly by the Ghostscript port (pinned in `vendor/GHOSTSCRIPT.lock`): the upstream source unmodified apart from a new `svg` device and a dependency fix in `pdf/pdf.mak`, in its lean variant. It is a separate module, never linked into the engines here: dvisvgm reaches it through `src/c/gs-bridge.c` and `src/ts/ghostscript.ts` when a document carries PostScript. Anyone serving or shipping it must offer its corresponding source: each release carries it as `mp-tikz-wasm-ghostscript-<version>-source.tar.gz` (the port's tree at the commit pinned in `vendor/GHOSTSCRIPT.lock`), and `dist/ghostscript/SOURCE.md` says so. Its fonts carry the AGPL with Artifex's font exception. |
| dvips's PostScript headers and the PSTricks family (`bundles/ghostscript`, opt-in) | GPL (dvips's `.pro` headers) / LPPL 1.3c (PSTricks, `pst-*`, `multido`) | from TeX Live; the `.pro` files are what dvips itself prepends to PostScript |

The full texts are in the repository: `LICENSE` (LGPL-3.0, this project's own
licence) and `licenses/GPL-3.0.txt` / `licenses/LGPL-3.0.txt`, copied from
<https://www.gnu.org/licenses/>; `licenses/COPYING.AFPL` is the Aladdin Free Public
License of the URW Classico fonts, as distributed with CTAN's `classico`;
`licenses/COPYING.makeindex` is makeindex's distribution notice, as in TeX Live's
source; `licenses/OFL-1.1.txt` is the SIL Open Font License of EB Garamond and
Garamond-Math, as distributed with TeX Live's `ebgaramond`.
