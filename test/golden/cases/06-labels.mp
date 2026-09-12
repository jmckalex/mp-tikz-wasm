prologues := 3;
beginfig(1);
  draw fullcircle scaled 100;
  label.top("top", (0,50)); label.bot("bot", (0,-50));
  label.lft("lft", (-50,0)); label.rt("rt", (50,0));
  label.ulft("ulft", (-35,35)); label.urt("urt", (35,35));
  label.llft("llft", (-35,-35)); label.lrt("lrt", (35,-35));
  dotlabel("dot", origin);
  label("MetaPost", (0,80));
  label("scaled" infont defaultfont scaled 1.5, (0,-80));
  label("rotated" infont "cmr10" rotated 45, (100,0));
  draw "cmbx10 bold" infont "cmbx10" shifted (100,60);
  draw "cmti10 italic" infont "cmti10" shifted (100,40);
  draw "cmtt10 mono" infont "cmtt10" shifted (100,20);
  draw thelabel.rt("thelabel", (100,-40));
  label("colored", (100,-60)) withcolor red;
  labeloffset := 8; label.top("offset 8", (0,110));
endfig;
end.
