/* ---------------------------------------------------------------------------
 * host_shim_reference.c  --  VERIFIED reference embedding of mplib.
 *
 * This file was compiled and executed successfully against MetaPost 3.00-dev
 * (TeX Live master, texk/web2c/mplibdir) during the scoping of this project.
 * It is not the production shim -- it is the smallest program that proves the
 * whole embedding contract, and every comment marked CONTRACT records a
 * behaviour that was established empirically, not guessed.
 *
 * Build (native, for contract testing):
 *   ctangle mp.w && ctangle psout.w && ctangle svgout.w && ctangle mpmath.w \
 *     && ctangle mpmathdouble.w && ctangle mpmathdecimal.w && ctangle mpstrings.w \
 *     && ctangle tfmin.w
 *   cc -O1 -w -I. -Iw2c-shim -o host_test host_shim_reference.c \
 *      mp.c psout.c svgout.c mpmath.c mpmathdouble.c mpmathdecimal.c \
 *      mpstrings.c tfmin.c avl.c decNumber.c decContext.c -lm
 *
 * Run -- note the driver pattern. mp_execute() reads exactly ONE line from its
 * string argument (see docs/04 section 2b), so a real document goes in a file:
 *
 *   printf 'prologues:=3;\nbeginfig(1);\n draw fullcircle scaled 100;\n'\
 *          ' label.top("MetaPost",(0,50));\nendfig;\nend.\n' > job.mp
 *   ./host_test 'input job'
 *
 * A single-line program can still be passed directly:
 *   ./host_test 'beginfig(1); draw fullcircle scaled 100; endfig; end.'
 * ------------------------------------------------------------------------- */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mplibps.h"
#include "mplibsvg.h"

/* mp.w declares these extern for mp_show_library_versions(); none of the
   optional libraries are linked into the WASM build. */
const char *COMPILED_CAIRO_VERSION_STRING="none";
const char *COMPILED_PIXMAN_VERSION_STRING="none";
const char *COMPILED_MPFR_VERSION_STRING="none";
const char *COMPILED_MPFI_VERSION_STRING="none";
const char *const COMPILED_gmp_version="none";
int COMPILED__GNU_MP_VERSION=0, COMPILED__GNU_MP_VERSION_MINOR=0, COMPILED__GNU_MP_VERSION_PATCHLEVEL=0;
const char *cairo_version_string(void){return "none";}
const char *pixman_version_string(void){return "none";}
const char *mpfr_get_version(void){return "none";}
const char *mpfi_get_version(void){return "none";}

/* ---- kpathsea lib.h replacements ---- */
void *xmalloc(size_t n){void*p=malloc(n?n:1); if(!p){fputs("oom\n",stderr);exit(1);} return p;}
void *xrealloc(void*o,size_t n){void*p=realloc(o,n?n:1); if(!p){fputs("oom\n",stderr);exit(1);} return p;}
void *xcalloc(size_t n,size_t m){void*p=calloc(n?n:1,m?m:1); if(!p){fputs("oom\n",stderr);exit(1);} return p;}
char *xstrdup(const char*s){char*p=xmalloc(strlen(s)+1); strcpy(p,s); return p;}
char *concatn(const char *s, ...){
  va_list ap; size_t len= s?strlen(s):0; char *r=xmalloc(len+1); const char *q;
  if(s) strcpy(r,s); else r[0]=0;
  va_start(ap,s);
  while((q=va_arg(ap,const char*))!=NULL){ r=xrealloc(r,len+strlen(q)+1); strcpy(r+len,q); len+=strlen(q);}
  va_end(ap); return r;
}

/* ---- search path: bundle root ---- */
static const char *roots[] = {
  ".",
  "/usr/local/texlive/2025/texmf-dist/metapost/base",
  "/usr/local/texlive/2025/texmf-dist/fonts/tfm/public/cm",
  "/usr/local/texlive/2025/texmf-dist/fonts/type1/public/amsfonts/cm",
  "/usr/local/texlive/2025/texmf-var/fonts/map/dvips/updmap",
  "/usr/local/texlive/2025/texmf-dist/fonts/map/dvips/cm",
  NULL
};
static char *host_find_file(MP mp, const char *fname, const char *fmode, int ftype){
  (void)mp;
  if (fmode[0] != 'r') return xstrdup(fname);
  char buf[2048];
  { FILE *f=fopen(fname,"r"); if(f){fclose(f); return xstrdup(fname);} }
  for (int i=0; roots[i]; i++){
    snprintf(buf,sizeof buf,"%s/%s",roots[i],fname);
    FILE *f=fopen(buf,"r"); if(f){fclose(f); fprintf(stderr,"[find %d] %s -> %s\n",ftype,fname,buf); return xstrdup(buf);}
  }
  fprintf(stderr,"[find %d] %s -> NOT FOUND\n",ftype,fname);
  return NULL;
}
static void *host_open_file(MP mp,const char*fname,const char*fmode,int ftype){
  (void)mp;
  if (ftype == mp_filetype_terminal) return (fmode[0]=='r' ? stdin : stdout);
  if (ftype == mp_filetype_error)    return stderr;
  char m[3]; m[0]=fmode[0]; m[1]='b'; m[2]=0;
  return fname ? (void*)fopen(fname,m) : NULL;
}
/* Contract: return a freshly malloc'd NUL-terminated line; mplib frees it. */
static char *host_read_ascii(MP mp,void*ff,size_t*size){
  (void)mp; FILE*f=ff; int c; size_t len=0, lim=128; char *s;
  *size=0; if(!f) return NULL;
  c=fgetc(f); if(c==EOF) return NULL;
  s=malloc(lim); if(!s) return NULL;
  while(c!=EOF && c!='\n' && c!='\r'){
    if(len+1==lim){ s=realloc(s, lim+(lim>>2)); lim += (lim>>2); }
    s[len++]=(char)c; c=fgetc(f);
  }
  if(c=='\r'){ c=fgetc(f); if(c!=EOF && c!='\n') ungetc(c,f); }
  s[len]=0; *size=len; return s;
}
/* Contract: caller supplies the buffer in *data with capacity *size;
   set *size to the number of bytes actually read. */
static void host_read_binary(MP mp,void*ff,void**data,size_t*size){
  (void)mp; size_t len=0; if(ff) len=fread(*data,1,*size,(FILE*)ff); *size=len;
}
static void host_close(MP mp,void*f){(void)mp; if(f && f!=stdin && f!=stdout && f!=stderr) fclose((FILE*)f);}
static int  host_eof(MP mp,void*f){(void)mp; return f?feof((FILE*)f):1;}
static void host_flush(MP mp,void*f){(void)mp; if(f) fflush((FILE*)f);}
static void host_write_ascii(MP mp,void*f,const char*s){(void)mp; if(f) fputs(s,(FILE*)f);}
static void host_write_binary(MP mp,void*f,void*d,size_t n){(void)mp; if(f) fwrite(d,n,1,(FILE*)f);}

/* ---- btex hook: extensions route ---- */
static char *host_make_text(MP mp,const char*str,size_t len,int mode){
  (void)mp;
  fprintf(stderr,"[make_text mode=%d] <<%.*s>>\n",mode,(int)len,str);
  /* Return MetaPost source: a placeholder box so we can see it round-trip. */
  const char *tmpl = "image(draw unitsquare xscaled %d yscaled 8;)";
  char *r = xmalloc(256);
  snprintf(r,256,tmpl,(int)len*4);
  return r;
}
static char *host_run_script(MP mp,const char*str,size_t len){
  (void)mp; fprintf(stderr,"[runscript] <<%.*s>>\n",(int)len,str);
  return xstrdup("\"scripted\"");
}

int main(int argc,char**argv){
  MP_options *opt = mp_options();
  opt->command_line = NULL;
  opt->noninteractive = 1;
  opt->interaction = mp_nonstop_mode;
  opt->math_mode = mp_math_double_mode;
  opt->extensions = 1;
  opt->job_name = xstrdup("wasmtest");
  opt->mem_name = xstrdup("plain");   /* REQUIRED: preload file, else NULL deref */
  opt->find_file = host_find_file;
  opt->open_file = host_open_file;
  opt->read_ascii_file = host_read_ascii;
  opt->read_binary_file = host_read_binary;
  opt->close_file = host_close;
  opt->eof_file = host_eof;
  opt->flush_file = host_flush;
  opt->write_ascii_file = host_write_ascii;
  opt->write_binary_file = host_write_binary;
  opt->make_text = host_make_text;
  opt->run_script = host_run_script;
  opt->ini_version = 0;
  opt->print_found_names = 1;  /* REQUIRED for find_file to be consulted */
  MP mp = mp_initialize(opt);
  if(!mp){fputs("init failed\n",stderr);return 1;}
  /* CONTRACT: whatever is passed here is read as a SINGLE line. Real drivers
     write the document to the VFS and pass "input <jobname>". */
  char *src = argv[1] ? argv[1] :
    "outputformat:=\"svg\"; prologues:=3;"
    "beginfig(1); draw fullcircle scaled 100 withcolor red;"
    "label.top(btex Hello etex,(0,50)); endfig; end.";
  int st = mp_execute(mp, src, strlen(src));
  mp_run_data *rd = mp_rundata(mp);
  printf("=== status=%d ===\n", st);
  printf("--- term_out (%zu) ---\n%.*s\n", rd->term_out.used, (int)rd->term_out.used, rd->term_out.data?rd->term_out.data:"");
  printf("--- ship_out (%zu) ---\n%.*s\n", rd->ship_out.used, (int)rd->ship_out.used, rd->ship_out.data?rd->ship_out.data:"");
  printf("--- edges: %s ---\n", rd->edges ? "present" : "none");
  if (rd->edges) { mp_edge_object *e = rd->edges; int n=0;
     while(e){ printf("  fig charcode=%d bbox=(%g,%g)-(%g,%g)\n", e->charcode,e->minx,e->miny,e->maxx,e->maxy); e=e->next; n++; }
     printf("  count=%d\n",n);
     /* render the collected edges through the SVG backend */
     e = rd->edges;
     while (e) { mp_svg_ship_out(e, 3); e = e->next; }
     printf("--- ship_out after svg (%zu) ---\n%.*s\n", rd->ship_out.used,
            (int)rd->ship_out.used, rd->ship_out.data?rd->ship_out.data:""); }
  mp_finish(mp);
  return 0;
}

/* MPFR/MPFI-backed math modes are not built in this configuration. */
void *mp_initialize_binary_math(MP mp){(void)mp; return NULL;}
void *mp_initialize_interval_math(MP mp){(void)mp; return NULL;}
/* Cairo/libpng PNG backend is not built in this configuration. */
void mp_png_backend_initialize(MP mp){(void)mp;}
void mp_png_backend_free(MP mp){(void)mp;}
int mp_png_gr_ship_out(void *hh,const char *opts,int stand){(void)hh;(void)opts;(void)stand;return 1;}
