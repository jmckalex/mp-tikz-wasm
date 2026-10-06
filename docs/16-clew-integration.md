# Brief for the Clew-app agent: OpenType fonts in mp-tikz-wasm figures

Written 2026-09-17 (session 9), revised the same day (session 10: plain LuaTeX
now works too) and on 2026-09-26 (session 11: the prebuilt font database, and
"Since session 11" below), on the branch `opentype-fonts`. This is the embedder's half of
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

**Released since 0.3.0** (2026-09-28); "In 0.3.1" and "In 0.3.2" below say
what followed. Pin moves go through Clew-boss, so that Clew-app and Clew-iOS
move together.

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

Add `'+otf-fonts'` as well only if you want `unicode-math`; it is the maths
font, a further 0.7 MB. The `opentype` bundle carries the whole Latin Modern
text family, so every class size and size command works. (An earlier cut of the
bundle carried only the twelve 10pt faces and failed at
`\documentclass[12pt]{article}\usepackage{fontspec}`, which the owner found
through Clew; fixed in session 10. No `\fontsize` bracket or other workaround
is needed in `wrapLatex`.)

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

**TrueType Collections: name every face's index.** This matters immediately:
Clew's `--clew-editor-font` is Avenir Next, which macOS ships as
`/System/Library/Fonts/Avenir Next.ttc` — a collection. Releases up to and
including 0.3.1 draw every face of a collection as one, in both output modes:
dvisvgm keyed a font by file path, not face index (a dvisvgm defect, which
`patches/dvisvgm/0001` fixes in 0.3.2). With those releases the only route is
**one file per face**: extract the faces into separate `.ttf`/`.otf` files and
name them with `BoldFont=` / `ItalicFont=`.

From 0.3.2, hand over the `.ttc` itself and give each face its index:

```latex
\setmainfont{Avenir Next.ttc}[Path=./, UprightFeatures={FontIndex=7},
  BoldFont=Avenir Next.ttc, BoldFeatures={FontIndex=0},
  ItalicFont=Avenir Next.ttc, ItalicFeatures={FontIndex=4},
  BoldItalicFont=Avenir Next.ttc, BoldItalicFeatures={FontIndex=1}]
```

For Avenir Next the indices are Regular 7, Bold 0, Italic 4, Bold Italic 1 —
note index 0 is Bold, not Regular, so a bare `\setmainfont{Avenir Next.ttc}`
silently gives you the bold face. Same applies to Helvetica Neue and Menlo.
Checked with the patch, in both modes: the block above with macOS's own
`Avenir Next.ttc`, and `Optima.ttc` faces 0–3 (regular, bold, italic, bold
italic) each draw four distinct, correct faces.

**Family names: from the release after 0.3.2.** A face handed over with
`addFiles()` sits in the working directory, which luaotfload's name index left
out. So in 0.3.2 and earlier, `\setmainfont{Optima}` over an added
`Optima.ttc` loads the first face as a *file* called Optima, and bold and
italic silently fall back to regular. Naming the file and the faces, as in the
block above, works in every release. From the next release the bundled
`luaotfload.conf` turns on `scan-local`, and `\setmainfont{Optima}` (or
`{Avenir Next}`) finds every style of a supplied family. The rescan this needs
happens only when a name misses, and costs little: a document with
`\setmainfont{Optima}` took 0.7 s in all.

**First render costs more than later ones.** Parsing a face costs about a
second. Two things take the edge off: luaotfload's cache is carried between
runs in one engine instance (repeats ~430 ms), and since session 11 the
`opentype` bundle ships luaotfload's name database prebuilt, so a fresh engine
no longer opens all 72 Latin Modern faces before its first page (a 12pt
article: 4 faces / 0.44 MB instead of 72 / 7.4 MB). A first figure still pays
for the faces it uses. Clew's result cache and saved figures remain the real
mitigation.

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

## Since session 11

Changes in the library that an embedder of the tags will notice. None needs
action from Clew, but the first two change behaviour.

- **Custom elements are live.** A `<tikz-diagram>` or `<metapost-diagram>`
  typesets again when its text content, its `source` property or an
  output-affecting attribute changes (debounced, 200 ms by default,
  `data-debounce`). If Clew rewrites an element's content in place rather than
  replacing the element, it now gets a re-render instead of raw text. The
  rendered event gains `update` and `replaced`; `mpTikzWasm.figures()` lists
  only figures still on the page.
- **Some bodies are wrapped differently.** A body that starts with
  `\begin{tikzcd}`, `\begin{circuitikz}`, `\chemfig` or `\schemestart` is no
  longer nested in a second `tikzpicture` (it rendered collapsed or blank) and
  gets `\documentclass[border=…]{standalone}` + `\usepackage{tikz}`. Those
  figures' hashes change, so a cached or saved copy of one re-renders once;
  every other figure keeps its hash.
- **`data-replace`** swaps a custom element for its `<svg>` after a
  successful render (id, class, style carried over) — for slides.
- **`svg.attributes`**, a bundled TikZ library: `svg class`, `svg id` and
  `svg attributes` on scopes, paths and nodes. Ids get the figure's
  `mpwHASH-` prefix in the tags; classes do not.
- **More packages** in the default bundles: chemfig, circuitikz (current
  release only), tikz-3dplot.
- **`sanitizeSvg()` is deprecated.** It stripped gradients, patterns and the
  `woff2` faces. If Clew sanitises figure SVG, use DOMPurify as in the README
  ("Untrusted sources"); Clew's own notes are trusted input and need none.

## In the next release (unreleased, branch `next`)

- **A supplied family is found by name, every style of it:**
  `\setmainfont{Optima}` or `{Avenir Next}` over an `addFiles()`d `.ttc` now
  sets bold and italic too (the bundled `luaotfload.conf` turns on
  `scan-local`). Before, only the regular face was found, as a file.
- **Lost PostScript is reported:** `mp.latex()` adds a *warning* (status stays
  `ok`) when skipped PostScript carried part of the picture: EPS images,
  graphicx's `\rotatebox`/`\scalebox` under the default dvips driver, PSTricks,
  raw `\special{ps: …}`. Every LaTeX document has a few harmless PostScript
  specials (the kernel's header, hyperref's pdfmarks), and they are not
  reported. Clew can show the warning; nothing that renders today changes.

## In 0.3.2

- **Bundle file URLs carry the file's hash:** `…/files/<path>?v=<sha>`, from
  the manifest. A rebuilt file gets a new URL, so Clew's cache-clearing asset
  stamp is no longer needed for bundle files. **A custom URL handler
  (`clew-preview://`, Electron's protocol) must look files up by the URL's
  path and ignore the query string.** Manifests are fetched with
  `cache: 'no-cache'`.
- **A missing font is an error now.** If dvisvgm finds no outline file for a
  font, or the SVG refers to glyphs it does not define, `mp.latex()` reports
  `error` instead of returning text-less SVG, and the tags do not cache it.
- **TrueType Collections work** (`patches/dvisvgm/0001`): name each face by
  `FontIndex`, as in "Four traps" above, instead of splitting the `.ttc`.
- **`classico`, an opt-in bundle:** URW Classico (an Optima) for
  `\usepackage{classico}`, added with `bundles: [...DEFAULT_BUNDLES,
  'classico']` or `data-bundles="+classico"`. Its fonts are under the Aladdin
  Free Public License (non-commercial distribution only), so it is never in
  the defaults.
- **`mpost-wasm --prerender` honours each page's `data-bundles`**, as the
  browser does, and `--base=DIR` resolves `data-figures` against another
  directory.

## In 0.3.1

- **PDF output, on request:** `mp.latex(doc, { output: 'pdf' })` returns
  `result.pdf` (a `Uint8Array`) from pdfTeX's or LuaTeX's own PDF back end;
  SVG stays the default. Fonts embedded, PNG/JPEG images included,
  byte-identical to TeX Live's `latex -output-format=pdf` apart from the
  version string. Nothing changes for Clew unless it asks for it.
- **`auto.js` loads the library lazily:** a note whose figures all come from
  the result cache loads five small modules instead of the whole library. No
  API change.
- **Pages of script tags prefetch again**, and **`worker: true` works in
  Node** (so `timeoutMs` can stop a runaway document there).

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
