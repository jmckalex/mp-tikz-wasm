// page-common.js — shared by minimal.html and live.html: a CodeMirror mode for
// MetaPost, a small render queue that coalesces requests while the engine is
// busy, and helpers. Classic script (inlined into the single-file builds).
(function () {
  if (typeof CodeMirror !== 'undefined' && !CodeMirror.modes.metapost) {
    const KW = new Set(('beginfig endfig def enddef vardef primarydef secondarydef tertiarydef let newinternal input end for endfor forever upto downto step until ' +
      'if else elseif fi exitif exitunless save interim numeric pair path pen picture string boolean color cmykcolor rgbcolor transform ' +
      'draw fill filldraw undraw unfill unfilldraw drawarrow drawdblarrow drawdot label dotlabel thelabel clip setbounds addto also contour doublepath image nullpicture currentpicture ' +
      'scaled shifted rotated slanted xscaled yscaled zscaled reflectedabout rotatedaround transformed withpen withcolor withrgbcolor withcmykcolor withgreyscale dashed withprescript withpostscript ' +
      'pencircle pensquare pickup cycle controls tension curl and or not true false whatever intersectionpoint intersectiontimes cutbefore cutafter point of direction directionpoint directiontime ' +
      'length subpath reverse arclength arctime sqrt sind cosd mexp mlog floor ceiling round abs angle dir unitvector xpart ypart xxpart xypart yxpart yypart llcorner lrcorner ulcorner urcorner center bbox ' +
      'origin up down left right fullcircle halfcircle quartercircle unitsquare identity infinity epsilon prologues outputformat outputtemplate charcode message errmessage show showtoken shipout special ' +
      'write readfrom scantokens str suffix expr text primary secondary tertiary infont defaultfont defaultscale labeloffset ahlength ahangle linecap linejoin miterlimit dashpattern on off evenly withdots ' +
      'penpos penstroke mod div uniformdeviate normaldeviate known unknown cycle top bot lft rt ulft urt llft lrt').split(' '));
    CodeMirror.defineMode('metapost', () => ({
      startState: () => ({ tex: false }),
      token(stream, st) {
        if (st.tex) { if (stream.match(/^[\s\S]*?\betex\b/)) { st.tex = false; return 'string-2'; } stream.skipToEnd(); return 'string-2'; }
        if (stream.eatSpace()) return null;
        if (stream.match('%')) { stream.skipToEnd(); return 'comment'; }
        if (stream.match(/^(btex|verbatimtex)\b/)) { st.tex = true; return 'keyword'; }
        if (stream.match(/^"[^"]*"?/)) return 'string';
        if (stream.match(/^\d*\.?\d+/)) return 'number';
        if (stream.match(/^[A-Za-z_][A-Za-z_0-9']*/)) return KW.has(stream.current()) ? 'keyword' : 'variable';
        if (stream.match(/^(:=|\.\.\.|\.\.|--|->|<=|>=|<>|\+\+|\+-\+|[-+*\/=<>&:;,()\[\]{}])/)) return 'operator';
        stream.next(); return null;
      },
    }));
    CodeMirror.defineMIME('text/x-metapost', 'metapost');
  }
  // One render at a time per engine; a request that arrives while one is in
  // flight replaces any waiting one, so a slider drag never queues up work.
  globalThis.makeQueue = function (runFn) {
    let busy = false, pending = null;   // pending is a box, so a job of undefined still counts
    async function drain() {
      while (pending) { const { job } = pending; pending = null; busy = true; try { await runFn(job); } catch (e) { console.error(e); } busy = false; }
    }
    return (job) => { pending = { job }; if (!busy) drain(); };
  };
  globalThis.esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  globalThis.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
})();
