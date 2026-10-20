/* nosystem.c — system() for tex.wasm and luatex.wasm: it never starts a process.
 * Emscripten's own system() does in Node (through child_process), and fails with
 * ENOSYS in a browser. TeX reaches it only from \write18 and LuaTeX's os.execute,
 * both refused first by shell_escape = f (bundles/texmf.cnf), so this changes no
 * output: it takes the call out of the module, so that nothing a document does
 * can spawn a process even if that check were bypassed (scripts/check-nosystem.sh
 * verifies the import is gone). Linked ahead of libc, it replaces libc's. */
#include <errno.h>
#include <stdlib.h>

int system(const char *command) {
  if (!command) return 0;   /* "is a command processor available?": no */
  errno = ENOSYS;
  return -1;
}
