import type { Tier } from "@processor/contexts/TierContext";
import type { FileRunEventScope } from "@processor/api/fileRunEvents";

/**
 * The processor's TanStack Query keys, in one place. Convention:
 * ["processor", <resource>, ...params].
 *
 * Keep keys flavor-agnostic — self-hosted-vs-SaaS routing lives in the api
 * functions, not the key, so one key addresses whichever backend the build
 * resolves. Include tier only for resources whose response varies by tier.
 */
export const qk = {
  // Tier-independent
  policiesList: () => ["processor", "policies", "list"] as const,
  policyRuns: () => ["processor", "policies", "runs"] as const,
  sources: () => ["processor", "sources"] as const,
  pipelines: () => ["processor", "pipelines"] as const,
  policyPermissions: () => ["processor", "policies", "permissions"] as const,
  fleetStats: () => ["processor", "fleetStats"] as const,
  appConfig: () => ["processor", "appConfig"] as const,
  // Keyed on scope: the open queue and the closed one are different reads.
  fileRunEvents: (scope: FileRunEventScope) =>
    ["processor", "fileRunEvents", scope] as const,
  /** Prefix matching both scopes, for invalidating the pair. */
  fileRunEventsAll: () => ["processor", "fileRunEvents"] as const,
  // Keyed on linkage: an unlinked account has no deal to read, so linking must not
  // serve the unlinked (null) snapshot back from cache.
  procurement: (linked: boolean) => ["processor", "procurement", linked] as const,
  // Same reasoning: an unlinked instance has no wallet in the cloud.
  wallet: (linked: boolean) => ["processor", "wallet", linked] as const,

  // Tier-dependent
  documents: (tier: Tier) => ["processor", "documents", tier] as const,
  auditLog: (tier: Tier) => ["processor", "auditLog", tier] as const,
  editorDeployment: (tier: Tier) =>
    ["processor", "editorDeployment", tier] as const,

  // Users cluster (consumed by usersData.ts + Home onboarding)
  usersRoster: (tier: Tier) => ["processor", "users", "roster", tier] as const,
  usersGrants: (tier: Tier) => ["processor", "users", "grants", tier] as const,
  usersTeams: (tier: Tier) => ["processor", "users", "teams", tier] as const,
  usersAuthConfig: () => ["processor", "users", "authConfig"] as const,
  /** SaaS-only shared team directory (/api/v1/team/my) — see the /team/my collapse. */
  teamMy: () => ["processor", "team", "my"] as const,
} as const;
