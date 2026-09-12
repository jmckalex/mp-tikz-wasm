beginfig(1);
  draw (0,0)--(50,50) withpen pencircle scaled 4;
  draw (60,0)--(110,50) withpen pensquare scaled 4;
  draw (120,0)--(170,50) withpen pencircle xscaled 6 yscaled 2 rotated 30;
  draw (0,60)--(50,110) withpen pencircle scaled 3 dashed evenly scaled 2;
  draw (60,60)--(110,110) withpen pencircle scaled 3 dashed withdots;
  linecap := butt; draw (120,60)--(170,110) withpen pencircle scaled 6;
  linecap := squared; draw (180,60)--(230,110) withpen pencircle scaled 6;
  linecap := rounded; linejoin := mitered; miterlimit := 2;
  draw (0,120)--(25,170)--(50,120) withpen pencircle scaled 5;
  linejoin := beveled; draw (60,120)--(85,170)--(110,120) withpen pencircle scaled 5;
  linejoin := rounded; draw (120,120)--(145,170)--(170,120) withpen pencircle scaled 5;
  pickup pencircle scaled 1.5; draw fullcircle scaled 40 shifted (210,145);
  pickup makepen ((0,0)--(4,0)--(4,4)--(0,4)--cycle); draw (180,0)--(230,50);
endfig;
end.
