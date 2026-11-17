/**
 * Adding entries to a structure tree's ParentTree (ISO 32000-1 14.7.4.4), for
 * the passes that give a page or an annotation a key of its own.
 */
import {
  arrayItems,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";

const MAX_TREE_DEPTH = 32;

/**
 * A ParentTree key above every one in use: by the tree itself, by a page's
 * /StructParents or by the root's /ParentTreeNextKey. Null when the tree
 * cannot be walked.
 */
export function firstFreeKey(pdf: RawPdf, rootBody: string): number | null {
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
export function addTreeEntries(
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
