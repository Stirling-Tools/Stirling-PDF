import type {
  Affine,
  PageRect,
  RGBA,
  TextRunSnapshot,
} from "@app/tools/pdfTextEditor/v2/types";

/**
 * One line's worth of sub-run data inside a paragraph. Lives on the
 * paragraph rep's `paragraphLineSlots`. The sub-run arrays use the
 * SAME shape as the rep-level `mergedFrom*` fields so the existing
 * partial-edit machinery can treat a slot as a mini-TextRun.
 *
 * `startChar`/`endChar` are offsets into the rep's joined text. Visual
 * lines are joined by a SINGLE separator char: `\n` for a hard (user)
 * break, a space for a soft word-wrap. Each slot owns `[startChar, endChar)`
 * and the separator lives at `slots[i].endChar` (== `slots[i+1].startChar
 * - 1`). Always one char wide, so slicing per-line text out of the joined
 * text by slot range stays exact regardless of which separator it is.
 */
export interface ParagraphLineSlot {
  startChar: number;
  endChar: number;
  baselineY: number;
  matrixE: number;
  containerPtr: number;
  fontId: string;
  fontSize: number;
  fontSubset: boolean;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  /** Char-start positions RELATIVE to the line's text (0..lineText.length). */
  mergedFromCharStarts: number[];
}

/**
 * Deep-clone a slot so the copy shares NO nested arrays with the source.
 * A shallow `{...slot}` leaves mergedFrom* arrays aliased, which corrupts a
 * snapshot when a later edit mutates the live slot in place (undo/redo bug).
 */
export function cloneParagraphLineSlot(
  s: ParagraphLineSlot,
): ParagraphLineSlot {
  return {
    ...s,
    mergedFromPtrs: [...s.mergedFromPtrs],
    mergedFromTexts: [...s.mergedFromTexts],
    mergedFromBounds: s.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...s.mergedFromCharStarts],
  };
}

/**
 * One PDF text object. Mutable inside the editor; commands mutate it,
 * the PdfiumTextWriter is what pushes the change down into PDFium.
 */
export class TextRun {
  readonly id: string;
  readonly pageIndex: number;
  /** PDFium object pointer (page-relative). Zero means "newly created, not yet inserted". */
  pdfiumObjPtr: number;
  bounds: PageRect;
  matrix: Affine;
  text: string;
  fontId: string;
  fontSize: number;
  fill: RGBA;
  fontSubset: boolean;
  /**
   * PDF text render mode (Tr): 0 fill, 1/2 stroke variants, 3 invisible
   * (OCR layers over scans), 4-7 clipping. Re-emits re-apply it so
   * editing invisible text never stamps visible glyphs onto a scan.
   */
  renderMode: number;
  /** True when the run has uncommitted mutation. */
  dirty: boolean;
  /**
   * If the LineGrouper merged multiple PDFium objects into this run,
   * the original object pointers (in left-to-right order). On first
   * edit, ReplaceLineGroupCommand removes them all and inserts one
   * fresh text object carrying the merged text.
   */
  mergedFromPtrs: number[];
  /**
   * Per-sub-run text (parallel to `mergedFromPtrs`). Lets the editor
   * map each char in the rep's merged text back to a source sub-object,
   * which the "pure-deletion" optimization uses to remove only the
   * sub-objects whose chars were deleted - preserving the original
   * font's glyphs for everything else.
   */
  mergedFromTexts: string[];
  /**
   * Per-sub-run bounds (parallel to `mergedFromPtrs`). Needed by the
   * pure-deletion path to compute how far to shift surviving sub-runs
   * left when closing a deleted gap.
   */
  mergedFromBounds: Array<{ x: number; right: number }>;
  /**
   * Per-sub-run starting position in `run.text` (parallel to
   * `mergedFromPtrs`). Replaces the prior approach of locating
   * sub-runs via `indexOf` at planPartialEdit time, which broke after
   * an insert split a sub-run's contiguous chars in run.text (the
   * sub-run text "e " could no longer be found because an inserted
   * "r" landed between the 'e' and the space).
   *
   * The char range a sub-run owns in run.text is
   * `[mergedFromCharStarts[i], mergedFromCharStarts[i] + mergedFromTexts[i].length)`.
   * Gaps between consecutive sub-runs' ranges hold LineGrouper-
   * synthesised whitespace that doesn't belong to any PDFium object.
   */
  mergedFromCharStarts: number[];
  /**
   * If this run was extracted from inside a form xobject, the PDFium
   * pointer of the immediate parent form. EditTextCommand uses this to
   * call `FPDFFormObj_RemoveObject(containerPtr, runPtr)` rather than
   * `FPDFPage_RemoveObject` which only works on top-level objects.
   *
   * Zero means "lives directly on the page".
   */
  containerPtr: number;
  /**
   * If the run was extracted from a form xobject, the page-level
   * pointer of the OUTERMOST form so we can also remove merged-group
   * peers that share the same container.
   */
  topLevelContainerPtr: number;
  /**
   * When ParagraphGrouper merged multiple line groups into this run,
   * the average vertical distance between consecutive baselines (in
   * PDF points). Used by the overlay for CSS line-height and by the
   * edit command to compute baselines for re-emitted lines.
   */
  paragraphLineHeight: number;
  /** PDFium pointers for each constituent line, top-down. */
  paragraphMemberPtrs: number[];
  /** Form-xobject containers (parallel array) for each member. */
  paragraphMemberContainers: number[];
  /** Baseline f-values for each member, top-down. */
  paragraphMemberFs: number[];
  /**
   * Every leaf PDFium pointer that backs this paragraph - includes each
   * line's own `mergedFromPtrs` flattened. Used by `EditTextCommand` to
   * remove every original object; `paragraphMemberPtrs` is per-line and
   * misses the LineGrouper sub-members.
   */
  paragraphLeafPtrs: number[];
  /** Parallel form-xobject containers for every leaf ptr. */
  paragraphLeafContainers: number[];
  /**
   * Pointer to the LATEST background cover-rect emitted on the page for
   * this run, or 0 when none is currently in play. `EditTextCommand`'s
   * overlay path emits a cover rect when `removeMemberPtrs` can't take
   * down every original sub-object (e.g. form-xobject text); the rect
   * masks the leftover glyphs while fresh text emits on top.
   *
   * Without per-run tracking the cover rect from edit N would persist
   * into edit N+1 (each `EditTextCommand` only owns its own ptrs), and
   * a sequence of overlay edits could stack rects on top of each other.
   * `EditTextCommand.apply` removes any existing `coverRectPtr` at the
   * start of its overlay path, then either reuses 0 (when allRemoved)
   * or stores the new rect ptr here.
   */
  coverRectPtr: number;
  /**
   * Per-line sub-run snapshots for paragraph-aware partial edits.
   *
   * One entry per line in the paragraph (parallel to
   * `paragraphMemberPtrs`/`paragraphMemberFs`). Each carries the
   * line-level `mergedFrom*` arrays captured at paragraph-group time so
   * subsequent edits can run the surgical LCS path per line and keep
   * the original fonts. Without this, the rep's own `mergedFrom*`
   * arrays only mirror `members[0]` (rep IS members[0] by reference)
   * and every line past the first looks like a blank slate to the
   * partial-edit planner.
   *
   * Empty when this run is not a paragraph (single line) or when the
   * paragraph was rebuilt by an overlay-path edit without per-line
   * sub-run data.
   */
  paragraphLineSlots: ParagraphLineSlot[];
  /**
   * Session-only lock: when true the run is skipped by all hit-tests
   * (mouse, marquee, Ctrl+A) and edit gestures are no-ops. Not written
   * to the saved PDF; re-opens with all runs unlocked.
   */
  locked: boolean;

  constructor(
    init: TextRunSnapshot & {
      pdfiumObjPtr: number;
      containerPtr?: number;
      topLevelContainerPtr?: number;
    },
  ) {
    this.id = init.id;
    this.pageIndex = init.pageIndex;
    this.pdfiumObjPtr = init.pdfiumObjPtr;
    this.bounds = init.bounds;
    this.matrix = init.matrix;
    this.text = init.text;
    this.fontId = init.fontId;
    this.fontSize = init.fontSize;
    this.fill = init.fill;
    this.fontSubset = init.fontSubset;
    this.renderMode = init.renderMode ?? 0;
    this.dirty = false;
    this.mergedFromPtrs = [];
    this.mergedFromTexts = [];
    this.mergedFromBounds = [];
    this.mergedFromCharStarts = [];
    this.containerPtr = init.containerPtr ?? 0;
    this.topLevelContainerPtr = init.topLevelContainerPtr ?? 0;
    this.paragraphLineHeight = 0;
    this.paragraphMemberPtrs = [];
    this.paragraphMemberContainers = [];
    this.paragraphMemberFs = [];
    this.paragraphLeafPtrs = [];
    this.paragraphLeafContainers = [];
    this.paragraphLineSlots = [];
    this.coverRectPtr = 0;
    this.locked = init.locked ?? false;
  }

  // Display/serialization projection only. Omits runtime fields (mergedFrom,
  // container ptrs, paragraph member/leaf arrays, line slots, coverRectPtr) so
  // it is NOT round-trippable; hold the instance to restore a merged/paragraph run.
  snapshot(): TextRunSnapshot {
    return {
      id: this.id,
      pageIndex: this.pageIndex,
      bounds: { ...this.bounds },
      matrix: { ...this.matrix },
      text: this.text,
      fontId: this.fontId,
      fontSize: this.fontSize,
      fill: { ...this.fill },
      fontSubset: this.fontSubset,
      renderMode: this.renderMode || undefined,
      paragraphLineHeight: this.paragraphLineHeight,
      paragraphLineCount: this.paragraphMemberPtrs.length || undefined,
      locked: this.locked || undefined,
    };
  }
}
