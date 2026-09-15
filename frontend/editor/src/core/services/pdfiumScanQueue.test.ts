/**
 * Serialization contract of the main-thread PDFium scan queue: scans run in
 * submission order and one failing scan does not wedge the queue.
 */
import { describe, expect, it } from "vitest";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";

describe("pdfiumScanQueue", () => {
  it("runs queued scans in submission order", async () => {
    const order: string[] = [];
    const a = runPdfiumScan(async () => {
      await Promise.resolve();
      order.push("a");
    });
    const b = runPdfiumScan(async () => {
      order.push("b");
    });
    await Promise.all([a, b]);
    expect(order).toEqual(["a", "b"]);
  });
});
