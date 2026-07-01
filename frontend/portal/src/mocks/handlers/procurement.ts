import { http, HttpResponse, delay } from "msw";
import type { Tier } from "@portal/contexts/TierContext";
import {
  JOURNEY,
  buildProcurement,
  seedEnterpriseDeal,
  type DealStage,
  type ProcurementResponse,
} from "@portal/mocks/procurement";
import {
  advanceDeal,
  payDeal,
  requestDoc,
  signDoc,
  uploadPurchaseOrder,
} from "@portal/mocks/procurementMachine";

/**
 * Stateful mock of the commercial backend. The write endpoints drive the
 * procurement state machine over one in-memory enterprise deal, so the journey
 * genuinely progresses within a session, advancing a stage flips the gating
 * paperwork, unlocks the next stage's documents, and the GET reflects every
 * prior write. Swapping in the real backend is just deleting these handlers;
 * the api/ contracts and the state-machine semantics stay.
 */
let store = seedEnterpriseDeal();

/** Reseed the deal to its starting (mid-journey) state, used by tests + replay. */
export function resetProcurementStore() {
  store = seedEnterpriseDeal();
}

function snapshot(): ProcurementResponse {
  return {
    tier: "enterprise",
    unlocked: true,
    deal: store.deal,
    journey: JOURNEY,
    ledger: store.ledger,
    supporting: store.supporting,
  };
}

export const procurementHandlers = [
  http.get("/v1/procurement", async ({ request }) => {
    await delay(120);
    const tier = (new URL(request.url).searchParams.get("tier") ??
      "pro") as Tier;
    // Only the enterprise tenant has a live deal; others get the locked payload.
    if (tier !== "enterprise") return HttpResponse.json(buildProcurement(tier));
    return HttpResponse.json(snapshot());
  }),

  // POST /v1/procurement/advance, the journey's primary "next step".
  http.post("/v1/procurement/advance", async ({ request }) => {
    await delay(140);
    const { fromStage } = (await request.json()) as { fromStage: DealStage };
    advanceDeal(store, fromStage);
    return HttpResponse.json(snapshot());
  }),

  // POST /v1/procurement/sign, e-sign the agreement, then advance.
  http.post("/v1/procurement/sign", async ({ request }) => {
    await delay(160);
    const { docId } = (await request.json()) as { docId: string };
    signDoc(store, docId);
    return HttpResponse.json(snapshot());
  }),

  // POST /v1/procurement/pay, confirm online payment, then advance.
  http.post("/v1/procurement/pay", async () => {
    await delay(160);
    payDeal(store);
    return HttpResponse.json(snapshot());
  }),

  // POST /v1/procurement/purchase-order, upload a PO (an alternate pay path).
  http.post("/v1/procurement/purchase-order", async () => {
    await delay(160);
    uploadPurchaseOrder(store);
    return HttpResponse.json(snapshot());
  }),

  // POST /v1/procurement/documents/:docId/request, queue an on-demand doc.
  http.post("/v1/procurement/documents/:docId/request", async ({ params }) => {
    await delay(140);
    requestDoc(store, String(params.docId));
    return HttpResponse.json(snapshot());
  }),
];
