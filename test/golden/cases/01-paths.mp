beginfig(1);
  draw (0,0)..(30,40)..(60,0);
  draw (0,50)...(30,90)...(60,50);
  draw (0,100)---(30,140)---(60,100);
  draw (0,150)&(0,150)--(60,190) withcolor red;
  draw (100,0){up}..{right}(160,60);
  draw (100,80)..tension 2..(130,120)..tension 1.5 and 3..(160,80);
  draw (100,150){curl 0}..(130,190)..{curl 2}(160,150);
  draw (100,200)..controls (110,240) and (150,240)..(160,200);
  draw (200,0)..(230,40)..(260,0)..cycle;
  draw subpath (0.5,1.5) of ((200,80)..(230,120)..(260,80)..cycle) withpen pencircle scaled 2;
  draw reverse ((200,150)--(260,190)) shifted (0,10);
  draw (200,200) -- (260,240) dashed evenly;
endfig;
end.
