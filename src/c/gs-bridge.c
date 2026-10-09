/*
 * gs-bridge.c — the "libgs" that dvisvgm.wasm loads (patches/dvisvgm/0002).
 *
 * dvisvgm interprets PostScript specials (PSTricks, EPS images, ps: code,
 * graphicx's dvips-driver rotation and scaling) through Ghostscript, which it
 * loads at run time with dlopen/dlsym. This build has no dynamic linking, so
 * DLLoader calls mpw_dlopen/mpw_dlsym/mpw_dlclose instead. They answer "libgs"
 * with the proxies below, whose work is done by a separate Ghostscript wasm
 * module (vendor/GHOSTSCRIPT.lock) through gs-bridge.js and the host's
 * Module.gsBridge (src/ts/ghostscript.ts). Ghostscript is never linked into
 * dvisvgm.wasm. When the host has not loaded it, mpw_dlopen finds no library
 * and dvisvgm carries on exactly as it does without Ghostscript anywhere.
 *
 * Each proxy has the exact C signature of its gsapi_* declaration in iapi.h,
 * because dvisvgm calls them through function pointers of those types and
 * WebAssembly's call_indirect checks the signature (cf. patches/luatex/0001).
 *
 * Ghostscript writes to stdout while it runs; dvisvgm reads its drawing
 * commands ("dvi.moveto ...") from that stream. The host collects the output
 * of each call, and the proxy hands it to dvisvgm's callbacks before
 * returning, in order. dvisvgm only consumes that output (its stdin callback
 * returns 0), so this is the order it would see natively.
 */
#include <string.h>
#include "iapi.h"

/* gs-bridge.js */
int mpw_gs_available(void);
int mpw_gs_revision(int *revision, int *date);
int mpw_gs_new_instance(void);
int mpw_gs_init(int argc, char **argv);
int mpw_gs_run(int op, const char *str, unsigned int length, int user_errors, int *pexit_code);
int mpw_gs_exit(void);
void mpw_gs_delete_instance(void);
int mpw_gs_take(int stream, char *buf, int cap);

enum { RUN_BEGIN = 0, RUN_CONTINUE = 1, RUN_END = 2 };

static int library;    /* addresses of these stand for the library and the one instance */
static int instance;
static void *caller;
static int (*out_fn)(void *, const char *, int);
static int (*err_fn)(void *, const char *, int);

static void drain(void) {
  char buf[8192];
  int n;
  while ((n = mpw_gs_take(1, buf, sizeof buf)) > 0) if (out_fn) out_fn(caller, buf, n);
  while ((n = mpw_gs_take(2, buf, sizeof buf)) > 0) if (err_fn) err_fn(caller, buf, n);
}

static int proxy_revision(gsapi_revision_t *pr, int len) {
  int revision = 0, date = 0;
  if (len < (int)sizeof(gsapi_revision_t)) return (int)sizeof(gsapi_revision_t);
  if (mpw_gs_revision(&revision, &date) != 0) return -1;
  pr->product = "GPL Ghostscript";
  pr->copyright = "Copyright (C) Artifex Software, Inc.";
  pr->revision = revision;
  pr->revisiondate = date;
  return 0;
}

static int proxy_new_instance(void **pinstance, void *caller_handle) {
  int code = mpw_gs_new_instance();
  if (code < 0) { *pinstance = 0; return code; }
  caller = caller_handle;
  out_fn = 0; err_fn = 0;
  *pinstance = &instance;
  return 0;
}

static void proxy_delete_instance(void *inst) {
  (void)inst;
  mpw_gs_delete_instance();
  out_fn = 0; err_fn = 0;
}

static int proxy_set_stdio(void *inst, int (*stdin_fn)(void *, char *, int),
                           int (*stdout_fn)(void *, const char *, int), int (*stderr_fn)(void *, const char *, int)) {
  (void)inst; (void)stdin_fn;   /* dvisvgm's stdin callback only ever returns 0; the module's own does too */
  out_fn = stdout_fn;
  err_fn = stderr_fn;
  return 0;
}

static int proxy_init_with_args(void *inst, int argc, char **argv) {
  (void)inst;
  int code = mpw_gs_init(argc, argv);
  drain();
  return code;
}

static int proxy_run_string_begin(void *inst, int user_errors, int *pexit_code) {
  (void)inst;
  int code = mpw_gs_run(RUN_BEGIN, 0, 0, user_errors, pexit_code);
  drain();
  return code;
}

static int proxy_run_string_continue(void *inst, const char *str, unsigned int length, int user_errors, int *pexit_code) {
  (void)inst;
  int code = mpw_gs_run(RUN_CONTINUE, str, length, user_errors, pexit_code);
  drain();
  return code;
}

static int proxy_run_string_end(void *inst, int user_errors, int *pexit_code) {
  (void)inst;
  int code = mpw_gs_run(RUN_END, 0, 0, user_errors, pexit_code);
  drain();
  return code;
}

static int proxy_exit(void *inst) {
  (void)inst;
  int code = mpw_gs_exit();
  drain();
  return code;
}

static const struct { const char *name; void *fn; } symbols[] = {
  { "gsapi_revision",            (void *)proxy_revision },
  { "gsapi_new_instance",        (void *)proxy_new_instance },
  { "gsapi_delete_instance",     (void *)proxy_delete_instance },
  { "gsapi_set_stdio",           (void *)proxy_set_stdio },
  { "gsapi_init_with_args",      (void *)proxy_init_with_args },
  { "gsapi_run_string_begin",    (void *)proxy_run_string_begin },
  { "gsapi_run_string_continue", (void *)proxy_run_string_continue },
  { "gsapi_run_string_end",      (void *)proxy_run_string_end },
  { "gsapi_exit",                (void *)proxy_exit },
};

/* dvisvgm asks for libgs.so.10 down to .7 (and other spellings); any name
   that mentions gs means Ghostscript, and there is one only if the host has it */
void *mpw_dlopen(const char *name) {
  return name && strstr(name, "gs") && mpw_gs_available() ? &library : 0;
}

void *mpw_dlsym(void *handle, const char *name) {
  if (handle != &library || !name) return 0;
  for (unsigned i = 0; i < sizeof symbols / sizeof symbols[0]; i++)
    if (strcmp(symbols[i].name, name) == 0) return symbols[i].fn;
  return 0;
}

void mpw_dlclose(void *handle) { (void)handle; }
