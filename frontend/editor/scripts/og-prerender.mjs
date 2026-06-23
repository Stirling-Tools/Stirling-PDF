// Pure helpers for baking Open Graph / Twitter Card tags into prerendered HTML.
// Kept separate from vite.config so the logic is unit-testable without a full build.
// Used by the `prerender-og` Vite plugin (see vite.config.ts).

import fs from "node:fs/promises";
import path from "node:path";

export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const absolute = (urlPath, ogBase) => (ogBase ? ogBase + urlPath : urlPath);

/**
 * Build the OG/Twitter <meta> block for one route.
 * @param {{image:string,title:string,description:string}} entry
 * @param {{ogBase?:string, pageUrlPath?:string|null}} opts
 */
export function buildOgTags(entry, { ogBase = "", pageUrlPath = null } = {}) {
  const title = escapeHtml(entry.title);
  const description = escapeHtml(entry.description);
  const imageUrl = absolute(entry.image, ogBase);
  const image = escapeHtml(imageUrl);
  const pageUrl = pageUrlPath
    ? escapeHtml(absolute(pageUrlPath, ogBase))
    : null;
  const lines = [
    "<!-- og:start -->",
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Stirling PDF" />',
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    pageUrl ? `<meta property="og:url" content="${pageUrl}" />` : null,
    `<meta property="og:image" content="${image}" />`,
    imageUrl.startsWith("https")
      ? `<meta property="og:image:secure_url" content="${image}" />`
      : null,
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    "<!-- og:end -->",
  ].filter(Boolean);
  return lines.join("\n    ") + "\n  ";
}

/** Inject route-specific <title>, description and OG/Twitter tags into an HTML shell. */
export function injectOg(html, entry, opts = {}) {
  return html
    .replace(
      /<title>[\s\S]*?<\/title>/i,
      () => `<title>${escapeHtml(entry.title)}</title>`,
    )
    .replace(
      /<meta\s+name=["']description["'][\s\S]*?>/i,
      () =>
        `<meta name="description" content="${escapeHtml(entry.description)}" />`,
    )
    .replace("</head>", `  ${buildOgTags(entry, opts)}</head>`);
}

const BASE_HREF_RE = /<base\s+href="[^"]*"\s*\/?>/i;

/**
 * Write the root index.html (home preview) plus one file per route in the
 * manifest: flat for single-segment routes (e.g. dist/compress.html) and nested
 * for multi-segment ones (e.g. dist/settings/people.html). Returns the count of
 * route pages written.
 *
 * `baseHref` is the absolute deploy base ("/" for a root deploy). Nested files
 * need it because a relative `<base href="./">` would resolve their assets
 * against the sub-path (e.g. /settings/) and 404; flat files and the root keep
 * the build's relative base.
 * @returns {Promise<number>}
 */
export async function prerenderOg({
  distDir,
  manifest,
  ogBase = "",
  baseHref = "/",
}) {
  const template = await fs.readFile(path.join(distDir, "index.html"), "utf8");

  await fs.writeFile(
    path.join(distDir, "index.html"),
    injectOg(template, manifest.default, {
      ogBase,
      pageUrlPath: ogBase ? "/" : null,
    }),
  );

  let count = 0;
  for (const [routePath, id] of Object.entries(manifest.byPath || {})) {
    const segments = routePath.replace(/^\//, "").split("/");
    // Clean segments only - no traversal, no dots (e.g. /compress, /settings/people).
    if (!segments.length || !segments.every((s) => /^[A-Za-z0-9_-]+$/.test(s)))
      continue;
    const entry = manifest.byTool[id] ?? manifest.default;
    let html = injectOg(template, entry, {
      ogBase,
      pageUrlPath: ogBase ? routePath : null,
    });
    const nested = segments.length > 1;
    if (nested)
      html = html.replace(BASE_HREF_RE, `<base href="${baseHref}" />`);
    const outFile = path.join(distDir, ...segments) + ".html";
    if (nested) await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, html);
    count++;
  }
  return count;
}
