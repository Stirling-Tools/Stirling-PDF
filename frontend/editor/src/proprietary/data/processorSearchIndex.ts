import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";

export type { ProcessorSearchEntry };

// Mirrors the admin-route seam's gate: the portal route-set is only mounted in
// dev and in builds made with VITE_INCLUDE_PORTAL=true, so the search must not
// offer destinations that would 404 elsewhere.
const includePortal =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;

/**
 * The portal's in-app views. Deliberately a static mirror of the portal's nav
 * (labels via the same portal.nav.* keys its sidebar uses) rather than an
 * import from @portal/* — referencing the portal package here would pull the
 * lazy portal chunk into the main bundle.
 */
const VIEWS: ProcessorSearchEntry[] = [
  {
    id: "home",
    labelKey: "portal.nav.home",
    labelFallback: "Home",
    path: PORTAL_BASENAME,
    keywords: ["portal", "processor", "admin"],
  },
  {
    id: "users",
    labelKey: "portal.nav.users",
    labelFallback: "Users",
    path: `${PORTAL_BASENAME}/users`,
    keywords: ["team", "members", "roles", "admin"],
  },
  {
    id: "sources",
    labelKey: "portal.nav.sources",
    labelFallback: "Sources",
    path: `${PORTAL_BASENAME}/sources`,
    keywords: ["s3", "connections", "webhooks", "folders"],
  },
  {
    id: "policies",
    labelKey: "portal.nav.policies",
    labelFallback: "Policies",
    path: `${PORTAL_BASENAME}/policies`,
    keywords: ["enforcement", "redact", "compliance"],
  },
  {
    id: "pipelines",
    labelKey: "portal.nav.pipelines",
    labelFallback: "Pipelines",
    path: `${PORTAL_BASENAME}/pipelines`,
    keywords: ["automation", "workflows", "operations"],
  },
  {
    id: "documents",
    labelKey: "portal.nav.documents",
    labelFallback: "Documents",
    path: `${PORTAL_BASENAME}/documents`,
    keywords: ["audit", "files"],
  },
  {
    id: "components",
    labelKey: "portal.nav.components",
    labelFallback: "Components",
    path: `${PORTAL_BASENAME}/components`,
    keywords: ["sdk", "embed"],
  },
  {
    id: "infrastructure",
    labelKey: "portal.nav.infrastructure",
    labelFallback: "Infrastructure",
    path: `${PORTAL_BASENAME}/infrastructure`,
    keywords: ["deployment", "instances", "health"],
  },
  {
    id: "usage",
    labelKey: "portal.nav.usage",
    labelFallback: "Usage & Billing",
    path: `${PORTAL_BASENAME}/usage`,
    keywords: ["billing", "invoices", "plan", "wallet"],
  },
  {
    id: "docs",
    labelKey: "portal.nav.docs",
    labelFallback: "Developer Docs",
    path: "",
    externalUrl: "https://docs.stirlingpdf.com/",
    keywords: ["api", "documentation", "reference"],
  },
];

export const PROCESSOR_SEARCH_INDEX: ProcessorSearchEntry[] = includePortal
  ? VIEWS
  : [];
