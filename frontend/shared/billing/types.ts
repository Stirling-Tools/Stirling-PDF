/**
 * The PAYG wallet contract — the single front-end mirror of the SaaS backend's
 * {@code WalletSnapshotResponse} ({@code GET /api/v1/payg/wallet}). Both the
 * editor cloud surface and the admin portal consume this, so a backend field
 * change is a one-line update here instead of three diverging copies.
 */

export type WalletStatus = "free" | "subscribed";
export type WalletRole = "leader" | "member";

/** One team member's billing-relevant row (name/email + their period spend). */
export interface WalletMember {
  userId: string;
  name: string;
  email: string;
  spendUnits: number;
}

/** Current-period spend split across the billable feature buckets. */
export interface WalletCategoryBreakdown {
  api: number;
  ai: number;
  automation: number;
}

/** A billable-activity row. The backend returns `[]` until the meter-event surface lands. */
export interface WalletActivityRow {
  id: number;
  kind: string;
  label: string;
  ts: string;
  docUnits: number;
}

export interface Wallet {
  /** Caller's primary team_id; null on the synthetic empty snapshot for team-less callers. */
  teamId: number | null;
  status: WalletStatus;
  role: WalletRole;
  /** ISO yyyy-mm-dd. Stripe period when subscribed; calendar month when free. */
  billingPeriodStart: string;
  billingPeriodEnd: string;
  /** Free grant used (free teams) or documents processed this period (subscribed). */
  billableUsed: number;
  /** Document ceiling for the window; null when subscribed-uncapped. */
  billableLimit: number | null;
  /** One-time free grant size — a lifetime pool that survives subscribing. */
  freeAllowance: number;
  /** Free grant still available; 0 = exhausted. */
  freeRemaining: number;
  /** Paid per-document rate in minor units (may be fractional); null = unknown (render "unknown", never substitute). */
  pricePerDocMinor: number | null;
  /** Lower-case ISO 4217; null when unknown. */
  currency: string | null;
  /** Estimated charges so far this period in minor units; null when the rate is unknown. The Stripe invoice is authoritative. */
  estimatedBillMinor: number | null;
  /** Monthly cap in major units when subscribed; null when noCap or free. */
  capUsd: number | null;
  /** Only meaningful when subscribed. */
  noCap: boolean;
  stripeSubscriptionId: string | null;
  spendUnitsThisPeriod: number;
  categoryBreakdown: WalletCategoryBreakdown;
  /** Populated for the leader view; empty for members / single-seat tenants. */
  members: WalletMember[];
  recent: WalletActivityRow[];
}
