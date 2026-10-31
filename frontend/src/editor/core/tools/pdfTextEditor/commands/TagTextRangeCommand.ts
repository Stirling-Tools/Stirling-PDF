import i18n from "i18next";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import {
  collectMemberPtrs,
  measureObjBoxPt,
  readObjTexts,
  removeAndDestroyObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  addTextPiece,
  charOrigins,
  readMatrix,
  readTextSource,
  restoreText,
  setPieceText,
  type Point,
  type TextSource,
} from "@editor/tools/pdfTextEditor/commands/textPieces";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  isInlineType,
  TEXT_RANGE_TYPES,
  type StructureElement,
} from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import {
  cloneParagraphLineSlot,
  type TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  ARTIFACT_TAG,
  highestMcid,
  innermostMcid,
  readTagMarks,
  type TagMark,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";

/**
 * Tag part of a run's tagged text, code units `start` to `end`, as its own
 * element of `as`. The save pass gives the element its place: inside the
 * element the text was cut from for an inline type, else splitting that
 * element around it.
 */
export class TagTextRangeCommand implements Command {
  readonly type = "tag-text-range";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly start: number;
  private readonly end: number;
  private readonly as: StructureType;
  /** Chosen on first apply, so a redo reuses them. */
  private mcids: { cut: number; part: number } | null = null;
  private undo: Array<() => void> = [];

  constructor(opts: {
    pageIndex: number;
    runId: string;
    start: number;
    end: number;
    as: StructureType;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.start = opts.start;
    this.end = opts.end;
    this.as = opts.as;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const undo: Array<() => void> = [];
    try {
      this.cut(doc, page, undo);
    } catch (err) {
      rollBack(undo);
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
          { cause: err },
        ),
      );
    }
    this.undo = undo;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    rollBack(this.undo);
    this.undo = [];
    const page = doc.page(this.pageIndex);
    page.markDirty();
    page.markNeedsGenerate();
  }

  private cut(doc: EditorDocument, page: Page, undo: Array<() => void>): void {
    const run = page.findRun(this.runId);
    if (!run) throw new Error(`No run ${this.runId}`);
    const structure = doc.structure(this.pageIndex);
    const blocker = structure.cannotAddElement();
    if (blocker) throw new Error(`The page cannot take an element: ${blocker}`);
    if (!/\S/.test(run.text.slice(this.start, this.end))) {
      throw new Error("The range holds no text");
    }
    const owner = rangeOwner(doc, run, this.start, this.end);
    if (!isInlineType(this.as) && !structure.canSplit(owner)) {
      throw new Error("Only a block of text can be split into blocks");
    }

    const plan = planCut(doc, page, run, this.start, this.end);
    if (!this.mcids) {
      const cut = structure.freeMcid(highestMcid(doc.module, page.pagePtr));
      this.mcids = { cut, part: cut + 1 };
    }
    const { cut, part } = this.mcids;
    const tagFor = (piece: Piece): TagMark =>
      piece.group === "cut"
        ? { name: this.as, mcid: cut }
        : { name: piece.tag.name, mcid: part };
    const drawn = redraw(doc, page, plan, tagFor, undo);
    for (const affected of new Set(plan.objects.map((o) => o.leaf.run))) {
      undo.push(snapshotRun(affected));
      relist(doc, affected, plan, drawn);
      keepRunTag(doc, affected);
    }

    const partMcid = (group: Group, own: number): number | null => {
      if (!plan.pieces.some((piece) => piece.group === group)) return null;
      return plan.redrawn.has(group) ? part : own;
    };
    structure.addCut(cut, this.as, {
      from: plan.from,
      before: partMcid("before", plan.from[0]),
      after: partMcid("after", plan.from.at(-1)!),
    });
    undo.push(() => structure.removeElement(cut));
  }
}

function rollBack(undo: Array<() => void>): void {
  while (undo.length > 0) undo.pop()!();
}

type Group = "before" | "cut" | "after";

/** Part of one object's text, code units `from` to `to`, and where it falls against the cut. */
interface Piece {
  ptr: number;
  from: number;
  to: number;
  group: Group;
  /** The object's own MCID tag. */
  tag: TagMark;
}

/** An object the cut redraws some or all of, as its run lists it. */
interface CutObject {
  leaf: Leaf;
  source: TextSource;
  pieces: Piece[];
}

interface CutPlan {
  /** The MCIDs cut from, in reading order. */
  from: number[];
  /** Every piece of their content, in reading order. */
  pieces: Piece[];
  /** The groups drawn by new objects: always the cut, and maybe one part. */
  redrawn: ReadonlySet<Group>;
  objects: CutObject[];
  origins: Map<number, Map<number, Point>>;
}

/**
 * Lay the content of every MCID the range draws out in the order the file
 * holds it, the range's ends cutting objects into pieces. The range must be
 * one stretch of that content, with only the first MCID keeping a part
 * before it and only the last a part after.
 */
function planCut(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  start: number,
  end: number,
): CutPlan {
  const m = doc.module;
  const leafOf = pageLeaves(page);
  const inRange = leaves(run)!.filter(
    (leaf) => leaf.start < end && leaf.start + leaf.text.length > start,
  );
  const from = [
    ...new Set(inRange.map((leaf) => ownMark(doc, leaf.ptr)!.mcid!)),
  ];
  const objects = pageObjects(m, page);
  const ranged = new Map(inRange.map((leaf) => [leaf.ptr, leaf]));

  const pieces: Piece[] = [];
  for (const [n, mcid] of from.entries()) {
    const own = objects.flatMap((ptr) => {
      const tag = ownMark(doc, ptr);
      if (tag?.mcid !== mcid) return [];
      const leaf = ranged.get(ptr);
      if (!leaf) {
        const to = leafOf.get(ptr)?.text.length ?? 0;
        return [{ ptr, tag, from: 0, to, cut: false }];
      }
      return cutLeaf(leaf, start, end).map((part) => ({ ptr, tag, ...part }));
    });
    const cut = own.map((part) => part.cut);
    const first = cut.indexOf(true);
    const last = cut.lastIndexOf(true);
    const stretch = first >= 0 && cut.slice(first, last + 1).every(Boolean);
    const before = first > 0 && n > 0;
    const after = last < own.length - 1 && n < from.length - 1;
    if (!stretch || before || after) {
      throw new Error("The range is not one stretch of its element's text");
    }
    own.forEach(({ ptr, tag, from: at, to }, i) => {
      pieces.push({ ptr, tag, from: at, to, group: groupAt(i, first, last) });
    });
  }

  const redrawn = new Set<Group>(["cut"]);
  const length = (group: Group) =>
    pieces
      .filter((piece) => piece.group === group)
      .reduce((sum, piece) => sum + piece.to - piece.from, 0);
  if (from.length === 1 && length("before") > 0 && length("after") > 0) {
    redrawn.add(length("before") <= length("after") ? "before" : "after");
  }

  const cutObjects: CutObject[] = [];
  for (const ptr of new Set(pieces.map((piece) => piece.ptr))) {
    const own = pieces.filter((piece) => piece.ptr === ptr);
    if (!own.some((piece) => redrawn.has(piece.group))) continue;
    const leaf = leafOf.get(ptr);
    const source = readTextSource(m, ptr);
    if (!leaf || !source) {
      throw new Error("Only text the editor reads can be redrawn");
    }
    cutObjects.push({ leaf, source, pieces: own });
  }
  verifyTexts(m, page, cutObjects);
  return {
    from,
    pieces,
    redrawn,
    objects: cutObjects,
    origins: originsFor(m, page, cutObjects),
  };
}

function groupAt(i: number, first: number, last: number): Group {
  if (i < first) return "before";
  return i > last ? "after" : "cut";
}

/** A leaf's parts outside and inside the range, by its text's code units. */
function cutLeaf(
  leaf: Leaf,
  start: number,
  end: number,
): Array<{ from: number; to: number; cut: boolean }> {
  const length = leaf.text.length;
  const cutFrom = Math.max(0, start - leaf.start);
  const cutTo = Math.min(length, end - leaf.start);
  return [
    { from: 0, to: cutFrom, cut: false },
    { from: cutFrom, to: cutTo, cut: true },
    { from: cutTo, to: length, cut: false },
  ].filter((part) => part.to > part.from);
}

function verifyTexts(
  m: WrappedPdfiumModule,
  page: Page,
  objects: readonly CutObject[],
): void {
  const held = readObjTexts(
    m,
    page.pagePtr,
    objects.map((o) => o.leaf.ptr),
  );
  if (held.some((text, i) => text !== objects[i].leaf.text)) {
    throw new Error("The text the editor shows is not the text drawn");
  }
}

/** Where each piece starts, for every piece that does not start its object. */
function originsFor(
  m: WrappedPdfiumModule,
  page: Page,
  objects: readonly CutObject[],
): Map<number, Map<number, Point>> {
  const wanted = new Map<number, Set<number>>();
  const lengths = new Map<number, number>();
  for (const { leaf, pieces } of objects) {
    const offsets = pieces.map((piece) => piece.from).filter((at) => at > 0);
    if (offsets.length === 0) continue;
    wanted.set(leaf.ptr, new Set(offsets));
    lengths.set(leaf.ptr, leaf.text.length);
  }
  const origins = charOrigins(m, page.pagePtr, wanted, lengths);
  for (const [ptr, offsets] of wanted) {
    if ([...offsets].some((at) => !origins.get(ptr)?.has(at))) {
      throw new Error("PDFium cannot place a piece of the text");
    }
  }
  return origins;
}

/** The objects drawing each cut object's pieces, in reading order, by the object it was. */
type Drawn = Map<number, Array<{ ptr: number; piece: Piece }>>;

/**
 * Redraw the pieces in the redrawn groups as new objects, in reading order so
 * PDFium writes each MCID's content in that order. An object keeping a piece
 * is cut down to it; one keeping none is taken off the page.
 */
function redraw(
  doc: EditorDocument,
  page: Page,
  plan: CutPlan,
  tagFor: (piece: Piece) => TagMark,
  undo: Array<() => void>,
): Drawn {
  const m = doc.module;
  const drawn: Drawn = new Map();
  const expected = new Map<number, string>();
  const objectFor = new Map(plan.objects.map((o) => [o.leaf.ptr, o]));
  for (const piece of plan.pieces) {
    const object = objectFor.get(piece.ptr);
    if (!object || !plan.redrawn.has(piece.group)) continue;
    const text = object.leaf.text.slice(piece.from, piece.to);
    const origin = startOf(object, piece, plan.origins);
    const ptr = addTextPiece(m, doc.docPtr, page, object.source, text, origin, [
      tagFor(piece),
    ]);
    if (!ptr) throw new Error("PDFium could not draw the text");
    undo.push(() => removeAndDestroyObject(m, page.pagePtr, ptr));
    expected.set(ptr, text);
    drawn.set(piece.ptr, [...(drawn.get(piece.ptr) ?? []), { ptr, piece }]);
  }

  for (const object of plan.objects) {
    const { ptr, text } = object.leaf;
    const kept = object.pieces.find((piece) => !plan.redrawn.has(piece.group));
    if (!kept) {
      const index = pageObjects(m, page).indexOf(ptr);
      m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      undo.push(() => m.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, index));
      continue;
    }
    const matrix = readMatrix(m, ptr);
    const keptText = text.slice(kept.from, kept.to);
    const origin = kept.from > 0 ? startOf(object, kept, plan.origins) : null;
    if (!matrix || !setPieceText(m, ptr, keptText, origin)) {
      throw new Error("PDFium could not redraw the text");
    }
    undo.push(() => restoreText(m, ptr, text, matrix));
    expected.set(ptr, keptText);
    const pieces = [...(drawn.get(ptr) ?? []), { ptr, piece: kept }];
    drawn.set(
      ptr,
      pieces.sort((a, b) => a.piece.from - b.piece.from),
    );
  }

  // The text page ends an object's text with a space it infers from the gap
  // to the next, which is no glyph of the object's.
  const read = readObjTexts(m, page.pagePtr, [...expected.keys()]);
  if (
    [...expected.values()].some(
      (text, i) => read[i]?.trimEnd() !== text.trimEnd(),
    )
  ) {
    throw new Error("PDFium redrew the text differently");
  }
  return drawn;
}

function startOf(
  object: CutObject,
  piece: Piece,
  origins: ReadonlyMap<number, ReadonlyMap<number, Point>>,
): Point {
  if (piece.from > 0) return origins.get(object.leaf.ptr)!.get(piece.from)!;
  return { x: object.source.matrix[4], y: object.source.matrix[5] };
}

/** List the objects now drawing a run's text in place of the ones they replace. */
function relist(
  doc: EditorDocument,
  run: TextRun,
  plan: CutPlan,
  drawn: Drawn,
): void {
  const m = doc.module;
  const replaced = plan.objects
    .map((o) => o.leaf)
    .filter((leaf) => leaf.run === run)
    .sort((a, b) => b.index - a.index);
  for (const leaf of replaced) {
    const now = drawn.get(leaf.ptr)!;
    const box = (ptr: number) => {
      const measured = measureObjBoxPt(m, ptr);
      if (!measured) return leaf.list.bounds[leaf.index];
      return { x: measured.x, right: measured.x + measured.width };
    };
    const entries = {
      ptrs: now.map((d) => d.ptr),
      texts: now.map((d) => leaf.text.slice(d.piece.from, d.piece.to)),
      bounds: now.map((d) => box(d.ptr)),
      starts: now.map((d) => d.piece.from),
    };
    replaceEntries(leaf.list, leaf.index, entries);
    // A paragraph keeps its first line's arrays on the run as well.
    const first = run.mergedFromPtrs.indexOf(leaf.ptr);
    if (run.mergedFromPtrs !== leaf.list.ptrs && first >= 0) {
      replaceEntries(lineList(run), first, entries);
    }
    const j = run.paragraphLeafPtrs.indexOf(leaf.ptr);
    if (j >= 0) {
      run.paragraphLeafPtrs.splice(j, 1, ...entries.ptrs);
      run.paragraphLeafContainers.splice(j, 1, ...entries.ptrs.map(() => 0));
    }
    run.paragraphMemberPtrs = run.paragraphMemberPtrs.map((ptr) =>
      ptr === leaf.ptr ? entries.ptrs[0] : ptr,
    );
    if (run.pdfiumObjPtr === leaf.ptr) run.pdfiumObjPtr = entries.ptrs[0];
  }
}

function replaceEntries(
  list: LeafList,
  index: number,
  entries: {
    ptrs: number[];
    texts: string[];
    bounds: Array<{ x: number; right: number }>;
    starts: number[];
  },
): void {
  const start = list.charStarts[index];
  list.ptrs.splice(index, 1, ...entries.ptrs);
  list.texts.splice(index, 1, ...entries.texts);
  list.bounds.splice(index, 1, ...entries.bounds);
  list.charStarts.splice(index, 1, ...entries.starts.map((at) => start + at));
}

/** One object's text in a run, where it starts in the run's text, and the arrays listing it. */
interface Leaf {
  run: TextRun;
  ptr: number;
  text: string;
  start: number;
  list: LeafList;
  index: number;
}

/** A run's parallel arrays for one line's objects. */
interface LeafList {
  ptrs: number[];
  texts: string[];
  bounds: Array<{ x: number; right: number }>;
  charStarts: number[];
  /** Where the line starts in the run's text. */
  base: number;
}

function lineList(run: TextRun): LeafList {
  return {
    ptrs: run.mergedFromPtrs,
    texts: run.mergedFromTexts,
    bounds: run.mergedFromBounds,
    charStarts: run.mergedFromCharStarts,
    base: 0,
  };
}

/** The run's objects in reading order; null when their texts do not tile the run's. */
function leaves(run: TextRun): Leaf[] | null {
  const lists: LeafList[] =
    run.paragraphLineSlots.length > 0
      ? run.paragraphLineSlots.map((slot) => ({
          ptrs: slot.mergedFromPtrs,
          texts: slot.mergedFromTexts,
          bounds: slot.mergedFromBounds,
          charStarts: slot.mergedFromCharStarts,
          base: slot.startChar,
        }))
      : [lineList(run)];
  const out = lists.flatMap((list) =>
    list.ptrs.map((ptr, index) => ({
      run,
      ptr,
      text: list.texts[index] ?? "",
      start: list.base + (list.charStarts[index] ?? Number.NaN),
      list,
      index,
    })),
  );
  const tiles = out.every(
    (leaf, i) =>
      leaf.ptr !== 0 &&
      run.text.slice(leaf.start, leaf.start + leaf.text.length) === leaf.text &&
      (i === 0 || leaf.start >= out[i - 1].start + out[i - 1].text.length),
  );
  return out.length > 0 && tiles ? out : null;
}

/** Every page-level object a run lists, and where. */
function pageLeaves(page: Page): Map<number, Leaf> {
  const out = new Map<number, Leaf>();
  for (const run of page.runs) {
    for (const leaf of leaves(run) ?? []) out.set(leaf.ptr, leaf);
  }
  return out;
}

/** The page's top-level objects, in the order PDFium writes them. */
function pageObjects(m: WrappedPdfiumModule, page: Page): number[] {
  return Array.from({ length: m.FPDFPage_CountObjects(page.pagePtr) }, (_, i) =>
    m.FPDFPage_GetObject(page.pagePtr, i),
  );
}

/**
 * The element owning every object the range draws. Throws when the run's
 * objects cannot be mapped to its text, or the range holds untagged or
 * artifact text, or text of more than one element.
 */
function rangeOwner(
  doc: EditorDocument,
  run: TextRun,
  start: number,
  end: number,
): StructureElement {
  const all = leaves(run);
  if (!all) throw new Error("The run's objects do not match its text");
  const inRange = all.filter(
    (leaf) => leaf.start < end && leaf.start + leaf.text.length > start,
  );
  const structure = doc.structure(run.pageIndex);
  const owners = new Set(
    inRange.map((leaf) => {
      const mcid = ownMark(doc, leaf.ptr)?.mcid ?? null;
      return mcid === null ? null : structure.element(mcid);
    }),
  );
  const [owner] = owners;
  if (owners.size !== 1 || !owner) {
    throw new Error("The range must be text of one element");
  }
  return owner;
}

/**
 * The types code units `start` to `end` of run `runId` can be tagged as:
 * every TEXT_RANGE_TYPES entry, only the inline ones when the text's element
 * is not a block it can split, or none. Checks what apply refuses, without
 * changing anything.
 */
export function rangeTagTypes(
  doc: EditorDocument,
  pageIndex: number,
  runId: string,
  start: number,
  end: number,
): StructureType[] {
  const run = doc.page(pageIndex).findRun(runId);
  const structure = doc.structure(pageIndex);
  if (!run || structure.cannotAddElement()) return [];
  if (!/\S/.test(run.text.slice(start, end))) return [];
  let owner: StructureElement;
  try {
    owner = rangeOwner(doc, run, start, end);
  } catch {
    return [];
  }
  const splits = structure.canSplit(owner);
  return TEXT_RANGE_TYPES.filter((type) => splits || isInlineType(type));
}

/** A stretch of a run's text, code units `start` to `end`, that one element marks. */
export interface ElementStretch {
  start: number;
  end: number;
  element: StructureElement;
}

/**
 * The stretches of run `runId`'s text each element marks, in reading order:
 * one for each series of the run's objects one element marks. Untagged and
 * artifact text is left out, and every stretch when the run's objects cannot
 * be mapped to its text.
 */
export function elementStretches(
  doc: EditorDocument,
  pageIndex: number,
  runId: string,
): ElementStretch[] {
  const run = doc.page(pageIndex).findRun(runId);
  const all = run ? leaves(run) : null;
  if (!all) return [];
  const structure = doc.structure(pageIndex);
  const out: ElementStretch[] = [];
  let previous: StructureElement | null = null;
  for (const leaf of all) {
    const mcid = ownMark(doc, leaf.ptr)?.mcid ?? null;
    const element = mcid === null ? null : structure.element(mcid);
    const end = leaf.start + leaf.text.length;
    if (element && element === previous) out.at(-1)!.end = end;
    else if (element) out.push({ start: leaf.start, end, element });
    previous = element;
  }
  return out;
}

/** The object's innermost tag with an MCID; null for an artifact or untagged object. */
function ownMark(doc: EditorDocument, ptr: number): TagMark | null {
  const marks = readTagMarks(doc.module, ptr);
  if (marks.some((mark) => mark.name === ARTIFACT_TAG)) return null;
  const mcid = innermostMcid(marks);
  return [...marks].reverse().find((mark) => mark.mcid === mcid) ?? null;
}

/**
 * Keep the run's tag one its objects still carry, since text typed into the
 * run is given it: the first tagged object's when the cut took the last of
 * its own.
 */
function keepRunTag(doc: EditorDocument, run: TextRun): void {
  const marks = collectMemberPtrs(run).map((ptr) =>
    readTagMarks(doc.module, ptr),
  );
  const own = innermostMcid(run.tagMarks);
  if (marks.some((tags) => innermostMcid(tags) === own)) return;
  run.tagMarks = marks.find((tags) => innermostMcid(tags) !== null) ?? [];
}

/** Restores what `relist` and `keepRunTag` change on a run. */
function snapshotRun(run: TextRun): () => void {
  const line = {
    ptrs: [...run.mergedFromPtrs],
    texts: [...run.mergedFromTexts],
    bounds: run.mergedFromBounds.map((b) => ({ ...b })),
    charStarts: [...run.mergedFromCharStarts],
  };
  const slots = run.paragraphLineSlots.map(cloneParagraphLineSlot);
  const leafPtrs = [...run.paragraphLeafPtrs];
  const leafContainers = [...run.paragraphLeafContainers];
  const memberPtrs = [...run.paragraphMemberPtrs];
  const { pdfiumObjPtr, tagMarks } = run;
  return () => {
    run.mergedFromPtrs = line.ptrs;
    run.mergedFromTexts = line.texts;
    run.mergedFromBounds = line.bounds;
    run.mergedFromCharStarts = line.charStarts;
    run.paragraphLineSlots = slots;
    run.paragraphLeafPtrs = leafPtrs;
    run.paragraphLeafContainers = leafContainers;
    run.paragraphMemberPtrs = memberPtrs;
    run.pdfiumObjPtr = pdfiumObjPtr;
    run.tagMarks = tagMarks;
  };
}
