import { useCallback, useMemo } from "react";
import { useSelectionActions } from "@app/tools/pdfTextEditor/v2/hooks/useSelectionActions";
import { deriveToolbarState } from "@app/tools/pdfTextEditor/v2/util/toolbarState";
import {
  ChangeZOrderCommand,
  type ZOrderMode,
} from "@app/tools/pdfTextEditor/v2/commands/ChangeZOrderCommand";
import { EditTextCommand } from "@app/tools/pdfTextEditor/v2/commands/EditTextCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/v2/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/v2/commands/SetImageTransformCommand";
import { SetLockCommand } from "@app/tools/pdfTextEditor/v2/commands/SetLockCommand";
import { AlignParagraphLinesCommand } from "@app/tools/pdfTextEditor/v2/commands/AlignParagraphLinesCommand";
import {
  TransformImageObjectCommand,
  type ImageTransformMode,
} from "@app/tools/pdfTextEditor/v2/commands/TransformImageObjectCommand";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { EditorViewState } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import type { SelectionState } from "@app/tools/pdfTextEditor/v2/types";

type AlignMode = "left" | "center-h" | "right" | "top" | "middle-v" | "bottom";

/**
 * Everything the contextual `Toolbar` needs, derived from the shared
 * `EditorStore`. Lives in a hook (not the sidebar shell) so the toolbar
 * can be rendered by `PageStage` as a bar across the top of the canvas -
 * the workbench mounts PageStage directly, so it can't take props from
 * the shell and must source the handlers from the store itself.
 */
export function useToolbarController(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
) {
  const sel = useSelectionActions(store);

  const onToggleLock = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    const selRuns = new Set(store.selection.value.runIds);
    const selImages = new Set(store.selection.value.imageIds);
    if (selRuns.size === 0 && selImages.size === 0) return;
    let allLocked = true;
    for (const p of doc.loadedPages()) {
      for (const r of p.runs)
        if (selRuns.has(r.id) && !r.locked) allLocked = false;
      for (const im of p.images)
        if (selImages.has(im.id) && !im.locked) allLocked = false;
    }
    const nextLocked = !allLocked;
    for (const p of doc.loadedPages()) {
      for (const r of p.runs)
        if (selRuns.has(r.id) && r.locked !== nextLocked) {
          store.dispatch(
            new SetLockCommand({
              pageIndex: p.index,
              runId: r.id,
              locked: nextLocked,
            }),
          );
        }
      for (const im of p.images)
        if (selImages.has(im.id) && im.locked !== nextLocked) {
          store.dispatch(
            new SetLockCommand({
              pageIndex: p.index,
              imageId: im.id,
              locked: nextLocked,
            }),
          );
        }
    }
  }, [store]);

  const onChangeZOrder = useCallback(
    (mode: ZOrderMode) => {
      const doc = store.document;
      if (!doc) return;
      const selRuns = new Set(store.selection.value.runIds);
      const selImages = new Set(store.selection.value.imageIds);
      if (selRuns.size === 0 && selImages.size === 0) return;
      for (const p of doc.loadedPages()) {
        for (const r of p.runs) {
          if (!selRuns.has(r.id)) continue;
          store.dispatch(
            new ChangeZOrderCommand({ pageIndex: p.index, runId: r.id, mode }),
          );
        }
        for (const im of p.images) {
          if (!selImages.has(im.id)) continue;
          store.dispatch(
            new ChangeZOrderCommand({
              pageIndex: p.index,
              imageId: im.id,
              mode,
            }),
          );
        }
      }
    },
    [store],
  );

  const onAlign = useCallback(
    (mode: AlignMode) => {
      const doc = store.document;
      if (!doc) return;
      const selRuns = new Set(store.selection.value.runIds);
      const selImages = new Set(store.selection.value.imageIds);
      // Single multi-line paragraph + a horizontal mode: align the lines
      // WITHIN that paragraph instead of requiring a 2+ object selection.
      if (
        selRuns.size === 1 &&
        selImages.size === 0 &&
        (mode === "left" || mode === "center-h" || mode === "right")
      ) {
        const runId = [...selRuns][0];
        for (const p of doc.loadedPages()) {
          const run = p.runs.find((r) => r.id === runId);
          if (!run) continue;
          if (AlignParagraphLinesCommand.canAlign(run)) {
            store.dispatch(
              new AlignParagraphLinesCommand({
                pageIndex: p.index,
                runId,
                mode,
              }),
            );
          }
          return;
        }
      }
      if (selRuns.size + selImages.size < 2) return;
      for (const p of doc.loadedPages()) {
        const items: Array<{
          kind: "run" | "image";
          id: string;
          bounds: { x: number; y: number; width: number; height: number };
        }> = [];
        for (const r of p.runs) {
          if (!selRuns.has(r.id)) continue;
          items.push({ kind: "run", id: r.id, bounds: r.bounds });
        }
        for (const im of p.images) {
          if (!selImages.has(im.id)) continue;
          items.push({ kind: "image", id: im.id, bounds: im.bounds });
        }
        if (items.length < 2) continue;
        const lefts = items.map((it) => it.bounds.x);
        const rights = items.map((it) => it.bounds.x + it.bounds.width);
        const bottoms = items.map((it) => it.bounds.y);
        const tops = items.map((it) => it.bounds.y + it.bounds.height);
        const minLeft = Math.min(...lefts);
        const maxRight = Math.max(...rights);
        const minBottom = Math.min(...bottoms);
        const maxTop = Math.max(...tops);
        const centreX = (minLeft + maxRight) / 2;
        const centreY = (minBottom + maxTop) / 2;
        for (const it of items) {
          const b = it.bounds;
          let dx = 0;
          let dy = 0;
          switch (mode) {
            case "left":
              dx = minLeft - b.x;
              break;
            case "right":
              dx = maxRight - (b.x + b.width);
              break;
            case "center-h":
              dx = centreX - (b.x + b.width / 2);
              break;
            case "bottom":
              dy = minBottom - b.y;
              break;
            case "top":
              dy = maxTop - (b.y + b.height);
              break;
            case "middle-v":
              dy = centreY - (b.y + b.height / 2);
              break;
          }
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
          if (it.kind === "run") {
            store.dispatch(
              new MoveTextRunCommand({
                pageIndex: p.index,
                runId: it.id,
                dx,
                dy,
              }),
            );
          } else {
            store.dispatch(
              new SetImageTransformCommand({
                pageIndex: p.index,
                imageId: it.id,
                nextBounds: {
                  x: b.x + dx,
                  y: b.y + dy,
                  width: b.width,
                  height: b.height,
                },
              }),
            );
          }
        }
      }
    },
    [store],
  );

  const onDistribute = useCallback(
    (axis: "horizontal" | "vertical") => {
      const doc = store.document;
      if (!doc) return;
      const selRuns = new Set(store.selection.value.runIds);
      const selImages = new Set(store.selection.value.imageIds);
      if (selRuns.size + selImages.size < 3) return;
      for (const p of doc.loadedPages()) {
        const items: Array<{
          kind: "run" | "image";
          id: string;
          bounds: { x: number; y: number; width: number; height: number };
        }> = [];
        for (const r of p.runs) {
          if (!selRuns.has(r.id)) continue;
          items.push({ kind: "run", id: r.id, bounds: r.bounds });
        }
        for (const im of p.images) {
          if (!selImages.has(im.id)) continue;
          items.push({ kind: "image", id: im.id, bounds: im.bounds });
        }
        if (items.length < 3) continue;
        items.sort((a, b) =>
          axis === "horizontal"
            ? a.bounds.x - b.bounds.x
            : a.bounds.y - b.bounds.y,
        );
        const first = items[0].bounds;
        const last = items[items.length - 1].bounds;
        const totalSize =
          axis === "horizontal"
            ? last.x + last.width - first.x
            : last.y + last.height - first.y;
        const sumSize = items.reduce(
          (acc, it) =>
            acc + (axis === "horizontal" ? it.bounds.width : it.bounds.height),
          0,
        );
        const gap = (totalSize - sumSize) / (items.length - 1);
        let cursor =
          axis === "horizontal"
            ? first.x + first.width + gap
            : first.y + first.height + gap;
        for (let i = 1; i < items.length - 1; i++) {
          const it = items[i];
          const b = it.bounds;
          let dx = 0;
          let dy = 0;
          if (axis === "horizontal") {
            dx = cursor - b.x;
            cursor += b.width + gap;
          } else {
            dy = cursor - b.y;
            cursor += b.height + gap;
          }
          if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
          if (it.kind === "run") {
            store.dispatch(
              new MoveTextRunCommand({
                pageIndex: p.index,
                runId: it.id,
                dx,
                dy,
              }),
            );
          } else {
            store.dispatch(
              new SetImageTransformCommand({
                pageIndex: p.index,
                imageId: it.id,
                nextBounds: {
                  x: b.x + dx,
                  y: b.y + dy,
                  width: b.width,
                  height: b.height,
                },
              }),
            );
          }
        }
      }
    },
    [store],
  );

  const onTransformImage = useCallback(
    (mode: ImageTransformMode) => {
      const doc = store.document;
      if (!doc) return;
      const selImages = new Set(store.selection.value.imageIds);
      if (selImages.size === 0) return;
      for (const p of doc.loadedPages()) {
        for (const im of p.images) {
          if (!selImages.has(im.id)) continue;
          store.dispatch(
            new TransformImageObjectCommand({
              pageIndex: p.index,
              imageId: im.id,
              mode,
            }),
          );
        }
      }
    },
    [store],
  );

  const onChangeCase = useCallback(
    (mode: "upper" | "lower" | "title" | "sentence") => {
      const doc = store.document;
      if (!doc) return;
      const selIds = new Set(store.selection.value.runIds);
      if (selIds.size === 0) return;
      const transform = (s: string): string => {
        switch (mode) {
          case "upper":
            return s.toUpperCase();
          case "lower":
            return s.toLowerCase();
          case "title":
            return s.replace(
              /\b\w[\w']*/g,
              (w) => w[0].toUpperCase() + w.slice(1).toLowerCase(),
            );
          case "sentence":
            return s.replace(/(^\s*\w|[.!?]\s+\w)/g, (m) => m.toUpperCase());
        }
      };
      for (const p of doc.loadedPages()) {
        for (const r of p.runs) {
          if (!selIds.has(r.id)) continue;
          const next = transform(r.text);
          if (next === r.text) continue;
          store.dispatch(
            new EditTextCommand({
              pageIndex: p.index,
              runId: r.id,
              nextText: next,
            }),
          );
        }
      }
    },
    [store],
  );

  const toolbarState = useMemo(
    () => deriveToolbarState(state.pages, selection),
    [state.pages, selection],
  );

  const selectionAllLocked = useMemo(() => {
    const runs = new Set(selection.runIds);
    const images = new Set(selection.imageIds);
    if (runs.size === 0 && images.size === 0) return false;
    for (const p of state.pages) {
      for (const r of p.runs) if (runs.has(r.id) && !r.locked) return false;
      for (const im of p.images)
        if (images.has(im.id) && !im.locked) return false;
    }
    return true;
  }, [state.pages, selection]);

  const canAlignLines = useMemo(() => {
    if (selection.runIds.length !== 1 || selection.imageIds.length > 0)
      return false;
    const run = state.pages
      .flatMap((p) => p.runs)
      .find((r) => r.id === selection.runIds[0]);
    return !!run && (run.paragraphLineCount ?? 0) > 1;
  }, [state.pages, selection]);

  return {
    state: toolbarState,
    canUndo: store.history.canUndo,
    canRedo: store.history.canRedo,
    onUndo: () => store.undo(),
    onRedo: () => store.redo(),
    onChangeFontSize: sel.changeFontSize,
    onChangeFill: sel.changeFill,
    onChangeFontFamily: sel.changeFontFamily,
    onToggleBold: sel.toggleBold,
    onToggleItalic: sel.toggleItalic,
    onDelete: sel.deleteSelection,
    onToggleLock,
    onChangeCase,
    onChangeZOrder,
    onAlign,
    onDistribute,
    onTransformImage,
    selectionAllLocked,
    hasRunSelection: selection.runIds.length > 0,
    hasImageSelection: selection.imageIds.length > 0,
    selectionCount: selection.runIds.length + selection.imageIds.length,
    canAlignLines,
    disabled:
      !state.hasDocument ||
      (selection.runIds.length === 0 && selection.imageIds.length === 0),
  };
}
