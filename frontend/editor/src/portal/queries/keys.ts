import type { Tier } from "@portal/contexts/TierContext";

/**
 * Single source of truth for the portal's TanStack Query keys.
 *
 * Convention: ["portal", <resource>, ...params]. Keys are **flavor-agnostic** —
 * the self-hosted-vs-SaaS routing lives inside the api functions / apiClient,
 * never in the key, so the same key correctly addresses whichever backend the
 * flavor build resolves. Do NOT encode `local`/`saas` here.
 *
 * Tier is part of the key ONLY for resources whose response actually varies by
 * tier (documents, audit log, editor deployment, and the users cluster).
 * Tier-independent resources (policies, sources, pipelines, fleet stats,
 * app-config) get a single shared cache entry across all tiers.
 */
export const qk = {
  // Tier-independent
  policiesList: () => ["portal", "policies", "list"] as const,
  policyRuns: () => ["portal", "policies", "runs"] as const,
  sources: () => ["portal", "sources"] as const,
  pipelines: () => ["portal", "pipelines"] as const,
  fleetStats: () => ["portal", "fleetStats"] as const,
  appConfig: () => ["portal", "appConfig"] as const,
  wallet: () => ["portal", "wallet"] as const,
  s3Connections: () => ["portal", "integrations", "s3"] as const,

  // Tier-dependent
  documents: (tier: Tier) => ["portal", "documents", tier] as const,
  auditLog: (tier: Tier) => ["portal", "auditLog", tier] as const,
  editorDeployment: (tier: Tier) =>
    ["portal", "editorDeployment", tier] as const,

  // Users cluster (keys preserved from the Users POC in usersData.ts)
  usersRoster: (tier: Tier) => ["portal", "users", "roster", tier] as const,
  usersGrants: (tier: Tier) => ["portal", "users", "grants", tier] as const,
  usersTeams: (tier: Tier) => ["portal", "users", "teams", tier] as const,
  usersAuthConfig: () => ["portal", "users", "authConfig"] as const,
  /** SaaS-only shared team directory (/api/v1/team/my) — see the /team/my collapse. */
  teamMy: () => ["portal", "team", "my"] as const,
} as const;
