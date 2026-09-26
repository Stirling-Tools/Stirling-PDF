# Public tool pages

Public builds serve ordinary HTML containing the heading, explanation and tool links, with an empty React workspace between the introduction and detailed instructions. The public stylesheet loads in the document head. React owns only `#root`; the public content remains visible if JavaScript, authentication or a backend request fails. Client navigation updates the same content and metadata from the generated manifest. No crawler detection or bot-only content is used.

The default full-screen layout remains in builds without a public origin. Public pages use a scrollable layout with an embedded workspace. Authenticated account/settings routes return to the full-screen layout and are `noindex`.

## Build configuration

- Hosted SaaS defaults in `.env.saas`: `VITE_OG_BASE_URL=https://stirling.com`, `VITE_OG_CANONICAL_SUBPATH=app`. Set `RUN_SUBPATH=app` in the production hosting environment; local development and root-mounted previews keep their existing base path.
- `VITE_OG_BASE_URL` is an origin, without `/app`. The build adds `VITE_OG_CANONICAL_SUBPATH` (SaaS: `app`, otherwise defaults to `RUN_SUBPATH`) once to canonical URLs, schema, social images and sitemap locations.
- Set `VITE_OG_PRODUCTION_BRANCH` to the Cloudflare production branch (default `main`). Other `CF_PAGES_BRANCH` values, or `VITE_BUILD_FOR_PREVIEW=1`, emit `noindex` metadata. Cloudflare previews also get an `X-Robots-Tag` header. Previews do not emit a sitemap.
- Other build variants opt into public pages by setting `VITE_OG_BASE_URL`. Leave it empty for a private/self-hosted installation. This is not an access-control mechanism.
- Generate metadata with `node frontend/editor/scripts/generate-og-metadata.mjs`. Change useful tool explanations in `src/core/data/publicToolContent.json`; generator outputs are committed. `task frontend:og:check` verifies they match.

## Hosting requirements

Cloudflare Pages builds emit `404.html` to disable its implicit catch-all to the homepage. Known public paths have their own HTML; private dynamic `/share/*`, `/processor/*`, `/settings/*` and `/docs/*` paths use an explicit `noindex` app shell. Preserve this routing when deploying elsewhere. Unknown public paths must return HTTP 404, not a 200 home shell.

The production reverse proxy must strip `/app` when requesting the Pages origin and preserve response status, content types and redirect destinations. It must serve `/app/sitemap.xml` as XML, without SPA fallback. Assets and public HTML must be accessible without cookies or sign-in. A Pages preview served at its root needs `RUN_SUBPATH=`; the production build requires `app`. Keep `VITE_OG_CANONICAL_SUBPATH=app` on both so previews reference the production URLs.

The following changes belong to the root-domain/marketing deployment, outside this repository:

1. Preserve the existing root robots policy and add `Sitemap: https://stirling.com/app/sitemap.xml` to the response used for `https://stirling.com/robots.txt`. A file at `/app/robots.txt` does not control crawling. Submit the app sitemap in Google Search Console and Bing Webmaster Tools as well.
2. Permanently redirect `https://www.stirling.com/app` and `/app/*` to the corresponding apex `https://stirling.com` URLs, preserving paths and query strings. Keep `/app` to `/app/` canonicalization consistent.
3. Verify WAF and bot-management policies allow intended search and answer-engine crawlers to retrieve public HTML and assets. Decide search visibility separately from permission to crawl for model training. `robots.txt` permission alone does not bypass a WAF challenge.
4. Ensure no production `X-Robots-Tag: noindex` header is inherited from the preview origin. Preview deployments must retain their noindex protection.

Cloudflare routing behavior: [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/) and [redirects](https://developers.cloudflare.com/pages/configuration/redirects/).

## Verification

Run `task frontend:check`, `task frontend:typecheck:saas` and `task frontend:og:check`. Regression tests cover ordinary HTML outside the mount point, React mounting, public/private route changes, aliases, schema and preview indexing rules.

After deploying, run:

```sh
task frontend:seo:verify -- https://stirling.com/app/
```

This checks the raw responses without executing site JavaScript, including representative tools, the editor, an alias, login, an unknown URL, XML sitemap, root robots and the www redirect. It deliberately fails against incomplete deployments.

Also check a fresh browser session: public content stays visible while the tool starts, no guest-auth failure redirects away from public text, scrolling reaches the tool links, and tool → login → tool navigation changes robots/canonical/schema correctly. Repeat with JavaScript disabled and at mobile width. Confirm indexing in Search Console/Bing after deployment; static HTML improves crawler access but does not guarantee rankings, rich results or AI citations. There is no universal AEO compliance score, and `llms.txt` is not required for this implementation.
