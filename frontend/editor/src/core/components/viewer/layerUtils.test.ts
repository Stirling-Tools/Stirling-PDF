import { describe, it, expect } from "vitest";
import {
  readPdfLayers,
  applyOCGVisibilityToPdf,
  collectLeafIds,
} from "@app/components/viewer/layerUtils";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";

function toBlob(bytes: Uint8Array): Blob {
  return {
    size: bytes.byteLength,
    type: "application/pdf",
    slice: (start: number, end?: number) => toBlob(bytes.slice(start, end)),
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Blob;
}

describe("layerUtils", () => {
  describe("readPdfLayers on PDF without layers", () => {
    it("returns empty array quickly without error", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      const bytes = await doc.save();
      const blob = toBlob(bytes);

      const layers = await readPdfLayers(blob);
      expect(layers).toEqual([]);
    });
  });

  describe("readPdfLayers on PDF with OCG layers", () => {
    async function createPdfWithLayers(): Promise<Uint8Array> {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);

      const ocg1 = doc.context.obj({
        Type: "OCG",
        Name: PDFString.of("Background Layer"),
      });
      const ocg1Ref = doc.context.register(ocg1);

      const ocg2 = doc.context.obj({
        Type: "OCG",
        Name: PDFString.of("Watermark Layer"),
      });
      const ocg2Ref = doc.context.register(ocg2);

      const dDict = doc.context.obj({
        BaseState: PDFName.of("ON"),
        OFF: [ocg2Ref],
        Order: [ocg1Ref, ocg2Ref],
      });
      const dDictRef = doc.context.register(dDict);

      const ocProperties = doc.context.obj({
        OCGs: [ocg1Ref, ocg2Ref],
        D: dDictRef,
      });
      const ocPropertiesRef = doc.context.register(ocProperties);

      doc.catalog.set(PDFName.of("OCProperties"), ocPropertiesRef);
      return doc.save();
    }

    it("correctly reads layer names and initial visibility", async () => {
      const bytes = await createPdfWithLayers();
      const blob = toBlob(bytes);

      const layers = await readPdfLayers(blob);
      expect(layers).toHaveLength(2);
      expect(layers[0].name).toBe("Background Layer");
      expect(layers[0].visible).toBe(true);
      expect(layers[1].name).toBe("Watermark Layer");
      expect(layers[1].visible).toBe(false);
    });

    it("applies visibility changes and reads back updated state", async () => {
      const bytes = await createPdfWithLayers();

      const modifiedBytes = await applyOCGVisibilityToPdf(bytes.buffer, {
        "Background Layer": false,
        "Watermark Layer": true,
      });

      const blob = toBlob(modifiedBytes);
      const updatedLayers = await readPdfLayers(blob);

      expect(updatedLayers).toHaveLength(2);
      const bg = updatedLayers.find((l) => l.name === "Background Layer");
      const wm = updatedLayers.find((l) => l.name === "Watermark Layer");
      expect(bg?.visible).toBe(false);
      expect(wm?.visible).toBe(true);
    });
  });

  describe("collectLeafIds", () => {
    it("collects all leaf layer IDs recursively", () => {
      const layers = [
        { id: "1", name: "A", visible: true },
        {
          id: "group-1",
          name: "Group",
          visible: true,
          children: [
            { id: "2", name: "B", visible: true },
            { id: "3", name: "C", visible: false },
          ],
        },
      ];
      expect(collectLeafIds(layers)).toEqual(["1", "2", "3"]);
    });
  });
});
