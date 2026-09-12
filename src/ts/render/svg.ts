/**
 * svg.ts — post-processing of MetaPost's SVG output (docs/07 §3.1). The C
 * output is left byte-identical to upstream; everything here is optional
 * polish applied on the string.
 */
import type { SvgPostOptions } from '../types.js';

const NUM = /-?\d+\.\d{4,}/g;

export function postProcessSvg(svg: string, opts: SvgPostOptions = {}, figureIndex = 0): string {
  let s = svg;
  if (opts.precision !== false) {
    const p = opts.precision ?? 3;
    s = s.replace(NUM, (m) => {
      const v = Number(m);
      let r = v.toFixed(p);
      if (r.includes('.')) r = r.replace(/\.?0+$/, '');
      if (r === '-0') r = '0';
      return r;
    });
  }
  if (opts.idPrefix !== false) {
    const prefix = opts.idPrefix ?? `mp${figureIndex}-`;
    s = s.replace(/id="GLYPH/g, `id="${prefix}GLYPH`).replace(/href="#GLYPH/g, `href="#${prefix}GLYPH`);
  }
  if (opts.modernHref) s = s.replace(/xlink:href=/g, 'href=');
  if (opts.units === 'px') {
    s = s.replace(/<svg([^>]*)width="([\d.]+)"([^>]*)height="([\d.]+)"/, (_m, a, w, b, h) =>
      `<svg${a}width="${trim(Number(w) * 96 / 72)}"${b}height="${trim(Number(h) * 96 / 72)}"`);
  } else if (opts.units === 'none') {
    s = s.replace(/<svg([^>]*)\swidth="[\d.]+"/, '<svg$1').replace(/<svg([^>]*)\sheight="[\d.]+"/, '<svg$1');
  }
  if (opts.title) {
    const t = escapeXml(opts.title);
    s = s.replace(/<svg([^>]*)>/, `<svg$1 role="img" aria-label="${t}"><title>${t}</title>`);
  }
  return s;
}

function trim(v: number): string { let r = v.toFixed(3); r = r.replace(/\.?0+$/, ''); return r; }
function escapeXml(s: string): string { return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!)); }

/**
 * A conservative sanitiser for innerHTML use (docs/10 §3.1): keeps the SVG
 * elements MetaPost emits and drops everything else (scripts, event handlers,
 * foreignObject, external references).
 */
export function sanitizeSvg(svg: string): string {
  const allowedTags = new Set(['svg', 'g', 'path', 'defs', 'use', 'text', 'title', 'desc', 'clipPath', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'tspan']);
  const allowedAttr = /^(id|class|d|x|y|width|height|viewBox|version|xmlns|xmlns:xlink|xlink:href|href|transform|style|fill|fill-rule|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|stroke-dashoffset|clip-path|font-size|font-family|role|aria-label|opacity|fill-opacity|stroke-opacity)$/;
  // comments are harmless but drop them to be safe
  let out = svg.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\?xml[^>]*\?>/, '');
  out = out.replace(/<\/?([a-zA-Z:]+)([^>]*)>/g, (m, tag: string, attrs: string) => {
    if (!allowedTags.has(tag)) return '';
    if (m.startsWith('</')) return `</${tag}>`;
    const kept = (attrs.match(/([a-zA-Z:-]+)\s*=\s*("[^"]*"|'[^']*')/g) || []).filter((a) => {
      const name = a.split('=')[0].trim();
      if (!allowedAttr.test(name)) return false;
      const val = a.slice(a.indexOf('=') + 1).trim().slice(1, -1);
      if (/href/.test(name) && !val.startsWith('#')) return false;
      if (/javascript:|expression\(|url\(/i.test(val)) return false;
      return true;
    });
    const selfClose = attrs.trim().endsWith('/') ? '/' : '';
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose}>`;
  });
  return out.trim();
}
