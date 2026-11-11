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
import { ensureStructureTree } from "@editor/tools/pdfTextEditor/pdfdoc/passes/ensureStructureTree";
import { markDecorative } from "@editor/tools/pdfTextEditor/pdfdoc/passes/markDecorative";
import { unwrapElements } from "@editor/tools/pdfTextEditor/pdfdoc/passes/unwrapElements";
import { StructureNodes } from "@editor/tools/pdfTextEditor/pdfdoc/structureNodes";
import { encodeTextString } from "@editor/tools/pdfTextEditor/pdfdoc/textString";
import {
  furnitureKind,
  type ArtifactKind,
  type Furniture,
} from "@editor/tools/pdfTextEditor/model/artifactKind";
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
  /** The new /Lang of the element itself; null removes it, absent leaves it. */
  lang?: string | null;
  /** As `lang`, for the block the element belongs to, as `type` is. */
  blockLang?: string | null;
  /** Turn the element's content into an artifact and drop the element, its /Alt with it. */
  decorative: boolean;
  /** The page furniture that artifact is; absent for a plain one. */
  furniture?: Furniture;
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
 * An element added to a file or page with no structure yet first gets it one
 * (ensureStructureTree), in a revision of its own.
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

  const opened = await RawPdf.parse(bytes);
  if (!opened) throw fail("the file could not be read");
  // Strings in an encrypted file must be encrypted too, which this cannot do.
  if (opened.encrypted) throw fail("the file is encrypted");
  // Only an added element can be the first on a page or in the file: every
  // other edit addresses one the file already has.
  const skeleton = ensureStructureTree(
    opened,
    edits.filter((edit) => edit.newElement).map((edit) => edit.pageIndex),
  );
  if (typeof skeleton === "string") throw fail(skeleton);
  const pdf = skeleton ? await RawPdf.parse(skeleton) : opened;
  if (!pdf) throw fail("the file could not be read");
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
  const cutsFromAdded = cutsFromAddedElements(added, cuts);
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
    const ofBlock = edit.type !== undefined || edit.blockLang !== undefined;
    const target = ofBlock ? nodes.blockOf(owner) : owner;
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
  const writeCuts = async (written: readonly StructureEdit[]) => {
    const uncut = await cutElements(
      pdf,
      written.map((edit) => ({
        ...edit,
        type: edit.cut!.type,
        alt: edit.alt ?? null,
        lang: edit.lang ?? null,
        cut: edit.cut!,
      })),
      bodies,
      parentTree,
    );
    for (const [index, reason] of uncut) {
      failures.push({ edit: written[index], reason });
    }
  };
  // Cuts from the file's elements: after the retags, which address elements
  // by the MCIDs a cut can take from them, and before the added elements,
  // which may be placed beside a cut.
  await writeCuts(cuts.filter((edit) => !cutsFromAdded.has(edit)));
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
      lang: edit.lang ?? null,
      cutFrom: [...cutsFromAdded].some(
        (cut) =>
          cut.pageIndex === edit.pageIndex && cut.cut!.from[0] === edit.mcid,
      ),
    })),
    bodies,
    parentTree,
  );
  for (const [index, reason] of unplaced) {
    failures.push({ edit: added[index], reason });
  }
  await writeCuts([...cutsFromAdded]);
  const { streams, failed } = await markDecorative(
    pdf,
    new Map(
      [...decorative].map(([num, owned]) => [num, artifactKindOf(owned)]),
    ),
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

/**
 * The cuts taking text from an element the save adds, directly or through
 * an earlier such cut, in the order made: none can be written until that
 * element is in the tree.
 */
function cutsFromAddedElements(
  added: readonly StructureEdit[],
  cuts: readonly StructureEdit[],
): Set<StructureEdit> {
  const key = (pageIndex: number, mcid: number) => `${pageIndex}:${mcid}`;
  const owners = new Set(added.map((edit) => key(edit.pageIndex, edit.mcid)));
  const late = new Set<StructureEdit>();
  for (const edit of cuts) {
    if (!owners.has(key(edit.pageIndex, edit.cut!.from[0]))) continue;
    late.add(edit);
    owners.add(key(edit.pageIndex, edit.mcid));
  }
  return late;
}

/** The kind of artifact the last of an element's edits makes it; null for a plain one. */
function artifactKindOf(edits: readonly StructureEdit[]): ArtifactKind | null {
  const furniture = edits.at(-1)?.furniture;
  return furniture ? furnitureKind(furniture) : null;
}

/** The element's body with `edit`'s /Alt, /Lang and /S applied; null when it is not a dictionary. */
function edited(
  pdf: RawPdf,
  body: string,
  edit: StructureEdit,
  num: number,
): string | null {
  let out: string | null = body;
  const type = edit.type ?? edit.ownType;
  if (edit.alt !== undefined) {
    out = withTextEntry(out, "Alt", edit.alt);
  }
  const lang = edit.blockLang !== undefined ? edit.blockLang : edit.lang;
  if (out !== null && lang !== undefined) {
    out = withTextEntry(out, "Lang", lang);
  }
  if (out !== null && type) {
    out = setDictEntry(out, "S", `/${type}`);
    if (out !== null && type === "Note" && !pdf.valueSpan(out, "ID")) {
      out = setDictEntry(out, "ID", noteId(num));
    }
  }
  return out;
}

/** The body with text-string entry `key` set to `value`, or removed for null. */
function withTextEntry(
  body: string,
  key: string,
  value: string | null,
): string | null {
  return value === null
    ? removeDictEntry(body, key)
    : setDictEntry(body, key, encodeTextString(value));
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
