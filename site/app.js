import { MetaPost, DEFAULT_BUNDLES } from '../dist/index.js';
import { EXAMPLES } from './examples.js';
import { TIKZ_EXAMPLES } from './examples-tikz.js';

const $ = (s) => document.querySelector(s);
const status = $('#status'), source = $('#source'), gallery = $('#gallery'), blurb = $('#blurb'), badges = $('#badges');
const mode = $('#mode');
const panes = { preview: $('#preview'), svg: $('#svg pre'), eps: $('#eps pre'), json: $('#json pre'), log: $('#log pre'), stats: $('#stats'), diagnostics: $('#diagnostics') };
// the TeX modes and the engine each asks mp.latex() for; 'latex' is auto: LuaTeX when the document needs it
const ENGINES = { latex: 'auto', lualatex: 'lualatex', luatex: 'luatex', plain: 'plain' };
const LABELS = { auto: 'TeX', latex: 'pdfTeX', lualatex: 'LuaLaTeX', luatex: 'LuaTeX', plain: 'plain TeX' };

let mp = null;
let creating = null;
let current = null;
let running = false;
let queued = false;
let lastSvg = '';

function setStatus(html, state = 'busy') {
  const dot = state === 'busy' ? '<span class="spinner"></span>' : `<span class="dot ${state}"></span>`;
  status.innerHTML = `${dot}<span>${html}</span>`;
}

// OpenType is opt-in: with the bundles loaded, LaTeX under LuaTeX initialises luaotfload on every run
const bundles = () => $('#opentype').checked ? [...DEFAULT_BUNDLES, 'opentype', 'otf-fonts'] : undefined;

async function engine() {
  if (mp) return mp;
  if (!creating) {
    const where = $('#worker').checked ? 'in a Web Worker' : 'on the page thread';
    setStatus(`loading mplib.wasm + tex.wasm ${where}…`);
    const t0 = performance.now();
    creating = MetaPost.create({
      worker: $('#worker').checked,
      tex: $('#tex').value,
      numberSystem: $('#numbers').value,
      logLevel: $('#loglevel').value,   // the browser console; the Log tab has the transcript itself
      bundles: bundles(),
      timeoutMs: 120000,   // a stall limit, not a total: the knots example computes for seconds without a word of output
    }).then((m) => {
      mp = m;
      mp.on('progress', (e) => { if (running) setStatus(`${e.phase}${e.detail ? ' ' + e.detail : ''}${e.total ? ` (${e.total} snippets)` : ''}`); });
      setStatus(`ready in <b>${(performance.now() - t0).toFixed(0)} ms</b> — MetaPost ${mp.version.metapost}, ${mp.version.tex}, ${where}${$('#opentype').checked ? ', OpenType bundles loaded' : ''}`, 'ok');
      return mp;
    }).catch((e) => { setStatus(`<b style="color:var(--bad)">failed to load</b>: ${escapeHtml(e.message)}`, 'bad'); creating = null; throw e; });
  }
  return creating;
}

async function recreate() {
  while (running) await new Promise((r) => setTimeout(r, 50));   // let a run in flight finish on the old engine
  if (creating) await creating.catch(() => {});
  if (mp) { mp.dispose(); mp = null; }
  creating = null;
  await engine();
  run();
}

function escapeHtml(s) { return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }

async function run() {
  if (running) { queued = true; return; }
  running = true;
  try {
    const m = await engine();
    const src = source.value;
    const t0 = performance.now();
    setStatus('running…');
    let r, format = '';
    if (mode.value === 'mp') {
      r = await m.run(src, { format: ['svg', 'eps', 'json'], tex: $('#tex').value });
    } else {
      // LaTeX, LuaTeX, plain TeX: adapt the result to the shape the panes expect
      const l = await m.latex(src, { engine: ENGINES[mode.value] ?? 'auto', fonts: $('#fonts').value });
      format = l.format;
      r = { status: l.status, history: l.status === 'ok' ? 0 : l.status === 'warning' ? 1 : 3, log: l.log + '\n\n--- dvisvgm ---\n' + l.dvisvgmLog, texLog: l.texLog,
        diagnostics: l.diagnostics, figures: l.pages.map((svg, i) => ({ charcode: i + 1, svg, eps: '(EPS is a MetaPost format; in the TeX modes the output is SVG only)', json: null, bbox: [0, 0, 0, 0] })),
        stats: { metapostMs: 0, metapostRuns: 0, texMs: l.stats.texMs, texRuns: 1, snippetCacheHits: 0, snippetCacheMisses: 0, dvisvgmMs: l.stats.dvisvgmMs } };
    }
    const ms = performance.now() - t0;
    const fig = r.figures[0];
    lastSvg = fig?.svg ?? '';
    $('#download').disabled = !lastSvg;
    panes.preview.innerHTML = r.figures.length
      ? r.figures.map((f) => f.svg).join('')
      : `<span class="placeholder">no figures (status ${escapeHtml(r.status)}) — see the Log tab</span>`;
    // scale each figure to the pane (the SVG carries a viewBox; MetaPost's width is in px, dvisvgm's in pt)
    for (const svg of panes.preview.querySelectorAll(':scope > svg')) {
      const wAttr = svg.getAttribute('width') || '';
      const w = (parseFloat(wAttr) || 100) * (/pt$/.test(wAttr) ? 96 / 72 : 1);
      svg.removeAttribute('height');
      svg.style.width = `min(100%, ${Math.round(Math.max(w * 1.6, 240))}px)`;
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
      <div class="stat"><b>${ms.toFixed(0)} ms</b><span>round trip, seen from the page</span></div>
      ${mode.value === 'mp' ? `<div class="stat"><b>${s.metapostMs.toFixed(0)} ms</b><span>MetaPost, ${s.metapostRuns} run${s.metapostRuns === 1 ? '' : 's'}</span></div>` : ''}
      <div class="stat"><b>${s.texMs.toFixed(0)} ms</b><span>${mode.value === 'mp' ? 'TeX' : escapeHtml(format || 'TeX')}, ${s.texRuns} run${s.texRuns === 1 ? '' : 's'}</span></div>
      ${s.dvisvgmMs !== undefined ? `<div class="stat"><b>${s.dvisvgmMs.toFixed(0)} ms</b><span>dvisvgm</span></div>` : ''}
      ${mode.value === 'mp' ? `<div class="stat"><b>${s.snippetCacheHits}/${s.snippetCacheHits + s.snippetCacheMisses}</b><span>label cache hits</span></div>` : ''}
      <div class="stat"><b>${r.figures.length}</b><span>${mode.value === 'mp' ? 'figure' : 'page'}${r.figures.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${fig ? (fig.svg.length / 1024).toFixed(1) + ' KB' : '–'}</b><span>SVG size</span></div>
      <div class="stat"><b>${escapeHtml(r.status)}</b><span>${$('#worker').checked ? 'Web Worker' : 'page thread'}</span></div>
    </div>
    <p class="stats-note">${mode.value === 'mp' && fig ? `bbox ${fig.bbox.map((v) => v.toFixed(2)).join(', ')} pt. ` : ''}Timings are for this machine. A first run also fetches the files it needs (a format, fonts, macro packages), which the browser then caches; the first OpenType run scans the font family once per engine.</p>`;
    const problems = r.diagnostics.filter((d) => d.severity === 'error' || d.severity === 'fatal').length;
    const what = mode.value === 'mp' ? `MetaPost ${s.metapostMs.toFixed(0)} ms${s.texRuns ? `, TeX ${s.texMs.toFixed(0)} ms` : ''}` : `${escapeHtml(format || LABELS[ENGINES[mode.value]] || 'TeX')} ${s.texMs.toFixed(0)} ms, dvisvgm ${s.dvisvgmMs.toFixed(0)} ms`;
    setStatus(`<b>${escapeHtml(r.status)}</b> in <b>${ms.toFixed(0)} ms</b> — ${what}${problems ? `, <span style="color:var(--bad)">${problems} error${problems === 1 ? '' : 's'}</span>` : ''}`, problems ? 'bad' : 'ok');
    document.querySelector('.tabs button[data-pane="log"]').classList.toggle('attention', problems > 0 && $('#log').hidden);
  } catch (e) {
    setStatus(`<b style="color:var(--bad)">error</b>: ${escapeHtml(e.message ?? String(e))}`, 'bad');
    panes.log.textContent = e.stack ?? String(e);
    // a run killed by the watchdog takes its worker with it: start a fresh engine for the next run
    if (/terminated|worker/i.test(e.message ?? '') && mp) { try { mp.dispose(); } catch {} mp = null; creating = null; }
  } finally {
    running = false;
    if (queued) { queued = false; run(); }
  }
}

// ---------------------------------------------------------------- the gallery
const GROUPS = [
  ['mp', 'MetaPost'],
  ['tikz', 'TikZ and PGF'],
  ['tex', 'LaTeX and plain TeX'],
  ['lua', 'LuaTeX'],
  ['otf', 'OpenType fonts'],
  ['features', 'Library features'],
];
const modeOf = (e) => e.engine === 'luatex' ? 'luatex' : e.engine === 'lualatex' ? 'lualatex' : e.plain ? 'plain' : 'latex';
const ALL = [...EXAMPLES.map((e) => ({ group: 'mp', ...e, mode: 'mp' })), ...TIKZ_EXAMPLES.map((e) => ({ group: 'tikz', ...e, mode: modeOf(e) }))];
const chipClass = (e) => e.group === 'otf' ? 'otf' : e.group === 'lua' || /lua/.test(e.mode) ? 'lua' : e.mode === 'mp' ? 'mp' : 'tikz';
for (const [id, title] of GROUPS) {
  const items = ALL.filter((e) => e.group === id);
  if (!items.length) continue;
  const h = document.createElement('h2'); h.textContent = title;
  const box = document.createElement('div'); box.className = 'group'; box.id = `gallery-${id}`;
  for (const ex of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<span class="t">${escapeHtml(ex.title)}</span><span class="chip ${chipClass(ex)}">${escapeHtml(ex.tier)}</span>`;
    b.onclick = () => select(ex);
    b.dataset.id = ex.id;
    box.appendChild(b);
  }
  gallery.append(h, box);
}

function describe(ex) {
  const tags = [];
  const engineName = ex.mode === 'mp' ? 'MetaPost' : ex.mode === 'luatex' ? 'plain LuaTeX' : ex.mode === 'lualatex' ? 'LuaLaTeX' : ex.mode === 'plain' ? 'plain TeX' : /graphdrawing|\\directlua/.test(ex.src) ? 'LuaLaTeX (auto)' : 'pdfLaTeX';
  tags.push(`<span class="chip ${chipClass(ex)}">${engineName}</span>`);
  if (ex.opentype) tags.push(`<span class="chip otf">bundles +opentype${ex.opentype === 'math' ? ' +otf-fonts' : ''}</span>`);
  if (ex.fonts) tags.push(`<span class="chip">fonts: ${escapeHtml(ex.fonts)}</span>`);
  for (const [k, v] of Object.entries(ex.settings ?? {})) tags.push(`<span class="chip">${k}: ${escapeHtml(String(v))}</span>`);
  badges.innerHTML = tags.join('');
  blurb.textContent = ex.blurb;
}

function select(ex) {
  current = ex;
  for (const b of gallery.querySelectorAll('button')) b.classList.toggle('active', b.dataset.id === ex.id);
  source.value = ex.src;
  describe(ex);
  mode.value = ex.mode;
  history.replaceState(null, '', '#' + ex.id);
  // an example may need the engine set up differently: apply that, recreating it only when necessary
  let rebuild = false;
  $('#fonts').value = ex.fonts ?? 'paths';
  if (ex.opentype && !$('#opentype').checked) { $('#opentype').checked = true; rebuild = true; }
  const set = ex.settings ?? {};
  if (set.numbers && $('#numbers').value !== set.numbers) { $('#numbers').value = set.numbers; rebuild = true; }
  if (set.worker !== undefined && $('#worker').checked !== set.worker) { $('#worker').checked = set.worker; rebuild = true; }
  if (set.log) { $('#loglevel').value = set.log; if (mp) mp.logLevel = set.log; }
  if (rebuild && (mp || creating)) recreate(); else run();
}

// ---------------------------------------------------------------- controls
mode.onchange = run;
for (const b of document.querySelectorAll('.tabs button[data-pane]')) {
  b.onclick = () => {
    for (const x of document.querySelectorAll('.tabs button[data-pane]')) x.classList.toggle('active', x === b);
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== b.dataset.pane;
    if (b.dataset.pane === 'log') b.classList.remove('attention');
  };
}
$('#run').onclick = run;
let timer = null;
source.addEventListener('input', () => { if ($('#live').checked) { clearTimeout(timer); timer = setTimeout(run, 350); } });
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
$('#tex').onchange = run;
$('#fonts').onchange = run;
$('#numbers').onchange = recreate;
$('#worker').onchange = recreate;
$('#opentype').onchange = recreate;
$('#loglevel').onchange = () => { if (mp) mp.logLevel = $('#loglevel').value; };
$('#download').onclick = () => {
  if (!lastSvg) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastSvg], { type: 'image/svg+xml' }));
  a.download = `${current?.id ?? 'figure'}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// sizes, in the footer
fetch('../dist/bundles/index.json').then((r) => r.json()).then((idx) => {
  $('#sizes').textContent = 'Bundles: ' + idx.bundles.map((b) => `${b.name} ${(b.bytes / 1024 / 1024).toFixed(1)} MB`).join(', ') + ' — fetched a file at a time, when a document first needs it.';
}).catch(() => {});

const initial = ALL.find((e) => e.id === location.hash.slice(1)) ?? ALL[0];
select(initial);
