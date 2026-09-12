#!/usr/bin/env bash
# verify-pin.sh — assert that the vendored MetaPost still has the API this
# project relies on (docs/02 §1.1, START-HERE §7). Runs in CI.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MPD="$REPO/vendor/texlive-source/texk/web2c/mplibdir"
[ -d "$MPD" ] || { echo "error: $MPD missing; run scripts/extract-vendor.sh" >&2; exit 1; }
fail=0
check() { # description, file, regex
  if grep -qE "$3" "$2"; then printf '  ok   %s\n' "$1"; else printf '  FAIL %s\n' "$1"; fail=1; fi
}
echo "==> verifying pinned mplib API ($(grep -oE 'metapost_version "[^"]+"' "$MPD/mp.w"))"
check "MP_options.extensions exists"            "$MPD/mp.w"     '^int extensions;'
check "MP_options.make_text exists"             "$MPD/mp.w"     '^mp_text_maker make_text;'
check "MP_options.run_script exists"            "$MPD/mp.w"     '^mp_script_runner run_script;'
check "MP_options.run_make_mpx exists"          "$MPD/mp.w"     '^mp_makempx_cmd run_make_mpx;'
check "MP_options.find_file exists"             "$MPD/mp.w"     '^mp_file_finder find_file;'
check "mp_execute terminates the job"           "$MPD/mp.w"     'mp_final_cleanup \(mp\);.*prepare for death'
check "mpx_run_dvitomp exported"                "$MPD/mpxout.w" '^int mpx_run_dvitomp \(mpx_options \*mpxopt\)'
check "extensions==1 routes btex to make_text"  "$MPD/mp.w"     'mp->extensions == 1.*mp_start_tex'
check "psout asks for mpost.map"                "$MPD/psout.w"  '"mpost.map"'
check "mp_svg_ship_out exported"                "$MPD/svgout.w" '^int mp_svg_ship_out \(mp_edge_object \*hh, int prologues\)'
check "mp_ps_ship_out exported"                 "$MPD/psout.w"  '^int mp_ps_ship_out \(mp_edge_object \*hh, int prologues, int procset\)'
if [ "$fail" = 1 ]; then echo "==> verify-pin FAILED"; exit 1; fi
echo "==> verify-pin OK"
