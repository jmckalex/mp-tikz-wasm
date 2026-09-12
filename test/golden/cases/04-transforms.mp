beginfig(1);
  path p; p := (0,0)--(30,0)--(30,20)--cycle;
  draw p; draw p shifted (40,0); draw p scaled 1.5 shifted (80,0);
  draw p xscaled 2 shifted (140,0); draw p yscaled 2 shifted (0,40);
  draw p rotated 30 shifted (60,40); draw p slanted 0.5 shifted (100,40);
  draw p reflectedabout ((0,0),(1,1)) shifted (160,40);
  draw p zscaled (1,1) shifted (0,100);
  draw p rotatedaround ((15,10), 90) shifted (60,100);
  transform t; t := identity rotated 45 scaled 1.2 shifted (120,100);
  draw p transformed t;
  draw fullcircle xscaled 60 yscaled 20 rotated 20 shifted (200,110);
  draw (0,140)--(230,140) withcolor 0.5;
  draw point 1 of p shifted (0,150) withpen pencircle scaled 4;
  draw precontrol 1 of p shifted (30,150) withpen pencircle scaled 4;
  draw postcontrol 1 of p shifted (60,150) withpen pencircle scaled 4;
  draw direction 1 of p shifted (90,150) withpen pencircle scaled 4;
endfig;
end.
