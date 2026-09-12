/* mpwasm_host.c — kpathsea replacements, library-version stubs, and the
 * stubs for the math/PNG backends that are not linked into mplib.wasm.
 * See docs/02 §3–§4. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <w2c/config.h>
#include "mplib.h"

/* ---- kpathsea lib.h replacements (declared in w2c/config.h) -------------- */
static void oom(size_t n) {
  fprintf(stderr, "mpwasm: out of memory allocating %lu bytes\n", (unsigned long) n);
  abort();
}
void *xmalloc(size_t n) { void *p = malloc(n ? n : 1); if (!p) oom(n); return p; }
void *xrealloc(void *o, size_t n) { void *p = realloc(o, n ? n : 1); if (!p) oom(n); return p; }
void *xcalloc(size_t n, size_t m) { void *p = calloc(n ? n : 1, m ? m : 1); if (!p) oom(n * m); return p; }
char *xstrdup(const char *s) { size_t l = strlen(s); char *p = xmalloc(l + 1); memcpy(p, s, l + 1); return p; }
char *concatn(const char *s, ...) {
  va_list ap; size_t len = s ? strlen(s) : 0; const char *q;
  char *r = xmalloc(len + 1);
  if (s) memcpy(r, s, len + 1); else r[0] = 0;
  va_start(ap, s);
  while ((q = va_arg(ap, const char *)) != NULL) {
    size_t ql = strlen(q);
    r = xrealloc(r, len + ql + 1);
    memcpy(r + len, q, ql + 1);
    len += ql;
  }
  va_end(ap);
  return r;
}

/* ---- version symbols mp.w declares extern (docs/02 §4.1) ---------------- */
const char *COMPILED_CAIRO_VERSION_STRING  = "none";
const char *COMPILED_PIXMAN_VERSION_STRING = "none";
const char *COMPILED_MPFR_VERSION_STRING   = "none";
const char *COMPILED_MPFI_VERSION_STRING   = "none";
const char *const COMPILED_gmp_version     = "none";
int COMPILED__GNU_MP_VERSION = 0, COMPILED__GNU_MP_VERSION_MINOR = 0,
    COMPILED__GNU_MP_VERSION_PATCHLEVEL = 0;
const char *cairo_version_string(void)  { return "none"; }
const char *pixman_version_string(void) { return "none"; }
const char *mpfr_get_version(void)      { return "none"; }
const char *mpfi_get_version(void)      { return "none"; }

/* ---- MPFR/MPFI number systems are not built (docs/02 §4.2) -------------- */
void *mp_initialize_binary_math(MP mp)   { (void) mp; return NULL; }
void *mp_initialize_interval_math(MP mp) { (void) mp; return NULL; }

/* ---- cairo/libpng backend is not built (docs/02 §4.3) ------------------- */
void mp_png_backend_initialize(MP mp) { (void) mp; }
void mp_png_backend_free(MP mp)       { (void) mp; }
int  mp_png_gr_ship_out(void *hh, const char *opts, int standalone) {
  (void) hh; (void) opts; (void) standalone; return 1;
}
