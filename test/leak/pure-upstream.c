/* pure.c — N MetaPost instances through the public mplib API only (mp_options,
 * mp_initialize, mp_execute, mp_finish), linked against the UNMODIFIED
 * libmplibcore/libmputil from the TeX Live native build. No shim code. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <w2c/config.h>
#include "mplib.h"
static char *find_file(MP mp, const char *fname, const char *mode, int ftype) {
  char buf[512]; (void) mp; (void) ftype;
  if (mode[0] != 'r') return strdup(fname);
  if (!strcmp(fname, "plain.mp") || !strcmp(fname, "plain")) { snprintf(buf, sizeof buf, "/usr/local/texlive/2025/texmf-dist/metapost/base/plain.mp"); return strdup(buf); }
  if (!strcmp(fname, "job.mp") || !strcmp(fname, "job")) return strdup("job.mp");
  return NULL;
}
int main(int argc, char **argv) {
  int n = argc > 1 ? atoi(argv[1]) : 10, i;
  { FILE *f = fopen("job.mp", "w"); fputs("beginfig(1); draw fullcircle scaled 10; endfig;\nend.\n", f); fclose(f); }
  for (i = 0; i < n; i++) {
    MP_options *opt = mp_options();
    opt->noninteractive = 1; opt->mem_name = strdup("plain"); opt->job_name = strdup("job"); opt->find_file = find_file; opt->ini_version = 0;
    MP mp = mp_initialize(opt);
    if (!mp) { fprintf(stderr, "mp_initialize failed\n"); return 1; }
    int h = mp_execute(mp, "input job; end.", 15);
    if (i == 0) fprintf(stderr, "history %d, figures %s\n", h, mp_rundata(mp)->edges ? "yes" : "no");
    mp_finish(mp);
    free(opt->mem_name); free(opt->job_name); free(opt);
  }
  return 0;
}
