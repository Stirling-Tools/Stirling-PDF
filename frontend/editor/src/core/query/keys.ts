/** Editor query keys: ["editor", <resource>, ...params]. */
export const qk = {
  /** The admin directory payload: a different endpoint and shape to qk.users(). */
  adminUsers: () => ["editor", "adminUsers"] as const,
  appConfig: () => ["editor", "appConfig"] as const,
  endpointsAvailability: () => ["editor", "endpointsAvailability"] as const,
  endpointEnabled: (endpoint: string) =>
    ["editor", "endpointEnabled", endpoint] as const,
  footerInfo: () => ["editor", "footerInfo"] as const,
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  signingSessions: () => ["editor", "signingSessions"] as const,
  /** Keyed on the asking identity: two users must never share one answer. */
  portalAccess: (userId: string | null) =>
    ["editor", "portalAccess", userId] as const,
  teamDetails: (teamId: number) => ["editor", "teamDetails", teamId] as const,
  teams: () => ["editor", "teams"] as const,
  toolRecommendations: (context: string, limit: number) =>
    ["editor", "toolRecommendations", context, limit] as const,
  users: () => ["editor", "users"] as const,
} as const;
