// examples-tikz.js — the TikZ/LaTeX gallery. Each is a complete document
// typeset by tex.wasm and converted to SVG by dvisvgm.wasm in the browser.
export const TIKZ_EXAMPLES = [
  {
    id: 'tikz-plot', title: 'Axes and a plot', tier: 'TikZ',
    blurb: 'The standalone class, calc and arrows.meta libraries, a sampled plot and a foreach loop — the everyday TikZ toolbox.',
    src: `\\documentclass[tikz,border=2pt]{standalone}
\\usetikzlibrary{arrows.meta,calc}
\\begin{document}
\\begin{tikzpicture}
  \\draw[->,thick] (0,0) -- (3.2,0) node[right] {$x$};
  \\draw[->,thick] (0,0) -- (0,2.2) node[above] {$y$};
  \\draw[blue, domain=0:3, samples=60] plot (\\x, {sin(\\x r)+1});
  \\node[fill=yellow!30,draw,rounded corners] at ($(1.5,1.6)$) {$y=\\sin x + 1$};
  \\foreach \\i in {1,2,3} \\draw (\\i,2pt) -- (\\i,-2pt) node[below] {\\i};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-graph', title: 'Nodes and edges', tier: 'TikZ',
    blurb: 'Positioning, geometric shapes, bent and curved edges with Stealth arrow tips.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{positioning,shapes.geometric,arrows.meta}
\\begin{document}
\\begin{tikzpicture}[node distance=1.2cm and 1.6cm, every node/.style={font=\\small}]
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
\\end{document}`,
  },
  {
    id: 'tikz-shading', title: 'Shadings, patterns, clipping', tier: 'TikZ',
    blurb: 'PGF shadings become SVG gradients, patterns become SVG patterns, clipping and opacity survive intact — this is what a DVI reader without PGF support cannot do.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{patterns,shadings,decorations.pathmorphing}
\\begin{document}
\\begin{tikzpicture}
  \\shade[left color=red,right color=blue] (0,0) rectangle (2,1);
  \\shade[ball color=green!60] (3,0.5) circle (0.5);
  \\fill[pattern=north east lines,pattern color=gray] (4,0) rectangle (6,1);
  \\begin{scope}
    \\clip (0,1.5) circle (0.8);
    \\fill[orange] (-1,1) rectangle (1,2.3);
    \\draw[decorate,decoration=snake,thick] (-1,1.5) -- (1,1.5);
  \\end{scope}
  \\draw[line width=2pt,line cap=round,dash pattern=on 4pt off 3pt] (2,1.5) -- (6,1.5);
  \\node[opacity=0.6,fill=cyan,text=black] at (4,2.3) {opacity};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'pgfplots', title: 'pgfplots', tier: 'TikZ',
    blurb: 'A pgfplots axis with two functions, data markers, a grid and a legend, typeset with the real package.',
    src: `\\documentclass[border=3pt]{standalone}
\\usepackage{amsmath,pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{document}
\\begin{tikzpicture}
  \\begin{axis}[width=7.5cm,height=5cm,xlabel={$x$},ylabel={$f(x)$},legend pos=north east,grid=major]
    \\addplot[blue,thick,domain=0:4,samples=50] {x^2*exp(-x)};
    \\addplot[red,dashed,domain=0:4,samples=50] {0.5*sin(deg(3*x))+0.5};
    \\addplot[only marks,mark=*] coordinates {(0.5,0.3) (1.5,0.5) (2.5,0.6) (3.5,0.2)};
    \\legend{$x^2e^{-x}$,$\\tfrac12(1+\\sin 3x)$,data}
  \\end{axis}
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-text', title: 'Latin Modern and amsmath', tier: 'TikZ',
    blurb: 'T1-encoded Latin Modern text with ligatures and small caps, plus display maths — every glyph an outline in the SVG.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usepackage{lmodern}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\begin{document}
\\begin{tikzpicture}
  \\node[draw,align=left,text width=6cm,inner sep=8pt] at (0,0) {Latin Modern in \\textbf{T1} encoding: fi fl ffi \\& \\textit{italic} \\texttt{mono} \\textsf{sans} \\textsc{Small Caps}.\\\\[4pt] $\\displaystyle\\sum_{n\\ge1}\\frac{1}{n^2}=\\frac{\\pi^2}{6}, \\qquad \\mathbb{R}\\setminus\\mathbb{Q}$};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-graphdrawing', title: 'Graph drawing (LuaTeX)', tier: 'TikZ',
    blurb: 'The graphdrawing library lays graphs out in Lua, so this document runs on luatex.wasm — picked automatically. Layered, spring and circular layouts.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{graphs,graphs.standard,graphdrawing}
\\usegdlibrary{layered,force,circular}
\\begin{document}
\\begin{tikzpicture}[>=stealth, nodes={draw,circle,fill=blue!10,font=\\small}]
  \\graph[layered layout, sibling distance=8mm, level distance=8mm] {
    a -> {b -> {d, e}, c -> {f -> g, h}}; e -> g;
  };
  \\begin{scope}[xshift=4.2cm, nodes={fill=red!10}]
    \\graph[spring layout, node distance=9mm] { 1 -- {2,3,4}; 2 -- 3 -- 4 -- 5 -- 2; 5 -- 6 -- 7 -- 5 };
  \\end{scope}
  \\begin{scope}[xshift=8.4cm, nodes={fill=orange!20}]
    \\graph[simple necklace layout, node distance=9mm] { subgraph C_n [n=7] };
  \\end{scope}
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-mindmap', title: 'Trees and decorations', tier: 'TikZ',
    blurb: 'A tree with the grow and sibling-distance keys, plus decorated paths.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{trees,decorations.pathreplacing}
\\begin{document}
\\begin{tikzpicture}[level distance=11mm, sibling distance=18mm, every node/.style={draw,rounded corners,fill=blue!8,font=\\footnotesize}, edge from parent/.style={draw,-latex}]
  \\node {mp-tikz-wasm}
    child { node {mplib.wasm} child { node {SVG} } child { node {EPS} } }
    child { node {tex.wasm} child { node {DVI} } }
    child { node {dvisvgm.wasm} child { node {TikZ} } };
  \\draw[decorate,decoration={brace,amplitude=4pt},thick] (-3.2,-2.6) -- (3.2,-2.6) node[midway,below=4pt,draw=none,fill=none] {all in the browser};
\\end{tikzpicture}
\\end{document}`,
  },
];
