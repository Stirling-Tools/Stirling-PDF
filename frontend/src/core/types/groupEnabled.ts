export interface GroupEnabledResult {
  enabled: boolean | null;
  /** Human-readable reason shown when the feature is unavailable. Null while loading or when enabled. */
  unavailableReason: string | null;
}
