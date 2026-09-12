/* pdftoepdf-stub.c — replaces pdftoepdf.cc (xpdf-based PDF image inclusion)
 * in tex.wasm. Patch 0002 in docs/02 §5.2, option 2: tex.wasm runs pdfTeX in
 * DVI mode only, where \pdfximage of a PDF file can never be reached. If it
 * is, fail with a clear message instead of silently producing garbage. */
#include <w2c/config.h>
#include <stdio.h>
#include <stdlib.h>
#include "pdftexdir/ptexlib.h"

/* the epdf_* globals are defined in writeimg.c */

int read_pdf_info(char *image_name, char *page_name, int page_num, int pagebox,
                  int minor_pdf_version_wanted, int major_pdf_version_wanted,
                  int pdf_inclusion_errorlevel) {
  (void) page_name; (void) page_num; (void) pagebox; (void) minor_pdf_version_wanted;
  (void) major_pdf_version_wanted; (void) pdf_inclusion_errorlevel;
  pdftex_fail("PDF image inclusion (%s) is not available in tex.wasm (DVI mode only)", image_name);
  return 0;
}
void write_epdf(void) { pdftex_fail("PDF image inclusion is not available in tex.wasm"); }
void epdf_delete(void) { }
void epdf_check_mem(void) { }
