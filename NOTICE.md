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
| Computer Modern, AMS and Latin Modern fonts (`bundles/`) | Knuth's licence / AMS / GUST Font License | |
| URW Classico fonts (`bundles/classico`, opt-in) | **Aladdin Free Public License** (`licenses/COPYING.AFPL`) | (URW)++ Design & Development, 2000 and 2013; the LaTeX support (`classico.sty`, `.fd`, metrics) by Michael Sharpe, from CTAN's `classico`. The AFPL allows modification and **non-commercial** distribution only, which is why TeX Live does not include it: anyone redistributing this project's bundles in a commercial product must leave the `classico` bundle out. Not part of TeX Live; built from a local install. |
| LaTeX, PGF/TikZ, pgfplots and the other macro packages (`bundles/`) | LPPL 1.3c and package-specific free licences | see each package's header in TeX Live |
| Ghostscript (`dist/ghostscript/`: `gs.mjs`, `gs.wasm`; opt-in, released as an archive of its own) | **GNU AGPL v3** (`dist/ghostscript/COPYING`; `LICENSE` says which parts it covers) | Artifex Software. Ghostscript 10.08.0 built to WebAssembly by the Ghostscript port (pinned in `vendor/GHOSTSCRIPT.lock`): the upstream source unmodified apart from a new `svg` device and a dependency fix in `pdf/pdf.mak`, in its lean variant. It is a separate module, never linked into the engines here: dvisvgm reaches it through `src/c/gs-bridge.c` and `src/ts/ghostscript.ts` when a document carries PostScript. Anyone serving or shipping it must offer its corresponding source (`dist/ghostscript/SOURCE.md`). Its fonts carry the AGPL with Artifex's font exception. |
| dvips's PostScript headers and the PSTricks family (`bundles/ghostscript`, opt-in) | GPL (dvips's `.pro` headers) / LPPL 1.3c (PSTricks, `pst-*`, `multido`) | from TeX Live; the `.pro` files are what dvips itself prepends to PostScript |

The full texts are in the repository: `LICENSE` (LGPL-3.0, this project's own
licence) and `licenses/GPL-3.0.txt` / `licenses/LGPL-3.0.txt`, copied from
<https://www.gnu.org/licenses/>; `licenses/COPYING.AFPL` is the Aladdin Free Public
License of the URW Classico fonts, as distributed with CTAN's `classico`.
