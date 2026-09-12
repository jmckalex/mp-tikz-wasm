/* Stub <zlib.h> for mplib.wasm.
 *
 * mp.w #includes <zlib.h> solely for ZLIB_VERSION and zlibVersion() inside
 * mp_show_library_versions(). MetaPost itself never compresses anything.
 */
#ifndef MPWASM_STUB_ZLIB_H
#define MPWASM_STUB_ZLIB_H
#define ZLIB_VERSION "none"
static const char *zlibVersion(void) { return "none"; }
#endif
