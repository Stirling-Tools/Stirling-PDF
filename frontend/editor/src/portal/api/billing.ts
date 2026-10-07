import { apiClient } from "@portal/api/http";
import type { Wallet } from "@app/billing";

/**
 * Real wallet + billing surface. All calls go to apiClient.saas — the hosted
 * SaaS Java backend, authed by the admin's Supabase JWT. The wallet contract
 * itself lives in {@code @app/billing} (shared with the editor cloud surface).
 */

// Re-export the shared contract so existing `@portal/api/billing` importers keep working.
export type {
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
  TeamHolding,
  ProcessorHolding,
} from "@app/billing";

export async function fetchWallet(): Promise<Wallet> {
  return apiClient.saas.json<Wallet>("/api/v1/payg/wallet");
}

/**
 * Force the SaaS to drop this team's cached wallet snapshot so the next
 * {@link fetchWallet} reflects a just-changed billing state (e.g. a completed
 * checkout) without waiting out the ~30s server-side cache. Best-effort — the
 * caller polls regardless of whether this succeeds.
 */
export async function refreshWalletCache(): Promise<void> {
  await apiClient.saas.json<void>("/api/v1/payg/wallet/refresh", {
    method: "POST",
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Cap — leader-only PATCH (real endpoint).
// ────────────────────────────────────────────────────────────────────────────

export async function updateCap(capUsd: number | null): Promise<void> {
  await apiClient.saas.json<void>("/api/v1/payg/cap", {
    method: "PATCH",
    body: { capUsd: capUsd ?? 0, noCap: capUsd === null },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Invoices — backed by GET /api/v1/payg/invoices (reads stripe.invoices via
// the Sync Engine). Returns [] for free teams + missing schema.
// ────────────────────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  number: string | null;
  status: string;
  totalMinor: number | null;
  currency: string | null;
  createdAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  /** Product name from the subscription chain (e.g. "Stirling Processor Plan"). */
  description: string | null;
  /** Billed units (PDFs) on this invoice; null when the line-item table isn't synced. */
  pdfsProcessed: number | null;
}

export async function fetchInvoices(limit: number = 20): Promise<Invoice[]> {
  return apiClient.saas.json<Invoice[]>(
    `/api/v1/payg/invoices?limit=${encodeURIComponent(String(limit))}`,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Payment method — GET /api/v1/payg/payment-method. Reads the default card off
// the Stripe mirror; `present: false` when the mirror doesn't carry one (table
// not synced / no card). Card edits happen in Stripe's portal, not here.
// ────────────────────────────────────────────────────────────────────────────

export interface PaymentMethod {
  present: boolean;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export async function fetchPaymentMethod(): Promise<PaymentMethod> {
  return apiClient.saas.json<PaymentMethod>("/api/v1/payg/payment-method");
}

// GET /api/v1/payg/billing-details. `present: false` when the Stripe mirror carries no
// customer. Read-only: the mirror is one-way, and Stripe's hosted portal is the writer.

export interface BillingDetails {
  present: boolean;
  companyName: string | null;
  invoiceEmail: string | null;
  /** Per-subscription renewal dates; absent until supported by the hosted backend. */
  upcomingInvoices?: Array<{
    subscriptionId: string;
    description: string | null;
    date: string;
  }>;
}

export async function fetchBillingDetails(): Promise<BillingDetails> {
  return apiClient.saas.json<BillingDetails>("/api/v1/payg/billing-details");
}

// ────────────────────────────────────────────────────────────────────────────
// Cancellation: /api/v1/payg/subscriptions. The team comes from the caller and
// only billing leaders get in. Cancelling schedules the end of the paid period.
// ────────────────────────────────────────────────────────────────────────────

export type CancelProduct = "team" | "processor";
export type CancelScope = CancelProduct | "both";
export type CancelReason =
  | "too_expensive"
  | "unused"
  | "missing_features"
  | "not_working"
  | "too_complex"
  | "switched_service"
  | "temporary"
  | "support"
  | "other";

/** One live Team or Processor subscription. */
export interface SubscriptionState {
  product: CancelProduct;
  subscriptionId: string;
  status: string;
  /** A cancel is scheduled; `endsAt` says when it takes effect. */
  cancelling: boolean;
  endsAt: string | null;
  /** End of the paid period: the renewal date, or the stop date once cancelled. */
  periodEnd: string | null;
}

interface SubscriptionsResponse {
  subscriptions: SubscriptionState[];
}

export async function fetchSubscriptionStates(): Promise<SubscriptionState[]> {
  const res = await apiClient.saas.json<SubscriptionsResponse>(
    "/api/v1/payg/subscriptions",
  );
  return res.subscriptions;
}

export async function cancelSubscription(req: {
  product: CancelScope;
  reason: CancelReason;
  detail?: string;
  competitor?: string;
  offerShown?: string;
}): Promise<SubscriptionState[]> {
  const res = await apiClient.saas.json<SubscriptionsResponse>(
    "/api/v1/payg/subscriptions/cancel",
    { method: "POST", body: req },
  );
  return res.subscriptions;
}

export async function resumeSubscription(
  product: CancelScope,
): Promise<SubscriptionState[]> {
  const res = await apiClient.saas.json<SubscriptionsResponse>(
    "/api/v1/payg/subscriptions/resume",
    { method: "POST", body: { product } },
  );
  return res.subscriptions;
}

/** Posts to the churn channel. Rejects with a 429 HttpError after three in a day. */
export async function contactBeforeCancelling(req: {
  product: CancelProduct;
  reason: CancelReason | null;
  message: string;
  replyTo?: string;
}): Promise<void> {
  await apiClient.saas.json<void>("/api/v1/payg/subscriptions/contact", {
    method: "POST",
    body: req,
  });
}
