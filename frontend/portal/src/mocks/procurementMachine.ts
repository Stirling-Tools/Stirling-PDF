/**
 * The procurement deal's state machine, the exact server-side semantics the
 * mock backend enforces, as pure functions over a {@link ProcurementStore}.
 *
 * Kept separate from the MSW handler (which just owns one in-memory store and
 * wires these to endpoints) so the rules are unit-testable without a network,
 * and so a real backend has a precise spec to mirror. Every function mutates
 * the store in place, there's a single instance per session.
 */

import {
  JOURNEY,
  type Deal,
  type DealStage,
  type DocAction,
  type DocStatus,
  type LedgerDoc,
  type LedgerGroup,
  type SupportingGroup,
} from "@portal/mocks/procurement";

export interface ProcurementStore {
  deal: Deal;
  ledger: LedgerGroup[];
  supporting: SupportingGroup[];
}

/** Document actions that gate a stage, completing them moves the deal forward. */
const GATING: DocAction[] = ["sign", "pay", "upload"];

function nextStage(stage: DealStage): DealStage | null {
  const i = JOURNEY.findIndex((s) => s.stage === stage);
  return i >= 0 && i < JOURNEY.length - 1 ? JOURNEY[i + 1].stage : null;
}

function allDocs(store: ProcurementStore): LedgerDoc[] {
  return [
    ...store.ledger.flatMap((g) => g.docs),
    ...store.supporting.flatMap((g) => g.docs),
  ];
}

function setDocStatus(store: ProcurementStore, id: string, status: DocStatus) {
  const doc = allDocs(store).find((d) => d.id === id);
  if (doc) doc.status = status;
}

function stageOfDoc(
  store: ProcurementStore,
  id: string,
): DealStage | undefined {
  return store.ledger.find((g) => g.docs.some((d) => d.id === id))?.stage;
}

/**
 * Advance the deal one stage. Completing a stage marks its outstanding gating
 * docs done; entering the next stage promotes that stage's paperwork from
 * "pending" to actionable (gating → action needed, downloads → available).
 * No-ops on a stale `from` so a double-click can't skip a stage.
 */
export function advanceDeal(store: ProcurementStore, from: DealStage) {
  if (store.deal.currentStage !== from) return;
  const to = nextStage(from);
  if (!to) return;

  store.ledger
    .find((g) => g.stage === from)
    ?.docs.forEach((d) => {
      if (d.status === "action") d.status = "complete";
    });

  store.deal.currentStage = to;

  store.ledger
    .find((g) => g.stage === to)
    ?.docs.forEach((d) => {
      if (d.status !== "pending") return;
      if (GATING.includes(d.action)) d.status = "action";
      else if (d.action === "download") d.status = "available";
    });
}

/** Complete the current stage's doc matching an action, then advance past it. */
function completeAndAdvance(store: ProcurementStore, action: DocAction) {
  const stage = store.deal.currentStage;
  store.ledger
    .find((g) => g.stage === stage)
    ?.docs.forEach((d) => {
      if (d.action === action) d.status = "complete";
    });
  advanceDeal(store, stage);
}

/** Sign the agreement: complete the doc and advance out of its stage. */
export function signDoc(store: ProcurementStore, docId: string) {
  setDocStatus(store, docId, "complete");
  const stage = stageOfDoc(store, docId);
  if (stage && stage === store.deal.currentStage) advanceDeal(store, stage);
}

/** Confirm online payment, then advance to implementation. */
export function payDeal(store: ProcurementStore) {
  completeAndAdvance(store, "pay");
}

/** Upload a purchase order (an alternate payment path), then advance. */
export function uploadPurchaseOrder(store: ProcurementStore) {
  completeAndAdvance(store, "upload");
}

/** Queue an on-demand document, it moves to "pending" until generated. */
export function requestDoc(store: ProcurementStore, docId: string) {
  setDocStatus(store, docId, "pending");
}
