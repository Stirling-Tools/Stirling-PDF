// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import { backgroundChecksAfter } from "@editor/utils/pdfProbeChecks";
import type { PdfAccess } from "@editor/services/pdfAccessService";

const BLOCKING_BUDGET_MS = 250;
let pdfium: WrappedPdfiumModule;

beforeAll(async () => {
  const wasm = fs.readFileSync(
    path.join(process.cwd(), "node_modules/@embedpdf/pdfium/dist/pdfium.wasm"),
  );
  pdfium = await init({
    wasmBinary: wasm.buffer.slice(
      wasm.byteOffset,
      wasm.byteOffset + wasm.byteLength,
    ),
  });
  pdfium.PDFiumExt_Init();
});

function largePdf(streamBytes: number): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  push("%PDF-1.7\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
  ];
  objects.forEach((body, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });
  offsets.push(length);
  push(`4 0 obj\n<< /Length ${streamBytes} >>\nstream\n`);
  push(new Uint8Array(streamBytes).fill(0x20));
  push("\nendstream\nendobj\n");
  const xref = length;
  push(
    `xref\n0 5\n0000000000 65535 f \n${offsets
      .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
      .join(
        "",
      )}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    pdf.set(part, at);
    at += part.length;
  }
  return pdf;
}

describe("local PDF probe checks", () => {
  it("answers the blocking checks without reading the whole of a large file", () => {
    const bytes = largePdf(64 * 1024 * 1024);
    const pointer = pdfium.pdfium.wasmExports.malloc(bytes.length);
    (pdfium.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8.set(
      bytes,
      pointer,
    );
    try {
      const started = performance.now();
      const document = pdfium.FPDF_LoadMemDocument(pointer, bytes.length, "");
      const access = readPdfiumAccess(pdfium, document, "");
      const elapsed = performance.now() - started;
      pdfium.FPDF_CloseDocument(document);
      expect(access).toMatchObject({ encrypted: false, signed: false });
      expect(elapsed).toBeLessThan(BLOCKING_BUDGET_MS);
    } finally {
      pdfium.pdfium.wasmExports.free(pointer);
    }
  });

  it("schedules background work only for the blocking facts that need it", () => {
    const plain = { signed: false } as PdfAccess;
    expect(backgroundChecksAfter(plain)).toEqual([]);
    expect(backgroundChecksAfter({ ...plain, signed: true })).toEqual([
      "signatures",
    ]);
  });
});
