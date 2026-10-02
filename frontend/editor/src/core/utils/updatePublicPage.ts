import { buildBodyContent, injectOg } from "@app/utils/publicPageSeo.mjs";
import type { OgManifest } from "@app/utils/publicPageSeo.mjs";

interface PublicPageConfig {
  ogBase: string;
  canonicalBase: string;
  noindex: boolean;
}

const META_SELECTOR =
  'meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[data-public-page-schema]';

/** Synchronize the public shell without replacing any nodes owned by React. */
export function updatePublicPage(pathname: string, manifest: OgManifest): void {
  const configElement = document.getElementById("stirling-page-config");
  if (!configElement?.textContent) return;
  const config: PublicPageConfig = JSON.parse(configElement.textContent);
  const route = pathname.replace(/\/+$/, "") || "/";
  const isHome = route === "/";
  const entry = isHome
    ? manifest.default
    : manifest.byTool[manifest.byPath[route]];
  const isPublic = !!entry && !entry.noindex;
  const metadata = injectOg(
    '<head><title></title><meta name="description" content="" /></head>',
    entry || manifest.default,
    {
      ogBase: config.ogBase,
      canonicalBase: entry ? config.canonicalBase : "",
      pageUrlPath: route,
      canonicalPath: manifest.canonicalByPath?.[route] || route,
      noindex: config.noindex || !isPublic,
      isHome,
    },
  );
  const head = new DOMParser().parseFromString(metadata, "text/html").head;
  document.title = head.querySelector("title")?.textContent || "Stirling PDF";
  document.head
    .querySelectorAll(META_SELECTOR)
    .forEach((node) => node.remove());
  head
    .querySelectorAll(META_SELECTOR)
    .forEach((node) => document.head.appendChild(node));

  const root = document.getElementById("root");
  if (!root) return;
  document.body.toggleAttribute("data-public-page", isPublic);
  const existing = ["public-page-intro", "public-page-details"];
  existing.forEach((id) => document.getElementById(id)?.remove());
  if (!isPublic) return;
  const body = new DOMParser().parseFromString(
    buildBodyContent(entry, {
      navLinks: manifest.navLinks,
      heading: isHome ? "Online PDF Tools" : null,
    }),
    "text/html",
  );
  const intro = body.getElementById(existing[0]);
  const details = body.getElementById(existing[1]);
  if (intro) root.before(intro);
  if (details) root.after(details);
}
