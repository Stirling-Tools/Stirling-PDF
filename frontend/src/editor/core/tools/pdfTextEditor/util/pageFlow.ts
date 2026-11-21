import {
  detectSaveRisks,
  locksPages,
} from "@editor/tools/pdfTextEditor/util/documentRisks";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { softStartsOf } from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  familyOf,
  isDeviceFontId,
  isDocumentFontId,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetLineSpacingCommand } from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { helveticaVariantFor } from "@editor/tools/pdfTextEditor/util/helveticaVariant";
import {
  focusRunWhenPainted,
  holdKeystrokes,
} from "@editor/tools/pdfTextEditor/util/dom";

// The bottom margin text flows at, as a share of the page height, never less than half an inch.
const BOTTOM_MARGIN_SHARE = 0.06;
const MIN_MARGIN_PT = 36;
const MAX_TOP_MARGIN_PT = 96;
// How far below the baseline a line's descenders reach, in ems.
const DESCENT_EM = 0.25;

/** The lowest a line's descenders may sit before the line belongs on the next page. */
export function bottomLimit(page: Page): number {
  const { cropBottom, cropHeight } = page.display;
  return cropBottom + Math.max(MIN_MARGIN_PT, cropHeight * BOTTOM_MARGIN_SHARE);
}

function baselinesOf(run: TextRun): number[] {
  return run.paragraphLineSlots.length > 0
    ? run.paragraphLineSlots.map((slot) => slot.baselineY)
    : [run.matrix.f];
}

/** The lowest point of the run's last line. */
export function runBottom(run: TextRun): number {
  return Math.min(...baselinesOf(run)) - run.fontSize * DESCENT_EM;
}

interface Split {
  keep: string;
  overflow: string;
}

// The lines that still fit above the margin, and the rest as one paragraph
// text: soft wraps become spaces so the next page re-wraps them.
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
  return { keep: lines.slice(0, first).join("\n"), overflow };
}

// Flowed lines are placed in raw page space, which a turned page shows
// sideways.
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
  const top = page.display.cropBottom + page.display.cropHeight;
  const highest = Math.max(
    ...page.runs.map((run) => run.bounds.y + run.bounds.height),
    top - MIN_MARGIN_PT,
  );
  return Math.min(MAX_TOP_MARGIN_PT, Math.max(MIN_MARGIN_PT, top - highest));
}

// The overflow is drawn with a standard font, which a device family is not.
function base14Family({ fontId }: TextRun): string {
  if (fontId.startsWith("base14:")) return fontId.slice("base14:".length);
  return isDeviceFontId(fontId) ? "Helvetica" : helveticaVariantFor(fontId);
}

/**
 * When an edit pushed run `runId`'s last line past the bottom margin, moves
 * the lines that no longer fit to the top of the next page: a blank one
 * that follows, else a new page added after this one. The move is one undo
 * step and the caret follows the text. True when it moved anything.
 */
export function flowPastBottom(
  store: EditorStore,
  pageIndex: number,
  runId: string,
  bottomBefore: number,
): boolean {
  const doc = store.document;
  const page = doc?.page(pageIndex);
  const run = page?.findRun(runId);
  if (!doc || !page || !run || run.locked) return false;
  const { crossedRuns, pendingPageAdds } = flowState(doc);
  if (pendingPageAdds.has(runId)) {
    addPageWhenIdle(store, doc, pageIndex, runId);
    return true;
  }
  const limit = bottomLimit(page);
  if (runBottom(run) >= limit) {
    crossedRuns.delete(runId);
    return false;
  }
  // Only text an edit carried past the margin flows: a footer the page already
  // drew there stays put.
  if (bottomBefore >= limit) crossedRuns.add(runId);
  if (!crossedRuns.has(runId)) return false;
  const split = splitAtMargin(page, run);
  if (!split) return false;

  const nextIndex = pageIndex + 1;
  if (nextIndex < doc.pageCount) ensurePageRead(store, nextIndex);
  const next = nextIndex < doc.pageCount ? doc.page(nextIndex) : null;
  if (!next || !takesFlow(next)) {
    addPageWhenIdle(store, doc, pageIndex, runId);
    return true;
  }
  crossedRuns.delete(runId);
  moveOverflow(store, page, run, next, split);
  return true;
}

interface FlowState {
  /** Runs an edit has carried past the bottom margin that have not flowed yet. */
  crossedRuns: Set<string>;
  pendingPageAdds: Map<string, ReturnType<typeof setTimeout>>;
}

// Per document: read-back run ids repeat from one document to the next.
const flowStates = new WeakMap<EditorDocument, FlowState>();

function flowState(doc: EditorDocument): FlowState {
  let state = flowStates.get(doc);
  if (!state) {
    state = { crossedRuns: new Set(), pendingPageAdds: new Map() };
    flowStates.set(doc, state);
  }
  return state;
}

// A signed, encrypted or XFA document refuses page changes; text past the
// margin there stays where it is typed rather than raising that refusal.
function canAddPages(doc: EditorDocument): boolean {
  return !locksPages(detectSaveRisks(doc));
}

// Adding a page reopens the document, which holds typing until it has, so it
// waits for a pause in the typing that needs it.
const PAGE_ADD_IDLE_MS = 900;

function addPageWhenIdle(
  store: EditorStore,
  doc: EditorDocument,
  pageIndex: number,
  runId: string,
) {
  const { pendingPageAdds } = flowState(doc);
  clearTimeout(pendingPageAdds.get(runId));
  pendingPageAdds.set(
    runId,
    setTimeout(() => {
      pendingPageAdds.delete(runId);
      if (store.document !== doc || !canAddPages(doc)) return;
      const page = doc.page(pageIndex);
      const run = page?.findRun(runId);
      const split = page && run ? splitAtMargin(page, run) : null;
      const session = currentEditorSession();
      if (!split || !session) return;
      // The saved file keeps the overflowing lines; once it reopens with the
      // new blank page after this one, the same run flows into it.
      const firstOverflowLine = split.overflow.split("\n")[0];
      const typedMeanwhile = holdKeystrokes();
      void session
        .changeDocument({ kind: "addPage", after: pageIndex })
        .finally(() =>
          flowAfterReload(
            store,
            pageIndex,
            firstOverflowLine,
            typedMeanwhile(),
          ),
        );
    }, PAGE_ADD_IDLE_MS),
  );
}

function moveOverflow(
  store: EditorStore,
  page: Page,
  run: TextRun,
  next: Page,
  split: Split,
  typedMeanwhile = "",
): void {
  const width = run.wrapWidthPt ?? run.bounds.width;
  const x =
    (run.paragraphLineSlots[0]?.matrixE ?? run.bounds.x) -
    page.display.cropLeft +
    next.display.cropLeft;
  const y =
    next.display.cropBottom +
    next.display.cropHeight -
    topMargin(page) -
    run.fontSize;
  let insertedId: string | null = null;
  store.batchNow(() => {
    store.dispatch(
      new EditTextCommand({
        pageIndex: page.index,
        runId: run.id,
        nextText: split.keep,
        explicit: true,
      }),
    );
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
    if (run.paragraphLineHeight > 0 && run.fontSize > 0)
      store.dispatch(
        new SetLineSpacingCommand({
          pageIndex: next.index,
          runId: insertedId,
          factor: run.paragraphLineHeight / run.fontSize,
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
  if (!insertedId) return;
  store.selection.selectOne(insertedId);
  currentEditorSession()?.revealPage(next.index);
  focusRunWhenPainted(insertedId, true, typedMeanwhile);
}

function flowAfterReload(
  store: EditorStore,
  pageIndex: number,
  firstLine: string,
  typedMeanwhile: string,
) {
  const doc = store.document;
  if (!doc || pageIndex + 1 >= doc.pageCount) return;
  ensurePageRead(store, pageIndex);
  const page = doc.page(pageIndex);
  const limit = bottomLimit(page);
  const run = page.runs.find(
    (candidate) =>
      runBottom(candidate) < limit &&
      Math.max(...baselinesOf(candidate)) > limit &&
      candidate.text.split("\n").some((line) => line.includes(firstLine)),
  );
  if (!run) return;
  ensurePageRead(store, pageIndex + 1);
  const next = doc.page(pageIndex + 1);
  const split = splitAtMargin(page, run);
  if (split && takesFlow(next))
    moveOverflow(store, page, run, next, split, typedMeanwhile);
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
