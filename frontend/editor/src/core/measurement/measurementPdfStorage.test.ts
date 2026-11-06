import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { embedMeasurementsInPdf, readMeasurementPayloadFromPdf, readMeasurementsFromPdf } from "../../features/measurement/utils/measurementPdfStorage";

const p = (x: number, y: number) => ({ x, y, pageIndex: 0 });

async function blankPdf(): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("Measurement PDF persistence", () => {
  it("reads PDFs without measurement metadata", async () => {
    expect(await readMeasurementPayloadFromPdf(await blankPdf())).toBeNull();
  });
  it("round-trips measurements, groups and page scales inside PDF", async () => {
    const input = await blankPdf();
    const data = {
      measurements: [{ id: "m1", kind: "length" as const, start: p(1, 2), end: p(4, 6), groupId: "g1" }],
      groups: [{ id: "g1", name: "Rom 1", color: "#299bff" }],
      pageScales: [[0, { pageHeight: 842, viewports: [{ bbox: null, scale: { factor: 0.1, ratio: 100, unit: "m" } }] }]] as Array<[number, { pageHeight: number; viewports: Array<{ bbox: null; scale: { factor: number; ratio: number; unit: string } }> }]>,
    };
    const output = await embedMeasurementsInPdf(input, data);
    expect(await readMeasurementPayloadFromPdf(output)).toEqual({ schema: "stirling.measurements", version: 2, ...data });
    expect(await readMeasurementsFromPdf(output)).toEqual(data.measurements);
    expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
    expect(await readMeasurementPayloadFromPdf(input)).toBeNull();
  });
  it("rejects oversized measurement metadata", async () => {
    const input = await blankPdf();
    await expect(embedMeasurementsInPdf(input, { measurements: [{ id: "x".repeat(9 * 1024 * 1024), start: p(0, 0), end: p(1, 1) }], groups: [], pageScales: [] })).rejects.toThrow(/8 MiB/);
  });
});
