import { useCallback, useEffect, useRef, useState } from "react";
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
import { SaveRiskModal } from "@app/tools/pdfTextEditor/v2/components/SaveRiskModal";
import { PasswordPromptModal } from "@app/tools/pdfTextEditor/v2/components/PasswordPromptModal";
import { EditorTopBar } from "@app/tools/pdfTextEditor/v2/components/EditorTopBar";
import { EditorSidebar } from "@app/tools/pdfTextEditor/v2/components/EditorSidebar";
import { EditorFileInputs } from "@app/tools/pdfTextEditor/v2/components/EditorFileInputs";
import { PageStage } from "@app/tools/pdfTextEditor/v2/components/PageStage";
import { InsertImageCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertImageCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/v2/commands/InsertTextCommand";
import { DisplayTransform } from "@app/tools/pdfTextEditor/v2/model/DisplayTransform";
import { MergeRunsCommand } from "@app/tools/pdfTextEditor/v2/commands/MergeRunsCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/v2/commands/UngroupParagraphCommand";
import { exportToBlob } from "@app/tools/pdfTextEditor/v2/util/exportPdf";
import {
  detectSaveRisks,
  hasSaveRisks,
  type SaveRisks,
} from "@app/tools/pdfTextEditor/v2/util/documentRisks";
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
  // Pending save-risk warning (signatures/XFA) shown before the actual save.
  const [saveRisks, setSaveRisks] = useState<SaveRisks | null>(null);
  // docPtr the user already acknowledged risks for, so we don't re-nag.
  const ackedRiskDocRef = useRef<number | null>(null);

  const doSave = useCallback(async () => {
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

  const handleSave = useCallback(async () => {
    const doc = store.document;
    if (!doc || savingRef.current) return;
    // Warn once per document if the save would damage signatures/XFA.
    if (ackedRiskDocRef.current !== doc.docPtr) {
      const risks = detectSaveRisks(doc);
      if (hasSaveRisks(risks)) {
        setSaveRisks(risks);
        return;
      }
      ackedRiskDocRef.current = doc.docPtr;
    }
    await doSave();
  }, [store, doSave]);

  const handleConfirmSaveRisk = useCallback(() => {
    if (store.document) ackedRiskDocRef.current = store.document.docPtr;
    setSaveRisks(null);
    void doSave();
  }, [store, doSave]);

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
      // Centre in the VISIBLE (display) page, then invert the CropBox/rotation
      // transform to raw PDF space (commands store raw coords). Identity on
      // normal pages => unchanged.
      const ll = DisplayTransform.fromData(page.display).invert(
        (page.width - w) / 2,
        (page.height - h) / 2,
      );
      const cmd = new InsertImageCommand({
        pageIndex: page.pageIndex,
        rgba: decoded.data.data,
        pixelWidth: decoded.width,
        pixelHeight: decoded.height,
        x: ll.x,
        y: ll.y,
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
   * the currently-visible page, positioned in roughly the centre. The
   * whole clipboard string (newlines preserved) is inserted as a single
   * multi-line text run.
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
      // Position roughly at the page centre (display space), biased toward the
      // upper third so multi-line paste has room to flow downward, then invert
      // the CropBox/rotation transform to raw PDF space. Identity => unchanged.
      const anchor = page.display.invert(
        page.width / 2 - 80,
        page.height * 0.55,
      );
      const cmd = new InsertTextCommand({
        pageIndex,
        x: anchor.x,
        y: anchor.y,
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

  const canGroup = selection.runIds.length >= 2;
  const canUngroup = (() => {
    if (selection.runIds.length !== 1) return false;
    const run = state.pages
      .flatMap((p) => p.runs)
      .find((r) => r.id === selection.runIds[0]);
    return !!run && (run.paragraphLineCount ?? 0) > 1;
  })();
  const handleToggleAddText = useCallback(
    () =>
      store.setMode(store.getState().mode === "addText" ? "select" : "addText"),
    [store],
  );
  const handlePickImageClick = useCallback(() => {
    (
      document.querySelector(
        '[data-testid="v2-image-input"]',
      ) as HTMLInputElement | null
    )?.click();
  }, []);

  const onPickPdf = useCallback(
    (file: File) => {
      setOpenedFileName(file.name);
      void load(file);
    },
    [load],
  );

  const handleSubmitPassword = useCallback(
    (password: string) => {
      const file = store.pendingPasswordFile;
      if (file) void load(file, password);
    },
    [store, load],
  );

  const handleCancelPassword = useCallback(
    () => store.clearPasswordPrompt(),
    [store],
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
        pages={state.pages}
        openedFileName={openedFileName}
        onSave={handleSave}
        onShowHelp={() => setHelpOpen(true)}
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
      <SaveRiskModal
        risks={saveRisks}
        onConfirm={handleConfirmSaveRisk}
        onCancel={() => setSaveRisks(null)}
      />
      <PasswordPromptModal
        prompt={state.passwordPrompt}
        loading={state.loading}
        onSubmit={handleSubmitPassword}
        onCancel={handleCancelPassword}
      />
      <EditorSidebar
        state={state}
        selection={selection}
        mode={state.mode}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onToggleAddText={handleToggleAddText}
        onPickImage={handlePickImageClick}
        onGroup={handleMergeSelection}
        onUngroup={handleUngroupSelection}
        onSetGroupingMode={(mode) => store.setGroupingMode(mode)}
        onSetWidthMode={(m) => store.setWidthMode(m)}
      />
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
