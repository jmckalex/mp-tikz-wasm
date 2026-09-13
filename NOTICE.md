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
| LaTeX, PGF/TikZ, pgfplots and the other macro packages (`bundles/`) | LPPL 1.3c and package-specific free licences | see each package's header in TeX Live |

The full texts are in the repository: `LICENSE` (LGPL-3.0, this project's own
licence) and `licenses/GPL-3.0.txt` / `licenses/LGPL-3.0.txt`, copied from
<https://www.gnu.org/licenses/>.
