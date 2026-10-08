import { useMemo } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { ensurePageRead } from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { EditTextCommand } from "@app/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@app/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/commands/InsertTextCommand";
import { InsertTableCommand } from "@app/tools/pdfTextEditor/commands/InsertTableCommand";
import { MoveShapeCommand } from "@app/tools/pdfTextEditor/commands/MoveShapeCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/commands/SetImageTransformCommand";
import { SetLockCommand } from "@app/tools/pdfTextEditor/commands/SetLockCommand";

/** The PageView callbacks, shared by every surface that hosts editable pages. */
export function usePageViewHandlers(store: EditorStore) {
  return useMemo(
    () => ({
      onSelectRun: (runId: string, shiftKey: boolean) => {
        if (shiftKey) store.selection.toggle(runId);
        else store.selection.selectOne(runId);
      },
      onSelectImage: (imageId: string) => store.selection.selectImage(imageId),
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
      },
      onMoveRun: (pageIndex: number, runId: string, dx: number, dy: number) => {
        store.dispatch(new MoveTextRunCommand({ pageIndex, runId, dx, dy }));
      },
      onWrapRun: (pageIndex: number, runId: string, maxWidthPt: number) => {
        store.dispatch(new ReflowWrapCommand({ pageIndex, runId, maxWidthPt }));
      },
      onResizeRun: (pageIndex: number, runId: string, widthPt: number) => {
        store.dispatch(
          new ReflowWrapCommand({
            pageIndex,
            runId,
            maxWidthPt: widthPt,
            explicit: true,
          }),
        );
      },
      onPageClick: (pageIndex: number, pageX: number, pageY: number) => {
        const { mode } = store.getState();
        if (mode === "addTable") {
          store.dispatch(
            new InsertTableCommand({
              pageIndex,
              x: pageX,
              y: pageY,
              width: 360,
              height: 24 * 3,
              rows: 3,
              cols: 3,
            }),
          );
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
        if (cmd.insertedRunId) {
          store.selection.selectOne(cmd.insertedRunId);
        }
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
      onUnlock: (
        pageIndex: number,
        target: { runId: string } | { imageId: string },
      ) => {
        store.dispatch(
          new SetLockCommand({ pageIndex, ...target, locked: false }),
        );
      },
    }),
    [store],
  );
}
