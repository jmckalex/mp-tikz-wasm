import type { BundleName, BundleSpec } from './types.js';

export const DEFAULT_BUNDLES: BundleName[] = ['core', 'cm-tfm', 'cm-type1', 'lm-fonts', 'ps-fonts', 'tex-plain', 'latex-core', 'latex-extra', 'tikz-snapshot', 'luatex'];

export function resolveBundleSpecs(bundles: (BundleName | BundleSpec)[], base: string): BundleSpec[] {
  if (!base.endsWith('/')) base += '/';
  return bundles.map((b) => (typeof b === 'string' ? { name: b, manifestUrl: `${base}${b}/manifest.json` } : b));
}
