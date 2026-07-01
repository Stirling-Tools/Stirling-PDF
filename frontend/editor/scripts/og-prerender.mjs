// Pure helpers for baking SEO metadata into prerendered HTML: Open Graph /
// Twitter Card tags, a canonical link, a robots directive, and JSON-LD
// structured data - plus an XML sitemap builder. Kept separate from
// vite.config so the logic is unit-testable without a full build.
// Used by the `prerender-og` Vite plugin (see vite.config.ts).

import fs from "node:fs/promises";
import path from "node:path";

const SITE_NAME = "Stirling PDF";
const APP_SUFFIX = ` - ${SITE_NAME}`;
// Public project home - a safe, verifiable sameAs signal for structured data.
const GITHUB_URL = "https://github.com/Stirling-Tools/Stirling-PDF";
const LOGO_PATH = "/modern-logo/logo512.png";

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
    `<meta property="og:image:alt" content="${title}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    "<!-- og:end -->",
  ].filter(Boolean);
  return lines.join("\n    ");
}

/** Robots directive - keep app/auth pages out of the index, follow everywhere. */
export function buildRobotsTag(noindex) {
  return `<meta name="robots" content="${noindex ? "noindex, follow" : "index, follow"}" />`;
}

/** Canonical link (absolute). Null when no canonical origin is known. */
export function buildCanonicalTag(canonicalUrl) {
  return canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    : null;
}

/**
 * Build a JSON-LD structured-data block. Home gets WebSite + Organization;
 * tool pages get a free WebApplication plus a Home > Tool breadcrumb. Needs an
 * absolute origin, so callers only invoke it when a canonical base is known.
 * @param {{title:string,description:string}} entry
 * @param {{siteRoot:string, pageUrl:string, isHome:boolean}} opts
 */
export function buildJsonLd(entry, { siteRoot, pageUrl, isHome }) {
  const name = entry.title.endsWith(APP_SUFFIX)
    ? entry.title.slice(0, -APP_SUFFIX.length)
    : entry.title;
  const root = siteRoot.replace(/\/+$/, "");
  const organization = {
    "@type": "Organization",
    name: SITE_NAME,
    url: siteRoot,
    logo: root + LOGO_PATH,
    sameAs: [GITHUB_URL],
  };
  const graph = isHome
    ? [
        {
          "@type": "WebSite",
          name: SITE_NAME,
          url: siteRoot,
          description: entry.description,
        },
        organization,
      ]
    : [
        {
          "@type": "WebApplication",
          name,
          description: entry.description,
          url: pageUrl,
          applicationCategory: "BusinessApplication",
          operatingSystem: "All",
          browserRequirements: "Requires JavaScript. Requires HTML5.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          isPartOf: { "@type": "WebSite", name: SITE_NAME, url: siteRoot },
          publisher: organization,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: siteRoot },
            { "@type": "ListItem", position: 2, name },
          ],
        },
      ];
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  });
  // Escape `<` so a value can never close the script element early.
  return `<script type="application/ld+json">${json.replace(/</g, "\\u003c")}</script>`;
}

/**
 * Inject route-specific SEO into an HTML shell: <title>, description, OG/Twitter
 * tags, a robots directive, and (when a canonical origin is known) a canonical
 * link plus JSON-LD structured data.
 * @param {object} entry
 * @param {{ogBase?:string, pageUrlPath?:string|null, canonicalPath?:string|null,
 *   noindex?:boolean, siteRoot?:string|null, isHome?:boolean}} opts
 */
export function injectOg(html, entry, opts = {}) {
  const {
    ogBase = "",
    pageUrlPath = null,
    canonicalPath = null,
    noindex = false,
    siteRoot = null,
    isHome = false,
  } = opts;
  const canonicalUrl = ogBase
    ? absolute(canonicalPath ?? pageUrlPath ?? "/", ogBase)
    : null;
  const resolvedSiteRoot = siteRoot ?? (ogBase ? `${ogBase}/` : "/");
  const blocks = [
    buildOgTags(entry, { ogBase, pageUrlPath }),
    buildRobotsTag(noindex),
    buildCanonicalTag(canonicalUrl),
    ogBase
      ? buildJsonLd(entry, {
          siteRoot: resolvedSiteRoot,
          pageUrl: canonicalUrl,
          isHome,
        })
      : null,
  ].filter(Boolean);
  const head = blocks.join("\n    ") + "\n  ";
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
    .replace("</head>", `  ${head}</head>`);
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
 * the build's relative base. The path prefix derived from it is also woven into
 * canonical/OG/JSON-LD URLs so a sub-path deploy (RUN_SUBPATH) stays consistent.
 * @returns {Promise<number>}
 */
export async function prerenderOg({
  distDir,
  manifest,
  ogBase = "",
  baseHref = "/",
}) {
  const template = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const pathPrefix = baseHref.replace(/\/+$/, ""); // "" or "/app"
  const siteRoot = ogBase ? `${ogBase}${pathPrefix}/` : "/";
  const homePath = `${pathPrefix}/`;

  await fs.writeFile(
    path.join(distDir, "index.html"),
    injectOg(template, manifest.default, {
      ogBase,
      pageUrlPath: ogBase ? homePath : null,
      canonicalPath: homePath,
      siteRoot,
      isHome: true,
    }),
  );

  let count = 0;
  for (const [routePath, id] of Object.entries(manifest.byPath || {})) {
    const segments = cleanSegments(routePath);
    if (!segments) continue;
    const entry = manifest.byTool[id] ?? manifest.default;
    const pageUrlPath = pathPrefix + routePath;
    let html = injectOg(template, entry, {
      ogBase,
      pageUrlPath: ogBase ? pageUrlPath : null,
      canonicalPath: pageUrlPath, // self-canonical: never points at a maybe-404 alias
      noindex: !!entry.noindex,
      siteRoot,
      isHome: false,
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

/**
 * Build an XML sitemap of every indexable route. Requires an absolute origin
 * (sitemaps must use absolute URLs), so returns null when none is known - e.g.
 * self-hosted builds with no canonical domain. Noindex routes are excluded.
 * @param {object} manifest
 * @param {{ogBase:string, pathPrefix?:string}} opts
 * @returns {string|null}
 */
export function buildSitemap(manifest, { ogBase, pathPrefix = "" }) {
  if (!ogBase) return null;
  const base = ogBase + pathPrefix;
  const locs = new Set([`${base}/`]);
  for (const [routePath, id] of Object.entries(manifest.byPath || {})) {
    if (!cleanSegments(routePath)) continue;
    const entry = manifest.byTool[id] ?? manifest.default;
    if (entry.noindex) continue;
    locs.add(base + routePath);
  }
  const body = [...locs]
    .sort()
    .map((loc) => {
      const priority = loc === `${base}/` ? "1.0" : "0.8";
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
