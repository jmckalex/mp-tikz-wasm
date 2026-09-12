/* ffi-stub.c — LuaTeX registers the luaffi library (a C FFI that generates
 * machine code at run time) unconditionally. WebAssembly cannot execute
 * generated code, so `require("ffi")` yields an empty table here instead. */
#include "lua.h"
#include "lauxlib.h"
int luaopen_ffi(lua_State *L) { lua_newtable(L); return 1; }
