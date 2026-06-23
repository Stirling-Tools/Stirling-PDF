import { httpJson } from "@portal/api/http";
import { isSaasApiConfigured } from "@portal/api/saas";
import { fetchWalletFromSaas } from "@portal/api/saasWallet";
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
 * Live wallet contract (subscription, free pool, period spend/cap, state).
 *
 * When VITE_SAAS_API_URL is configured, this calls the SaaS Java backend
 * directly with the admin's Supabase JWT (the attended-reads path designed for
 * portal→SaaS). The team is resolved from the JWT; the {@code tier} parameter
 * is ignored in that mode. When unconfigured, falls back to the local mock
 * path (keyed by tier) so dev/Storybook flows still work.
 */
export async function fetchWallet(tier: Tier): Promise<WalletContract> {
  if (isSaasApiConfigured) {
    return fetchWalletFromSaas();
  }
  return httpJson<WalletContract>(
    `/v1/billing/wallet?tier=${encodeURIComponent(tier)}`,
  );
}
