import { describe, it, expect } from 'vitest';
import { wrapTikz, wrapMetaPost } from '../../src/ts/auto.js';

describe('wrapTikz', () => {
  it('wraps a bare tikzpicture in a standalone document with libraries and packages', () => {
    const d = wrapTikz('\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}', { libraries: 'arrows.meta, calc', packages: 'amsmath', border: '4pt' });
    expect(d).toBe('\\documentclass[tikz,border=4pt]{standalone}\n\\usepackage{amsmath}\n\\usetikzlibrary{arrows.meta,calc}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n\\end{document}');
  });
  it('wraps bare path commands in a tikzpicture too', () => {
    expect(wrapTikz('\\draw (0,0) circle (1);')).toContain('\\begin{tikzpicture}\n\\draw (0,0) circle (1);\n\\end{tikzpicture}');
  });
  it('gives a body that is its own picture the plain standalone class, not a second tikzpicture', () => {
    // tikzcd, circuitikz, \\chemfig and \\schemestart draw their own tikzpicture: nested in
    // another they collapse or vanish, and under standalone's `tikz` option (which crops
    // only tikzpicture environments) a bare circuitikz is a whole letter page
    for (const [src, pkg] of [
      ['\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}', 'tikz-cd'],
      ['\\begin{circuitikz}\\draw (0,0) to[R] (2,0);\\end{circuitikz}', 'circuitikz'],
      ['\\chemfig{A-B}', 'chemfig'],
      ['\\schemestart A\\arrow B\\schemestop', 'chemfig'],
    ]) {
      expect(wrapTikz(src, { packages: pkg, border: '3pt' })).toBe(`\\documentclass[border=3pt]{standalone}\n\\usepackage{tikz}\n\\usepackage{${pkg}}\n\\begin{document}\n${src}\n\\end{document}`);
    }
    // TikZ code that uses \\chemfig inside a node is still TikZ code, in the old document
    expect(wrapTikz('\\node {\\chemfig{A-B}};', { packages: 'chemfig' })).toBe('\\documentclass[tikz,border=2pt]{standalone}\n\\usepackage{chemfig}\n\\begin{document}\n\\begin{tikzpicture}\n\\node {\\chemfig{A-B}};\n\\end{tikzpicture}\n\\end{document}');
  });
  it('leaves complete documents alone', () => {
    const doc = '\\documentclass{article}\\begin{document}x\\end{document}';
    expect(wrapTikz(doc, { libraries: 'calc' })).toBe(doc);
    expect(wrapTikz('\\input tikz \\bye')).toBe('\\input tikz \\bye');
  });
});

describe('wrapMetaPost', () => {
  it('wraps a body in one figure with prologues 3', () => {
    expect(wrapMetaPost('draw origin;')).toBe('prologues:=3;\nbeginfig(1);\ndraw origin;\nendfig;\nend.');
  });
  it('hoists input statements out of the figure', () => {
    expect(wrapMetaPost('  input boxes;\n  boxit.a("x"); drawboxed(a);')).toBe('prologues:=3;\ninput boxes;\nbeginfig(1);\n  boxit.a("x"); drawboxed(a);\nendfig;\nend.');
  });
  it('keeps existing figures and honours prologues', () => {
    expect(wrapMetaPost('beginfig(2); draw origin; endfig;', { prologues: '0' })).toBe('prologues:=0;\nbeginfig(2); draw origin; endfig;');
  });
});

import { needsLuaTeX } from '../../src/ts/core.js';
describe('LuaTeX engine selection', () => {
  it('detects graphdrawing, \\directlua and luacode', () => {
    expect(needsLuaTeX('\\usetikzlibrary{graphdrawing}\\usegdlibrary{trees}')).toBe(true);
    expect(needsLuaTeX('\\node{\\directlua{tex.print(1)}};')).toBe(true);
    expect(needsLuaTeX('\\begin{luacode}x\\end{luacode}')).toBe(true);
    expect(needsLuaTeX('\\usepgfplotslibrary{contourlua} \\addplot3[contour lua] {x*y};')).toBe(true);
    expect(needsLuaTeX('\\draw (0,0) -- (1,1);')).toBe(false);
  });
  it('wrapTikz adds \\usegdlibrary and the graphdrawing library from gdlibraries', () => {
    const doc = wrapTikz('\\graph[tree layout]{a->b};', { gdlibraries: 'trees, layered' });
    expect(doc).toMatch(/\\usetikzlibrary\{graphs,graphdrawing\}/);
    expect(doc).toContain('\\usegdlibrary{trees,layered}');
    expect(needsLuaTeX(doc)).toBe(true);
  });
});
