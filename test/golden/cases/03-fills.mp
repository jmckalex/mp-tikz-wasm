beginfig(1);
  fill fullcircle scaled 50 shifted (25,25) withcolor (1,0,0);
  fill unitsquare scaled 40 shifted (60,5) withcolor 0.5;
  fill fullcircle scaled 50 shifted (135,25) withcmykcolor (1,0,0,0);
  filldraw fullcircle scaled 40 shifted (185,25) withcolor green withpen pencircle scaled 2;
  path p; p := fullcircle scaled 60 shifted (30,90);
  fill p; unfill fullcircle scaled 30 shifted (30,90);
  path a, b; a := fullcircle scaled 60 shifted (100,90); b := fullcircle scaled 60 shifted (130,90);
  fill buildcycle(a,b) withcolor blue;
  fill (170,60)--(230,60)--(230,120)--(170,120)--cycle withcolor (0.9,0.8,0.1);
  fill (180,70)--(220,70)--(220,110)--(180,110)--cycle withcolor white;
  draw (0,0)--(240,0) withcolor 0.7;
endfig;
end.
