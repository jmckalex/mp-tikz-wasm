// examples-tikz.js — the TikZ/LaTeX gallery. Each is a complete document
// typeset by tex.wasm and converted to SVG by dvisvgm.wasm in the browser.
export const TIKZ_EXAMPLES = [
  {
    id: 'tikz-plot', title: 'Axes and a plot', tier: 'TikZ', group: 'tikz',
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
    id: 'tikz-graph', title: 'Nodes and edges', tier: 'TikZ', group: 'tikz',
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
    id: 'tikz-arrows', title: 'Arrow tips', tier: 'arrows.meta', group: 'tikz',
    blurb: 'The arrows.meta tips, filled and open, stacked, rounded, harpoons, bars for dimension lines, and the bending library\'s tips that curve with the path.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{arrows.meta,bending}
\\begin{document}
\\begin{tikzpicture}[font=\\footnotesize\\ttfamily, line width=0.8pt]
  \\foreach \\tip [count=\\i] in {Stealth, Latex, Triangle, Kite, Straight Barb, Hooks, Circle, Square} {
    \\draw[arrows/.expanded={-{\\tip[scale=1.3]}}] (0,-0.5*\\i) -- ++(1.8,0) node[right=4pt] {\\tip};
    \\draw[arrows/.expanded={-{\\tip[open,scale=1.3]}}] (4.3,-0.5*\\i) -- ++(1.8,0) node[right=4pt] {open};
  }
  \\draw[{Bar[width=6pt]}-{Bar[width=6pt]}, blue!70!black] (0,-4.7) -- node[below,font=\\footnotesize] {$d = 1.8$ cm} ++(1.8,0);
  \\draw[-{Stealth[length=3mm]Stealth[length=3mm]}, red!70!black] (2.6,-4.7) -- ++(1.4,0);
  \\draw[{Latex[round]}-{Latex[round,reversed]}, thick] (4.3,-4.7) -- ++(1.8,0);
  \\draw[-{Stealth[harpoon,swap]}, thick] (6.9,-4.5) -- ++(1.2,0);
  \\draw[-{Stealth[harpoon,swap]}, thick] (8.1,-4.9) -- ++(-1.2,0);
  \\draw[-{Latex[bend,length=4mm]}, very thick, orange!80!black] (7.4,-0.4) arc[start angle=160, end angle=-100, radius=1.1];
  \\node[font=\\footnotesize\\rmfamily, align=center] at (7.95,-3.1) {tips that\\\\ bend with\\\\ the path};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-decorations', title: 'Decorations', tier: 'decorations', group: 'tikz',
    blurb: 'Path morphing (snake, coil, zigzag, bumps), shapes and markings along a path, a brace, footprints, and text set letter by letter along an arc.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{decorations.pathmorphing,decorations.pathreplacing,decorations.markings,decorations.text,decorations.shapes,decorations.footprints,shapes.geometric,arrows.meta}
\\begin{document}
\\begin{tikzpicture}[every node/.style={font=\\footnotesize}]
  \\draw[decorate,decoration={brace,amplitude=6pt,raise=2pt}] (0,0.2) -- (3,0.2) node[midway,above=9pt] {brace};
  \\draw[decorate,decoration={snake,amplitude=2pt,segment length=8pt}] (0,0) -- (3,0) node[right] {snake};
  \\draw[decorate,decoration={coil,aspect=0.5,amplitude=4pt,segment length=6pt},blue!70!black] (0,-0.7) -- (3,-0.7) node[right,black] {coil};
  \\draw[decorate,decoration={zigzag,amplitude=3pt,segment length=6pt},red!70!black] (0,-1.4) -- (3,-1.4) node[right,black] {zigzag};
  \\draw[decorate,decoration={bumps,amplitude=3pt,segment length=10pt},green!50!black] (0,-2.1) -- (3,-2.1) node[right,black] {bumps};
  \\path[decorate,decoration={shape backgrounds,shape=star,shape size=6pt,shape sep=10pt},fill=yellow!70!orange,draw=orange!60!black] (0,-2.8) -- (3,-2.8) node[right,black] {shapes};
  \\draw[postaction={decorate},decoration={markings,mark=between positions 0.1 and 0.9 step 0.2 with {\\arrow{Stealth}}},thick,violet] (0,-3.6) .. controls (1,-3.1) and (2,-4.1) .. (3,-3.6) node[right,black] {markings};
  \\draw[gray!50, fill=gray!5] (6.6,-1.4) circle (1.3);
  \\path[decorate,decoration={text along path,text={text that follows a path},text align=center,raise=3pt}] (6.6,-1.4) ++(195:1.3) arc[start angle=195, end angle=-15, radius=1.3];
  \\fill[brown!70!black,decorate,decoration={footprints,foot length=6pt,stride length=12pt,foot of=human}] (5.1,-3.7) .. controls (6,-3.1) and (7.2,-4.1) .. (8.1,-3.5);
  \\node[align=center] at (6.6,-1.4) {decorations.\\\\text};
  \\node[below=1pt] at (6.6,-3.8) {footprints};
  \\path (8.4,0.3); % decorated text is not counted in the bounding box
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-shading', title: 'Shadings, patterns, clipping', tier: 'TikZ', group: 'tikz',
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
    id: 'tikz-shadings', title: 'Shadings and transparency', tier: 'shadings', group: 'tikz',
    blurb: 'Axis, radial and ball shadings, two declared with \\pgfdeclarehorizontalshading and \\pgfdeclareradialshading, and fill opacity; every one becomes an SVG gradient or opacity, not an image.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{shadings}
\\pgfdeclarehorizontalshading{rainbow}{100bp}{color(0bp)=(red); color(20bp)=(red); color(35bp)=(orange); color(45bp)=(yellow); color(55bp)=(green); color(65bp)=(cyan); color(75bp)=(blue); color(80bp)=(violet); color(100bp)=(violet)}
\\pgfdeclareradialshading{halo}{\\pgfpoint{-8bp}{8bp}}{color(0bp)=(white); color(9bp)=(yellow!80!orange); color(18bp)=(red!80!black); color(25bp)=(black!80)}
\\begin{document}
\\begin{tikzpicture}
  \\shade[top color=blue!80!black, bottom color=cyan!30, middle color=white] (0,0) rectangle (2.2,2.2);
  \\shade[shading=rainbow] (2.6,0) rectangle (6.8,2.2);
  \\shade[shading=halo] (8.2,1.1) circle (1.1);
  \\shade[ball color=violet!70] (10.6,1.1) circle (1.1);
  % transparency: three translucent discs
  \\begin{scope}[yshift=-2.1cm, xshift=1.4cm, fill opacity=0.5]
    \\fill[red]   (90:0.6)  circle (0.9);
    \\fill[green] (210:0.6) circle (0.9);
    \\fill[blue]  (330:0.6) circle (0.9);
  \\end{scope}
  \\shade[left color=green!60!black, right color=blue!70!black, rounded corners=6pt] (3.6,-3) rectangle (6.8,-1.2);
  \\node[text=white, font=\\bfseries] at (5.2,-2.1) {axis shading};
  \\shade[inner color=white, outer color=orange!80!black] (7.4,-3) rectangle (11.7,-1.2);
  \\node[font=\\bfseries] at (9.55,-2.1) {radial shading};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-knots', title: 'A Celtic knot', tier: 'spath3 · knots', group: 'tikz',
    blurb: 'The knots library from spath3 (bundled here; pgf does not ship it) finds every crossing of one self-intersecting strand and redraws the ones that go over: the example from its manual, plus a two-strand braid. Finding the crossings is heavy arithmetic in TeX, about three seconds.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{knots}
% one motif, turned three times: a single strand that crosses itself
\\newcommand{\\motif}[1]{
  to ++(180+#1:0.50) arc (270+#1:150+#1:0.15)
  to ++( 60+#1:0.50) arc (-30+#1:150+#1:0.15)
  to ++(240+#1:0.25) arc (150+#1:330+#1:0.25)
  to ++( 60+#1:0.55) arc (150+#1: 30+#1:0.20)
}
\\begin{document}
\\begin{tikzpicture}
  \\begin{knot}[line width=2pt, line join=round, clip width=2, scale=5,
      consider self intersections, ignore endpoint intersections=false, background color=white,
      only when rendering/.style={draw=blue!55!black, double=white, double distance=6pt, line cap=round}]
    \\strand (0,0) \\motif{0}\\motif{120}\\motif{240};
    \\flipcrossings{1,3,6,8,10}
  \\end{knot}
  \\begin{scope}[xshift=5.4cm, yshift=-1.6cm]
    \\begin{knot}[clip width=5, flip crossing=2]
      \\strand[red!70!black, ultra thick] (0,0) .. controls +(1,0) and +(-1,0) .. (2,1) .. controls +(1,0) and +(-1,0) .. (4,0);
      \\strand[blue!70!black, ultra thick] (0,1) .. controls +(1,0) and +(-1,0) .. (2,0) .. controls +(1,0) and +(-1,0) .. (4,1);
    \\end{knot}
  \\end{scope}
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-calligraphy', title: 'Calligraphy', tier: 'spath3 · calligraphy', group: 'tikz',
    blurb: 'The calligraphy library simulates a broad nib held at an angle and a copperplate nib whose stroke swells and tapers, and builds calligraphic braces and parentheses from them.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{decorations.pathreplacing,calligraphy}
\\begin{document}
\\begin{tikzpicture}
  % a broad nib held at 45 degrees: the stroke is thick or thin with its direction
  \\pen (-135:.2) -- (45:.2);
  \\calligraphy[pen colour=blue!55!black] (0,0) .. controls +(45:1) and +(-135:1) .. +(3,0) ++(1.5,0) .. controls +(-135:2) and +(45:2) .. +(0,-3) (0,-3) .. controls +(45:1) and +(-135:1) .. +(3,0);
  % a copperplate nib: each segment swells and tapers
  \\pen (0,0);
  \\calligraphy[heavy, heavy line width=3pt, pen colour=red!60!black] (4.6,0) .. controls +(45:1) and +(-135:1) .. +(3,0) ++(1.5,0) .. controls +(-135:2) and +(45:2) .. +(0,-3) (4.6,-3) .. controls +(45:1) and +(-135:1) .. +(3,0);
  % the decorations built on it
  \\draw[decorate, decoration={calligraphic brace, amplitude=3mm}, ultra thick] (9.4,-3) -- (9.4,0.4);
  \\draw[decorate, decoration={calligraphic curved parenthesis, amplitude=3mm}, ultra thick] (10.3,-3) -- (10.3,0.4);
  \\draw[decorate, decoration={calligraphic straight parenthesis, amplitude=3mm}, ultra thick] (11.2,-3) -- (11.2,0.4);
  \\path (11.8,0); % the decorations are not counted in the bounding box
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-matrix', title: 'Matrices', tier: 'matrix', group: 'tikz',
    blurb: 'A matrix of math nodes with delimiters and a highlighted diagonal on the background layer, and a commutative square drawn between matrix cells, framed with the fit library.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{matrix,fit,backgrounds,positioning,arrows.meta}
\\begin{document}
\\begin{tikzpicture}[>={Stealth}]
  \\matrix (A) [matrix of math nodes, left delimiter={(}, right delimiter={)}, row sep=4pt, column sep=8pt, nodes={minimum width=1.4em}] {
    2 & -1 &  0 & 0 \\\\
   -1 &  2 & -1 & 0 \\\\
    0 & -1 &  2 & -1 \\\\
    0 &  0 & -1 & 2 \\\\
  };
  \\begin{scope}[on background layer]
    \\foreach \\i in {1,...,4} \\fill[blue!12, rounded corners=3pt] (A-\\i-\\i.north west) rectangle (A-\\i-\\i.south east);
  \\end{scope}
  \\node[left=6pt of A, anchor=east] (L) {$K_4 =$};
  \\matrix (cd) [matrix of math nodes, row sep=1.4cm, column sep=1.8cm, right=1.6cm of A] {
    A & B \\\\
    C & D \\\\
  };
  \\draw[->] (cd-1-1) -- node[above,font=\\small] {$f$} (cd-1-2);
  \\draw[->] (cd-1-1) -- node[left,font=\\small] {$g$} (cd-2-1);
  \\draw[->] (cd-1-2) -- node[right,font=\\small] {$h$} (cd-2-2);
  \\draw[->] (cd-2-1) -- node[below,font=\\small] {$k$} (cd-2-2);
  \\draw[->, dashed] (cd-1-1) -- node[above right=-2pt,font=\\small] {$\\varphi$} (cd-2-2);
  \\node[draw=red!60!black, rounded corners, inner sep=6pt, fit=(cd-1-1)(cd-2-2), label={[font=\\footnotesize]below:$h\\circ f = k\\circ g$}] {};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-mindmap', title: 'Trees and decorations', tier: 'TikZ', group: 'tikz',
    blurb: 'A tree with the grow and sibling-distance keys, plus decorated paths.',
    src: `\\documentclass[tikz,border=3pt]{standalone}
\\usetikzlibrary{trees,decorations.pathreplacing}
\\begin{document}
\\begin{tikzpicture}[level distance=11mm, sibling distance=18mm, every node/.style={draw,rounded corners,fill=blue!8,font=\\footnotesize}, edge from parent/.style={draw,-latex}]
  \\node {mp-tikz-wasm}
    child { node {mplib.wasm} child { node {SVG} } child { node {EPS} } }
    child { node {tex.wasm} child { node {DVI} } }
    child { node {dvisvgm.wasm} child { node {TikZ} } };
  \\draw[decorate,decoration={brace,amplitude=4pt,mirror},thick] (-3.2,-2.6) -- (3.2,-2.6) node[midway,below=4pt,draw=none,fill=none] {all in the browser};
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'tikz-concepts', title: 'A mind map', tier: 'mindmap', group: 'tikz',
    blurb: 'The mindmap library: concepts in a cyclic tree, with the shaded connection bars between concept colours drawn as SVG gradients.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{mindmap}
\\begin{document}
\\begin{tikzpicture}[mindmap, grow cyclic, every node/.style={concept, font=\\sffamily\\small}, concept color=blue!50!black, text=white,
  level 1/.append style={level distance=4cm, sibling angle=120, font=\\sffamily\\footnotesize},
  level 2/.append style={level distance=2.3cm, sibling angle=45, font=\\sffamily\\scriptsize}]
  \\node {mp-tikz-wasm}
    child[concept color=red!60!black] { node {MetaPost} child { node {SVG} } child { node {EPS} } child { node {JSON} } }
    child[concept color=green!45!black] { node {pdf\\TeX} child { node {LaTeX} } child { node {TikZ} } child { node {pgfplots} } }
    child[concept color=orange!80!black] { node {Lua\\TeX} child { node {graph drawing} } child { node {fontspec} } child { node {Lua} } };
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'pgfplots', title: 'pgfplots', tier: 'TikZ', group: 'tikz',
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
    id: 'tikz-text', title: 'Latin Modern and amsmath', tier: 'TikZ', group: 'tikz',
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
    id: 'latex-parshape-circle', title: 'A paragraph in a circle', tier: 'LaTeX', group: 'tex',
    blurb: 'A whole LaTeX document: prose with inline and displayed amsmath and inline TikZ pictures, set inside a circle by \\parshape with twenty line widths computed by pgfmath.',
    src: `\\documentclass[border=8pt]{standalone}
\\usepackage{lmodern}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{tikz}
\\begin{document}
% A paragraph set inside a circle. \\parshape takes one (indent, width) pair
% per line; pgfmath computes each width as a chord of the circle.
\\def\\R{130.9}               % radius in pt (4.6cm)
\\def\\B{12}                  % \\baselineskip in pt
\\newcount\\n \\n=20           % lines: the text block is n\\B = 240pt tall
\\newcount\\i
\\def\\shape{}
\\i=1
\\loop
  \\pgfmathsetmacro\\yy{(\\n*\\B/2-(\\i-0.5)*\\B)/10}    % line centre, relative to circle centre, in 10pt units
  \\pgfmathsetmacro\\hw{10*sqrt(\\R/10*\\R/10-\\yy*\\yy)-6} % half chord, 6pt inside the rim (pgfmath overflows above 16383, hence the /10)
  \\pgfmathsetmacro\\ind{\\R-\\hw}
  \\pgfmathsetmacro\\lw{2*\\hw}
  \\edef\\shape{\\shape\\ind pt \\lw pt }
  \\advance\\i 1
\\ifnum\\i<\\numexpr\\n+1\\relax\\repeat
\\hbox{%
  \\rlap{\\tikz[baseline=0pt]{\\fill[blue!6] (\\R pt,-111.6pt) circle (\\R pt); \\draw[blue!50!black,line width=.5pt] (\\R pt,-111.6pt) circle (\\R pt);}}%
  \\vtop{\\hsize=2\\dimexpr\\R pt\\relax \\baselineskip=\\B pt \\parindent=0pt \\tolerance=3000 \\emergencystretch=1.5em \\hyphenpenalty=10
    \\parshape \\n \\shape
    The ratio of a circle's circumference to its diameter,
    $\\pi\\approx3.14159\\ldots$, is the same for every circle
    \\tikz[baseline=-0.6ex]{\\draw (0,0) circle (0.8ex); \\draw (-0.8ex,0)--(0.8ex,0);}.
    Archimedes squeezed it between inscribed and circumscribed polygons
    \\tikz[baseline=-0.6ex]{\\draw (0,0) circle (0.8ex); \\draw (0:0.8ex) \\foreach \\a in {60,120,...,300} {-- (\\a:0.8ex)} -- cycle;},
    proving $3\\tfrac{10}{71}<\\pi<3\\tfrac17$; two thousand years later Leibniz found
    \\[ \\frac{\\pi}{4}=\\sum_{k=0}^{\\infty}\\frac{(-1)^k}{2k+1}=1-\\frac13+\\frac15-\\frac17+\\cdots, \\]
    and Euler tied $\\pi$ to the primes through $\\sum_{n\\ge1}n^{-2}=\\pi^2/6$
    and to $e$ through $e^{i\\pi}+1=0$; Wallis wrote $\\frac{\\pi}{2}=\\prod_{n\\ge1}\\frac{4n^2}{4n^2-1}$.
    The Gaussian integral
    $\\int_{-\\infty}^{\\infty}e^{-x^2}\\,dx=\\sqrt{\\pi}$
    \\tikz[baseline=-0.3ex]{\\draw[thick] plot[domain=-2.2:2.2,samples=30] ({\\x*0.42em},{exp(-\\x*\\x)*1.4ex});}
    carries it into probability and statistics, and it hides in Stirling's
    formula $n!\\sim\\sqrt{2\\pi n}\\,(n/e)^n$. This paragraph is set by
    \\TeX's \\texttt{\\char\`\\\\parshape} primitive: twenty line widths
    computed by pgfmath as chords of the circle, with the
    display and the inline TikZ pictures flowing
    through the same shape as the prose.\\par}}
\\end{document}`,
  },
  {
    id: 'latex-parshape-wrap', title: 'Text around a figure', tier: 'LaTeX', group: 'tex',
    blurb: 'Nine narrow \\parshape lines beside a TikZ plot of Fourier partial sums hung from the first baseline, then the full measure: wrapfig by hand, with real math in the text.',
    src: `\\documentclass[border=8pt]{standalone}
\\usepackage{lmodern}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{tikz}
\\begin{document}
% Text flowing around a figure, by hand: \\parshape narrows the first k
% lines, and the figure hangs from the first baseline in a zero-width box.
\\newdimen\\W \\W=11.5cm      % the measure
\\newdimen\\F \\F=4.4cm       % width reserved for the figure
\\newcount\\k \\k=9           % lines beside it
\\def\\shape{}\\newcount\\i \\i=1
\\loop \\edef\\shape{\\shape 0pt \\the\\dimexpr\\W-\\F\\relax\\space}\\advance\\i 1 \\ifnum\\i<\\numexpr\\k+1\\relax\\repeat
\\edef\\shape{\\shape 0pt \\the\\W}
\\vtop{\\hsize=\\W \\parindent=0pt \\tolerance=2000 \\emergencystretch=1em
  \\parshape \\numexpr\\k+1\\relax \\shape
  % \\vtop{\\kern0pt ...} puts the whole picture below the baseline; \\smash hides
  % that depth from the line spacing; \\raise lines its top up with the first line.
  \\rlap{\\hskip\\dimexpr\\W-\\F+3mm\\relax\\smash{\\raise\\ht\\strutbox\\vtop{\\kern0pt\\hbox{%
    \\begin{tikzpicture}[x=0.55cm,y=0.95cm,font=\\scriptsize]
      \\draw[->] (-0.3,0) -- (6.9,0) node[right] {$x$};
      \\draw[->] (0,-1.45) -- (0,1.55) node[left] {$S_N(x)$};
      \\draw[gray!70,line width=1.2pt] (0,1) -- (3.1416,1) -- (3.1416,-1) -- (6.2832,-1);
      \\draw[blue!70!black,domain=0:6.2832,samples=90] plot (\\x,{4/pi*sin(\\x r)});
      \\draw[red!80!black,domain=0:6.2832,samples=200] plot (\\x,{4/pi*(sin(\\x r)+sin(3*\\x r)/3+sin(5*\\x r)/5)});
      \\draw[violet!80!black,thick,domain=0:6.2832,samples=500] plot (\\x,{4/pi*(sin(\\x r)+sin(3*\\x r)/3+sin(5*\\x r)/5+sin(7*\\x r)/7+sin(9*\\x r)/9+sin(11*\\x r)/11+sin(13*\\x r)/13+sin(15*\\x r)/15+sin(17*\\x r)/17+sin(19*\\x r)/19+sin(21*\\x r)/21)});
      \\foreach \\t/\\l in {3.1416/$\\pi$,6.2832/$2\\pi$} \\draw (\\t,2pt) -- (\\t,-2pt) node[below=1pt,fill=white,inner sep=1pt] {\\l};
      \\node[anchor=north west,align=left,inner sep=1pt] at (3.4,1.55) {\\textcolor{blue!70!black}{$N=1$}\\\\ \\textcolor{red!80!black}{$N=5$}\\\\ \\textcolor{violet!80!black}{$N=21$}};
    \\end{tikzpicture}}}}}%
  Any reasonable periodic function is a sum of sines and cosines. For the square wave
  \\tikz[baseline=-0.5ex]\\draw (0,-0.7ex)--(0,0.7ex)--(0.9em,0.7ex)--(0.9em,-0.7ex)--(1.8em,-0.7ex);
  $f(x)=\\operatorname{sgn}(\\sin x)$ the cosine coefficients
  $a_n=\\frac1\\pi\\int_{-\\pi}^{\\pi}f(x)\\cos nx\\,dx$ all vanish, while
  $b_n=\\frac{2}{\\pi n}\\,(1-\\cos n\\pi)$, so only the odd harmonics survive:
  \\[ f(x)=\\frac{4}{\\pi}\\sum_{k=0}^{\\infty}\\frac{\\sin\\bigl((2k+1)x\\bigr)}{2k+1}. \\]
  The partial sums $S_N$ on the right overshoot each jump by about nine per cent
  however large $N$ becomes: the Gibbs phenomenon,
  $\\lim_{N\\to\\infty}S_N\\!\\left(\\tfrac{\\pi}{2N}\\right)=\\tfrac{2}{\\pi}\\operatorname{Si}(\\pi)\\approx1.179$.
  Parseval's identity $\\frac1\\pi\\int_{-\\pi}^{\\pi}f^2=\\sum_n b_n^2$ then yields
  $\\sum_{k\\ge0}(2k+1)^{-2}=\\pi^2/8$, from which Euler's $\\zeta(2)=\\pi^2/6$ follows in one line.
  The gap the text flows around is a \\texttt{\\char\`\\\\parshape} too: nine narrow lines beside the
  figure, then the full measure, with the figure itself hung from the first baseline in a
  zero-width \\texttt{\\char\`\\\\rlap} box.\\par}
\\end{document}`,
  },
  {
    id: 'plain-parshape', title: 'A diamond with \\parshape (plain TeX)', tier: 'plain TeX', group: 'tex',
    plain: true,
    blurb: 'Plain TeX, no packages: a loop builds a \\parshape of 21 lines that widen and narrow again, and TeX\'s line breaker pours the paragraph into the diamond, hyphenating where it must.',
    src: `% plain TeX (pdfTeX): a paragraph set in a diamond with \\parshape.
% Line i of 2m+1 is indented by |i-m|*d and is 2|i-m|*d narrower than \\hsize.
\\hsize=9cm \\parindent=0pt \\nopagenumbers \\lefthyphenmin=2 \\righthyphenmin=3
\\baselineskip=12.5pt \\tolerance=9999 \\emergencystretch=1em \\hyphenpenalty=10
\\newcount\\m \\m=10 \\newcount\\i \\newcount\\k \\newdimen\\d \\d=\\hsize \\divide\\d by 22 \\newdimen\\ind \\newdimen\\wid
\\def\\shape{}
\\i=0
\\loop
  \\k=\\i \\advance\\k by -\\m \\ifnum\\k<0 \\k=-\\k \\fi   % k = |i - m|
  \\ind=\\k\\d \\wid=\\hsize \\advance\\wid by -2\\ind
  \\edef\\shape{\\shape\\space\\the\\ind\\space\\the\\wid}
  \\advance\\i by 1
\\ifnum\\i<\\numexpr 2*\\m+1\\relax \\repeat
\\parshape \\numexpr 2*\\m+1\\relax \\shape
\\TeX\\ breaks a paragraph into lines by looking at all of it at once. Every
feasible breakpoint gets a demerit that grows with the cube of how far its
line has to stretch or shrink, and the breaks chosen are the sequence with
the least total: a shortest path through a graph of possibilities, found by
dynamic programming. The {\\tt\\string\\parshape} primitive gives each line its own
indentation and width, so the same algorithm pours text into any outline.
Here the lines widen by $2/22$ of the measure down to the middle one
and then narrow again, and the paragraph becomes a diamond without a single
manual line break, in plain \\TeX, with no packages.\\par
\\bye`,
  },
  {
    id: 'tikz-graphdrawing', title: 'Graph drawing (LuaTeX)', tier: 'TikZ', group: 'lua',
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
    id: 'gd-trees', title: 'Graph drawing: trees and springs', tier: 'LuaTeX', group: 'lua',
    blurb: 'Two more of the graph-drawing algorithms, which are written in Lua and so run on luatex.wasm: a binary tree layout and a spring-electrical layout of a small network.',
    src: `\\documentclass[tikz,border=6pt]{standalone}
\\usetikzlibrary{graphs,graphdrawing,quotes}
\\usegdlibrary{trees,force}
\\begin{document}
\\begin{tikzpicture}[>=stealth, every node/.style={draw, circle, inner sep=1.5pt, minimum size=5mm, font=\\footnotesize, fill=green!12}]
  \\graph[binary tree layout, level distance=9mm, sibling distance=7mm] {
    8 -> { 4 -> { 2 -> { 1, 3 }, 6 -> { 5, 7 } }, 12 -> { 10 -> { 9, 11 }, 14 -> { 13, 15 } } }
  };
  \\begin{scope}[xshift=7.4cm, yshift=-1.4cm, every node/.style={draw, rectangle, rounded corners, font=\\footnotesize, fill=blue!10}]
    \\graph[spring electrical layout, node distance=13mm, electric charge=2, random seed=7] {
      TeX -- {LaTeX, plain, ConTeXt}; LaTeX -- {TikZ, amsmath, fontspec}; TikZ -- {pgfplots, graphs}; plain -- MetaPost -- ConTeXt; fontspec -- LuaTeX -- ConTeXt; graphs -- LuaTeX
    };
  \\end{scope}
\\end{tikzpicture}
\\end{document}`,
  },
  {
    id: 'luatex-plain', title: 'Plain LuaTeX: primes by Lua, bars by \\vrule', tier: 'plain LuaTeX', group: 'lua',
    engine: 'luatex',
    blurb: 'Plain LuaTeX with no packages: \\directlua sieves the primes up to 1000 and hands the counts to TeX with token.set_macro; the bars are \\vrules, the table an \\halign, the colour dvisvgm colour specials.',
    src: `% plain LuaTeX: Lua does the arithmetic, TeX's primitives do the typesetting
\\hsize=11.5cm \\parindent=0pt \\nopagenumbers
\\font\\big=cmbx12
\\directlua{
  local N, sieve, count, c = 1000, {}, {}, 0
  for n = 2, N do sieve[n] = true end
  for n = 2, N do
    if sieve[n] then c = c + 1; for m = n*n, N, n do sieve[m] = false end end
    count[n] = c
  end
  % hand the results to TeX as macros \\pi50, \\pi100 ... and \\li50 ...
  for x = 50, 1000, 50 do
    token.set_macro("pi" .. x, tostring(count[x]))
    token.set_macro("li" .. x, tostring(math.floor(10 * x / math.log(x) + 0.5) / 10))
  end
}
\\def\\p#1{\\csname pi#1\\endcsname}\\def\\l#1{\\csname li#1\\endcsname}
{\\big Counting primes in {\\tt\\string\\directlua}}\\medskip
The number of primes up to $x$ grows like $x/\\ln x$:
$$\\pi(x)=\\sum_{p\\le x}1\\;\\sim\\;{x\\over\\ln x}\\qquad(x\\to\\infty).$$
Each bar is a {\\tt\\string\\vrule} that is $0.6\\,\\pi(x)$ points tall, for $x=50,100,\\ldots,1000$;
the red tick marks $x/\\ln x$.\\medskip
\\newcount\\x
\\hbox{\\vrule width .4pt height 105pt depth 0pt\\kern4pt
  \\x=50
  \\loop
    \\dimen0=\\p{\\the\\x}pt \\dimen0=.6\\dimen0 \\dimen2=\\l{\\the\\x}pt \\dimen2=.6\\dimen2
    \\special{color push rgb 0.2 0.35 0.7}\\vrule width 7pt height \\dimen0 depth 0pt\\special{color pop}%
    \\special{color push rgb 0.8 0.1 0.1}\\llap{\\raise\\dimen2\\hbox{\\vrule width 9pt height .8pt depth 0pt\\kern-1pt}}\\special{color pop}%
    \\kern3pt
    \\advance\\x by 50
  \\ifnum\\x<1001 \\repeat}
\\hrule width 8.2cm
\\bigskip
\\halign{\\strut\\hfil$#$\\quad\\vrule\\quad&\\hfil#\\quad&\\hfil#\\cr
x&$\\pi(x)$&$x/\\ln x$\\cr\\noalign{\\hrule}
100&\\p{100}&\\l{100}\\cr
500&\\p{500}&\\l{500}\\cr
1000&\\p{1000}&\\l{1000}\\cr}
\\bye`,
  },
  {
    id: 'lualatex-lua', title: 'LuaLaTeX: Pascal\'s triangle mod 2', tier: 'LuaLaTeX', group: 'lua',
    engine: 'lualatex',
    blurb: 'A LuaLaTeX document: Lua computes 32 rows of Pascal\'s triangle and writes one \\rule per odd entry back into the paragraph, and amsmath sets Lucas\' theorem underneath.',
    src: `\\documentclass[border=8pt,varwidth=12cm]{standalone}
\\usepackage{amsmath,xcolor}
\\begin{document}
\\section*{Pascal's triangle, modulo 2}
\\directlua{
  % each row of Pascal's triangle mod 2, drawn as one line of \\rule boxes;
  % \\string\\\\ passes a backslash through TeX's expansion to Lua
  local rows, row = 32, {1}
  for n = 1, rows do
    tex.sprint("\\string\\\\noindent\\string\\\\hspace*{" .. (rows - n) * 2 .. "pt}")
    for _, v in ipairs(row) do
      if v == 1 then tex.sprint("\\string\\\\textcolor{blue!60!black}{\\string\\\\rule{3.6pt}{3.6pt}}\\string\\\\hspace{0.4pt}")
      else tex.sprint("\\string\\\\hspace{4pt}") end
    end
    tex.sprint("\\string\\\\par\\string\\\\nointerlineskip\\string\\\\vspace{0.4pt}")
    local next = {1}   % row n has n entries (no # here: TeX would double it)
    for i = 2, n do next[i] = (row[i-1] + row[i]) \\csstring\\% 2 end
    next[n + 1] = 1
    row = next
  end
}
\\medskip
Lua computed each entry; \\LaTeX\\ drew it with \\verb|\\rule|. The odd entries
of $\\binom{n}{k}$ form Sierpi\\'nski's triangle, because by Lucas' theorem
\\[
  \\binom{n}{k} \\equiv \\prod_i \\binom{n_i}{k_i} \\pmod 2,
  \\qquad\\text{so}\\qquad
  \\binom{n}{k}\\ \\text{is odd} \\iff k \\mathbin{\\&} n = k .
\\]
Row $31$ is all ones: $\\sum_{k}\\binom{31}{k} = 2^{31} = \\directlua{tex.sprint(string.format("\\csstring\\%d", 2^31))}$.
\\end{document}`,
  },
  {
    id: 'otf-fontspec', title: 'OpenType through fontspec', tier: 'fontspec', group: 'otf',
    engine: 'lualatex', opentype: true,
    blurb: 'fontspec under LuaLaTeX with the opt-in opentype bundle: Latin Modern\'s OpenType faces with ligatures, kerning, Unicode input, letter-spacing, a separate small-caps face and optical sizes, each face fetched when first used. The first OpenType run in a session scans the font family, so it takes a few seconds.',
    src: `\\documentclass[border=8pt,varwidth=11cm]{standalone}
\\usepackage{fontspec,xcolor}
\\setmainfont{Latin Modern Roman}[SmallCapsFont=lmromancaps10-regular.otf]
\\setsansfont{Latin Modern Sans}
\\setmonofont{Latin Modern Mono}
\\begin{document}
\\raggedright
{\\Large\\bfseries OpenType through fontspec}\\par\\medskip
Real OpenType faces, shaped by luaotfload: ligatures (fi ffi ffl),
kerning (AVATAR, Tea, To), and Unicode input typed straight in —
Dvořák, Łódź, Ærøskøbing, façade, naïve, Straße, Ĳsselmeer, Việt Nam.\\par\\medskip
{\\addfontfeatures{Ligatures=NoCommon}Ligatures switched off: fi ffi ffl.}\\par
{\\addfontfeatures{LetterSpace=12}\\scshape Letter-spaced small capitals}\\par
{\\addfontfeatures{FakeSlant=0.25}A slant applied by the font loader.}\\par\\medskip
\\textsf{Latin Modern Sans}, \\texttt{Latin Modern Mono}, \\textit{italic},
\\textbf{bold} and \\textsl{slanted}. Each size has its own optical design
— {\\footnotesize footnote,} {\\large large,} {\\LARGE LARGE} — and each face
is fetched only when a document asks for it.
\\end{document}`,
  },
  {
    id: 'otf-plain-luatex', title: 'OpenType in plain LuaTeX', tier: 'luaotfload', group: 'otf',
    engine: 'luatex', opentype: true,
    blurb: 'No LaTeX at all: \\input luaotfload.sty, then \\font with a file name and a list of OpenType features, in plain luatex writing DVI (with the small bundled patch that gives plain TeX luaotfload\'s shipout hook).',
    src: `% plain LuaTeX with OpenType: no fontspec, just luaotfload and \\font
\\input luaotfload.sty
\\font\\body="[lmroman10-regular.otf]:mode=node;+liga;+kern" at 11pt
\\font\\nolig="[lmroman10-regular.otf]:mode=node;-liga;+kern" at 11pt
\\font\\head="[lmroman17-regular.otf]:mode=node;+liga;+kern" at 20pt
\\font\\sans="[lmsans10-bold.otf]:mode=node;+liga;+kern" at 11pt
\\font\\caps="[lmromancaps10-regular.otf]:mode=node;+kern" at 11pt
\\hsize=10cm \\parindent=0pt \\nopagenumbers
{\\head Plain \\TeX, OpenType fonts}\\medskip
\\body A face is loaded by file name, with its OpenType features spelled out
after the colon: here {\\tt +liga} gives ffi, ffl and fi, and
{\\tt -liga} turns them off again: {\\nolig ffi, ffl, fi}.
Accented letters come from the Unicode input: Dvořák, Łódź, Ærøskøbing.
\\medskip
{\\sans A sans-serif bold face,} {\\caps and true small capitals.}
\\medskip
\\hrule
\\smallskip
{\\tt\\string\\input\\ luaotfload.sty} works in plain {\\tt luatex} to DVI here
thanks to a small patch that gives plain \\TeX\\ the shipout hook luaotfload needs.
\\bye`,
  },
  {
    id: 'otf-woff2', title: 'Web fonts instead of outlines', tier: 'woff2', group: 'otf',
    engine: 'lualatex', opentype: true, fonts: 'woff2',
    blurb: 'The same OpenType route with fonts: \'woff2\' (the toolbar\'s text setting): the SVG embeds a subset of each face as @font-face and writes real <text> elements, so the text can be selected and searched and is drawn by the browser\'s own rasteriser.',
    src: `\\documentclass[border=8pt]{standalone}
\\usepackage{fontspec,xcolor}
\\setmainfont{Latin Modern Roman}
\\begin{document}
\\begin{tabular}{@{}l@{}}
{\\Large Text as \\emph{text}, not outlines}\\\\[4pt]
With \\texttt{fonts: 'woff2'} the SVG embeds a subset of\\\\
each face as a web font and writes real \\texttt{<text>}:\\\\
it can be selected, searched and copied, and the browser's\\\\
own rasteriser draws it — \\textcolor{blue!60!black}{fi ffl}, Dvořák, Łódź.
\\end{tabular}
\\end{document}`,
  },
  {
    id: 'otf-unicode-math', title: 'unicode-math', tier: 'unicode-math', group: 'otf',
    engine: 'lualatex', opentype: 'math',
    blurb: 'Maths typed in Unicode (∀, ε, ∫, π², 𝔼) and set in Latin Modern Math through unicode-math, which needs the otf-fonts bundle as well as opentype; this example loads both.',
    src: `\\documentclass[border=8pt,varwidth=11cm]{standalone}
\\usepackage{unicode-math}
\\setmainfont{Latin Modern Roman}
\\setmathfont{Latin Modern Math}
\\begin{document}
Maths typed in Unicode, set in the OpenType maths font:
\\[ ∀ε>0\\;∃δ>0:\\quad |x-a|<δ ⟹ |f(x)-f(a)|<ε \\]
\\[ ∫_{-∞}^{∞} e^{-x²}\\,dx = \\sqrt{π}, \\qquad ∑_{n=1}^{∞} \\frac{1}{n²} = \\frac{π²}{6}, \\qquad
   𝔼[X] = ∫_Ω X\\,d\\mathbb{P}, \\qquad 𝐀𝐱 = 𝐛 \\]
\\end{document}`,
  },
];
