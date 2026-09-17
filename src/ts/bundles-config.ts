import type { BundleName, BundleSpec } from './types.js';

// `opentype` and `otf-fonts` are deliberately absent, and it is not only about size.
// LaTeX under LuaTeX probes for luaotfload at start-up, so merely making it findable
// is enough to make every lualatex run load and initialise it: measured here, a
// document with no fontspec in it went from 214 ms to 396 ms and from 6.6 MB fetched
// to 11.9 MB. Graph drawing, which is what most LuaTeX documents here want, would pay
// that for nothing. So OpenType is opt-in, one bundle for the machinery with the
// Latin Modern text family, and one for the maths font (unicode-math):
//   MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'opentype'] })
//   MetaPost.create({ bundles: [...DEFAULT_BUNDLES, 'opentype', 'otf-fonts'] })
export const DEFAULT_BUNDLES: BundleName[] = ['core', 'cm-tfm', 'cm-type1', 'lm-fonts', 'ps-fonts', 'tex-plain', 'latex-core', 'latex-extra', 'tikz-snapshot', 'luatex'];

export function resolveBundleSpecs(bundles: (BundleName | BundleSpec)[], base: string): BundleSpec[] {
  if (!base.endsWith('/')) base += '/';
  return bundles.map((b) => (typeof b === 'string' ? { name: b, manifestUrl: `${base}${b}/manifest.json` } : b));
}
