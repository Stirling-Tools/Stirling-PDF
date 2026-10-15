import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  classifyInBrowser,
  classifyRustOperationConfig,
} from "@app/hooks/tools/classifyRust/useClassifyRustOperation";
import { defaultParameters } from "@app/hooks/tools/classifyRust/useClassifyRustParameters";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
} from "@app/services/pdfiumService";
import {
  onResults,
  type ClassifyRustResult,
} from "@app/services/classifyRustResults";
import { onTiming, type ToolTiming } from "@app/services/toolTiming";
import {
  proprietaryToolsWasmBuilt,
  stubWasmFetch,
} from "@app/tests/helpers/toolsCoreWasm";

const FIXTURES = path.join(
  import.meta.dirname,
  "../../../../core/tests/test-fixtures/classification",
);

// jsdom has no Blob.arrayBuffer and setupTests stubs it with placeholder bytes,
// so files are read with FileReader and inputs carry their real bytes.
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function fixture(name: string): Promise<File> {
  const bytes = new Uint8Array(await readFile(path.join(FIXTURES, name)));
  const file = new File([bytes], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.slice().buffer,
  });
  return file;
}

/** The document's StirlingPDFClassification metadata, parsed. */
async function storedVerdict(file: File): Promise<unknown> {
  const m = await getPdfiumModule();
  const exports = m.pdfium.wasmExports as unknown as {
    memory: WebAssembly.Memory;
    malloc(size: number): number;
    free(pointer: number): void;
  };
  const doc = await openRawDocumentSafe(await readBytes(file));
  try {
    const length = m.FPDF_GetMetaText(doc, "StirlingPDFClassification", 0, 0);
    const buffer = exports.malloc(length);
    try {
      m.FPDF_GetMetaText(doc, "StirlingPDFClassification", buffer, length);
      const utf16 = new Uint8Array(exports.memory.buffer, buffer, length - 2);
      return JSON.parse(new TextDecoder("utf-16le").decode(utf16.slice()));
    } finally {
      exports.free(buffer);
    }
  } finally {
    closeDocAndFreeBuffer(m, doc);
  }
}

// Runs the real Rust wasm against the real PDFium build.
describe.skipIf(!proprietaryToolsWasmBuilt)(
  "classifyRust in the browser",
  () => {
    beforeAll(stubWasmFetch);

    afterAll(() => {
      vi.unstubAllGlobals();
    });

    test.each([
      ["classified_invoice.pdf", "invoice"],
      ["classified_nda.pdf", "nda"],
      ["classified_resume.pdf", "resume"],
    ])("labels %s as %s", async (name, label) => {
      const { verdict } = await classifyInBrowser(await fixture(name));

      expect(verdict?.labels[0]).toBe(label);
      expect(verdict?.confidence).toBe("high");
    });

    test("stores the verdict where the rest of the app reads labels", async () => {
      const { file } = await classifyInBrowser(
        await fixture("classified_invoice.pdf"),
      );

      expect(await storedVerdict(file)).toEqual({
        labels: ["invoice"],
        confidence: "high",
        classifier: "rules",
      });
      expect(file.name).toBe("classified_invoice.pdf");
    });

    test("reports each file's verdict and the run's time", async () => {
      const timings: ToolTiming[] = [];
      const results: ClassifyRustResult[][] = [];
      const stopTiming = onTiming("classify", "rust", (t) => timings.push(t));
      const stopResults = onResults((r) => results.push(r));
      try {
        await classifyRustOperationConfig.customProcessor(defaultParameters, [
          await fixture("classified_nda.pdf"),
        ]);
      } finally {
        stopTiming();
        stopResults();
      }

      expect(timings).toEqual([
        expect.objectContaining({
          location: "browser",
          files: 1,
          serverProcessingMs: null,
        }),
      ]);
      expect(results[0]).toHaveLength(1);
      expect(results[0][0]).toMatchObject({
        fileName: "classified_nda.pdf",
        rust: { labels: ["nda"] },
      });
    });
  },
);
