/**
 * Give a file the structure the other passes write elements into, as an
 * appended revision: a StructTreeRoot holding a Document element and an empty
 * ParentTree when the file has none, and a /StructParents key with an empty
 * ParentTree array on each page that lacks one.
 */
import {
  arrayItems,
  indirectRef,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
  unusedObjectNumber,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";

const MAX_TREE_DEPTH = 32;

/**
 * The file with a structure tree and a ParentTree array for each of
 * `pageIndices`, also marking it tagged (/MarkInfo /Marked true). Null when
 * nothing needed adding, or when `pageIndices` is empty; a string saying why
 * when the file cannot be given them.
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

  const marked = markTagged(pdf, catalog, treeRoot, bodies);
  if (!marked) return "the file's catalog cannot be read";
  bodies.set(pdf.rootNum, marked);

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

/**
 * A ParentTree key above every one in use: by the tree itself, by a page's
 * /StructParents or by the root's /ParentTreeNextKey. Null when the tree
 * cannot be walked.
 */
function firstFreeKey(pdf: RawPdf, rootBody: string): number | null {
  const tree = pdf.resolve(rootBody, "ParentTree");
  const keys = tree === null ? [] : treeKeys(pdf, tree, new Set(), 0);
  if (!keys) return null;
  for (const pageNum of pdf.pageNumbers()) {
    const page = pdf.objectBody(pageNum);
    const key = page ? pdf.dictInt(page, "StructParents") : null;
    if (key !== null) keys.push(key);
  }
  return Math.max(
    pdf.dictInt(rootBody, "ParentTreeNextKey") ?? 0,
    ...keys.map((key) => key + 1),
  );
}

function treeKeys(
  pdf: RawPdf,
  node: string,
  seen: Set<number>,
  depth: number,
): number[] | null {
  if (depth > MAX_TREE_DEPTH) return null;
  const keys: number[] = [];
  const nums = pdf.resolve(node, "Nums");
  const pairs = nums === null ? [] : arrayItems(nums.trim());
  if (!pairs) return null;
  for (let i = 0; i < pairs.length; i += 2) {
    const key = Number(pairs[i].text);
    if (Number.isInteger(key)) keys.push(key);
  }
  const kids = pdf.resolve(node, "Kids");
  for (const m of kids?.matchAll(/(\d+)\s+\d+\s+R/g) ?? []) {
    const num = parseInt(m[1], 10);
    if (seen.has(num)) return null;
    seen.add(num);
    const kid = pdf.objectBody(num);
    const below = kid ? treeKeys(pdf, kid, seen, depth + 1) : null;
    if (!below) return null;
    keys.push(...below);
  }
  return keys;
}

/**
 * The root's body with `entries` (`key value` pairs, keys above every key in
 * the tree) added to its ParentTree. An indirect tree node is written to
 * `bodies`. Null when the tree is not one this can extend.
 */
function addTreeEntries(
  pdf: RawPdf,
  rootBody: string,
  entries: readonly string[],
  bodies: Map<number, string>,
  allocate: (body: string) => number,
): string | null {
  const span = pdf.valueSpan(rootBody, "ParentTree");
  if (!span) {
    return setDictEntry(
      rootBody,
      "ParentTree",
      `<< /Nums [${entries.join(" ")}] >>`,
    );
  }
  const nodeNum = pdf.dictRef(rootBody, "ParentTree");
  const node = nodeNum === null ? span.text : pdf.objectBody(nodeNum);
  const extended = node ? withEntries(pdf, node, entries, allocate) : null;
  if (!extended) return null;
  if (nodeNum === null) return setDictEntry(rootBody, "ParentTree", extended);
  bodies.set(nodeNum, extended);
  return rootBody;
}

/**
 * The tree node with `entries` added: to its /Nums when it holds them, else
 * as a new leaf at the end of its /Kids, which keeps the keys in order.
 */
function withEntries(
  pdf: RawPdf,
  node: string,
  entries: readonly string[],
  allocate: (body: string) => number,
): string | null {
  const kids = pdf.valueSpan(node, "Kids");
  if (!kids) {
    const nums = pdf.valueSpan(node, "Nums");
    const items = nums ? arrayItems(nums.text) : [];
    if (!items) return null;
    const all = [...items.map((item) => item.text), ...entries];
    return setDictEntry(node, "Nums", `[${all.join(" ")}]`);
  }
  const items = arrayItems(kids.text);
  if (!items) return null;
  const keys = entries.map((entry) => entry.split(" ")[0]);
  const leaf = allocate(
    `<< /Limits [${keys[0]} ${keys.at(-1)}] /Nums [${entries.join(" ")}] >>`,
  );
  const all = [...items.map((item) => item.text), `${leaf} 0 R`];
  return setDictEntry(node, "Kids", `[${all.join(" ")}]`);
}

/**
 * The catalog naming `treeRoot` and with /MarkInfo /Marked true. An indirect
 * /MarkInfo is written to `bodies`. Null when a dictionary cannot be read.
 */
function markTagged(
  pdf: RawPdf,
  catalog: string,
  treeRoot: number,
  bodies: Map<number, string>,
): string | null {
  let out = setDictEntry(catalog, "StructTreeRoot", indirectRef(pdf, treeRoot));
  const infoNum = pdf.dictRef(catalog, "MarkInfo");
  if (infoNum !== null) {
    const info = pdf.objectBody(infoNum);
    const marked = info ? setDictEntry(info, "Marked", "true") : null;
    if (!marked) return null;
    bodies.set(infoNum, marked);
    return out;
  }
  const info = pdf.valueSpan(catalog, "MarkInfo")?.text;
  const marked = info
    ? setDictEntry(info, "Marked", "true")
    : "<< /Marked true >>";
  out = out && marked ? setDictEntry(out, "MarkInfo", marked) : null;
  return out;
}
