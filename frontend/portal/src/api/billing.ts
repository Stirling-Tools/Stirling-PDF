import { apiClient } from "@portal/api/http";

/**
 * Real wallet + billing surface. All calls go to apiClient.saas — the hosted
 * SaaS Java backend, authed by the admin's Supabase JWT. Replaces the prior
 * MSW-only /v1/billing/* mocks; the FE now consumes the same shape the SaaS
 * web app's useWallet hook does.
 */

// ────────────────────────────────────────────────────────────────────────────
// Wallet — mirrors WalletSnapshotResponse on the SaaS backend.
// ────────────────────────────────────────────────────────────────────────────

export interface WalletCategoryBreakdown {
  api: number;
  ai: number;
  automation: number;
}

export interface WalletMember {
  userId: string;
  name: string;
  email: string;
  spendUnits: number;
}

export interface WalletActivityRow {
  id: number;
  kind: string;
  label: string;
  ts: string;
  docUnits: number;
}

/** Single source of truth for everything the billing page renders. */
export interface Wallet {
  teamId: number | null;
  status: "free" | "subscribed";
  role: "leader" | "member";
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billableUsed: number;
  billableLimit: number | null;
  freeAllowance: number;
  freeRemaining: number;
  /** Minor units of currency (e.g. cents); may be fractional. null = unknown. */
  pricePerDocMinor: number | null;
  /** Lower-case ISO 4217 (e.g. "usd"). null = unknown. */
  currency: string | null;
  /** Minor units (e.g. cents). null = unknown. */
  estimatedBillMinor: number | null;
  /** Major currency units (e.g. USD). null when free or noCap. */
  capUsd: number | null;
  noCap: boolean;
  stripeSubscriptionId: string | null;
  spendUnitsThisPeriod: number;
  categoryBreakdown: WalletCategoryBreakdown;
  members: WalletMember[];
  recent: WalletActivityRow[];
}

export async function fetchWallet(): Promise<Wallet> {
  return apiClient.saas.json<Wallet>("/api/v1/payg/wallet");
}

// ────────────────────────────────────────────────────────────────────────────
// Cap — leader-only PATCH (real endpoint).
// ────────────────────────────────────────────────────────────────────────────

export async function updateCap(
  capUsd: number | null,
): Promise<void> {
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
}

export async function fetchInvoices(limit: number = 20): Promise<Invoice[]> {
  return apiClient.saas.json<Invoice[]>(
    `/api/v1/payg/invoices?limit=${encodeURIComponent(String(limit))}`,
  );
}
