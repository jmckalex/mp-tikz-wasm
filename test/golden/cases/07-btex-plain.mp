prologues := 3;
beginfig(1);
  draw fullcircle scaled 100;
  label.top(btex $\sqrt{x^2+y^2}$ etex, (0,50));
  label.bot(btex $\sum_{i=1}^n i = {n(n+1)\over 2}$ etex, (0,-50));
  label.lft(btex Plain \TeX\ text etex, (-50,0));
  label.rt(btex \vbox{\hbox{two}\hbox{lines}} etex, (50,0));
  label(btex $\alpha\beta\gamma$ etex rotated 30, (120,0));
  label(btex {\bf bold} {\it italic} {\tt mono} etex, (120,40));
  label(btex $\int_0^1 f(x)\,dx$ etex scaled 1.5, (120,-40));
endfig;
end.
