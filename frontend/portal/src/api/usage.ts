import { apiClient } from "@portal/api/http";
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

/**
 * `/v1/billing/*` paths are MSW-only inventions. With Mocks=on they're served
 * by the portal's mock handlers; with Mocks=off they 404 against the local
 * backend (which doesn't serve any /v1/billing/*). They'll move to
 * apiClient.saas.json once a real SaaS endpoint exists.
 */

/** 30-day docs-processed series. MSW-only until SaaS endpoint exists. */
export async function fetchBillingUsage(): Promise<UsageSeriesResponse> {
  return apiClient.mock.json<UsageSeriesResponse>("/v1/billing/usage");
}

/** KPI strip + current-plan figures. MSW-only until SaaS endpoint exists. */
export async function fetchBillingSummary(tier: Tier): Promise<BillingSummary> {
  return apiClient.mock.json<BillingSummary>(
    `/v1/billing/summary?tier=${encodeURIComponent(tier)}`,
  );
}

/** Available plan catalogue. MSW-only until SaaS endpoint exists. */
export async function fetchPlanOptions(): Promise<PlanOption[]> {
  return apiClient.mock.json<PlanOption[]>("/v1/billing/plans");
}

/** Invoice / line-item history. MSW-only until SaaS endpoint exists. */
export async function fetchBillingHistory(
  tier: Tier,
): Promise<BillingHistoryRow[]> {
  return apiClient.mock.json<BillingHistoryRow[]>(
    `/v1/billing/history?tier=${encodeURIComponent(tier)}`,
  );
}

/**
 * Live wallet contract (subscription, free pool, period spend/cap, state).
 *
 * Routes by configuration, NOT by guessing from the path:
 *   - VITE_SAAS_API_URL set → apiClient.saas → real SaaS /api/v1/payg/wallet,
 *     auth'd by the admin's Supabase JWT (the canonical attended path).
 *   - VITE_SAAS_API_URL unset → apiClient.mock → MSW-only /v1/billing/wallet,
 *     so dev/Storybook keep working with mock data. The {@code tier} arg only
 *     affects the mock; the SaaS call resolves the team from the JWT.
 *
 * If neither is in play (Mocks=off + no VITE_SAAS_API_URL), the call 404s
 * against the local backend — that's intentional; configure one or the other.
 */
export async function fetchWallet(tier: Tier): Promise<WalletContract> {
  if (apiClient.saas.isConfigured()) {
    return fetchWalletFromSaas();
  }
  return apiClient.mock.json<WalletContract>(
    `/v1/billing/wallet?tier=${encodeURIComponent(tier)}`,
  );
}
