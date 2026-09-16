/* contract.c — the L0 contract harness (docs/09 §2).
 *
 * Builds NATIVELY against build/native/libmplib.a and asserts every CONTRACT
 * in docs/04 plus the mpx pipeline. No wasm in the loop. Run with
 * `make contract`; requires a TeX Live installation for plain.mp and fonts
 * (found via kpsewhich), and uses `latex` as an oracle for the mpx test when
 * available.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mplibps.h"
#include "mplibsvg.h"
#include "mpwasm_api.h"

static int tests = 0, failures = 0;
#define CHECK(cond, ...) do { tests++; if (cond) { printf("  ok   " __VA_ARGS__); printf("\n"); } \
  else { failures++; printf("  FAIL " __VA_ARGS__); printf("  [%s:%d]\n", __FILE__, __LINE__); } } while (0)

/* ---- host hooks (the wasm build gets these from JavaScript) -------------- */
static int host_find_calls = 0, make_text_calls = 0, run_script_calls = 0;
static char last_make_text[1024];
static int last_make_text_mode = -1;
static const char *make_text_reply = NULL;

char *mpwasm_host_find_file(const char *name, int ftype, const char *mode) {
  (void) name; (void) ftype; (void) mode;
  host_find_calls++;
  return NULL;
}
char *mpwasm_host_make_text(const char *text, int len, int mode) {
  make_text_calls++;
  snprintf(last_make_text, sizeof last_make_text, "%.*s", len, text);
  last_make_text_mode = mode;
  if (mode == 1) return xstrdup("");
  return make_text_reply ? xstrdup(make_text_reply) : NULL;
}
char *mpwasm_host_run_script(const char *script, int len) {
  (void) script; (void) len;
  run_script_calls++;
  return xstrdup("\"scripted\"");
}
/* the streamed terminal, one line per call, to compare with mpwasm_term_out */
static int term_lines = 0;
static char term_stream[65536];
static void term_stream_reset(void) { term_lines = 0; term_stream[0] = 0; }
void mpwasm_host_term_line(const char *line, int len) {
  size_t n = strlen(term_stream);
  term_lines++;
  if (n + (size_t) len + 2 < sizeof term_stream) { memcpy(term_stream + n, line, (size_t) len); term_stream[n + len] = '\n'; term_stream[n + len + 1] = 0; }
}

/* ---- helpers ------------------------------------------------------------ */
static char texmf[1024], texmfvar[1024];
static int kpse(const char *var, char *out, size_t n) {
  char cmd[256]; FILE *p; size_t l;
  snprintf(cmd, sizeof cmd, "kpsewhich -var-value %s 2>/dev/null", var);
  p = popen(cmd, "r"); if (!p) return 0;
  l = fread(out, 1, n - 1, p); pclose(p);
  out[l] = 0; while (l && (out[l-1] == '\n' || out[l-1] == '\r')) out[--l] = 0;
  return l > 0;
}
static void write_file(const char *path, const char *text) {
  FILE *f = fopen(path, "wb"); if (!f) { perror(path); exit(1); }
  fputs(text, f); fclose(f);
}
static char *read_file(const char *path) {
  FILE *f = fopen(path, "rb"); long n; char *s;
  if (!f) return NULL;
  fseek(f, 0, SEEK_END); n = ftell(f); fseek(f, 0, SEEK_SET);
  s = xmalloc(n + 1); if (fread(s, 1, n, f) != (size_t) n) { fclose(f); free(s); return NULL; }
  s[n] = 0; fclose(f); return s;
}
static mpwasm_ctx *new_ctx(void) {
  mpwasm_ctx *c = mpwasm_new();
  char p[1200];
  mpwasm_set_int(c, "math_mode", 0);
  mpwasm_set_int(c, "recorder", 1);
  snprintf(p, sizeof p, "%s/metapost/base", texmf); mpwasm_add_path(c, 2, p);
  snprintf(p, sizeof p, "%s/fonts/tfm/public/cm", texmf); mpwasm_add_path(c, 7, p);
  snprintf(p, sizeof p, "%s/fonts/type1/public/amsfonts/cm", texmf); mpwasm_add_path(c, 9, p);
  snprintf(p, sizeof p, "%s/fonts/map/dvips/updmap", texmfvar); mpwasm_add_path(c, 8, p);
  snprintf(p, sizeof p, "%s/fonts/map/dvips/cm", texmf); mpwasm_add_path(c, 8, p);
  return c;
}
static const char *strip_dates(const char *s) {
  /* remove %%CreationDate / "Created by ... on" lines for comparisons */
  static char buf[1 << 20]; size_t n = 0; const char *line = s;
  buf[0] = 0;
  while (*line) {
    const char *nl = strchr(line, '\n'); size_t len = nl ? (size_t)(nl - line + 1) : strlen(line);
    if (!(strncmp(line, "%%CreationDate", 14) == 0 || strncmp(line, "<!-- Created by", 15) == 0)) {
      if (n + len < sizeof buf) { memcpy(buf + n, line, len); n += len; buf[n] = 0; }
    }
    line += len;
  }
  return buf;
}

/* ---- the contracts -------------------------------------------------------- */
static void test_mem_name_null(void) {
  mpwasm_ctx *c = new_ctx();
  printf("[mem_name]\n");
  mpwasm_set_str(c, "mem_name", NULL);
  CHECK(mpwasm_run(c, "end.") == -1, "mem_name == NULL is rejected before it can segfault (docs/13 §3)");
  CHECK(strstr(mpwasm_last_error(c), "mem_name") != NULL, "...with a message naming mem_name");
  mpwasm_free(c);
}

static void test_one_line_contract(void) {
  mpwasm_ctx *c;
  int h;
  printf("[mp_execute reads ONE line]\n");
  c = new_ctx();
  h = mpwasm_run(c, "beginfig(1); draw fullcircle scaled 10; endfig;\nend.");
  CHECK(h == 3, "a two-line string aborts with history 3 (got %d)", h);
  CHECK(strstr(mpwasm_term_out(c), "no legal end found") != NULL, "...and says 'no legal end found'");
  mpwasm_free(c);

  write_file("job.mp", "% a multi-line MetaPost document with a comment\nprologues := 3;\nbeginfig(1);\n  draw fullcircle scaled 100;\n  label.top(\"MetaPost\", (0,50));\nendfig;\nbeginfig(2);\n  fill unitsquare scaled 40 withcolor (1,0,0);\nendfig;\nend.\n");
  c = new_ctx();
  term_stream_reset();
  h = mpwasm_run(c, "input job");
  CHECK(h == 0, "the same document via a VFS file + 'input job' is spotless (got %d)", h);
  CHECK(term_lines > 0 && strncmp(term_stream, "This is MetaPost", 16) == 0, "the terminal is streamed a line at a time as it is written, banner first (%d lines)", term_lines);
  { const char *t = mpwasm_term_out(c); size_t l = strlen(t);
    CHECK(l > 0 && (strcmp(term_stream, t) == 0 || (t[l - 1] != '\n' && strncmp(term_stream, t, l) == 0 && term_stream[l] == '\n' && term_stream[l + 1] == 0)),
          "...and the streamed lines are exactly mpwasm_term_out"); }
  CHECK(mpwasm_figure_count(c) == 2, "...and produces 2 figures (got %d)", mpwasm_figure_count(c));
  CHECK(mpwasm_figure_charcode(c, 0) == 1 && mpwasm_figure_charcode(c, 1) == 2, "...with charcodes 1 and 2");
  CHECK(mpwasm_run(c, "input job") == -1, "a second mpwasm_run on the same context is refused (one job per instance)");
  mpwasm_free(c);
}

static void test_find_file_and_recorder(void) {
  mpwasm_ctx *c = new_ctx();
  const char *rec;
  printf("[find_file]\n");
  write_file("job.mp", "beginfig(1); draw origin--(10,10); endfig; end.\n");
  mpwasm_run(c, "input job");
  rec = mpwasm_opened_files_json(c);
  CHECK(strstr(rec, "\"name\":\"plain.mp\"") != NULL, "find_file resolved the preload file plain.mp");
  CHECK(strstr(rec, "\"name\":\"job.mp\"") != NULL, "find_file resolved the input file job.mp");
  CHECK(strstr(rec, "\"name\":\"job.mpx\"") == NULL, "no .mpx lookup with extensions=1 and no btex");
  CHECK(host_find_calls > 0, "the host hook is consulted on misses (%d calls)", host_find_calls);
  mpwasm_free(c);
  c = new_ctx();
  write_file("job.mp", "input nonexistentfile; end.\n");
  CHECK(mpwasm_run(c, "input job") >= 3, "a missing input file is a fatal error in nonstop mode");
  mpwasm_free(c);
}

static void test_ship_out_drain_rule(void) {
  mpwasm_ctx *c = new_ctx();
  const char *s1, *s2, *s1b;
  char *copy1;
  printf("[ship_out drain rule]\n");
  write_file("job.mp", "beginfig(1); draw fullcircle scaled 10; endfig;\nbeginfig(2); fill unitsquare scaled 40; endfig; end.\n");
  mpwasm_run(c, "input job");
  s1 = mpwasm_figure_ps(c, 0, 0, 0); copy1 = xstrdup(s1);
  s2 = mpwasm_figure_ps(c, 1, 0, 0);
  CHECK(strstr(copy1, "%%BoundingBox: -6 -6 6 6") != NULL, "figure 1 EPS has its own bounding box");
  CHECK(strstr(s2, "%%BoundingBox: 0 0 40 40") != NULL, "figure 2 EPS has its own bounding box (stream reset per figure)");
  s1b = mpwasm_figure_ps(c, 0, 0, 0);
  CHECK(strcmp(copy1, s1b) == 0, "re-rendering figure 1 reproduces it byte for byte");
  free(copy1);
  mpwasm_free(c);
}

static void test_make_text(void) {
  mpwasm_ctx *c = new_ctx();
  int h;
  printf("[make_text / extensions=1]\n");
  make_text_calls = 0;
  make_text_reply = "image(draw unitsquare xscaled 20 yscaled 8;)";
  write_file("job.mp", "verbatimtex \\font\\x=cmr10 etex\nbeginfig(1); draw fullcircle scaled 100; label.top(btex $x^2$ etex,(0,50)); endfig; end.\n");
  h = mpwasm_run(c, "input job");
  CHECK(h == 0, "a document with verbatimtex + btex compiles (history %d)", h);
  CHECK(make_text_calls == 2, "make_text was called twice (verbatimtex, btex); got %d", make_text_calls);
  CHECK(last_make_text_mode == 0, "the btex call has mode 0 (verbatim flag off)");
  CHECK(strcmp(last_make_text, "$x^2$") == 0, "the btex body is whitespace-trimmed: '%s'", last_make_text);
  /* label.top: 50 + labeloffset 3 + 8 (box) + 0.5 (pen) = 61.5, as in docs/13 §2 */
  CHECK(mpwasm_figure_dim(c, 0, 3) > 61.0 && mpwasm_figure_dim(c, 0, 3) < 62.0,
        "the returned MetaPost source was parsed and placed (maxy=%g, expect 61.5)", mpwasm_figure_dim(c, 0, 3));
  mpwasm_free(c);

  /* miss → nullpicture */
  make_text_reply = NULL;
  c = new_ctx();
  h = mpwasm_run(c, "input job");
  CHECK(h == 0 && mpwasm_figure_dim(c, 0, 3) < 51.0, "a NULL reply becomes nullpicture and the run still succeeds");
  mpwasm_free(c);
}

static void test_run_script(void) {
  mpwasm_ctx *c = new_ctx();
  printf("[run_script]\n");
  run_script_calls = 0;
  write_file("job.mp", "string s; s := runscript \"anything\"; beginfig(1); label(s, origin); endfig; end.\n");
  mpwasm_run(c, "input job");
  CHECK(run_script_calls == 1, "runscript reaches the host hook");
  CHECK(strstr(mpwasm_figure_json(c, 0), "\"text\":\"scripted\"") != NULL, "...and its return value is injected as MetaPost source");
  mpwasm_free(c);
}

static void test_determinism(void) {
  mpwasm_ctx *a = new_ctx(), *b = new_ctx();
  char *sa, *sb;
  printf("[determinism]\n");
  write_file("job.mp", "beginfig(1); for i=1 upto 5: draw (uniformdeviate 100, normaldeviate*10); endfor; label(\"x\", (0,0)); endfig; end.\n");
  mpwasm_run(a, "year:=2026; month:=1; day:=1; time:=0; input job");
  mpwasm_run(b, "year:=2026; month:=1; day:=1; time:=0; input job");
  sa = xstrdup(mpwasm_figure_ps(a, 0, 0, 0)); sb = xstrdup(mpwasm_figure_ps(b, 0, 0, 0));
  CHECK(strcmp(sa, sb) == 0, "two runs with a fixed seed and frozen date are byte-identical (EPS)");
  CHECK(strstr(sa, "%%CreationDate: 2026.01.01:0000") != NULL, "the frozen date reaches %%CreationDate");
  free(sa); free(sb);
  sa = xstrdup(mpwasm_figure_svg(a, 0, 3)); sb = xstrdup(mpwasm_figure_svg(b, 0, 3));
  CHECK(strcmp(sa, sb) == 0, "...and byte-identical (SVG)");
  CHECK(strncmp(sa, "<?xml version=\"1.0\"?>\n<!-- Created by MetaPost", 45) == 0, "SVG starts with the XML declaration like the CLI output");
  free(sa); free(sb);
  mpwasm_free(a); mpwasm_free(b);
}

static void test_json_backend(void) {
  mpwasm_ctx *c = new_ctx();
  const char *j;
  printf("[JSON backend]\n");
  write_file("job.mp", "beginfig(1); fill fullcircle scaled 10 withcolor (0,1,0); draw (0,0)--(10,0) withpen pencircle scaled 2 dashed evenly; label(\"ab\", (5,5)); clip currentpicture to unitsquare scaled 20; setbounds currentpicture to unitsquare scaled 30; special \"%hello\"; endfig; end.\n");
  mpwasm_run(c, "input job");
  j = mpwasm_figure_json(c, 0);
  CHECK(j != NULL && strstr(j, "\"type\":\"fill\"") && strstr(j, "\"model\":\"rgb\",\"values\":[0,1,0]"), "fill object with rgb colour");
  CHECK(strstr(j, "\"type\":\"stroke\"") && strstr(j, "\"dash\":{\"offset\":") , "stroke object with dash pattern");
  CHECK(strstr(j, "\"type\":\"text\",\"text\":\"ab\",\"font\":\"cmr10\"") != NULL, "text object with font name");
  CHECK(strstr(j, "\"type\":\"startClip\"") && strstr(j, "\"type\":\"stopClip\""), "clip objects");
  CHECK(strstr(j, "\"type\":\"startBounds\"") && strstr(j, "\"type\":\"stopBounds\""), "bounds objects");
  CHECK(strstr(j, "\"type\":\"special\",\"script\":\"%hello\"") != NULL, "special object");
  CHECK(strstr(j, "\"closed\":true") != NULL, "closed paths are detected (fullcircle)");
  mpwasm_free(c);
}

static char *plain_find_file(MP mp, const char *fname, const char *fmode, int ftype) {
  (void) mp; (void) fmode; (void) ftype;
  return xstrdup(fname);   /* absolute names only */
}
static void test_mplib_execute_terminates(void) {
  /* Directly against mplib: mp_execute ends the job; a second call is a no-op */
  MP_options *o = mp_options(); MP mp; int h1, h2; char s1[] = "beginfig(1); draw origin; endfig;";
  char p[1200];
  printf("[mplib: mp_execute is one job]\n");
  /* note: mem_name is given WITHOUT ".mp": mp_open_mem_name appends it (and its
     suffix test is off by one, so "plain.mp" would become "plain.mp.mp") */
  snprintf(p, sizeof p, "%s/metapost/base/plain", texmf);
  o->noninteractive = 1; o->interaction = mp_nonstop_mode; o->extensions = 1;
  o->mem_name = xstrdup(p); o->job_name = xstrdup("t"); o->ini_version = 0;
  o->math_mode = mp_math_scaled_mode;
  o->find_file = plain_find_file;
  mp = mp_initialize(o);
  CHECK(mp != NULL, "mp_initialize succeeds with an absolute mem_name and a trivial find_file");
  if (!mp) { free(o->mem_name); free(o->job_name); free(o); return; }
  h1 = mp_execute(mp, s1, strlen(s1));
  CHECK(mp_finished(mp), "mp_finished() is true after one mp_execute (the job ended)");
  h2 = mp_execute(mp, s1, strlen(s1));
  CHECK(h1 == h2, "a second mp_execute returns the stored history (%d)", h2);
  mp_finish(mp);
  free(o->mem_name); free(o->job_name); free(o);
}

static void test_prologues3_glyphs(void) {
  mpwasm_ctx *c = new_ctx();
  const char *svg;
  printf("[prologues:=3 glyph outlines]\n");
  write_file("job.mp", "prologues:=3; beginfig(1); draw fullcircle scaled 100; label.top(\"MetaPost\",(0,50)); endfig; end.\n");
  mpwasm_run(c, "input job");
  svg = mpwasm_figure_svg(c, 0, 3);
  CHECK(svg && strstr(svg, "id=\"GLYPHcmr10_77\"") != NULL, "SVG contains a Type 1 outline for 'M' (no TeX involved)");
  CHECK(strstr(svg, "<use xlink:href=\"#GLYPHcmr10_77\">") != NULL, "...referenced by <use>");
  svg = mpwasm_figure_svg(c, 0, 0);
  CHECK(svg && strstr(svg, "<text") != NULL && strstr(svg, "GLYPH") == NULL, "prologues 0 emits raw <text> (the unusable form, docs/07 §3)");
  mpwasm_free(c);
}

static void test_mpx_pipeline(void) {
  int r; char *tex, *mpx, *ref;
  printf("[mpx pipeline: mpto + dvitomp]\n");
  r = mpwasm_mpto("../../../reference/mpx-samples/latex-math.mp", "latex-math.tex", NULL, 0);
  CHECK(r == 0, "mpto extracts btex blocks from the reference sample (status %d)", r);
  tex = read_file("latex-math.tex");
  CHECK(tex && strstr(tex, "\\gdef\\mpxshipout{\\shipout\\hbox\\bgroup") != NULL, "the generated .tex has the \\mpxshipout prologue");
  CHECK(tex && strstr(tex, "\\end{document}") != NULL, "...and ends with \\end{document}");
  if (system("latex -interaction=batchmode latex-math.tex >/dev/null 2>&1") == 0) {
    char p[1200];
    snprintf(p, sizeof p, "%s/fonts/tfm/public/cm", texmf); mpwasm_mpx_add_path(p);
    snprintf(p, sizeof p, "%s/fonts/tfm/public/amsfonts/cmextra", texmf); mpwasm_mpx_add_path(p);
    r = mpwasm_dvitomp("latex-math.dvi", "latex-math.mpx", "% Written by metapost version 2.11");
    CHECK(r == 0, "dvitomp converts the oracle's DVI (status %d)", r);
    mpx = read_file("latex-math.mpx");
    ref = read_file("../../../reference/mpx-samples/latex-math.mpx");
    CHECK(mpx && ref && strcmp(mpx, ref) == 0, "the .mpx is byte-identical to the committed oracle sample%s",
          !mpx ? " (latex-math.mpx was not written)" : !ref ? " (reference/mpx-samples/latex-math.mpx is missing)" : "");
    if (mpx && ref && strcmp(mpx, ref) != 0) { printf("---- ours ----\n%s\n---- ref ----\n%s\n", mpx, ref); }
    free(mpx); free(ref);
  } else {
    printf("  skip latex oracle not available; dvitomp round-trip not checked\n");
  }
  free(tex);
}

int main(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  if (!kpse("TEXMFDIST", texmf, sizeof texmf)) { fprintf(stderr, "kpsewhich not found; a TeX Live installation is required\n"); return 2; }
  kpse("TEXMFVAR", texmfvar, sizeof texmfvar);
  /* the system-wide var tree holds updmap's psfonts.map */
  { char sysvar[1024]; if (kpse("TEXMFSYSVAR", sysvar, sizeof sysvar)) strcpy(texmfvar, sysvar); }
  printf("MetaPost %s contract harness; texmf=%s\n", mpwasm_version(), texmf);
  mkdir("_work", 0777); if (chdir("_work") != 0) { perror("chdir"); return 2; }
  test_mem_name_null();
  test_one_line_contract();
  test_find_file_and_recorder();
  test_ship_out_drain_rule();
  test_make_text();
  test_run_script();
  test_determinism();
  test_json_backend();
  test_mplib_execute_terminates();
  test_prologues3_glyphs();
  test_mpx_pipeline();
  printf("\n%d checks, %d failures\n", tests, failures);
  return failures ? 1 : 0;
}
