import { hasAcroForm } from "@app/utils/asciiBytes";
import {
  documentFileKey,
  getDocumentBytes,
} from "@app/services/documentBytesCache";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";
import { readRawFormType } from "@app/services/pdfiumService";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";

/**
 * True when the document may contain interactive form fields.
 *
 * The literal byte scan is a hint, not proof: /AcroForm can live inside a
 * compressed object stream, which the raw bytes never spell out. pdf-lib parses
 * the xref and catalog (object streams included) without copying the file into
 * wasm, and measured flat memory at 6 ms on a 155 MB file, so it confirms every
 * size. pdf-lib rejects some shapes PDFium opens, so those fall back to PDFium's
 * catalog probe when the file is small enough to open on the main thread. A file
 * neither can parse has no form UI to show either way.
 */
export async function documentHasFormFields(
  bytes: ArrayBuffer,
  byteLength: number = bytes.byteLength,
): Promise<boolean> {
  if (hasAcroForm(new Uint8Array(bytes))) return true;
  try {
    const { PDFDocument, PDFName } = await import("@cantoo/pdf-lib");
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    return doc.catalog.get(PDFName.of("AcroForm")) !== undefined;
  } catch {
    if (byteLength >= LARGE_PDF_PARSE_LIMIT) return false;
    try {
      const formType = await runPdfiumScan(() => readRawFormType(bytes));
      return formType === null ? true : formType !== 0;
    } catch {
      return false;
    }
  }
}

const answers = new WeakMap<Blob, Promise<boolean>>();
const answersByFileKey = new Map<string, Promise<boolean>>();
const ANSWER_CACHE_LIMIT = 64;

/**
 * The per-document answer, shared by the viewer's drop path and the form
 * overlays. Callers that already hold the buffer (the drop path probes before
 * it releases the copy) seed it; callers that only have the Blob read once on a
 * miss and never re-derive an answer for a document already answered, so a
 * released copy is not read back to answer the same question.
 */
export async function documentHasFormFieldsFor(
  source: Blob,
  bytes?: ArrayBuffer,
): Promise<boolean> {
  const byIdentity = answers.get(source);
  if (byIdentity) return byIdentity;
  const key = await documentFileKey(source);
  // A bare Blob has no key, so a concurrent caller may have answered while
  // this one awaited the fingerprint; reuse it instead of parsing again.
  const raced = answers.get(source);
  if (raced) return raced;
  const cached = key ? answersByFileKey.get(key) : undefined;
  if (cached) return cached;

  const answer = bytes
    ? documentHasFormFields(bytes, source.size)
    : getDocumentBytes(source)
        .then((buffer) => documentHasFormFields(buffer, source.size))
        .catch((error: unknown) => {
          // A failed read is retryable, so it must not stay memoized as an
          // answer; drop it and let the next caller read again.
          answers.delete(source);
          if (key) answersByFileKey.delete(key);
          throw error;
        });
  answers.set(source, answer);
  if (key) {
    answersByFileKey.delete(key);
    answersByFileKey.set(key, answer);
    while (answersByFileKey.size > ANSWER_CACHE_LIMIT) {
      const oldest = answersByFileKey.keys().next().value;
      if (oldest === undefined) break;
      answersByFileKey.delete(oldest);
    }
  }
  return answer;
}
