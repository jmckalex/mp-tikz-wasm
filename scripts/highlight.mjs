// highlight.mjs — a small build-time syntax highlighter for the guide's HTML
// and JavaScript fragments (plus the TeX and MetaPost bodies of the
// <script type="text/…"> tags in the HTML fragment). It emits
// <span class="tok-…"> wrappers around escaped text, so the guide stays a
// static page with no runtime dependency. Not a general highlighter: it
// covers what the guide's fragments contain.
const esc = (s) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const span = (cls, s) => (cls ? `<span class="tok-${cls}">${esc(s)}</span>` : esc(s));

const JS_KW = new Set(('import export from default const let var function return await async new if else for of in while do ' +
  'switch case break continue class extends this typeof instanceof try catch finally throw true false null undefined yield static').split(' '));
const JS_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|([A-Za-z_$][\w$]*\s*)?(`(?:\\[\s\S]|[^`\\])*`)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([\s\S])/g;
export function js(code) {
  let out = '';
  for (const m of code.matchAll(JS_RE)) {
    if (m[1]) out += span('com', m[1]);
    else if (m[3]) out += (m[2] ? esc(m[2]) : '') + span('str', m[3]);   // template literal, with an optional tag such as String.raw
    else if (m[4]) out += span('str', m[4]);
    else if (m[5]) out += span('num', m[5]);
    else if (m[6]) out += span(JS_KW.has(m[6]) ? 'kw' : '', m[6]);
    else out += esc(m[7]);
  }
  return out;
}

const TEX_RE = /(%[^\n]*)|(\\(?:[A-Za-z@]+|.))|(\$[^$\n]*\$)|([\s\S])/g;
export function tex(code) {
  let out = '';
  for (const m of code.matchAll(TEX_RE)) out += m[1] ? span('com', m[1]) : m[2] ? span('cs', m[2]) : m[3] ? span('str', m[3]) : esc(m[4]);
  return out;
}

const MP_KW = new Set(('beginfig endfig draw fill filldraw undraw drawarrow drawdblarrow label dotlabel withpen withcolor scaled shifted rotated ' +
  'slanted xscaled yscaled zscaled pencircle pensquare fullcircle halfcircle unitsquare cycle for upto downto step until endfor if else elseif fi ' +
  'def vardef enddef begingroup endgroup numeric pair path pen picture color string boolean transform end input btex etex verbatimtex').split(' '));
const MP_RE = /(%[^\n]*)|("[^"\n]*")|(btex\b[\s\S]*?\betex\b|verbatimtex\b[\s\S]*?\betex\b)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w.]*)|([\s\S])/g;
export function metapost(code) {
  let out = '';
  for (const m of code.matchAll(MP_RE)) {
    if (m[1]) out += span('com', m[1]);
    else if (m[2]) out += span('str', m[2]);
    else if (m[3]) out += span('kw', m[3].slice(0, m[3].startsWith('btex') ? 4 : 11)) + tex(m[3].slice(m[3].startsWith('btex') ? 4 : 11, -4)) + span('kw', 'etex');
    else if (m[4]) out += span('num', m[4]);
    else if (m[5]) out += span(MP_KW.has(m[5]) ? 'kw' : '', m[5]);
    else out += esc(m[6]);
  }
  return out;
}

// HTML: tags, attributes and values; <script> bodies by their type attribute.
const TAG_RE = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:\s+[^<>]*?)?\/?>/g;
const ATTR_RE = /(\s+)([^\s=\/>]+)(?:(=)("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
function tag(t) {
  if (t.startsWith('<!--')) return span('com', t);
  const m = /^(<\/?)([A-Za-z][\w-]*)([\s\S]*?)(\/?>)$/.exec(t);
  let out = esc(m[1]) + span('tag', m[2]);
  for (const a of m[3].matchAll(ATTR_RE)) out += esc(a[1]) + span('attr', a[2]) + (a[3] ? esc(a[3]) + span('val', a[4]) : '');
  return out + esc(m[4]);
}
export function html(code) {
  let out = '', pos = 0;
  for (const m of code.matchAll(TAG_RE)) {
    out += esc(code.slice(pos, m.index)) + tag(m[0]);
    pos = m.index + m[0].length;
    const open = /^<script\b([^>]*)>/i.exec(m[0]);
    if (open) {
      const end = code.indexOf('</script>', pos);
      if (end < 0) continue;
      const body = code.slice(pos, end);
      const type = /type\s*=\s*["']?([^"'\s>]+)/i.exec(open[1])?.[1] ?? 'text/javascript';
      out += type === 'text/tikz' || type === 'text/latex' ? tex(body) : type === 'text/metapost' ? metapost(body) : js(body);
      pos = end;
      TAG_RE.lastIndex = end;
    }
  }
  return out + esc(code.slice(pos));
}

export const LANGS = { html, js, tex, metapost };
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** Highlight every <pre><code class="lang-…">…</code></pre> block in an assembled page. */
export function highlightPage(page) {
  return page.replace(/<pre><code class="lang-(\w+)">([\s\S]*?)<\/code><\/pre>/g, (m, lang, body) =>
    LANGS[lang] ? `<pre><code class="lang-${lang}">${LANGS[lang](unesc(body))}</code></pre>` : m);
}
