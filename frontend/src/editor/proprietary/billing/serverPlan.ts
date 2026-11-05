/** Validated local entitlement; cloud wallet membership must not supply the server's seats. */
export interface ServerPlan {
  licenseType: "SERVER" | "ENTERPRISE";
  maxUsers: number;
  usersInUse: number | null;
}
