// guide-examples.mjs — every figure in site/guide.html, with the exact source
// that produced it. Rendered by scripts/build-guide.mjs with the wasm engines.
export const GUIDE = [
  // ---------------------------------------------------------------- MetaPost
  { id: 'mp-paths', section: 'metapost', title: 'Paths, tension and curl', kind: 'mp',
    note: 'MetaPost\'s path syntax: `..` for smooth curves solved by Hobby\'s algorithm, `--` for straight lines, tension and curl control, explicit controls, cycles.',
    src: `beginfig(1);
  draw (0,0)..(30,40)..(60,0) withcolor (0.1,0.3,0.8);
  draw (0,50)..tension 2..(30,90)..(60,50);
  draw (80,0){up}..{right}(140,60);
  draw (80,80){curl 0}..(110,120)..{curl 2}(140,80) withpen pencircle scaled 1.2;
  draw (160,0)..(190,40)..(220,0)..cycle;
  draw (160,60)..controls (170,110) and (210,110)..(220,60) dashed evenly;
endfig; end.` },
  { id: 'mp-pens', section: 'metapost', title: 'Pens, joins, caps and dashes', kind: 'mp',
    note: 'Elliptical and polygonal pens are real pens: a stroke is the envelope of the pen dragged along the path, as in the original program.',
    src: `beginfig(1);
  draw (0,0)--(50,50) withpen pencircle scaled 6;
  draw (60,0)--(110,50) withpen pensquare scaled 6;
  draw (120,0)--(170,50) withpen pencircle xscaled 8 yscaled 2 rotated 30;
  linecap := butt; linejoin := mitered;
  draw (0,70)--(25,120)--(50,70) withpen pencircle scaled 6;
  linejoin := beveled; draw (60,70)--(85,120)--(110,70) withpen pencircle scaled 6;
  linejoin := rounded; linecap := rounded; draw (120,70)--(145,120)--(170,70) withpen pencircle scaled 6;
  draw (0,140)--(170,140) dashed evenly scaled 2 withpen pencircle scaled 2;
  draw (0,160)--(170,160) dashed withdots scaled 2 withpen pencircle scaled 3;
endfig; end.` },
  { id: 'mp-fills', section: 'metapost', title: 'Fills, colour models and buildcycle', kind: 'mp',
    note: 'Grey, RGB and CMYK colours, `unfill`, `filldraw`, and `buildcycle` to fill the intersection of two shapes.',
    src: `beginfig(1);
  fill fullcircle scaled 50 shifted (25,25) withcolor (0.9,0.2,0.2);
  fill unitsquare scaled 40 shifted (60,5) withcolor 0.5;
  fill fullcircle scaled 50 shifted (135,25) withcmykcolor (1,0,0,0);
  filldraw fullcircle scaled 40 shifted (185,25) withcolor (0.2,0.7,0.3) withpen pencircle scaled 2;
  path a, b; a := fullcircle scaled 60 shifted (30,90); b := fullcircle scaled 60 shifted (60,90);
  draw a; draw b; fill buildcycle(a,b) withcolor (0.2,0.4,0.9);
  fill fullcircle scaled 60 shifted (150,90); unfill fullcircle scaled 30 shifted (150,90);
endfig; end.` },
  { id: 'mp-clip', section: 'metapost', title: 'Clipping and bounds', kind: 'mp',
    note: 'Pictures are values: build one, clip it to a path, take its bounding box, and draw the result.',
    src: `beginfig(1);
  picture pic; pic := image(for i = -8 upto 8: draw (i*10,-70)--(i*10,70) withpen pencircle scaled 1.5 withcolor (0.5+i/16, 0.3, 0.8-i/16); endfor);
  clip pic to fullcircle scaled 130;
  draw pic; draw bbox pic dashed evenly withcolor 0.5;
  picture q; q := image(fill fullcircle scaled 30 withcolor (1,0.6,0););
  setbounds q to unitsquare scaled 12 shifted (-6,-6);
  draw q shifted (110,0); draw bbox q shifted (110,0);
endfig; end.` },
  { id: 'mp-label', section: 'metapost', title: 'Text without TeX: Type 1 outlines', kind: 'mp',
    note: 'A plain `label` needs no TeX at all: metrics come from the TFM file and the glyphs are Computer Modern Type 1 outlines converted to SVG paths by MetaPost\'s own backend (`prologues:=3`). No web fonts are involved.',
    src: `prologues := 3;
beginfig(1);
  path p; p := fullcircle scaled 120;
  draw p withpen pencircle scaled 1;
  label.top("north", point 2 of p); label.bot("south", point 6 of p);
  label.lft("west", point 4 of p); label.rt("east", point 0 of p);
  label("MetaPost" infont "cmbx10" scaled 1.6, (0,12));
  label("cmti10 italic" infont "cmti10", (0,-30));
  dotlabel.lrt("origin", origin);
endfig; end.` },
  { id: 'mp-btex', section: 'metapost', title: 'Labels typeset by plain TeX', kind: 'mp',
    note: '`btex … etex` blocks are typeset by a real pdfTeX (DVI mode) in one batched run per document, converted by MetaPost\'s own `dvitomp`, and cached by content hash.',
    src: `prologues := 3;
beginfig(1);
  numeric a; a := 60;
  draw (-a,0)--(a,0) withcolor .6white; draw (0,-a)--(0,a) withcolor .6white;
  draw (-a, a*sind(-90)) for t=-89 upto 90: ..(t*a/90, a*sind(t)) endfor withpen pencircle scaled 1.2 withcolor (0.1,0.3,0.8);
  label.top(btex $y=\\sin\\theta$ etex, (a/2, a*.9));
  label.bot(btex $-\\pi$ etex, (-a,0)); label.bot(btex $\\pi$ etex, (a,0));
  label.rt(btex $\\displaystyle\\int_{-\\pi}^{\\pi}\\sin\\theta\\,d\\theta = 0$ etex, (a+8, -a*.8));
endfig; end.` },
  { id: 'mp-latex', section: 'metapost', title: 'Labels typeset by LaTeX', kind: 'mp',
    note: 'A `verbatimtex` preamble with `\\documentclass` switches the label engine to LaTeX automatically. amsmath, amssymb, tabular, any package in the bundles.',
    src: `verbatimtex
\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\begin{document}
etex
prologues := 3;
beginfig(1);
  draw fullcircle scaled 110 withpen pencircle scaled .8;
  label.top(btex $\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$ etex, (0,55));
  label.bot(btex $\\begin{pmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{pmatrix}$ etex, (0,-55));
  label.lft(btex $\\forall x \\in \\mathbb{R}$ etex, (-55,0));
  label.rt(btex \\LaTeX\\ \\textit{in the browser} etex, (55,0));
endfig; end.` },
  { id: 'mp-boxes', section: 'metapost', title: 'boxes.mp', kind: 'mp',
    note: 'The standard macro packages ship in the core bundle: boxes, rboxes, graph, format, sarith, string, metaobj, featpost, metauml and more.',
    src: `input boxes;
prologues := 3;
beginfig(1);
  boxit.lex(btex lexer etex); boxit.parse(btex parser etex);
  boxit.ast(btex AST etex); circleit.out(btex code etex);
  parse.w = lex.e + (25,0); ast.w = parse.e + (25,0); out.w = ast.e + (25,0);
  drawboxed(lex, parse, ast, out);
  drawarrow lex.e -- parse.w; drawarrow parse.e -- ast.w; drawarrow ast.e -- out.w;
  label.top(btex \\it tokens etex, .5[lex.e, parse.w] + (0,2));
  label.top(btex \\it tree etex, .5[parse.e, ast.w] + (0,2));
endfig; end.` },
  { id: 'mp-graph', section: 'metapost', title: 'graph.mp', kind: 'mp',
    note: 'John Hobby\'s graph package with TeX-typeset tick labels; MetaPost chooses the ticks.',
    src: `input graph;
prologues := 3;
beginfig(1);
  draw begingraph(7cm, 4.5cm);
    glabel.lft(btex $f(x)$ etex, OUT); glabel.bot(btex $x$ etex, OUT);
    path p; p := (0,0) for i = 1 upto 60: ..(i/6, (i/6)*(i/6)*mexp(-256*(i/6))) endfor;
    gdraw p withpen pencircle scaled 1 withcolor (0.8,0.1,0.1);
    gdraw (0,0.5) for i = 1 upto 60: ..(i/6, sind(60i)/2+0.5) endfor withcolor (0.1,0.3,0.8);
    glabel.urt(btex $x^2e^{-x}$ etex, (4,0.3));
  endgraph;
endfig; end.` },
  { id: 'mp-koch', section: 'metapost', title: 'A real programming language', kind: 'mp',
    note: 'Recursive `vardef`s, paths as first-class values joined with `&`, loops, and linear equations solved for you.',
    src: `vardef koch(expr a, b, n) =
  if n = 0: a--b
  else:
    save c, d, e; pair c, d, e;
    c = 1/3[a,b]; d = 2/3[a,b];
    e = 1/2[a,b] + ((b-a) rotated -90) scaled ((sqrt 3)/6);
    koch(a,c,n-1) & koch(c,e,n-1) & koch(e,d,n-1) & koch(d,b,n-1)
  fi
enddef;
beginfig(1);
  pair p, q, r; p = (-75,-43); q = (75,-43); r = (0, 87);
  path s; s := koch(p,q,4) & koch(q,r,4) & koch(r,p,4) & cycle;
  fill s withcolor (0.85,0.93,1);
  draw s withpen pencircle scaled .6 withcolor (0.1,0.3,0.7);
endfig; end.` },
  // -------------------------------------------------------------------- TikZ
  { id: 'tz-shading', section: 'tikz', title: 'Shadings', kind: 'tikz',
    note: 'Axis, radial and ball shadings become SVG gradients, through PGF\'s own dvisvgm driver. This is where a JavaScript DVI reader gives up.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{shadings}
\\begin{document}
\\begin{tikzpicture}
  \\shade[left color=red,right color=blue] (0,0) rectangle (2.4,1.2);
  \\shade[inner color=white,outer color=orange] (3.6,0.6) circle (0.6);
  \\shade[ball color=green!70!black] (5.4,0.6) circle (0.6);
  \\shade[top color=cyan!60,bottom color=violet!60,middle color=white] (6.6,0) rectangle (9,1.2);
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-patterns', section: 'tikz', title: 'Patterns, opacity, clipping, decorations', kind: 'tikz',
    note: 'Fill patterns become SVG patterns; opacity, clipping scopes and path decorations all survive intact.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{patterns,decorations.pathmorphing,decorations.markings}
\\begin{document}
\\begin{tikzpicture}
  \\fill[pattern=north east lines,pattern color=gray] (0,0) rectangle (2,1.2);
  \\fill[pattern=crosshatch dots,pattern color=blue!60] (2.3,0) rectangle (4.3,1.2);
  \\begin{scope}
    \\clip (5.5,0.6) circle (0.7);
    \\fill[orange] (4.5,0) rectangle (6.5,1.3);
    \\draw[decorate,decoration=snake,thick] (4.5,0.6) -- (6.5,0.6);
  \\end{scope}
  \\fill[red,opacity=0.5] (7,0) rectangle (8.2,1.2);
  \\fill[blue,opacity=0.5] (7.6,0.2) rectangle (8.8,1.4);
  \\draw[thick,postaction={decorate},decoration={markings,mark=at position 0.5 with {\\arrow{>}}}] (0,-0.5) -- (8.8,-0.5);
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-graph', section: 'tikz', title: 'Nodes, shapes, arrows', kind: 'tikz',
    note: 'positioning, shapes.geometric and arrows.meta; bent and curved edges; every library that ships with PGF in TeX Live 2025 is available.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{positioning,shapes.geometric,arrows.meta}
\\begin{document}
\\begin{tikzpicture}[node distance=1.1cm and 1.5cm, every node/.style={font=\\small}]
  \\node[circle,draw,fill=blue!15] (a) {$a$};
  \\node[circle,draw,fill=blue!15,right=of a] (b) {$b$};
  \\node[diamond,draw,fill=red!15,below right=of a] (c) {$c$};
  \\node[rectangle,draw,rounded corners,right=of b] (d) {$d$};
  \\draw[-{Stealth}] (a) -- node[above] {1} (b);
  \\draw[-{Stealth}] (a) -- node[left] {2} (c);
  \\draw[-{Stealth},dashed] (b) -- (c);
  \\draw[-{Stealth},bend left] (b) to node[above] {3} (d);
  \\draw[-{Stealth}] (c) to[out=0,in=-90] (d);
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-cd', section: 'tikz', title: 'Commutative diagrams (tikz-cd)', kind: 'tikz',
    src: `\\documentclass[border=3pt]{standalone}
\\usepackage{tikz-cd,amssymb}
\\begin{document}
\\begin{tikzcd}[column sep=large,row sep=large]
  A \\arrow[r,"f"] \\arrow[d,"g"'] \\arrow[dr,dashed,"h"] & B \\arrow[d,"g'"] \\\\
  C \\arrow[r,"f'"'] & D \\arrow[ul,phantom,"\\lrcorner",very near start]
\\end{tikzcd}
\\end{document}` },
  { id: 'tz-pgfplots', section: 'tikz', title: 'pgfplots', kind: 'tikz',
    note: 'The real pgfplots package: axes, grids, legends, sampled functions, data coordinates, filled areas.',
    src: `\\documentclass[border=3pt]{standalone}
\\usepackage{amsmath,pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{document}
\\begin{tikzpicture}
  \\begin{axis}[width=8cm,height=5cm,xlabel={$x$},ylabel={$f(x)$},legend pos=outer north east,grid=major,axis lines=left]
    \\addplot[blue,thick,domain=0:4,samples=60] {x^2*exp(-x)};
    \\addplot[red,dashed,domain=0:4,samples=60] {0.5*sin(deg(3*x))+0.5};
    \\addplot[only marks,mark=*,mark size=1.5pt] coordinates {(0.5,0.3) (1.5,0.5) (2.5,0.6) (3.5,0.2)};
    \\addplot[fill=blue!10,draw=none,domain=0:4,samples=60] {x^2*exp(-x)} \\closedcycle;
    \\legend{$x^2e^{-x}$,$\\tfrac12(1+\\sin 3x)$,data}
  \\end{axis}
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-text', section: 'tikz', title: 'Latin Modern, T1 encoding, amsmath', kind: 'tikz',
    note: 'Text is glyph outlines in the SVG, so it renders identically everywhere; `fonts: \'woff2\'` embeds web fonts instead if you prefer selectable text.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usepackage{lmodern}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\begin{document}
\\begin{tikzpicture}
  \\node[draw,align=left,text width=6.2cm,inner sep=8pt,rounded corners] {Latin Modern in \\textbf{T1} encoding: fi fl ffi \\& \\textit{italic} \\texttt{mono} \\textsf{sans} \\textsc{Small Caps}.\\\\[4pt] $\\displaystyle\\sum_{n\\ge1}\\frac{1}{n^2}=\\frac{\\pi^2}{6}, \\qquad \\mathbb{R}\\setminus\\mathbb{Q}$};
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-tree', section: 'tikz', title: 'Trees, matrices, decorations', kind: 'tikz',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{trees,decorations.pathreplacing}
\\begin{document}
\\begin{tikzpicture}[level distance=11mm, sibling distance=18mm, every node/.style={draw,rounded corners,fill=blue!8,font=\\footnotesize}, edge from parent/.style={draw,-latex}]
  \\node {MetaPost-WASM}
    child { node {mplib.wasm} child { node {SVG} } child { node {EPS} } }
    child { node {tex.wasm} child { node {DVI} } }
    child { node {dvisvgm.wasm} child { node {TikZ} } };
  \\draw[decorate,decoration={brace,amplitude=4pt},thick] (-3.2,-2.6) -- (3.2,-2.6) node[midway,below=4pt,draw=none,fill=none] {all in the browser};
\\end{tikzpicture}
\\end{document}` },
  { id: 'tz-plain', section: 'tikz', title: 'Plain TeX too', kind: 'tikz', plain: true,
    note: '`engine: \'plain\'` runs plain TeX with e-TeX (TeX Live\'s `etex`), which is what PGF needs.',
    src: `\\input tikz
\\nopagenumbers
\\tikzpicture
  \\draw[thick,fill=blue!10] (0,0) circle (1);
  \\foreach \\a in {0,45,...,315} \\draw (0,0) -- (\\a:1) node[circle,fill=red,inner sep=1.5pt] {};
  \\node at (0,-1.4) {plain \\TeX\\ with TikZ};
\\endtikzpicture
\\bye` },
];
