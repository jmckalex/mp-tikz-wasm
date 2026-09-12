#!/usr/bin/env bash
# extract-vendor.sh — populate vendor/texlive-source from the pinned tarball in
# vendor/SOURCES.lock, downloading it if necessary and verifying its SHA-256.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$REPO/vendor/SOURCES.lock"
DL="$REPO/vendor/downloads"
DEST="$REPO/vendor/texlive-source"

read -r NAME SHA URL < <(grep -v '^#' "$LOCK" | grep -v '^\s*$' | head -1)
mkdir -p "$DL"
if [ ! -f "$DL/$NAME" ]; then
  echo "==> downloading $NAME"
  curl -sSfL -o "$DL/$NAME.part" "$URL"
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
