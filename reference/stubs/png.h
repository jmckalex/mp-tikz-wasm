/* Stub <png.h> for mplib.wasm.
 *
 * mp.w #includes <png.h> solely so that mp_show_library_versions() can print
 * PNG_LIBPNG_VER_STRING and png_libpng_ver. The cairo/libpng PNG backend
 * (pngout.w) is NOT compiled into mplib.wasm, so nothing else is needed.
 * Put this directory on the include path AHEAD of any real libpng.
 */
#ifndef MPWASM_STUB_PNG_H
#define MPWASM_STUB_PNG_H
#define PNG_LIBPNG_VER_STRING "none"
static const char png_libpng_ver[] = "none";
#endif
