import { describe, expect, it, vi } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
} from "@cantoo/pdf-lib";

import { extractPageMeasureScales } from "@app/utils/pdfMeasurementExtraction";
import { allowConsole } from "@app/tests/failOnConsole";

const toFile = async (bytes: Uint8Array, name: string): Promise<File> => {
  const file = new File([bytes as BlobPart], name, {
    type: "application/pdf",
  });
  // setupTests stubs Blob.arrayBuffer with fixed bytes, which no parser can read.
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: async () => bytes.buffer.slice(0) as ArrayBuffer,
  });
  return file;
};

const measureDict = (
  doc: PDFDocument,
  factor: number,
  unit: string,
): PDFDict => {
  const fmt = PDFDict.fromMapWithContext(
    new Map([
      [PDFName.of("C"), PDFNumber.of(factor)],
      [PDFName.of("U"), PDFString.of(unit)],
    ]),
    doc.context,
  );
  const formats = PDFArray.withContext(doc.context);
  formats.push(fmt);
  return PDFDict.fromMapWithContext(
    new Map([[PDFName.of("D"), formats]]),
    doc.context,
  );
};

describe("extractPageMeasureScales", () => {
  it("returns null for a PDF without measures", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const file = await toFile(await doc.save(), "plain-a.pdf");

    expect(await extractPageMeasureScales(file)).toBeNull();
  });

  it("reads a page-level Measure scale", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    page.node.set(PDFName.of("Measure"), measureDict(doc, 100, "m"));
    const file = await toFile(await doc.save(), "measured-b.pdf");

    const scales = await extractPageMeasureScales(file);

    expect(scales?.get(0)?.viewports).toHaveLength(1);
    expect(scales?.get(0)?.viewports[0].scale).toMatchObject({
      factor: 100,
      unit: "m",
    });
  });

  it("reads a viewport entry scale with its bbox", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([600, 800]);
    const bbox = PDFArray.withContext(doc.context);
    for (const n of [0, 0, 600, 800]) bbox.push(PDFNumber.of(n));
    const entry = PDFDict.fromMapWithContext(
      new Map([
        [PDFName.of("Measure"), measureDict(doc, 25.4, "mm")],
        [PDFName.of("BBox"), bbox],
      ]),
      doc.context,
    );
    const viewports = PDFArray.withContext(doc.context);
    viewports.push(entry);
    page.node.set(PDFName.of("VP"), viewports);
    const file = await toFile(await doc.save(), "viewport-c.pdf");

    const scales = await extractPageMeasureScales(file);

    expect(scales?.get(0)?.viewports[0].bbox).toEqual([0, 0, 600, 800]);
    expect(scales?.get(0)?.viewports[0].scale.unit).toBe("mm");
  });

  it("returns null for undecodable bytes", async () => {
    // Failure warn is incidental to the null-return contract.
    allowConsole.warn(/Failed to extract PDF scales/);
    const file = await toFile(
      new TextEncoder().encode("not a pdf"),
      "garbage-d.pdf",
    );

    expect(await extractPageMeasureScales(file)).toBeNull();
  });

  it("shares a single document-bytes read across repeated calls", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const file = await toFile(await doc.save(), "plain-e.pdf");
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");

    await extractPageMeasureScales(file);
    await extractPageMeasureScales(file);

    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });
});
