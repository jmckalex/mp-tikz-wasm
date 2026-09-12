/* mpwasm_api.h — the C surface exported from mplib.wasm (docs/04 §6).
 *
 * Everything crossing the wasm boundary is an int, a double, or a
 * NUL-terminated string. Strings returned by mpwasm_* functions are owned by
 * the context and remain valid until the next call that returns a string
 * from the same context, or until mpwasm_free().
 */
#ifndef MPWASM_API_H
#define MPWASM_API_H 1

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct mpwasm_ctx mpwasm_ctx;

/* ---- lifecycle ---------------------------------------------------------- */
mpwasm_ctx *mpwasm_new(void);
void        mpwasm_free(mpwasm_ctx *c);

/* Options must be set before mpwasm_run(). Unknown keys are ignored and
 * reported by mpwasm_last_error(). Keys (int): math_mode, extensions,
 * interaction, halt_on_error, random_seed, ini_version, troff_mode,
 * print_found_names, file_line_error_style, error_line, half_error_line,
 * max_print_line, recorder. Keys (str): mem_name, job_name, banner. */
int  mpwasm_set_int(mpwasm_ctx *c, const char *key, int value);
int  mpwasm_set_str(mpwasm_ctx *c, const char *key, const char *value);

/* Search path for find_file: ftype is an enum mp_filetype value, or -1 for
 * every type. Directories are searched in the order added. */
void mpwasm_add_path(mpwasm_ctx *c, int ftype, const char *dir);
/* Optional file-name aliases (e.g. "cmr10.tfm" -> "/texmf/fonts/tfm/cmr10.tfm").
 * Consulted before the directory search. */
void mpwasm_add_alias(mpwasm_ctx *c, const char *name, const char *path);

/* Run one complete MetaPost job. |commands| is ONE line of MetaPost, typically
 * "input job" (docs/04 §2b). Returns mplib's history value (0..4). A second
 * call on the same context is an error (returns -1). */
int  mpwasm_run(mpwasm_ctx *c, const char *commands);

/* ---- diagnostics -------------------------------------------------------- */
int         mpwasm_status(mpwasm_ctx *c);        /* history, or -1 before run */
const char *mpwasm_term_out(mpwasm_ctx *c);
const char *mpwasm_log_out(mpwasm_ctx *c);
const char *mpwasm_error_out(mpwasm_ctx *c);
const char *mpwasm_last_error(mpwasm_ctx *c);    /* host-level error, or "" */
/* JSON array of every file find_file resolved: [{"name","type","path"},...] */
const char *mpwasm_opened_files_json(mpwasm_ctx *c);

/* ---- figures ------------------------------------------------------------ */
int         mpwasm_figure_count(mpwasm_ctx *c);
int         mpwasm_figure_charcode(mpwasm_ctx *c, int i);
/* k: 0 minx, 1 miny, 2 maxx, 3 maxy, 4 width, 5 height, 6 depth, 7 ital_corr,
 * 8 prologues and 9 procset as they were when the figure was shipped out */
double      mpwasm_figure_dim(mpwasm_ctx *c, int i, int k);
/* prologues/procset < 0 mean "as at shipout time" (the document's own values) */
const char *mpwasm_figure_svg (mpwasm_ctx *c, int i, int prologues);
const char *mpwasm_figure_ps  (mpwasm_ctx *c, int i, int prologues, int procset);
const char *mpwasm_figure_json(mpwasm_ctx *c, int i);

/* ---- values ------------------------------------------------------------- */
double      mpwasm_get_numeric(mpwasm_ctx *c, const char *expr);
int         mpwasm_get_boolean(mpwasm_ctx *c, const char *expr);
const char *mpwasm_get_string (mpwasm_ctx *c, const char *expr);

/* ---- the mpx pipeline (docs/05) ---------------------------------------- */
/* Extract btex/verbatimtex blocks from mp_path into a TeX file at tex_path.
 * mode: 0 = TeX, 1 = troff. mptexpre may be NULL. Returns mpx history (0 ok). */
int mpwasm_mpto(const char *mp_path, const char *tex_path, const char *mptexpre, int mode);
/* Convert a DVI file into an .mpx file. Returns mpx history (0 ok). */
int mpwasm_dvitomp(const char *dvi_path, const char *mpx_path, const char *banner);
/* Search directories for the mpx pipeline's TFM/VF lookups (global). */
void mpwasm_mpx_add_path(const char *dir);
const char *mpwasm_mpx_last_error(void);

/* ---- misc --------------------------------------------------------------- */
const char *mpwasm_version(void);       /* MetaPost version string */
const char *mpwasm_build_id(void);      /* build identifier for cache keys */

/* ---- host hooks --------------------------------------------------------- */
/* Implemented by the JavaScript side (src/c/mpwasm_library.js) in the wasm
 * build, and by the test harness in native builds. Each returns a malloc()ed
 * string that the C side frees, or NULL. */
char *mpwasm_host_find_file(const char *name, int ftype, const char *mode);
char *mpwasm_host_make_text(const char *text, int len, int mode);
char *mpwasm_host_run_script(const char *script, int len);

#ifdef __cplusplus
}
#endif
#endif
