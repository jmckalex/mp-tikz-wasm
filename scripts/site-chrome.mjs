// site-chrome.mjs — what every demo page shares, for the page builders
// (build-pages.mjs, build-guide.mjs, build-standalone.mjs): the stylesheet and
// the theme switch from site/theme.css and site/theme.js, the web-font link,
// and the site bar. Templates carry the placeholders __FONTS__, __THEME_CSS__,
// __THEME_JS__ and __SITEBAR:<page>__; `chrome()` fills them in. index.html and
// tags.html are not generated and carry the same markup by hand.
import fs from 'node:fs';
import path from 'node:path';

const SITE = path.resolve(new URL('../site', import.meta.url).pathname);
export const REPO_URL = process.env.REPO_URL ?? 'https://github.com/jmckalex/mp-tikz-wasm';
/** Where the pages are hosted: the links of a page that may travel alone (the single-file builds) point here. */
export const SITE_URL = process.env.SITE_URL ?? 'https://eschatolog.ist/software/mp-tikz-wasm/site/';

export const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">';

export const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.6 15.2C7 5.5 10.6 18.5 20.4 8.6" fill="none" stroke="#b5651d" stroke-width="1.9" stroke-linecap="round"/></svg>';
export const FAVICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(LOGO.replace('aria-hidden="true"', 'xmlns="http://www.w3.org/2000/svg"').replace('currentColor', '#1f4e9c'))}">`;

const PAGES = [
  ['guide', 'guide.html', 'Guide'],
  ['index', 'index.html', 'Gallery'],
  ['tags', 'tags.html', 'Tags'],
  ['live', 'live.html', 'Live'],
  ['minimal', 'minimal.html', 'Editors'],
  ['standalone', 'standalone.html', 'Single file'],
];

/** The site bar; `base` is prefixed to every page link ('' for pages served next to each other). */
export function sitebar(current, base = '') {
  const links = PAGES.map(([id, href, label]) => `<a href="${base}${href}"${id === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<header class="sitebar">
  <a class="brand" href="${base}guide.html">${LOGO}mp-tikz-wasm</a>
  <nav aria-label="Demo pages">${links}</nav>
  <a class="gh" href="${REPO_URL}">GitHub ↗</a>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch between light and dark"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg></button>
</header>`;
}

const read = (f) => fs.readFileSync(path.join(SITE, f), 'utf8');

/** Fill a template's chrome placeholders. */
export function chrome(html, { base = '' } = {}) {
  return html
    .replace(/__FONTS__/g, () => FONTS)
    .replace(/__FAVICON__/g, () => FAVICON)
    .replace(/__THEME_CSS__/g, () => read('theme.css'))
    .replace(/__THEME_JS__/g, () => read('theme.js'))
    .replace(/__SITEBAR:([a-z]+)__/g, (_m, page) => sitebar(page, base));
}
