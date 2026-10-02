// Shared HTML and metadata rendering for static responses and client navigation.

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
export const replaceOrThrow = (html, pattern, replacement, what) => {
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
  return `<script type="application/ld+json" data-public-page-schema>${json.replace(/</g, "\\u003c")}</script>`;
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
    canonicalBase && !noindex
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

/** Public text and navigation shared by the static response and client routing. */
export function buildBodyContent(
  entry,
  { navLinks = [], heading = null } = {},
) {
  const name =
    heading ||
    (entry.title.endsWith(APP_SUFFIX)
      ? entry.title.slice(0, -APP_SUFFIX.length)
      : entry.title);
  const content = entry.content;
  const intro = `<header id="public-page-intro" class="public-page-copy">
    <a href="./" class="public-page-brand">Stirling PDF</a>
    <h1>${escapeHtml(name)}</h1>
    <p>${escapeHtml(entry.description)}</p>
  </header>`;
  const paragraphs = (content?.paragraphs || [])
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
  const steps = content?.steps || [
    "Review the available options in the workspace above.",
    "Add the files requested by the tool and choose the settings for your task.",
    "Follow the tool's steps, then review the result before saving or sharing it.",
  ];
  const links = navLinks
    .map(
      (l) =>
        `<li><a href="${escapeHtml(l.path.replace(/^\//, ""))}">${escapeHtml(l.label)}</a></li>`,
    )
    .join("\n");
  return `${intro}\n<!-- public:tool -->\n<section id="public-page-details" class="public-page-copy">
    <h2>Using ${escapeHtml(name)}</h2>
    ${paragraphs}
    <ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("\n")}</ol>
    <h2>Before you start</h2>
    <p>${escapeHtml(content?.limitations || "Available formats, settings and processing options depend on the selected tool. Keep your original files and check the output before replacing them.")}</p>
    <p>The interactive workspace requires JavaScript. Processing may use your browser or a server, depending on the tool and deployment. Check the tool's options and your deployment's privacy policy before opening sensitive documents.</p>
    <nav aria-label="All PDF tools"><h2>All PDF tools</h2><ul class="public-page-tools">${links}</ul></nav>
  </section>`;
}
