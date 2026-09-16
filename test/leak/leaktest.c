/* leaktest.c — create, run and free N MetaPost contexts; run under `leaks --atExit`. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mpwasm_api.h"
char *mpwasm_host_find_file(const char *name, int ftype, const char *mode) { (void) name; (void) ftype; (void) mode; return NULL; }
char *mpwasm_host_make_text(const char *text, int len, int mode) { (void) text; (void) len; (void) mode; return NULL; }
char *mpwasm_host_run_script(const char *script, int len) { (void) script; (void) len; return NULL; }
void mpwasm_host_term_line(const char *line, int len) { (void) line; (void) len; }
int main(int argc, char **argv) {
  int n = argc > 1 ? atoi(argv[1]) : 20, i;
  { FILE *f = fopen("job.mp", "w"); if (!f) { perror("job.mp"); return 1; } }
  const char *texmf = "/usr/local/texlive/2025/texmf-dist";
  static char filebuf[65536];
  const char *src = argc > 2 && !strcmp(argv[2], "circle") ? "beginfig(1); draw fullcircle scaled 10; endfig;\nend."
    : argc > 2 && strchr(argv[2], '/') ? (filebuf[fread(filebuf, 1, sizeof filebuf - 1, fopen(argv[2], "r"))] = 0, filebuf)
    : "beginfig(1); numeric a, b, s; a := 12.5; b := 300; s := 52; pair v[]; numeric k; k := 0;\n"
      "for i = -1, 1: for j = -1, 1: for l = -1, 1: v[k] := (i*s, j*s); k := k + 1; endfor endfor endfor\n"
      "for e = 0 upto 7: for f = e + 1 upto 7: draw v[e] -- v[f] withpen pencircle scaled 1.1 withcolor (0.1, 0.3, 0.7); endfor endfor\n"
      "for i = 0 upto 7: fill fullcircle scaled 4.5 shifted v[i] withcolor (0.85, 0.25, 0.1); endfor\n"
      "endfig;\nend.";
  for (i = 0; i < n; i++) {
    char p[512];
    mpwasm_ctx *c = mpwasm_new();
    mpwasm_set_int(c, "math_mode", 0);
    mpwasm_set_str(c, "mem_name", "plain");
    snprintf(p, sizeof p, "%s/metapost/base", texmf); mpwasm_add_path(c, 2, p);
    snprintf(p, sizeof p, "%s/fonts/tfm/public/cm", texmf); mpwasm_add_path(c, 7, p);
    snprintf(p, sizeof p, "%s/fonts/type1/public/amsfonts/cm", texmf); mpwasm_add_path(c, 9, p);
    snprintf(p, sizeof p, "%s/fonts/map/dvips/cm", texmf); mpwasm_add_path(c, 8, p);
    mpwasm_add_path(c, 2, ".");
    { FILE *f = fopen("job.mp", "w"); fputs(src, f); fclose(f); }
    int h = mpwasm_run(c, "input job; end.");
    if (i == 0 && (h < 0 || h > 1)) fprintf(stderr, "term: %s\n", mpwasm_term_out(c));
    if (h < 0 || h > 1) { fprintf(stderr, "run %d: history %d: %s\n", i, h, mpwasm_last_error(c)); }
    if (getenv("NOSVG")) ; else if (i == 0) { const char *svg = mpwasm_figure_svg(c, 0, 3); fprintf(stderr, "svg %zu bytes, figures %d\n", svg ? strlen(svg) : 0, mpwasm_figure_count(c)); }
    else mpwasm_figure_svg(c, 0, 3);
    mpwasm_free(c);
  }
  return 0;
}
