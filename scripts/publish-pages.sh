#!/usr/bin/env bash
# publish-pages.sh — publish the demo pages and the built library to GitHub
# Pages. Assembles build/pages-site (the site/ pages plus dist/, the same layout
# as the release archive, so the pages' ../dist/ links work unchanged) and
# force-pushes it as a single orphan commit to the gh-pages branch, so the
# branch never accumulates old copies of the 75 MB of engines and bundles.
#
# Enable Pages once, from a branch: Settings -> Pages -> "Deploy from a branch",
# gh-pages, "/ (root)"; or
#   gh api -X POST repos/<owner>/<repo>/pages -f 'source[branch]=gh-pages' -f 'source[path]=/'
# Then the pages are at https://<owner>.github.io/<repo>/site/guide.html etc.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$REPO/build/pages-site"
"$REPO/scripts/stage-site.sh" "$STAGE"
touch "$STAGE/.nojekyll"      # serve every file as is; no Jekyll processing
REMOTE="$(git -C "$REPO" remote get-url origin)"
NAME="$(git -C "$REPO" config user.name || echo pages)"; MAIL="$(git -C "$REPO" config user.email || echo pages@localhost)"
(
  cd "$STAGE"
  rm -rf .git
  git init -q -b gh-pages
  git add -A
  git -c user.name="$NAME" -c user.email="$MAIL" commit -q -m "Pages from $(git -C "$REPO" rev-parse --short HEAD)"
  git push -f "$REMOTE" gh-pages:gh-pages
)
echo "==> pushed gh-pages ($(du -sh "$STAGE" | cut -f1)); once Pages is enabled: $(echo "$REMOTE" | sed -E 's#https://github.com/([^/]+)/([^/.]+)(\.git)?#https://\1.github.io/\2#')/site/guide.html"
