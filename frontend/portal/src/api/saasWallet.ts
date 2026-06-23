/**
 * Adapter from the SaaS `WalletSnapshotResponse` (PaygWalletController) to the
 * portal's trim `WalletContract`. The portal only renders subscription /
 * free-remaining / cap / spend / display-state, not the full SaaS payload
 * (members, breakdowns, activity).
 *
 * Direct portal → SaaS call: authenticated with the admin's Supabase JWT via
 * {@link apiClient.saas}. Not gated on the device credential (that's
 * instance-only, for unattended metering).
 */
import { apiClient } from "@portal/api/http";
import type {
  EntitlementState,
  SubscriptionStatus,
  WalletContract,
} from "@portal/mocks/usage";

/** Subset of {@code WalletSnapshotResponse} the portal actually consumes. */
export interface SaasWalletSnapshot {
  status: string;
  freeRemaining: number;
  billableLimit: number | null;
  spendUnitsThisPeriod: number;
}

/**
 * Maps the SaaS subscription string ({@code "free" | "subscribed"}) onto the
 * portal's SubscriptionStatus enum. Stripe past_due / canceled aren't exposed
 * by the wallet endpoint today, so we conservatively treat anything non-free
 * as `active` and refine later if the SaaS payload grows the field.
 */
function mapStatus(saasStatus: string): SubscriptionStatus {
  return saasStatus === "subscribed" ? "active" : "none";
}

/**
 * Derives the display state from the wallet numbers. The canonical state lives
 * in the EntitlementService on the SaaS side (and the instance gate reads it
 * via the device credential), but the portal only needs it for badge tone:
 *   - over cap          → DEGRADED
 *   - within 10% of cap → WARNED
 *   - subscribed-uncapped or comfortably under → FULL
 *   - free, exhausted   → DEGRADED
 *   - free, low (<20%)  → WARNED
 */
function deriveState(
  status: SubscriptionStatus,
  freeRemaining: number,
  billableLimit: number | null,
  periodSpend: number,
): EntitlementState {
  if (status === "active") {
    if (billableLimit === null) return "FULL";
    if (periodSpend >= billableLimit) return "DEGRADED";
    if (periodSpend >= billableLimit * 0.9) return "WARNED";
    return "FULL";
  }
  // Free path uses the lifetime grant remaining.
  if (freeRemaining <= 0) return "DEGRADED";
  if (freeRemaining < 100) return "WARNED";
  return "FULL";
}

/** Pure mapper (exported for testability). */
export function adaptSaasWallet(snap: SaasWalletSnapshot): WalletContract {
  const subscriptionStatus = mapStatus(snap.status);
  return {
    subscriptionStatus,
    freeUnitsRemaining: snap.freeRemaining,
    monthlyCapUnits: snap.billableLimit,
    periodSpend: snap.spendUnitsThisPeriod,
    state: deriveState(
      subscriptionStatus,
      snap.freeRemaining,
      snap.billableLimit,
      snap.spendUnitsThisPeriod,
    ),
  };
}

/** Fetch the live wallet from the SaaS Java backend with the admin's JWT. */
export async function fetchWalletFromSaas(): Promise<WalletContract> {
  const snap = await apiClient.saas.json<SaasWalletSnapshot>(
    "/api/v1/payg/wallet",
  );
  return adaptSaasWallet(snap);
}
