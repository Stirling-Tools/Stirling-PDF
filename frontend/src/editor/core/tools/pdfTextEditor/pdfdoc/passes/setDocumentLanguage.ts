import {
  RawPdf,
  removeDictEntry,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

/**
 * Set the catalog's /Lang, the language every text in the document is read
 * in unless an element or marked content says otherwise (ISO 32000-1
 * 14.9.2), as an appended revision; null removes it. Untagged files take it
 * too. Throws when the file cannot be read or extended, or is encrypted,
 * whose strings this cannot encrypt.
 */
export async function setDocumentLanguage(
  bytes: Uint8Array,
  lang: string | null,
): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw new Error("The file could not be read");
  if (pdf.encrypted) throw new Error("The file is encrypted");
  const catalog = pdf.objectBody(pdf.rootNum);
  const updated =
    catalog === null
      ? null
      : lang === null
        ? removeDictEntry(catalog, "Lang")
        : setDictEntry(catalog, "Lang", encodeTextString(lang));
  if (updated === null) throw new Error("The catalog is not a dictionary");
  const out = appendRevision(pdf, [
    { num: pdf.rootNum, body: plainObject(updated) },
  ]);
  if (!out) throw new Error("The file cannot be extended");
  return out;
}
