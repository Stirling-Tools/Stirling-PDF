import {
  assertFilesNotBlocked,
  policySourceIds,
} from "@editor/services/policyFileGuard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { downloadFile } from "@editor/services/downloadService";
import { assertPdfSessionEditable } from "@editor/services/pdfSessionUnlock";
import {
  getPdfAccess,
  rememberPdfAccess,
} from "@editor/services/pdfAccessService";
import { useFileContext, useFileSelection } from "@editor/contexts/FileContext";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useToolWorkflowActions } from "@editor/contexts/ToolWorkflowContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { createStirlingFilesAndStubs } from "@editor/services/fileStubHelpers";
import type { FileId } from "@editor/types/file";
import type { ToolId } from "@editor/types/toolId";
import type { BaseToolProps } from "@editor/types/tool";
import { useEditorStore } from "@editor/tools/pdfTextEditor/hooks/useEditorStore";
import { useEditorSelection } from "@editor/tools/pdfTextEditor/hooks/useEditorSelection";
import { useEditorOcr } from "@editor/tools/pdfTextEditor/hooks/useEditorOcr";
import {
  clearEditorSession,
  setEditorSession,
} from "@editor/tools/pdfTextEditor/store/EditorSession";
import { useIsMobile } from "@editor/hooks/useIsMobile";
import {
  useDocumentLoader,
  ensureAllPagesRead,
} from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { useAutoLoadFile } from "@editor/tools/pdfTextEditor/hooks/useAutoLoadFile";
import { useWorkbenchPin } from "@editor/tools/pdfTextEditor/hooks/useWorkbenchPin";
import { useUnsavedChangesGuard } from "@editor/tools/pdfTextEditor/hooks/useUnsavedChangesGuard";
import { useDeferredPanelView } from "@editor/tools/pdfTextEditor/hooks/useDeferredPanelView";
import { useEditorTestGlobal } from "@editor/tools/pdfTextEditor/hooks/useEditorTestGlobal";
import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import { useFontChangeWarning } from "@editor/tools/pdfTextEditor/components/fontPickFailure";
import { useEditorKeyboardShortcuts } from "@editor/tools/pdfTextEditor/hooks/useEditorKeyboardShortcuts";
import { useEditorClipboard } from "@editor/tools/pdfTextEditor/hooks/useEditorClipboard";
import { useOpenAtViewerText } from "@editor/tools/pdfTextEditor/hooks/useOpenAtViewerText";
import { SaveRiskModal } from "@editor/tools/pdfTextEditor/components/SaveRiskModal";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { DiscardChangesModal } from "@editor/tools/pdfTextEditor/components/DiscardChangesModal";
import { HelpOverlay } from "@editor/tools/pdfTextEditor/components/HelpOverlay";
import { PasswordPromptModal } from "@editor/tools/pdfTextEditor/components/PasswordPromptModal";
import { PermissionsPasswordButton } from "@editor/tools/pdfTextEditor/components/PermissionsPasswordButton";
import { useReviewLanguageBridge } from "@editor/tools/pdfTextEditor/hooks/useReviewLanguageBridge";
import { ReviewErrorPortal } from "@editor/tools/pdfTextEditor/components/review/ReviewErrorPortal";
import { EditorPanelActions } from "@editor/tools/pdfTextEditor/components/EditorPanelActions";
import {
  EditorSidebar,
  type SidebarProps,
} from "@editor/tools/pdfTextEditor/components/EditorSidebar";
import { useReviewStart } from "@editor/tools/pdfTextEditor/hooks/useReviewStart";
import {
  reviewMode,
  useReviewMode,
} from "@editor/tools/pdfTextEditor/store/reviewMode";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";
import { REVIEW_COLUMN_REM } from "@editor/tools/pdfTextEditor/components/review/QuickTagCard";
import { MobileEditorSheets } from "@editor/tools/pdfTextEditor/components/MobileEditorSheets";
import { EditorFileInputs } from "@editor/tools/pdfTextEditor/components/EditorFileInputs";
import { ViewerEditLayer } from "@editor/tools/pdfTextEditor/components/ViewerEditLayer";
import {
  ViewerEditActionBar,
  ViewerEditToolbar,
} from "@editor/tools/pdfTextEditor/components/ViewerEditToolbar";
import { useRegisterViewerPageTool } from "@editor/contexts/viewer/ViewerPageTool";
import {
  centredImageRect,
  InsertImageCommand,
} from "@editor/tools/pdfTextEditor/commands/InsertImageCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { jpegExifOrientation } from "@editor/utils/jpegOrientation";
import { MergeRunsCommand } from "@editor/tools/pdfTextEditor/commands/MergeRunsCommand";
import { UngroupParagraphCommand } from "@editor/tools/pdfTextEditor/commands/UngroupParagraphCommand";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { assertEditorOcrAllowed } from "@editor/tools/pdfTextEditor/util/ocrProtection";
import {
  detectSaveRisks,
  hasSaveRisks,
  type SaveRisks,
} from "@editor/tools/pdfTextEditor/util/documentRisks";
import { preloadFallbackFontBytes } from "@editor/tools/pdfTextEditor/util/fallbackFont";
import { useScanPrefit } from "@editor/tools/pdfTextEditor/hooks/useScanPrefit";
import { visiblePageNumber } from "@editor/tools/pdfTextEditor/util/dom";
import type {
  GroupingMode,
  WidthMode,
} from "@editor/tools/pdfTextEditor/types";

const INSERTED_IMAGE_RATIO = 0.4;
/** Stands in for an editing action while a review is on, where the editor only tags. */
const noop = () => {};

export default function PdfTextEditor(_props: BaseToolProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { store, state } = useEditorStore();
  const load = useDocumentLoader(store);
  const { activeFileId, setActiveFileId, scrollActions } = useViewer();

  const selection = useEditorSelection(store);
  const { reviewing, startAt } = useReviewMode();
  // A remount over a document still open carries on with its file, while the
  // viewer still shows it.
  const [initialSource] = useState(() =>
    store.getState().hasDocument && store.source.fileId === activeFileId
      ? store.source
      : { fileId: null, fileName: null },
  );
  const [openedFileName, setOpenedFileNameState] = useState(
    initialSource.fileName,
  );
  const setOpenedFileName = useCallback(
    (name: string | null) => {
      store.source = { ...store.source, fileName: name };
      setOpenedFileNameState(name);
    },
    [store],
  );
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // The workbench file being edited; save writes back to it. Mirrored into
  // state so the viewer can tell which file's pages are editable.
  const sourceFileIdRef = useRef<FileId | null>(initialSource.fileId);
  const [sourceFileId, setSourceFileId] = useState<FileId | null>(
    initialSource.fileId,
  );
  const setSourceFile = useCallback(
    (id: FileId | null) => {
      store.source = { ...store.source, fileId: id };
      sourceFileIdRef.current = id;
      setSourceFileId(id);
    },
    [store],
  );
  const { addFiles, consumeFiles, selectors } = useFileContext();
  const { setSelectedFiles } = useFileSelection();
  const { handleToolSelect } = useToolWorkflowActions();
  const { selectedTool, workbench } = useNavigationState();
  // Saving replaces the workbench file, so for a moment the selection points at
  // a file the editor has not adopted yet. Auto-load must sit that out.
  const [applying, setApplying] = useState(false);

  useEditorTestGlobal(store);
  // Dropping the document discards its edits; the file is then reopened fresh.
  const discardEdits = useCallback(() => store.clearDocument(), [store]);
  const isDirty = useCallback(() => store.getState().dirty, [store]);
  useUnsavedChangesGuard(state.dirty, isDirty);
  const pinWorkbench = useWorkbenchPin();
  // Opening a file can leave the workbench on Active Files, so landing a
  // document pins the viewer back.
  const handleFileChosen = useCallback(
    (name: string, fileId?: FileId) => {
      // The old document goes first: if the new file fails to open, a save
      // must not write the old one over it.
      store.clearDocument();
      setOpenedFileName(name);
      setSourceFile(fileId ?? null);
      pinWorkbench();
    },
    [store, pinWorkbench, setOpenedFileName, setSourceFile],
  );
  const {
    adopt: adoptFile,
    cancel: cancelAutoLoad,
    pendingSwitch,
    confirmSwitch,
    cancelSwitch,
  } = useAutoLoadFile(load, handleFileChosen, sourceFileId, applying, state);

  // The active file is the one being edited, including the new one a save
  // writes in place of the original.
  useEffect(() => {
    if (sourceFileId) setActiveFileId(sourceFileId);
  }, [sourceFileId, setActiveFileId]);
  useOpenAtViewerText(store, sourceFileId);

  // Warm the Unicode fallback font so a non-Latin edit can embed it instead of
  // dropping the glyphs.
  useEffect(() => {
    void preloadFallbackFontBytes();
  }, []);

  useScanPrefit(store, state);

  const sel = useSelectionActions(store);
  const warnAboutFontChange = useFontChangeWarning();

  // Guards against re-entrant saves while a (synchronous) serialize runs.
  const savingRef = useRef(false);
  /** Settles when the save savingRef marks ends, however it ends. */
  const saveSettledRef = useRef<Promise<void>>(Promise.resolve());
  // Pending save-risk warning (signatures/XFA) shown before the actual save.
  const [saveRisks, setSaveRisks] = useState<SaveRisks | null>(null);
  // docPtr the user already acknowledged risks for, so we don't re-nag.
  const ackedRiskRef = useRef<{ doc: object; sig: string } | null>(null);
  // Re-evaluated on EVERY save: the ack only covers the exact risk set the
  // user saw. A new risk appearing later must warn again.
  const unackedRisks = useCallback((doc: EditorDocument) => {
    const risks = detectSaveRisks(doc);
    if (!hasSaveRisks(risks)) return null;
    const acked = ackedRiskRef.current;
    return acked?.doc === doc && acked.sig === JSON.stringify(risks)
      ? null
      : risks;
  }, []);

  // Land the edit in the workbench the way every other tool does: replace the
  // file it came from, or add it if the document was opened from disk. Without
  // this the editor is an island and the next tool runs on the pre-edit bytes.
  const applyToWorkbench = useCallback(
    async (
      blob: Blob,
      filename: string,
      toolId: ToolId = "pdfTextEditor",
      isCurrent: () => boolean = () => true,
    ): Promise<File | null> => {
      const edited = new File([blob], filename, { type: "application/pdf" });
      const sourceId = sourceFileIdRef.current;
      const parentStub = sourceId
        ? selectors.getStirlingFileStub(sourceId)
        : null;
      const policyIds = parentStub
        ? policySourceIds(parentStub)
        : [sourceId ?? undefined];
      assertFilesNotBlocked(policyIds);
      setApplying(true);
      try {
        if (toolId === "ocr")
          assertEditorOcrAllowed(store.document, sourceId, t);
        const sourceAccess = getPdfAccess(sourceId);
        if (toolId === "pdfTextEditor" && sourceAccess?.encrypted) {
          assertPdfSessionEditable(sourceAccess);
          // PDFium native text exports preserve encryption and credentials; regression tests cover each supported cipher.
          rememberPdfAccess(edited, sourceAccess);
        }
        if (sourceId && parentStub) {
          const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
            [edited],
            parentStub,
            toolId,
          );
          if (!isCurrent()) return null;
          assertFilesNotBlocked(policyIds);
          if (toolId === "ocr")
            assertEditorOcrAllowed(store.document, sourceId, t);
          await consumeFiles([sourceId], stirlingFiles, stubs);
          // A file opened meanwhile is not the one just written.
          if (!isCurrent()) return null;
          // Claim the replacement before releasing the hold, otherwise the
          // editor sees an unfamiliar selection and re-opens the file it just
          // wrote, throwing away undo history.
          if (stirlingFiles[0]) adoptFile(stirlingFiles[0]);
          setSourceFile(stubs[0]?.id ?? null);
          return stirlingFiles[0] ?? null;
        }
        if (!isCurrent()) return null;
        const added = await addFiles([edited], {
          selectFiles: true,
          derivedFromTool: true,
        });
        if (!isCurrent()) return null;
        if (added[0]) adoptFile(added[0]);
        setSourceFile(added[0]?.fileId ?? null);
        return added[0] ?? null;
      } finally {
        setApplying(false);
      }
    },
    [addFiles, adoptFile, consumeFiles, selectors, setSourceFile, store, t],
  );

  const applyOcrResult = useCallback(
    async (file: File, isCurrent: () => boolean) => {
      const stored = await applyToWorkbench(file, file.name, "ocr", isCurrent);
      if (!stored || !isCurrent()) return;
      setOpenedFileName(stored.name);
      const loading = load(stored);
      const token = store.currentLoadToken;
      await loading;
      if (mountedRef.current && store.isCurrentLoad(token)) pinWorkbench();
    },
    [applyToWorkbench, load, pinWorkbench, setOpenedFileName, store],
  );
  const ocr = useEditorOcr({
    store,
    fileName: openedFileName,
    fileId: sourceFileId,
    onComplete: applyOcrResult,
  });

  const doSave = useCallback(
    async (download: boolean) => {
      const doc = store.document;
      if (!doc || savingRef.current || store.getState().loading) return;
      savingRef.current = true;
      let settle: () => void = () => {};
      saveSettledRef.current = new Promise<void>((resolve) => {
        settle = resolve;
      });
      store.setError(null);
      const sourceId = sourceFileIdRef.current;
      // A file switch confirmed while the export runs must not get these bytes.
      const isCurrent = () =>
        store.document === doc && sourceFileIdRef.current === sourceId;
      try {
        assertFilesNotBlocked([sourceId ?? undefined]);
        assertPdfSessionEditable(getPdfAccess(sourceId));
        // Yield once so React can paint the disabled/saving state before the
        // synchronous PDFium serialize blocks the main thread.
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!isCurrent()) return;
        // The position that is about to be written out. Anything the user edits
        // while the export runs is NOT in these bytes, so it must stay dirty.
        const exported = store.savedPosition();
        const blob = await exportToBlob(doc);
        const filename = openedFileName?.trim() || "edited.pdf";
        // Apply first and unconditionally. Gating the write-back on the browser
        // download dialog meant cancelling it silently discarded the save.
        assertFilesNotBlocked([sourceId ?? undefined]);
        if (!isCurrent()) return;
        const saved = await applyToWorkbench(
          blob,
          filename,
          "pdfTextEditor",
          isCurrent,
        );
        // The write-back swaps the source file id, so only the document is compared.
        if (!saved || store.document !== doc) return;
        store.markSaved(exported);
        if (download) {
          assertFilesNotBlocked([sourceId ?? undefined]);
          await downloadFile({ data: saved, filename });
        }
      } catch (err) {
        // Surface the failure instead of silently dropping it - the user
        // must not believe a broken save succeeded.
        store.setError(err instanceof Error ? err.message : String(err));
      } finally {
        savingRef.current = false;
        settle();
      }
    },
    [store, openedFileName, applyToWorkbench],
  );

  // Which action the risk modal is currently gating.
  const pendingDownloadRef = useRef(false);

  const runSave = useCallback(
    async (download: boolean) => {
      const doc = store.document;
      if (!doc || savingRef.current || store.getState().loading) return;
      const risks = unackedRisks(doc);
      if (risks) {
        pendingDownloadRef.current = download;
        setSaveRisks(risks);
        return;
      }
      await doSave(download);
    },
    [store, doSave, unackedRisks],
  );

  // Answers a risk warning raised from the app's unsaved-changes prompt.
  const riskAnswerRef = useRef<((save: boolean) => void) | null>(null);
  // A warning still open when the editor goes cancels, so the prompt that
  // waits on it can close.
  useEffect(
    () => () => {
      riskAnswerRef.current?.(false);
      riskAnswerRef.current = null;
    },
    [],
  );

  const saveBeforeLeaving = useCallback(async () => {
    const doc = store.document;
    const risks = doc && unackedRisks(doc);
    if (risks) {
      const save = await new Promise<boolean>((resolve) => {
        riskAnswerRef.current = resolve;
        setSaveRisks(risks);
      });
      if (!save) throw new Error("Save cancelled at the risk warning");
    }
    await doSave(false);
    // doSave reports its failures in the editor; the prompt must stay open.
    if (store.getState().dirty) throw new Error("Edits not saved");
  }, [store, doSave, unackedRisks]);

  const handleCancelSaveRisk = useCallback(() => {
    setSaveRisks(null);
    riskAnswerRef.current?.(false);
    riskAnswerRef.current = null;
  }, []);

  const toggleFind = useCallback(
    () => store.setFindOpen(!store.getState().findOpen),
    [store],
  );

  useReviewStart({ store, startAt, sourceFileId, setActiveFileId });
  useReviewLanguageBridge(store, state, sourceFileId, reviewing);

  useRegisterViewerPageTool(
    useMemo(
      () => ({
        fileId: sourceFileId,
        PageLayer: ViewerEditLayer,
        Toolbar: ViewerEditToolbar,
        // Small screens trade the viewer's page bar for the editing actions,
        // once there is a document to act on.
        BottomBar:
          isMobile && state.hasDocument ? ViewerEditActionBar : undefined,
        onDiscard: discardEdits,
        onSave: saveBeforeLeaving,
        onToggleFind: reviewing ? undefined : toggleFind,
        rightInsetRem: reviewing && !isMobile ? REVIEW_COLUMN_REM : undefined,
        hidesFormNotice: reviewing,
      }),
      [
        isMobile,
        reviewing,
        state.hasDocument,
        sourceFileId,
        discardEdits,
        saveBeforeLeaving,
        toggleFind,
      ],
    ),
  );

  const handleSave = useCallback(() => void runSave(false), [runSave]);
  const autosaveQueued = useRef(false);
  const handleAutosave = useCallback(async () => {
    // One queued save covers every change made while the current one runs.
    if (autosaveQueued.current) return;
    autosaveQueued.current = true;
    // Whatever started the running save (Save, a download, the leave prompt), it
    // exported before this change, so wait it out and save again.
    while (savingRef.current) await saveSettledRef.current;
    autosaveQueued.current = false;
    await runSave(false);
  }, [runSave]);
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
    const answer = riskAnswerRef.current;
    riskAnswerRef.current = null;
    if (answer) answer(true);
    else void doSave(pendingDownloadRef.current);
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
      const rect = centredImageRect(
        page.display,
        decoded.width,
        decoded.height,
        INSERTED_IMAGE_RATIO,
      );
      const cmd = new InsertImageCommand({
        pageIndex: page.pageIndex,
        rgba: decoded.data.data,
        pixelWidth: decoded.width,
        pixelHeight: decoded.height,
        ...rect,
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
    return (
      s.runIds.length > 0 || s.imageIds.length > 0 || s.shapeIds.length > 0
    );
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
      const pageIndex = visiblePageNumber();
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
    enabled: workbench === "viewer",
    onUndo: useCallback(() => store.undo(), [store]),
    onRedo: useCallback(() => store.redo(), [store]),
    onSave: handleSave,
    onDelete: reviewing ? noop : sel.deleteSelection,
    onDuplicate: reviewing ? noop : sel.duplicateFirstSelected,
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
    onOpenFind: useCallback(() => {
      if (!reviewing) store.setFindOpen(true);
    }, [store, reviewing]),
    onFindNext: reviewing ? noop : handleFindNext,
    onEscape: handleEscape,
    onMergeSelection: reviewing ? noop : handleMergeSelection,
    onToggleBold: useCallback(() => {
      if (!reviewing) void warnAboutFontChange(sel.toggleBold);
    }, [reviewing, warnAboutFontChange, sel.toggleBold]),
    onToggleItalic: useCallback(() => {
      if (!reviewing) void warnAboutFontChange(sel.toggleItalic);
    }, [reviewing, warnAboutFontChange, sel.toggleItalic]),
  });

  useEditorClipboard({
    enabled: workbench === "viewer",
    hasSelection,
    getSelectedText,
    deleteSelection: reviewing ? noop : sel.deleteSelection,
    insertPastedText: reviewing ? noop : insertPastedText,
  });

  const openImagePicker = useCallback(() => {
    document
      .querySelector<HTMLInputElement>('[data-testid="pdf-editor-image-input"]')
      ?.click();
  }, []);

  const handleSubmitPassword = useCallback(
    (password: string) => {
      const file = store.pendingPasswordFile;
      if (file) void load(file, password);
    },
    [store, load],
  );

  const handleCancelPassword = useCallback(() => {
    // A fix or a language waiting on the cancelled file would apply to it later.
    reviewMode.set({ startAt: null });
    reviewLanguage.set({ requested: null });
    const file = store.pendingPasswordFile;
    if (file) cancelAutoLoad(file);
    store.clearPasswordPrompt();
  }, [store, cancelAutoLoad]);

  const onSetGroupingMode = useCallback(
    (mode: GroupingMode) => store.setGroupingMode(mode),
    [store],
  );
  const onSetWidthMode = useCallback(
    (m: WidthMode) => store.setWidthMode(m),
    [store],
  );
  const onSetShowRulers = useCallback(
    (show: boolean) => store.setShowRulers(show),
    [store],
  );
  const runOcr = ocr.runOcr;
  const onRunOcr = useCallback(() => {
    if (!savingRef.current && !applying) void runOcr();
  }, [applying, runOcr]);
  const removePassword = useCallback(() => {
    if (!sourceFileId) return;
    setSelectedFiles([sourceFileId]);
    handleToolSelect("removePassword");
  }, [sourceFileId, setSelectedFiles, handleToolSelect]);
  const onOpenFind = useCallback(() => {
    if (store.toggleFindOpen()) pinWorkbench();
  }, [store, pinWorkbench]);
  const onShowHelp = useCallback(() => store.setHelpOpen(true), [store]);

  // Deferred so the typed letter is drawn before the panel, which a burst of typing outdates.
  const panel = useDeferredPanelView(state, selection);
  const canUngroup = useMemo(() => {
    const ids = panel.selection.runIds;
    if (ids.length !== 1) return false;
    const run = panel.state.pages
      .flatMap((p) => p.runs)
      .find((r) => r.id === ids[0]);
    return !!run && (run.paragraphLineCount ?? 0) > 1;
  }, [panel]);
  const ocrAvailable =
    panel.state.loading && !ocr.running ? null : ocr.available;
  const inspector = useMemo<
    Omit<SidebarProps, "store" | "state" | "selection" | "initialTab">
  >(
    () => ({
      canGroup: panel.selection.runIds.length >= 2,
      canUngroup,
      onGroup: handleMergeSelection,
      onUngroup: handleUngroupSelection,
      onRunOcr,
      ocrRunning: ocr.running,
      ocrAvailable,
      ocrBlockedReason: ocr.blockedReason,
      onRemovePassword: sourceFileId ? removePassword : undefined,
      onSetGroupingMode,
      onSetWidthMode,
      onSetShowRulers,
    }),
    [
      panel.selection.runIds.length,
      canUngroup,
      handleMergeSelection,
      handleUngroupSelection,
      onRunOcr,
      ocr.running,
      ocrAvailable,
      ocr.blockedReason,
      sourceFileId,
      removePassword,
      onSetGroupingMode,
      onSetWidthMode,
      onSetShowRulers,
    ],
  );
  useEffect(() => {
    const session = {
      fileName: openedFileName,
      save: handleSave,
      autosave: () => void handleAutosave(),
      download: handleDownload,
      pickImage: openImagePicker,
      // The viewer mounts only the pages near the viewport.
      revealPage: (pageIndex: number) =>
        scrollActions.scrollToPage(pageIndex + 1),
    };
    setEditorSession(session);
    return () => clearEditorSession(session);
  }, [
    scrollActions,
    openedFileName,
    handleSave,
    handleAutosave,
    handleDownload,
    openImagePicker,
  ]);

  const sidebarProps = {
    store,
    state: panel.state,
    selection: panel.selection,
    ...inspector,
  };

  return (
    <Stack
      gap={0}
      h="100%"
      style={{ overflow: "hidden" }}
      data-testid="pdf-editor-root"
    >
      {state.error && (
        <ReviewErrorPortal active={reviewing}>
          <Alert color="red" m="sm" data-testid="pdf-editor-error">
            <Stack gap="xs">
              <Text size="sm">{state.error}</Text>
              <PermissionsPasswordButton
                file={sourceFileId ? selectors.getFile(sourceFileId) : null}
                onVerified={(file) => void load(file)}
              />
            </Stack>
          </Alert>
        </ReviewErrorPortal>
      )}
      <EditorFileInputs onPickImage={handleInsertImage} />
      <HelpOverlay
        opened={state.helpOpen}
        onClose={() => store.setHelpOpen(false)}
      />
      <SaveRiskModal
        risks={saveRisks}
        onConfirm={handleConfirmSaveRisk}
        onCancel={handleCancelSaveRisk}
      />
      <PasswordPromptModal
        prompt={state.passwordPrompt}
        loading={state.loading}
        onSubmit={handleSubmitPassword}
        onCancel={handleCancelPassword}
      />
      <DiscardChangesModal
        incomingFileName={pendingSwitch?.name ?? null}
        onConfirm={confirmSwitch}
        onCancel={() => {
          // A fix or a language waiting on the declined file would apply to it later.
          reviewMode.set({ startAt: null });
          reviewLanguage.set({ requested: null });
          cancelSwitch();
        }}
      />
      {isMobile ? (
        <>
          <MobileEditorSheets {...sidebarProps} />
          <Text
            size="sm"
            c="dimmed"
            p="md"
            data-testid="pdf-editor-mobile-hint"
          >
            {t(
              "pdfTextEditor.mobile.panelHint",
              "Editing happens in the Workspace view. Tap text on the page to change it.",
            )}
          </Text>
        </>
      ) : (
        selectedTool === "pdfTextEditor" && <EditorSidebar {...sidebarProps} />
      )}
      {state.hasDocument && (
        <EditorPanelActions
          compact={isMobile}
          onSave={handleSave}
          onDownload={handleDownload}
          onOpenFind={onOpenFind}
          onShowHelp={onShowHelp}
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
