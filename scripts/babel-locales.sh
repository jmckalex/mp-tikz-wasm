# babel-locales.sh — sourced by build-texmf.sh (and test/unit/babel-locales.test.ts):
# copy babel's locale directories for the latex-doc bundle.

# copy_babel_locales SRC DEST LOCALE...: copy SRC/LOCALE to DEST/LOCALE for each one. A
# missing directory is warned about, not fatal, so that a language TeX Live drops or moves
# is seen in the build's output; except `invalid`, which babel has only from version 26
# (TeX Live 2025's tlnet-final): an older babel maps the old names, ngerman and the rest,
# in each language's own directory.
copy_babel_locales() {
  local src="$1" dest="$2" l; shift 2
  for l in "$@"; do
    if [ -d "$src/$l" ]; then mkdir -p "$dest" && cp -R "$src/$l" "$dest/$l"
    elif [ "$l" != invalid ]; then echo "  warning: babel's locale/$l not found in $src; the latex-doc bundle will lack that language" >&2; fi
  done
}
