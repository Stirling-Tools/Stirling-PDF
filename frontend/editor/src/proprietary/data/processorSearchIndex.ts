import { PORTAL_BASENAME } from "@app/routes/portalBasename";
// A static leaf module (its portal import is type-only), so it doesn't pull
// the lazy portal chunk into the main bundle the way @portal/* values would.
import { usersCapabilities } from "@app/portal/usersCapabilities";
import type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";
import { HAS_PORTAL } from "@app/routes/hasPortal";

export type { ProcessorSearchEntry };

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
    id: "integrations",
    labelKey: "portal.nav.integrations",
    labelFallback: "Integrations",
    path: `${PORTAL_BASENAME}/integrations`,
    keywords: ["connections", "external", "api", "webhooks"],
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
    keywords: ["billing", "invoices", "plan", "wallet", "payg", "bundles"],
  },
  {
    id: "docs",
    labelKey: "portal.nav.docs",
    labelFallback: "Documentation",
    path: `${PORTAL_BASENAME}/docs`,
    keywords: ["api", "documentation", "reference", "guides"],
  },
];

// Empty without the portal: these destinations would 404.
export const PROCESSOR_SEARCH_INDEX: ProcessorSearchEntry[] = HAS_PORTAL
  ? VIEWS
  : [];

/**
 * Whether an entity scope's data source will serve the current session at
 * all. The users roster is the one divergent case: portal access alone
 * doesn't imply the roster endpoint will answer (see
 * UsersCapabilities.listingRequiresAdmin) — offering the lane anyway renders
 * a permanently-empty chip that fires a doomed request on every search.
 */
export function isPortalEntityScopeAccessible(
  scopeId: string,
  isAdmin: boolean,
): boolean {
  if (scopeId !== "portal-users") return true;
  return isAdmin || !usersCapabilities.listingRequiresAdmin;
}
