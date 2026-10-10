#!/usr/bin/env bash
# package-release.sh — build the prebuilt distribution archive for a GitHub
# release: dist/ (the three wasm engines, the JavaScript, auto.js, and the
# bundles) plus the demo pages, so users need neither TeX Live nor Emscripten.
#
#   scripts/package-release.sh            -> release/mp-tikz-wasm-<version>.tar.gz and .zip
#                                            (+ mp-tikz-wasm-ghostscript-<version>.* when dist/ghostscript exists)
#
# The Ghostscript module (dist/ghostscript: gs.mjs, gs.wasm) is AGPL, so it ships as
# an archive of its own, unpacked into dist/; the main archive keeps the
# `ghostscript` bundle (dvips headers and PSTricks, not Ghostscript itself).
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$REPO/package.json').version")"
NAME="mp-tikz-wasm-$VERSION"
OUT="$REPO/release"
STAGE="$OUT/$NAME"
for f in dist/mplib.wasm dist/tex.wasm dist/dvisvgm.wasm dist/index.js dist/auto.js dist/bundles/index.json; do
  [ -f "$REPO/$f" ] || { echo "error: $f missing — run npm run build first" >&2; exit 1; }
done
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R "$REPO/dist" "$STAGE/dist"
rm -f "$STAGE"/dist/*.map "$STAGE"/dist/*/*.map
rm -rf "$STAGE/dist/ghostscript"
mkdir -p "$STAGE/site"
cp "$REPO"/site/index.html "$REPO"/site/app.js "$REPO"/site/theme.css "$REPO"/site/theme.js "$REPO"/site/examples.js "$REPO"/site/examples-tikz.js "$REPO"/site/tags.html "$REPO"/site/guide.html "$REPO"/site/minimal.html "$REPO"/site/minimal-sources.js "$REPO"/site/live.html "$REPO"/site/live-sources.js "$REPO"/site/page-common.js "$STAGE/site/" 2>/dev/null || true
cp -R "$REPO/site/figures" "$STAGE/site/figures"     # the tags page's saved figures (mpost-wasm --prerender)
cp "$REPO/README.md" "$REPO/NOTICE.md" "$REPO/LICENSE" "$STAGE/" 2>/dev/null || true
cp -R "$REPO/licenses" "$STAGE/licenses"
cp "$REPO/scripts/serve.mjs" "$STAGE/serve.mjs"
cat > "$STAGE/START.md" <<'TXT'
mp-tikz-wasm — prebuilt distribution

  dist/           the library: index.js (API), auto.js (drop-in tags), worker.js,
                  mplib.wasm, tex.wasm, dvisvgm.wasm, bundles/ (fonts, formats, packages)
  site/           the demo pages (index.html, tags.html, guide.html, minimal.html, live.html)
  serve.mjs       node serve.mjs 8080  ->  http://localhost:8080/site/

Host dist/ on any static server and add to your page:
  <script type="module" src="/path/to/dist/auto.js"></script>
  <script type="text/tikz"> \begin{tikzpicture} ... \end{tikzpicture} </script>
See guide.html for everything else.
TXT
sed -i '' "s#path.resolve(new URL('..', import.meta.url).pathname)#path.resolve(new URL('.', import.meta.url).pathname)#" "$STAGE/serve.mjs" 2>/dev/null || sed -i "s#path.resolve(new URL('..', import.meta.url).pathname)#path.resolve(new URL('.', import.meta.url).pathname)#" "$STAGE/serve.mjs"
(cd "$OUT" && tar -czf "$NAME.tar.gz" "$NAME" && rm -f "$NAME.zip" && zip -qr "$NAME.zip" "$NAME")
du -sh "$OUT/$NAME.tar.gz" "$OUT/$NAME.zip" | awk '{print "  " $2 "  " $1}'
if [ -d "$REPO/dist/ghostscript" ]; then
  GSNAME="mp-tikz-wasm-ghostscript-$VERSION"
  rm -rf "$OUT/$GSNAME"; mkdir -p "$OUT/$GSNAME/dist"
  cp -R "$REPO/dist/ghostscript" "$OUT/$GSNAME/dist/ghostscript"
  cat > "$OUT/$GSNAME/README.md" <<TXT
mp-tikz-wasm — Ghostscript module (optional)

This archive holds dist/ghostscript/, which goes beside mp-tikz-wasm's own dist/.
Unpack the two archives together like this (naming the dist member keeps this
README from replacing the main one):

  tar -xzf $NAME.tar.gz
  tar -xzf $GSNAME.tar.gz --strip-components=1 -C $NAME $GSNAME/dist

Then enable PostScript with the \`ghostscript\` bundle:

  MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'ghostscript'] })
  <script type="module" src="dist/auto.js" data-bundles="+ghostscript"></script>

Ghostscript is licensed under the GNU AGPL v3 (dist/ghostscript/COPYING); see
dist/ghostscript/SOURCE.md for its corresponding source.
TXT
  (cd "$OUT" && tar -czf "$GSNAME.tar.gz" "$GSNAME" && rm -f "$GSNAME.zip" && zip -qr "$GSNAME.zip" "$GSNAME")
  du -sh "$OUT/$GSNAME.tar.gz" "$OUT/$GSNAME.zip" | awk '{print "  " $2 "  " $1}'
  # its corresponding source (AGPL section 6), from the same place
  if [ -f "$REPO/vendor/ghostscript/source.tar.gz" ]; then
    cp "$REPO/vendor/ghostscript/source.tar.gz" "$OUT/$GSNAME-source.tar.gz"
    du -sh "$OUT/$GSNAME-source.tar.gz" | awk '{print "  " $2 "  " $1}'
  else
    echo "  warning: vendor/ghostscript/source.tar.gz missing (scripts/vendor-ghostscript.sh): the Ghostscript archive must not be released without its source" >&2
  fi
fi
echo "  contents: $(find "$STAGE" -type f | wc -l | tr -d ' ') files, $(du -sh "$STAGE" | cut -f1) unpacked"
