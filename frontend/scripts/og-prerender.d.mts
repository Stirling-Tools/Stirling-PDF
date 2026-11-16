// Type declarations for og-prerender.mjs (plain ESM build helper).

export interface OgEntry {
  image: string;
  title: string;
  description: string;
  noindex?: boolean;
  /** Omit the price-0 Offer from JSON-LD (metered/paid surfaces). */
  noOffer?: boolean;
  /** Punchier social-card title; falls back to `title` for the <title> tag. */
  ogTitle?: string;
}

export interface OgInjectOptions {
  /** Absolute deploy root this build is served from ("" keeps URLs relative). */
  ogBase?: string;
  /** Absolute deploy root on the public origin; "" suppresses canonical/JSON-LD. */
  canonicalBase?: string;
  pageUrlPath?: string | null;
  canonicalPath?: string | null;
  noindex?: boolean;
  isHome?: boolean;
}

export interface OgManifest {
  default: OgEntry;
  byTool: Record<string, OgEntry>;
  byPath: Record<string, string>;
  /** Alias path -> primary path it canonicalises to (aliases only). */
  canonicalByPath?: Record<string, string>;
}

export function escapeHtml(value: string): string;
export function resolveDeployBases(env: {
  canonicalOrigin?: string;
  deployOrigin?: string;
  baseHref?: string;
}): { ogBase: string; canonicalBase: string };
export function buildOgTags(
  entry: OgEntry,
  opts?: { ogBase?: string; pageUrlPath?: string | null },
): string;
export function buildRobotsTag(noindex: boolean): string;
export function buildCanonicalTag(canonicalUrl: string | null): string | null;
export function buildJsonLd(
  entry: OgEntry,
  opts: { siteRoot: string; pageUrl: string; isHome: boolean },
): string;
export function injectOg(
  html: string,
  entry: OgEntry,
  opts?: OgInjectOptions,
): string;
export function prerenderOg(args: {
  distDir: string;
  manifest: OgManifest;
  ogBase?: string;
  canonicalBase?: string;
  baseHref?: string;
}): Promise<number>;
export function buildSitemap(
  manifest: OgManifest,
  opts: { canonicalBase: string },
): string | null;
