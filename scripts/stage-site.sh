#!/usr/bin/env bash
# stage-site.sh DIR — assemble the deployable web tree into DIR: the demo pages
# and the guide under site/, the built library under dist/ (the layout of the
# release archive, so the pages' ../dist/ links work unchanged), the landing
# index.html (site/landing.html with its @VERSION@ filled in), an .htaccess
# with the MIME types Apache needs for .wasm and .mjs,
# and the licence files. DIR is synced with --delete, but a Makefile, an
# `exclude` file and .DS_Store there are left alone.
#
#   scripts/stage-site.sh ~/Sites/jmckalex/software/mp-tikz-wasm   # then `make sync` there
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${1:?usage: stage-site.sh DIR}"
for f in dist/mplib.wasm dist/tex.wasm dist/dvisvgm.wasm dist/luatex.wasm dist/index.js dist/auto.js dist/bundles/index.json site/guide.html site/standalone.html site/live.html site/minimal.html; do
  [ -f "$REPO/$f" ] || { echo "error: $f missing; run npm run build, build:guide, build:pages and build:standalone first" >&2; exit 1; }
done
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/site"
cp -R "$REPO/dist" "$STAGE/dist"
rm -f "$STAGE"/dist/*.map "$STAGE"/dist/*/*.map
for f in index.html app.js examples.js examples-tikz.js theme.css theme.js tags.html guide.html minimal.html minimal-sources.js live.html live-sources.js page-common.js standalone.html; do
  cp "$REPO/site/$f" "$STAGE/site/$f"
done
cp -R "$REPO/site/examples" "$STAGE/site/examples"
cp -R "$REPO/site/figures" "$STAGE/site/figures"     # the tags page's saved figures (mpost-wasm --prerender)
cp "$REPO/README.md" "$REPO/NOTICE.md" "$REPO/LICENSE" "$STAGE/"
cp -R "$REPO/licenses" "$STAGE/licenses"
VERSION="$(node -p "require('$REPO/package.json').version")"
cat > "$STAGE/.htaccess" <<'HT'
# MIME types Apache does not know by default. Browsers refuse a type="module"
# script that is not served as JavaScript, and WebAssembly.instantiateStreaming
# needs application/wasm.
AddType text/javascript .js
AddType text/javascript .mjs
AddType application/wasm .wasm
AddType application/json .json
AddType text/plain .mp .tex .sty .cls .def .clo .cfg .fd .ltx .ini .enc .map .lua .dat .cnf
# The engines, the JavaScript and the TeX macro files compress three to five
# times; the bundles are fetched one file at a time.
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE application/wasm text/javascript application/json text/plain text/html text/css image/svg+xml
</IfModule>
# Without explicit freshness the browser revalidates every file on a return
# visit, one round trip each; a first TikZ run touches ninety. The bundle
# files are content-addressed by their manifest and change only with a
# release; the engines and the JavaScript change together on a rebuild.
<IfModule mod_expires.c>
  ExpiresActive On
  <If "%{REQUEST_URI} =~ m#/dist/bundles/#">
    ExpiresDefault "access plus 30 days"
  </If>
  <If "%{REQUEST_URI} =~ m#/dist/[^/]+\.(wasm|js|mjs|json)$#">
    ExpiresDefault "access plus 1 day"
  </If>
</IfModule>
HT
sed "s/@VERSION@/$VERSION/g" "$REPO/site/landing.html" > "$STAGE/index.html"
# The landing page shows saved figures by their content-hash names; a changed
# tags page renames them, so fail here rather than publish broken images.
for f in $(grep -o 'site/figures/figure-[a-z0-9]*\.svg' "$STAGE/index.html" | sort -u); do
  [ -f "$STAGE/$f" ] || { echo "error: site/landing.html shows $f, which no longer exists; pick another from site/figures/" >&2; exit 1; }
done
mkdir -p "$DIR"
rsync -a --delete --exclude Makefile --exclude exclude --exclude .DS_Store "$STAGE/" "$DIR/"
echo "==> staged $(du -sh "$DIR" | cut -f1) in $DIR ($(find "$DIR" -type f | wc -l | tr -d ' ') files)"
