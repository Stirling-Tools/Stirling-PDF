/* oxlint-disable no-restricted-imports -- Node build helpers share pure rendering with the app before Vite aliases exist. */
import type { OgManifest } from "../src/core/utils/publicPageSeo.mjs";
export * from "../src/core/utils/publicPageSeo.mjs";
export function injectBody(html: string, content: string): string;
export function prerenderOg(args: {
  distDir: string;
  manifest: OgManifest;
  ogBase?: string;
  canonicalBase?: string;
  baseHref?: string;
  /** Bake the crawlable landing body; only useful on public web deploys. */
  injectLanding?: boolean;
  noindex?: boolean;
  staticHosting?: boolean;
}): Promise<number>;
export function buildSitemap(
  manifest: OgManifest,
  opts: { canonicalBase: string },
): string | null;
