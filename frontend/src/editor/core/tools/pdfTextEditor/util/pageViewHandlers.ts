import i18n from "i18next";
import { alert } from "@editor/components/toast";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  scanBlockOffInk,
  wrapScanText,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { resizeRunCommand } from "@editor/tools/pdfTextEditor/commands/resizeRun";
import { MoveShapeCommand } from "@editor/tools/pdfTextEditor/commands/MoveShapeCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { InsertTableCommand } from "@editor/tools/pdfTextEditor/commands/InsertTableCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@editor/tools/pdfTextEditor/commands/SetImageTransformCommand";
import { SetLockCommand } from "@editor/tools/pdfTextEditor/commands/SetLockCommand";
import {
  editorContextMenu,
  type ContextMenuEvent,
  type TableHit,
} from "@editor/tools/pdfTextEditor/store/contextMenu";
import { reviewMode } from "@editor/tools/pdfTextEditor/store/reviewMode";
import type { TextRange } from "@editor/tools/pdfTextEditor/types";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const cache = new WeakMap<EditorStore, PageViewHandlers>();

/** The cell of an editable table under a page point, if any. */
function tableCellAt(
  store: EditorStore,
  at: { pageIndex: number; x: number; y: number },
): TableHit | undefined {
  const page = store.getState().pages.find((p) => p.pageIndex === at.pageIndex);
  for (const table of page?.tables ?? []) {
    const col = table.colEdges.findIndex(
      (edge, i) =>
        i < table.cols && at.x >= edge && at.x < table.colEdges[i + 1],
    );
    // Rows run top to bottom, so their edges fall in y.
    const row = table.rowEdges.findIndex(
      (edge, i) =>
        i < table.rows && at.y <= edge && at.y > table.rowEdges[i + 1],
    );
    if (col >= 0 && row >= 0) {
      return { pageIndex: at.pageIndex, tableId: table.id, row, col };
    }
  }
  return undefined;
}

/**
 * The page views' handlers, made once per store: PageView is memoised, so a
 * handler made per render would re-render every page on any store change.
 * They read the store when called, never state captured at render.
 */
export function pageViewHandlers(store: EditorStore): PageViewHandlers {
  let handlers = cache.get(store);
  if (!handlers) {
    handlers = createHandlers(store);
    cache.set(store, handlers);
  }
  return handlers;
}

type PageViewHandlers = ReturnType<typeof createHandlers>;

function createHandlers(store: EditorStore) {
  return {
    onSelectRun: (runId: string, shiftKey: boolean) => {
      if (shiftKey) store.selection.toggle(runId);
      else store.selection.selectOne(runId);
    },
    onSelectRunText: (runId: string, range: TextRange | null) =>
      store.selection.setTextRange(runId, range),
    onSelectImage: (imageId: string, extend: boolean) => {
      if (extend) store.selection.toggleImage(imageId);
      else store.selection.selectImage(imageId);
    },
    onSelectFormField: (annotationId: string) =>
      store.selection.selectFormField(annotationId),
    onSelectShape: (shapeId: string, extend: boolean) => {
      if (extend) store.selection.toggleShape(shapeId);
      else store.selection.selectShape(shapeId);
    },
    onMoveShape: (
      pageIndex: number,
      shapeId: string,
      dx: number,
      dy: number,
    ) => {
      store.dispatch(new MoveShapeCommand({ pageIndex, shapeId, dx, dy }));
      store.selection.selectShape(shapeId);
    },
    onEditRun: (pageIndex: number, runId: string, nextText: string) => {
      // contentEditable can fire several input events per keystroke burst.
      const current = store.document?.page(pageIndex).findRun(runId);
      if (current && current.text === nextText) return;
      store.dispatch(new EditTextCommand({ pageIndex, runId, nextText }));
      const doc = store.document;
      const run = doc?.page(pageIndex).findRun(runId);
      if (doc && run && scanBlockOffInk(doc, run))
        alert({
          alertType: "warning",
          title: i18n.t(
            "pdfTextEditor.error.scanOffInk",
            "Can't edit this text: its recognised words don't line up with the scan. Run OCR again.",
          ),
          expandable: false,
        });
    },
    onMeasureRun: (pageIndex: number, runId: string) =>
      store.measureRun(pageIndex, runId),
    onMoveRun: (pageIndex: number, runId: string, dx: number, dy: number) => {
      store.dispatch(new MoveTextRunCommand({ pageIndex, runId, dx, dy }));
    },
    onWrapRun: (
      pageIndex: number,
      runId: string,
      maxWidthPt: number,
      keepClearBelow?: boolean,
    ): string | null | undefined => {
      const doc = store.document;
      const page = doc?.page(pageIndex);
      const run = page?.findRun(runId);
      if (!doc || !page || !run) return undefined;
      const wrapped = wrapScanText(doc, page, run, maxWidthPt);
      if (wrapped !== null) {
        if (wrapped !== run.text)
          store.dispatch(
            new EditTextCommand({ pageIndex, runId, nextText: wrapped }),
          );
        return page.findRun(runId)?.text ?? wrapped;
      }
      const reflow = new ReflowWrapCommand({
        pageIndex,
        runId,
        maxWidthPt,
        keepClearBelow,
      });
      store.dispatch(reflow);
      if (reflow.refusedForSpaceBelow) return null;
      return page.findRun(runId)?.text ?? run.text;
    },
    onResizeRun: (pageIndex: number, runId: string, widthPt: number) => {
      const doc = store.document;
      const cmd = doc && resizeRunCommand(doc, pageIndex, runId, widthPt);
      if (cmd) store.dispatch(cmd);
    },
    onPageClick: (pageIndex: number, pageX: number, pageY: number) => {
      const { mode } = store.getState();
      if (mode === "addTable") {
        const cmd = new InsertTableCommand({
          pageIndex,
          x: pageX,
          y: pageY,
          width: 360,
          height: 24 * 3,
          rows: 3,
          cols: 3,
        });
        store.dispatch(cmd);
        store.setMode("select");
        return;
      }
      if (mode !== "addText") return;
      const cmd = new InsertTextCommand({
        pageIndex,
        x: pageX,
        y: pageY,
        text: "New text",
      });
      store.dispatch(cmd);
      if (cmd.insertedRunId) store.selection.selectOne(cmd.insertedRunId);
      store.setMode("select");
    },
    onTransformImage: (
      pageIndex: number,
      imageId: string,
      nextBounds: { x: number; y: number; width: number; height: number },
    ) => {
      store.dispatch(
        new SetImageTransformCommand({ pageIndex, imageId, nextBounds }),
      );
    },
    onPageContextMenu: (
      pageIndex: number,
      pageX: number,
      pageY: number,
      event: ContextMenuEvent,
    ) => {
      if (!editorContextMenu.hasHost() || reviewMode.get().reviewing) return;
      const target = event.target as Element;
      // Inside the text being typed the browser's menu stays: it alone offers
      // spelling corrections.
      const editable = target.closest('[contenteditable="true"]');
      const pressed = editorContextMenu.focusedAtPress();
      const focused = pressed === undefined ? document.activeElement : pressed;
      if (editable && focused && editable.contains(focused)) return;
      event.preventDefault();
      const at = { pageIndex, x: pageX, y: pageY };
      const where = {
        clientX: event.clientX,
        clientY: event.clientY,
        table: tableCellAt(store, at),
      };
      const badge = target
        .closest(".pdf-editor-lock-zone")
        ?.querySelector<HTMLElement>('[data-testid^="pdf-editor-unlock-"]');
      if (badge) {
        const id = badge.dataset.testid!.slice("pdf-editor-unlock-".length);
        const page = store.document?.page(pageIndex);
        const isImage = !!page?.images.some((image) => image.id === id);
        editorContextMenu.open({
          kind: "locked",
          clientX: where.clientX,
          clientY: where.clientY,
          pageIndex,
          target: isImage ? { imageId: id } : { runId: id },
        });
        return;
      }
      // Right-clicking an object acts on it: select it unless it already is.
      const selection = store.selection.value;
      const run = target.closest<HTMLElement>("[data-run-id]");
      const image = target.closest<HTMLElement>(
        '[data-testid^="pdf-editor-image-"]',
      );
      const shape = target.closest<HTMLElement>(
        '[data-testid^="pdf-editor-shape-"]',
      );
      if (run) {
        const id = run.dataset.runId!;
        if (!selection.runIds.includes(id)) store.selection.selectOne(id);
      } else if (image) {
        const id = image.dataset.testid!.slice("pdf-editor-image-".length);
        if (!selection.imageIds.includes(id)) store.selection.selectImage(id);
      } else if (shape) {
        const id = shape.dataset.testid!.slice("pdf-editor-shape-".length);
        if (!selection.shapeIds.includes(id)) store.selection.selectShape(id);
      } else {
        store.selection.clear();
        editorContextMenu.open({ kind: "page", ...where, at });
        return;
      }
      editorContextMenu.open({ kind: "objects", ...where, at });
    },
    onUnlock: (
      pageIndex: number,
      target: { runId: string } | { imageId: string },
    ) => {
      store.dispatch(
        new SetLockCommand({ pageIndex, ...target, locked: false }),
      );
    },
    onFirstVisible: (pageIndex: number) => ensurePageRead(store, pageIndex),
    onFirstRendered: (pageIndex: number) => {
      if (pageIndex === 0) store.markFirstPageRendered();
    },
  };
}
