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
    id: 'latex-parshape-circle', title: 'A paragraph in a circle', tier: 'LaTeX',
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
    id: 'latex-parshape-wrap', title: 'Text around a figure', tier: 'LaTeX',
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
