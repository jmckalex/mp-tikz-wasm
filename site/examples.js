// examples.js — the gallery that drives the demo. Each entry is real MetaPost;
// the ones with btex/verbatimtex run TeX or LaTeX inside the browser.
export const EXAMPLES = [
  {
    id: 'hello', title: 'Hello, circle', tier: 'geometry',
    blurb: 'Pure geometry, no fonts. The whole run takes a few milliseconds.',
    src: `beginfig(1);
  draw fullcircle scaled 100 withpen pencircle scaled 1.5;
  for i = 0 upto 11:
    draw (0,0)--(50*dir(30i)) withcolor (i/11)[blue, red];
  endfor
endfig;
end.`,
  },
  {
    id: 'label', title: 'Labels without TeX', tier: 'tier 0',
    blurb: 'label() uses TFM metrics and Type 1 outlines: real glyph paths, no web fonts.',
    src: `prologues := 3;
beginfig(1);
  path p; p := fullcircle scaled 120;
  draw p withpen pencircle scaled 1;
  label.top("north", point 2 of p);
  label.bot("south", point 6 of p);
  label.lft("west", point 4 of p);
  label.rt("east", point 0 of p);
  label("MetaPost" infont "cmbx10" scaled 1.6, origin);
  dotlabel.urt("origin", origin);
endfig;
end.`,
  },
  {
    id: 'plain-tex', title: 'btex … etex with plain TeX', tier: 'tier 1',
    blurb: 'A real pdfTeX (DVI mode), compiled to WebAssembly, typesets the labels. Snippets are cached by content hash.',
    src: `prologues := 3;
beginfig(1);
  numeric a; a := 60;
  draw (-a,0)--(a,0) withcolor .6white; draw (0,-a)--(0,a) withcolor .6white;
  path f; f := (-a, a*sind(-90)) for t=-89 upto 90: ..(t*a/90, a*sind(t)) endfor;
  draw f withpen pencircle scaled 1.2 withcolor (0.1,0.3,0.8);
  label.top(btex $y=\\sin\\theta$ etex, (a/2, a*.9));
  label.bot(btex $-\\pi$ etex, (-a,0));
  label.bot(btex $\\pi$ etex, (a,0));
  label.rt(btex $\\displaystyle\\int_{-\\pi}^{\\pi}\\sin\\theta\\,d\\theta = 0$ etex, (a+8, -a*.8));
endfig;
end.`,
  },
  {
    id: 'latex', title: 'LaTeX with amsmath', tier: 'tier 2',
    blurb: 'A verbatimtex preamble selects LaTeX automatically. amsmath, amssymb and tabular all work; the format was built by the wasm engine itself.',
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
endfig;
end.`,
  },
  {
    id: 'boxes', title: 'boxes.mp diagram', tier: 'tier 1',
    blurb: 'The standard macro packages ship in the core bundle: boxes, graph, format, sarith…',
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
endfig;
end.`,
  },
  {
    id: 'graph', title: 'graph.mp plot', tier: 'tier 1',
    blurb: 'John Hobby\'s graph package with TeX-typeset axis labels; MetaPost picks the tick marks.',
    src: `input graph;
prologues := 3;
beginfig(1);
  draw begingraph(7cm, 4.5cm);
    glabel.lft(btex $f(x)$ etex, OUT);
    glabel.bot(btex $x$ etex, OUT);
    path p; p := (0,0) for i = 1 upto 60: ..(i/6, (i/6)*(i/6)*mexp(-256*(i/6))) endfor;
    gdraw p withpen pencircle scaled 1 withcolor (0.8,0.1,0.1);
    gdraw (0,0.5) for i = 1 upto 60: ..(i/6, sind(60i)/2+0.5) endfor withcolor (0.1,0.3,0.8);
    glabel.urt(btex $x^2e^{-x}$ etex, (4,0.3));
    glabel.top(btex $\\frac12(1+\\sin 60x)$ etex, (7,0.9));
  endgraph;
endfig;
end.`,
  },

  {
    id: 'koch', title: 'Recursion: Koch snowflake', tier: 'geometry',
    blurb: 'MetaPost is a real programming language; vardefs recurse and paths are first-class values joined with &.',
    src: `% Each segment a--b becomes four: the middle third is replaced by the two
% sides of an equilateral triangle pointing away from the interior.
vardef koch(expr a, b, n) =
  if n = 0: a--b
  else:
    save c, d, e; pair c, d, e;
    c = 1/3[a,b]; d = 2/3[a,b];
    e = 1/2[a,b] + ((b-a) rotated -90) scaled ((sqrt 3)/6);   % note: 3/6 alone would lex as one fraction token
    koch(a,c,n-1) & koch(c,e,n-1) & koch(e,d,n-1) & koch(d,b,n-1)
  fi
enddef;
beginfig(1);
  pair p, q, r; p = (-75,-43); q = (75,-43); r = (0, 87);   % counterclockwise
  path s; s := koch(p,q,4) & koch(q,r,4) & koch(r,p,4) & cycle;
  fill s withcolor (0.85,0.93,1);
  draw s withpen pencircle scaled .6 withcolor (0.1,0.3,0.7);
endfig;
end.`,
  },

  {
    id: 'clip', title: 'Clipping, pens, dashes', tier: 'geometry',
    blurb: 'Elliptical and polygonal pens, dash patterns, clip and setbounds — all rendered as SVG paths by MetaPost\'s own backend.',
    src: `beginfig(1);
  picture pic; pic := image(
    for i = -8 upto 8: draw (i*10,-80)--(i*10,80) withpen pencircle xscaled 3 yscaled 1 rotated 30 withcolor (0.2+i/20, 0.4, 0.8-i/20); endfor
  );
  clip pic to fullcircle scaled 150;
  draw pic;
  draw fullcircle scaled 150 dashed evenly scaled 2 withpen pencircle scaled 1.2;
  pickup pensquare scaled 6 rotated 45;
  draw (-90,-90)--(90,-90);
  draw (100,-80)--(100,80) dashed withdots scaled 1.5 withpen pencircle scaled 3;
endfig;
end.`,
  },
  {
    id: 'json', title: 'Structured output (JSON)', tier: 'geometry',
    blurb: 'Every figure is also available as typed objects: knots with control points, colours, pens, text runs. Switch to the JSON tab.',
    src: `beginfig(1);
  fill unitsquare scaled 40 withcolor (1,0.6,0);
  draw (0,0){up}..{right}(40,40) withpen pencircle scaled 2 withcolor blue;
  label("hi", (20,50));
endfig;
end.`,
  },
  {
    id: 'error', title: 'Diagnostics', tier: 'geometry',
    blurb: 'Errors come back as structured diagnostics with MetaPost\'s own help text — the run still produces what it can.',
    src: `beginfig(1);
  draw z1--z2;
  draw fullcircle scaled 50;
  undefinedmacro;
endfig;
end.`,
  },

  {
    id: 'lissajous', title: 'Lissajous curve', tier: 'geometry',
    blurb: 'A parametric curve traced by 720 pen dabs, each coloured by its phase — the colour is a blend picked by MetaPost arithmetic.',
    src: `beginfig(1);
  def couleur(expr x) =
    if x > .5: (2*(1-x))[red, blue] else: (1-2x)[blue, red] fi
  enddef;
  for i = 0 step .5 until 360:
    draw 90 * (sind(2i), cosd(3i))
      withpen pencircle scaled 2.5 withcolor couleur(i/360);
  endfor
endfig;
end.`,
  },
  {
    id: 'surface', title: 'A shaded 3D surface', tier: 'geometry',
    blurb: 'A height field drawn as 400 quadrilaterals, each shaded by the slope of its normal — Lambert lighting done entirely in MetaPost.',
    src: `beginfig(1);
  numeric u; u := 24;
  vardef project(expr x, y, z) = x*(-1,-1) + y*(1,0) + z*(0,1) enddef;
  vardef f(expr x, y) = sind(x/u*180)*sind(y/u*180)*u enddef;
  numeric m, M, inc, c; m := -2u; M := 2u; inc := .2u;
  for i = m step inc until M-inc:
    for j = m step inc until M-inc:
      path p;
      p = project(i,j,f(i,j)) -- project(i,j+inc,f(i,j+inc))
          -- project(i+inc,j+inc,f(i+inc,j+inc)) -- project(i+inc,j,f(i+inc,j)) -- cycle;
      c := 1 / sqrt( ((f(i,j)-f(i+inc,j))/inc)**2 + ((f(i,j)-f(i,j+inc))/inc)**2 + 1 );
      fill p withcolor c*(0.25,0.55,0.95) + (1-c)*(0.03,0.08,0.18);
      draw p withpen pencircle scaled .15 withcolor .35white;
    endfor
  endfor
endfig;
end.`,
  },
  {
    id: 'rose', title: 'Mystic rose', tier: 'geometry',
    blurb: 'Every chord of eleven points on a circle. The loops and the pair array A[] are plain MetaPost; the colour interpolates around the ring.',
    src: `beginfig(1);
  numeric n, u; n := 11; u := 90;
  pair A[]; for i = 0 upto n-1: A[i] = u*dir(360i/n); endfor
  for i = 0 upto n-1: for j = i+1 upto n-1:
    draw A[i]--A[j] withpen pencircle scaled .5
      withcolor (i/n)[(0.1,0.2,0.7), (0.7,0.1,0.3)];
  endfor endfor
  for i = 0 upto n-1: draw A[i] withpen pencircle scaled 4 withcolor (0.1,0.1,0.2); endfor
endfig;
end.`,
  },
  {
    id: 'blob', title: 'A gradient by nested fills', tier: 'geometry',
    blurb: 'No gradient primitive: the same path is filled fifty times at shrinking scales with a fading colour, so a smooth radial blend falls out.',
    src: `beginfig(1);
  numeric u; u := 42;
  path p; p := (0,0) .. (-1,1) .. (2,0) .. (0,-3) .. cycle; p := p shifted (-1,0);
  for i = 1 step -.02 until 0:
    fill p scaled (i*u) withcolor i*(0.15,0.5,1) + (1-i)*white;
  endfor
  draw p scaled u withpen pencircle scaled 1.4 withcolor (0.1,0.2,0.6);
endfig;
end.`,
  },
  {
    id: 'pentagram', title: 'Pentagram from linear equations', tier: 'geometry',
    blurb: 'The five inner vertices are never given coordinates: each is stated as the intersection of two diagonals with whatever, and MetaPost solves the linear system.',
    src: `beginfig(1);
  numeric u; u := 90;
  pair A, B, C, D, E;
  A := (0,u); B := A rotated 72; C := B rotated 72; D := C rotated 72; E := D rotated 72;
  pair AA, BB, CC, DD, EE;
  AA = whatever[A,C]; AA = whatever[B,D];
  BB = whatever[B,D]; BB = whatever[C,E];
  CC = whatever[C,E]; CC = whatever[D,A];
  DD = whatever[D,A]; DD = whatever[E,B];
  EE = whatever[E,B]; EE = whatever[A,C];
  fill A--C--E--B--D--cycle withcolor (1,0.82,0.2);
  fill AA--BB--CC--DD--EE--cycle withcolor (0.65,0.12,0.12);
  draw A--C--E--B--D--cycle withpen pencircle scaled 1.5 withcolor (0.4,0.05,0.05);
endfig;
end.`,
  },
];
