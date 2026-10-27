import { beforeAll, describe, it, expect } from "vitest";
import { webcrypto } from "node:crypto";

// jsdom ships a crypto without WebCrypto's subtle API; the encrypted fixtures
// need it.
beforeAll(() => {
  if (!globalThis.crypto?.subtle?.importKey) {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
  }
});
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyOCGVisibilityToPdf,
  collectLeafIds,
} from "@editor/components/viewer/layerUtils";
import { extractLayers } from "@editor/components/viewer/layerParser";
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

      const layers = await extractLayers(await blob.arrayBuffer());
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

      const layers = await extractLayers(await blob.arrayBuffer());
      expect(layers).toHaveLength(2);
      expect(layers[0].name).toBe("Background Layer");
      expect(layers[0].visible).toBe(true);
      expect(layers[1].name).toBe("Watermark Layer");
      expect(layers[1].visible).toBe(false);
    });

    it("applies visibility changes and reads back updated state", async () => {
      const bytes = await createPdfWithLayers();

      const modifiedBytes = await applyOCGVisibilityToPdf(
        bytes.buffer as ArrayBuffer,
        {
          "Background Layer": false,
          "Watermark Layer": true,
        },
      );

      const blob = toBlob(modifiedBytes);
      const updatedLayers = await extractLayers(await blob.arrayBuffer());

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

  describe("readPdfLayers on object-stream-compressed files", () => {
    // Produced by `qpdf --object-streams=generate` from a two-layer file: the
    // catalog (with /OCProperties) lives inside a compressed object stream, so
    // a raw byte scan for /OCProperties finds nothing. Regression net for a
    // parser that reported zero layers on such files.
    const fixtureDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "tests",
      "test-fixtures",
    );

    function fixtureBlobSlice(
      bytes: Uint8Array,
      start: number,
      end?: number,
    ): Blob {
      const copy = bytes.slice(start, end);
      return {
        size: copy.byteLength,
        type: "application/pdf",
        slice: (s: number, e?: number) => fixtureBlobSlice(copy, s, e),
        arrayBuffer: async () => copy.buffer,
      } as unknown as Blob;
    }

    function fixtureBlob(name: string): Blob {
      return fixtureBlobSlice(
        Uint8Array.from(readFileSync(join(fixtureDir, name))),
        0,
      );
    }

    it("reports layers whose catalog is inside an object stream", async () => {
      const raw = readFileSync(
        join(fixtureDir, "layers-object-streams.pdf"),
        "latin1",
      );
      expect(raw).not.toContain("/OCProperties");
      const layers = await extractLayers(
        await fixtureBlob("layers-object-streams.pdf").arrayBuffer(),
      );
      expect(layers.map((l) => l.name).sort()).toEqual([
        "Background Layer",
        "Watermark Layer",
      ]);
    });

    // qpdf --encrypt "" <owner> 256: opens with an empty user password, which
    // is what the sidebar has; the OCG names are encrypted on disk, so they
    // only decode when the load supplies that password.
    it("decrypts layer names in an owner-password-only file", async () => {
      const layers = await extractLayers(
        await fixtureBlob("layers-encrypted-owner-password.pdf").arrayBuffer(),
      );
      expect(layers.map((l) => l.name).sort()).toEqual([
        "Background Layer",
        "Watermark Layer",
      ]);
    });

    it("resolves indirect /ON, /OFF and /Order entries", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);
      const hiddenRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("Indirect Off") }),
      );
      const visibleRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("Indirect On") }),
      );
      const offRef = doc.context.register(doc.context.obj([hiddenRef]));
      const orderRef = doc.context.register(
        doc.context.obj([hiddenRef, visibleRef]),
      );
      const dDict = doc.context.register(
        doc.context.obj({
          BaseState: PDFName.of("ON"),
          OFF: offRef,
          Order: orderRef,
        }),
      );
      const ocProperties = doc.context.obj({
        OCGs: [hiddenRef, visibleRef],
        D: dDict,
      });
      doc.catalog.set(
        PDFName.of("OCProperties"),
        doc.context.register(ocProperties),
      );

      const layers = await extractLayers(
        await toBlob(await doc.save()).arrayBuffer(),
      );

      expect(layers.map((l) => l.name)).toEqual([
        "Indirect Off",
        "Indirect On",
      ]);
      expect(layers[0].visible).toBe(false);
      expect(layers[1].visible).toBe(true);
    });

    it("reads the spec form of a labeled /Order group", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);
      const leafRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("Terrain") }),
      );
      const ocProperties = doc.context.obj({
        OCGs: [leafRef],
        D: doc.context.register(
          doc.context.obj({
            BaseState: PDFName.of("ON"),
            Order: [doc.context.obj([PDFString.of("Maps"), leafRef])],
          }),
        ),
      });
      doc.catalog.set(
        PDFName.of("OCProperties"),
        doc.context.register(ocProperties),
      );

      const layers = await extractLayers(
        await toBlob(await doc.save()).arrayBuffer(),
      );

      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe("Maps");
      expect(layers[0].children?.map((child) => child.name)).toEqual([
        "Terrain",
      ]);
    });

    // qpdf --encrypt "" <owner> 40|128|128 --use-aes=y: the RC4 and AES-128
    // security handlers, alongside the AES-256 fixture above.
    it("decodes names behind every security handler revision", async () => {
      for (const name of [
        "layers-encrypted-rc4-40.pdf",
        "layers-encrypted-rc4-128.pdf",
        "layers-encrypted-aes-128.pdf",
      ]) {
        const layers = await extractLayers(
          await fixtureBlob(name).arrayBuffer(),
        );
        expect(layers.map((layer) => layer.name).sort(), name).toEqual([
          "Background Layer",
          "Watermark Layer",
        ]);
      }
    });

    it("splices visibility into an encrypted file other readers still open", async () => {
      const bytes = await fixtureBlob(
        "layers-encrypted-aes-128.pdf",
      ).arrayBuffer();
      const layers = await extractLayers(bytes);
      const hidden = layers[0].name;
      const visibility: Record<string, boolean> = {};
      for (const layer of layers)
        visibility[layer.name] = layer.name !== hidden;

      const modified = await applyOCGVisibilityToPdf(bytes, visibility);

      const reread = await extractLayers(modified);
      expect(reread.find((layer) => layer.name === hidden)?.visible).toBe(
        false,
      );
      for (const layer of reread) {
        if (layer.name !== hidden) expect(layer.visible).toBe(true);
      }

      // Independent parser: the incremental update must stay a valid PDF.
      const reopened = await PDFDocument.load(modified, { password: "" });
      expect(reopened.getPageCount()).toBeGreaterThan(0);
    });

    it("keeps hierarchy for an indirect named group", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);
      const leafRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("Leaf") }),
      );
      const groupRef = doc.context.register(
        doc.context.obj({
          Name: PDFString.of("Group"),
          Order: [leafRef],
        }),
      );
      const ocProperties = doc.context.obj({
        OCGs: [leafRef],
        D: doc.context.register(
          doc.context.obj({
            BaseState: PDFName.of("ON"),
            Order: [groupRef],
          }),
        ),
      });
      doc.catalog.set(
        PDFName.of("OCProperties"),
        doc.context.register(ocProperties),
      );

      const layers = await extractLayers(
        await toBlob(await doc.save()).arrayBuffer(),
      );

      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe("Group");
      expect(layers[0].children?.map((child) => child.name)).toEqual(["Leaf"]);
    });

    it("reads names containing escaped parens", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);
      const ocgRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("A (nick) B") }),
      );
      const ocProperties = doc.context.obj({
        OCGs: [ocgRef],
        D: doc.context.register(
          doc.context.obj({ BaseState: PDFName.of("ON"), Order: [ocgRef] }),
        ),
      });
      doc.catalog.set(
        PDFName.of("OCProperties"),
        doc.context.register(ocProperties),
      );
      const layers = await extractLayers(
        await toBlob(await doc.save()).arrayBuffer(),
      );
      expect(layers.map((l) => l.name)).toEqual(["A (nick) B"]);
    });

    it("nests named /Order groups", async () => {
      const doc = await PDFDocument.create();
      doc.addPage([400, 400]);
      const ocgRef = doc.context.register(
        doc.context.obj({ Type: "OCG", Name: PDFString.of("Terrain") }),
      );
      const ocProperties = doc.context.obj({
        OCGs: [ocgRef],
        D: doc.context.register(
          doc.context.obj({
            BaseState: PDFName.of("ON"),
            Order: [
              doc.context.obj({
                Name: PDFString.of("Maps"),
                Order: [ocgRef],
              }),
            ],
          }),
        ),
      });
      doc.catalog.set(
        PDFName.of("OCProperties"),
        doc.context.register(ocProperties),
      );

      const layers = await extractLayers(
        await toBlob(await doc.save()).arrayBuffer(),
      );
      expect(layers).toHaveLength(1);
      expect(layers[0].name).toBe("Maps");
      expect(layers[0].children?.map((child) => child.name)).toEqual([
        "Terrain",
      ]);
      expect(layers[0].visible).toBe(true);
    });
  });
});
