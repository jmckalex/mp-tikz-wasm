randomseed := 42;
beginfig(1);
  numeric u; u := 10;
  for i = 0 upto 10: draw (i*u, 0)--(i*u, 100) withcolor (0.8,0.8,0.8); endfor
  for j = 0 step 2 until 10: draw (0, j*u)--(100, j*u) withcolor (0.8,0.8,0.8); endfor
  vardef spiral(expr n) = origin for k=1 upto n: ..(k*3*dir(k*30)) endfor enddef;
  draw spiral(40) shifted (50,50) withcolor red;
  def star(expr c, r) = for k=0 upto 4: (c + r*dir(90+144k)) -- endfor cycle enddef;
  fill star((150,50), 30) withcolor (1,0.8,0);
  draw star((150,50), 30);
  path p; p := (0,110){dir 60}..{dir -60}(100,110);
  numeric t; t := xpart (p intersectiontimes ((50,100)--(50,150)));
  draw p; draw point t of p withpen pencircle scaled 4;
  draw (arclength p / 10, 160) withpen pencircle scaled 3;
  z1 = (120,120); z2 = z1 + 30 dir 45; z3 = whatever[z1,z2]; y3 = 160;
  draw z1--z2--z3;
  string s; s := decimal 3.14159; label(s, (150,170));
  boolean b; b := (1 < 2) and not (2 < 1); if b: draw (180,150)--(200,170); fi
  pair q; q := 2[(0,0),(100,200)] rotated 10;
  draw q withpen pencircle scaled 3;
  draw unitsquare scaled 20 shifted (180,100) withcolor (uniformdeviate 1, 0, 0);
endfig;
end.
