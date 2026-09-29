/** Editor query keys: ["editor", <resource>, ...params]. */
export const qk = {
  adminSection: (sectionName: string) =>
    ["editor", "adminSection", sectionName] as const,
  /** The admin directory payload: a different endpoint and shape to qk.users(). */
  adminUsers: () => ["editor", "adminUsers"] as const,
  appConfig: () => ["editor", "appConfig"] as const,
  endpointsAvailability: () => ["editor", "endpointsAvailability"] as const,
  endpointEnabled: (endpoint: string) =>
    ["editor", "endpointEnabled", endpoint] as const,
  footerInfo: () => ["editor", "footerInfo"] as const,
  formDetectionModelStatus: () =>
    ["editor", "formDetectionModelStatus"] as const,
  groupEnabled: (group: string) => ["editor", "groupEnabled", group] as const,
  signingSessions: (userId: string | null) =>
    ["editor", "signingSessions", userId] as const,
  /** The PAYG wallet: usage, allowance and cap for the signed-in team. */
  paygWallet: () => ["editor", "paygWallet"] as const,
  /** Keyed on the asking identity: two users must never share one answer. */
  portalAccess: (userId: string | null) =>
    ["editor", "portalAccess", userId] as const,
  /** Per-state file counts for one processing folder, polled while on screen. */
  processingFolderCounts: (recordId: string) =>
    ["editor", "processingFolderCounts", recordId] as const,
  /** Every processing-folder record; shared by every folder row on the files page. */
  processingFolders: () => ["editor", "processingFolders"] as const,
  /** A working folder's per-file pipeline states, polled while it is open. */
  processingFolderFiles: (recordId: string) =>
    ["editor", "processingFolderFiles", recordId] as const,
  /** The runs feed behind one folder's live sweep wall. */
  processingFolderRuns: (policyId: string) =>
    ["editor", "processingFolderRuns", policyId] as const,
  teamDetails: (teamId: number) => ["editor", "teamDetails", teamId] as const,
  teams: () => ["editor", "teams"] as const,
  toolRecommendations: (context: string, limit: number, completions: number) =>
    ["editor", "toolRecommendations", context, limit, completions] as const,
  users: () => ["editor", "users"] as const,
  /** Historical billing belongs to the account, independently of its current team. */
  legacySubscriptions: (userId: string | null) =>
    ["editor", "legacySubscriptions", userId] as const,
} as const;
