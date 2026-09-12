# Sample outputs

Ground truth, generated during scoping on 2026-09-11. Use these as the first
golden files: if MetaPost-WASM cannot reproduce them (modulo the creation-date
comment), something is wrong.

Source for the `latex-math.*` family: `../mpx-samples/latex-math.mp`, a figure
with a circle, a displayed amsmath integral in a `btex` block, and a
`\textbf` label. Produced with the **oracle**:

```sh
mpost -tex=latex -s 'prologues=3' latex-math.mp                    # .prologues3.eps
mpost -tex=latex -s 'prologues=0' latex-math.mp                    # .prologues0.eps
mpost -tex=latex -s 'outputformat="svg"' -s 'prologues=3' …        # .prologues3.svg
mpost -tex=latex -s 'outputformat="svg"' -s 'prologues=0' …        # .prologues0.svg
```

| File | Size | What it shows |
| --- | --- | --- |
| `latex-math.prologues0.eps` | 1 983 B | The canonical MetaPost output format. Fonts referenced by `%*Font:` comments, not embedded. This is what `mptrap` and the golden tests compare. |
| `latex-math.prologues3.eps` | 134 599 B | Same figure with Type 1 fonts subset and embedded. Note the 68× size increase — this is why font embedding must be a choice, not a default, for EPS. |
| `latex-math.prologues0.svg` | 3 310 B | **The broken one.** `<text font-size="9.962646">Z</text>` — raw TFM slots with no font family. That "Z" is `cmex10` slot 90, an integral sign. Do not ship this. |
| `latex-math.prologues3.svg` | 24 057 B | **The good one.** Glyph outlines in `<defs>` as `<g id="GLYPHcmex10_90">`, referenced by `<use>`. Self-contained, no web fonts. This is why `docs/07` recommends defaulting `prologues` to 3 for SVG. |
| `no-tex-label.prologues3.svg` | 10 281 B | Tier 0: `label("MetaPost", …)` with **no TeX at all** — TFM metrics plus a `.pfb`. Produced by `../host_shim_reference.c`, not by `mpost`, so it also demonstrates that the embedding path gives identical machinery. |

The two `prologues0` vs `prologues3` SVG files are the single most useful pair
here. Open both in a browser.
