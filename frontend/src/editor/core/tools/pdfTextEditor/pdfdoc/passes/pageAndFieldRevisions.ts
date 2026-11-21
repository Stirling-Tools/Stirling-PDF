import { fromLatin1 } from "@editor/tools/pdfTextEditor/pdfdoc/bytes";
import {
  decodeTextString,
  encodeTextString,
} from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import {
  RawPdf,
  indirectRef,
  removeDictEntry,
  setDictEntry,
  spliceValue,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  streamObject,
  unusedObjectNumber,
  type RevisionObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

/**
 * `bytes` with page `pageIndex` no longer claiming an entry in the structure
 * tree's parent tree: a copied page shares its original's /StructParents, so
 * both would read the original's tags. Unchanged when the page claims none.
 */
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

export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Adds `item` to the array `/key` holds in `body`, whether the array is
// written inline or kept in an object of its own; returns the owner's new
// body, having queued any separate array object in `objects`.
function appendToArray(
  pdf: RawPdf,
  objects: Map<number, string>,
  body: string,
  key: string,
  item: string,
): string | null {
  const span = pdf.valueSpan(body, key);
  if (!span) return setDictEntry(body, key, `[${item}]`);
  const ref = span.text.match(/^(\d+)\s+\d+\s+R\b/);
  if (ref) {
    const num = parseInt(ref[1], 10);
    const array = objects.get(num) ?? pdf.objectBody(num);
    const close = array?.lastIndexOf("]") ?? -1;
    if (!array || close < 0) return null;
    objects.set(num, `${array.slice(0, close)} ${item}${array.slice(close)}`);
    return body;
  }
  const close = span.text.lastIndexOf("]");
  if (!span.text.trimStart().startsWith("[") || close < 0) return null;
  return spliceValue(
    body,
    span,
    `${span.text.slice(0, close)} ${item}${span.text.slice(close)}`,
  );
}

/**
 * `bytes` with an unsigned signature field named `name` on page `pageIndex`,
 * written as ISO 32000-1 §12.7.4.5 describes: a /Sig field merged with its
 * widget, drawn as a box until someone signs it. Null when the file's
 * structure is not one this can extend.
 */
export function withSignatureField(
  pdf: RawPdf,
  pageIndex: number,
  name: string,
  rect: FieldRect,
): Uint8Array | null {
  const pageNum = pdf.pageNumberAt(pageIndex);
  const pageBody = pageNum === null ? null : pdf.objectBody(pageNum);
  const catalog = pdf.objectBody(pdf.rootNum);
  if (pageNum === null || !pageBody || !catalog) return null;

  const objects = new Map<number, string>();
  const appearanceNum = unusedObjectNumber(pdf, objects);
  const fieldNum = appearanceNum + 1;
  const fieldRef = `${fieldNum} 0 R`;
  const added: RevisionObject[] = [
    {
      num: appearanceNum,
      body: streamObject(
        `<< /Type /XObject /Subtype /Form /BBox [0 0 ${rect.width} ${rect.height}] >>`,
        fromLatin1(
          `q 0.5 w 0.45 0.45 0.5 RG 0.25 0.25 ${rect.width - 0.5} ${rect.height - 0.5} re S Q`,
        ),
      ),
    },
    {
      num: fieldNum,
      body: plainObject(
        `<< /Type /Annot /Subtype /Widget /FT /Sig /T ${encodeTextString(name)} /F 4 ` +
          `/Rect [${rect.x} ${rect.y} ${rect.x + rect.width} ${rect.y + rect.height}] ` +
          `/P ${indirectRef(pdf, pageNum)} /AP << /N ${appearanceNum} 0 R >> >>`,
      ),
    },
  ];

  const page = appendToArray(pdf, objects, pageBody, "Annots", fieldRef);
  if (!page) return null;
  objects.set(pageNum, page);

  const formNum = pdf.dictRef(catalog, "AcroForm");
  const inline = formNum === null ? pdf.valueSpan(catalog, "AcroForm") : null;
  if (formNum !== null) {
    const form = pdf.objectBody(formNum);
    const withField =
      form && appendToArray(pdf, objects, form, "Fields", fieldRef);
    if (!withField) return null;
    objects.set(formNum, withField);
  } else if (inline) {
    const form = appendToArray(pdf, objects, inline.text, "Fields", fieldRef);
    if (!form) return null;
    objects.set(pdf.rootNum, spliceValue(catalog, inline, form));
  } else {
    const root = setDictEntry(
      catalog,
      "AcroForm",
      `<< /Fields [${fieldRef}] >>`,
    );
    if (!root) return null;
    objects.set(pdf.rootNum, root);
  }

  return appendRevision(pdf, [
    ...added,
    ...[...objects].map(([num, body]) => ({ num, body: plainObject(body) })),
  ]);
}

/** The partial names of the form's top-level fields, read from the AcroForm without loading any page. */
export function topLevelFieldNames(pdf: RawPdf): Set<string> {
  const names = new Set<string>();
  const catalog = pdf.objectBody(pdf.rootNum);
  const form = catalog ? pdf.resolve(catalog, "AcroForm") : null;
  const fields = form ? pdf.resolve(form, "Fields") : null;
  if (!fields) return names;
  for (const ref of fields.matchAll(/(\d+)\s+\d+\s+R/g)) {
    const body = pdf.objectBody(parseInt(ref[1], 10));
    const span = body ? pdf.valueSpan(body, "T") : null;
    const name = span ? decodeTextString(span.text) : null;
    if (name !== null) names.add(name);
  }
  return names;
}
