import { httpJson } from "@portal/api/http";
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

/** GET /v1/procurement?tier=… — the deal, journey, ledger and supporting pool. */
export async function fetchProcurement(
  tier: Tier,
): Promise<ProcurementResponse> {
  return httpJson<ProcurementResponse>(
    `/v1/procurement?tier=${encodeURIComponent(tier)}`,
  );
}

/*
 * Commercial actions are demo stubs until the commercial backend exists. Each
 * resolves locally so the UI can show optimistic success; the real call is
 * documented inline as the backend contract.
 */

/** Advance the deal to the stage's next step (the gating CTA). */
export async function advanceStage(stage: DealStage): Promise<void> {
  // TODO(backend): POST /v1/procurement/advance { fromStage } — moves the deal
  // to the next stage and returns the updated Deal.
  void stage;
}

/** Pay the contract online (card / bank transfer via Stripe). */
export async function payOnline(): Promise<void> {
  // TODO(backend): POST /v1/procurement/pay — creates a Stripe checkout
  // session and returns its redirect URL.
}

/** Sign the Stirling Enterprise Agreement (MSA + order form + EULA + DPA). */
export async function signAgreement(docId: string): Promise<void> {
  // TODO(backend): POST /v1/procurement/sign { docId } — opens the e-signature
  // envelope and returns its signing URL.
  void docId;
}

/** Upload a purchase order to invoice against. */
export async function uploadPurchaseOrder(file: File): Promise<void> {
  // TODO(backend): POST /v1/procurement/purchase-order (multipart) — stores the
  // PO and flips the line item to pending invoice.
  void file;
}

/** Request a document that is generated on demand (some carry a one-off fee). */
export async function requestDocument(
  docId: string,
  action: DocAction,
): Promise<void> {
  // TODO(backend): POST /v1/procurement/documents/{docId}/request { action } —
  // queues generation (or a paid add-on) and notifies the solutions engineer.
  void docId;
  void action;
}
