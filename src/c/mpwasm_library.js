// mpwasm_library.js — Emscripten JS-library implementations of the host hooks
// declared in mpwasm_api.h. The TypeScript side installs functions on
// Module.mpwasmHooks = { findFile(name, ftype, mode), makeText(text, mode),
// runScript(script) }. Each returns a string, or null/undefined for "not
// handled". Returned strings are malloc()ed here and freed by the C side.
addToLibrary({
  mpwasm_host_find_file__deps: ['$stringToNewUTF8', '$UTF8ToString'],
  mpwasm_host_find_file: function (namePtr, ftype, modePtr) {
    var hooks = Module['mpwasmHooks'];
    if (!hooks || !hooks.findFile) return 0;
    var r = hooks.findFile(UTF8ToString(namePtr), ftype, UTF8ToString(modePtr));
    return (r === undefined || r === null) ? 0 : stringToNewUTF8(r);
  },
  mpwasm_host_make_text__deps: ['$stringToNewUTF8', '$UTF8ToString'],
  mpwasm_host_make_text: function (textPtr, len, mode) {
    var hooks = Module['mpwasmHooks'];
    if (!hooks || !hooks.makeText) return 0;
    var r = hooks.makeText(UTF8ToString(textPtr, len), mode);
    return (r === undefined || r === null) ? 0 : stringToNewUTF8(r);
  },
  mpwasm_host_run_script__deps: ['$stringToNewUTF8', '$UTF8ToString'],
  mpwasm_host_run_script: function (scriptPtr, len) {
    var hooks = Module['mpwasmHooks'];
    if (!hooks || !hooks.runScript) return 0;
    var r = hooks.runScript(UTF8ToString(scriptPtr, len));
    return (r === undefined || r === null) ? 0 : stringToNewUTF8(r);
  }
});
