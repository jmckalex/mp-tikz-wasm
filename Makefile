# MetaPost-WASM top-level Makefile.
#
#   make tangle     tangle the vendored CWEB into build/gen (after applying patches)
#   make native     build build/native/libmplib.a with the host compiler
#   make contract   build and run the L0 contract harness (test/contract)
#   make wasm       build dist/mplib.mjs + dist/mplib.wasm with emcc
#   make wasm-debug debug variant (dist/mplib-debug.*)
#   make check-nosystem  assert the wasm build links no system()/popen()/exec
#
# Requires: a C compiler, emcc on PATH (or EMSDK set), and vendor/texlive-source
# (run scripts/extract-vendor.sh).

MAKEFLAGS += --no-builtin-rules
.SUFFIXES:
REPO      := $(abspath .)
VENDOR    := $(REPO)/vendor/texlive-source
MPLIBDIR  := $(VENDOR)/texk/web2c/mplibdir
CWEBDIR   := $(VENDOR)/texk/web2c/cwebdir
BUILD     := $(REPO)/build
GEN       := $(BUILD)/gen
PATCHED   := $(BUILD)/patched
NATIVE    := $(BUILD)/native
TOOLS     := $(BUILD)/native-tools
DIST      := $(REPO)/dist
SRC_C     := $(REPO)/src/c

CTANGLE_BIN := $(TOOLS)/ctangle

# CWEB modules that make up mplib, in link order.
WEBS      := mp psout svgout tfmin mpxout mpmath mpmathdouble mpmathdecimal mpstrings
CSRCS     := avl decNumber decContext
GEN_C     := $(addprefix $(GEN)/,$(addsuffix .c,$(WEBS)))
GEN_H     := $(GEN)/mplib.h $(GEN)/mplibps.h $(GEN)/mplibsvg.h $(GEN)/mpxout.h
VEND_C    := $(addprefix $(PATCHED)/,$(addsuffix .c,$(CSRCS)))

SHIM_C    := $(SRC_C)/mpwasm_host.c $(SRC_C)/mpwasm_api.c $(SRC_C)/mpwasm_figure.c $(SRC_C)/mpwasm_mpx.c
ALL_C     := $(GEN_C) $(VEND_C) $(SHIM_C)

CPPFLAGS  := -DMPWASM_NO_SPAWN=1 -I$(SRC_C)/include -I$(SRC_C)/include/stub -I$(GEN) -I$(PATCHED) -I$(SRC_C)
CFLAGS    ?= -O2
NATIVE_CFLAGS := $(CFLAGS) -w -DMPWASM_NATIVE=1

.PHONY: all tangle native contract wasm wasm-debug clean distclean check-nosystem verify-pin patch

all: native

# ---------------------------------------------------------------- host tools
# Knuth's stock ctangle has capacities too small for mp.w; TeX Live raises them
# in ctang-w2c.ch / comm-w2c.ch. We raise the same constants with sed on a copy.
CWEB_LIMITS := -e 's/^\#define max_file_name_length [0-9]*/\#define max_file_name_length 1024/' \
  -e 's/^\#define max_bytes [0-9]*/\#define max_bytes 1000000/' \
  -e 's/^\#define max_names [0-9]*/\#define max_names 20000/' \
  -e 's/^\#define max_sections [0-9]*/\#define max_sections 10000/' \
  -e 's/^\#define max_texts [0-9]*/\#define max_texts 10239/' \
  -e 's/^\#define max_toks [0-9]*/\#define max_toks 1000000/' \
  -e 's/^\#define hash_size [0-9]*/\#define hash_size 8501/' \
  -e 's/^\#define stack_size [0-9]*/\#define stack_size 500/'
$(CTANGLE_BIN): $(CWEBDIR)/ctangle.c $(CWEBDIR)/common.c $(CWEBDIR)/common.h
	@mkdir -p $(TOOLS)/cweb
	sed $(CWEB_LIMITS) $(CWEBDIR)/ctangle.c > $(TOOLS)/cweb/ctangle.c
	sed $(CWEB_LIMITS) $(CWEBDIR)/common.c > $(TOOLS)/cweb/common.c
	cp $(CWEBDIR)/common.h $(TOOLS)/cweb/common.h
	$(CC) -O2 -w -o $@ $(TOOLS)/cweb/ctangle.c $(TOOLS)/cweb/common.c

# ------------------------------------------------------------------- patches
# Copy mplibdir into build/patched and apply patches/*.patch there, so the
# vendored tree is never modified in place.
$(PATCHED)/.stamp: $(wildcard $(REPO)/patches/*.patch) $(REPO)/scripts/apply-patches.sh
	@mkdir -p $(PATCHED)
	$(REPO)/scripts/apply-patches.sh $(MPLIBDIR) $(PATCHED)
	@touch $@

patch: $(PATCHED)/.stamp

# -------------------------------------------------------------------- tangle
# ctangle writes into the current directory, so run it inside build/gen.
$(GEN)/%.c: $(PATCHED)/.stamp $(CTANGLE_BIN)
	@mkdir -p $(GEN)
	cd $(GEN) && $(CTANGLE_BIN) $(PATCHED)/$*.w >/dev/null

$(GEN)/mplib.h $(GEN)/mpmp.h: $(GEN)/mp.c
$(GEN)/mplibps.h $(GEN)/mppsout.h: $(GEN)/psout.c
$(GEN)/mplibsvg.h $(GEN)/mpsvgout.h: $(GEN)/svgout.c
$(GEN)/mpxout.h: $(GEN)/mpxout.c
$(GEN)/tfmin.h: $(GEN)/tfmin.c
$(GEN)/mpmath.h: $(GEN)/mpmath.c
$(GEN)/mpmathdouble.h: $(GEN)/mpmathdouble.c
$(GEN)/mpmathdecimal.h: $(GEN)/mpmathdecimal.c
$(GEN)/mpstrings.h: $(GEN)/mpstrings.c

tangle: $(GEN_C) $(GEN_H)

# -------------------------------------------------------------------- native
NATIVE_OBJS := $(patsubst %.c,$(NATIVE)/%.o,$(notdir $(ALL_C)))
vpath %.c $(GEN) $(PATCHED) $(SRC_C)

$(NATIVE)/%.o: %.c $(GEN_H)
	@mkdir -p $(NATIVE)
	$(CC) $(NATIVE_CFLAGS) $(CPPFLAGS) -c -o $@ $<

$(NATIVE)/libmplib.a: $(NATIVE_OBJS)
	$(AR) rcs $@ $^

native: $(NATIVE)/libmplib.a

# ------------------------------------------------------------------ contract
CONTRACT_BIN := $(REPO)/test/contract/harness
$(CONTRACT_BIN): $(REPO)/test/contract/contract.c $(NATIVE)/libmplib.a
	$(CC) $(NATIVE_CFLAGS) $(CPPFLAGS) -o $@ $< $(NATIVE)/libmplib.a -lm

contract: $(CONTRACT_BIN)
	cd $(REPO)/test/contract && ./harness

verify-pin:
	$(REPO)/scripts/verify-pin.sh

# ---------------------------------------------------------------------- wasm
EMCC      ?= emcc
EXPORTS   := $(SRC_C)/exports.json
JSLIB     := $(SRC_C)/mpwasm_library.js
WASM_COMMON := \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createMplib \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=2147483648 \
  -sSTACK_SIZE=2097152 \
  -sFILESYSTEM=1 -sFORCE_FILESYSTEM=1 \
  -sEXPORTED_FUNCTIONS=@$(EXPORTS) \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,stringToNewUTF8,UTF8ToString,lengthBytesUTF8,stringToUTF8,HEAPU8,HEAPF64,getValue,setValue,addFunction,removeFunction,NODEFS \
  -sALLOW_TABLE_GROWTH=1 \
  -sERROR_ON_UNDEFINED_SYMBOLS=1 \
  -sINCOMING_MODULE_JS_API=arguments,preRun,postRun,print,printErr,locateFile,wasmBinary,noInitialRun,onRuntimeInitialized,instantiateWasm \
  -lnodefs.js \
  --js-library $(JSLIB) \
  -Wno-unused-command-line-argument

$(DIST)/mplib.mjs: $(ALL_C) $(GEN_H) $(EXPORTS) $(JSLIB)
	@mkdir -p $(DIST)
	$(EMCC) -O3 -flto -w $(CPPFLAGS) $(WASM_COMMON) -o $@ $(ALL_C)

$(DIST)/mplib-debug.mjs: $(ALL_C) $(GEN_H) $(EXPORTS) $(JSLIB)
	@mkdir -p $(DIST)
	$(EMCC) -O0 -g -sASSERTIONS=2 -sSAFE_HEAP=1 -sSTACK_OVERFLOW_CHECK=2 -w $(CPPFLAGS) $(WASM_COMMON) -o $@ $(ALL_C)

wasm: $(DIST)/mplib.mjs
wasm-debug: $(DIST)/mplib-debug.mjs

check-nosystem: $(DIST)/mplib.mjs
	@$(REPO)/scripts/check-nosystem.sh $(DIST)/mplib.wasm

# --------------------------------------------------------------------- clean
clean:
	rm -rf $(GEN) $(NATIVE) $(PATCHED) $(CONTRACT_BIN) $(CONTRACT_BIN).dSYM
distclean: clean
	rm -rf $(BUILD) $(DIST)/mplib*.mjs $(DIST)/mplib*.wasm
