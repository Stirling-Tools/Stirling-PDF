/**
 * Give content the file leaves untagged an element of its own. The editor
 * marked the content with its MCID before PDFium regenerated the page, so
 * only the tree changes here.
 */
import {
  elementKids,
  pageSites,
  type ParentTreeWriter,
  type PageSites,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  indirectRef,
  referencedObject,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import type { StructureNodes } from "@editor/tools/pdfTextEditor/pdfdoc/structureNodes";
import { unusedObjectNumber } from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

export interface NewElement {
  pageIndex: number;
  mcid: number;
  type: StructureType;
  alt: string | null;
  /**
   * The MCID of the content the element reads after: it goes after the
   * block holding that, or before the block holding the page's first tagged
   * content when null or unowned (see StructureNodes.placementSibling).
   */
  after: number | null;
}

interface Placement {
  parent: number;
  sibling: number | null;
  before: boolean;
}

/**
 * Plan an element for each of `elements`, in order, so one placed after an
 * earlier one finds it. New element bodies, and the parents they join, are
 * written to `bodies`, and ParentTree slots to `parentTree`. Returns why a
 * figure could not be added, by index; nothing is written for a document
 * with any failure, so the caller must discard it all.
 */
export async function addElements(
  pdf: RawPdf,
  treeRoot: number,
  nodes: StructureNodes,
  elements: readonly NewElement[],
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): Promise<Map<number, string>> {
  const failed = new Map<number, string>();
  const body = (num: number) => bodies.get(num) ?? pdf.objectBody(num);
  const sites = new Map<number, Promise<PageSites | null>>();

  for (const [index, element] of elements.entries()) {
    const pageNum = pdf.pageNumberAt(element.pageIndex);
    const slots = pageNum === null ? null : parentTree.slots(pageNum);
    if (pageNum === null || !slots) {
      failed.set(index, "its page has no ParentTree array");
      continue;
    }
    if (referencedObject(slots[element.mcid] ?? "") !== null) {
      failed.set(index, "another element owns its MCID");
      continue;
    }
    if (!sites.has(pageNum)) sites.set(pageNum, pageSites(pdf, pageNum));
    const read = await sites.get(pageNum)!;
    if (!read?.sites.some((site) => site.mcid === element.mcid)) {
      failed.set(index, "the page's content does not carry its MCID");
      continue;
    }

    const place = placement(pdf, body, treeRoot, nodes, slots, element.after);
    const parent = body(place.parent);
    const num = unusedObjectNumber(pdf, bodies);
    const joined = parent ? withKid(pdf, parent, place, num) : null;
    if (!joined) {
      failed.set(index, "its parent element cannot be read");
      continue;
    }
    bodies.set(place.parent, joined);
    const alt =
      element.alt === null ? "" : ` /Alt ${encodeTextString(element.alt)}`;
    const id = element.type === "Note" ? ` /ID ${noteId(num)}` : "";
    bodies.set(
      num,
      `<< /Type /StructElem /S /${element.type} /P ${indirectRef(pdf, place.parent)} ` +
        `/Pg ${indirectRef(pdf, pageNum)} /K ${element.mcid}${alt}${id} >>`,
    );
    while (slots.length < element.mcid) slots.push("null");
    slots[element.mcid] = `${num} 0 R`;
  }
  return failed;
}

/**
 * After the block holding MCID `after`; else before the block holding the
 * page's first tagged content; else last in the document's top element, for a
 * page with no tagged content.
 */
function placement(
  pdf: RawPdf,
  body: (num: number) => string | null,
  treeRoot: number,
  nodes: StructureNodes,
  slots: readonly string[],
  after: number | null,
): Placement {
  // Text read after a paragraph that ends in a link is not part of the link,
  // nor of the paragraph.
  const beside = (owner: number | null, before: boolean): Placement | null => {
    const sibling = owner === null ? null : nodes.placementSibling(owner);
    const parent =
      sibling === null ? null : pdf.dictRef(body(sibling) ?? "", "P");
    return parent === null ? null : { parent, sibling, before };
  };
  const anchor = after === null ? null : referencedObject(slots[after] ?? "");
  const first = slots
    .map((slot) => referencedObject(slot))
    .find((num) => num !== null);
  const found = beside(anchor, false) ?? beside(first ?? null, true);
  if (found) return found;
  const top = elementKids(pdf, body(treeRoot) ?? "");
  const only = top?.length === 1 ? referencedObject(top[0]) : null;
  return { parent: only ?? treeRoot, sibling: null, before: false };
}

/** The parent's body with `num` among its /K as `place` puts it; at the end when the sibling is not there. */
function withKid(
  pdf: RawPdf,
  parent: string,
  place: Placement,
  num: number,
): string | null {
  const kids = elementKids(pdf, parent);
  if (!kids) return null;
  const at = kids.findIndex((kid) => referencedObject(kid) === place.sibling);
  kids.splice(insertionIndex(kids.length, at, place.before), 0, `${num} 0 R`);
  return setDictEntry(parent, "K", `[${kids.join(" ")}]`);
}

function insertionIndex(count: number, at: number, before: boolean): number {
  if (at < 0) return count;
  return before ? at : at + 1;
}

/**
 * The /ID PDF/UA-1 7.9 requires on a Note, unique in the file as the
 * object number is.
 */
export function noteId(num: number): string {
  return `(note-${num})`;
}
