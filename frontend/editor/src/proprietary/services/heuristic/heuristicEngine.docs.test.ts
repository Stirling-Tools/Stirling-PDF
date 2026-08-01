// Regression cases: each feeds the real engine a typical specimen's actual text.

import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  ensureRulesLoaded,
} from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

beforeAll(async () => {
  await ensureRulesLoaded();
});

function classify(
  title: string,
  body: string,
  fileName = "doc.pdf",
  pageCount = 1,
) {
  const doc: HeuristicDoc = {
    fileName,
    pageCount,
    meta: {},
    titleZone: title,
    firstZone: body,
    allZone: body,
  };
  return classifyHeuristic(doc);
}

describe("scoring explanations", () => {
  const doc: HeuristicDoc = {
    fileName: "invoice_acme.pdf",
    pageCount: 1,
    meta: {},
    titleZone: "TAX INVOICE",
    firstZone: "Invoice Number: INV-9 Invoice Total: 950.00",
    allZone: "Invoice Number: INV-9 Invoice Total: 950.00",
  };

  it("returns candidates with per-rule signals when requested", () => {
    const r = classifyHeuristic(doc, { explain: true });
    expect(r.labels[0]).toBe("invoice");
    const top = r.explain?.candidates[0];
    expect(top?.id).toBe("invoice");
    expect(top?.score).toBeGreaterThan(0);
    expect(top?.signals.some((s) => s.includes('phrase "tax invoice"'))).toBe(
      true,
    );
    expect(top?.signals.some((s) => s.includes("filename"))).toBe(true);
  });

  it("omits the explanation by default", () => {
    expect(classifyHeuristic(doc).explain).toBeUndefined();
  });
});

describe("documents observed lost on upload (engine must label them)", () => {
  it("labels a resume", () => {
    const body = [
      "CURRICULUM VITAE",
      "Jane Doe    jane.doe@example.com    +44 7700 900123    London, United Kingdom",
      "Professional Summary: An experienced software engineer with more than ten years of",
      "professional experience building reliable web applications and leading small teams.",
      "Career Objective: To take on a senior engineering role where I can apply my skills in",
      "distributed systems and mentor other engineers on the team.",
      "Professional Experience:",
      "Senior Engineer, Northwind Ltd (2019 to present). Led the migration of the billing platform",
      "and improved reliability across all of the core services.",
      "Software Engineer, Contoso plc (2014 to 2019). Built and maintained customer-facing features",
      "used by more than a million people every day.",
      "Education: BSc Computer Science, University of Manchester.",
      "References available upon request.",
    ].join("\n");
    const r = classify("CURRICULUM VITAE", body, "resume_jane_doe.pdf");
    expect(r.labels[0]).toBe("resume");
  });

  it("labels a purchase order", () => {
    const body = [
      "PURCHASE ORDER",
      "Purchase Order Number: PO-55231    Requisition Number: REQ-9910    Date: 2 April 2024",
      "To: Global Office Supplies Ltd. Please supply the following goods to our warehouse at the",
      "address shown below and confirm the expected delivery date by return.",
      "Qty Ordered: 20    Item: Ergonomic office chair    Unit Price: $180.00",
      "Qty Ordered: 15    Item: Height-adjustable desk    Unit Price: $420.00",
      "Qty Ordered: 50    Item: LED desk lamp    Unit Price: $35.00",
      "This is an official order. All goods supplied against this purchase order must reference the",
      "requisition number on the delivery note and on your invoice.",
      "Authorised by: Procurement Department, Northwind Ltd.",
    ].join("\n");
    const r = classify("PURCHASE ORDER", body, "purchase_order.pdf");
    expect(r.labels[0]).toBe("purchase-order");
  });

  it("labels a master services agreement", () => {
    const body = [
      "MASTER SERVICES AGREEMENT",
      "This Master Services Agreement is made between the Client and the Service Provider and sets",
      "out the terms on which the Service Provider will provide services to the Client.",
      "1. Engagement. The Client engages the Service Provider to perform the services described in",
      "each Statement of Work agreed between the parties from time to time.",
      "2. Fees. The Client shall pay the fees set out in the applicable Statement of Work within",
      "thirty days of the date of each invoice.",
      "3. Term and Termination. This agreement shall continue until terminated by either party on",
      "sixty days written notice to the other party.",
      "4. Confidentiality. Each party shall keep confidential the confidential information of the",
      "other party that it receives under this agreement.",
      "We are pleased to act for you and look forward to a productive working relationship.",
    ].join("\n");
    const r = classify(
      "MASTER SERVICES AGREEMENT",
      body,
      "service_agreement.pdf",
    );
    expect(r.labels[0]).toBe("service-agreement");
  });
});
