import { MetaPost } from '../dist/index.js';
import { EXAMPLES } from './examples.js';
import { TIKZ_EXAMPLES } from './examples-tikz.js';

const $ = (s) => document.querySelector(s);
const status = $('#status'), source = $('#source'), gallery = $('#gallery'), blurb = $('#blurb');
const mode = $('#mode');
const panes = { preview: $('#preview'), svg: $('#svg pre'), eps: $('#eps pre'), json: $('#json pre'), log: $('#log pre'), stats: $('#stats'), diagnostics: $('#diagnostics') };

let mp = null;
let creating = null;
let current = null;
let dirty = false;
let running = false;
let queued = false;

function setStatus(html) { status.innerHTML = html; }

async function engine() {
  if (mp) return mp;
  if (!creating) {
    setStatus('<span class="spinner"></span>loading mplib.wasm + tex.wasm…');
    const t0 = performance.now();
    creating = MetaPost.create({
      worker: $('#worker').checked,
      tex: $('#tex').value,
      numberSystem: $('#numbers').value,
      log: () => {},
    }).then((m) => {
      mp = m;
      mp.on('progress', (e) => { if (running) setStatus(`<span class="spinner"></span>${e.phase}${e.detail ? ' ' + e.detail : ''}${e.total ? ` (${e.total} snippets)` : ''}`); });
      setStatus(`ready in <b>${(performance.now() - t0).toFixed(0)} ms</b> — MetaPost ${mp.version.metapost}, ${mp.version.tex}`);
      return mp;
    }).catch((e) => { setStatus(`<b style="color:var(--accent-2)">failed to load</b>: ${e.message}`); creating = null; throw e; });
  }
  return creating;
}

async function recreate() {
  if (mp) { mp.dispose(); mp = null; }
  creating = null;
  await engine();
  run();
}

function escapeHtml(s) { return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

async function run() {
  if (running) { queued = true; return; }
  running = true;
  try {
    const m = await engine();
    const src = source.value;
    const t0 = performance.now();
    setStatus('<span class="spinner"></span>running…');
    let r;
    if (mode.value === 'mp') {
      r = await m.run(src, { format: ['svg', 'eps', 'json'], tex: $('#tex').value });
    } else {
      // LaTeX/TikZ: adapt the result to the same shape the panes expect
      const l = await m.latex(src, { engine: mode.value === 'plain' ? 'plain' : 'auto' });   // auto: LuaTeX for graphdrawing / \directlua
      r = { status: l.status, history: l.status === 'ok' ? 0 : l.status === 'warning' ? 1 : 3, log: l.log + '\n\n--- dvisvgm ---\n' + l.dvisvgmLog, texLog: l.texLog,
        diagnostics: l.diagnostics, figures: l.pages.map((svg, i) => ({ charcode: i + 1, svg, eps: '(EPS is a MetaPost format; in TikZ mode the output is SVG only)', json: null, bbox: [0, 0, 0, 0] })),
        stats: { metapostMs: 0, metapostRuns: 0, texMs: l.stats.texMs, texRuns: 1, snippetCacheHits: 0, snippetCacheMisses: 0, dvisvgmMs: l.stats.dvisvgmMs } };
    }
    const ms = performance.now() - t0;
    const fig = r.figures[0];
    panes.preview.innerHTML = r.figures.length
      ? r.figures.map((f) => f.svg).join('<div style="width:100%;height:12px"></div>')
      : `<div style="color:var(--muted)">no figures (status ${r.status})</div>`;
    // scale each figure to the pane (the SVG carries a viewBox in PostScript points)
    for (const svg of panes.preview.querySelectorAll('svg')) {
      const w = parseFloat(svg.getAttribute('width')) || 100;
      svg.removeAttribute('height');
      svg.style.width = `min(100%, ${Math.max(w * 2.2, 240)}px)`;
    }
    panes.svg.textContent = r.figures.map((f) => f.svg).join('\n\n');
    panes.eps.textContent = r.figures.map((f) => f.eps).join('\n\n');
    panes.json.textContent = JSON.stringify(r.figures.map((f) => f.json), null, 1);
    panes.log.textContent = r.log + (r.texLog ? '\n\n--- TeX log ---\n' + r.texLog : '');
    panes.diagnostics.innerHTML = r.diagnostics.map((d) =>
      `<div class="diag ${d.severity}"><b>${escapeHtml(d.source)} ${d.severity}</b>: ${escapeHtml(d.message)}` +
      (d.line ? `<div class="where">${escapeHtml(d.file ?? 'job.mp')}:${d.line}${d.column ? ':' + d.column : ''}</div>` : '') +
      (d.snippet ? `<div class="where">${escapeHtml(d.snippet)}</div>` : '') +
      (d.help?.length ? `<div class="help">${escapeHtml(d.help.join('\n'))}</div>` : '') + `</div>`).join('');
    const s = r.stats;
    panes.stats.innerHTML = `<div class="stats">
      <div class="stat"><b>${ms.toFixed(0)} ms</b><span>round trip (main thread)</span></div>
      <div class="stat"><b>${s.metapostMs.toFixed(0)} ms</b><span>MetaPost, ${s.metapostRuns} run${s.metapostRuns === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${s.texMs.toFixed(0)} ms</b><span>TeX, ${s.texRuns} run${s.texRuns === 1 ? '' : 's'}</span></div>
      ${s.dvisvgmMs !== undefined ? `<div class="stat"><b>${s.dvisvgmMs.toFixed(0)} ms</b><span>dvisvgm</span></div>` : ''}
      <div class="stat"><b>${s.snippetCacheHits}/${s.snippetCacheHits + s.snippetCacheMisses}</b><span>snippet cache hits</span></div>
      <div class="stat"><b>${r.figures.length}</b><span>figure${r.figures.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${fig ? (fig.svg.length / 1024).toFixed(1) + ' KB' : '–'}</b><span>SVG size</span></div>
      <div class="stat"><b>${r.status}</b><span>history ${r.history}</span></div>
    </div>
    <p style="color:var(--muted);font-size:13px">bbox ${fig ? fig.bbox.map((v) => v.toFixed(2)).join(', ') : '–'} pt. Timings are for this machine; the first LaTeX run also fetches the format file (2.1 MB) and the fonts it needs, which the browser then caches.</p>`;
    const problems = r.diagnostics.filter((d) => d.severity === 'error').length;
    setStatus(`<b>${r.status}</b> in <b>${ms.toFixed(0)} ms</b> — ${mode.value === 'mp' ? `MetaPost ${s.metapostMs.toFixed(0)} ms` : `TeX ${s.texMs.toFixed(0)} ms, dvisvgm ${s.dvisvgmMs.toFixed(0)} ms`}${mode.value === 'mp' && s.texRuns ? `, TeX ${s.texMs.toFixed(0)} ms (${s.texRuns} run)` : ''}${problems ? `, <span style="color:var(--accent-2)">${problems} error${problems === 1 ? '' : 's'}</span>` : ''}`);
    if (problems && !$('#log').offsetParent) document.querySelector('.tabs button[data-pane="log"]').classList.add('attention');
  } catch (e) {
    setStatus(`<b style="color:var(--accent-2)">error</b>: ${escapeHtml(e.message ?? String(e))}`);
    panes.log.textContent = e.stack ?? String(e);
  } finally {
    running = false;
    if (queued) { queued = false; run(); }
  }
}

// galleries
const ALL = [...EXAMPLES.map((e) => ({ ...e, mode: 'mp' })), ...TIKZ_EXAMPLES.map((e) => ({ ...e, mode: e.plain ? 'plain' : 'latex' }))];
for (const ex of ALL) {
  const b = document.createElement('button');
  b.innerHTML = `${ex.title}<small>${ex.tier}</small>`;
  b.onclick = () => select(ex);
  b.dataset.id = ex.id;
  (ex.mode === 'mp' ? $('#gallery-mp') : $('#gallery-tikz')).appendChild(b);
}
function select(ex) {
  current = ex;
  for (const b of gallery.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === ex.id);
  source.value = ex.src;
  blurb.textContent = ex.blurb;
  mode.value = ex.mode;
  location.hash = ex.id;
  run();
}
mode.onchange = run;
// tabs
for (const b of document.querySelectorAll('.tabs button')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('active', x === b);
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== b.dataset.pane;
  };
}
$('#run').onclick = run;
let timer = null;
source.addEventListener('input', () => { if ($('#live').checked) { clearTimeout(timer); timer = setTimeout(run, 350); } });
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
$('#tex').onchange = run;
$('#numbers').onchange = recreate;
$('#worker').onchange = recreate;

// sizes footer
fetch('../dist/bundles/index.json').then((r) => r.json()).then((idx) => {
  $('#sizes').innerHTML = ' Bundles: ' + idx.bundles.map((b) => `${b.name} ${(b.bytes / 1024 / 1024).toFixed(1)} MB`).join(', ') + ' (fetched per file, on demand).';
}).catch(() => {});

const initial = ALL.find((e) => e.id === location.hash.slice(1)) ?? ALL[0];
select(initial);
