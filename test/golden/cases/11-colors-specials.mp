beginfig(1);
  for i=0 upto 9: fill unitsquare scaled 20 shifted (i*22,0) withcolor (i/9)[blue, red]; endfor
  fill unitsquare scaled 20 shifted (0,30) withcmykcolor (0,1,1,0);
  fill unitsquare scaled 20 shifted (22,30) withgreyscale 0.3;
  fill unitsquare scaled 20 shifted (44,30) withrgbcolor (0.2,0.6,0.9);
  fill unitsquare scaled 20 shifted (66,30) withoutcolor;
  draw unitsquare scaled 20 shifted (88,30) withprescript "%%a prescript" withpostscript "%%a postscript";
  special "%% a special line";
  fill fullcircle scaled 30 shifted (150,40) withcolor red withprescript "transparency";
endfig;
end.
