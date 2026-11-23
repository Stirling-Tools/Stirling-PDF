/**
 * Give a file the structure the other passes write elements into, as an
 * appended revision: a StructTreeRoot holding a Document element and an empty
 * ParentTree when the file has none, and a /StructParents key with an empty
 * ParentTree array on each page that lacks one.
 */
import {
  addTreeEntries,
  firstFreeKey,
} from "@editor/tools/pdfTextEditor/pdfdoc/parentTreeEntries";
import {
  indirectRef,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  unusedObjectNumber,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

/**
 * The file with a structure tree and a ParentTree array for each of
 * `pageIndices`. Null when nothing needed adding, or when `pageIndices` is
 * empty; a string saying why when the file cannot be given them.
 */
export function ensureStructureTree(
  pdf: RawPdf,
  pageIndices: Iterable<number>,
): Uint8Array | string | null {
  const catalog = pdf.objectBody(pdf.rootNum);
  if (!catalog) return "the file's catalog cannot be read";
  const hasTree = pdf.valueSpan(catalog, "StructTreeRoot") !== null;
  const pages = pagesToKey(pdf, pageIndices, hasTree);
  if (typeof pages === "string") return pages;
  if (pages.length === 0) return null;

  const bodies = new Map<number, string>();
  const allocate = (body: string): number => {
    const num = unusedObjectNumber(pdf, bodies);
    bodies.set(num, body);
    return num;
  };

  let treeRoot = pdf.dictRef(catalog, "StructTreeRoot");
  if (treeRoot === null) {
    if (pdf.valueSpan(catalog, "StructTreeRoot")) {
      return "the file's structure tree is not an indirect object";
    }
    // Reserved, then written once the Document's number is known.
    treeRoot = allocate("");
    const documentNum = allocate(
      `<< /Type /StructElem /S /Document /P ${treeRoot} 0 R /K [] >>`,
    );
    bodies.set(
      treeRoot,
      `<< /Type /StructTreeRoot /K ${documentNum} 0 R /ParentTree << /Nums [] >> /ParentTreeNextKey 0 >>`,
    );
  }
  const rootBody = bodies.get(treeRoot) ?? pdf.objectBody(treeRoot);
  if (!rootBody) return "the file's structure tree cannot be read";

  let nextKey = firstFreeKey(pdf, rootBody);
  if (nextKey === null) return "the ParentTree cannot be read";
  const entries: string[] = [];
  for (const pageNum of pages) {
    const key = nextKey++;
    const page = setDictEntry(
      pdf.objectBody(pageNum)!,
      "StructParents",
      String(key),
    );
    if (!page) return "a page cannot be given /StructParents";
    bodies.set(pageNum, page);
    entries.push(`${key} ${allocate("[]")} 0 R`);
  }

  const extended = addTreeEntries(pdf, rootBody, entries, bodies, allocate);
  if (!extended) return "the ParentTree cannot be extended";
  const root = setDictEntry(extended, "ParentTreeNextKey", String(nextKey));
  if (!root) return "the file's structure tree cannot be read";
  bodies.set(treeRoot, root);

  // /MarkInfo is left alone: a file declares itself tagged only when the
  // user says its tags are finished (markTagged).
  const named = setDictEntry(
    catalog,
    "StructTreeRoot",
    indirectRef(pdf, treeRoot),
  );
  if (!named) return "the file's catalog cannot be read";
  bodies.set(pdf.rootNum, named);

  const out = appendRevision(
    pdf,
    [...bodies].map(([num, body]) => ({ num, body: plainObject(body) })),
  );
  return out ?? "the file's cross-reference structure cannot be extended";
}

/**
 * The page objects among `pageIndices` that need a ParentTree key, in order:
 * those with no /StructParents, or every one when the file has no tree for
 * a key to name.
 */
function pagesToKey(
  pdf: RawPdf,
  pageIndices: Iterable<number>,
  hasTree: boolean,
): number[] | string {
  const pages: number[] = [];
  for (const pageIndex of new Set(pageIndices)) {
    const pageNum = pdf.pageNumberAt(pageIndex);
    const page = pageNum === null ? null : pdf.objectBody(pageNum);
    if (pageNum === null || !page) return "no such page";
    if (!hasTree || !pdf.valueSpan(page, "StructParents")) pages.push(pageNum);
  }
  return pages.sort((a, b) => a - b);
}
