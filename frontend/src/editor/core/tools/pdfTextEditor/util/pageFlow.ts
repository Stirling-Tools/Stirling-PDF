import {
  detectSaveRisks,
  locksPages,
} from "@editor/tools/pdfTextEditor/util/documentRisks";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { softStartsOf } from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  familyOf,
  isDeviceFontId,
  isDocumentFontId,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import {
  lineSpacingFactor,
  SetLineSpacingCommand,
} from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import {
  focusRunWhenPainted,
  holdKeystrokes,
} from "@editor/tools/pdfTextEditor/util/dom";
import { pageChangeCommand } from "@editor/tools/pdfTextEditor/util/documentChanges";

const BOTTOM_MARGIN_SHARE = 0.06;
const MIN_MARGIN_PT = 36;
const MAX_TOP_MARGIN_PT = 96;
const DESCENT_EM = 0.25;

export function bottomLimit(page: Page): number {
  const { cropBottom, cropHeight } = page.display;
  return cropBottom + Math.max(MIN_MARGIN_PT, cropHeight * BOTTOM_MARGIN_SHARE);
}

function baselinesOf(run: TextRun): number[] {
  if (run.paragraphLineSlots.length > 0)
    return run.paragraphLineSlots.map((slot) => slot.baselineY);
  return run.paragraphMemberFs.length > 0
    ? [...run.paragraphMemberFs]
    : [run.matrix.f];
}

export function runBottom(run: TextRun): number {
  return Math.min(...baselinesOf(run)) - run.fontSize * DESCENT_EM;
}

interface Split {
  keep: string;
  overflow: string;
  softBreak: boolean;
}

function splitAtMargin(page: Page, run: TextRun): Split | null {
  const limit = bottomLimit(page);
  const baselines = baselinesOf(run);
  const lines = run.text.split("\n");
  if (lines.length !== baselines.length) return null;
  const first = baselines.findIndex(
    (baseline) => baseline - run.fontSize * DESCENT_EM < limit,
  );
  if (first <= 0) return null;
  const soft = softStartsOf(run);
  const overflow = lines
    .slice(first)
    .map((line, i) =>
      i === 0 ? line : `${soft[first + i] ? " " : "\n"}${line}`,
    )
    .join("");
  if (!overflow.trim()) return null;
  return {
    keep: lines.slice(0, first).join("\n"),
    overflow,
    softBreak: soft[first] ?? false,
  };
}

function takesFlow(page: Page): boolean {
  return isBlank(page) && page.display.rotate === 0;
}

function isBlank(page: Page): boolean {
  return (
    page.runs.length === 0 &&
    page.images.length === 0 &&
    page.shapes.length === 0
  );
}

function topMargin(page: Page): number {
  const top = page.display.cropTop;
  const highest = Math.max(
    ...page.runs.map((run) => run.bounds.y + run.bounds.height),
    top - MIN_MARGIN_PT,
  );
  return Math.min(MAX_TOP_MARGIN_PT, Math.max(MIN_MARGIN_PT, top - highest));
}

function base14Family({ fontId }: TextRun): string {
  if (fontId.startsWith("base14:")) return fontId.slice("base14:".length);
  return isDeviceFontId(fontId) ? "Helvetica" : helveticaVariantFor(fontId);
}

export function flowPastBottom(
  store: EditorStore,
  pageIndex: number,
  runId: string,
  bottomBefore: number,
): FlowResult {
  const doc = store.document;
  const page = doc?.page(pageIndex);
  const run = page?.findRun(runId);
  if (!doc || !page || !run || run.locked || run.textReadOnly) return "none";
  const { crossedRuns } = flowState(doc);
  const limit = bottomLimit(page);
  if (runBottom(run) >= limit) {
    crossedRuns.delete(runId);
    return "none";
  }
  if (bottomBefore >= limit) crossedRuns.add(runId);
  if (!crossedRuns.has(runId)) return "none";
  const split = splitAtMargin(page, run);
  if (!split) return "none";

  const nextIndex = doc.nextPage(pageIndex);
  if (nextIndex !== null) ensurePageRead(store, nextIndex);
  const following = nextIndex !== null ? doc.page(nextIndex) : null;
  const continued = following && continuationOn(doc, following, runId);
  if (following && continued) {
    if (continued.locked || continued.textReadOnly) return "none";
    if (!prependOverflow(store, page, run, following, continued, split))
      return "none";
    crossedRuns.delete(runId);
    return "moved";
  }
  if (following && takesFlow(following)) {
    const result = flowInto(store, page, run, following, split);
    if (result === "moved") crossedRuns.delete(runId);
    return result;
  }
  if (!canAddPages(doc)) return "none";
  const outcome: { result: FlowResult } = { result: "none" };
  store.batchNow(() => {
    const { command, focusPage } = pageChangeCommand(doc, {
      kind: "addPage",
      after: pageIndex,
    });
    store.dispatch(command);
    ensurePageRead(store, focusPage);
    outcome.result = flowInto(store, page, run, doc.page(focusPage), split);
  });
  if (outcome.result === "moved") crossedRuns.delete(runId);
  return outcome.result;
}

function flowInto(
  store: EditorStore,
  page: Page,
  run: TextRun,
  next: Page,
  split: Split,
): FlowResult {
  let result: FlowResult = "none";
  store.batchNow(() => {
    const inserted = moveOverflow(store, page, run, next, split);
    if (!inserted) return;
    flowState(store.document!).continuations.set(run.id, {
      pageIndex: next.index,
      runId: inserted,
      softBreak: split.softBreak,
    });
    flowPastBottom(store, next.index, inserted, Number.POSITIVE_INFINITY);
    result = "moved";
  });
  return result;
}

function continuationOn(
  doc: EditorDocument,
  next: Page,
  runId: string,
): TextRun | null {
  const known = flowState(doc).continuations.get(runId);
  if (!known || known.pageIndex !== next.index) return null;
  return next.findRun(known.runId) ?? null;
}

function prependOverflow(
  store: EditorStore,
  page: Page,
  run: TextRun,
  next: Page,
  continued: TextRun,
  split: Split,
): boolean {
  const bottomBefore = runBottom(continued);
  const known = flowState(store.document!).continuations.get(run.id);
  const join = known?.softBreak ? " " : "\n";
  store.batchNow(() => {
    store.dispatch(
      new EditTextCommand({
        pageIndex: page.index,
        runId: run.id,
        nextText: split.keep,
        explicit: true,
      }),
    );
    store.dispatch(
      new EditTextCommand({
        pageIndex: next.index,
        runId: continued.id,
        nextText: `${split.overflow}${join}${continued.text}`,
        explicit: true,
      }),
    );
    const wrapWidth = next.findRun(continued.id)?.wrapWidthPt;
    if (wrapWidth)
      store.dispatch(
        new ReflowWrapCommand({
          pageIndex: next.index,
          runId: continued.id,
          maxWidthPt: wrapWidth,
          explicit: true,
        }),
      );
    store.dispatch(new SetFlowBoundaryCommand(run.id, split.softBreak));
    const heldKeys = holdKeystrokes();
    store.selection.selectOne(continued.id);
    focusRunWhenPainted(
      continued.id,
      true,
      heldKeys,
      split.overflow.length,
      next.index,
    );
    flowPastBottom(store, next.index, continued.id, bottomBefore);
  });
  return true;
}

export type FlowResult = "moved" | "none";

interface FlowState {
  crossedRuns: Set<string>;
  continuations: Map<
    string,
    { pageIndex: number; runId: string; softBreak: boolean }
  >;
}

const flowStates = new WeakMap<EditorDocument, FlowState>();

function flowState(doc: EditorDocument): FlowState {
  let state = flowStates.get(doc);
  if (!state) {
    state = { crossedRuns: new Set(), continuations: new Map() };
    flowStates.set(doc, state);
  }
  return state;
}

class SetFlowBoundaryCommand implements Command {
  readonly type = "set-flow-boundary";
  private readonly runId: string;
  private readonly softBreak: boolean;
  private previous: boolean | null = null;

  constructor(runId: string, softBreak: boolean) {
    this.runId = runId;
    this.softBreak = softBreak;
  }

  apply(doc: EditorDocument): void {
    this.previous = this.setSoftBreak(doc, this.softBreak);
  }

  revert(doc: EditorDocument): void {
    if (this.previous !== null) this.setSoftBreak(doc, this.previous);
  }

  private setSoftBreak(
    doc: EditorDocument,
    softBreak: boolean,
  ): boolean | null {
    const { continuations } = flowState(doc);
    const known = continuations.get(this.runId);
    if (!known) return null;
    continuations.set(this.runId, { ...known, softBreak });
    return known.softBreak;
  }
}

function canAddPages(doc: EditorDocument): boolean {
  return !doc.saving && !locksPages(detectSaveRisks(doc));
}

function moveOverflow(
  store: EditorStore,
  page: Page,
  run: TextRun,
  next: Page,
  split: Split,
): string | null {
  const sourceX =
    (run.paragraphLineSlots[0]?.matrixE ?? run.bounds.x) -
    page.display.cropLeft +
    next.display.cropLeft;
  const x =
    next.display.cropRight - MIN_MARGIN_PT > sourceX
      ? sourceX
      : next.display.cropLeft + MIN_MARGIN_PT;
  if (next.display.cropRight - MIN_MARGIN_PT <= x) return null;
  const y =
    next.display.cropBottom +
    next.display.cropHeight -
    topMargin(page) -
    run.fontSize;
  const usableWidth = next.display.cropRight - MIN_MARGIN_PT - x;
  const width = Math.min(run.wrapWidthPt ?? usableWidth, usableWidth);
  const spacing = lineSpacingFactor(run.fontSize, run.paragraphLineHeight);
  let insertedId: string | null = null;
  store.batchNow(() => {
    const insert = new InsertTextCommand({
      pageIndex: next.index,
      x,
      y,
      text: split.overflow,
      family: base14Family(run),
      fontSize: run.fontSize,
      fill: run.fill,
    });
    store.dispatch(insert);
    insertedId = insert.insertedRunId;
    if (!insertedId) return;
    store.dispatch(
      new EditTextCommand({
        pageIndex: page.index,
        runId: run.id,
        nextText: split.keep,
        explicit: true,
      }),
    );
    const originalFamily = isDocumentFontId(run.fontId)
      ? run.fontId
      : familyOf(run.fontId);
    if (originalFamily !== base14Family(run))
      store.dispatch(
        new SetFontFamilyCommand({
          pageIndex: next.index,
          runId: insertedId,
          nextFamily: originalFamily,
        }),
      );
    if (width > 0)
      store.dispatch(
        new ReflowWrapCommand({
          pageIndex: next.index,
          runId: insertedId,
          maxWidthPt: width,
          explicit: true,
        }),
      );
    if (spacing !== null)
      store.dispatch(
        new SetLineSpacingCommand({
          pageIndex: next.index,
          runId: insertedId,
          factor: spacing,
        }),
      );
    if (run.align || run.underline || run.listIndent > 0)
      store.dispatch(
        new SetParagraphFormatCommand({
          pageIndex: next.index,
          runIds: [insertedId],
          align: run.align ?? undefined,
          underline: run.underline,
          listIndent: run.listIndent,
        }),
      );
  });
  if (!insertedId) return null;
  const heldKeys = holdKeystrokes();
  store.selection.selectOne(insertedId);
  focusRunWhenPainted(insertedId, true, heldKeys, undefined, next.index);
  return insertedId;
}

export async function flowingSelection<T>(
  store: EditorStore,
  change: () => Promise<T>,
): Promise<T> {
  const doc = store.document;
  const ids = new Set(store.selection.value.runIds);
  const before = (doc?.loadedPages() ?? []).flatMap((page) =>
    page.runs
      .filter((run) => ids.has(run.id))
      .map((run) => ({ page: page.index, id: run.id, bottom: runBottom(run) })),
  );
  const result = await change();
  if (store.document === doc)
    for (const run of before)
      flowPastBottom(store, run.page, run.id, run.bottom);
  return result;
}
