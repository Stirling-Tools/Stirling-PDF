import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { readCmsSignatureFacts } from "@editor/utils/pdfSignatureCms";

export interface PdfSignatureInfo {
  signerName: string | null;
  signedAt: string | null;
  reason: string | null;
  subFilter: string | null;
  certificationLevel: number;
  coversWholeFile: boolean;
  digestMatches: boolean | null;
}

export const LOCAL_DIGEST_MAX_BYTES = 64 * 1024 * 1024;

const DIGEST_BY_LENGTH: Record<number, AlgorithmIdentifier> = {
  20: "SHA-1",
  32: "SHA-256",
  48: "SHA-384",
  64: "SHA-512",
};

function heap(module: WrappedPdfiumModule): Uint8Array<ArrayBuffer> {
  return (
    module.pdfium as typeof module.pdfium & {
      HEAPU8: Uint8Array<ArrayBuffer>;
    }
  ).HEAPU8;
}

function readBuffer(
  module: WrappedPdfiumModule,
  read: (signature: number, buffer: number, length: number) => number,
  signature: number,
): Uint8Array {
  const length = read(signature, 0, 0);
  if (length <= 0) return new Uint8Array();
  const pointer = module.pdfium.wasmExports.malloc(length);
  if (!pointer) return new Uint8Array();
  try {
    read(signature, pointer, length);
    return heap(module).slice(pointer, pointer + length);
  } finally {
    module.pdfium.wasmExports.free(pointer);
  }
}

function text(
  bytes: Uint8Array,
  encoding: "utf-16le" | "latin1",
): string | null {
  const value = new TextDecoder(encoding).decode(bytes).replace(/\0+$/, "");
  return value === "" ? null : value;
}

export function countPdfiumSignatures(
  module: WrappedPdfiumModule,
  document: number,
): number {
  const total = module.FPDF_GetSignatureCount(document);
  if (total < 0) return total;
  let signed = 0;
  for (let i = 0; i < total; i++)
    if (
      module.FPDFSignatureObj_GetContents(
        module.FPDF_GetSignatureObject(document, i),
        0,
        0,
      ) > 0
    )
      signed++;
  return signed;
}

function byteRange(module: WrappedPdfiumModule, signature: number): number[] {
  const count = module.FPDFSignatureObj_GetByteRange(signature, 0, 0);
  if (count !== 4) return [];
  const pointer = module.pdfium.wasmExports.malloc(count * 4);
  if (!pointer) return [];
  try {
    module.FPDFSignatureObj_GetByteRange(signature, pointer, count);
    return Array.from(new Int32Array(heap(module).buffer, pointer, count));
  } finally {
    module.pdfium.wasmExports.free(pointer);
  }
}

async function digestMatches(
  module: WrappedPdfiumModule,
  file: { pointer: number; length: number },
  range: number[],
  expected: Uint8Array | null,
): Promise<boolean | null> {
  const algorithm = expected && DIGEST_BY_LENGTH[expected.length];
  if (!algorithm || range.length !== 4) return null;
  const [start, firstLength, secondStart, secondLength] = range;
  if (
    range.some((n) => n < 0) ||
    start + firstLength > secondStart ||
    secondStart + secondLength > file.length
  )
    return false;
  const bytes = heap(module);
  const first = file.pointer + start;
  const gapStart = first + firstLength;
  const second = file.pointer + secondStart;
  const gap = bytes.slice(gapStart, second);
  bytes.copyWithin(gapStart, second, second + secondLength);
  try {
    const actual = new Uint8Array(
      await crypto.subtle.digest(
        algorithm,
        bytes.subarray(first, gapStart + secondLength),
      ),
    );
    return actual.every((value, i) => value === expected[i]);
  } finally {
    bytes.copyWithin(second, gapStart, gapStart + secondLength);
    bytes.set(gap, gapStart);
  }
}

export async function readPdfiumSignatures(
  module: WrappedPdfiumModule,
  document: number,
  file: { pointer: number; length: number },
): Promise<PdfSignatureInfo[]> {
  const read: {
    info: PdfSignatureInfo;
    range: number[];
    digest: Uint8Array | null;
  }[] = [];
  const total = module.FPDF_GetSignatureCount(document);
  for (let i = 0; i < total; i++) {
    const signature = module.FPDF_GetSignatureObject(document, i);
    const contents = readBuffer(
      module,
      module.FPDFSignatureObj_GetContents,
      signature,
    );
    if (contents.length === 0) continue;
    const range = byteRange(module, signature);
    const facts = readCmsSignatureFacts(contents);
    read.push({
      range,
      digest: facts.digest,
      info: {
        signerName: facts.signerName,
        signedAt: text(
          readBuffer(module, module.FPDFSignatureObj_GetTime, signature),
          "latin1",
        ),
        reason: text(
          readBuffer(module, module.FPDFSignatureObj_GetReason, signature),
          "utf-16le",
        ),
        subFilter: text(
          readBuffer(module, module.FPDFSignatureObj_GetSubFilter, signature),
          "latin1",
        ),
        certificationLevel:
          module.FPDFSignatureObj_GetDocMDPPermission(signature),
        coversWholeFile:
          range.length === 4 && range[2] + range[3] === file.length,
        digestMatches: null,
      },
    });
  }
  if (file.length <= LOCAL_DIGEST_MAX_BYTES)
    for (const entry of read)
      entry.info.digestMatches = await digestMatches(
        module,
        file,
        entry.range,
        entry.digest,
      );
  return read.map((entry) => entry.info);
}
