#!/usr/bin/env bash
# extract-vendor.sh — populate vendor/texlive-source from the pinned tarball in
# vendor/SOURCES.lock, downloading it if necessary and verifying its SHA-256.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$REPO/vendor/SOURCES.lock"
DL="$REPO/vendor/downloads"
DEST="$REPO/vendor/texlive-source"

read -r NAME SHA URL < <(grep -v '^#' "$LOCK" | grep -v '^mirror ' | grep -v '^\s*$' | head -1)
DL="${VENDOR_DL:-$DL}"
mkdir -p "$DL"
if [ ! -f "$DL/$NAME" ]; then
  # The primary URL first, then every `mirror <url>` line of the lock file
  # (TEXLIVE_SOURCE_URL, if set, is tried before all of them). The TeX Live
  # historic mirrors go down individually; a dead one costs 20 s, not a build.
  MIRRORS=(${TEXLIVE_SOURCE_URL:+"$TEXLIVE_SOURCE_URL"} "$URL")
  while read -r _ m; do MIRRORS+=("$m"); done < <(grep '^mirror ' "$LOCK")
  ok=0
  for m in "${MIRRORS[@]}"; do
    echo "==> downloading $NAME from $m"
    if curl -sSfL --connect-timeout 20 --retry 1 -o "$DL/$NAME.part" "$m"; then ok=1; break; fi
    echo "    failed; trying the next mirror"
  done
  [ "$ok" = 1 ] || { echo "error: could not download $NAME from any mirror" >&2; exit 1; }
  mv "$DL/$NAME.part" "$DL/$NAME"
fi
echo "==> verifying sha256"
ACTUAL="$(shasum -a 256 "$DL/$NAME" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$SHA" ]; then
  echo "error: sha256 mismatch for $NAME" >&2
  echo "  expected $SHA" >&2
  echo "  actual   $ACTUAL" >&2
  exit 1
fi
if [ -d "$DEST" ] && [ "${1:-}" != "--force" ]; then
  echo "==> $DEST already exists (use --force to re-extract)"
  exit 0
fi
echo "==> extracting into $DEST"
rm -rf "$DEST"; mkdir -p "$DEST"
tar -xJf "$DL/$NAME" -C "$DEST" --strip-components=1
echo "==> done"
