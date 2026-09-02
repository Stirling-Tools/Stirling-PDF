import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import { downloadFile } from "@app/services/downloadService";
import { useFileContext, useFileSelection } from "@app/contexts/FileContext";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import type { FileId } from "@app/types/file";
import type { BaseToolProps } from "@app/types/tool";
import { useEditorStore } from "@app/tools/pdfTextEditor/hooks/useEditorStore";
import { setEditorSession } from "@app/tools/pdfTextEditor/store/EditorSession";
import { useIsMobile } from "@app/hooks/useIsMobile";
import {
  useDocumentLoader,
  ensureAllPagesRead,
} from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { useAutoLoadFile } from "@app/tools/pdfTextEditor/hooks/useAutoLoadFile";
import { useWorkbenchPin } from "@app/tools/pdfTextEditor/hooks/useWorkbenchPin";
import { useUnsavedChangesGuard } from "@app/tools/pdfTextEditor/hooks/useUnsavedChangesGuard";
import { useEditorTestGlobal } from "@app/tools/pdfTextEditor/hooks/useEditorTestGlobal";
import { useSelectionActions } from "@app/tools/pdfTextEditor/hooks/useSelectionActions";
import { useEditorKeyboardShortcuts } from "@app/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts";
import { useEditorClipboard } from "@app/tools/pdfTextEditor/hooks/useEditorClipboard";
import { SaveRiskModal } from "@app/tools/pdfTextEditor/components/SaveRiskModal";
import { DiscardChangesModal } from "@app/tools/pdfTextEditor/components/DiscardChangesModal";
import { HelpOverlay } from "@app/tools/pdfTextEditor/components/HelpOverlay";
import { PasswordPromptModal } from "@app/tools/pdfTextEditor/components/PasswordPromptModal";
import { EditorPanelActions } from "@app/tools/pdfTextEditor/components/EditorPanelActions";
import { EditorSidebar } from "@app/tools/pdfTextEditor/components/EditorSidebar";
import { EditorFileInputs } from "@app/tools/pdfTextEditor/components/EditorFileInputs";
import { PageStage } from "@app/tools/pdfTextEditor/components/PageStage";
import { InsertImageCommand } from "@app/tools/pdfTextEditor/commands/InsertImageCommand";
import { InsertTextCommand } from "@app/tools/pdfTextEditor/commands/InsertTextCommand";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import { jpegExifOrientation } from "@app/tools/pdfTextEditor/util/jpegOrientation";
import { MergeRunsCommand } from "@app/tools/pdfTextEditor/commands/MergeRunsCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/commands/UngroupParagraphCommand";
import { exportToBlob } from "@app/tools/pdfTextEditor/util/exportPdf";
import {
  detectSaveRisks,
  hasSaveRisks,
  type SaveRisks,
} from "@app/tools/pdfTextEditor/util/documentRisks";
import { preloadFallbackFontBytes } from "@app/tools/pdfTextEditor/util/fallbackFont";
import { visiblePageNumber } from "@app/tools/pdfTextEditor/util/dom";
import type { SelectionState } from "@app/tools/pdfTextEditor/types";

const WORKBENCH_ID = "custom:pdfTextEditor" as const;
const WORKBENCH_VIEW_ID = "pdfTextEditorWorkbench";
const INSERTED_IMAGE_RATIO = 0.4;

export default function PdfTextEditor(_props: BaseToolProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { store, state } = useEditorStore();
  const load = useDocumentLoader(store);

  const [selection, setSelection] = useState<SelectionState>(
    store.selection.value,
  );
  const [openedFileName, setOpenedFileName] = useState<string | null>(null);
  // Set only when the document came from the workbench; a drag-dropped
  // file has no fileId and can only be downloaded. Mirrored into state so the
  // sidebar's file switcher can mark which workbench file is open.
  const sourceFileIdRef = useRef<FileId | null>(null);
  const [sourceFileId, setSourceFileId] = useState<FileId | null>(null);
  const setSourceFile = useCallback((id: FileId | null) => {
    sourceFileIdRef.current = id;
    setSourceFileId(id);
  }, []);
  const { addFiles, consumeFiles, selectors } = useFileContext();
  const { setSelectedFiles } = useFileSelection();
  // Saving replaces the workbench file, so for a moment the selection points at
  // a file the editor has not adopted yet. Auto-load must sit that out.
  const [applying, setApplying] = useState(false);

  useEditorTestGlobal(store);
  useUnsavedChangesGuard(state.dirty);
  const pinWorkbench = useWorkbenchPin({
    workbenchId: WORKBENCH_ID,
    workbenchViewId: WORKBENCH_VIEW_ID,
    label: t("pdfTextEditor.workbenchLabel", "Editor"),
    icon: <DescriptionIcon fontSize="small" />,
    component: PageStage,
  });
  // Uploading flips the workbench to Active Files, so landing a document has to
  // pin the canvas back. useAutoLoadFile only fires for a genuine file change.
  const handleFileChosen = useCallback(
    (name: string, fileId?: FileId) => {
      setOpenedFileName(name);
      setSourceFile(fileId ?? null);
      pinWorkbench();
    },
    [pinWorkbench, setSourceFile],
  );
  const { openFile: openWorkbenchFile, adopt: adoptFile } = useAutoLoadFile(
    load,
    handleFileChosen,
    sourceFileId,
    applying,
    state,
  );

  useEffect(() => store.selection.subscribe(setSelection), [store]);

  // Warm the Unicode fallback font so a non-Latin edit can embed it instead of
  // dropping the glyphs.
  useEffect(() => {
    void preloadFallbackFontBytes();
  }, []);

  const sel = useSelectionActions(store);

  // Guards against re-entrant saves while a (synchronous) serialize runs.
  const savingRef = useRef(false);
  // Pending save-risk warning (signatures/XFA) shown before the actual save.
  const [saveRisks, setSaveRisks] = useState<SaveRisks | null>(null);
  // docPtr the user already acknowledged risks for, so we don't re-nag.
  const ackedRiskRef = useRef<{ doc: object; sig: string } | null>(null);

  // Land the edit in the workbench the way every other tool does: replace the
  // file it came from, or add it if the document was opened from disk. Without
  // this the editor is an island and the next tool runs on the pre-edit bytes.
  const applyToWorkbench = useCallback(
    async (blob: Blob, filename: string) => {
      const edited = new File([blob], filename, { type: "application/pdf" });
      const sourceId = sourceFileIdRef.current;
      const parentStub = sourceId
        ? selectors.getStirlingFileStub(sourceId)
        : null;
      setApplying(true);
      try {
        if (sourceId && parentStub) {
          const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
            [edited],
            parentStub,
            "pdfTextEditor",
          );
          await consumeFiles([sourceId], stirlingFiles, stubs);
          // Claim the replacement before releasing the hold, otherwise the
          // editor sees an unfamiliar selection and re-opens the file it just
          // wrote, throwing away undo history.
          if (stirlingFiles[0]) adoptFile(stirlingFiles[0]);
          setSourceFile(stubs[0]?.id ?? null);
          return;
        }
        const added = await addFiles([edited], {
          selectFiles: true,
          derivedFromTool: true,
        });
        if (added[0]) adoptFile(added[0]);
        setSourceFile(added[0]?.fileId ?? null);
      } finally {
        setApplying(false);
      }
    },
    [addFiles, adoptFile, consumeFiles, selectors, setSourceFile],
  );

  const doSave = useCallback(
    async (download: boolean) => {
      if (!store.document || savingRef.current) return;
      savingRef.current = true;
      store.setError(null);
      try {
        // Yield once so React can paint the disabled/saving state before the
        // synchronous PDFium serialize blocks the main thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
        // The position that is about to be written out. Anything the user edits
        // while the export runs is NOT in these bytes, so it must stay dirty.
        const exported = store.savedPosition();
        const { blob, filename } = await exportToBlob(
          store.document,
          openedFileName,
        );
        // Apply first and unconditionally. Gating the write-back on the browser
        // download dialog meant cancelling it silently discarded the save.
        await applyToWorkbench(blob, filename);
        store.markSaved(exported);
        if (download) await downloadFile({ data: blob, filename });
      } catch (err) {
        // Surface the failure instead of silently dropping it - the user
        // must not believe a broken save succeeded.
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        savingRef.current = false;
      }
    },
    [store, openedFileName, applyToWorkbench],
  );

  // Which action the risk modal is currently gating.
  const pendingDownloadRef = useRef(false);

  const runSave = useCallback(
    async (download: boolean) => {
      const doc = store.document;
      if (!doc || savingRef.current) return;
      // Re-evaluate on EVERY save: the ack only covers the exact risk set
      // the user saw. A new risk appearing later must warn again.
      const risks = detectSaveRisks(doc);
      if (hasSaveRisks(risks)) {
        const sig = JSON.stringify(risks);
        const acked = ackedRiskRef.current;
        if (!acked || acked.doc !== doc || acked.sig !== sig) {
          pendingDownloadRef.current = download;
          setSaveRisks(risks);
          return;
        }
      }
      await doSave(download);
    },
    [store, doSave],
  );

  const handleSave = useCallback(() => void runSave(false), [runSave]);
  const handleDownload = useCallback(() => void runSave(true), [runSave]);

  const handleConfirmSaveRisk = useCallback(() => {
    const doc = store.document;
    if (doc) {
      ackedRiskRef.current = {
        doc,
        sig: JSON.stringify(detectSaveRisks(doc)),
      };
    }
    setSaveRisks(null);
    void doSave(pendingDownloadRef.current);
  }, [store, doSave]);

  const handleInsertImage = useCallback(
    async (file: File) => {
      const doc = store.document;
      if (!doc) return;
      // Decode via an <img> element rather than createImageBitmap: the latter
      // lacks codec support in some environments.
      let decoded: { data: ImageData; width: number; height: number };
      try {
        decoded = await decodeImageFile(file);
      } catch (err) {
        store.setError(
          err instanceof Error
            ? err.message
            : t(
                "pdfTextEditor.error.decodeImage",
                "Could not decode the selected image.",
              ),
        );
        return;
      }
      // Keep the original JPEG bytes so the insert embeds them as-is
      // (DCTDecode) instead of re-encoding decoded RGBA - far smaller output.
      let jpegBytes: Uint8Array | undefined;
      if (file.type === "image/jpeg") {
        try {
          jpegBytes = new Uint8Array(await file.arrayBuffer());
          // The <img> decode above APPLIES EXIF orientation; the raw bytes
          // don't.
          if (jpegExifOrientation(jpegBytes) !== 1) jpegBytes = undefined;
        } catch {
          jpegBytes = undefined; // fall back to the bitmap path
        }
      }
      // The document may have been reloaded while the image decoded; bail
      // rather than insert against geometry from the wrong document.
      if (store.document !== doc) return;
      // Insert onto the page currently in view, read from fresh store state.
      const pages = store.getState().pages;
      const visibleIndex = visiblePageNumber();
      const page = pages.find((p) => p.pageIndex === visibleIndex) ?? pages[0];
      if (!page) return;
      const w = page.width * INSERTED_IMAGE_RATIO;
      const h = w * (decoded.height / decoded.width);
      // Centre in the VISIBLE (display) page, then invert the CropBox/rotation
      // transform to raw PDF space (commands store raw coords).
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
        jpegBytes,
      });
      store.dispatch(cmd);
      if (cmd.insertedImageId) {
        store.selection.selectImage(cmd.insertedImageId);
      } else {
        store.setError(
          t(
            "pdfTextEditor.error.insertImage",
            "Could not insert the selected image.",
          ),
        );
      }
    },
    [store, t],
  );

  /** Text of the object-level selection, or null when it carries none. */
  const getSelectedText = useCallback((): string | null => {
    const ids = store.selection.value.runIds;
    if (ids.length === 0) return null;
    const texts = store
      .getState()
      .pages.flatMap((p) => p.runs)
      .filter((r) => ids.includes(r.id))
      .map((r) => r.text);
    return texts.length === 0 ? null : texts.join("\n");
  }, [store]);

  const hasSelection = useCallback(() => {
    const s = store.selection.value;
    return s.runIds.length > 0 || s.imageIds.length > 0;
  }, [store]);

  // Paste: create a fresh InsertTextCommand on the currently-visible page,
  // positioned in roughly the centre.
  const insertPastedText = useCallback(
    (text: string, stripFormatting: boolean) => {
      const doc = store.document;
      if (!doc) return;
      // `stripFormatting` is honoured by normalising line endings and
      // collapsing leading/trailing whitespace.
      const normalised = stripFormatting
        ? text.replace(/\r\n?/g, "\n").trim()
        : text.replace(/\r\n?/g, "\n");
      if (!normalised) return;
      // Find the visible page (Ctrl+End behaves the same way).
      const stage = document.querySelector<HTMLElement>(
        '[data-testid="pdf-editor-stage"]',
      );
      const stageRect = stage?.getBoundingClientRect();
      const stageCentreY = stageRect ? stageRect.top + stageRect.height / 2 : 0;
      let pageIndex = 0;
      let bestDist = Infinity;
      for (const p of doc.loadedPages()) {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="pdf-editor-page-${p.index}"]`,
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
      // Position roughly at the page centre, biased toward the upper third so
      // multi-line paste has room to flow downward.
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

  const handleFindNext = useCallback(
    (reverse: boolean) => {
      store.setFindOpen(true);
      const button = document.querySelector<HTMLButtonElement>(
        reverse
          ? '[data-testid="pdf-editor-find-prev"]'
          : '[data-testid="pdf-editor-find-next"]',
      );
      button?.click();
    },
    [store],
  );

  const handleEscape = useCallback(() => {
    store.selection.clear();
    store.setMode("select");
    store.setHelpOpen(false);
    store.setFindOpen(false);
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
      // Pages past the eager window hold no runs until they scroll into view,
      // so reading the model as-is would select only part of the document.
      ensureAllPagesRead(store);
      const ids = store
        .getState()
        .pages.flatMap((p) => p.runs.map((r) => r.id));
      if (ids.length > 0) store.selection.selectMany(ids);
    }, [store]),
    onToggleHelp: useCallback(
      () => store.setHelpOpen(!store.getState().helpOpen),
      [store],
    ),
    onOpenFind: useCallback(() => store.setFindOpen(true), [store]),
    onFindNext: handleFindNext,
    onEscape: handleEscape,
    onMergeSelection: handleMergeSelection,
  });

  useEditorClipboard({
    hasSelection,
    getSelectedText,
    deleteSelection: sel.deleteSelection,
    insertPastedText,
  });

  const canGroup = selection.runIds.length >= 2;
  const canUngroup = (() => {
    if (selection.runIds.length !== 1) return false;
    const run = state.pages
      .flatMap((p) => p.runs)
      .find((r) => r.id === selection.runIds[0]);
    return !!run && (run.paragraphLineCount ?? 0) > 1;
  })();
  // Opening any document disposes the one in memory - edits, undo history and
  // all - so both routes in go through `requestOpen` first.
  const openDocument = useCallback(
    (file: File, fromDisk: boolean) => {
      if (!fromDisk) {
        // Deferred until the open is agreed: moving the workbench selection
        // for an open the user then cancels leaves the rest of the app
        // pointing at a file the editor is not editing.
        const fileId = (file as File & { fileId?: FileId }).fileId;
        if (fileId != null) setSelectedFiles([fileId]);
        openWorkbenchFile(file);
        return;
      }
      setOpenedFileName(file.name);
      // Dropped/picked from disk: no workbench file to replace yet, but claim
      // it so a later workbench arrival cannot auto-open over these edits.
      adoptFile(file);
      setSourceFile(null);
      void load(file);
    },
    [adoptFile, load, openWorkbenchFile, setSelectedFiles, setSourceFile],
  );

  // A document waiting on the user's answer to "discard your changes?".
  const [pendingOpen, setPendingOpen] = useState<{
    file: File;
    fromDisk: boolean;
  } | null>(null);

  const requestOpen = useCallback(
    (file: File, fromDisk: boolean) => {
      // Read the store, not the render's copy: a keystroke that dirtied the
      // document in the same tick must still be caught.
      if (store.getState().dirty) {
        setPendingOpen({ file, fromDisk });
        return;
      }
      openDocument(file, fromDisk);
    },
    [openDocument, store],
  );

  const onPickPdf = useCallback(
    (file: File) => requestOpen(file, true),
    [requestOpen],
  );
  const onPickWorkbenchFile = useCallback(
    (file: File) => requestOpen(file, false),
    [requestOpen],
  );
  const confirmPendingOpen = useCallback(() => {
    const pending = pendingOpen;
    setPendingOpen(null);
    if (pending) openDocument(pending.file, pending.fromDisk);
  }, [openDocument, pendingOpen]);

  const openImagePicker = useCallback(() => {
    document
      .querySelector<HTMLInputElement>('[data-testid="pdf-editor-image-input"]')
      ?.click();
  }, []);

  // Publish what the canvas top bar cannot reach on its own. Kept in an effect
  // so the canvas always sees the CURRENT handlers, and retracted on unmount so
  // a stale Save can never fire against a panel that is gone.
  useEffect(() => {
    setEditorSession({
      fileName: openedFileName,
      fileId: sourceFileId,
      save: handleSave,
      download: handleDownload,
      pickFile: onPickWorkbenchFile,
      pickImage: openImagePicker,
    });
    return () => setEditorSession(null);
  }, [
    openedFileName,
    sourceFileId,
    handleSave,
    handleDownload,
    onPickWorkbenchFile,
    openImagePicker,
  ]);

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
      data-testid="pdf-editor-root"
    >
      {state.error && (
        <Alert color="red" m="sm" data-testid="pdf-editor-error">
          {state.error}
        </Alert>
      )}
      <EditorFileInputs onPickPdf={onPickPdf} onPickImage={handleInsertImage} />
      {/* Declared here, not on the canvas: the canvas unmounts whenever the
          workbench shows something else, and a modal that only exists while
          the page stack is on screen cannot be opened from the panel. */}
      <HelpOverlay
        opened={state.helpOpen}
        onClose={() => store.setHelpOpen(false)}
      />
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
      <DiscardChangesModal
        incomingFileName={pendingOpen?.file.name ?? null}
        onConfirm={confirmPendingOpen}
        onCancel={() => setPendingOpen(null)}
      />
      <EditorSidebar
        store={store}
        state={state}
        selection={selection}
        canGroup={canGroup}
        canUngroup={canUngroup}
        onGroup={handleMergeSelection}
        onUngroup={handleUngroupSelection}
        onSetGroupingMode={(mode) => store.setGroupingMode(mode)}
        onSetWidthMode={(m) => store.setWidthMode(m)}
        onSetShowRulers={(show) => store.setShowRulers(show)}
      />
      {/* Every tool pins its primary action to the bottom of this panel, so
          the editor's Save lives there too, at every width. */}
      {state.hasDocument && (
        <EditorPanelActions
          compact={isMobile}
          openedFileName={openedFileName}
          dirty={state.dirty}
          currentFileId={sourceFileId}
          onPickFile={onPickWorkbenchFile}
          onSave={handleSave}
          onDownload={handleDownload}
          // The find bar lives beside the pages, so bring them back first -
          // on a phone the user still has to leave the panel to see it.
          onOpenFind={() => {
            if (store.getState().findOpen) {
              store.setFindOpen(false);
              return;
            }
            pinWorkbench();
            store.setFindOpen(true);
          }}
          onShowHelp={() => store.setHelpOpen(true)}
        />
      )}
    </Stack>
  );
}

/** Decode an image File to RGBA via an <img> element + canvas. */
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
