#!/usr/bin/env bash
# build-ghostscript.sh — put the pinned Ghostscript module into dist/ghostscript/
# (gs.mjs, gs.wasm, LICENSE, SOURCE.md), where the library loads it when a
# document's PostScript needs it (src/ts/ghostscript.ts). The files come from
# vendor/ghostscript/, filled and checked by scripts/vendor-ghostscript.sh
# against vendor/GHOSTSCRIPT.lock. Ghostscript is AGPL; it stays a separate
# module and is never linked into the engines here.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
V="$REPO/vendor/ghostscript"
OUT="$REPO/dist/ghostscript"
"$REPO/scripts/vendor-ghostscript.sh" || true
if [ ! -f "$V/gs.js" ] || [ ! -f "$V/gs.wasm" ]; then
  echo "  ghostscript: vendor/ghostscript/gs.{js,wasm} not available (GS_DIR?); dist/ghostscript not built, PostScript stays skipped" >&2
  rm -rf "$OUT"; exit 0
fi
mkdir -p "$OUT"
cp "$V/gs.js" "$OUT/gs.mjs"
cp "$V/gs.wasm" "$V/LICENSE" "$V/COPYING" "$OUT/"
{
  echo "# Ghostscript for mp-tikz-wasm"
  echo
  echo "Ghostscript 10.08.0 (Artifex Software), built to WebAssembly by the Ghostscript"
  echo "port (lean variant: the PostScript and PDF interpreters, %rom% fonts and init"
  echo "files, no output devices), loaded by mp-tikz-wasm's dvisvgm through a narrow"
  echo "bridge when a document carries PostScript. Licence: GNU AGPL v3 (COPYING;"
  echo "LICENSE says which parts it covers)."
  echo
  echo "Corresponding source: the Ghostscript port's tree at commit"
  echo "$(awk '$1 == "commit" { print $2 }' "$REPO/vendor/GHOSTSCRIPT.lock"), released beside this module as"
  echo "mp-tikz-wasm-ghostscript-<version>-source.tar.gz. It holds the Ghostscript 10.08.0 source"
  echo "(https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/tag/gs10080) with the port's"
  echo "changes applied (a new svg output device, not built into this lean variant, and a"
  echo "dependency fix in pdf/pdf.mak), its build script (build.sh; this module is VARIANT=lean)"
  echo "and its JS wrappers."
  echo "The files built from it, as pinned in mp-tikz-wasm's vendor/GHOSTSCRIPT.lock:"
  echo
  grep -E '^gs\.(js|wasm) ' "$REPO/vendor/GHOSTSCRIPT.lock" | awk '{ print "    " $1 "  sha256 " $2 }'
} > "$OUT/SOURCE.md"
ls -l "$OUT"
