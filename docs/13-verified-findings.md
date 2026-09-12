# 13 — Verified findings

Everything below was **established by experiment** during scoping, on
2026-09-11, on macOS/arm64, against:

* MetaPost sources: `github.com/TeX-Live/texlive-source`, `master`
  (`metapost_version "3.00"` — a development version).
* Oracle: locally installed **TeX Live 2025 / MetaPost 2.11**, `pdfTeX
  3.141592653-2.6-1.40.28`, `kpathsea 6.4.1`.

Treat it as fact for master, and as *strongly likely* for the release you pin.
`scripts/verify-pin.sh` and the L0 contract harness exist to re-confirm it.

---

## 1. mplib has no hard dependencies beyond libc

`ctangle` was run on `mp.w`, `psout.w`, `svgout.w`, `tfmin.w`, `mpxout.w`,
`mpmath.w`, `mpmathdouble.w`, `mpmathdecimal.w`, `mpstrings.w`. All nine
tangled cleanly with no other files present.

All of them, plus `avl.c`, `decNumber.c`, `decContext.c`, then compiled with
`clang -O1` against nothing but libc and a 35-line `w2c/config.h` shim
(`reference/w2c-config-shim.h`). Total object size **1 051 488 bytes**:

```
   16256 avl.o        60256 decNumber.o    596256 mp.o       27104 mpmath.o
   44248 mpmathdecimal.o  21024 mpmathdouble.o  6320 mpstrings.o
   80936 mpxout.o    140216 psout.o        48080 svgout.o     5056 tfmin.o
    5736 decContext.o
```

**No kpathsea. No cairo. No GMP/MPFR. No zlib or libpng** beyond four version
strings.

Undefined symbols at link time were exactly four families, all stubbed in
~15 lines (`docs/02` §4): the `COMPILED_*` version symbols,
`mp_initialize_binary_math` / `mp_initialize_interval_math`, and the three
PNG backend entry points.

`<zlib.h>` and `<png.h>` are genuinely `#include`d by `mp.w` (only for
`ZLIB_VERSION`, `zlibVersion()`, `PNG_LIBPNG_VER_STRING`, `png_libpng_ver`);
the cairo/GMP/MPFR includes are CWEB-commented and never reach the C.

## 2. The full embedding works end to end

`reference/host_shim_reference.c` was built and run. Output:

```
[find 2] plain.mp -> …/texmf-dist/metapost/base/plain.mp
[find 8] mpost.map -> NOT FOUND
[make_text mode=0] <<Hello>>
=== status=0 ===
--- term_out (159) ---
This is MetaPost, Version 3.00
 (…/metapost/base/plain.mp
Preloading the plain mem file, version 1.005) [1]
1 figure created.
--- edges: present ---
  fig charcode=1 bbox=(-50.25,-50.25)-(50.25,61.5)
  count=1
```

So: a `MetaPost` program supplied as a **string**, with `btex Hello etex`
intercepted by **our callback**, producing a figure whose structured edge
object we can read — all synchronously, in-process.

## 3. `mem_name = NULL` is a segfault

Observed. `mp_execute` → `@<Start non-interactive work@>` →
`mp_load_preload_file` → `mp_open_mem_file`, which on failure does
`wterm(mp->mem_name)` with a null pointer. Setting `opt->mem_name = "plain"`
fixed it. This is the first thing that will bite an implementer.

## 4. Non-interactive mode replaces your I/O callbacks

From `mp.w` `@<Prepare function pointers for non-interactive use@>`, confirmed
by observing that our `host_open_file` was never called while our
`host_find_file` was called on every open:

```c
mp->open_file        = mplib_open_file;      mp->close_file  = mplib_close_file;
mp->eof_file         = mplib_eof_file;       mp->flush_file  = mplib_flush_file;
mp->write_ascii_file = mplib_write_ascii_file;
mp->read_ascii_file  = mplib_read_ascii_file;
mp->write_binary_file= mplib_write_binary_file;
mp->read_binary_file = mplib_read_binary_file;
mp->shipout_backend  = mplib_shipout_backend;
```

and `mplib_open_file` itself calls `(mp->find_file)(...)` then `fopen`s the
result. `find_file`, `make_text`, `run_script`, `run_make_mpx` and `run_editor`
survive.

Corollary tested: `print_found_names` is **not** needed for `find_file` to be
consulted — with it on, `find_file` fires **twice** per open.

## 5. `run_data.ship_out` is per-figure

`mplib_open_file` for `mp_filetype_postscript`/`_bitmap` calls
`mp_free_stream(&run->ship_out)` before allocating a new one. Rendering two
figures and then reading the buffer yields only the second. Copy after each
backend call.

Also observed: after `mp_execute` with the default non-interactive backend,
`ship_out` is **empty** and `edges` is populated — the default backend collects
structured objects and does not run PS/SVG. Calling `mp_svg_ship_out(edge, 3)`
afterwards filled `ship_out` with 1 252 bytes of SVG.

## 6. `prologues:=3` gives real glyph outlines in SVG

Run: `prologues:=3; beginfig(1); draw fullcircle scaled 100;
label.top("MetaPost",(0,50)); endfig; end.` — **no TeX involved**, just TFM
metrics and the Type 1 font.

```xml
<defs>
  <g transform="scale(0.009963,0.009963)" id="GLYPHcmr10_115">
    <path style="fill-rule: evenodd;" d="M208 -194C230 -190,312 -174,312 -102…"></path>
  </g>
</defs>
<g transform="translate(29.259201 6.807800)" style="fill: rgb(0%,0%,0%);">
  <use xlink:href="#GLYPHcmr10_77"></use>
  <use xlink:href="#GLYPHcmr10_101" x="9.166833"></use>
  …
</g>
```

With `prologues < 3` the same input emits `<text font-size="9.962646">Z</text>`
— the raw TFM slot with no font family, which for `cmex10` slot 90 is an
integral sign rendered as a Latin Z. Unusable. Hence the recommendation to
default `prologues` to 3 for SVG.

## 7. The TeX side

`pdftex -ini -etex -jobname=latex '\pdfoutput=0 \input latex.ltx \dump'`
builds `latex.fmt` (**3 605 753 bytes**), and `pdftex -fmt=latex t.tex`
produces a `.dvi`. Note:

* `etex -ini` alone fails with `! LaTeX requires e-TeX.` — TeX Live 2025's
  `etex` **is** pdfTeX, and `-ini` does not enable e-TeX implicitly. The
  explicit `-etex` flag is required.
* `gzip -9` on `latex.fmt` → 3 558 958 bytes; `brotli -q 11` → 3 551 817. Format
  files are already zlib-compressed by web2c.

## 8. Ground truth for `.mpx`

`reference/mpx-samples/latex-math.mp` compiled with `mpost -tex=latex` produced
`reference/mpx-samples/latex-math.mpx`. Two `btex` blocks → two chunks
separated by `mpxbreak`, each opening with

```
begingroup save _p,_r,_s,_n; picture _p; _p=nullpicture;
```

and closing with `_p endgroup`. The `_n0 … _n7` / `_n8` numbering continues
across chunks, but since each chunk `save`s `_n`, chunks are **self-contained**
— which is what makes per-snippet caching sound.

The wrapper macros `mpto` writes were read from `mpxout.w` and are reproduced
verbatim in `docs/05` §3.1.

## 9. Asset inventory for one LaTeX figure

`KPATHSEA_DEBUG=32 mpost -tex=latex -s outputformat=svg -s prologues=3
demo.mp` opened exactly:

* 9 TFMs (`cmr5/7/10`, `cmmi7/10`, `cmsy7/10`, `cmex10`, `cmbx10`)
* the matching 9 `.pfb` files
* `texfonts.map`, `psfonts.map`
* `plain.mp`, `mpost.mp`
* `latex.fmt`, `article.cls`, `size10.clo`, `amsmath.sty` (+4 amsmath deps),
  `l3backend-dvips.def`

Nine fonts, not 150 — which is the case for lazy per-font loading.

## 10. Measured sizes (TeX Live 2025)

| Path | Raw | gzip |
| --- | --- | --- |
| `texmf-dist/metapost/base` | 124 KB | 31 KB |
| `fonts/tfm/public/cm` (75 files) | 300 KB | 51 KB |
| `fonts/type1/public/amsfonts/cm` (150 files) | 2.7 MB | 2.1 MB |
| `tex/latex/base` | 3.0 MB | — |
| `psfonts.map` | 5.5 MB | — |
| `latex.fmt` | 3.6 MB | 3.56 MB |

## 11. API facts read directly from the source

* `MP_options` fields, `mp_filetype` enum, `math_data`, `mp_run_data`,
  `mp_edge_object` and the six graphic-object structs: see
  `reference/mplib-public-api.h` and the generated `mplibps.h`.
* `mp_execute` ends with `mp_final_cleanup()` + `mp_close_files_and_terminate()`
  — **one call is one complete job.**
* `extensions == 1` routes `btex`/`verbatimtex` to `make_text`
  (`mp.w` line ~19148: `if ((mp->extensions == 1) && (cur_cmd() == mp_start_tex))`).
* `make_text`'s fourth argument is the **verbatim flag** (1 = `verbatimtex`),
  not `texscriptmode`.
* The returned string is injected via `@<Put a maketext result string into the
  input buffer@>` → "Pretend we're reading a new one-line file".
* `psout.w` line 1552: MetaPost asks `find_file` for **`mpost.map`**.
* `mpx_makempx` runs TeX via `mpx_run_command` → `do_spawn` → `execvp`
  (`mpxout.w` line 3988) — the call that cannot exist in wasm.
* `mpx_run_dvitomp(mpx_options*)` is exported and independent of that path.
* `mem_name` names a `.mp` **source** file, not a binary dump. MetaPost 2.x has
  no mem files.

## 13. `mp_execute` reads exactly one line

Found while testing `scripts/reproduce-scoping.sh`. It changes the driver
design, so it is the most consequential finding after §2.

```
--- single line ---
=== status=0 ===
1 figure created.
  fig charcode=1 bbox=(-5.25,-5.25)-(5.25,5.25)
--- two lines (newline in the middle) ---
=== status=3 ===
! Emergency stop.
*** (job aborted, no legal end found)
--- two lines + trailing newline ---
=== status=3 ===
! Emergency stop.
*** (job aborted, no legal end found)
```

`mp_execute` calls `mp_input_ln` **once** on `run_data.term_in`, sets
`buffer[limit] = '%'`, and runs statements. When the scanner wants another
terminal line, `mp.w` line ~19041 reaches:

```c
if (mp->interaction > mp_nonstop_mode) { ...prompt... }
else mp_fatal_error (mp, "*** (job aborted, no legal end found)");
```

Nothing refills the buffer from the remainder of the string.

**The fix, verified:** write the document into the VFS and execute a one-line
`input`.

```
$ cat job.mp
% a multi-line MetaPost document with a comment
prologues := 3;
beginfig(1);
  draw fullcircle scaled 100;
  label.top("MetaPost", (0,50));
endfig;
beginfig(2);
  fill unitsquare scaled 40 withcolor (1,0,0);
endfig;
end.

$ ./host_test 'input job'
=== status=0 ===
2 figures created.
  fig charcode=1 bbox=(-50.25,-50.25)-(50.25,59.8078)
  fig charcode=2 bbox=(0,0)-(40,40)
```

and with `btex` inside that file, `extensions = 1` still routes it to our
callback:

```
$ ./host_test 'input job2'
[make_text mode=0] <<$x^2$>>
=== status=0 ===
1 figure created.
  fig charcode=1 bbox=(-30.25,-30.25)-(30.25,41.5)
```

Because the source is now a genuine file, `mp_start_input` populates
`in_name`/`in_area`/`in_ext`, so the **classic `.mpx` path also becomes
available** — the earlier concern that `extensions = 0` cannot work with
string input does not apply once the driver writes a file.

## 12. How to reproduce all of this

```sh
mkdir -p /tmp/mpscope && cd /tmp/mpscope
for f in mp mpost mpxout psout svgout tfmin mpmath mpmathdouble mpmathdecimal \
         mpstrings mpconfig.h avl.c avl.h decNumber.c decNumber.h \
         decContext.c decContext.h decNumberLocal.h; do
  case $f in *.*) n=$f;; *) n=$f.w;; esac
  curl -sSO "https://raw.githubusercontent.com/TeX-Live/texlive-source/master/texk/web2c/mplibdir/$n"
done
for f in mp psout svgout tfmin mpxout mpmath mpmathdouble mpmathdecimal mpstrings; do
  ctangle $f.w
done
mkdir -p w2c && cp /path/to/reference/w2c-config-shim.h w2c/config.h
# plus the two stub headers for png.h / zlib.h, see docs/02 §4.1
cc -O1 -w -I. -Istub -o host_test /path/to/reference/host_shim_reference.c \
   mp.c psout.c svgout.c mpmath.c mpmathdouble.c mpmathdecimal.c mpstrings.c \
   tfmin.c avl.c decNumber.c decContext.c -lm
./host_test 'prologues:=3; beginfig(1); draw fullcircle scaled 100;
              label.top("MetaPost",(0,50)); endfig; end.'
```

Adjust the hard-coded texmf roots at the top of `host_shim_reference.c` to
point at your TeX Live.
