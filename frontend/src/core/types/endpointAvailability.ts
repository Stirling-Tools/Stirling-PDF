export type EndpointDisableReason = 'CONFIG' | 'DEPENDENCY' | 'UNKNOWN' | null;

export interface EndpointAvailabilityDetails {
  enabled: boolean;
  reason?: EndpointDisableReason;
}
