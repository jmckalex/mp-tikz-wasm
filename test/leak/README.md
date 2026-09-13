# Leak harnesses (native, macOS `leaks`)

`leaktest.c` creates, runs and frees N MetaPost contexts through the shim
(`mpwasm_new` / `mpwasm_run` / `mpwasm_free`), the way the library does one
instance per run. Build and measure:

```sh
make native
cc -w -g -DMPWASM_NATIVE=1 -DMPWASM_NO_SPAWN=1 -Isrc/c/include -Isrc/c/include/stub \
   -Ibuild/gen -Ibuild/patched -Isrc/c -o build/leaktest test/leak/leaktest.c build/native/libmplib.a -lm
mkdir -p build/leakwork && cd build/leakwork && leaks --atExit -- ../leaktest 31 | grep "total leaked"
```

Before patch 0010: 319 KB per instance. After 0010/0011: about 1.2 KB. After
0012: 0 bytes, also for a `fontmaking:=1` job (docs/14 §11). `leaktest N circle`
runs a trivial job and `leaktest N path/to/file.mp` runs that file; `NOSVG=1`
skips the SVG conversion. Bisecting the MetaPost source this way is how the
last sites were found: MetaPost recycles nodes through free lists, so a
`leaks` stack names where a block was *first* allocated, not who lost it.
`make -B native CFLAGS="-g -fsanitize=address"` plus `-fsanitize=address` on
the link gives AddressSanitizer reports (double frees would show up there),
and `atos -o build/leaktest -l <load address> <frame addresses>` resolves
`leaks` stacks to `mp.w` lines. The wasm-side check is
`scripts/soak-memory.mjs`, which reads the allocator's bytes in use through
`mpwasm_heap_in_use`.

`pure-upstream.c` is the same loop through mplib's public API only, meant to
be linked against the unmodified `libmplibcore.a` from `vendor/native-build`
to measure upstream without the shim. It links, but `mp_initialize` returns
NULL in that harness (probably an option the shim sets and it does not), so
that independent measurement was not completed.
