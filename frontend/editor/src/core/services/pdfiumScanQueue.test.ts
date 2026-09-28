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

  it("runs the next scan after a failure and surfaces the failure to its caller", async () => {
    const order: string[] = [];
    let rejectFirst!: (reason?: unknown) => void;
    const failing = runPdfiumScan(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
          order.push("a");
        }),
    );
    const next = runPdfiumScan(async () => {
      order.push("b");
    });

    // Flush every pending microtask: a queue that starts the next scan before
    // the failing one settles would have pushed "b" by now.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(["a"]);
    rejectFirst(new Error("boom"));

    await expect(failing).rejects.toThrow("boom");
    await next;
    expect(order).toEqual(["a", "b"]);
  });
});
