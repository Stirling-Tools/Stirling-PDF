// Type declarations for og-prerender.mjs (plain ESM build helper).

export interface OgEntry {
  image: string;
  title: string;
  description: string;
}

export interface OgInjectOptions {
  ogBase?: string;
  pageUrlPath?: string | null;
}

export interface OgManifest {
  default: OgEntry;
  byTool: Record<string, OgEntry>;
  byPath: Record<string, string>;
}

export function escapeHtml(value: string): string;
export function buildOgTags(entry: OgEntry, opts?: OgInjectOptions): string;
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
