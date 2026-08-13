import { PROCESSOR_BASENAME } from "@app/routes/processorBasename";
// A static leaf module (its portal import is type-only), so it doesn't pull
// the lazy portal chunk into the main bundle the way @processor/* values would.
import { usersCapabilities } from "@app/processor/usersCapabilities";
import type { ProcessorSearchEntry } from "@core/data/processorSearchIndex";

export type { ProcessorSearchEntry };

// Mirrors the admin-route seam's gate: the portal route-set is only mounted in
// dev and in builds made with VITE_INCLUDE_PROCESSOR=true, so the search must not
// offer destinations that would 404 elsewhere.
const includePortal =
  import.meta.env.VITE_INCLUDE_PROCESSOR === "true" || import.meta.env.DEV;

/**
 * The portal's in-app views. Deliberately a static mirror of the portal's nav
 * (labels via the same processor.nav.* keys its sidebar uses) rather than an
 * import from @processor/* — referencing the portal package here would pull the
 * lazy portal chunk into the main bundle.
 */
const VIEWS: ProcessorSearchEntry[] = [
  {
    id: "home",
    labelKey: "processor.nav.home",
    labelFallback: "Home",
    path: PROCESSOR_BASENAME,
    keywords: ["portal", "processor", "admin"],
  },
  {
    id: "users",
    labelKey: "processor.nav.users",
    labelFallback: "Users",
    path: `${PROCESSOR_BASENAME}/users`,
    keywords: ["team", "members", "roles", "admin"],
  },
  {
    id: "sources",
    labelKey: "processor.nav.sources",
    labelFallback: "Sources",
    path: `${PROCESSOR_BASENAME}/sources`,
    keywords: ["s3", "connections", "webhooks", "folders"],
  },
  {
    id: "policies",
    labelKey: "processor.nav.policies",
    labelFallback: "Policies",
    path: `${PROCESSOR_BASENAME}/policies`,
    keywords: ["enforcement", "redact", "compliance"],
  },
  {
    id: "pipelines",
    labelKey: "processor.nav.pipelines",
    labelFallback: "Pipelines",
    path: `${PROCESSOR_BASENAME}/pipelines`,
    keywords: ["automation", "workflows", "operations"],
  },
  {
    id: "documents",
    labelKey: "processor.nav.documents",
    labelFallback: "Documents",
    path: `${PROCESSOR_BASENAME}/documents`,
    keywords: ["audit", "files"],
  },
  {
    id: "integrations",
    labelKey: "processor.nav.integrations",
    labelFallback: "Integrations",
    path: `${PROCESSOR_BASENAME}/integrations`,
    keywords: ["connections", "external", "api", "webhooks"],
  },
  {
    id: "infrastructure",
    labelKey: "processor.nav.infrastructure",
    labelFallback: "Infrastructure",
    path: `${PROCESSOR_BASENAME}/infrastructure`,
    keywords: ["deployment", "instances", "health"],
  },
  {
    id: "usage",
    labelKey: "processor.nav.usage",
    labelFallback: "Usage & Billing",
    path: `${PROCESSOR_BASENAME}/usage`,
    keywords: ["billing", "invoices", "plan", "wallet", "payg", "bundles"],
  },
  {
    id: "docs",
    labelKey: "processor.nav.docs",
    labelFallback: "Documentation",
    path: `${PROCESSOR_BASENAME}/docs`,
    keywords: ["api", "documentation", "reference", "guides"],
  },
];

export const PROCESSOR_SEARCH_INDEX: ProcessorSearchEntry[] = includePortal
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
