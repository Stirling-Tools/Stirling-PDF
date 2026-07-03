import { apiClient } from "@portal/api/http";
import type { Tier } from "@portal/contexts/TierContext";
import type {
  DealStage,
  DocAction,
  ProcurementResponse,
} from "@portal/mocks/procurement";

export type {
  Deal,
  DealStage,
  DocAction,
  DocStatus,
  JourneyStep,
  LedgerDoc,
  LedgerGroup,
  ProcurementResponse,
  QuoteInfo,
  SolutionsEngineer,
  SupportingCategory,
  SupportingGroup,
  TrialInfo,
} from "@portal/mocks/procurement";
export { JOURNEY } from "@portal/mocks/procurement";

/** GET /v1/procurement?tier=…, the deal, journey, ledger and supporting pool. */
export async function fetchProcurement(
  tier: Tier,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>(
    `/v1/procurement?tier=${encodeURIComponent(tier)}`,
  );
}

/*
 * Commercial actions. Each mutates the deal server-side and returns the updated
 * ProcurementResponse, the new canonical state, which the view applies so the
 * journey progresses. The MSW layer answers these today; a real backend honours
 * the same contracts unchanged.
 */

/** Advance the deal to the next stage (the journey's primary CTA). */
export async function advanceStage(
  fromStage: DealStage,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/advance", {
    method: "POST",
    body: { fromStage },
  });
}

/** Sign the Stirling Enterprise Agreement (MSA + order form + EULA + DPA). */
export async function signAgreement(
  docId: string,
): Promise<ProcurementResponse> {
  // A real backend opens an e-signature envelope and completes on callback;
  // here it completes immediately and advances the deal.
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/sign", {
    method: "POST",
    body: { docId },
  });
}

/** Pay the contract online (card / bank transfer via Stripe). */
export async function payOnline(): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>("/v1/procurement/pay", {
    method: "POST",
  });
}

/** Upload a purchase order to invoice against (an alternate payment path). */
export async function uploadPurchaseOrder(
  file: File,
): Promise<ProcurementResponse> {
  // A real backend takes the PO as multipart; the mock only needs the name.
  return apiClient.local.json<ProcurementResponse>(
    "/v1/procurement/purchase-order",
    {
      method: "POST",
      body: { fileName: file.name },
    },
  );
}

/** Request a document that is generated on demand (some carry a one-off fee). */
export async function requestDocument(
  docId: string,
  action: DocAction,
): Promise<ProcurementResponse> {
  return apiClient.local.json<ProcurementResponse>(
    `/v1/procurement/documents/${encodeURIComponent(docId)}/request`,
    { method: "POST", body: { action } },
  );
}
