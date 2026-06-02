import { useCallback, useEffect, useMemo, useState } from "react";
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
import { InsertImageCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertImageCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertTextCommand";
import { MergeRunsCommand } from "@app/tools/pdfTextEditor/v2/commands/MergeRunsCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/v2/commands/UngroupParagraphCommand";
import { exportToBlob } from "@app/tools/pdfTextEditor/v2/util/exportPdf";
import { deriveToolbarState } from "@app/tools/pdfTextEditor/v2/util/toolbarState";
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

  const handleSave = useCallback(() => {
    if (!store.document) return;
    const { blob, filename } = exportToBlob(store.document);
    downloadBlob(blob, filename);
  }, [store]);

  const handleInsertImage = useCallback(
    async (file: File) => {
      const doc = store.document;
      if (!doc) return;
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close?.();
      const page = state.pages[0];
      if (!page) return;
      const w = page.width * INSERTED_IMAGE_RATIO;
      const h = w * (bitmap.height / bitmap.width);
      const cmd = new InsertImageCommand({
        pageIndex: page.pageIndex,
        rgba: data.data,
        pixelWidth: bitmap.width,
        pixelHeight: bitmap.height,
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
    [store, state.pages],
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
    for (const pageIdx of doc.loadedPages().map((p) => p.index)) {
      for (const r of doc.page(pageIdx).runs) {
        if (!ids.includes(r.id)) continue;
        if (r.paragraphMemberPtrs.length < 2) continue;
        store.dispatch(
          new UngroupParagraphCommand({ pageIndex: pageIdx, runId: r.id }),
        );
      }
    }
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
    for (const [pageIndex, runIds] of byPage) {
      if (runIds.length < 2) continue;
      const cmd = new MergeRunsCommand({ pageIndex, runIds });
      store.dispatch(cmd);
      if (cmd.representativeRunId) {
        store.selection.selectOne(cmd.representativeRunId);
      }
    }
  }, [store]);

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
