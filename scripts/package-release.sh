#!/usr/bin/env bash
# package-release.sh — build the prebuilt distribution archive for a GitHub
# release: dist/ (the three wasm engines, the JavaScript, auto.js, and the
# bundles) plus the demo pages, so users need neither TeX Live nor Emscripten.
#
#   scripts/package-release.sh            -> release/metapost-wasm-<version>.tar.gz and .zip
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$REPO/package.json').version")"
NAME="metapost-wasm-$VERSION"
OUT="$REPO/release"
STAGE="$OUT/$NAME"
for f in dist/mplib.wasm dist/tex.wasm dist/dvisvgm.wasm dist/index.js dist/auto.js dist/bundles/index.json; do
  [ -f "$REPO/$f" ] || { echo "error: $f missing — run npm run build first" >&2; exit 1; }
done
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R "$REPO/dist" "$STAGE/dist"
rm -f "$STAGE"/dist/*.map "$STAGE"/dist/*/*.map
mkdir -p "$STAGE/site"
cp "$REPO"/site/index.html "$REPO"/site/app.js "$REPO"/site/examples.js "$REPO"/site/examples-tikz.js "$REPO"/site/tags.html "$REPO"/site/guide.html "$STAGE/site/" 2>/dev/null || true
cp "$REPO/README.md" "$REPO/LICENSE.md" "$STAGE/" 2>/dev/null || true
cp "$REPO/scripts/serve.mjs" "$STAGE/serve.mjs"
cat > "$STAGE/START.md" <<'TXT'
metapost-wasm — prebuilt distribution

  dist/           the library: index.js (API), auto.js (drop-in tags), worker.js,
                  mplib.wasm, tex.wasm, dvisvgm.wasm, bundles/ (fonts, formats, packages)
  site/           the demo pages (index.html, tags.html, guide.html)
  serve.mjs       node serve.mjs 8080  ->  http://localhost:8080/site/

Host dist/ on any static server and add to your page:
  <script type="module" src="/path/to/dist/auto.js"></script>
  <script type="text/tikz"> \begin{tikzpicture} ... \end{tikzpicture} </script>
See guide.html for everything else.
TXT
sed -i '' "s#path.resolve(new URL('..', import.meta.url).pathname)#path.resolve(new URL('.', import.meta.url).pathname)#" "$STAGE/serve.mjs" 2>/dev/null || sed -i "s#path.resolve(new URL('..', import.meta.url).pathname)#path.resolve(new URL('.', import.meta.url).pathname)#" "$STAGE/serve.mjs"
(cd "$OUT" && tar -czf "$NAME.tar.gz" "$NAME" && rm -f "$NAME.zip" && zip -qr "$NAME.zip" "$NAME")
du -sh "$OUT/$NAME.tar.gz" "$OUT/$NAME.zip" | awk '{print "  " $2 "  " $1}'
echo "  contents: $(find "$STAGE" -type f | wc -l | tr -d ' ') files, $(du -sh "$STAGE" | cut -f1) unpacked"
