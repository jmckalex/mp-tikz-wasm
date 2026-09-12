input boxes;
prologues := 3;
beginfig(1);
  boxit.a(btex $a$ etex); boxit.b(btex $b$ etex); circleit.c("c");
  b.w = a.e + (30,0); c.w = b.e + (30,0);
  drawboxed(a,b,c);
  drawarrow a.e -- b.w; drawarrow b.e -- c.w;
  boxjoin(a.se = b.ne; a.sw = b.nw);
  boxit.p(btex $p$ etex); boxit.q(btex $q$ etex); boxit.r(btex $r$ etex);
  p.n = (0,-30);
  drawboxed(p,q,r);
endfig;
input graph;
beginfig(2);
  draw begingraph(4cm, 3cm);
    gdraw "" ; % nothing
    glabel.bot(btex $x$ etex, OUT);
    glabel.lft(btex $y$ etex, OUT);
    for i = 1 upto 5: gdraw ((i, i*i)) withpen pencircle scaled 3; endfor
    gdraw (1,1)--(2,4)--(3,9)--(4,16)--(5,25) withcolor blue;
  endgraph;
endfig;
end.
