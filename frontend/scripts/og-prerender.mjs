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

// Every injection point is matched against the built HTML shell, so a template
// edit that renames one would otherwise ship a whole site of unmodified shells
// while the build still reports success. Refuse the build instead.
const replaceOrThrow = (html, pattern, replacement, what) => {
  if (!pattern.test(html))
    throw new Error(
      `og-prerender: HTML shell has no ${what} to replace - the prerender ` +
        "and editor/index.html have drifted apart",
    );
  return html.replace(pattern, replacement);
};

/**
 * Resolve the two absolute deploy roots the prerender needs from the build
 * environment. Both already include any sub-path that applies to them.
 *
 * `canonicalOrigin` (VITE_OG_BASE_URL) is the public origin the site is meant to
 * be indexed under, and it serves the app at `baseHref` - so the sub-path
 * belongs in its URLs. `deployOrigin` (CF_PAGES_URL) names one deployment and
 * serves dist at its own root, so the sub-path must NOT be prepended there, and
 * nothing derived from it may be published as an indexing signal: a preview
 * deployment would otherwise canonicalise the entire site at a throwaway host.
 * @param {{canonicalOrigin?:string, deployOrigin?:string, baseHref?:string}} env
 * @returns {{ogBase:string, canonicalBase:string}}
 */
export function resolveDeployBases({
  canonicalOrigin = "",
  deployOrigin = "",
  baseHref = "/",
}) {
  const trim = (url) => url.replace(/\/+$/, "");
  const canonicalBase = canonicalOrigin
    ? trim(canonicalOrigin) + trim(baseHref)
    : "";
  return { ogBase: canonicalBase || trim(deployOrigin), canonicalBase };
}

/**
 * Build the OG/Twitter <meta> block for one route. `ogTitle` lets the social
 * card show a punchier headline than the (SEO) <title>; falls back to `title`.
 *
 * `ogBase` is the absolute URL of the deploy root, so every root-relative path
 * (`entry.image`, `pageUrlPath`) is appended to it verbatim. Callers must not
 * fold a sub-path in twice.
 * @param {{image:string,title:string,description:string,ogTitle?:string}} entry
 * @param {{ogBase?:string, pageUrlPath?:string|null}} opts
 */
export function buildOgTags(entry, { ogBase = "", pageUrlPath = null } = {}) {
  const title = escapeHtml(entry.ogTitle ?? entry.title);
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
 * tool pages get a WebApplication plus a Home > Tool breadcrumb. Needs an
 * absolute origin, so callers only invoke it when a canonical base is known.
 * @param {{title:string,description:string,noOffer?:boolean}} entry
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
          // Manifest entries for metered products opt out (see noOffer).
          ...(entry.noOffer
            ? {}
            : {
                offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              }),
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
 * tags, a robots directive, and (when a canonical base is known) a canonical
 * link plus JSON-LD structured data.
 *
 * `ogBase` is the deploy root this build is served from; `canonicalBase` is the
 * deploy root on the public origin the site should be indexed under. They differ
 * on a preview deployment, where only `ogBase` is known - and an indexing signal
 * naming a preview host is worse than none, so canonical and JSON-LD are emitted
 * only with `canonicalBase`. Both paths are root-relative to their base.
 * @param {object} entry
 * @param {{ogBase?:string, canonicalBase?:string, pageUrlPath?:string|null,
 *   canonicalPath?:string|null, noindex?:boolean, isHome?:boolean}} opts
 */
export function injectOg(html, entry, opts = {}) {
  const {
    ogBase = "",
    canonicalBase = "",
    pageUrlPath = null,
    canonicalPath = null,
    noindex = false,
    isHome = false,
  } = opts;
  const canonicalUrl = canonicalBase
    ? canonicalBase + (canonicalPath ?? pageUrlPath ?? "/")
    : null;
  const blocks = [
    buildOgTags(entry, { ogBase, pageUrlPath }),
    buildRobotsTag(noindex),
    buildCanonicalTag(canonicalUrl),
    canonicalBase
      ? buildJsonLd(entry, {
          siteRoot: `${canonicalBase}/`,
          pageUrl: canonicalUrl,
          isHome,
        })
      : null,
  ].filter(Boolean);
  const head = blocks.join("\n    ") + "\n  ";
  const withTitle = replaceOrThrow(
    html,
    /<title>[\s\S]*?<\/title>/i,
    () => `<title>${escapeHtml(entry.title)}</title>`,
    "<title>",
  );
  const withDescription = replaceOrThrow(
    withTitle,
    /<meta\s+name=["']description["'][\s\S]*?>/i,
    () =>
      `<meta name="description" content="${escapeHtml(entry.description)}" />`,
    '<meta name="description">',
  );
  return replaceOrThrow(
    withDescription,
    /<\/head>/i,
    () => `  ${head}</head>`,
    "</head>",
  );
}

// Scoped styling for the prerendered body content so the pre-hydration paint
// (what crawlers see and the first visible paint for users) looks intentional.
// It lives inside #root and is wiped when React mounts.
const SEO_STYLE =
  "<style>.spdf-seo{max-width:760px;margin:0 auto;padding:56px 24px;" +
  "font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a}" +
  ".spdf-seo h1{font-size:2rem;line-height:1.2;margin:0 0 .75rem}" +
  ".spdf-seo p{font-size:1.05rem;line-height:1.6;color:#444;margin:0 0 1rem}" +
  ".spdf-seo nav{margin-top:2.5rem}.spdf-seo nav h2{font-size:.95rem;" +
  "text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 .5rem}" +
  ".spdf-seo nav a{display:inline-block;margin:0 .75rem .35rem 0;" +
  "color:#0a58ca;text-decoration:none;font-size:.92rem}" +
  "@media(prefers-color-scheme:dark){.spdf-seo{color:#e8e8e8}" +
  ".spdf-seo p{color:#b8b8b8}.spdf-seo nav a{color:#6ea8fe}}</style>";

/**
 * Build the crawlable body content injected into #root: an H1, the page
 * description, and a hub of real <a href> links to every tool. React (createRoot)
 * replaces it on mount, so it only ever shows on a full page load - i.e. to
 * crawlers and as the first paint (which also helps LCP). Links are relative so
 * they resolve against <base href> under any deploy (root, /app, context path).
 * @param {{title:string,description:string}} entry
 * @param {{navLinks?:{path:string,label:string}[], heading?:string|null}} opts
 */
export function buildBodyContent(
  entry,
  { navLinks = [], heading = null } = {},
) {
  const name =
    heading ||
    (entry.title.endsWith(APP_SUFFIX)
      ? entry.title.slice(0, -APP_SUFFIX.length)
      : entry.title);
  const links = navLinks
    .map(
      (l) =>
        `<a href="${escapeHtml(l.path.replace(/^\//, ""))}">${escapeHtml(l.label)}</a>`,
    )
    .join("\n        ");
  const nav = links
    ? `\n      <nav aria-label="All PDF tools">\n        <h2>All PDF tools</h2>\n        ${links}\n      </nav>`
    : "";
  return (
    `<div class="spdf-seo">${SEO_STYLE}\n      ` +
    `<h1>${escapeHtml(name)}</h1>\n      ` +
    `<p>${escapeHtml(entry.description)}</p>${nav}\n    </div>`
  );
}

const ROOT_RE = /<div id="root">\s*<\/div>/;

/** Inject crawlable content into the (otherwise empty) React mount point. */
export function injectBody(html, content) {
  return replaceOrThrow(
    html,
    ROOT_RE,
    () => `<div id="root">${content}</div>`,
    'empty <div id="root">',
  );
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
 * `injectLanding` bakes the crawlable landing body (see buildBodyContent). It is
 * only worth the pre-hydration flash on a crawlable public deploy, so callers
 * enable it only when a deploy origin is known.
 * @returns {Promise<number>}
 */
export async function prerenderOg({
  distDir,
  manifest,
  ogBase = "",
  canonicalBase = "",
  baseHref = "/",
  injectLanding = false,
}) {
  const template = await fs.readFile(path.join(distDir, "index.html"), "utf8");
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
  });
  // Home <title> stays the brand ("Stirling PDF"); the H1 targets the keyword.
  if (injectLanding) {
    home = injectBody(
      home,
      buildBodyContent(manifest.default, {
        navLinks,
        heading: "Free Online PDF Tools",
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
      noindex: !!entry.noindex,
      isHome: false,
    });
    // App/auth pages (noindex) stay the bare shell - no crawlable landing copy.
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
  return count;
}

/**
 * Build an XML sitemap of every indexable route. A sitemap is an instruction to
 * index the URLs it lists, so it takes the canonical deploy root (absolute, any
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
