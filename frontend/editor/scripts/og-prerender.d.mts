// Type declarations for og-prerender.mjs (plain ESM build helper).

export interface OgEntry {
  image: string;
  title: string;
  description: string;
  noindex?: boolean;
}

export interface OgInjectOptions {
  ogBase?: string;
  pageUrlPath?: string | null;
  canonicalPath?: string | null;
  noindex?: boolean;
  siteRoot?: string | null;
  isHome?: boolean;
}

export interface OgManifest {
  default: OgEntry;
  byTool: Record<string, OgEntry>;
  byPath: Record<string, string>;
}

export function escapeHtml(value: string): string;
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
  baseHref?: string;
}): Promise<number>;
export function buildSitemap(
  manifest: OgManifest,
  opts: { ogBase: string; pathPrefix?: string },
): string | null;
