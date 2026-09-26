// theme.js — the light/dark switch shared by the demo pages. The pages follow
// the system setting until the reader presses a [data-theme-toggle] button;
// the choice is kept in localStorage (when the browser allows it) and applied
// before first paint, because this is a classic script in <head>. Inlined by
// the page builders into the generated pages, linked by the others.
(function () {
  var KEY = 'mp-tikz-wasm-theme', root = document.documentElement;
  try { var saved = localStorage.getItem(KEY); if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved); } catch (e) { /* storage blocked: follow the system */ }
  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function label() {
    var next = current() === 'dark' ? 'light' : 'dark';
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) { buttons[i].setAttribute('aria-label', 'Switch to ' + next + ' mode'); buttons[i].title = 'Switch to ' + next + ' mode'; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!b) return;
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (err) { /* not remembered, still applied */ }
    label();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', label); else label();
})();
