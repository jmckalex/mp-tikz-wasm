#!/usr/bin/env bash
# check-nosystem.sh FILE.wasm... — fail if a wasm module imports any
# process-spawning function (docs/02 §5.3, docs/10 §3). A module can only start
# a process through its JavaScript glue, so its imports are what counts; they
# are read with Node's WebAssembly.Module.imports, which needs no other tool.
# Emscripten imports system() as _emscripten_system (which spawns through
# child_process in Node), so names may carry leading underscores.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: check-nosystem.sh FILE.wasm..." >&2; exit 2; }
node - "$@" <<'JS'
const fs = require('fs');
const BAD = /^_*(system|emscripten_system|popen|execvp|execve|execv|execl|fork|vfork|posix_spawn)$/;
let failed = 0;
for (const file of process.argv.slice(2)) {
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(fs.readFileSync(file)));
  const bad = imports.filter((i) => i.kind === 'function' && BAD.test(i.name)).map((i) => `${i.module}.${i.name}`);
  if (bad.length) { console.error(`error: ${file} imports ${bad.join(', ')}`); failed++; }
  else console.log(`ok: no process-spawning imports in ${file} (${imports.length} imports)`);
}
process.exit(failed ? 1 : 0);
JS
