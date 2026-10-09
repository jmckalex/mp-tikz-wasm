// gs-bridge.js — the Emscripten JS-library half of gs-bridge.c. The host puts
// a bridge to a separate Ghostscript module on Module.gsBridge
// (src/ts/ghostscript.ts): available(), revision() -> [revision, date],
// newInstance() -> code, init(args) -> code, run(op, bytes, userErrors) ->
// [code, exitCode], exit() -> code, deleteInstance(), take(stream, max) ->
// Uint8Array of collected stdout (1) or stderr (2), or null. Without a bridge,
// mpw_gs_available() says no and dvisvgm never calls the rest.
addToLibrary({
  mpw_gs_available: function () {
    var b = Module['gsBridge'];
    return b && b.available() ? 1 : 0;
  },
  mpw_gs_revision: function (revisionPtr, datePtr) {
    var r = Module['gsBridge'].revision();
    HEAP32[revisionPtr >> 2] = r[0];
    HEAP32[datePtr >> 2] = r[1];
    return 0;
  },
  mpw_gs_new_instance: function () {
    return Module['gsBridge'].newInstance();
  },
  mpw_gs_init__deps: ['$UTF8ToString'],
  mpw_gs_init: function (argc, argv) {
    var args = [];
    for (var i = 0; i < argc; i++) args.push(UTF8ToString(HEAPU32[(argv >> 2) + i]));
    return Module['gsBridge'].init(args);
  },
  mpw_gs_run: function (op, str, length, userErrors, pexit) {
    var r = Module['gsBridge'].run(op, op === 1 ? HEAPU8.subarray(str, str + length) : null, userErrors);
    if (pexit) HEAP32[pexit >> 2] = r[1];
    return r[0];
  },
  mpw_gs_exit: function () {
    return Module['gsBridge'].exit();
  },
  mpw_gs_delete_instance: function () {
    Module['gsBridge'].deleteInstance();
  },
  mpw_gs_take: function (stream, buf, cap) {
    var d = Module['gsBridge'].take(stream, cap);
    if (!d || !d.length) return 0;
    HEAPU8.set(d, buf);
    return d.length;
  }
});
