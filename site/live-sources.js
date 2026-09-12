// live-sources.js — the generators behind live.html: each returns a complete
// MetaPost or LaTeX document for the current parameters. A classic script so it
// can be inlined into the single-file build; the builder reads it too.
globalThis.PAGE_SOURCES = {
  // A harmonograph: two damped pendulums per axis, drawn as one MetaPost path.
  harmonograph: ({ f1 = 3, f2 = 2, f3 = 3, f4 = 2, phase = 45, damping = 0.3, hue = 0.62 } = {}) => `
beginfig(1);
  numeric fa, fb, fc, fd, ph, d, A;
  fa := ${f1}; fb := ${f2}; fc := ${f3}; fd := ${f4}; ph := ${phase}; d := ${damping}; A := 70;
  path p;
  p := (0,0) for t = 2 step 2 until 2400:
    .. (A*mexp(-d*t/8)*sind(fa*t + ph) + A*mexp(-d*t/6)*sind(fb*t),
        A*mexp(-d*t/8)*sind(fc*t)      + A*mexp(-d*t/6)*sind(fd*t + ph))
  endfor;
  color c; c := (${hue.toFixed(3)}, ${(1 - hue).toFixed(3)}, 0.55);
  draw p withpen pencircle scaled 0.45 withcolor 0.75[c, black];
endfig;
end.`,
  // One frame of a spinning wire-frame cube in perspective; t is seconds.
  // The two rotation angles are reduced modulo 360 here, so the numbers MetaPost
  // sees stay small however long the animation has been running.
  cube: (t = 0) => `
beginfig(1);
  numeric a, b, s; a := ${((37 * t) % 360).toFixed(3)}; b := ${((23 * t) % 360).toFixed(3)}; s := 52;
  vardef proj(expr x, y, z) =
    save yb, zb, xc, zc; numeric yb, zb, xc, zc;
    yb := y*cosd(b) - z*sind(b); zb := y*sind(b) + z*cosd(b);
    xc := x*cosd(a) - zb*sind(a); zc := x*sind(a) + zb*cosd(a);
    (xc*s*220/(220 + zc*s), yb*s*220/(220 + zc*s))
  enddef;
  pair v[]; numeric k; k := 0;
  for i = -1, 1: for j = -1, 1: for l = -1, 1: v[k] := proj(i, j, l); k := k + 1; endfor endfor endfor
  for e = 0 upto 7: for f = e + 1 upto 7:
    if (f - e = 1) and (e mod 2 = 0): draw v[e] -- v[f] withpen pencircle scaled 1.1 withcolor (0.1, 0.3, 0.7); fi
    if (f - e = 2) and (e mod 4 < 2): draw v[e] -- v[f] withpen pencircle scaled 1.1 withcolor (0.1, 0.3, 0.7); fi
    if (f - e = 4): draw v[e] -- v[f] withpen pencircle scaled 1.1 withcolor (0.1, 0.3, 0.7); fi
  endfor endfor
  for i = 0 upto 7: fill fullcircle scaled 4.5 shifted v[i] withcolor (0.85, 0.25, 0.1); endfor
  setbounds currentpicture to unitsquare shifted (-0.5,-0.5) scaled 200;
endfig;
end.`,
  // An analogue clock in TikZ for the given time.
  clock: (h = 10, m = 8, s = 42) => `\\documentclass[tikz,border=3pt]{standalone}
\\begin{document}
\\begin{tikzpicture}
  \\draw[fill=blue!4,thick] (0,0) circle (2);
  \\foreach \\i in {1,...,12} { \\draw[thick] (\\i*30:1.8) -- (\\i*30:2); \\node[font=\\small] at (90-\\i*30:1.55) {\\i}; }
  \\foreach \\i in {0,...,59} \\draw (\\i*6:1.9) -- (\\i*6:2);
  \\draw[line width=2.2pt,line cap=round] (0,0) -- (${(90 - ((h % 12) * 30 + m / 2)).toFixed(2)}:1.05);
  \\draw[line width=1.6pt,line cap=round] (0,0) -- (${(90 - (m * 6 + s / 10)).toFixed(2)}:1.55);
  \\draw[red,line width=0.6pt] (0,0) -- (${(90 - s * 6).toFixed(2)}:1.75);
  \\fill (0,0) circle (2.2pt); \\fill[red] (0,0) circle (1.2pt);
\\end{tikzpicture}
\\end{document}`,
  // A damped oscillator plotted by pgfplots.
  plot: ({ A = 1, k = 0.3, w = 2 } = {}) => `\\documentclass[border=3pt]{standalone}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{document}
\\begin{tikzpicture}
  \\begin{axis}[width=9.5cm,height=5.8cm,domain=0:10,samples=140,ymin=-1.15,ymax=1.15,grid=major,
                xlabel={$t$},ylabel={$y(t)$},title={$y = ${A}\\,e^{-${k} t}\\cos(${w} t)$}]
    \\addplot[blue,thick] {${A}*exp(-${k}*x)*cos(deg(${w}*x))};
    \\addplot[red,dashed] {${A}*exp(-${k}*x)};
    \\addplot[red,dashed] {-${A}*exp(-${k}*x)};
  \\end{axis}
\\end{tikzpicture}
\\end{document}`,
};
