beginfig(1);
  path p[]; numeric n; n := 6;
  for i = 1 upto n: p[i] := fullcircle scaled (10*i); endfor
  for i = 1 upto n: draw p[i] withpen pencircle scaled (0.2*i); endfor
  pickup pencircle scaled 1;
  draw p3 shifted (80,0) cutbefore p2 shifted (80,10) cutafter p2 shifted (80,-10) withcolor red;
  pair a, b; a = (0,80); b = (60,120);
  draw a{right}..b{up} .. cycle;
  draw (a -- b) shifted (80,0) withpen pencircle scaled 0.3;
  draw fullcircle scaled 20 shifted (a + 1/3[a,b]);
  interim linejoin := mitered;
  draw (0,140)--(20,170)--(40,140) withpen pencircle scaled 3;
endfig;
end.
