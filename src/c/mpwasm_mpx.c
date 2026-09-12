/* mpwasm_mpx.c — entry points for the mpx pipeline (docs/05 §3–§4):
 * mpto (btex extraction, via patch 0001) and dvitomp (DVI → .mpx). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mpxout.h"
#include "mpwasm_api.h"

static char **mpx_paths; static int n_mpx_paths, cap_mpx_paths;
static char mpx_err[256];

void mpwasm_mpx_add_path(const char *dir) {
  if (n_mpx_paths == cap_mpx_paths) { cap_mpx_paths = cap_mpx_paths ? cap_mpx_paths * 2 : 8; mpx_paths = xrealloc(mpx_paths, cap_mpx_paths * sizeof(char *)); }
  mpx_paths[n_mpx_paths++] = xstrdup(dir);
}
const char *mpwasm_mpx_last_error(void) { return mpx_err; }

static int exists(const char *p) { struct stat st; return stat(p, &st) == 0 && S_ISREG(st.st_mode); }
static int has_suffix(const char *s, const char *suf) { size_t a = strlen(s), b = strlen(suf); return a >= b && !strcmp(s + a - b, suf); }

/* dvitomp asks for TFM and VF files by bare name ("cmr10"). Pseudo file types
 * 100 + mpx_filetype are passed to the host hook so the JS side can lazily
 * fetch fonts from a bundle. */
static char *mpx_find(MPX mpx, const char *nam, const char *mode, int ftype) {
  const char *ext = ftype == mpx_tfm_format ? ".tfm" : ftype == mpx_vf_format ? ".vf" : NULL;
  int i;
  (void) mpx;
  if (mode[0] != 'r') return xstrdup(nam);
  if (exists(nam)) return xstrdup(nam);
  for (i = -1; i < n_mpx_paths; i++) {
    const char *dir = i < 0 ? NULL : mpx_paths[i];
    size_t l = (dir ? strlen(dir) + 1 : 0) + strlen(nam) + (ext ? strlen(ext) : 0) + 1;
    char *p = xmalloc(l);
    if (dir) snprintf(p, l, "%s/%s", dir, nam); else snprintf(p, l, "%s", nam);
    if (exists(p)) return p;
    if (ext && !has_suffix(nam, ext)) { strcat(p, ext); if (exists(p)) return p; }
    free(p);
  }
  return mpwasm_host_find_file(nam, 100 + ftype, mode);
}

int mpwasm_dvitomp(const char *dvi_path, const char *mpx_path, const char *banner) {
  mpx_options o;
  int r;
  memset(&o, 0, sizeof o);
  o.mode = mpx_tex_mode;
  o.mpname = (char *) dvi_path;
  o.mpxname = (char *) mpx_path;
  o.banner = (char *) (banner ? banner : "% Written by metapost-wasm");
  o.find_file = mpx_find;
  o.debug = 0;
  mpx_err[0] = 0;
  r = mpx_run_dvitomp(&o);
  if (r) snprintf(mpx_err, sizeof mpx_err, "dvitomp failed with status %d (see mpxerr.log)", r);
  return r;
}

int mpwasm_mpto(const char *mp_path, const char *tex_path, const char *mptexpre, int mode) {
  mpx_mpto_options o;
  int r;
  memset(&o, 0, sizeof o);
  o.mode = mode ? mpx_troff_mode : mpx_tex_mode;
  o.mpname = (char *) mp_path;
  o.texname = (char *) tex_path;
  o.mptexpre = (char *) mptexpre;
  o.debug = 0;
  mpx_err[0] = 0;
  r = mpx_run_mpto(&o);
  if (r) snprintf(mpx_err, sizeof mpx_err, "mpto failed with status %d", r);
  return r;
}
