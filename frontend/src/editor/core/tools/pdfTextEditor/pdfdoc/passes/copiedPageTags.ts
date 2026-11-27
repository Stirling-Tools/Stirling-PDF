import {
  RawPdf,
  removeDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

export async function withoutStructParents(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(bytes);
  const num = pdf?.pageNumberAt(pageIndex) ?? null;
  const body = num === null ? null : (pdf?.objectBody(num) ?? null);
  if (!pdf || num === null || !body || !pdf.valueSpan(body, "StructParents"))
    return bytes;
  return (
    appendRevision(pdf, [
      { num, body: plainObject(removeDictEntry(body, "StructParents")) },
    ]) ?? bytes
  );
}
