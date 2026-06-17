import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Stack } from "@mantine/core";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import { downloadBlob } from "@app/utils/downloadUtils";
import type { BaseToolProps } from "@app/types/tool";
import { useEditorStore } from "@app/tools/pdfTextEditor/v2/hooks/useEditorStore";
import { useDocumentLoader } from "@app/tools/pdfTextEditor/v2/hooks/useDocumentLoader";
import { useAutoLoadFile } from "@app/tools/pdfTextEditor/v2/hooks/useAutoLoadFile";
import { useWorkbenchPin } from "@app/tools/pdfTextEditor/v2/hooks/useWorkbenchPin";
import { useUnsavedChangesGuard } from "@app/tools/pdfTextEditor/v2/hooks/useUnsavedChangesGuard";
import { useEditorTestGlobal } from "@app/tools/pdfTextEditor/v2/hooks/useEditorTestGlobal";
import { useSelectionActions } from "@app/tools/pdfTextEditor/v2/hooks/useSelectionActions";
import { useEditorKeyboardShortcuts } from "@app/tools/pdfTextEditor/v2/hooks/useEditorKeyboardShortcuts";
import { FindBar } from "@app/tools/pdfTextEditor/v2/components/FindBar";
import { HelpOverlay } from "@app/tools/pdfTextEditor/v2/components/HelpOverlay";
import { EditorTopBar } from "@app/tools/pdfTextEditor/v2/components/EditorTopBar";
import { EditorSidebar } from "@app/tools/pdfTextEditor/v2/components/EditorSidebar";
import { EditorFileInputs } from "@app/tools/pdfTextEditor/v2/components/EditorFileInputs";
import { PageStage } from "@app/tools/pdfTextEditor/v2/components/PageStage";
import { Toolbar } from "@app/tools/pdfTextEditor/v2/components/Toolbar";
import {
  ChangeZOrderCommand,
  type ZOrderMode,
} from "@app/tools/pdfTextEditor/v2/commands/ChangeZOrderCommand";
import { EditTextCommand } from "@app/tools/pdfTextEditor/v2/commands/EditTextCommand";
import { InsertImageCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertImageCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertTextCommand";
import { MergeRunsCommand } from "@app/tools/pdfTextEditor/v2/commands/MergeRunsCommand";
import { MoveTextRunCommand } from "@app/tools/pdfTextEditor/v2/commands/MoveTextRunCommand";
import { SetImageTransformCommand } from "@app/tools/pdfTextEditor/v2/commands/SetImageTransformCommand";
import { SetLockCommand } from "@app/tools/pdfTextEditor/v2/commands/SetLockCommand";
import {
  TransformImageObjectCommand,
  type ImageTransformMode,
} from "@app/tools/pdfTextEditor/v2/commands/TransformImageObjectCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/v2/commands/UngroupParagraphCommand";
import { exportToBlob } from "@app/tools/pdfTextEditor/v2/util/exportPdf";
import { deriveToolbarState } from "@app/tools/pdfTextEditor/v2/util/toolbarState";
import { visiblePageNumber } from "@app/tools/pdfTextEditor/v2/util/dom";
import type { SelectionState } from "@app/tools/pdfTextEditor/v2/types";

const WORKBENCH_ID = "custom:pdfTextEditorV2" as const;
const WORKBENCH_VIEW_ID = "pdfTextEditorV2Workbench";
const INSERTED_IMAGE_RATIO = 0.4;

export default function PdfTextEditorV2(_props: BaseToolProps) {
  const { store, state } = useEditorStore();
  const load = useDocumentLoader(store);

  const [selection, setSelection] = useState<SelectionState>(
    store.selection.value,
  );
  const [findOpen, setFindOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);

  useEditorTestGlobal(store);
  useUnsavedChangesGuard(state.dirty);
  useWorkbenchPin({
    workbenchId: WORKBENCH_ID,
    workbenchViewId: WORKBENCH_VIEW_ID,
    label: "Editor",
    icon: <DescriptionIcon fontSize="small" />,
    component: PageStage,
  });
  useAutoLoadFile(load, setOpenedFileName);

  useEffect(() => store.selection.subscribe(setSelection), [store]);

  const sel = useSelectionActions(store);

  // Guards against re-entrant saves while a (synchronous) serialize runs.
  const savingRef = useRef(false);

  const handleSave = useCallback(async () => {
    if (!store.document || savingRef.current) return;
    savingRef.current = true;
    store.setError(null);
    try {
      // Yield once so React can paint the disabled/saving state before the
      // synchronous PDFium serialize blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const { blob, filename } = exportToBlob(store.document);
      downloadBlob(blob, filename);
      store.markSaved();
    } catch (err) {
      // Surface the failure instead of silently dropping it - the user
      // must not believe a broken save succeeded.
      store.setError(err instanceof Error ? err.message : String(err));
    } finally {
      savingRef.current = false;
    }
  }, [store]);

  const handleInsertImage = useCallback(
    async (file: File) => {
      const doc = store.document;
      if (!doc) return;
      // Decode via an <img> element rather than createImageBitmap: the latter
      // lacks codec support in some environments (and headless Chromium),
      // throwing "source image could not be decoded". The <img> path decodes
      // anywhere the browser can render the format. Surface failures instead
      // of swallowing them so the user isn't left wondering why nothing happened.
      let decoded: { data: ImageData; width: number; height: number };
      try {
        decoded = await decodeImageFile(file);
      } catch (err) {
        store.setError(
          err instanceof Error
            ? err.message
            : "Could not decode the selected image.",
        );
        return;
      }
      // The document may have been reloaded while the image decoded; bail
      // rather than insert against geometry from the wrong document.
      if (store.document !== doc) return;
      // Insert onto the page currently in view, read from fresh store state
      // (not a stale render closure), so scrolling to page 10 and inserting
      // doesn't silently drop the image onto page 1 off-screen.
      const pages = store.getState().pages;
      const visibleIndex = visiblePageNumber();
      const page = pages.find((p) => p.pageIndex === visibleIndex) ?? pages[0];
      if (!page) return;
      const w = page.width * INSERTED_IMAGE_RATIO;
      const h = w * (decoded.height / decoded.width);
      const cmd = new InsertImageCommand({
        pageIndex: page.pageIndex,
        rgba: decoded.data.data,
        pixelWidth: decoded.width,
        pixelHeight: decoded.height,
        x: (page.width - w) / 2,
        y: (page.height - h) / 2,
        width: w,
        height: h,
      });
      store.dispatch(cmd);
      if (cmd.insertedImageId) {
        store.selection.selectImage(cmd.insertedImageId);
      }
    },
    [store],
  );

  const handleCopySelected = useCallback(() => {
    const ids = store.selection.value.runIds;
    if (ids.length === 0) return;
    const texts = store
      .getState()
      .pages.flatMap((p) => p.runs)
      .filter((r) => ids.includes(r.id))
      .map((r) => r.text);
    if (texts.length === 0) return;
    void navigator.clipboard.writeText(texts.join("\n"));
  }, [store]);

  /**
   * Ctrl+X: copy the selected runs' text to the clipboard AND remove
   * them. Browser's native cut on a contentEditable would just remove
   * the text inside the focused run; we want the editor-level
   * behaviour: clipboard gets the run text(s), the selected runs are
   * deleted as text/image objects. The clipboard write is fire-and-
   * forget (no await) so the delete fires immediately even if the
   * clipboard API is slow.
   */
  const handleCutSelected = useCallback(() => {
    handleCopySelected();
    sel.deleteSelection();
  }, [handleCopySelected, sel]);

  /**
   * Ctrl+V: read clipboard and create a fresh InsertTextCommand on
   * the currently-visible page, positioned in roughly the centre.
   * Each line of the clipboard becomes a new text object so paste of
   * multi-line content works without flattening to one long run.
   *
   * Skipped silently when:
   *   - no document loaded
   *   - clipboard API unavailable / permission denied
   *   - clipboard is empty
   *   - focus is in a contentEditable run (the browser's default paste
   *     into the active text run is what the user intends in that case)
   */
  const handlePaste = useCallback(
    async (stripFormatting: boolean) => {
      const doc = store.document;
      if (!doc) return;
      // Don't hijack the browser paste when the caret is in a text run.
      const active = document.activeElement as HTMLElement | null;
      if (active && active.isContentEditable) return;
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return;
      }
      if (!text) return;
      // `stripFormatting` is honoured by normalising line endings and
      // collapsing leading/trailing whitespace - the underlying paste
      // already drops everything but plain text since the clipboard
      // API returns a string. The flag is kept so the same handler
      // can be re-pointed at a richer source later.
      const normalised = stripFormatting
        ? text.replace(/\r\n?/g, "\n").trim()
        : text.replace(/\r\n?/g, "\n");
      if (!normalised) return;
      // Find the visible page (Ctrl+End behaves the same way).
      const stage = document.querySelector<HTMLElement>(
        '[data-testid="v2-stage"]',
      );
      const stageRect = stage?.getBoundingClientRect();
      const stageCentreY = stageRect ? stageRect.top + stageRect.height / 2 : 0;
      let pageIndex = 0;
      let bestDist = Infinity;
      for (const p of doc.loadedPages()) {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="v2-page-${p.index}"]`,
        );
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const centre = r.top + r.height / 2;
        const dist = Math.abs(centre - stageCentreY);
        if (dist < bestDist) {
          bestDist = dist;
          pageIndex = p.index;
        }
      }
      const page = doc.page(pageIndex);
      // Position roughly at the page centre, biased toward the upper
      // third so multi-line paste has room to flow downward.
      const cmd = new InsertTextCommand({
        pageIndex,
        x: page.width / 2 - 80,
        y: page.height * 0.55,
        text: normalised,
      });
      store.dispatch(cmd);
      if (cmd.insertedRunId) store.selection.selectOne(cmd.insertedRunId);
    },
    [store],
  );

  const handleFindNext = useCallback((reverse: boolean) => {
    setFindOpen(true);
    const button = document.querySelector<HTMLButtonElement>(
      reverse ? '[data-testid="v2-find-prev"]' : '[data-testid="v2-find-next"]',
    );
    button?.click();
  }, []);

  const handleEscape = useCallback(() => {
    store.selection.clear();
    store.setMode("select");
    setHelpOpen(false);
    setFindOpen(false);
  }, [store]);

  const handleUngroupSelection = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    const ids = store.selection.value.runIds;
    // Snapshot the target runs first - dispatching mutates page.runs, and
    // the ungroup replaces the paragraph run with per-line runs.
    const targets: Array<{ pageIndex: number; runId: string }> = [];
    for (const pageIdx of doc.loadedPages().map((p) => p.index)) {
      for (const r of doc.page(pageIdx).runs) {
        if (!ids.includes(r.id)) continue;
        if (r.paragraphMemberPtrs.length < 2) continue;
        targets.push({ pageIndex: pageIdx, runId: r.id });
      }
    }
    const resultIds: string[] = [];
    for (const t of targets) {
      const cmd = new UngroupParagraphCommand(t);
      store.dispatch(cmd);
      resultIds.push(...cmd.resultRunIds);
    }
    // Reconcile selection against the new run model so the toolbar keeps
    // acting on real runs instead of the now-removed paragraph ids.
    if (resultIds.length > 0) store.selection.selectMany(resultIds);
    else store.selection.clear();
  }, [store]);

  const handleMergeSelection = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    const selectedIds = new Set(store.selection.value.runIds);
    if (selectedIds.size < 2) return;
    const byPage = new Map<number, string[]>();
    for (const page of doc.loadedPages()) {
      for (const r of page.runs) {
        if (!selectedIds.has(r.id)) continue;
        const list = byPage.get(r.pageIndex) ?? [];
        list.push(r.id);
        byPage.set(r.pageIndex, list);
      }
    }
    // Collect every page's new representative, then select them all once -
    // selecting inside the loop left only the last page's merge selected.
    const reps: string[] = [];
    for (const [pageIndex, runIds] of byPage) {
      if (runIds.length < 2) continue;
      const cmd = new MergeRunsCommand({ pageIndex, runIds });
      store.dispatch(cmd);
      if (cmd.representativeRunId) reps.push(cmd.representativeRunId);
    }
    if (reps.length > 0) store.selection.selectMany(reps);
  }, [store]);

  /**
   * Toggle the session-only `locked` flag on every selected run and
   * image. If the selection mixes locked + unlocked, the action sets
   * EVERY object to locked (closest match to the user's mental model:
   * "lock everything I have selected"). The unlock affordance lives
   * on the same button when the entire selection is already locked.
   */
  const handleToggleLockSelection = useCallback(() => {
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

  /**
   * Re-order selected objects in their page's content stream. PDF
   * paints later objects on top, so "to front" = highest index.
   * Multi-selection: every selected object on every page gets one
   * ChangeZOrderCommand. The order within a single page is preserved
   * by walking the page's existing object list in index order so
   * relative stacking between selected items stays consistent.
   */
  const handleChangeZOrder = useCallback(
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
            new ChangeZOrderCommand({
              pageIndex: p.index,
              runId: r.id,
              mode,
            }),
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

  type AlignMode =
    | "left"
    | "center-h"
    | "right"
    | "top"
    | "middle-v"
    | "bottom";

  /**
   * Align every selected object along the chosen axis. Reference is
   * the EXTREME of the selection: align-left snaps each object's left
   * edge to the leftmost left in the selection, align-center snaps each
   * to the selection's horizontal centre, etc. Single-page selections
   * align within the page; multi-page selections align per page (one
   * page's selection doesn't influence another's bounds).
   *
   * Skipped when fewer than 2 objects are selected on the current page.
   */
  const handleAlignSelection = useCallback(
    (mode: AlignMode) => {
      const doc = store.document;
      if (!doc) return;
      const selRuns = new Set(store.selection.value.runIds);
      const selImages = new Set(store.selection.value.imageIds);
      if (selRuns.size + selImages.size < 2) return;
      for (const p of doc.loadedPages()) {
        // Collect selected items on this page with their bounds.
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

  /**
   * Distribute selected objects with equal SPACING (not equal centres)
   * along an axis. Outermost objects stay put; intermediate objects
   * are re-spaced so the gap between consecutive bounding boxes is
   * identical. Skipped when fewer than 3 objects are on a page since
   * 2 objects already have implicit equal spacing.
   */
  const handleDistributeSelection = useCallback(
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
        // Sort along the axis.
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
        // Move every middle object so its left/bottom = cursor.
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

  /**
   * Apply a rotate/flip transform to every selected image. Text runs
   * are skipped silently - rotation of text is meaningful but the
   * UX surface (and PDF emit story) is different and lives behind a
   * separate command.
   */
  const handleTransformImage = useCallback(
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

  /**
   * Transform every selected run's text via the chosen case rule and
   * dispatch one EditTextCommand per run. Pure string transform; no
   * PDFium plumbing.
   */
  const handleChangeCase = useCallback(
    (mode: "upper" | "lower" | "title" | "sentence") => {
      const doc = store.document;
      if (!doc) return;
      const sel = new Set(store.selection.value.runIds);
      if (sel.size === 0) return;
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
          if (!sel.has(r.id)) continue;
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

  useEditorKeyboardShortcuts({
    store,
    onUndo: useCallback(() => store.undo(), [store]),
    onRedo: useCallback(() => store.redo(), [store]),
    onSave: handleSave,
    onDelete: sel.deleteSelection,
    onDuplicate: sel.duplicateFirstSelected,
    onSelectAll: useCallback(() => {
      const ids = store
        .getState()
        .pages.flatMap((p) => p.runs.map((r) => r.id));
      if (ids.length > 0) store.selection.selectMany(ids);
    }, [store]),
    onCopySelected: handleCopySelected,
    onCutSelected: handleCutSelected,
    onPaste: useCallback(
      (stripFormatting: boolean) => void handlePaste(stripFormatting),
      [handlePaste],
    ),
    onToggleHelp: useCallback(() => setHelpOpen((v) => !v), []),
    onOpenFind: useCallback(() => setFindOpen(true), []),
    onFindNext: handleFindNext,
    onEscape: handleEscape,
    onMergeSelection: handleMergeSelection,
  });

  const toolbarState = useMemo(
    () => deriveToolbarState(state.pages, selection),
    [state.pages, selection],
  );

  const onPickPdf = useCallback(
    (file: File) => {
      setOpenedFileName(file.name);
      void load(file);
    },
    [load],
  );

  return (
    <Stack
      gap={0}
      h="100%"
      style={{ overflow: "hidden" }}
      data-testid="v2-root"
    >
      <EditorTopBar
        store={store}
        hasDocument={state.hasDocument}
        dirty={state.dirty}
        renderScale={state.renderScale}
        mode={state.mode}
        pages={state.pages}
        openedFileName={openedFileName}
        canGroup={selection.runIds.length >= 2}
        canUngroup={(() => {
          if (selection.runIds.length !== 1) return false;
          const id = selection.runIds[0];
          const run = state.pages
            .flatMap((p) => p.runs)
            .find((r) => r.id === id);
          return !!run && (run.paragraphLineCount ?? 0) > 1;
        })()}
        onToggleAddText={() =>
          store.setMode(state.mode === "addText" ? "select" : "addText")
        }
        onPickImage={() =>
          (
            document.querySelector(
              '[data-testid="v2-image-input"]',
            ) as HTMLInputElement | null
          )?.click()
        }
        onGroup={handleMergeSelection}
        onUngroup={handleUngroupSelection}
        onSave={handleSave}
        onShowHelp={() => setHelpOpen(true)}
      />
      <Toolbar
        state={toolbarState}
        canUndo={store.history.canUndo}
        canRedo={store.history.canRedo}
        onUndo={() => store.undo()}
        onRedo={() => store.redo()}
        onChangeFontSize={sel.changeFontSize}
        onChangeFill={sel.changeFill}
        onChangeFontFamily={sel.changeFontFamily}
        onToggleBold={sel.toggleBold}
        onToggleItalic={sel.toggleItalic}
        onDelete={sel.deleteSelection}
        onToggleLock={handleToggleLockSelection}
        onChangeCase={handleChangeCase}
        onChangeZOrder={handleChangeZOrder}
        onAlign={handleAlignSelection}
        onDistribute={handleDistributeSelection}
        onTransformImage={handleTransformImage}
        hasImageSelection={selection.imageIds.length > 0}
        selectionAllLocked={(() => {
          const runs = new Set(selection.runIds);
          const images = new Set(selection.imageIds);
          if (runs.size === 0 && images.size === 0) return false;
          for (const p of state.pages) {
            for (const r of p.runs)
              if (runs.has(r.id) && !r.locked) return false;
            for (const im of p.images)
              if (images.has(im.id) && !im.locked) return false;
          }
          return true;
        })()}
        hasRunSelection={selection.runIds.length > 0}
        selectionCount={selection.runIds.length + selection.imageIds.length}
        disabled={
          !state.hasDocument ||
          (selection.runIds.length === 0 && selection.imageIds.length === 0)
        }
      />
      {state.error && (
        <Alert color="red" m="sm" data-testid="v2-error">
          {state.error}
        </Alert>
      )}
      <EditorFileInputs onPickPdf={onPickPdf} onPickImage={handleInsertImage} />
      {findOpen && state.hasDocument && (
        <FindBar
          store={store}
          pages={state.pages}
          onClose={() => setFindOpen(false)}
        />
      )}
      <HelpOverlay opened={helpOpen} onClose={() => setHelpOpen(false)} />
      <EditorSidebar state={state} selection={selection} />
    </Stack>
  );
}

/**
 * Decode an image File to RGBA via an <img> element + canvas. Used instead of
 * createImageBitmap, which lacks codec support in some environments. Rejects
 * (so the caller can surface an error) when the image can't be decoded.
 */
function decodeImageFile(
  file: File,
): Promise<{ data: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({ data: ctx.getImageData(0, 0, width, height), width, height });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the selected image."));
    };
    img.src = url;
  });
}
