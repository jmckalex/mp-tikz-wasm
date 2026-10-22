# babel-locales.sh — sourced by build-texmf.sh (and test/unit/babel-locales.test.ts):
# copy babel's locale directories and its languages' .ldf directories for the latex-doc bundle.

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

# copy_babel_languages SRC DEST LANGUAGE...: copy SRC/babel-LANGUAGE, the package with that
# language's .ldf, to DEST for each one, and warn for a missing one as copy_babel_locales does.
copy_babel_languages() {
  local src="$1" dest="$2" l; shift 2
  for l in "$@"; do
    if [ -d "$src/babel-$l" ]; then cp -R "$src/babel-$l" "$dest/babel-$l"
    else echo "  warning: babel-$l not found in $src; the latex-doc bundle will lack that language's .ldf" >&2; fi
  done
}
