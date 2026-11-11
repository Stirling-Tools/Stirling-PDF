/**
 * Remove elements that mark part of another element's text. Only the tree
 * changes: the content keeps its MCIDs, which join the parent where the
 * element stood, their ParentTree slots moving with them.
 */
import {
  elementKids,
  kidMcid,
  mcidKid,
  type ParentTreeWriter,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  indirectRef,
  referencedObject,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";

/**
 * Remove each of `elements`, by object number. Bodies are written to
 * `bodies` and ParentTree slots to `parentTree`. Returns why an element could
 * not be removed, by index; the caller must then discard everything.
 */
export function unwrapElements(
  pdf: RawPdf,
  elements: readonly number[],
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): Map<number, string> {
  const failed = new Map<number, string>();
  elements.forEach((num, index) => {
    const reason = unwrap(pdf, num, bodies, parentTree);
    if (reason) failed.set(index, reason);
  });
  return failed;
}

function unwrap(
  pdf: RawPdf,
  num: number,
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): string | null {
  const read = (n: number) => bodies.get(n) ?? pdf.objectBody(n);
  const body = read(num);
  const parent = body === null ? null : pdf.dictRef(body, "P");
  const parentBody = parent === null ? null : read(parent);
  const siblings = parentBody ? elementKids(pdf, parentBody) : null;
  const at = siblings?.findIndex((kid) => referencedObject(kid) === num) ?? -1;
  const kids = body ? elementKids(pdf, body) : null;
  if (!body || parent === null || !parentBody || !siblings || at < 0 || !kids) {
    return "the element has no parent to give its content to";
  }

  const elementPage = pdf.dictRef(body, "Pg");
  const parentPage = pdf.dictRef(parentBody, "Pg");
  const moved: string[] = [];
  for (const kid of kids) {
    const site = markedSite(pdf, kid, elementPage);
    const slots = site && parentTree.slots(site.pageNum);
    if (!site || !slots) return "the element holds more than marked content";
    slots[site.mcid] = indirectRef(pdf, parent);
    moved.push(mcidKid(pdf, site.mcid, parentPage, site.pageNum));
  }
  siblings.splice(at, 1, ...moved);
  const out = setDictEntry(parentBody, "K", `[${siblings.join(" ")}]`);
  if (!out) return "the element's parent cannot be written";
  bodies.set(parent, out);
  return null;
}

/** The page and MCID a /K entry marks; null for any kid but marked content on a page. */
function markedSite(
  pdf: RawPdf,
  kid: string,
  elementPage: number | null,
): { pageNum: number; mcid: number } | null {
  if (/^\d+$/.test(kid)) {
    if (elementPage === null) return null;
    return { pageNum: elementPage, mcid: parseInt(kid, 10) };
  }
  const ref = referencedObject(kid);
  const dict = ref === null ? kid : pdf.objectBody(ref);
  const pageNum = (dict ? pdf.dictRef(dict, "Pg") : null) ?? elementPage;
  if (pageNum === null) return null;
  const mcid = kidMcid(pdf, kid, elementPage, pageNum);
  return mcid === null ? null : { pageNum, mcid };
}
