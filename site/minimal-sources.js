// minimal-sources.js — the two documents on minimal.html (a classic script so the
// same file can be inlined into the single-file build; the builder also reads it).
globalThis.PAGE_SOURCES = {
  metapost: `prologues := 3;
verbatimtex \\documentclass{article}\\usepackage{amsmath}\\begin{document} etex

beginfig(1);
  path c; c := fullcircle scaled 130;
  fill c withcolor (0.93, 0.95, 1);
  for i = 0 upto 23:
    draw origin -- (60 dir (15i)) withcolor (i/23)[(0.1,0.3,0.8), (0.8,0.2,0.1)];
  endfor
  draw c withpen pencircle scaled 1.2;
  label.top(btex $\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt\\pi}{2}$ etex, (0, 72));
  label.bot(btex MetaPost 2.11, typeset by pdf\\TeX\\ --- all in your browser etex, (0, -72));
  dotlabel.urt(btex $O$ etex, origin);
endfig;
end.`,
  tikz: `\\documentclass[tikz,border=4pt]{standalone}
\\usetikzlibrary{shadings,patterns,arrows.meta,decorations.pathmorphing}
\\begin{document}
\\begin{tikzpicture}
  \\shade[ball color=blue!60] (0,0) circle (1);
  \\draw[-{Stealth[length=3mm]},thick] (1.4,-0.9) -- (3.6,0.7) node[right] {$\\vec v$};
  \\draw[decorate,decoration={snake,amplitude=1mm},red,thick] (1.4,-1.6) -- (3.6,-1.6);
  \\fill[pattern=north east lines,pattern color=orange] (4.2,-1.1) rectangle (5.4,0.4);
  \\node[align=center,font=\\small] at (2.4,-2.5) {TikZ with real \\LaTeX, pdf\\TeX\\ and dvisvgm\\\\ shadings, patterns and decorations included};
\\end{tikzpicture}
\\end{document}`,
};
