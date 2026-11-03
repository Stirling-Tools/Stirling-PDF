/** Historical subscriptions are billing records, not current wallet entitlements. */
export interface LegacySubscription {
  id: string;
  plan: "pro" | "team";
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "unpaid"
    | "paused"
    | "incomplete";
  currentPeriodEnd: string | null;
  teamId: number | null;
  teamAllowance: LegacyTeamAllowance | null;
}

/** The subscription's linked team as enforced by the backend; null maxUsers means unlimited. */
export interface LegacyTeamAllowance {
  teamId: number;
  usersInUse: number;
  maxUsers: number | null;
}

/** Account-owned billing; independent of the viewer's role in their current team. */
export interface LegacyBillingState {
  subscriptions: LegacySubscription[];
  loading: boolean;
  loadError: boolean;
  opening: boolean;
  portalError: boolean;
  refresh: () => void;
  openPortal: () => Promise<void>;
}
