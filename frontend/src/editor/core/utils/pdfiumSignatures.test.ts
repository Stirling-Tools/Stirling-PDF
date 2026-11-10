// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readPdfiumAccess } from "@editor/utils/pdfiumAccess";
import { readPdfiumSignatures } from "@editor/utils/pdfiumSignatures";

const FIXTURES = path.join(import.meta.dirname, "../tests/test-fixtures");
let pdfium: WrappedPdfiumModule;

beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
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

afterAll(() => {
  vi.unstubAllGlobals();
});

async function probe(name: string, verify = true) {
  const bytes = fs.readFileSync(path.join(FIXTURES, name));
  const pointer = pdfium.pdfium.wasmExports.malloc(bytes.length);
  (pdfium.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8.set(
    bytes,
    pointer,
  );
  const document = pdfium.FPDF_LoadMemDocument(pointer, bytes.length, "");
  try {
    const signatures = await readPdfiumSignatures(
      pdfium,
      document,
      { pointer, length: bytes.length },
      verify,
    );
    const heap = (pdfium.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
    expect(
      Buffer.from(heap.subarray(pointer, pointer + bytes.length)).equals(bytes),
    ).toBe(true);
    return {
      signed: readPdfiumAccess(pdfium, document, "").signed,
      signatures,
    };
  } finally {
    pdfium.FPDF_CloseDocument(document);
    pdfium.pdfium.wasmExports.free(pointer);
  }
}

describe("local signature probe", () => {
  it("reads the signer and confirms an untouched signature", async () => {
    const { signed, signatures } = await probe("signature-one.pdf");
    expect(signed).toBe(true);
    expect(signatures).toEqual([
      expect.objectContaining({
        signerName: "Test Signer",
        reason: "Approved",
        subFilter: "adbe.pkcs7.detached",
        certificationLevel: 0,
        coversWholeFile: true,
        digestMatches: true,
      }),
    ]);
    expect(signatures[0].signedAt).toMatch(/^D:\d{14}/);
  });

  it("keeps an earlier signature intact when a later one countersigns", async () => {
    const { signatures } = await probe("signature-two.pdf");
    expect(
      signatures.map((s) => [s.reason, s.coversWholeFile, s.digestMatches]),
    ).toEqual([
      ["Approved", false, true],
      ["Countersigned", true, true],
    ]);
  });

  it("shows content added after signing without breaking the signature", async () => {
    const [signature] = (await probe("signature-changed-after.pdf")).signatures;
    expect(signature).toMatchObject({
      coversWholeFile: false,
      digestMatches: true,
    });
  });

  it("reports a signature whose bytes no longer match the file", async () => {
    const [signature] = (await probe("signature-rewritten.pdf")).signatures;
    expect(signature).toMatchObject({
      signerName: "Test Signer",
      digestMatches: false,
    });
  });

  it("checks a document timestamp against its message imprint", async () => {
    const [signature] = (await probe("signature-timestamp.pdf")).signatures;
    expect(signature).toMatchObject({
      subFilter: "ETSI.RFC3161",
      coversWholeFile: true,
      digestMatches: true,
    });
    expect(signature.signerName).toMatch(/Timestamp/);
  });

  it("reads signers and later changes without hashing until asked", async () => {
    const { signatures } = await probe("signature-two.pdf", false);
    expect(
      signatures.map((s) => [s.signerName, s.coversWholeFile, s.digestMatches]),
    ).toEqual([
      ["Test Signer", false, null],
      ["Test Signer", true, null],
    ]);
  });

  it("treats an empty signature field as unsigned", async () => {
    expect(await probe("signature-empty-field.pdf")).toEqual({
      signed: false,
      signatures: [],
    });
  });
});
