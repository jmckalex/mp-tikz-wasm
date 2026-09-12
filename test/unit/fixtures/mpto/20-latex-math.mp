verbatimtex
\documentclass{article}
\usepackage{amsmath}
\begin{document}
etex
beginfig(1);
  draw fullcircle scaled 100;
  label.top(btex $\displaystyle\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$ etex, (0,50));
  label.bot(btex \textbf{Hello} etex, (0,-50));
endfig;
verbatimtex \end{document} etex
end.
