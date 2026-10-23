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
import { addFigures } from "@editor/tools/pdfTextEditor/pdfdoc/passes/addFigures";
import { markDecorative } from "@editor/tools/pdfTextEditor/pdfdoc/passes/markDecorative";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";

/** A change to the structure element that owns marked content `mcid` on a page. */
export interface StructureEdit {
  pageIndex: number;
  mcid: number;
  /** The new /Alt; null removes it. */
  alt: string | null;
  /** Turn the element's content into an artifact and drop the element, its /Alt with it. */
  decorative: boolean;
  /**
   * Set when no element owns the content yet: add a Figure for it, after the
   * element owning MCID `after` on the page (see NewFigure).
   */
  newFigure?: { after: number | null };
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
  const failures: StructureEditFailure[] = [];
  const decorative = new Map<number, StructureEdit[]>();
  const figures = edits.filter((edit) => edit.newFigure);
  for (const edit of edits) {
    if (edit.newFigure) continue;
    const owner = elementFor(pdf, treeRoot, edit);
    if (typeof owner === "string") {
      failures.push({ edit, reason: owner });
      continue;
    }
    if (edit.decorative) {
      decorative.set(owner, [...(decorative.get(owner) ?? []), edit]);
      continue;
    }
    const body = bodies.get(owner) ?? pdf.objectBody(owner)!;
    const updated =
      edit.alt === null
        ? removeDictEntry(body, "Alt")
        : setDictEntry(body, "Alt", encodeTextString(edit.alt));
    if (updated === null) {
      failures.push({
        edit,
        reason: "its structure element is not a dictionary",
      });
      continue;
    }
    bodies.set(owner, updated);
  }

  const parentTree = new ParentTreeWriter(pdf, treeRoot);
  // Before the decorative marks, so a figure placed beside an element they
  // drop keeps its place among the kids that remain.
  const unplaced = await addFigures(
    pdf,
    treeRoot,
    figures.map((edit) => ({ ...edit, after: edit.newFigure!.after })),
    bodies,
    parentTree,
  );
  for (const [index, reason] of unplaced) {
    failures.push({ edit: figures[index], reason });
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
