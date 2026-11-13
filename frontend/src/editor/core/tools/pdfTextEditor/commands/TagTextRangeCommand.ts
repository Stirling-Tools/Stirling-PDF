import i18n from "i18next";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  measureObjBoxPt,
  readObjTexts,
  removeAndDestroyObject,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  addTextPiece,
  charOrigins,
  glyphText,
  inkStarts,
  pieceOrigin,
  placeGlyphs,
  readMatrix,
  readTextSource,
  restoreText,
  setPieceText,
  type Placed,
  type Placing,
  type Point,
  type TextSource,
} from "@editor/tools/pdfTextEditor/commands/textPieces";
import { splitByBlock } from "@editor/tools/pdfTextEditor/commands/splitByBlock";
import { readRunTags } from "@editor/tools/pdfTextEditor/commands/runTags";
import { readsWordGap } from "@editor/tools/pdfTextEditor/pdfium/LineGrouper";
import { taggedSpans } from "@editor/tools/pdfTextEditor/model/TextTags";
import {
  leaves,
  lineList,
  type Leaf,
  type LeafList,
} from "@editor/tools/pdfTextEditor/commands/runLeaves";
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
 * element of `as`, read in language `lang` when given. The save pass gives
 * the element its place: inside the element the text was cut from for an
 * inline type, else splitting that element around it. Splitting also
 * replaces the run with one for each block, so `runId` may name no run once
 * applied.
 */
export class TagTextRangeCommand implements Command {
  readonly type = "tag-text-range";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly start: number;
  private readonly end: number;
  private readonly as: StructureType;
  private readonly lang: string | null;
  /** Chosen on first apply, so a redo reuses them. */
  private mcids: { cut: number; part: number } | null = null;
  private undo: Array<() => void> = [];
  private movedTo: string | null = null;

  constructor(opts: {
    pageIndex: number;
    runId: string;
    start: number;
    end: number;
    as: StructureType;
    lang?: string | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.start = opts.start;
    this.end = opts.end;
    this.as = opts.as;
    this.lang = opts.lang ?? null;
  }

  /**
   * The run a block cut moved the cut text into, once applied; null while
   * the text is in the run it was cut from.
   */
  get movedToRunId(): string | null {
    return this.movedTo;
  }

  /** The MCID the cut text carries, chosen on first apply; null before then. */
  get cutMcid(): number | null {
    return this.mcids?.cut ?? null;
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
          {
            cause: err,
          },
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
    const runs = plan.objects.flatMap(({ leaf }) => (leaf ? [leaf.run] : []));
    for (const affected of new Set(runs)) {
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
    if (this.lang !== null) {
      structure.setOwnLang(structure.element(cut)!.key, this.lang);
    }
    if (isInlineType(this.as)) return;
    const holder = splitByBlock(doc, page, run, undo).find(
      (part) => innermostMcid(part.tagMarks) === cut,
    );
    this.movedTo = holder && holder !== run ? holder.id : null;
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

/** An object the cut redraws some or all of. */
interface CutObject {
  ptr: number;
  text: string;
  /** Where a run lists it; null for text no run shows, as a lone space. */
  leaf: Leaf | null;
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
 * one stretch of that content's ink, with only the first MCID keeping a part
 * before it and only the last a part after. Changes nothing.
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
  const marks = new Map(objects.map((ptr) => [ptr, ownMark(doc, ptr)]));
  const textOf = objectTexts(
    m,
    page,
    leafOf,
    objects.filter((ptr) => from.includes(marks.get(ptr)?.mcid ?? -1)),
  );

  const pieces: Piece[] = [];
  for (const [n, mcid] of from.entries()) {
    const own = objects.flatMap((ptr) => {
      const tag = marks.get(ptr);
      if (!tag || tag.mcid !== mcid) return [];
      const text = textOf.get(ptr)!;
      const leaf = ranged.get(ptr);
      const parts = leaf
        ? cutLeaf(leaf, start, end)
        : [{ from: 0, to: text.length, cut: false }];
      return parts.map((part) => ({
        ptr,
        tag,
        ...part,
        ink: /\S/.test(text.slice(part.from, part.to)),
      }));
    });
    const cut = own.map((part) => part.cut);
    const first = cut.indexOf(true);
    const last = cut.lastIndexOf(true);
    const inked = (parts: typeof own) => parts.some((part) => part.ink);
    const stretch =
      first >= 0 &&
      own.slice(first, last + 1).every((part) => part.cut || !part.ink);
    const before = n > 0 && inked(own.slice(0, first));
    const after = n < from.length - 1 && inked(own.slice(last + 1));
    if (!stretch || before || after) {
      throw new Error("The range is not one stretch of its element's text");
    }
    own.forEach(({ ptr, tag, from: at, to }, i) => {
      pieces.push({ ptr, tag, from: at, to, group: groupAt(i, first, last) });
    });
  }

  const sources = new Map(
    [...new Set(pieces.map((piece) => piece.ptr))].map((ptr) => [
      ptr,
      readTextSource(m, ptr),
    ]),
  );
  const redrawn = new Set<Group>(["cut"]);
  const inGroup = (group: Group) =>
    pieces.filter((piece) => piece.group === group);
  const length = (group: Group) =>
    inGroup(group).reduce((sum, piece) => sum + piece.to - piece.from, 0);
  const drawable = (group: Group) =>
    inGroup(group).every((piece) => sources.get(piece.ptr));
  if (from.length === 1 && length("before") > 0 && length("after") > 0) {
    // A part that is not all text, as an underline drawn with it, cannot be
    // redrawn, so the other is.
    const [shorter, longer]: Group[] =
      length("before") <= length("after")
        ? ["before", "after"]
        : ["after", "before"];
    redrawn.add(drawable(shorter) ? shorter : longer);
  }

  const cutObjects = [...sources].flatMap(([ptr, source]): CutObject[] => {
    const own = pieces.filter((piece) => piece.ptr === ptr);
    if (!own.some((piece) => redrawn.has(piece.group))) return [];
    if (!source) throw new Error("Only text can be redrawn");
    const leaf = leafOf.get(ptr) ?? null;
    return [{ ptr, text: textOf.get(ptr)!, leaf, source, pieces: own }];
  });
  verifyTexts(m, page, cutObjects);
  const origins = originsFor(m, page, cutObjects);
  // A piece of only spaces the text page inferred is drawn by no glyph, so
  // once redrawn it is no content of any MCID.
  const empty = new Set(
    cutObjects.flatMap(({ ptr, text, pieces: own }) =>
      own.filter(
        (piece) => !glyphText(text, origins.get(ptr)!, piece.from, piece.to),
      ),
    ),
  );
  const drawn = (piece: Piece) => !empty.has(piece);
  return {
    from,
    pieces: pieces.filter(drawn),
    redrawn,
    objects: cutObjects.map((o) => ({ ...o, pieces: o.pieces.filter(drawn) })),
    origins,
  };
}

/**
 * Each object's text: as its run lists it, or as the text page reads it for
 * one no run lists, as a lone space. Empty for an object drawing no text.
 */
function objectTexts(
  m: WrappedPdfiumModule,
  page: Page,
  leafOf: ReadonlyMap<number, Leaf>,
  objects: readonly number[],
): Map<number, string> {
  const unlisted = objects.filter((ptr) => !leafOf.has(ptr));
  const read = readObjTexts(m, page.pagePtr, unlisted);
  const readOf = new Map(unlisted.map((ptr, i) => [ptr, read[i]]));
  return new Map(
    objects.map((ptr) => [ptr, leafOf.get(ptr)?.text ?? readOf.get(ptr) ?? ""]),
  );
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
    objects.map((o) => o.ptr),
  );
  if (held.some((text, i) => text !== objects[i].text)) {
    throw new Error("The text the editor shows is not the text drawn");
  }
}

/** Where each object draws each character of its text a glyph draws. */
function originsFor(
  m: WrappedPdfiumModule,
  page: Page,
  objects: readonly CutObject[],
): Map<number, Map<number, Point>> {
  const origins = charOrigins(
    m,
    page.pagePtr,
    new Map(objects.map(({ ptr, text }) => [ptr, text])),
  );
  for (const { ptr, text } of objects) {
    const drawn = origins.get(ptr);
    const ink = inkStarts(text, 0, text.length);
    if (!drawn || ink.some((at) => !drawn.has(at))) {
      throw new Error("PDFium cannot place a piece of the text");
    }
  }
  return origins;
}

/** The objects drawing each cut object's text, in reading order, by the object it was. */
type Drawn = Map<number, Placed[]>;

/**
 * Redraw the pieces in the redrawn groups as new objects, in reading order so
 * PDFium writes each MCID's content in that order. An object keeping a piece
 * is cut down to it; one keeping none is taken off the page. Every glyph is
 * then drawn where it was.
 */
function redraw(
  doc: EditorDocument,
  page: Page,
  plan: CutPlan,
  tagFor: (piece: Piece) => TagMark,
  undo: Array<() => void>,
): Drawn {
  const m = doc.module;
  const heads: Array<{ piece: Piece; placing: Placing }> = [];
  const placing = (
    object: CutObject,
    piece: Piece,
    ptr: number,
    tags: readonly TagMark[],
    fresh: boolean,
  ): Placing => ({
    ptr,
    from: piece.from,
    to: piece.to,
    text: object.text,
    source: object.source,
    origins: plan.origins.get(object.ptr)!,
    tags,
    fresh,
  });
  const glyphsOf = (object: CutObject, piece: Piece) =>
    glyphText(object.text, plan.origins.get(object.ptr)!, piece.from, piece.to);
  const objectFor = new Map(plan.objects.map((o) => [o.ptr, o]));
  for (const piece of plan.pieces) {
    const object = objectFor.get(piece.ptr);
    if (!object || !plan.redrawn.has(piece.group)) continue;
    const tags = [tagFor(piece)];
    const { matrix } = object.source;
    const origin = pieceOrigin(
      plan.origins.get(object.ptr)!,
      object.text,
      piece.from,
    ) ?? { x: matrix[4], y: matrix[5] };
    const ptr = addTextPiece(
      m,
      doc.docPtr,
      page,
      object.source,
      glyphsOf(object, piece),
      origin,
      tags,
    );
    if (!ptr) throw new Error("PDFium could not draw the text");
    undo.push(() => removeAndDestroyObject(m, page.pagePtr, ptr));
    heads.push({ piece, placing: placing(object, piece, ptr, tags, true) });
  }

  for (const object of plan.objects) {
    const { ptr, text } = object;
    const kept = object.pieces.find((piece) => !plan.redrawn.has(piece.group));
    if (!kept) {
      const index = pageObjects(m, page).indexOf(ptr);
      m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      undo.push(() => m.FPDFPage_InsertObjectAtIndex(page.pagePtr, ptr, index));
      continue;
    }
    const matrix = readMatrix(m, ptr);
    const origin =
      kept.from > 0
        ? pieceOrigin(plan.origins.get(ptr)!, text, kept.from)
        : null;
    if (!matrix || !setPieceText(m, ptr, glyphsOf(object, kept), origin)) {
      throw new Error("PDFium could not redraw the text");
    }
    undo.push(() => restoreText(m, ptr, text, matrix));
    const tags = readTagMarks(m, ptr);
    heads.push({
      piece: kept,
      placing: placing(object, kept, ptr, tags, false),
    });
  }

  const placed = placeGlyphs(
    m,
    doc.docPtr,
    page,
    heads.map((head) => head.placing),
    undo,
  );
  const drawn: Drawn = new Map();
  heads.forEach(({ piece }, i) => {
    drawn.set(piece.ptr, [...(drawn.get(piece.ptr) ?? []), ...placed[i]]);
  });
  for (const parts of drawn.values()) parts.sort((a, b) => a.from - b.from);
  verifyRedrawn(m, page, plan, drawn);
  return drawn;
}

function verifyRedrawn(
  m: WrappedPdfiumModule,
  page: Page,
  plan: CutPlan,
  drawn: Drawn,
): void {
  const parts = plan.objects.flatMap((object) =>
    (drawn.get(object.ptr) ?? []).map((part, i, all) => ({
      object,
      part,
      next: all[i + 1],
    })),
  );
  const read = readObjTexts(
    m,
    page.pagePtr,
    parts.map(({ part }) => part.ptr),
  );
  const wrong = parts.some(({ object, part, next }, i) => {
    const { text } = object;
    // A part starting with a space the text page inferred draws no glyph for
    // it, and the text page reads that space as the part before's.
    const own = text.slice(part.from, part.to).trimStart();
    const got = read[i]?.trimStart();
    // The text page ends an object's text with a space it infers from the gap
    // to the next, which is no glyph of the object's.
    if (got?.trimEnd() !== own.trimEnd()) return true;
    // Between two parts of one word, as letter-spaced text drawn glyph by
    // glyph, that space would split the word, as would the one a line read
    // puts in a wide gap.
    const inWord = next && /\S$/.test(own) && /\S/.test(text[part.to] ?? "");
    return inWord && (got !== own || readApart(m, object.source, part, next));
  });
  if (wrong) throw new Error("PDFium redrew the text differently");
}

function readApart(
  m: WrappedPdfiumModule,
  source: TextSource,
  part: Placed,
  next: Placed,
): boolean {
  const before = measureObjBoxPt(m, part.ptr);
  const after = measureObjBoxPt(m, next.ptr);
  if (!before || !after) return true;
  const fontSize = source.size * Math.hypot(source.matrix[0], source.matrix[1]);
  return readsWordGap(after.x - (before.x + before.width), fontSize);
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
    .flatMap(({ leaf }) => (leaf?.run === run ? [leaf] : []))
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
      texts: now.map((d) => leaf.text.slice(d.from, d.to)),
      bounds: now.map((d) => box(d.ptr)),
      starts: now.map((d) => d.from),
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
 * text is inside a form XObject, or its objects cannot be mapped to its text,
 * or the range holds untagged or artifact text, or text of more than one
 * element.
 */
function rangeOwner(
  doc: EditorDocument,
  run: TextRun,
  start: number,
  end: number,
): StructureElement {
  // A form's marks resolve against the form's own /StructParents, and its
  // content is no page content a cut can redraw.
  const containers = [...collectContainersByPtr(run).values()];
  if (run.containerPtr !== 0 || containers.some(Boolean)) {
    throw new Error("Only text drawn on the page itself can be cut");
  }
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
 * is not a block it can split, or none. Runs apply's checks without changing
 * anything, all but those on where the redrawn text lands, which only drawing
 * it shows.
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
    planCut(doc, doc.page(pageIndex), run, start, end);
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
 * The stretches of run `runId`'s text each element marks, in reading order,
 * as `readRunTags` places its objects' tags. Untagged and artifact text is
 * left out.
 */
export function elementStretches(
  doc: EditorDocument,
  pageIndex: number,
  runId: string,
): ElementStretch[] {
  const page = doc.page(pageIndex);
  const run = page.findRun(runId);
  if (!run) return [];
  const structure = doc.structure(pageIndex);
  const out: ElementStretch[] = [];
  const spans = taggedSpans(readRunTags(doc, page, run), run.text.length);
  for (const { start, end, tags } of spans) {
    const mcid = tags.some((tag) => tag.name === ARTIFACT_TAG)
      ? null
      : innermostMcid(tags);
    const element = mcid === null ? null : structure.element(mcid);
    const last = out.at(-1);
    if (element && last?.element === element && last.end === start) {
      last.end = end;
    } else if (element) {
      out.push({ start, end, element });
    }
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
