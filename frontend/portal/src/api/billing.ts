import { apiClient } from "@portal/api/http";
import type { Wallet } from "@shared/billing";

/**
 * Real wallet + billing surface. All calls go to apiClient.saas — the hosted
 * SaaS Java backend, authed by the admin's Supabase JWT. The wallet contract
 * itself lives in {@code @shared/billing} (shared with the editor cloud surface).
 */

// Re-export the shared contract so existing `@portal/api/billing` importers keep working.
export type {
  Wallet,
  WalletStatus,
  WalletRole,
  WalletMember,
  WalletCategoryBreakdown,
  WalletActivityRow,
} from "@shared/billing";

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
