/**
 * postscript.ts — which PostScript a DVI file asks for, and what is lost when
 * dvisvgm cannot run it.
 *
 * dvisvgm interprets PostScript specials only through Ghostscript, which this
 * build does not include, so it skips them ("N PostScript specials ignored").
 * Almost every LaTeX document has some that do not matter for the drawing: the
 * l3 kernel's `header=l3backend-dvips.pro`, PGF's `ps::%%…BoundingBox`
 * comments, hyperref's link and metadata pdfmarks. Others carry the drawing
 * itself: EPS and PDF images (`psfile=`, `pdffile=`), graphicx's rotation and
 * scaling under its default dvips driver, PSTricks, raw `\special{ps: …}`. Only
 * those are worth a warning, so the specials are read from the DVI and sorted.
 */

/** Every special (`xxx1`–`xxx4`) in a DVI file, in order. The opcodes are
 *  walked rather than the bytes searched, since typeset text is raw bytes too. */
export function dviSpecials(b: Uint8Array): string[] {
  const u = (o: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + b[o + i]; return v; };
  const latin1 = new TextDecoder('latin1');
  const out: string[] = [];
  let p = 0;
  while (p < b.length) {
    const op = b[p++];
    if (op <= 127 || (op >= 171 && op <= 234)) continue;               // set_char, fnt_num
    if (op >= 128 && op <= 131) { p += op - 127; continue; }            // set1-4
    if (op === 132 || op === 137) { p += 8; continue; }                 // set_rule, put_rule
    if (op >= 133 && op <= 136) { p += op - 132; continue; }            // put1-4
    if (op === 138 || (op >= 140 && op <= 142)) continue;               // nop, eop, push, pop
    if (op === 139) { p += 44; continue; }                              // bop
    if (op >= 143 && op <= 146) { p += op - 142; continue; }            // right1-4
    if (op >= 147 && op <= 151) { p += op - 147; continue; }            // w0, w1-4
    if (op >= 152 && op <= 156) { p += op - 152; continue; }            // x0, x1-4
    if (op >= 157 && op <= 160) { p += op - 156; continue; }            // down1-4
    if (op >= 161 && op <= 165) { p += op - 161; continue; }            // y0, y1-4
    if (op >= 166 && op <= 170) { p += op - 166; continue; }            // z0, z1-4
    if (op >= 235 && op <= 238) { p += op - 234; continue; }            // fnt1-4
    if (op >= 239 && op <= 242) {                                       // xxx1-4
      const n = op - 238, k = u(p, n); p += n;
      out.push(latin1.decode(b.subarray(p, p + k))); p += k; continue;
    }
    if (op >= 243 && op <= 246) { p += op - 242 + 12; p += 2 + b[p] + b[p + 1]; continue; }  // fnt_def1-4
    if (op === 247) { p += 13; p += 1 + b[p]; continue; }               // pre
    break;                                                              // post (or anything unexpected): done
  }
  return out;
}

export type LostPostScript = 'image' | 'transform' | 'pstricks' | 'other';

/** What a PostScript special draws, or null when skipping it loses nothing visible. */
export function classifyPostScript(s: string): LostPostScript | null {
  if (/^(ps|PS)file=|^pdffile=/.test(s)) return 'image';
  const m = /^(ps::?|")\s*([^]*)$/.exec(s);
  if (!m) return null;                                     // header=, !, color, dvisvgm:, papersize=, ...
  const code = m[2];
  if (/^%%/.test(code)) return null;                       // DSC comments (PGF's bounding boxes)
  if (/SDict begin/.test(code) && /pdfmark|\bH\.[A-Z]\b|\/product where/.test(code)) return null;   // hyperref
  if (/tx@Dict|\/ps@|\/pssetRGBcolor|CanvasLeft/.test(code)) return 'pstricks';
  if (/^(gsave )?currentpoint (currentpoint translate|grestore moveto)/.test(code)) return 'transform';   // dvips.def
  return 'other';
}

const WHAT: Record<LostPostScript, string> = {
  image: 'EPS/PDF images',
  transform: 'rotation and scaling (\\rotatebox, \\scalebox, \\resizebox)',
  pstricks: 'PSTricks drawing',
  other: 'other PostScript drawing',
};

/** A one-line account of what the SVG is missing, or null when nothing visible was lost. */
export function describeLostPostScript(specials: string[]): string | null {
  const counts = new Map<LostPostScript, number>();
  for (const s of specials) {
    const kind = classifyPostScript(s);
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const order: LostPostScript[] = ['image', 'transform', 'pstricks', 'other'];
  return order.filter((k) => counts.has(k)).map((k) => `${WHAT[k]} (${counts.get(k)})`).join(', ');
}
