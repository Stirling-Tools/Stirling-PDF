/**
 * Read and write the catalog's /MarkInfo /Marked: whether the file declares
 * itself a tagged PDF (ISO 32000-1 14.7.1). Kept apart from writing the tree,
 * because a file can hold tags that are not finished yet.
 */
import { RawPdf, setDictEntry } from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

/** Thrown when the file's /MarkInfo cannot be written. */
export class MarkInfoError extends Error {
  constructor(reason: string) {
    super(`Could not set /MarkInfo /Marked: ${reason}`);
    this.name = "MarkInfoError";
  }
}

/** The catalog's /MarkInfo /Marked; false when absent or unreadable. */
export function isMarked(pdf: RawPdf, catalog: string): boolean {
  const infoNum = pdf.dictRef(catalog, "MarkInfo");
  const info =
    infoNum !== null
      ? pdf.objectBody(infoNum)
      : (pdf.valueSpan(catalog, "MarkInfo")?.text ?? null);
  return !!info && pdf.valueSpan(info, "Marked")?.text === "true";
}

/**
 * `bytes` with /MarkInfo /Marked set to `marked`, as an appended revision;
 * `bytes` itself when the file already says so. Throws MarkInfoError when the
 * catalog cannot be read or changed.
 */
export async function applyMarked(
  bytes: Uint8Array,
  marked: boolean,
): Promise<Uint8Array> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw new MarkInfoError("the file could not be read");
  const catalog = pdf.objectBody(pdf.rootNum);
  if (!catalog) throw new MarkInfoError("the file's catalog cannot be read");
  if (isMarked(pdf, catalog) === marked) return bytes;

  const value = marked ? "true" : "false";
  const objects: { num: number; body: string }[] = [];
  const infoNum = pdf.dictRef(catalog, "MarkInfo");
  if (infoNum !== null) {
    const info = pdf.objectBody(infoNum);
    const updated = info ? setDictEntry(info, "Marked", value) : null;
    if (!updated)
      throw new MarkInfoError("the file's /MarkInfo cannot be read");
    objects.push({ num: infoNum, body: updated });
  } else {
    const info = pdf.valueSpan(catalog, "MarkInfo")?.text;
    const updatedInfo = info
      ? setDictEntry(info, "Marked", value)
      : `<< /Marked ${value} >>`;
    const updated = updatedInfo
      ? setDictEntry(catalog, "MarkInfo", updatedInfo)
      : null;
    if (!updated)
      throw new MarkInfoError("the file's catalog cannot be changed");
    objects.push({ num: pdf.rootNum, body: updated });
  }
  const out = appendRevision(
    pdf,
    objects.map(({ num, body }) => ({ num, body: plainObject(body) })),
  );
  if (!out) {
    throw new MarkInfoError(
      "the file's cross-reference structure cannot be extended",
    );
  }
  return out;
}
