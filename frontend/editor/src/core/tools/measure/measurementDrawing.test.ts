// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  concatTransformationMatrix,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import {
  EncryptedPdfError,
  drawMeasurementsIntoPdf,
} from "@app/tools/measure/measurementDrawing";
import type { Measurement } from "@app/utils/measurementTypes";

async function blankPdf(
  prepare?: (doc: PDFDocument) => void,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  prepare?.(doc);
  const bytes = await doc.save();
  return bytes.slice().buffer;
}

function item(measurement: Measurement, text: string) {
  return {
    measurement,
    text,
    color: "#1e88e5", // theme-allow-color measurement colour data
    strokeWidth: 2,
  };
}

const LINE: Measurement = {
  id: "d1",
  kind: "distance",
  points: [
    { pageIndex: 0, x: 100, y: 100 },
    { pageIndex: 0, x: 300, y: 100 },
  ],
};

const AREA: Measurement = {
  id: "a1",
  kind: "area",
  points: [
    { pageIndex: 0, x: 100, y: 200 },
    { pageIndex: 0, x: 200, y: 200 },
    { pageIndex: 0, x: 200, y: 300 },
  ],
};

function decode(stream: unknown): string {
  return stream instanceof PDFRawStream
    ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
    : "";
}

/** The page's content streams, decoded and joined in drawing order. */
function pageContent(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref) => decode(doc.context.lookup(ref))).join("\n");
}

function measurementDrawings(doc: PDFDocument): string[] {
  const xObjects = doc
    .getPage(0)
    .node.Resources()
    ?.lookup(PDFName.of("XObject"), PDFDict);
  return (xObjects?.keys() ?? [])
    .filter((key) => key.asString().startsWith("/Measurement"))
    .map((key) => decode(xObjects?.lookup(key)));
}

describe("drawMeasurementsIntoPdf", () => {
  test("draws into the page rather than adding annotations", async () => {
    const bytes = await drawMeasurementsIntoPdf(await blankPdf(), [
      item(LINE, "7.056 m"),
      item(AREA, "Kitchen: 6.22 m²"),
    ]);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    const drawings = measurementDrawings(doc);
    expect(drawings).toHaveLength(2);
    // Page space is y-down from the top; PDF user space is y-up.
    expect(drawings.join("\n")).toMatch(/100 700 m\s+300 700 l/);
    expect(pageContent(doc).match(/\/Measurement\S* Do/g)).toHaveLength(2);
  });

  test("isolates a transform the existing content leaves applied", async () => {
    const source = await blankPdf((doc) =>
      doc
        .getPage(0)
        .pushOperators(concatTransformationMatrix(0.5, 0, 0, 0.5, 0, 0)),
    );
    const bytes = await drawMeasurementsIntoPdf(source, [item(LINE, "7 m")]);
    const content = pageContent(await PDFDocument.load(bytes));

    expect(content.trimStart().startsWith("q")).toBe(true);
    expect(content).toMatch(
      /0\.5 0 0 0\.5 0 0 cm[\s\S]*Q[\s\S]*\/Measurement\S* Do/,
    );
  });

  test("keeps labels as text, whatever characters they contain", async () => {
    const label =
      "Room (A) \\ x) /A << /S /JavaScript /JS (app.alert(1)) >> /Z (y";
    const bytes = await drawMeasurementsIntoPdf(await blankPdf(), [
      item(LINE, `${label}: 7.056 m`),
    ]);
    const doc = await PDFDocument.load(bytes);

    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    expect(measurementDrawings(doc)[0]).not.toContain("JavaScript");
  });

  test("refuses an encrypted PDF rather than writing unencrypted content into it", async () => {
    const encrypted = await blankPdf((doc) =>
      doc.encrypt({ userPassword: "", ownerPassword: "owner" }),
    );
    await expect(
      drawMeasurementsIntoPdf(encrypted, [item(LINE, "7.056 m")]),
    ).rejects.toBeInstanceOf(EncryptedPdfError);
  });
});
