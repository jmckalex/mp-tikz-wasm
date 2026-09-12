beginfig(1);
  picture pic; pic := nullpicture;
  addto pic contour fullcircle scaled 100 withcolor (0.8,0.8,1);
  addto pic doublepath (-60,-60)--(60,60) withpen pencircle scaled 3;
  clip pic to unitsquare scaled 80 shifted (-40,-40);
  draw pic;
  picture q; q := image(draw fullcircle scaled 30; draw (-20,0)--(20,0););
  setbounds q to unitsquare scaled 10 shifted (-5,-5);
  draw q shifted (100,0);
  draw bbox q shifted (100,0) dashed evenly;
  picture r; r := image(fill fullcircle scaled 40 withcolor red; clip currentpicture to halfcircle scaled 40;);
  draw r shifted (0,100);
  draw bbox r shifted (0,100) withcolor blue;
  draw bbox pic;
endfig;
end.
