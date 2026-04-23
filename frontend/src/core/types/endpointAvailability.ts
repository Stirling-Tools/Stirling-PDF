export type EndpointDisableReason =
  | "CONFIG"
  | "DEPENDENCY"
  | "UNKNOWN"
  | "NOT_SUPPORTED_LOCALLY"
  | null;

export interface EndpointAvailabilityDetails {
  enabled: boolean;
  reason?: EndpointDisableReason;
}
