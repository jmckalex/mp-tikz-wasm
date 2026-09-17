# Brief for the Clew-app agent: OpenType fonts in mp-tikz-wasm figures

Written 2026-09-17 (session 9), revised the same day (session 10: plain LuaTeX
now works too), on the branch `opentype-fonts`. This is the embedder's half of
`docs/14` §15: what the *consumer* of the library has to do,
written for Clew (`~/Source/Clew/Clew-app`) because Clew is the embedder that
prompted the feature. Numbered 16 rather than 15 because `docs/15-handover.md`
became the repository-root `HANDOVER.md` in session 5 and the number is spent.

## What changed upstream

`mp-tikz-wasm` can now typeset TeX in arbitrary OTF/TTF fonts — including the
ones Clew itself is rendered in. `\usepackage{fontspec}` works under
`lualatex`, and `\input luaotfload.sty` with a `\font` line works under plain
`luatex`, via luaotfload. No new engine: the wasm LuaTeX already carried the
OpenType reader, so this was packaging, not a port (plus one small patch to
`luaotfload.sty` for the plain case, see the fourth item under the traps).

With `fonts="woff2"`, the SVG embeds a subset of the *same font file* as
`@font-face` and emits real `<text>`, so a figure is rasterised by Chrome's own
text renderer in the same face the surrounding note uses, and its text is
selectable.

**This is on the branch `opentype-fonts` (its head; `262fb36` is the last
session-9 commit). It is NOT merged and NOT released.** Do not touch `src/shared/mptikz-manifest.json` yet — there is no
release to pin. Until there is one, this only works on a machine where
`stage-mptikz.js` picks up the owner's local build at
`~/Source/mp-tikz-wasm/dist`, which it already prefers. Treat the work below as
ready to write but gated on a release; coordinate before shipping.

## What Clew has to do

Three changes, all in the preview client.

### 1. Ask for the `opentype` bundle

`src/preview-client/figures.js#ensureLoader` currently sets only
`script.dataset.base`. Add:

```js
script.dataset.bundles = '+opentype';
```

The `+` prefix means *add to the defaults*. A bare list (no `+`) replaces them
outright — don't use that form, it would hard-code the default bundle list into
Clew and go stale.

**This is opt-in for a real reason, not fussiness.** LaTeX under LuaTeX probes
for luaotfload at start-up, so simply making it findable costs every LuaTeX run
~180 ms and ~5 MB more, even for a document with no `fontspec` in it. Clew's
` ```tex ` and ` ```latex ` fences both run on LuaTeX, so **every** such figure
pays once you set this. Measured upstream: 214 ms → 396 ms, 6.6 MB → 11.9 MB
fetched, for a document that never mentions fontspec.

So decide deliberately: either turn it on always, or only when a note actually
uses it. If you want it conditional, note that the loader is injected once per
preview and `dataset.bundles` is read when `auto.js` first runs, so it cannot
be changed afterwards — you would have to decide before `ensureLoader()`, e.g.
by scanning the note for a `font=` attribute or a `\usepackage{fontspec}`.

Add `'+otf-fonts'` as well only if you want `unicode-math` or the full range of
Latin Modern optical sizes; it is a further ~6.8 MB. The `opentype` bundle
already carries the twelve Latin Modern faces fontspec's own defaults need.

### 2. Hand over the fonts

`window.mpTikzWasm.addFiles()` is new. It puts files in the TeX run's working
directory, which leads `OPENTYPEFONTS` and `TTFONTS`, so `Path=./` finds them.

```js
script.onload = () => window.mpTikzWasm.addFiles(fontBytes);
```

where `fontBytes` is `{ 'AvenirNext-Regular.ttf': Uint8Array, ... }`.

It deliberately does **not** start the engine — files handed over before the
first render are held and applied when an engine is created, so a note whose
figures all come from the result cache still starts nothing. That property is
worth preserving; don't work around it by forcing a render.

Getting the bytes in Electron: `queryLocalFonts()` in the renderer (Chrome-only,
permission-gated, which is fine for Electron), or read them in the main process
and pass them over IPC — probably better, since it avoids the permission prompt
and you already have a main/renderer split.

### 3. Give authors a way to ask for it

Clew's fences wrap snippets in `src/engine/figures.js` (`wrapLatex`, `wrapTex`,
`KINDS`). The wrapper needs to emit, for a figure that wants the note's font:

```latex
\usepackage{fontspec}
\setmainfont{AvenirNext-Regular.ttf}[Path=./,
  BoldFont=AvenirNext-Bold.ttf, ItalicFont=AvenirNext-Italic.ttf,
  BoldItalicFont=AvenirNext-BoldItalic.ttf]
```

Design decision for you: whether this is opt-in per fence (`font=note`, say) or
the default for wrapped snippets. Two things argue for opt-in — the start-up
cost in §1, and the fact that a figure in the note's sans-serif font is not
always what an author wants for mathematics.

`KINDS.latex` runs `lualatex`, which is what `fontspec` needs — nothing to
change there. `KINDS.tex` runs plain `luatex`, where there is no `fontspec`;
the plain-TeX spelling, which `wrapTex` can emit just as `wrapLatex` emits the
block above, is

```tex
\input luaotfload.sty
\font\body="[AvenirNext-Regular.ttf]:mode=node;+liga;+kern" at 10pt \body
```

(the `[file]` form is a kpathsea lookup, and the working directory is on the
path, so no `Path=`). This needed a fix on the library side — the fourth item
under the traps — which the branch carries as of session 10.

A complete document (one that says `\documentclass`) is passed through untouched
by design, so those authors write their own `fontspec` block and only need §1
and §2.

## Four traps, all verified upstream

**TrueType Collections are broken in `woff2` mode.** This matters immediately:
Clew's `--clew-editor-font` is Avenir Next, which macOS ships as
`/System/Library/Fonts/Avenir Next.ttc` — a collection. dvisvgm keys an embedded
font by file path, and the face index is not part of that key, so
`\setmainfont{X.ttc}[FontIndex=7, BoldFeatures={FontIndex=0}]` collapses four
faces into one `@font-face`. Because glyph ids differ between members of a
collection, bold and italic then draw *garbled* glyphs, not merely unstyled
ones. This is dvisvgm's bug, not fixed.

The workaround, which is what you must do: **one file per face.** Extract the
faces you need into separate `.ttf`/`.otf` files and name them with `BoldFont=`
/ `ItalicFont=`. For Avenir Next the indices are Regular 7, Bold 0, Italic 4,
Bold Italic 1 — note index 0 is Bold, not Regular, so a bare
`\setmainfont{Avenir Next.ttc}` silently gives you the bold face. Same applies
to Helvetica Neue and Menlo. `fonts="paths"` renders collections correctly if
you would rather avoid the whole problem.

**Fonts must be named, not looked up by family.** luaotfload's name database
only indexes the bundled font directories, not the files you hand over, so
`\setmainfont{Avenir Next}` will fail. Always `Path=./` with the filename.

**First render is slow.** Parsing a face costs about a second. Upstream now
carries luaotfload's cache between runs in one engine instance, which takes
repeats to ~430 ms, but the first figure on a fresh preview pays the full cost
on top of the bundle fetch. Clew's result cache and saved figures both still
work and are the real mitigation.

**Plain LuaTeX needed a fix, and has had it since session 10.** luaotfload is
not a LaTeX package: it loads in plain TeX with `\input luaotfload.sty`, and
faces are selected with `\font\body="[./X.ttf]:mode=node"` instead of
`\setmainfont`. But in stock TeX Live 2025 the plain format with **DVI output**
fails — luaotfload's DVI module wants a shipout callback that only the LaTeX
kernel creates — so ` ```tex ` fences could not have OpenType at all:

| format | output | result |
| --- | --- | --- |
| plain (`luatex`) | PDF | works |
| plain (`luatex`) | DVI | fails: "Module luatexbase Error: Unable to register callback", then "not loadable" |
| LaTeX (`dvilualatex`) | DVI | works |

The bundled `luaotfload.sty` now carries that hook (`patches/texmf/0001`
upstream), and the result is byte-identical to TeX Live running the same
patched file. Nothing to do on Clew's side beyond the `wrapTex` line in §3 —
but a Clew build pinned to a release without this patch will still fail with
exactly the error above, which is how to recognise it.

## What you get for free

A bug that would have bitten Clew was found and fixed while testing this: two
`woff2` figures on one page used to collide, because dvisvgm names every
embedded face `nf0`, `nf1`, … per file and `@font-face` is document-global once
the SVG is inlined. The symptom was a word rendered half in one weight and half
in another. `postProcessSvg` now namespaces the font families and classes per
figure. The tags always pass an `idPrefix`, so Clew gets the fix automatically —
but it means **any multi-figure note using `fonts="woff2"` was affected before
this commit**, which is worth knowing if you have seen odd weight-mixing.

## Also worth telling the owner

Clew's re-pin to the published 0.2.1 (the LuaTeX rule fix) is **already done** —
`mptikz-manifest.json` carries `5ddff636…` / 37205263 and `KINDS.tex` is back on
`luatex`. The upstream HANDOVER.md still lists it as open; it is stale on that
point.

## Verification

The whole path was proved end to end in Chrome on a Clew-shaped page: a
`<tikz-diagram>` element, `data-bundles="+opentype"` on the loader, three Avenir
Next faces handed over as bytes through `addFiles()`, `data-fonts="woff2"` on
the element. Output matched the browser rendering the same font files.

Upstream reference: `docs/14-implementation-notes.md` §15 (design, the traps,
and the tag snippet), `docs/08-javascript-api.md` §4.1 (API), README "OpenType
fonts".
