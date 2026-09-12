/* mpto-oracle.c — a tiny native driver around upstream's mpto extractor.
 *
 * Links against build/native/libmplib.a and calls mpwasm_mpto() (patch 0001,
 * docs/05 §3), so the .tex it writes is, by definition, what upstream's
 * `mpto` would produce. The vitest scanner corpus (test/unit/scanner.test.ts)
 * compares the TypeScript port against it byte for byte.
 *
 *   usage: mpto-oracle IN.mp OUT.tex [MODE] [MPTEXPRE]
 *     MODE     0 = TeX (default), 1 = troff
 *     MPTEXPRE path of a file to prepend (upstream default: mptexpre.tex)
 *
 * Prints the mpx history value (0 spotless .. 3 fatal) on stdout; mpto's
 * own "makempx error: ..." lines go to stderr. Note that upstream writes a
 * temporary "mptotmp.tex" in the current directory before renaming it.
 *
 * Build (from the repo root, after `make native`):
 *   cc -w -DMPWASM_NATIVE=1 -DMPWASM_NO_SPAWN=1 -Isrc/c/include \
 *      -Isrc/c/include/stub -Ibuild/gen -Ibuild/patched -Isrc/c \
 *      -o build/native/mpto-oracle test/unit/mpto-oracle.c \
 *      build/native/libmplib.a -lm
 */
#include <stdio.h>
#include <stdlib.h>
#include "mpwasm_api.h"

/* Host hooks the library expects the embedding to provide (the wasm build
 * gets them from JavaScript). mpto never calls any of them. */
char *mpwasm_host_find_file(const char *name, int ftype, const char *mode) {
  (void) name; (void) ftype; (void) mode;
  return NULL;
}
char *mpwasm_host_make_text(const char *text, int len, int mode) {
  (void) text; (void) len; (void) mode;
  return NULL;
}
char *mpwasm_host_run_script(const char *script, int len) {
  (void) script; (void) len;
  return NULL;
}

int main(int argc, char **argv) {
  const char *mptexpre;
  int mode, r;
  if (argc < 3) {
    fprintf(stderr, "usage: %s IN.mp OUT.tex [MODE] [MPTEXPRE]\n", argv[0]);
    return 64;
  }
  mode = argc > 3 ? atoi(argv[3]) : 0;
  mptexpre = argc > 4 ? argv[4] : NULL;
  r = mpwasm_mpto(argv[1], argv[2], mptexpre, mode);
  printf("%d\n", r);
  return 0;
}
