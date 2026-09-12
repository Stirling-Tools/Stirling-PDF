/** Team-owned instance returned by GET /api/v1/account-link/instances, including revoked credentials. */
export interface LinkedInstanceRow {
  instanceId: number;
  deviceId: string;
  name: string | null;
  createdAt: string | null;
  /** Last credential-authenticated contact with Stirling; not a heartbeat or online status. */
  lastSeenAt: string | null;
  revoked: boolean;
}
