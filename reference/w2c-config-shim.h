#ifndef W2C_CONFIG_H
#define W2C_CONFIG_H 1
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <float.h>
#include <math.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <dirent.h>
#include <time.h>
#include <errno.h>
typedef int integer;
typedef int64_t integer64;
#ifndef HAVE_BOOLEAN
#define HAVE_BOOLEAN 1
typedef int boolean;
#endif
#define HAVE_SYS_STAT_H 1
#define HAVE_UNISTD_H 1
#define HAVE_ACCESS 1
#define HAVE_MKSTEMP 1
#define HAVE_DIRENT_H 1
/* kpathsea lib.h replacements, provided by mpwasm_support.c */
extern void *xmalloc(size_t);
extern void *xrealloc(void *, size_t);
extern void *xcalloc(size_t, size_t);
extern char *xstrdup(const char *);
extern char *concatn(const char *, ...);
#define FATAL1(fmt,a) do { fprintf(stderr, fmt "\n", a); exit(1); } while (0)
#define FATAL(fmt) do { fprintf(stderr, fmt "\n"); exit(1); } while (0)
#endif
