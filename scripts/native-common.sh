# native-common.sh — shared by native-texlive.sh, native-dvisvgm.sh and
# native-luatex.sh: configure and build single packages of the pinned TeX Live
# tree in vendor/native-build. Source it after setting REPO.
#
# TeX Live's top-level configure (run by native-texlive.sh) configures only
# auxdir/auxsub, libs, utils and texk, and records in subsubdir-conf.cmd the
# command line it would use for everything below them. The packages themselves
# (texk/kpathsea, libs/zlib, texk/web2c, ...) do not exist until the `recurse`
# rule of am/recurse.am creates and configures them, when make runs in libs/
# or texk/ — appending --disable-build for each package that is not going to
# be built. Letting make do that would build everything the configure enabled:
# --disable-all-pkgs leaves every web2c engine on, so libs/ would build ICU,
# HarfBuzz and Cairo, and texk/web2c would build (and on macOS fail on) XeTeX.
# native_configure reproduces the recursion's step for one package, so that
# the scripts build only what pdfTeX, LuaTeX and dvisvgm need, in the order
# the recursion would use. On a fresh checkout nothing else works: `make -C
# texk/kpathsea` alone stops with "No such file or directory".
SRC="$REPO/vendor/texlive-source"
NB="$REPO/vendor/native-build"
JOBS="${JOBS:-8}"

# fail WHAT LOG: report a failed step with the tail of its log, then exit.
fail() { echo "error: $1 failed; tail of $2:" >&2; tail -60 "$2" >&2; exit 1; }

# native_configure texk/kpathsea [--disable-build ...]: configure one package
# as make's recursion would, unless it already is. Logs to configure-<dir>.log.
native_configure() {
  local dir=$1; shift
  [ -f "$NB/$dir/Makefile" ] && return 0
  [ -f "$NB/subsubdir-conf.cmd" ] || { echo "error: $NB is not configured; run scripts/native-texlive.sh first" >&2; exit 1; }
  local log="$NB/configure-${dir//\//-}.log"
  local cmd; cmd=$(sed "s,auxdir/auxsub,$dir,g" "$NB/subsubdir-conf.cmd")
  echo "==> configuring $dir${*:+ $*}"
  mkdir -p "$NB/$dir"
  (cd "$NB/$dir" && CONFIG_SHELL=/bin/sh && export CONFIG_SHELL && eval /bin/sh "$cmd" "$@") > "$log" 2>&1 \
    || fail "configure in $dir" "$log"
}

# native_build libs/zlib [targets]: make in one configured package. Logs to
# make-<dir>[-<target>].log.
native_build() {
  local dir=$1; shift
  local log="$NB/make-${dir//\//-}${1:+-$1}.log"
  echo "==> building $dir${*:+ ($*)}"
  make -j"$JOBS" -C "$NB/$dir" "$@" > "$log" 2>&1 || fail "make -C $dir $*" "$log"
}

# native_package libs/zlib: configure, then `make all`.
native_package() { native_configure "$1"; native_build "$1"; }
