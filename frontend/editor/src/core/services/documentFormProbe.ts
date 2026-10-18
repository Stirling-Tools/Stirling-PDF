import { hasAcroForm } from "@app/utils/asciiBytes";
import { runPdfiumScan } from "@app/services/pdfiumScanQueue";
import { readRawFormType } from "@app/services/pdfiumService";
import { LARGE_PDF_PARSE_LIMIT } from "@app/utils/thumbnailUtils";
import { PdfFileReader } from "@app/utils/pdfObjectReader";

/**
 * True when the document may contain interactive form fields.
 *
 * The literal byte scan is a hint, not proof: /AcroForm can live inside a
 * compressed object stream, which the raw bytes never spell out. The in-repo
 * reader parses the xref and catalog, object streams included, without copying
 * the file into wasm, so it confirms every size; files it rejects (a user
 * password, damaged xrefs) fall back to PDFium's catalog probe when the file is
 * small enough to open on the main thread. A file neither can parse has no form
 * UI to show either way.
 */
export async function documentHasFormFields(
  bytes: ArrayBuffer,
  byteLength: number = bytes.byteLength,
): Promise<boolean> {
  if (hasAcroForm(new Uint8Array(bytes))) return true;
  try {
    const reader = await PdfFileReader.open(new Uint8Array(bytes));
    const catalog = await reader.resolveValue(
      reader.root ? { kind: "ref", ref: reader.root } : undefined,
    );
    if (catalog?.kind !== "dict") return false;
    return (await reader.dictGet(catalog.map, "AcroForm")) !== undefined;
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
