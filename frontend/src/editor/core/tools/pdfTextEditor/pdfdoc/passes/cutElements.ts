/**
 * Give text cut out of an element its own element. The editor marked the cut
 * text with a new MCID before PDFium regenerated the page, so only the tree
 * changes here: an inline element joins the element the text was cut from,
 * among its kids where the text was read, and any other splits that element
 * in two around it.
 */
import {
  elementKids,
  kidMcid,
  mcidKid,
  pageSites,
  type ParentTreeWriter,
  type PageSites,
} from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import { noteId } from "@editor/tools/pdfTextEditor/pdfdoc/passes/addElements";
import {
  indirectRef,
  referencedObject,
  setDictEntry,
  type RawPdf,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import { unusedObjectNumber } from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import {
  isInlineType,
  type ContentCut,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

export interface NewCut {
  pageIndex: number;
  /** The MCID the cut text carries. */
  mcid: number;
  /** Null for a cut the session removed. */
  type: StructureType | null;
  alt: string | null;
  cut: ContentCut;
}

type TypedCut = NewCut & { type: StructureType };

/** What one cut changes, worked out before anything is written. */
interface CutPlan {
  pageNum: number;
  slots: string[];
  owner: number;
  ownerBody: string;
  ownerPage: number | null;
  /** The owner's kids read before the cut, and after it. */
  before: string[];
  after: string[];
}

/**
 * Write an element for each of `cuts`, in order, so a cut from an earlier
 * one's text finds it. Bodies are written to `bodies` and ParentTree slots to
 * `parentTree`. Returns why a cut could not be written, by index; the caller
 * must then discard everything.
 */
export async function cutElements(
  pdf: RawPdf,
  cuts: readonly NewCut[],
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): Promise<Map<number, string>> {
  const failed = new Map<number, string>();
  const sites = new Map<number, Promise<PageSites | null>>();
  const read = (pageNum: number) => {
    if (!sites.has(pageNum)) sites.set(pageNum, pageSites(pdf, pageNum));
    return sites.get(pageNum)!;
  };
  for (const [index, cut] of cuts.entries()) {
    const plan = await planCut(pdf, cut, bodies, parentTree, read);
    if (typeof plan === "string") {
      failed.set(index, plan);
      continue;
    }
    const reason =
      cut.type === null || isInlineType(cut.type)
        ? joinOwner(pdf, cut, plan, bodies)
        : splitOwner(pdf, { ...cut, type: cut.type }, plan, bodies, parentTree);
    if (reason) failed.set(index, reason);
  }
  return failed;
}

async function planCut(
  pdf: RawPdf,
  { pageIndex, mcid, cut }: NewCut,
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
  read: (pageNum: number) => Promise<PageSites | null>,
): Promise<CutPlan | string> {
  const pageNum = pdf.pageNumberAt(pageIndex);
  const slots = pageNum === null ? null : parentTree.slots(pageNum);
  if (pageNum === null || !slots) return "its page has no ParentTree array";
  if (referencedObject(slots[mcid] ?? "") !== null) {
    return "another element owns its MCID";
  }
  const carried = new Set((await read(pageNum))?.sites.map((s) => s.mcid));
  const parts = [cut.before, cut.after].filter((part) => part !== null);
  if (![mcid, ...parts].every((part) => carried.has(part))) {
    return "the page's content does not carry its MCIDs";
  }

  const owner = referencedObject(slots[cut.from[0]] ?? "");
  if (
    owner === null ||
    cut.from.some((from) => referencedObject(slots[from] ?? "") !== owner)
  ) {
    return "the text it was cut from is not one element's";
  }
  const ownerBody = bodies.get(owner) ?? pdf.objectBody(owner);
  const kids = ownerBody ? elementKids(pdf, ownerBody) : null;
  if (!ownerBody || !kids) return "the element it was cut from cannot be read";
  const ownerPage = pdf.dictRef(ownerBody, "Pg");
  const at = cut.from.map((from) =>
    kids.findIndex((kid) => kidMcid(pdf, kid, ownerPage, pageNum) === from),
  );
  if (at[0] < 0 || at.some((i, n) => i !== at[0] + n)) {
    return "the text it was cut from is not consecutive in its element";
  }

  const first = at[0];
  const last = at.at(-1)!;
  // A part the cut left an MCID it was cut from keeps that MCID's kid.
  const partKid = (part: number | null, kid: number): string[] => {
    if (part === null) return [];
    if (part === cut.from[kid - first]) return [kids[kid]];
    return [mcidKid(pdf, part, ownerPage, pageNum)];
  };
  for (const from of cut.from) {
    if (from !== cut.before && from !== cut.after) slots[from] = "null";
  }
  return {
    pageNum,
    slots,
    owner,
    ownerBody,
    ownerPage,
    before: [...kids.slice(0, first), ...partKid(cut.before, first)],
    after: [...partKid(cut.after, last), ...kids.slice(last + 1)],
  };
}

/**
 * Put the cut among the owner's kids, between the parts read before and
 * after it: as an element of its own, or as the owner's own content when the
 * session removed it.
 */
function joinOwner(
  pdf: RawPdf,
  cut: NewCut,
  plan: CutPlan,
  bodies: Map<number, string>,
): string | null {
  const num = cut.type === null ? null : unusedObjectNumber(pdf, bodies);
  const kid =
    num === null
      ? mcidKid(pdf, cut.mcid, plan.ownerPage, plan.pageNum)
      : indirectRef(pdf, num);
  const kids = [...plan.before, kid, ...plan.after];
  const owner = setDictEntry(plan.ownerBody, "K", `[${kids.join(" ")}]`);
  if (!owner) return "the element it was cut from cannot be written";
  bodies.set(plan.owner, owner);
  if (num !== null && cut.type !== null) {
    const element = newElement(
      pdf,
      { ...cut, type: cut.type },
      num,
      plan.owner,
      plan.pageNum,
    );
    bodies.set(num, element);
  }
  setSlot(plan.slots, cut.mcid, num ?? plan.owner);
  keepParts(plan, [cut.cut.before, cut.cut.after]);
  return null;
}

/** Give the parts read before or after the cut to the owner. */
function keepParts(plan: CutPlan, parts: readonly (number | null)[]): void {
  for (const part of parts) {
    if (part !== null) setSlot(plan.slots, part, plan.owner);
  }
}

/**
 * Make the cut a sibling of the owner. The owner keeps what is read before
 * it, and what is read after moves to a new element of the owner's type; one
 * with nothing read before or after is retagged instead.
 */
function splitOwner(
  pdf: RawPdf,
  cut: TypedCut,
  plan: CutPlan,
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): string | null {
  const { before, after, owner, ownerBody, slots } = plan;
  if (before.length === 0 && after.length === 0) {
    return retagOwner(pdf, cut, plan, bodies);
  }
  const parent = pdf.dictRef(ownerBody, "P");
  const parentBody =
    parent === null ? null : (bodies.get(parent) ?? pdf.objectBody(parent));
  const siblings = parentBody ? elementKids(pdf, parentBody) : null;
  const at = siblings?.findIndex((kid) => referencedObject(kid) === owner);
  if (
    parent === null ||
    !parentBody ||
    !siblings ||
    at === undefined ||
    at < 0
  ) {
    return "the element it was cut from has no parent to split it in";
  }

  const num = unusedObjectNumber(pdf, bodies);
  bodies.set(num, newElement(pdf, cut, num, parent, plan.pageNum));
  setSlot(slots, cut.mcid, num);
  const added = [indirectRef(pdf, num)];
  let kept = after;
  if (before.length > 0 && after.length > 0) {
    const rest = unusedObjectNumber(pdf, bodies);
    const reason = moveKids(pdf, after, rest, plan, bodies, parentTree);
    if (reason) return reason;
    const page =
      plan.ownerPage === null ? "" : ` /Pg ${indirectRef(pdf, plan.ownerPage)}`;
    bodies.set(
      rest,
      `<< /Type /StructElem /S /${pdf.dictName(ownerBody, "S")} ` +
        `/P ${indirectRef(pdf, parent)}${page} /K [${after.join(" ")}] >>`,
    );
    added.push(indirectRef(pdf, rest));
    kept = before;
  } else {
    if (before.length > 0) kept = before;
    keepParts(plan, [cut.cut.after]);
  }
  keepParts(plan, [cut.cut.before]);

  const ownerOut = setDictEntry(ownerBody, "K", `[${kept.join(" ")}]`);
  const parentKids = [...siblings];
  parentKids.splice(before.length > 0 ? at + 1 : at, 0, ...added);
  const parentOut = setDictEntry(parentBody, "K", `[${parentKids.join(" ")}]`);
  if (!ownerOut || !parentOut) return "its elements cannot be written";
  bodies.set(owner, ownerOut);
  bodies.set(parent, parentOut);
  return null;
}

/** The cut is all of the owner's content: the owner becomes the cut's type, keeping only the cut. */
function retagOwner(
  pdf: RawPdf,
  cut: TypedCut,
  plan: CutPlan,
  bodies: Map<number, string>,
): string | null {
  const kid = mcidKid(pdf, cut.mcid, plan.ownerPage, plan.pageNum);
  let body = setDictEntry(plan.ownerBody, "S", `/${cut.type}`);
  body = body && setDictEntry(body, "K", `[${kid}]`);
  if (body && cut.type === "Note" && !pdf.valueSpan(body, "ID")) {
    body = setDictEntry(body, "ID", noteId(plan.owner));
  }
  if (!body) return "the element it was cut from cannot be written";
  bodies.set(plan.owner, body);
  setSlot(plan.slots, cut.mcid, plan.owner);
  return null;
}

/**
 * Re-parent `kids` from the owner to element `to`: the ParentTree slots of
 * marked content, the /P of child elements. Fails for any other kid, such as
 * an annotation, whose parent is kept elsewhere.
 */
function moveKids(
  pdf: RawPdf,
  kids: readonly string[],
  to: number,
  plan: CutPlan,
  bodies: Map<number, string>,
  parentTree: ParentTreeWriter,
): string | null {
  const ref = indirectRef(pdf, to);
  for (const kid of kids) {
    const num = referencedObject(kid);
    const body = num === null ? kid : (bodies.get(num) ?? pdf.objectBody(num));
    if (num !== null && body && pdf.dictName(body, "S") !== null) {
      const moved = setDictEntry(body, "P", ref);
      if (!moved) return "a child element cannot be moved";
      bodies.set(num, moved);
      continue;
    }
    const page = kidPage(pdf, kid, body, plan.ownerPage);
    const mcid = page === null ? null : kidMcid(pdf, kid, plan.ownerPage, page);
    const slots = page === null ? null : parentTree.slots(page);
    if (mcid === null || !slots) {
      return "the element holds content that cannot be moved";
    }
    setSlot(slots, mcid, to);
  }
  return null;
}

/** The page a marked-content kid's content is on; null for any other kid. */
function kidPage(
  pdf: RawPdf,
  kid: string,
  body: string | null,
  ownerPage: number | null,
): number | null {
  if (/^\d+$/.test(kid)) return ownerPage;
  if (!body || pdf.dictName(body, "Type") !== "MCR") return null;
  return pdf.dictRef(body, "Pg") ?? ownerPage;
}

function newElement(
  pdf: RawPdf,
  { type, mcid, alt }: TypedCut,
  num: number,
  parent: number,
  pageNum: number,
): string {
  const altEntry = alt === null ? "" : ` /Alt ${encodeTextString(alt)}`;
  const id = type === "Note" ? ` /ID ${noteId(num)}` : "";
  return (
    `<< /Type /StructElem /S /${type} /P ${indirectRef(pdf, parent)} ` +
    `/Pg ${indirectRef(pdf, pageNum)} /K ${mcid}${altEntry}${id} >>`
  );
}

function setSlot(slots: string[], mcid: number, num: number): void {
  while (slots.length < mcid) slots.push("null");
  slots[mcid] = `${num} 0 R`;
}
