verbatimtex
\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}
etex
prologues := 3;
beginfig(1);
  draw fullcircle scaled 100;
  label.top(btex $\displaystyle\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}$ etex, (0,50));
  label.bot(btex \textbf{amsmath} $\begin{pmatrix} a & b \\ c & d \end{pmatrix}$ etex, (0,-50));
  label.lft(btex $\mathbb{R}^n \subseteq \mathcal{H}$ etex, (-50,0));
  label.rt(btex \begin{tabular}{cc} 1 & 2 \\ 3 & 4 \end{tabular} etex, (50,0));
  label(btex \parbox{3cm}{A paragraph of text that wraps onto several lines.} etex, (150,0));
endfig;
end.
