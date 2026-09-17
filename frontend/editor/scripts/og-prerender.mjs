/* oxlint-disable no-restricted-imports -- Node build helpers share pure rendering with the app before Vite aliases exist. */
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildBodyContent,
  escapeHtml,
  injectOg,
  replaceOrThrow,
} from "../src/core/utils/publicPageSeo.mjs";
export {
  buildBodyContent,
  buildJsonLd,
  buildOgTags,
  buildRobotsTag,
  buildCanonicalTag,
  escapeHtml,
  injectOg,
  resolveDeployBases,
} from "../src/core/utils/publicPageSeo.mjs";

/** Keep public content outside React's replaceable mount point. */
export function injectBody(html, content) {
  return replaceOrThrow(
    html,
    /<div id="root">\s*<\/div>/,
    () =>
      content.includes("<!-- public:tool -->")
        ? content.replace("<!-- public:tool -->", '<div id="root"></div>')
        : content + '<div id="root"></div>',
    'empty <div id="root">',
  ).replace("<body>", "<body data-public-page>");
}

const BASE_HREF_RE = /<base\s+href="[^"]*"\s*\/?>/i;

// Clean single/multi-segment route (e.g. /compress, /settings/people); rejects
// traversal and dotted names. Returns the segment list or null.
function cleanSegments(routePath) {
  const segments = routePath.replace(/^\//, "").split("/");
  if (!segments.length || !segments.every((s) => /^[A-Za-z0-9_-]+$/.test(s)))
    return null;
  return segments;
}

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
 *
 * `ogBase` and `canonicalBase` are absolute deploy roots (see injectOg) - any
 * sub-path already folded in by the caller, because only the caller knows
 * whether a given origin serves the app at the sub-path or at its own root.
 *
 * `injectLanding` bakes the crawlable landing body (see buildBodyContent), which
 * only earns its bytes on a crawlable public deploy, so callers enable it only
 * when a deploy origin is known.
 * @returns {Promise<number>}
 */
export async function prerenderOg({
  distDir,
  manifest,
  ogBase = "",
  canonicalBase = "",
  baseHref = "/",
  injectLanding = false,
  noindex = false,
  staticHosting = false,
}) {
  let template = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  if (ogBase) {
    const config = JSON.stringify({
      ogBase,
      canonicalBase,
      baseHref,
      noindex,
    }).replace(/</g, "\\u003c");
    template = template.replace(
      "</head>",
      `<script id="stirling-page-config" type="application/json">${config}</script></head>`,
    );
  }
  const homePath = "/";
  const canonicalByPath = manifest.canonicalByPath || {};
  const navLinks = manifest.navLinks;
  // The hub is the only crawlable path to the tools, so an empty one is a stale
  // manifest, not a valid input - fail loudly instead of shipping a bare page.
  if (injectLanding && (!Array.isArray(navLinks) || navLinks.length === 0)) {
    throw new Error(
      "prerenderOg: manifest has no navLinks - run scripts/generate-og-metadata.mjs",
    );
  }

  let home = injectOg(template, manifest.default, {
    ogBase,
    canonicalBase,
    pageUrlPath: ogBase ? homePath : null,
    canonicalPath: homePath,
    isHome: true,
    noindex,
  });
  // Home <title> stays the brand ("Stirling PDF"); the H1 targets the keyword.
  if (injectLanding) {
    home = injectBody(
      home,
      buildBodyContent(manifest.default, {
        navLinks,
        heading: "Online PDF Tools",
      }),
    );
  }
  await fs.writeFile(path.join(distDir, "index.html"), home);

  let count = 0;
  for (const [routePath, id] of Object.entries(manifest.byPath || {})) {
    const segments = cleanSegments(routePath);
    if (!segments) continue;
    const entry = manifest.byTool[id] ?? manifest.default;
    // Aliases point at their primary URL so the duplicates are not indexed.
    const canonicalRoute = canonicalByPath[routePath] || routePath;
    let html = injectOg(template, entry, {
      ogBase,
      canonicalBase,
      pageUrlPath: ogBase ? routePath : null,
      canonicalPath: canonicalRoute,
      noindex: noindex || !!entry.noindex,
      isHome: false,
    });
    // App/auth pages (noindex) keep the stock noscript - no crawlable landing copy.
    if (injectLanding && !entry.noindex)
      html = injectBody(html, buildBodyContent(entry, { navLinks }));
    const nested = segments.length > 1;
    if (nested)
      html = html.replace(BASE_HREF_RE, `<base href="${baseHref}" />`);
    const outFile = path.join(distDir, ...segments) + ".html";
    if (nested) await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, html);
    count++;
  }
  if (staticHosting) {
    const privateShell = injectOg(
      template.replace(BASE_HREF_RE, `<base href="${baseHref}" />`),
      manifest.default,
      { ogBase, noindex: true },
    );
    await fs.writeFile(path.join(distDir, "app-shell.html"), privateShell);
    const notFoundTemplate = template
      .replace(BASE_HREF_RE, `<base href="${baseHref}" />`)
      .replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(
        '<div id="root"></div>',
        '<main class="public-page-copy"><h1>Page not found</h1><p>This page does not exist.</p><a href="' +
          escapeHtml(baseHref) +
          '">Browse PDF tools</a></main>',
      );
    await fs.writeFile(
      path.join(distDir, "404.html"),
      injectOg(
        notFoundTemplate,
        {
          ...manifest.default,
          title: "Page not found - Stirling PDF",
          description: "This page does not exist.",
        },
        { ogBase, noindex: true },
      ),
    );
    // A 404.html disables Pages' implicit catch-all; only private dynamic routes use the shell.
    const dynamic = ["/share/*", "/processor/*", "/settings/*", "/docs/*"];
    const redirects =
      dynamic.map((route) => `${route} /app-shell.html 200`).join("\n") + "\n";
    await fs.writeFile(path.join(distDir, "_redirects"), redirects);
    if (noindex)
      await fs.writeFile(
        path.join(distDir, "_headers"),
        "/*\n  X-Robots-Tag: noindex, follow\n",
      );
  }
  return count;
}

/**
 * Build an XML sitemap of every indexable route. A sitemap helps crawlers discover
 * the URLs it lists, so it takes the canonical deploy root (absolute, any
 * sub-path already folded in) and returns null when none is known - self-hosted
 * builds and preview deployments emit nothing rather than a sitemap of a host
 * that should never be indexed. Noindex routes and aliases that canonicalise
 * elsewhere are excluded.
 * @param {object} manifest
 * @param {{canonicalBase:string}} opts
 * @returns {string|null}
 */
export function buildSitemap(manifest, { canonicalBase }) {
  if (!canonicalBase) return null;
  const canonicalByPath = manifest.canonicalByPath || {};
  const locs = new Set([`${canonicalBase}/`]);
  for (const [routePath, id] of Object.entries(manifest.byPath || {})) {
    if (!cleanSegments(routePath)) continue;
    // An alias is a duplicate of its primary URL - only the primary is listed.
    if (canonicalByPath[routePath]) continue;
    const entry = manifest.byTool[id] ?? manifest.default;
    if (entry.noindex) continue;
    locs.add(canonicalBase + routePath);
  }
  const body = [...locs]
    .sort()
    .map((loc) => {
      const priority = loc === `${canonicalBase}/` ? "1.0" : "0.8";
      return (
        `  <url>\n` +
        `    <loc>${escapeHtml(loc)}</loc>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>${priority}</priority>\n` +
        `  </url>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${body}\n` +
    `</urlset>\n`
  );
}
