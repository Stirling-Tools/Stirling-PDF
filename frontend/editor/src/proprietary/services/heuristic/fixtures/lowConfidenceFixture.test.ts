/**
 * Pins the verdict of `low-confidence-classification.pdf`, the manual-repro fixture for the
 * classification escalation. The document is only useful as a repro while the heuristic still
 * returns something OTHER than "high" for it - a rules change that made it confident would
 * silently turn the manual test into a no-op.
 *
 * The text below is verbatim pdf.js output for that file; regenerate the PDF with
 * `scripts/make-low-confidence-test-pdf.py` if either is edited.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  classifyHeuristic,
  ensureRulesLoaded,
} from "@app/services/heuristic/heuristicEngine";
import type { HeuristicDoc } from "@app/services/heuristic/types";

const EXTRACTED =
  "Summary Document  The parties hereto acknowledge the position set out below. " +
  "Term and termination provisions apply. Hereinafter referred to as the Supplier. " +
  "Amount due: 1,250.00 Payment terms apply. Total payable: 1,250.00 " +
  "Balance due: 1,250.00 This document has been prepared for internal review. " +
  "Please retain a copy for your records. Reference: SD-2024-0417. " +
  "Prepared by the operations team on 17 April 2024.";

beforeAll(async () => {
  await ensureRulesLoaded();
});

describe("low-confidence-classification.pdf fixture", () => {
  const doc: HeuristicDoc = {
    fileName: "low-confidence-classification.pdf",
    pageCount: 1,
    meta: { Title: "Summary Document" },
    titleZone: "Summary Document",
    firstZone: EXTRACTED,
    allZone: EXTRACTED,
  };

  it("is English, so it is not rejected before scoring", () => {
    expect(classifyHeuristic(doc).isEnglish).toBe(true);
  });

  it("emits labels but is not trusted, so it must escalate", () => {
    const r = classifyHeuristic(doc);
    expect(r.labels.length).toBeGreaterThan(0);
    expect(r.confidence).not.toBe("high");
  });

  it("stays unsure because two document types score within the medium margin", () => {
    // The margin is what holds this document at "low": "medium" needs >= 8 and "high" >= 15,
    // so a near-tie can't be promoted however high the raw scores go.
    const r = classifyHeuristic(doc, { explain: true });
    const [first, second] = r.explain?.candidates ?? [];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first.score - second.score).toBeLessThan(8);
    // ...and comfortably clear of the floor, so it doesn't collapse to "no label" either.
    expect(first.score).toBeGreaterThanOrEqual(28);
  });
});
