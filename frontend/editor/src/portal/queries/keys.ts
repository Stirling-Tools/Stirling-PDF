import type { Tier } from "@portal/contexts/TierContext";

/**
 * The portal's TanStack Query keys, in one place. Convention:
 * ["portal", <resource>, ...params].
 *
 * Keep keys flavor-agnostic — self-hosted-vs-SaaS routing lives in the api
 * functions, not the key, so one key addresses whichever backend the build
 * resolves. Include tier only for resources whose response varies by tier.
 */
export const qk = {
  // Tier-independent
  policiesList: () => ["portal", "policies", "list"] as const,
  policyRuns: () => ["portal", "policies", "runs"] as const,
  sources: () => ["portal", "sources"] as const,
  pipelines: () => ["portal", "pipelines"] as const,
  fleetStats: () => ["portal", "fleetStats"] as const,
  appConfig: () => ["portal", "appConfig"] as const,

  // Tier-dependent
  documents: (tier: Tier) => ["portal", "documents", tier] as const,
  auditLog: (tier: Tier) => ["portal", "auditLog", tier] as const,
  editorDeployment: (tier: Tier) =>
    ["portal", "editorDeployment", tier] as const,

  // Users cluster (consumed by usersData.ts + Home onboarding)
  usersRoster: (tier: Tier) => ["portal", "users", "roster", tier] as const,
  usersGrants: (tier: Tier) => ["portal", "users", "grants", tier] as const,
  usersTeams: (tier: Tier) => ["portal", "users", "teams", tier] as const,
  usersAuthConfig: () => ["portal", "users", "authConfig"] as const,
  /** SaaS-only shared team directory (/api/v1/team/my) — see the /team/my collapse. */
  teamMy: () => ["portal", "team", "my"] as const,
} as const;
