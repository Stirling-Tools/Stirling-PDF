import i18n from "i18next";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import { liftRunToPage } from "@editor/tools/pdfTextEditor/commands/liftFromForm";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import {
  refuseRedrawOfReadOnlyText,
  unsafeRtlEditMessage,
} from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  charcodesResolveFully,
  collectMemberPtrs,
  contentIndices,
  drawnEndPt,
  droppedCharsOf,
  emitTextLine,
  measureObjSpanPt,
  removeAndDestroyObject,
  restoreContentOrder,
  rotationFromMatrix,
  warmOnPageAdvances,
  type FontSpan,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { piecesFromObjects } from "@editor/tools/pdfTextEditor/commands/partialEdit";
import {
  ATTACHES_TO_PREVIOUS,
  isSubsetFont,
  losesLetters,
} from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import {
  charOrigins,
  readMatrix,
  readTextSource,
  writeMatrix,
  type Point,
  type TextSource,
} from "@editor/tools/pdfTextEditor/commands/textPieces";
import { readFontName } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import {
  cloneParagraphLineSlot,
  type ParagraphLineSlot,
  type TextRun,
} from "@editor/tools/pdfTextEditor/model/TextRun";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { readTagMarks } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTagMarks";
import { hasRtl } from "@editor/tools/pdfTextEditor/util/bidi";
import { needsShaping } from "@editor/tools/pdfTextEditor/util/complexShaping";
import {
  deviceFamilyOf,
  familyCoverage,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  documentFontIdAt,
  noteDocumentFontStyle,
} from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import { fallbackFamilyFor } from "@editor/tools/pdfTextEditor/util/fontCapability";
import {
  base14FontId,
  deviceFontId,
  documentFontHandle,
  nearestStandardFont,
  stripSubsetTag,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { transformObject } from "@editor/tools/pdfTextEditor/util/objectTransform";
import type { RGBA, TextRange } from "@editor/tools/pdfTextEditor/types";

/**
 * Characters `start` to `end` of a run's text, as code units, to draw in
 * `face`: a value the font list gives, which is a document fontId, a standard
 * font name or a device family.
 */
export interface FaceStretch {
  start: number;
  end: number;
  face: string;
}

/** Characters `start` to `end` of a run's text, drawn in one font. */
export interface FontStretch {
  start: number;
  end: number;
  fontId: string;
}

/** Some of one run's characters, selected apart from the rest of it. */
export interface SelectedPart {
  page: Page;
  run: TextRun;
  range: TextRange;
}

/** Why a run's selected characters cannot be restyled on their own. */
export type RangeRefusal = "rightToLeft" | "needsShaping" | "unsupported";

interface Piece {
  ptr: number;
  text: string;
  /** Where the piece's text starts in the run's text. */
  start: number;
  bounds: { x: number; right: number };
}

interface Line {
  /** Index into the run's paragraph line slots; -1 when the run has none. */
  slot: number;
  pieces: Piece[];
}

interface Target {
  fontPtr: number;
  fallbackFamily: string;
}

interface Unit {
  /** Code units of the piece's text. */
  start: number;
  end: number;
  /** The face of each code unit of the unit, null where it keeps its own. */
  targets: Array<Target | null>;
}

interface RunSnapshot {
  bounds: TextRun["bounds"];
  pdfiumObjPtr: number;
  mergedFromPtrs: number[];
  mergedFromTexts: string[];
  mergedFromBounds: Array<{ x: number; right: number }>;
  mergedFromCharStarts: number[];
  paragraphMemberPtrs: number[];
  paragraphLeafPtrs: number[];
  paragraphLeafContainers: number[];
  paragraphLineSlots: ParagraphLineSlot[];
}

/**
 * Restyle some characters of a run, leaving the rest of it as it is drawn. The
 * objects holding those characters are redrawn word by word where their words
 * already stood, each stretch in its own font as typing beside a styled word
 * draws it, and the text after them on the line moves by the width the change
 * adds or takes away. A character the new face has no glyph for stays in the
 * font that drew it. Lines drawn right to left or needing shaping are refused,
 * as their letters cannot be redrawn one stretch at a time.
 */
export class StyleTextRangeCommand implements Command {
  readonly type = "style-text-range";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly faces: readonly FaceStretch[];
  private readonly wrapWidthPt: number | null;
  private prev: RunSnapshot | null = null;
  private removed: Array<{ ptr: number; index: number }> = [];
  private created: number[] = [];
  private shifted: Array<{ ptr: number; dx: number; matrix: Float32Array }> =
    [];
  private reflow: ReflowWrapCommand | null = null;

  /** `wrapWidthPt` is the width the run's lines rewrap to when a change makes one overflow it; null never rewraps. */
  constructor(opts: {
    pageIndex: number;
    runId: string;
    faces: readonly FaceStretch[];
    wrapWidthPt?: number | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.faces = opts.faces;
    this.wrapWidthPt = opts.wrapWidthPt ?? null;
  }

  /** Why this change cannot be made, or null when it can. */
  refusal(doc: EditorDocument): RangeRefusal | null {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return "unsupported";
    const lines = runLines(doc, page, run);
    if (typeof lines === "string") return lines;
    const changes = this.changes(doc, page, run, lines).targets;
    return piecesRefusal(doc, lines, (piece) => touches(piece, changes));
  }

  /**
   * How much of the selection that is not already in its new face that face
   * has glyphs for. The rest stays in the font that drew it.
   */
  coverage(doc: EditorDocument): "all" | "some" | "none" | "unchanged" {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    const lines = run && linesOf(doc, page, run);
    if (!run || !lines) return "unchanged";
    const { targets, kept } = this.changes(doc, page, run, lines);
    if (kept === 0) return targets.size === 0 ? "unchanged" : "all";
    return targets.size === 0 ? "none" : "some";
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    this.prev = null;
    if (!run) return;
    refuseRedrawOfReadOnlyText(run);
    const refusal = this.refusal(doc);
    if (refusal === "rightToLeft")
      throw new RolledBackError(new Error(unsafeRtlEditMessage()));
    if (refusal === "needsShaping")
      throw new RolledBackError(new Error(cannotRestyleMessage()));
    if (refusal) return;
    liftRunToPage(doc, page, run);
    const lines = linesOf(doc, page, run);
    if (!lines) return;
    const { targets } = this.changes(doc, page, run, lines);
    if (targets.size === 0) return;

    const m = doc.module;
    this.prev = snapshotRun(run);
    this.removed = [];
    this.created = [];
    this.shifted = [];
    this.reflow = null;
    const touched = lines.flatMap((line) =>
      line.pieces.filter((piece) => touches(piece, targets)),
    );
    const order = contentIndices(
      m,
      page.pagePtr,
      touched.map((piece) => piece.ptr),
    );
    const origins = charOrigins(
      m,
      page.pagePtr,
      new Map(touched.map((piece) => [piece.ptr, piece.text])),
    );
    const spanBefore = measureObjSpanPt(m, collectMemberPtrs(run));
    warmOnPageAdvances(m, page.pagePtr);

    const redrawn = new Map<number, Piece[]>();
    const dropped = droppedCharsOf(() => {
      for (const line of lines) {
        if (!line.pieces.some((piece) => touches(piece, targets))) continue;
        line.pieces = this.redrawLine(doc, page, run, line, targets, {
          origins,
          order,
          redrawn,
        });
      }
    });
    if (losesLetters(dropped)) {
      this.takeBackObjects(doc, page);
      restoreRun(run, this.prev);
      this.prev = null;
      throw new RolledBackError(new Error(missingGlyphsMessage()));
    }
    updateRunModel(run, lines, redrawn);
    const spanAfter = measureObjSpanPt(m, collectMemberPtrs(run));
    if (spanBefore && spanAfter)
      run.bounds = {
        ...run.bounds,
        width: Math.max(
          0,
          run.bounds.width + spanAfter.right - spanBefore.right,
        ),
      };
    run.charPositionsKey = null;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    if (this.wrapWidthPt !== null && this.wrapWidthPt > 0) {
      this.reflow = new ReflowWrapCommand({
        pageIndex: this.pageIndex,
        runId: this.runId,
        maxWidthPt: this.wrapWidthPt,
        keepClearBelow: true,
      });
      this.reflow.apply(doc);
    }
  }

  revert(doc: EditorDocument): void {
    if (!this.prev) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    this.reflow?.revert(doc);
    this.reflow = null;
    this.takeBackObjects(doc, page);
    restoreRun(run, this.prev);
    this.prev = null;
    run.charPositionsKey = null;
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  private takeBackObjects(doc: EditorDocument, page: Page): void {
    const m = doc.module;
    for (const ptr of this.created)
      removeAndDestroyObject(m, page.pagePtr, ptr);
    for (const { ptr } of this.removed)
      m.FPDFPage_InsertObject(page.pagePtr, ptr);
    restoreContentOrder(m, page.pagePtr, this.removed);
    for (const { ptr, dx, matrix } of [...this.shifted].reverse()) {
      transformObject(m, ptr, 1, 0, 0, 1, -dx, 0);
      writeMatrix(m, ptr, matrix);
    }
    this.created = [];
    this.removed = [];
    this.shifted = [];
  }

  /** The face each character of the selection changes to, and how many the face it was given has no glyph for. */
  private changes(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    lines: readonly Line[],
  ): { targets: Map<number, Target>; kept: number } {
    const m = doc.module;
    const fontAt = new Map<number, number>();
    for (const line of lines)
      for (const piece of line.pieces) {
        const font = piece.ptr ? m.FPDFTextObj_GetFont(piece.ptr) : 0;
        for (let c = 0; c < piece.text.length; c++)
          fontAt.set(piece.start + c, font);
      }
    const targets = new Map<number, Target>();
    const idOf = fontIdNamer(doc);
    let kept = 0;
    for (const { start, end, face } of this.faces) {
      const target = targetOf(face);
      const draws = facesDraw(doc, page, face, target);
      const faceId = fontIdOfFace(face);
      for (let c = Math.max(0, start); c < Math.min(end, run.text.length);) {
        const ch = String.fromCodePoint(run.text.codePointAt(c)!);
        const at = c;
        c += ch.length;
        const font = fontAt.get(at);
        if (/\s/.test(ch) || font === undefined) continue;
        const already = target.fontPtr
          ? font === target.fontPtr
          : idOf(font) === faceId;
        if (already) continue;
        if (!draws(ch)) {
          kept++;
          continue;
        }
        for (let u = at; u < c; u++) targets.set(u, target);
      }
    }
    return { targets, kept };
  }

  private redrawLine(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    line: Line,
    targets: ReadonlyMap<number, Target>,
    read: {
      origins: ReadonlyMap<number, ReadonlyMap<number, Point>>;
      order: ReadonlyMap<number, number>;
      redrawn: Map<number, Piece[]>;
    },
  ): Piece[] {
    const m = doc.module;
    let offset = 0;
    const out: Piece[] = [];
    for (const piece of line.pieces) {
      if (!touches(piece, targets)) {
        if (Math.abs(offset) > 0.001 && piece.ptr) {
          const matrix = readMatrix(m, piece.ptr);
          if (matrix) {
            transformObject(m, piece.ptr, 1, 0, 0, 1, offset, 0);
            this.shifted.push({ ptr: piece.ptr, dx: offset, matrix });
          }
        }
        out.push({
          ...piece,
          bounds: {
            x: piece.bounds.x + offset,
            right: piece.bounds.right + offset,
          },
        });
        continue;
      }
      const source = readTextSource(m, piece.ptr)!;
      const units = unitsOf(piece, targets);
      const origins = read.origins.get(piece.ptr);
      const placed =
        origins && units.every((unit) => origins.has(unit.start))
          ? origins
          : null;
      const index = contentIndices(m, page.pagePtr, [piece.ptr]).get(piece.ptr);
      m.FPDFPage_RemoveObject(page.pagePtr, piece.ptr);
      this.removed.push({
        ptr: piece.ptr,
        index: read.order.get(piece.ptr) ?? index ?? 0,
      });
      const drawn: Piece[] = [];
      const draw = (unit: Unit, x: number): DrawnUnit => {
        const result = drawUnit(doc, page, run, piece, source, unit, x);
        drawn.push(...result.pieces);
        return result;
      };
      if (placed) {
        let before: { end: number; penEnd: number } | null = null;
        for (const unit of units) {
          const origin = placed.get(unit.start)!.x;
          // A word split only where its font changes reads as one word only when its parts abut.
          if (before?.end === unit.start) offset = before.penEnd - origin;
          const result = draw(unit, origin + offset);
          offset += result.widthChange;
          before = { end: unit.end, penEnd: result.penEnd };
        }
      } else {
        offset += draw(
          {
            start: 0,
            end: piece.text.length,
            targets: pieceTargets(piece, targets),
          },
          source.matrix[4] + offset,
        ).widthChange;
      }
      const ptrs = drawn.map((p) => p.ptr);
      this.created.push(...ptrs);
      if (index !== undefined)
        restoreContentOrder(
          m,
          page.pagePtr,
          ptrs.map((ptr, k) => ({ ptr, index: index + k })),
        );
      read.redrawn.set(piece.ptr, drawn);
      out.push(...drawn);
    }
    return out;
  }
}

/** The face of each code unit of a piece, a space taking the one before it. */
function pieceTargets(
  piece: Piece,
  targets: ReadonlyMap<number, Target>,
): Array<Target | null> {
  const out: Array<Target | null> = [];
  for (let c = 0; c < piece.text.length; c++) {
    const own = targets.get(piece.start + c) ?? null;
    out.push(/\s/.test(piece.text[c]) && c > 0 ? out[c - 1] : own);
  }
  return out;
}

/** The run's lines, or why none of its pieces can be restyled on their own. */
function runLines(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): Line[] | RangeRefusal {
  if (run.textReadOnly) return "rightToLeft";
  if (isScanRun(run) || run.scanEdit || rotationFromMatrix(run.matrix))
    return "unsupported";
  return linesOf(doc, page, run) ?? "unsupported";
}

/** Why the pieces `restyles` picks cannot be redrawn on their own, or null when they can. */
function piecesRefusal(
  doc: EditorDocument,
  lines: readonly Line[],
  restyles: (piece: Piece) => boolean,
): RangeRefusal | null {
  for (const line of lines) {
    const picked = line.pieces.filter(restyles);
    if (picked.length === 0) continue;
    // A line's later pieces are moved along it, which is only the way it reads when it runs left to right.
    if (hasRtl(line.pieces.map((piece) => piece.text).join("")))
      return "rightToLeft";
    if (
      picked.some(
        (p) => needsShaping(p.text) || ATTACHES_TO_PREVIOUS.test(p.text),
      )
    )
      return "needsShaping";
    for (const piece of picked) {
      const at = line.pieces.indexOf(piece);
      if (line.pieces[at + 1]?.text === "") return "unsupported";
      const source = readTextSource(doc.module, piece.ptr);
      if (!source || !upright(source.matrix)) return "unsupported";
    }
  }
  return null;
}

/** Why the characters `range` covers cannot be restyled apart from the rest of `run`, or null when they can. */
export function rangeRefusal(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  range: TextRange,
): RangeRefusal | null {
  const lines = runLines(doc, page, run);
  if (typeof lines === "string") return lines;
  return piecesRefusal(
    doc,
    lines,
    (piece) =>
      piece.start < range.end && piece.start + piece.text.length > range.start,
  );
}

/**
 * The stretches of a piece drawn apart: each run of letters in one face, split
 * at spaces. Each goes where its first letter stood, so the words a change
 * leaves alone keep their places on a justified or kerned line.
 */
function unitsOf(piece: Piece, targets: ReadonlyMap<number, Target>): Unit[] {
  const units: Unit[] = [];
  let open: Unit | null = null;
  for (let c = 0; c < piece.text.length; c++) {
    const ch = piece.text[c];
    if (/\s/.test(ch)) {
      open = null;
      continue;
    }
    const target = targets.get(piece.start + c) ?? null;
    const low = c > 0 && /[\udc00-\udfff]/.test(ch);
    if (open && (low || open.targets[open.targets.length - 1] === target)) {
      open.end = c + 1;
      open.targets.push(target);
    } else {
      open = { start: c, end: c + 1, targets: [target] };
      units.push(open);
    }
  }
  return units;
}

interface DrawnUnit {
  pieces: Piece[];
  widthChange: number;
  /**
   * Where a letter drawn straight after the unit starts: its pen position plus
   * the run's letter spacing, as within one object, not its ink edge.
   */
  penEnd: number;
}

function drawUnit(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  piece: Piece,
  source: TextSource,
  unit: Unit,
  x: number,
): DrawnUnit {
  const m = doc.module;
  const text = piece.text.slice(unit.start, unit.end);
  const size = source.size * Math.hypot(source.matrix[0], source.matrix[1]);
  const ownFallback =
    deviceFamilyOf(doc, source.font) ??
    fallbackFamilyFor(
      `pdf:${source.font}:${stripSubsetTag(readFontName(m, source.font) ?? "")}`,
    );
  const fill: RGBA = source.fill ?? run.fill;
  const common = {
    doc,
    page,
    y: source.matrix[5],
    fontSize: size,
    fill,
    renderMode: source.renderMode,
    stroke: source.stroke,
    strokeWidth: source.strokeWidth ?? undefined,
    tags: uniformTags(readTagMarks(m, piece.ptr)),
    charSpacingPt: run.charSpacingPt,
  };
  const spans: FontSpan[] = [];
  unit.targets.forEach((target, i) => {
    const font = target ? target.fontPtr : source.font;
    const family = target ? target.fallbackFamily : ownFallback;
    const last = spans[spans.length - 1];
    if (last && last.fontPtr === font && last.fallbackFamily === family)
      last.end = i + 1;
    else spans.push({ end: i + 1, fontPtr: font, fallbackFamily: family });
  });
  const restyled = unit.targets.some(Boolean);
  const outTexts: string[] = [];
  const ptrs = emitTextLine({
    ...common,
    text,
    x,
    originalFontPtr: spans.length === 1 ? spans[0].fontPtr : 0,
    originalFontSubset: isSubsetFont(m, spans[0].fontPtr),
    fallbackFamily: spans[0].fallbackFamily,
    fontSpans: spans.length > 1 ? spans : undefined,
    outTexts,
  });
  let widthChange = 0;
  if (restyled) {
    // Against the letters drawn as they were from the same place, ink to ink:
    // a subset font's advances cannot be looked up by character. What that
    // draw drops is no loss.
    let before = 0;
    droppedCharsOf(() => {
      const probe = emitTextLine({
        ...common,
        text,
        x,
        originalFontPtr: source.font,
        originalFontSubset: isSubsetFont(m, source.font),
        fallbackFamily: ownFallback,
      });
      before = measureObjSpanPt(m, probe)?.right ?? x;
      for (const ptr of probe) removeAndDestroyObject(m, page.pagePtr, ptr);
    });
    widthChange = (measureObjSpanPt(m, ptrs)?.right ?? x) - before;
  }
  return {
    pieces: placedPieces(m, ptrs, outTexts, text, piece.start + unit.start, x),
    widthChange,
    penEnd: drawnEndPt(m, ptrs, outTexts, size) + run.charSpacingPt,
  };
}

function placedPieces(
  m: WrappedPdfiumModule,
  ptrs: readonly number[],
  texts: readonly string[],
  text: string,
  start: number,
  x: number,
): Piece[] {
  let cursor = 0;
  return ptrs.map((ptr, i) => {
    const carried = (texts[i] ?? "").trim();
    const at = carried ? text.indexOf(carried, cursor) : -1;
    const from = at >= 0 ? at : cursor;
    const piece = carried && at >= 0 ? carried : text.slice(cursor);
    cursor = from + piece.length;
    const span = measureObjSpanPt(m, [ptr]);
    return {
      ptr,
      text: piece,
      start: start + from,
      bounds: span ? { x: span.left, right: span.right } : { x, right: x },
    };
  });
}

/** The run's pieces line by line, each with where its text sits in the run's; null when they cannot be matched to it. */
function linesOf(doc: EditorDocument, page: Page, run: TextRun): Line[] | null {
  const m = doc.module;
  const boundsOf = (ptr: number) => {
    const span = ptr ? measureObjSpanPt(m, [ptr]) : null;
    return span ? { x: span.left, right: span.right } : { x: 0, right: 0 };
  };
  let lines: Line[];
  if (run.paragraphLineSlots.length > 0) {
    lines = run.paragraphLineSlots.map((slot, i) => ({
      slot: i,
      pieces: slot.mergedFromPtrs.map((ptr, k) => ({
        ptr,
        text: slot.mergedFromTexts[k] ?? "",
        start: slot.startChar + (slot.mergedFromCharStarts[k] ?? 0),
        bounds: slot.mergedFromBounds[k] ?? boundsOf(ptr),
      })),
    }));
  } else {
    const parallel =
      run.mergedFromPtrs.length > 0 &&
      run.mergedFromTexts.length === run.mergedFromPtrs.length &&
      run.mergedFromCharStarts.length === run.mergedFromPtrs.length;
    const own = parallel
      ? run
      : piecesFromObjects(
          m,
          page.pagePtr,
          collectMemberPtrs(run).filter(Boolean),
          run.text,
        );
    if (!own) return null;
    const byLine = new Map<number, Piece[]>();
    own.mergedFromPtrs.forEach((ptr, k) => {
      const start = own.mergedFromCharStarts[k] ?? 0;
      const lineIndex = run.text.slice(0, start).split("\n").length - 1;
      const pieces = byLine.get(lineIndex) ?? [];
      pieces.push({
        ptr,
        text: own.mergedFromTexts[k] ?? "",
        start,
        bounds: (parallel && run.mergedFromBounds[k]) || boundsOf(ptr),
      });
      byLine.set(lineIndex, pieces);
    });
    lines = [...byLine.keys()]
      .sort((a, b) => a - b)
      .map((key) => ({ slot: -1, pieces: byLine.get(key)! }));
  }
  const spelled = lines.every((line) =>
    line.pieces.every(
      (piece) =>
        run.text.slice(piece.start, piece.start + piece.text.length) ===
        piece.text,
    ),
  );
  return spelled ? lines : null;
}

/** Each stretch of the run's text drawn in one font, by the font of the piece drawing it; a space takes the font before it. */
function fontStretchesOf(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
): FontStretch[] {
  const m = doc.module;
  const lines = isScanRun(run) || run.scanEdit ? null : linesOf(doc, page, run);
  const fontAt = new Array<number>(run.text.length).fill(0);
  for (const line of lines ?? [])
    for (const piece of line.pieces) {
      const font = piece.ptr ? m.FPDFTextObj_GetFont(piece.ptr) : 0;
      for (let c = 0; c < piece.text.length; c++)
        if (piece.start + c < fontAt.length) fontAt[piece.start + c] = font;
    }
  for (let c = 1; c < fontAt.length; c++) fontAt[c] ||= fontAt[c - 1];
  for (let c = fontAt.length - 2; c >= 0; c--) fontAt[c] ||= fontAt[c + 1];
  const runFont = documentFontHandle(run.fontId);
  const idOf = fontIdNamer(doc);
  const stretches: FontStretch[] = [];
  for (let c = 0; c < fontAt.length;) {
    const font = fontAt[c];
    let end = c + 1;
    while (end < fontAt.length && fontAt[end] === font) end++;
    stretches.push({
      start: c,
      end,
      fontId: !font || font === runFont ? run.fontId : idOf(font),
    });
    c = end;
  }
  return stretches;
}

/**
 * The fonts drawing the selected characters of `run`, one entry per font,
 * spaces left out unless nothing else is selected.
 */
export function rangeFontIds(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  range: TextRange,
): string[] {
  const stretches = fontStretchesOf(doc, page, run).filter(
    (s) => s.end > range.start && s.start < range.end,
  );
  const inked = stretches.filter((s) =>
    /\S/.test(
      run.text.slice(
        Math.max(s.start, range.start),
        Math.min(s.end, range.end),
      ),
    ),
  );
  return [
    ...new Set((inked.length > 0 ? inked : stretches).map((s) => s.fontId)),
  ];
}

/** The selected stretches of `run`, each with the font that draws it, spaces left with their neighbours. */
export function selectedFontStretches(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  range: TextRange,
): FontStretch[] {
  return fontStretchesOf(doc, page, run)
    .map((s) => ({
      ...s,
      start: Math.max(s.start, range.start),
      end: Math.min(s.end, range.end),
    }))
    .filter(
      (s) => s.end > s.start && /\S/.test(run.text.slice(s.start, s.end)),
    );
}

/** Names fonts as {@link fontIdOf} does, each font once. */
function fontIdNamer(doc: EditorDocument): (font: number) => string {
  const names = new Map<number, string>();
  return (font) => {
    let name = names.get(font);
    if (name === undefined) names.set(font, (name = fontIdOf(doc, font)));
    return name;
  };
}

/** The fontId a font a run is drawn in goes by, as the reader or a font change would name it. */
function fontIdOf(doc: EditorDocument, font: number): string {
  const device = deviceFamilyOf(doc, font);
  if (device) return deviceFontId(device);
  const read = documentFontIdAt(font);
  if (read) return read;
  const name = stripSubsetTag(readFontName(doc.module, font) ?? "");
  if (name && nearestStandardFont(name) === name) return base14FontId(name);
  noteDocumentFontStyle(doc.module, font);
  return documentFontIdAt(font) ?? `pdf:${font}:${name}`;
}

function fontIdOfFace(face: string): string {
  if (documentFontHandle(face)) return face;
  return nearestStandardFont(face) === face
    ? base14FontId(face)
    : deviceFontId(face);
}

function targetOf(face: string): Target {
  const handle = documentFontHandle(face);
  return handle
    ? { fontPtr: handle, fallbackFamily: fallbackFamilyFor(face) }
    : { fontPtr: 0, fallbackFamily: face };
}

function facesDraw(
  doc: EditorDocument,
  page: Page,
  face: string,
  target: Target,
): (ch: string) => boolean {
  if (target.fontPtr)
    return (ch) =>
      charcodesResolveFully(
        doc.module,
        target.fontPtr,
        ch,
        page.pagePtr,
        doc.docPtr,
      );
  const covers = familyCoverage(doc, face);
  return covers ? (ch) => covers(ch.codePointAt(0)!) : () => true;
}

function touches(piece: Piece, targets: ReadonlyMap<number, Target>): boolean {
  for (let c = 0; c < piece.text.length; c++)
    if (targets.has(piece.start + c)) return true;
  return false;
}

/** Unrotated, unslanted and scaled alike both ways, as a redrawn word is: a word processor's 0.2% stretch is within that. */
function upright(matrix: Float32Array): boolean {
  const [a, b, c, d] = matrix;
  return (
    a > 0 &&
    Math.abs(b) < 1e-3 * a &&
    Math.abs(c) < 1e-3 * a &&
    Math.abs(a - d) < 0.01 * a
  );
}

function updateRunModel(
  run: TextRun,
  lines: readonly Line[],
  redrawn: ReadonlyMap<number, Piece[]>,
): void {
  for (const line of lines) {
    if (line.slot < 0) continue;
    const slot = run.paragraphLineSlots[line.slot];
    slot.mergedFromPtrs = line.pieces.map((p) => p.ptr);
    slot.mergedFromTexts = line.pieces.map((p) => p.text);
    slot.mergedFromBounds = line.pieces.map((p) => ({ ...p.bounds }));
    slot.mergedFromCharStarts = line.pieces.map(
      (p) => p.start - slot.startChar,
    );
  }
  const all = lines.flatMap((line) => line.pieces);
  const own = run.paragraphLineSlots.length > 0 ? lines[0].pieces : all;
  run.mergedFromPtrs = own.map((p) => p.ptr);
  run.mergedFromTexts = own.map((p) => p.text);
  run.mergedFromBounds = own.map((p) => ({ ...p.bounds }));
  const ownStart = run.paragraphLineSlots[0]?.startChar ?? 0;
  run.mergedFromCharStarts = own.map((p) => p.start - ownStart);
  if (
    run.paragraphLineSlots.length > 0 ||
    run.paragraphLeafPtrs.length > 0 ||
    run.paragraphMemberPtrs.length > 0
  ) {
    run.paragraphLeafPtrs = all.map((p) => p.ptr);
    run.paragraphLeafContainers = all.map(() => 0);
  }
  const replaced = (ptr: number) => redrawn.get(ptr)?.[0]?.ptr ?? ptr;
  run.paragraphMemberPtrs = run.paragraphMemberPtrs.map(replaced);
  run.pdfiumObjPtr = replaced(run.pdfiumObjPtr);
}

function snapshotRun(run: TextRun): RunSnapshot {
  return {
    bounds: { ...run.bounds },
    pdfiumObjPtr: run.pdfiumObjPtr,
    mergedFromPtrs: [...run.mergedFromPtrs],
    mergedFromTexts: [...run.mergedFromTexts],
    mergedFromBounds: run.mergedFromBounds.map((b) => ({ ...b })),
    mergedFromCharStarts: [...run.mergedFromCharStarts],
    paragraphMemberPtrs: [...run.paragraphMemberPtrs],
    paragraphLeafPtrs: [...run.paragraphLeafPtrs],
    paragraphLeafContainers: [...run.paragraphLeafContainers],
    paragraphLineSlots: run.paragraphLineSlots.map(cloneParagraphLineSlot),
  };
}

function restoreRun(run: TextRun, snap: RunSnapshot): void {
  run.bounds = { ...snap.bounds };
  run.pdfiumObjPtr = snap.pdfiumObjPtr;
  run.mergedFromPtrs = [...snap.mergedFromPtrs];
  run.mergedFromTexts = [...snap.mergedFromTexts];
  run.mergedFromBounds = snap.mergedFromBounds.map((b) => ({ ...b }));
  run.mergedFromCharStarts = [...snap.mergedFromCharStarts];
  run.paragraphMemberPtrs = [...snap.paragraphMemberPtrs];
  run.paragraphLeafPtrs = [...snap.paragraphLeafPtrs];
  run.paragraphLeafContainers = [...snap.paragraphLeafContainers];
  run.paragraphLineSlots = snap.paragraphLineSlots.map(cloneParagraphLineSlot);
}

function cannotRestyleMessage(): string {
  return i18n.t(
    "pdfTextEditor.fontPicker.needsShaping",
    "The editor can't yet redraw this script's joined letters and vowel signs correctly, so that text was left in its current font.",
  );
}

function missingGlyphsMessage(): string {
  return i18n.t(
    "pdfTextEditor.fontPicker.missingGlyphs",
    "This font is missing some of the selected characters, and they could not be kept in their current font. The text was left unchanged.",
  );
}

/**
 * The run and the characters of it the selection holds, when they leave some
 * of its letters out; null when nothing within a run is selected or the whole
 * of one is, which a change applies to as a box.
 */
export function selectedPartOfRun(
  doc: EditorDocument | null,
  selection: { runIds: readonly string[]; textRange: TextRange | null },
): SelectedPart | null {
  const range = selection.textRange;
  if (!doc || !range || selection.runIds.length !== 1) return null;
  for (const page of doc.loadedPages()) {
    const run = page.findRun(selection.runIds[0]);
    if (!run) continue;
    const start = Math.max(0, Math.min(range.start, run.text.length));
    const end = Math.max(start, Math.min(range.end, run.text.length));
    if (end === start) return null;
    const outside = run.text.slice(0, start) + run.text.slice(end);
    return /\S/.test(outside) ? { page, run, range: { start, end } } : null;
  }
  return null;
}
