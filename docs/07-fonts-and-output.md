# 07 — Fonts and output backends

## 1. The three tiers of text

MetaPost can put text on a page three ways, and they have very different
dependency profiles. Make this distinction visible in the API and the docs,
because it is what determines whether a user needs a 6 MB LaTeX bundle or 80 KB.

| Tier | MetaPost source | Needs | Bundle |
| --- | --- | --- | --- |
| 0 — no TeX | `label("abc", z)`, `"abc" infont "cmr10"` | TFM metrics; `.pfb` only if you want outlines | `core` + `cm-tfm` (~80 KB) |
| 1 — plain TeX | `btex $x^2$ etex` | tier 0 + `tex.wasm` + `plain.fmt` | + ~2 MB |
| 2 — LaTeX | `verbatimtex \documentclass… etex` + `btex` | tier 1 + `latex.fmt` + packages | + ~4 MB |

Tier 0 already covers a large fraction of real MetaPost usage and needs no TeX
engine at all. **Make it the default and make it fast.**

## 2. How MetaPost resolves a font

1. TFM metrics — `tfmin.c` reads `<name>.tfm` via `find_file(ftype=metrics)`.
   Needed for *any* text, because MetaPost computes the bounding box itself.
2. The map file — `psout.c`'s `mp_init_map_file` reads **`mpost.map`**
   (`ftype=fontmap`), mapping a TFM name to a PostScript font name, an encoding
   and a `.pfb` file.
3. The outline font — for `prologues:=3` (PS) or SVG, `psout.c` reads the
   `.pfb` (`ftype=font`), decrypts eexec, interprets the Type 1 charstrings and
   either embeds a subset (PS) or converts to paths (SVG).

All three go through our `find_file`. A missing TFM is fatal; a missing map or
`.pfb` degrades silently into unembedded/untraced text — which is why the
bundle loader must report these as real errors (`docs/06` §5).

## 3. SVG output — the recommended web path

```
outputformat := "svg";
prologues    := 3;
```

**`prologues:=3` is the difference between usable and useless SVG.** Verified
during scoping:

* `prologues < 3` emits `<text font-size="9.96">Z</text>` — the raw TFM
  character, with no font family. For `cmex10` character 90 that "Z" is
  actually an integral sign. Unusable.
* `prologues = 3` emits real outlines:

```xml
<defs>
  <g transform="scale(0.009963,0.009963)" id="GLYPHcmr10_77">
    <path style="fill-rule: evenodd;" d="M104 2177C136 2175,153 2153,…"></path>
  </g>
  …
</defs>
<g transform="translate(29.259201 6.807800)" style="fill: rgb(0%,0%,0%);">
  <use xlink:href="#GLYPHcmr10_77"></use>
  <use xlink:href="#GLYPHcmr10_101" x="9.166833"></use>
  …
</g>
```

Self-contained, no web fonts, no FOUT, correct at any zoom, and glyphs are
shared via `<use>` so repeated characters cost almost nothing.

So: **default `prologues` to 3 for SVG output** in the JS API (upstream
defaults to 0), and say so in the docs. Expose it as an option for anyone who
wants the old behaviour.

### 3.1 Known rough edges to fix in the JS layer

MetaPost's SVG backend is the least-polished of the three. Budget time at M7
for a post-processing pass in `src/ts/render/svg.ts`:

* Numbers are printed with six decimals throughout (`100.250000`). A
  round-trip-safe numeric compactor cuts SVG size by 30–50 %.
* No `xmlns:xlink` is strictly needed for SVG 2; `href` is the modern spelling.
  Emit both for compatibility, or rewrite to `href` behind an option.
* Glyph `id`s are global (`GLYPHcmr10_77`); two inlined figures on one page
  collide. Namespace them per figure when embedding inline.
* MetaPost writes the bounding box into `width`/`height`/`viewBox` in PostScript
  points. Offer `units: 'pt' | 'px' | 'none'` in the API.
* Add `role="img"` + an `<title>` from an option, for accessibility.

Do this as a **post-pass on the emitted SVG**, not as a patch to `svgout.w`.
Keeping the C output byte-identical to upstream is what lets the golden tests
compare against the native oracle.

## 4. PostScript / EPS output

`mp_ps_ship_out(edge, prologues, procset)`. This is the reference output format
— `mptrap` and every golden test compares PostScript. Behaviour by `prologues`:

| Value | Effect |
| --- | --- |
| 0 | no font embedding, `%*Font:` comments only (MetaPost's own convention) |
| 1 | troff-compatible |
| 2 | standard PostScript font resources |
| 3 | full Type 1 embedding of a subset |

Ship this unmodified. It is what users hand to `dvips`/`ps2pdf` pipelines and
what makes MetaPost-WASM output interchangeable with the real thing.

## 5. The JSON / typed-array backend (ours)

Walk the `mp_edge_object` list in C and emit a structured description. This is
the genuinely web-native addition, and it is cheap because the export has
already happened — `mp_gr_export` converts MetaPost's internal `scaled` values
to `double` before the backend ever sees them.

```ts
interface Figure {
  charcode: number;
  bbox: [number, number, number, number];
  width: number; height: number; depth: number; italicCorrection: number;
  objects: GraphicObject[];
}
type GraphicObject =
  | { type: 'fill';   path: Knot[]; pen?: Knot[]; color: Color; ljoin: number;
      miterlimit: number; htap?: Knot[]; prescript?: string; postscript?: string }
  | { type: 'stroke'; path: Knot[]; pen?: Knot[]; color: Color; ljoin: number;
      lcap: number; miterlimit: number; dash?: { offset: number; pattern: number[] };
      prescript?: string; postscript?: string }
  | { type: 'text';   text: string; font: string; dsize: number; color: Color;
      width: number; height: number; depth: number;
      transform: [number, number, number, number, number, number] }
  | { type: 'startClip' | 'startBounds'; path: Knot[] }
  | { type: 'stopClip'  | 'stopBounds' }
  | { type: 'special';  script: string };

interface Knot { x: number; y: number; lx: number; ly: number;
                 rx: number; ry: number; leftType: number; rightType: number }
interface Color { model: 'none'|'grey'|'rgb'|'cmyk'; values: number[] }
```

This maps 1:1 onto the structs in the generated `mplibps.h` (`mp_fill_object`,
`mp_stroked_object`, `mp_text_object`, `mp_clip_object`, `mp_bounds_object`,
`mp_special_object`, all sharing `GRAPHIC_BODY`). Colour models are
`mp_no_model=1`, `mp_grey_model=3`, `mp_rgb_model=5`, `mp_cmyk_model=7`.

What it unlocks:

* Canvas2D / WebGL / Skia rendering without an SVG parser.
* Hit testing, selection and interactive editing in a host application.
* Re-rendering at a new device pixel ratio without re-running MetaPost.
* Diffing two figures structurally (great for tests and for a live editor).
* Exporting to other vector formats (PDF, DXF, Figma) in JS.

For large figures also offer a **binary** encoding (a header plus `Float64Array`
path data) — `mpwasm_figure_binary` returning a pointer+length the JS side maps
onto `HEAPF64` with zero copies.

### 5.1 Bézier note

MetaPost knots carry the point plus both control points (`left_*`, `right_*`).
A segment from knot *i* to *i+1* is a cubic with controls `right_i` and
`left_{i+1}`. `leftType`/`rightType` (`mp_endpoint`, `mp_explicit`, `mp_given`,
`mp_curl`, `mp_open`, `mp_end_cycle`) distinguish an open path from a cycle:
a cycle is a circular `next` chain. Get this right or every closed path leaks.

## 6. PNG

MetaPost's own PNG backend needs cairo + pixman + libpng. Three options, decide
at M9 on measured size:

1. **Rasterise the SVG in the host.** Browser: `OffscreenCanvas` + an
   `<img>`/`createImageBitmap` of a data-URL SVG, or `resvg-wasm` (~1.2 MB) for
   deterministic output. Node: `resvg-js` or `sharp` as an optional peer
   dependency. **Recommended default** — no MetaPost patch, no cairo.
2. **Build cairo to wasm.** ~1–1.5 MB extra, and cairo's text path drags in
   more. Only worth it for exact `outputformat:="png"` parity.
3. Refuse `outputformat:="png"` with a message pointing at `toPNG()`.

Whatever you pick, intercept `outputformat:="png"` in the JS layer before the
run so the user gets a real explanation rather than the stubbed backend's
generic failure.

## 7. TFM output

MetaPost can *write* TFM files (its METAFONT heritage — `fontmaking`,
`charlist`, `ligtable`, …). Writes go through `mp_filetype_metrics` in write
mode, which in non-interactive mode lands in the Emscripten FS. Expose any
`.tfm` produced in `/work` as an output artefact. Cheap to support; do not drop
it.

## 8. Non-CM fonts

Everything above works for any Type 1 font with a TFM. To support e.g. Latin
Modern or a commercial font, the user adds files to the bundle or to `/work`
and an entry to `mpost.map`. Provide `options.fontMapEntries: string[]` that
appends lines to an in-VFS map file — far friendlier than asking users to
rebuild a bundle.

OpenType/TrueType is **not** supported by MetaPost's PostScript backend and we
are not adding it. If a user wants a system font, tier 0 with a hand-written
TFM, or rendering the label as an SVG `<text>` via `special`, is the answer.
