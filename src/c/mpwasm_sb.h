/* mpwasm_sb.h — a tiny growable string buffer shared by the shim files. */
#ifndef MPWASM_SB_H
#define MPWASM_SB_H 1
#include <stdlib.h>
#include <string.h>
#include <w2c/config.h>
typedef struct mpwasm_sb { char *d; size_t n, cap; } mpwasm_sb;
static inline void mpwasm_sb_grow(mpwasm_sb *b, size_t extra) {
  if (b->n + extra + 1 > b->cap) {
    size_t nc = b->cap ? b->cap : 1024;
    while (nc < b->n + extra + 1) nc *= 2;
    b->d = (char *) xrealloc(b->d, nc);
    b->cap = nc;
  }
}
static inline void mpwasm_sb_put(mpwasm_sb *b, const char *s, size_t l) {
  mpwasm_sb_grow(b, l); memcpy(b->d + b->n, s, l); b->n += l; b->d[b->n] = 0;
}
static inline void mpwasm_sb_puts(mpwasm_sb *b, const char *s) { mpwasm_sb_put(b, s, strlen(s)); }
static inline void mpwasm_sb_json_str(mpwasm_sb *b, const char *s) {
  char tmp[8];
  mpwasm_sb_puts(b, "\"");
  for (; *s; s++) {
    unsigned char ch = (unsigned char) *s;
    if (ch == '"') mpwasm_sb_puts(b, "\\\"");
    else if (ch == '\\') mpwasm_sb_puts(b, "\\\\");
    else if (ch == '\n') mpwasm_sb_puts(b, "\\n");
    else if (ch < 0x20) { snprintf(tmp, sizeof tmp, "\\u%04x", ch); mpwasm_sb_puts(b, tmp); }
    else mpwasm_sb_put(b, (const char *) &ch, 1);
  }
  mpwasm_sb_puts(b, "\"");
}
static inline void mpwasm_sb_free(mpwasm_sb *b) { free(b->d); b->d = NULL; b->n = b->cap = 0; }
#endif
