import { beforeEach, describe, expect, it } from "vitest";
import { seedEnterpriseDeal } from "@portal/mocks/procurement";
import {
  advanceDeal,
  payDeal,
  requestDoc,
  signDoc,
  uploadPurchaseOrder,
  type ProcurementStore,
} from "@portal/mocks/procurementMachine";

let store: ProcurementStore;
beforeEach(() => {
  store = seedEnterpriseDeal();
});

function status(s: ProcurementStore, id: string): string | undefined {
  return [
    ...s.ledger.flatMap((g) => g.docs),
    ...s.supporting.flatMap((g) => g.docs),
  ].find((d) => d.id === id)?.status;
}

describe("seed", () => {
  it("starts mid-journey at the agreement, awaiting signature", () => {
    expect(store.deal.currentStage).toBe("security");
    expect(status(store, "doc-agreement-enterprise")).toBe("action");
  });

  it("is an independent copy each call (writes never touch the fixture)", () => {
    advanceDeal(store, "security");
    const fresh = seedEnterpriseDeal();
    expect(fresh.deal.currentStage).toBe("security");
  });
});

describe("advanceDeal", () => {
  it("completes the stage's gating doc and unlocks the next stage", () => {
    advanceDeal(store, "security");
    expect(store.deal.currentStage).toBe("procurement");
    expect(status(store, "doc-agreement-enterprise")).toBe("complete");
    // Payment paperwork becomes actionable / downloadable on entry.
    expect(status(store, "doc-pay-online")).toBe("action");
    expect(status(store, "doc-pay-wire")).toBe("available");
  });

  it("ignores a stale stage so a double-click can't skip ahead", () => {
    advanceDeal(store, "security"); // → procurement
    advanceDeal(store, "security"); // stale, no-op
    expect(store.deal.currentStage).toBe("procurement");
  });

  it("is a no-op at the terminal stage", () => {
    advanceDeal(store, "security"); // → procurement
    advanceDeal(store, "procurement"); // → active
    expect(store.deal.currentStage).toBe("active");
    advanceDeal(store, "active"); // terminal
    expect(store.deal.currentStage).toBe("active");
  });
});

describe("document actions", () => {
  it("signing completes the agreement and advances the deal", () => {
    signDoc(store, "doc-agreement-enterprise");
    expect(status(store, "doc-agreement-enterprise")).toBe("complete");
    expect(store.deal.currentStage).toBe("procurement");
  });

  it("paying clears payment and advances to implementation", () => {
    advanceDeal(store, "security"); // → procurement
    payDeal(store);
    expect(store.deal.currentStage).toBe("active");
    expect(status(store, "doc-pay-online")).toBe("complete");
  });

  it("uploading a PO is an alternate payment path that also advances", () => {
    advanceDeal(store, "security"); // → procurement
    uploadPurchaseOrder(store);
    expect(store.deal.currentStage).toBe("active");
  });

  it("requesting an on-demand document moves it to pending", () => {
    requestDoc(store, "sup-custom-review");
    expect(status(store, "sup-custom-review")).toBe("pending");
  });
});
