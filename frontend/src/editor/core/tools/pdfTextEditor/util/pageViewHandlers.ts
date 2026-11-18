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
import type { TextRange } from "@editor/tools/pdfTextEditor/types";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const cache = new WeakMap<EditorStore, PageViewHandlers>();

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
    onSelectImage: (imageId: string) => store.selection.selectImage(imageId),
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
    onFirstVisible: (pageIndex: number) => ensurePageRead(store, pageIndex),
    onFirstRendered: (pageIndex: number) => {
      if (pageIndex === 0) store.markFirstPageRendered();
    },
  };
}
