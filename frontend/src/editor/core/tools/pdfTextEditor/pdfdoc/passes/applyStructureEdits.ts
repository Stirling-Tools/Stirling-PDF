/**
 * Write tag edits into the structure tree, as an appended revision.
 */
import {
  RawPdf,
  referencedObject,
  removeDictEntry,
  setDictEntry,
} from "@editor/tools/pdfTextEditor/pdfdoc/raw";
import {
  appendRevision,
  plainObject,
} from "@editor/tools/pdfTextEditor/pdfdoc/revision";
import { ParentTreeWriter } from "@editor/tools/pdfTextEditor/pdfdoc/markedContent";
import {
  addElements,
  noteId,
} from "@editor/tools/pdfTextEditor/pdfdoc/passes/addElements";
import { cutElements } from "@editor/tools/pdfTextEditor/pdfdoc/passes/cutElements";
import { markDecorative } from "@editor/tools/pdfTextEditor/pdfdoc/passes/markDecorative";
import { unwrapElements } from "@editor/tools/pdfTextEditor/pdfdoc/passes/unwrapElements";
import { StructureNodes } from "@editor/tools/pdfTextEditor/pdfdoc/structureNodes";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import type { ContentCut } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

/** A change to the structure element that owns marked content `mcid` on a page. */
export interface StructureEdit {
  pageIndex: number;
  mcid: number;
  /** The new /Alt; null removes it, absent leaves it. */
  alt?: string | null;
  /**
   * The new /S of the block the element belongs to: the element itself when
   * it is one, else the block an inline element such as a Span sits in.
   */
  type?: StructureType;
  /** The new /S of the element itself; null removes it, its content joining its parent. */
  ownType?: StructureType | null;
  /** Turn the element's content into an artifact and drop the element, its /Alt with it. */
  decorative: boolean;
  /**
   * Set when no element owns the content yet: add one of `type` for it, after
   * the element owning MCID `after` on the page (see NewElement).
   */
  newElement?: { type: StructureType; after: number | null };
  /**
   * Set when the content was cut out of an element's: give it one of `type`,
   * or give it back to that element with null (see cutElements).
   */
  cut?: ContentCut & { type: StructureType | null };
}

export interface StructureEditFailure {
  edit: StructureEdit;
  reason: string;
}

/** Thrown with every edit that could not be written; none of them were. */
export class StructureEditError extends Error {
  constructor(readonly failures: StructureEditFailure[]) {
    super(
      `Could not write ${failures.length} tag edit(s): ` +
        failures
          .map(
            (f) =>
              `page ${f.edit.pageIndex + 1} MCID ${f.edit.mcid}: ${f.reason}`,
          )
          .join("; "),
    );
    this.name = "StructureEditError";
  }
}

/**
 * Apply `edits` to `bytes`, all or none. Later edits to the same element win.
 * Throws StructureEditError when any edit cannot be written, including when
 * the file cannot be extended at all.
 */
export async function applyStructureEdits(
  bytes: Uint8Array,
  edits: readonly StructureEdit[],
): Promise<Uint8Array> {
  if (edits.length === 0) return bytes;
  const fail = (reason: string) =>
    new StructureEditError(edits.map((edit) => ({ edit, reason })));

  const pdf = await RawPdf.parse(bytes);
  if (!pdf) throw fail("the file could not be read");
  // Strings in an encrypted file must be encrypted too, which this cannot do.
  if (pdf.encrypted) throw fail("the file is encrypted");
  const catalog = pdf.objectBody(pdf.rootNum);
  const treeRoot = catalog ? pdf.dictRef(catalog, "StructTreeRoot") : null;
  if (treeRoot === null) throw fail("the file has no structure tree");

  const bodies = new Map<number, string>();
  const nodes = new StructureNodes(
    pdf,
    pdf.objectBody(treeRoot) ?? "",
    (num) => bodies.get(num) ?? pdf.objectBody(num),
  );
  const failures: StructureEditFailure[] = [];
  const decorative = new Map<number, StructureEdit[]>();
  const unwraps: { edit: StructureEdit; owner: number }[] = [];
  const added = edits.filter((edit) => edit.newElement);
  const cuts = edits.filter((edit) => edit.cut);
  for (const edit of edits) {
    if (edit.newElement || edit.cut) continue;
    const owner = elementFor(pdf, treeRoot, edit);
    if (typeof owner === "string") {
      failures.push({ edit, reason: owner });
      continue;
    }
    if (edit.decorative) {
      decorative.set(owner, [...(decorative.get(owner) ?? []), edit]);
      continue;
    }
    if (edit.ownType === null) {
      unwraps.push({ edit, owner });
      continue;
    }
    const target = edit.type ? nodes.blockOf(owner) : owner;
    const body = bodies.get(target) ?? pdf.objectBody(target);
    const updated = body === null ? null : edited(pdf, body, edit, target);
    if (updated === null) {
      failures.push({
        edit,
        reason: "its structure element is not a dictionary",
      });
      continue;
    }
    bodies.set(target, updated);
  }

  const parentTree = new ParentTreeWriter(pdf, treeRoot);
  // After the retags, which address elements through the ParentTree as the
  // file has it, and before the cuts, which may take text an element held.
  const kept = unwrapElements(
    pdf,
    unwraps.map(({ owner }) => owner),
    bodies,
    parentTree,
  );
  for (const [index, reason] of kept) {
    failures.push({ edit: unwraps[index].edit, reason });
  }
  // After the retags, which address elements by the MCIDs a cut can take
  // from them, and before the added elements, which may be placed beside a cut.
  const uncut = await cutElements(
    pdf,
    cuts.map((edit) => ({
      ...edit,
      type: edit.cut!.type,
      alt: edit.alt ?? null,
      cut: edit.cut!,
    })),
    bodies,
    parentTree,
  );
  for (const [index, reason] of uncut) {
    failures.push({ edit: cuts[index], reason });
  }
  // Before the decorative marks, so an element placed beside one they drop
  // keeps its place among the kids that remain.
  const unplaced = await addElements(
    pdf,
    treeRoot,
    nodes,
    added.map((edit) => ({
      ...edit,
      ...edit.newElement!,
      alt: edit.alt ?? null,
    })),
    bodies,
    parentTree,
  );
  for (const [index, reason] of unplaced) {
    failures.push({ edit: added[index], reason });
  }
  const { streams, failed } = await markDecorative(
    pdf,
    new Set(decorative.keys()),
    bodies,
    parentTree,
  );
  for (const [num, reason] of failed) {
    for (const edit of decorative.get(num)!) failures.push({ edit, reason });
  }
  if (failures.length > 0) throw new StructureEditError(failures);

  // Before `bodies` is read: it may merge an inline tree into one of them.
  const parentTreeObjects = parentTree.objects(bodies);
  if (!parentTreeObjects) throw fail("the ParentTree cannot be rewritten");
  const out = appendRevision(pdf, [
    ...[...bodies].map(([num, body]) => ({ num, body: plainObject(body) })),
    ...streams,
    ...parentTreeObjects,
  ]);
  if (!out)
    throw fail("the file's cross-reference structure cannot be extended");
  return out;
}

/** The element's body with `edit`'s /Alt and /S applied; null when it is not a dictionary. */
function edited(
  pdf: RawPdf,
  body: string,
  edit: StructureEdit,
  num: number,
): string | null {
  let out: string | null = body;
  const type = edit.type ?? edit.ownType;
  if (edit.alt !== undefined) {
    out =
      edit.alt === null
        ? removeDictEntry(out, "Alt")
        : setDictEntry(out, "Alt", encodeTextString(edit.alt));
  }
  if (out !== null && type) {
    out = setDictEntry(out, "S", `/${type}`);
    if (out !== null && type === "Note" && !pdf.valueSpan(out, "ID")) {
      out = setDictEntry(out, "ID", noteId(num));
    }
  }
  return out;
}

/** The structure element's object number, or why it cannot be found. */
function elementFor(
  pdf: RawPdf,
  treeRoot: number,
  edit: StructureEdit,
): number | string {
  const pageNum = pdf.pageNumberAt(edit.pageIndex);
  const page = pageNum === null ? null : pdf.objectBody(pageNum);
  if (!page) return "no such page";
  const key = pdf.dictInt(page, "StructParents");
  if (key === null) return "the page has no /StructParents";

  const tree = pdf.parentTreeArray(treeRoot, key);
  if (!tree) return "the ParentTree has no entry for the page";
  if (!tree.items) return "the page's ParentTree entry is not an array";

  const num = referencedObject(tree.items[edit.mcid]?.text ?? "");
  if (num === null) return "no structure element owns this MCID";
  const body = pdf.objectBody(num);
  if (!body || pdf.dictName(body, "S") === null) {
    return "the ParentTree points at something that is not a structure element";
  }
  return num;
}
