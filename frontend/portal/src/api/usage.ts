import { httpJson } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";
import type {
  BillingHistoryRow,
  BillingSummary,
  PlanOption,
  UsageSeriesResponse,
  WalletContract,
} from "@portal/mocks/usage";

export type {
  BillingHistoryRow,
  BillingSummary,
  EntitlementState,
  InvoiceStatus,
  PlanOption,
  SubscriptionStatus,
  UsagePoint,
  UsageSeriesResponse,
  WalletContract,
} from "@portal/mocks/usage";
export { OVERAGE_RATE } from "@portal/mocks/usage";

/** GET /v1/billing/usage — 30-day docs-processed series. */
export async function fetchBillingUsage(): Promise<UsageSeriesResponse> {
  return httpJson<UsageSeriesResponse>("/v1/billing/usage");
}

/** GET /v1/billing/summary?tier=… — KPI strip + current-plan figures. */
export async function fetchBillingSummary(tier: Tier): Promise<BillingSummary> {
  return httpJson<BillingSummary>(
    `/v1/billing/summary?tier=${encodeURIComponent(tier)}`,
  );
}

/** GET /v1/billing/plans — available plan catalogue. */
export async function fetchPlanOptions(): Promise<PlanOption[]> {
  return httpJson<PlanOption[]>("/v1/billing/plans");
}

/** GET /v1/billing/history?tier=… — invoice / line-item history. */
export async function fetchBillingHistory(
  tier: Tier,
): Promise<BillingHistoryRow[]> {
  return httpJson<BillingHistoryRow[]>(
    `/v1/billing/history?tier=${encodeURIComponent(tier)}`,
  );
}

/**
 * GET /v1/billing/wallet?tier=… — live wallet contract (subscription, free pool,
 * period spend/cap, state). The real billing shape the account-link surface
 * gates against; mirrors the SaaS InstanceController entitlement read.
 */
export async function fetchWallet(tier: Tier): Promise<WalletContract> {
  return httpJson<WalletContract>(
    `/v1/billing/wallet?tier=${encodeURIComponent(tier)}`,
  );
}
