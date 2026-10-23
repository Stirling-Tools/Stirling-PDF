import type { StructureElement } from "@editor/tools/pdfTextEditor/model/PageStructure";
import {
  RawPdf,
  referencedObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { decodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

type ElementInfo = Omit<StructureElement, "mcids">;

/**
 * Every page's structure elements, keyed by page index, each listing only the
 * MCIDs the page's ParentTree slots give it: the lookup the save addresses
 * edits by. PDFium lists an element's MCIDs from every page with no page
 * attached, so an element spanning a page break would claim another element's
 * MCID there. Null when the file is untagged, cannot be parsed, or is
 * encrypted, whose strings would read as ciphertext.
 */
export async function readFileStructure(
  bytes: Uint8Array,
): Promise<Map<number, StructureElement[]> | null> {
  const pdf = await RawPdf.parse(bytes);
  if (!pdf || pdf.encrypted) return null;
  const catalog = pdf.objectBody(pdf.rootNum);
  const treeRoot = catalog ? pdf.dictRef(catalog, "StructTreeRoot") : null;
  const rootBody = treeRoot === null ? null : pdf.objectBody(treeRoot);
  if (treeRoot === null || !rootBody) return null;
  const roleMap = pdf.resolve(rootBody, "RoleMap");

  const infos = new Map<number, ElementInfo | null>();
  const infoFor = (num: number): ElementInfo | null => {
    if (!infos.has(num)) infos.set(num, readElement(pdf, num, roleMap));
    return infos.get(num)!;
  };

  const byPage = new Map<number, StructureElement[]>();
  pdf.pageNumbers().forEach((pageNum, pageIndex) => {
    const page = pdf.objectBody(pageNum);
    const key = page ? pdf.dictInt(page, "StructParents") : null;
    const items =
      key === null ? null : pdf.parentTreeArray(treeRoot, key)?.items;
    if (!items) return;
    const owned = new Map<number, StructureElement>();
    items.forEach((item, mcid) => {
      const num = referencedObject(item.text);
      const info = num === null ? null : infoFor(num);
      if (num === null || !info) return;
      const element = owned.get(num) ?? { ...info, mcids: [] };
      element.mcids.push(mcid);
      owned.set(num, element);
    });
    byPage.set(pageIndex, [...owned.values()]);
  });
  return byPage;
}

function readElement(
  pdf: RawPdf,
  num: number,
  roleMap: string | null,
): ElementInfo | null {
  const body = pdf.objectBody(num);
  const type = body ? pdf.dictName(body, "S") : null;
  if (!body || type === null) return null;
  const text = (key: string): string | null => {
    const value = pdf.resolve(body, key);
    return value === null ? null : decodeTextString(value.trim());
  };
  return {
    type: applyRoleMap(pdf, roleMap, type),
    alt: text("Alt"),
    actualText: text("ActualText"),
  };
}

/** Follow /RoleMap (ISO 32000-1 14.8.4) until a type it does not remap. */
function applyRoleMap(
  pdf: RawPdf,
  roleMap: string | null,
  type: string,
): string {
  let current = type;
  const seen = new Set<string>();
  while (roleMap && !seen.has(current)) {
    seen.add(current);
    const mapped = pdf.dictName(roleMap, current);
    if (mapped === null) break;
    current = mapped;
  }
  return current;
}
