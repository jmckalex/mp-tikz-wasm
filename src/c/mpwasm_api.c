/* mpwasm_api.c — the mplib embedding: context, callbacks, run, render.
 * Every CONTRACT comment records behaviour verified against the real
 * sources (docs/04, docs/13). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mplibps.h"
#include "mplibsvg.h"
#include "mpmp.h"        /* MP_instance: to wrap write_ascii_file (terminal streaming) */
#include "mpwasm_api.h"
#include "mpwasm_sb.h"
#ifdef __EMSCRIPTEN__
#include <malloc.h>   /* mallinfo, for mpwasm_heap_in_use */
#endif

char *mpwasm_figure_to_json(mp_edge_object *e);   /* mpwasm_figure.c */

#define N_FTYPES 12           /* mp_filetype_terminal .. mp_filetype_text */
#define ALL_TYPES N_FTYPES    /* slot for "every type" (ftype -1) */

typedef struct strlist { char **v; int n, cap; } strlist;
static void sl_push(strlist *l, const char *s) {
  if (l->n == l->cap) { l->cap = l->cap ? l->cap * 2 : 8; l->v = xrealloc(l->v, l->cap * sizeof(char *)); }
  l->v[l->n++] = xstrdup(s);
}
static void sl_free(strlist *l) { int i; for (i = 0; i < l->n; i++) free(l->v[i]); free(l->v); l->v = NULL; l->n = l->cap = 0; }

struct mpwasm_ctx {
  MP mp;
  MP_options *opt;
  int ran;
  int history;
  char *term_out, *log_out, *error_out;
  char *out;                 /* last returned string; freed on next call */
  char err[512];
  strlist paths[N_FTYPES + 1];
  strlist alias_names, alias_paths;
  int recorder;
  mpwasm_sb opened;
  mpwasm_sb termline;        /* the terminal line being assembled for mpwasm_host_term_line */
  mp_file_writer orig_write; /* mplib's own writer, wrapped by mpwasm_write_ascii_file */
  int opened_count;
  mp_edge_object **figs;
  int nfigs, figcap;
  /* options */
  int math_mode, extensions, interaction, halt_on_error, random_seed, ini_version,
      troff_mode, print_found_names, file_line_error_style, error_line,
      half_error_line, max_print_line;
  char *mem_name, *job_name, *banner;
};

static void seterr(mpwasm_ctx *c, const char *msg) { snprintf(c->err, sizeof c->err, "%s", msg); }
static const char *ret(mpwasm_ctx *c, char *owned) { free(c->out); c->out = owned; return owned; }
static char *dup_stream(mp_stream *s) {
  char *r = xmalloc(s->used + 1);
  if (s->used && s->data) memcpy(r, s->data, s->used);
  r[s->used] = 0;
  return r;
}

/* ---------------------------------------------------------------- lifecycle */
mpwasm_ctx *mpwasm_new(void) {
  mpwasm_ctx *c = xcalloc(1, sizeof *c);
  c->history = -1;
  c->math_mode = mp_math_scaled_mode;
  c->extensions = 1;
  c->interaction = mp_nonstop_mode;
  c->random_seed = 42;
  c->mem_name = xstrdup("plain");
  c->job_name = xstrdup("job");
  return c;
}

void mpwasm_free(mpwasm_ctx *c) {
  int i;
  if (!c) return;
  /* the exported edge objects (mp_gr_export at shipout) are ours to free: mp_finish leaves them */
  for (i = 0; i < c->nfigs; i++) if (c->figs[i]) mp_gr_toss_objects(c->figs[i]);
  if (c->mp) { mp_rundata(c->mp)->edges = NULL; mp_finish(c->mp); }
  if (c->opt) { free(c->opt->mem_name); free(c->opt->job_name); free(c->opt->banner); free(c->opt); }
  free(c->term_out); free(c->log_out); free(c->error_out); free(c->out);
  mpwasm_sb_free(&c->termline);
  for (i = 0; i <= N_FTYPES; i++) sl_free(&c->paths[i]);
  sl_free(&c->alias_names); sl_free(&c->alias_paths);
  mpwasm_sb_free(&c->opened);
  free(c->figs);
  free(c->mem_name); free(c->job_name); free(c->banner);
  free(c);
}

int mpwasm_set_int(mpwasm_ctx *c, const char *key, int value) {
#define K(n) if (!strcmp(key, #n)) { c->n = value; return 0; }
  K(math_mode) K(extensions) K(interaction) K(halt_on_error) K(random_seed)
  K(ini_version) K(troff_mode) K(print_found_names) K(file_line_error_style)
  K(error_line) K(half_error_line) K(max_print_line) K(recorder)
#undef K
  seterr(c, "unknown int option"); return -1;
}

int mpwasm_set_str(mpwasm_ctx *c, const char *key, const char *value) {
#define K(n) if (!strcmp(key, #n)) { free(c->n); c->n = value ? xstrdup(value) : NULL; return 0; }
  K(mem_name) K(job_name) K(banner)
#undef K
  seterr(c, "unknown string option"); return -1;
}

void mpwasm_add_path(mpwasm_ctx *c, int ftype, const char *dir) {
  int t = ftype < 0 ? ALL_TYPES : (ftype >= mp_filetype_text ? mp_filetype_text : ftype);
  sl_push(&c->paths[t], dir);
}
void mpwasm_add_alias(mpwasm_ctx *c, const char *name, const char *path) {
  sl_push(&c->alias_names, name); sl_push(&c->alias_paths, path);
}

/* ---------------------------------------------------------------- find_file */
static int file_exists(const char *p) { struct stat st; return stat(p, &st) == 0 && S_ISREG(st.st_mode); }
static int has_suffix(const char *s, const char *suf) {
  size_t a = strlen(s), b = strlen(suf);
  return a >= b && strcmp(s + a - b, suf) == 0;
}
static const char *default_ext(int t) {
  switch (t) {
    case mp_filetype_program:  return ".mp";
    case mp_filetype_memfile:  return ".mp";
    case mp_filetype_metrics:  return ".tfm";
    case mp_filetype_fontmap:  return ".map";
    case mp_filetype_encoding: return ".enc";
    case mp_filetype_font:     return ".pfb";
    default: return NULL;
  }
}
static char *try_name(const char *dir, const char *name, const char *ext) {
  size_t l = (dir ? strlen(dir) + 1 : 0) + strlen(name) + (ext ? strlen(ext) : 0) + 1;
  char *p = xmalloc(l);
  if (dir) snprintf(p, l, "%s/%s", dir, name); else snprintf(p, l, "%s", name);
  if (file_exists(p)) return p;
  if (ext && !has_suffix(name, ext)) {
    strcat(p, ext);
    if (file_exists(p)) return p;
  }
  free(p);
  return NULL;
}
static void record_open(mpwasm_ctx *c, const char *name, int ftype, const char *path) {
  char tmp[32];
  if (!c->recorder) return;
  mpwasm_sb_puts(&c->opened, c->opened_count++ ? ",{\"name\":" : "[{\"name\":");
  mpwasm_sb_json_str(&c->opened, name);
  snprintf(tmp, sizeof tmp, ",\"type\":%d,\"path\":", ftype);
  mpwasm_sb_puts(&c->opened, tmp);
  mpwasm_sb_json_str(&c->opened, path);
  mpwasm_sb_puts(&c->opened, "}");
}

/* CONTRACT (docs/04 §4): return a malloc()ed path or NULL; writing never
 * searches; an already-resolved path must be accepted as is. */
static char *mpwasm_find_file(MP mp, const char *fname, const char *fmode, int ftype) {
  mpwasm_ctx *c = (mpwasm_ctx *) mp_userdata(mp);
  int t = ftype < 0 ? 0 : (ftype >= mp_filetype_text ? mp_filetype_text : ftype);
  const char *ext = default_ext(t);
  char *r = NULL;
  int i;
  if (fmode[0] != 'r') return xstrdup(fname);
  r = try_name(NULL, fname, ext);
  if (!r) {
    for (i = 0; i < c->alias_names.n && !r; i++)
      if (!strcmp(c->alias_names.v[i], fname) && file_exists(c->alias_paths.v[i]))
        r = xstrdup(c->alias_paths.v[i]);
  }
  if (!r && fname[0] != '/') {
    for (i = 0; i < c->paths[t].n && !r; i++) r = try_name(c->paths[t].v[i], fname, ext);
    for (i = 0; i < c->paths[ALL_TYPES].n && !r; i++) r = try_name(c->paths[ALL_TYPES].v[i], fname, ext);
  }
  if (!r) r = mpwasm_host_find_file(fname, ftype, fmode);
  if (r) record_open(c, fname, ftype, r);
  return r;
}

/* ---------------------------------------------------------------- callbacks */
/* CONTRACT (docs/04 §5.1): mode is the verbatim flag; the returned string is
 * MetaPost source injected as a one-line pseudo-file; mplib frees it. */
static char *mpwasm_make_text(MP mp, const char *str, size_t len, int mode) {
  char *r;
  (void) mp;
  r = mpwasm_host_make_text(str, (int) len, mode);
  if (r) return r;
  return xstrdup(mode == 1 ? "" : "nullpicture");
}
static char *mpwasm_run_script(MP mp, const char *str, size_t len) {
  char *r;
  (void) mp;
  r = mpwasm_host_run_script(str, (int) len);
  return r ? r : xstrdup("");
}
/* Classic .mpx route (docs/05 §7): the JS layer pre-generates the .mpx; we
 * only confirm it exists and is not older than the source. Non-zero = ok. */
static int mpwasm_run_make_mpx(MP mp, char *origname, char *mpxname) {
  struct stat a, b;
  (void) mp;
  if (stat(mpxname, &b) != 0) return 0;
  if (stat(origname, &a) == 0 && a.st_mtime > b.st_mtime) return 0;
  return 1;
}
static void mpwasm_run_editor(MP mp, char *fname, int fline) {
  (void) mp; (void) fname; (void) fline;   /* CONTRACT: must exist, must do nothing */
}

/* ------------------------------------------------------- terminal streaming */
/* mplib buffers the terminal until mp_execute returns (noninteractive mode
 * installs its own writer after the options are applied, so setting
 * opt->write_ascii_file is not enough). We wrap that writer after
 * mp_initialize: it still fills run_data.term_out, so mpwasm_term_out is
 * unchanged, and every completed line is also handed to the host as it is
 * written (docs/08 §4). MetaPost writes the terminal a character at a time,
 * hence the line buffer. */
static void term_feed(mpwasm_ctx *c, const char *s) {
  for (;;) {
    const char *nl = strchr(s, '\n');
    if (!nl) { if (*s) mpwasm_sb_puts(&c->termline, s); return; }
    mpwasm_sb_put(&c->termline, s, (size_t) (nl - s));
    mpwasm_host_term_line(c->termline.d, (int) c->termline.n);
    c->termline.n = 0; c->termline.d[0] = 0;
    s = nl + 1;
  }
}
static void term_flush(mpwasm_ctx *c) {
  if (c->termline.n) { mpwasm_host_term_line(c->termline.d, (int) c->termline.n); c->termline.n = 0; c->termline.d[0] = 0; }
}
static void mpwasm_write_ascii_file(MP mp, void *ff, const char *s) {
  mpwasm_ctx *c = (mpwasm_ctx *) mp_userdata(mp);
  c->orig_write(mp, ff, s);
  if (ff == mp->term_out && s) term_feed(c, s);
}

/* ---------------------------------------------------------------------- run */
int mpwasm_run(mpwasm_ctx *c, const char *commands) {
  MP_options *o;
  MP mp;
  mp_run_data *rd;
  mp_edge_object *e;
  char *s;
  int h;
  if (c->ran) { seterr(c, "mpwasm_run: one context runs one job (mp_execute terminates the job)"); return -1; }
  /* CONTRACT (docs/13 §3): mem_name == NULL dereferences NULL inside mplib. */
  if (!c->mem_name || !*c->mem_name) { seterr(c, "mem_name must be set, e.g. \"plain\""); return -1; }
  if (c->math_mode != mp_math_scaled_mode && c->math_mode != mp_math_double_mode &&
      c->math_mode != mp_math_decimal_mode) {
    seterr(c, "numbersystem: only scaled, double and decimal are built into mplib.wasm"); return -1;
  }
  c->ran = 1;
  o = mp_options();
  o->noninteractive = 1;                 /* CONTRACT: in-memory streams, our find_file */
  o->interaction = c->interaction;
  o->extensions = c->extensions;         /* CONTRACT: 1 routes btex to make_text */
  o->math_mode = c->math_mode;
  o->mem_name = xstrdup(c->mem_name);
  o->job_name = xstrdup(c->job_name ? c->job_name : "job");
  o->banner = c->banner ? xstrdup(c->banner) : NULL;
  o->random_seed = c->random_seed;
  o->halt_on_error = c->halt_on_error;
  o->ini_version = c->ini_version;
  o->troff_mode = c->troff_mode;
  o->print_found_names = c->print_found_names;
  o->file_line_error_style = c->file_line_error_style;
  o->error_line = c->error_line;
  o->half_error_line = c->half_error_line;
  o->max_print_line = c->max_print_line;
  o->userdata = c;
  o->find_file = mpwasm_find_file;
  o->make_text = mpwasm_make_text;
  o->run_script = mpwasm_run_script;
  o->run_make_mpx = mpwasm_run_make_mpx;
  o->run_editor = mpwasm_run_editor;
  c->opt = o;
  mp = mp_initialize(o);
  if (!mp) { seterr(c, "mp_initialize failed"); c->history = mp_system_error_stop; return c->history; }
  c->mp = mp;
  c->orig_write = mp->write_ascii_file;
  mp->write_ascii_file = mpwasm_write_ascii_file;
  rd = mp_rundata(mp);
  if (rd->term_out.used) { s = dup_stream(&rd->term_out); term_feed(c, s); free(s); }   /* the banner, printed by mp_initialize */
  /* CONTRACT (docs/04 §2b): exactly ONE line is read from this string. */
  s = xstrdup(commands);
  h = mp_execute(mp, s, strlen(s));
  free(s);
  term_flush(c);
  c->term_out = dup_stream(&rd->term_out);
  c->log_out = dup_stream(&rd->log_out);
  c->error_out = dup_stream(&rd->error_out);
  for (e = rd->edges; e != NULL; e = e->next) {
    if (c->nfigs == c->figcap) { c->figcap = c->figcap ? c->figcap * 2 : 16; c->figs = xrealloc(c->figs, c->figcap * sizeof *c->figs); }
    c->figs[c->nfigs++] = e;
  }
  c->history = h;
  return h;
}

/* ---------------------------------------------------------------- diagnostics */
int mpwasm_status(mpwasm_ctx *c) { return c->history; }
const char *mpwasm_term_out(mpwasm_ctx *c) { return c->term_out ? c->term_out : ""; }
const char *mpwasm_log_out(mpwasm_ctx *c) { return c->log_out ? c->log_out : ""; }
const char *mpwasm_error_out(mpwasm_ctx *c) { return c->error_out ? c->error_out : ""; }
const char *mpwasm_last_error(mpwasm_ctx *c) { return c->err; }
const char *mpwasm_opened_files_json(mpwasm_ctx *c) {
  if (!c->opened_count) return "[]";
  if (c->opened.d[c->opened.n - 1] != ']') mpwasm_sb_puts(&c->opened, "]");
  return c->opened.d;
}

/* ------------------------------------------------------------------ figures */
static mp_edge_object *fig(mpwasm_ctx *c, int i) { return (i >= 0 && i < c->nfigs) ? c->figs[i] : NULL; }
int mpwasm_figure_count(mpwasm_ctx *c) { return c->nfigs; }
int mpwasm_figure_charcode(mpwasm_ctx *c, int i) { mp_edge_object *e = fig(c, i); return e ? e->charcode : -1; }
double mpwasm_figure_dim(mpwasm_ctx *c, int i, int k) {
  mp_edge_object *e = fig(c, i);
  if (!e) return 0;
  switch (k) {
    case 0: return e->minx; case 1: return e->miny; case 2: return e->maxx; case 3: return e->maxy;
    case 4: return e->width; case 5: return e->height; case 6: return e->depth; case 7: return e->ital_corr;
    case 8: return e->prologues; case 9: return e->procset;   /* patch 0009: values at shipout time */
  }
  return 0;
}

/* CONTRACT (docs/04 §6.1): the backends write run_data.ship_out and opening
 * the next output FREES the previous stream. Copy immediately. */
const char *mpwasm_figure_svg(mpwasm_ctx *c, int i, int prologues) {
  mp_edge_object *e = fig(c, i);
  mp_run_data *rd;
  char *r;
  if (!e) { seterr(c, "no such figure"); return NULL; }
  if (prologues < 0) prologues = e->prologues;          /* the document's value at shipout */
  if (!mp_svg_ship_out(e, prologues)) { seterr(c, "SVG backend failed"); return NULL; }
  rd = mp_rundata(c->mp);
  /* The standalone entry point omits the XML declaration that the CLI's
   * shipout writes; add it so the output matches the native oracle. */
  r = xmalloc(rd->ship_out.used + 32);
  strcpy(r, "<?xml version=\"1.0\"?>\n");
  if (rd->ship_out.used) memcpy(r + strlen(r), rd->ship_out.data, rd->ship_out.used);
  r[strlen("<?xml version=\"1.0\"?>\n") + rd->ship_out.used] = 0;
  return ret(c, r);
}
const char *mpwasm_figure_ps(mpwasm_ctx *c, int i, int prologues, int procset) {
  mp_edge_object *e = fig(c, i);
  mp_run_data *rd;
  if (!e) { seterr(c, "no such figure"); return NULL; }
  if (prologues < 0) prologues = e->prologues;
  if (procset < 0) procset = e->procset;
  if (!mp_ps_ship_out(e, prologues, procset)) { seterr(c, "PostScript backend failed"); return NULL; }
  rd = mp_rundata(c->mp);
  return ret(c, dup_stream(&rd->ship_out));
}
const char *mpwasm_figure_json(mpwasm_ctx *c, int i) {
  mp_edge_object *e = fig(c, i);
  if (!e) { seterr(c, "no such figure"); return NULL; }
  return ret(c, mpwasm_figure_to_json(e));
}

/* ------------------------------------------------------------------- values */
double mpwasm_get_numeric(mpwasm_ctx *c, const char *expr) { return c->mp ? mp_get_numeric_value(c->mp, expr, strlen(expr)) : 0; }
int mpwasm_get_boolean(mpwasm_ctx *c, const char *expr) { return c->mp ? mp_get_boolean_value(c->mp, expr, strlen(expr)) : 0; }
const char *mpwasm_get_string(mpwasm_ctx *c, const char *expr) {
  char *s;
  if (!c->mp) return NULL;
  s = mp_get_string_value(c->mp, expr, strlen(expr));
  return s ? ret(c, s) : NULL;
}

/* --------------------------------------------------------------------- misc */
const char *mpwasm_version(void) { return metapost_version; }
#ifndef MPWASM_BUILD_ID
#define MPWASM_BUILD_ID "dev"
#endif
const char *mpwasm_build_id(void) { return MPWASM_BUILD_ID; }

/* Bytes currently allocated from the wasm heap (dlmalloc's uordblks). The leak
 * test and scripts/soak-memory.mjs compare it across runs: a long-lived engine
 * that creates one MetaPost instance per job must return to the same number.
 * 0 where mallinfo is unavailable (native builds use `leaks`/ASan instead). */
unsigned long mpwasm_heap_in_use(void) {
#ifdef __EMSCRIPTEN__
  struct mallinfo mi = mallinfo();
  return (unsigned long) mi.uordblks;
#else
  return 0;
#endif
}
