import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { SpreadMode } from "@embedpdf/plugin-spread/react";
import type { ZoomLevel } from "@embedpdf/plugin-zoom/react";
import { Box, Center, Text, Stack } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import {
  useAllFiles,
  useFileSelector,
  useFileSelectors,
  useFileActions,
} from "@app/contexts/FileContext";
import { useFileWithUrl } from "@app/hooks/useFileWithUrl";
import { ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { LocalEmbedPDF } from "@app/components/viewer/LocalEmbedPDF";
import { PdfViewerToolbar } from "@app/components/viewer/PdfViewerToolbar";
import { ThumbnailSidebar } from "@app/components/viewer/ThumbnailSidebar";
import { BookmarkSidebar } from "@app/components/viewer/BookmarkSidebar";
import { AttachmentSidebar } from "@app/components/viewer/AttachmentSidebar";
import { LayerSidebar } from "@app/components/viewer/LayerSidebar";
import {
  useNavigationGuard,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { useSignature } from "@app/contexts/SignatureContext";
import { useRedaction } from "@app/contexts/RedactionContext";
import type { RedactionPendingTrackerAPI } from "@app/components/viewer/RedactionPendingTracker";
import type {
  SignaturePreview,
  SignatureOverlayAPI,
} from "@app/components/viewer/viewerTypes";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import {
  isStirlingFile,
  getFormFillFileId,
  type StirlingFile,
  documentBytesReplaced,
  type DocumentIdentity,
} from "@app/types/fileContext";
import { useViewerWorkbenchBarButtons } from "@app/components/viewer/useViewerWorkbenchBarButtons";
import { StampPlacementOverlay } from "@app/components/viewer/StampPlacementOverlay";
import {
  RulerOverlay,
  type RulerOverlayHandle,
} from "@app/components/viewer/RulerOverlay";
import { useWheelZoom } from "@app/hooks/useWheelZoom";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import { FormSaveBar } from "@app/tools/formFill/FormSaveBar";
import { FORM_APPLY_EVENT } from "@app/tools/formFill/formFillEvents";
import { useViewerKeyCommand } from "@app/hooks/useViewerKeyCommand";
import { useMeasurementManager } from "@app/hooks/useMeasurementManager";
import { ScaleCalibrationDialog } from "@app/components/viewer/ScaleCalibrationDialog";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import { alert } from "@app/components/toast";

// ──────────────────────────────────────────────────────────────────────────────

export interface EmbedPdfViewerProps {
  onClose?: () => void;
  previewFile?: File | null;
  // ── Signature overlay pass-through (opt-in; all default off) ──────────────
  signaturePreviews?: SignaturePreview[];
  signaturePreviewsReadOnly?: boolean;
  signaturePlacementMode?: boolean;
  signaturePlacementData?: string;
  signaturePlacementType?: "canvas" | "image" | "text";
  onSignaturePreviewsChange?: (previews: SignaturePreview[]) => void;
  signatureOverlayApiRef?: React.RefObject<SignatureOverlayAPI | null>;
  /** Viewer is showing the pinned portfolio panel; don't render a second one. */
  portfolioPinned?: boolean;
}

/** Cache identity of a document, not of the file holding it: a disk reload
 *  replaces the bytes under an unchanged fileId, and an outline cached under the
 *  id alone would then describe a document nobody is looking at. Preload keys are
 *  matched against this, so both call sites must derive it the same way. */
const documentCacheKey = (file: StirlingFile): string =>
  `${file.fileId}|${file.quickKey}`;

const SWAP_REVEAL_DEADLINE_MS = 700;

const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (
      node.scrollHeight > node.clientHeight + 5 &&
      /auto|scroll/.test(style.overflowY)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

const EmbedPdfViewerContent = ({
  onClose,
  previewFile,
  signaturePreviews,
  signaturePreviewsReadOnly,
  signaturePlacementMode,
  signaturePlacementData,
  signaturePlacementType,
  onSignaturePreviewsChange,
  signatureOverlayApiRef,
  portfolioPinned,
}: EmbedPdfViewerProps) => {
  const { t } = useTranslation();
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isViewerHovered, setIsViewerHovered] = React.useState(false);

  const {
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    isBookmarkSidebarVisible,
    isAttachmentSidebarVisible,
    isLayerSidebarVisible,
    setHasLayers,
    isCommentsSidebarVisible,
    isSearchInterfaceVisible,
    searchInterfaceActions,
    zoomActions,
    scrollActions,
    panActions: _panActions,
    rotationActions,
    getScrollState,
    getSpreadState,
    getZoomState,
    getRotationState,
    spreadActions,
    zoomRestorePendingRef,
    notifyZoomRestoreSettled,
    setAnnotationMode,
    isAnnotationsVisible,
    exportActions,
    printActions,
    selectionActions,
    setApplyChanges,
    applyChanges: viewerApplyChanges,
    pdfRenderMode,
    cyclePdfRenderMode,
    setActiveFileIndex: _setActiveFileIndex,
    activeFileId,
    setActiveFileId,
  } = useViewer();

  const scrollState = getScrollState();
  const rotationState = getRotationState();

  // Track initial rotation to detect changes
  const initialRotationRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      initialRotationRef.current === null &&
      rotationState.rotation !== undefined
    ) {
      initialRotationRef.current = rotationState.rotation;
    }
  }, [rotationState.rotation]);

  // Get signature and annotation contexts
  const {
    signatureApiRef,
    annotationApiRef,
    historyApiRef,
    signatureConfig,
    isPlacementMode,
  } = useSignature();

  // Track whether there are unsaved annotation changes in this viewer session.
  // This is our source of truth for navigation guards; it is set when the
  // annotation history changes, and cleared after we successfully apply changes.
  const hasAnnotationChangesRef = useRef(false);
  // EmbedPDF can emit once from the saved undo stack before the saved file remounts.
  // Ignore that stale update without suppressing future edits on the same instance.
  // Save point for annotations: history edits before the last save stay
  // undoable, but only edits after it make the document unsaved again.
  const historyRevisionRef = useRef(0);
  const savedHistoryRevisionRef = useRef(0);
  const suppressHistoryDirtyRef = useRef(false);

  // Scroll position preservation system
  // We continuously track the last known good scroll position, so we always have it available
  const lastKnownScrollPageRef = useRef<number>(1);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const scrollRestoreAttemptsRef = useRef<number>(0);

  // Rotation preservation system
  // Similar to scroll preservation - track rotation across file reloads
  const pendingRotationRestoreRef = useRef<number | null>(null);
  const rotationRestoreAttemptsRef = useRef<number>(0);

  // The zoom survives an in-place reload, mode or number: a replacement opens
  // at the plugin default otherwise, which reads as the zoom changing.
  const pendingZoomRestoreRef = useRef<ZoomLevel | null>(null);
  // Spread mode is per document, so a replacement opens single-page unless it
  // is carried over like the position.
  const pendingSpreadRestoreRef = useRef<SpreadMode | null>(null);
  const spreadRestoreAttemptsRef = useRef(0);
  // The toolbar must not show the plugin's intermediate fit pass while a
  // carried zoom lands, so the bridge publishes nothing until this settles.
  const settleZoomRestore = useCallback(() => {
    zoomRestorePendingRef.current = false;
    notifyZoomRestoreSettled();
  }, [zoomRestorePendingRef, notifyZoomRestoreSettled]);
  const zoomRestoreAttemptsRef = useRef<number>(0);
  // Reading position captured from the outgoing document: the page's node
  // identifies the swap, the offsets restore the exact spot within the page.
  const pendingScrollPositionRef = useRef<{
    page: number;
    offsetPx: number | null;
    offsetFraction: number | null;
    pageHeight: number | null;
    element: HTMLElement | null;
    scroller: HTMLElement | null;
    expectSwap: boolean;
    /** A fraction apply landed against the replacement's own geometry. */
    fractionApplied: boolean;
  } | null>(null);
  const pendingScrollSwappedRef = useRef(false);
  const pendingScrollReassertTimerRef = useRef<number | null>(null);
  // Content key of a just-saved file whose visual state the live document
  // already shows: skip the reopen so a save cannot move the view.
  const skipReloadContentKeyRef = useRef<string | null>(null);
  // Bumped when a replacement seeds the pending refs, so the restore effects
  // run even when the page count does not change across the swap.
  const [restoreTick, setRestoreTick] = useState(0);
  // True only while a restore is in flight, so the per-page layout hook and
  // the swap backstop cost nothing during ordinary scrolling.
  const [restorePending, setRestorePending] = useState(false);
  // A replacement renders at the wrong scale until its zoom lands, so the
  // scroller hides for that window; the deadline cannot leave it hidden.
  const swapRevealRef = useRef<{
    scroller: HTMLElement | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ scroller: null, timer: null });
  // Last scroll target the restore computed, used to reveal only once the
  // layout has stopped moving the target around.
  const swapTargetRef = useRef<number | null>(null);
  // Layout signature (page height + content height) of the last apply, so the
  // per-frame hold can skip when the page already sits at the target.
  const swapLayoutRef = useRef<string | null>(null);
  // The swap bridge activates replacements, and React can reuse the page
  // nodes, so node identity alone cannot tell that a new document is mounted.
  const documentSwappedRef = useRef(false);
  const scrollIntentCleanupRef = useRef<(() => void) | null>(null);

  const revealSwappedDocument = useCallback(() => {
    const state = swapRevealRef.current;
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.scroller) {
      state.scroller.style.visibility = "";
      state.scroller = null;
    }
  }, []);

  const detachScrollIntentListeners = useCallback(() => {
    scrollIntentCleanupRef.current?.();
    scrollIntentCleanupRef.current = null;
  }, []);

  // Single release path: drop the target, stop the hold, stop listening for
  // intent and show the content again.
  const clearPendingScrollRestore = useCallback(() => {
    pendingScrollPositionRef.current = null;
    if (pendingScrollReassertTimerRef.current !== null) {
      cancelAnimationFrame(pendingScrollReassertTimerRef.current);
      pendingScrollReassertTimerRef.current = null;
    }
    detachScrollIntentListeners();
    revealSwappedDocument();
    setRestorePending(false);
  }, [detachScrollIntentListeners, revealSwappedDocument]);

  const attachScrollIntentListeners = useCallback(() => {
    const scroller = pendingScrollPositionRef.current?.scroller;
    if (!scroller || scrollIntentCleanupRef.current) return;
    const release = () => clearPendingScrollRestore();
    const events = ["wheel", "touchstart", "pointerdown", "keydown"];
    for (const name of events) {
      scroller.addEventListener(name, release, { passive: true });
    }
    scrollIntentCleanupRef.current = () => {
      for (const name of events) {
        scroller.removeEventListener(name, release);
      }
    };
  }, [clearPendingScrollRestore]);

  const hideUntilSettled = useCallback(
    (scroller: HTMLElement | null) => {
      if (!scroller) return;
      swapRevealRef.current.scroller = scroller;
      scroller.style.visibility = "hidden";
      if (swapRevealRef.current.timer !== null) {
        clearTimeout(swapRevealRef.current.timer);
      }
      swapRevealRef.current.timer = setTimeout(
        clearPendingScrollRestore,
        SWAP_REVEAL_DEADLINE_MS,
      );
    },
    [clearPendingScrollRestore],
  );

  const queueScrollRestore = useCallback((page: number, expectSwap = false) => {
    pendingScrollRestoreRef.current = page;
    scrollRestoreAttemptsRef.current = 0;
    pendingScrollSwappedRef.current = false;

    const element = document.querySelector<HTMLElement>(
      `[data-page-index="${page - 1}"]`,
    );
    const scroller = findScrollableAncestor(element);
    if (!element || !scroller) {
      pendingScrollPositionRef.current = null;
      swapTargetRef.current = null;
      swapLayoutRef.current = null;
      documentSwappedRef.current = false;
      return;
    }
    const scrollerTop = scroller.getBoundingClientRect().top;
    const pageTopInContent =
      element.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
    const offsetPx = scroller.scrollTop - pageTopInContent;
    const offsetFraction =
      element.clientHeight > 0 ? offsetPx / element.clientHeight : 0;
    pendingScrollPositionRef.current = {
      page,
      offsetPx,
      offsetFraction,
      pageHeight: element.clientHeight,
      element,
      scroller,
      expectSwap,
      fractionApplied: false,
    };
    swapTargetRef.current = null;
    swapLayoutRef.current = null;
    documentSwappedRef.current = false;
  }, []);

  const applyScrollNow = useCallback(
    (useFraction: boolean): boolean => {
      const pending = pendingScrollPositionRef.current;
      if (
        !pending ||
        pending.offsetPx === null ||
        pending.offsetFraction === null
      ) {
        clearPendingScrollRestore();
        return false;
      }
      const pageEl = document.querySelector<HTMLElement>(
        `[data-page-index="${pending.page - 1}"]`,
      );
      // The scroller survives document swaps; walking ancestors on every frame
      // of the hold is what made it expensive.
      const scroller =
        pending.scroller && pending.scroller.isConnected
          ? pending.scroller
          : findScrollableAncestor(pageEl);
      if (!pageEl || !scroller) return false;
      pending.scroller = scroller;

      // The fraction only matters when the page geometry changed (a zoom
      // restore); otherwise the captured pixel offset is exact.
      const heightChanged =
        pending.pageHeight !== null &&
        Math.abs(pageEl.clientHeight - pending.pageHeight) > 1;
      // A fraction apply means the replacement's geometry is settled even
      // though it differs; a carried zoom keeps it unsettled until it lands.
      const geometrySettled =
        (!heightChanged || pending.fractionApplied) &&
        pendingZoomRestoreRef.current === null;

      // Nothing moved since the last apply: no rect reads needed, but the
      // settled scale still has to reveal the content.
      const layoutSignature = `${pageEl.clientHeight}|${scroller.scrollHeight}`;
      const lastTarget = swapTargetRef.current;
      if (
        layoutSignature === swapLayoutRef.current &&
        lastTarget !== null &&
        Math.abs(scroller.scrollTop - lastTarget) <= 1
      ) {
        if (geometrySettled) {
          revealSwappedDocument();
        }
        return true;
      }
      const offset =
        useFraction && heightChanged
          ? pending.offsetFraction * pageEl.clientHeight
          : pending.offsetPx;
      const scrollerTop = scroller.getBoundingClientRect().top;
      const pageTopInContent =
        pageEl.getBoundingClientRect().top - scrollerTop + scroller.scrollTop;
      const target = Math.max(0, pageTopInContent + offset);
      swapLayoutRef.current = layoutSignature;
      scroller.scrollTop = target;
      // Reveal once the scale settled and two frames agree on the target: a
      // neighbour still moves it while the height already matches.
      const stable =
        geometrySettled &&
        swapTargetRef.current !== null &&
        Math.abs(swapTargetRef.current - target) <= 2;
      swapTargetRef.current = target;
      if (useFraction && heightChanged) {
        // The fraction now maps to the replacement's own page height.
        pending.fractionApplied = true;
      }
      if (stable) {
        revealSwappedDocument();
      }
      return true;
    },
    [revealSwappedDocument],
  );

  // Re-apply the captured position to the swapped document. Returns false until
  // the replacement page node exists and while no offset was captured.
  const applyPendingScrollPosition = useCallback(
    (options?: { useFraction?: boolean }): boolean => {
      const pending = pendingScrollPositionRef.current;
      if (!pending) return false;

      const pageEl = document.querySelector<HTMLElement>(
        `[data-page-index="${pending.page - 1}"]`,
      );
      if (!pendingScrollSwappedRef.current) {
        const replaced =
          !!pageEl && (pending.element ? pageEl !== pending.element : true);
        // Same-document restores apply straight away; a byte replacement waits
        // for the swap bridge or the new page node.
        const sameDocument = !pending.expectSwap;
        if (!replaced && !documentSwappedRef.current && !sameDocument) {
          return false;
        }
        if (!pending.scroller?.isConnected) {
          pending.scroller = findScrollableAncestor(pageEl);
        }
        if (!sameDocument) {
          // First frame of the replacement: hide it until it settles so no
          // wrong-scale or wrong-position frame can be seen.
          hideUntilSettled(pending.scroller);
        }
        attachScrollIntentListeners();
      }
      if (!applyScrollNow(options?.useFraction ?? false)) return false;
      pendingScrollSwappedRef.current = true;

      // The replacement's own ready pass can still reset the scroll, so hold
      // the position per frame for a short bounded window.
      if (pendingScrollReassertTimerRef.current) {
        cancelAnimationFrame(pendingScrollReassertTimerRef.current);
      }
      const useFraction = options?.useFraction ?? false;
      const holdUntil = performance.now() + 1_500;
      const reassert = () => {
        if (!pendingScrollPositionRef.current) return;
        if (performance.now() >= holdUntil) {
          clearPendingScrollRestore();
          return;
        }
        applyScrollNow(useFraction);
        pendingScrollReassertTimerRef.current = requestAnimationFrame(reassert);
      };
      pendingScrollReassertTimerRef.current = requestAnimationFrame(reassert);

      return true;
    },
    [
      applyScrollNow,
      clearPendingScrollRestore,
      hideUntilSettled,
      attachScrollIntentListeners,
      revealSwappedDocument,
    ],
  );

  const formApplyInProgressRef = useRef(false);
  const applyChangesInFlightRef = useRef<Promise<void> | null>(null);

  // Get redaction context
  const {
    redactionsApplied,
    setRedactionsApplied,
    deactivateRedact,
    setRedactionMode,
  } = useRedaction();

  // Ref for redaction pending tracker API
  const redactionTrackerRef = useRef<RedactionPendingTrackerAPI>(null);

  // Get current file from FileContext
  const selectors = useFileSelectors();
  const { actions } = useFileActions();
  const { files: activeFiles } = useAllFiles();
  const activeFilesRef = useRef(activeFiles);
  activeFilesRef.current = activeFiles;
  const activeFileIds = activeFiles.map((f) => f.fileId);

  // Navigation guard for unsaved changes
  const {
    setHasUnsavedChanges,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  } = useNavigationGuard();

  const { selectedTool } = useNavigationState();

  useEffect(() => {
    if (selectedTool !== "redact") {
      setRedactionMode(false);
      deactivateRedact();
    }
  }, [selectedTool, setRedactionMode, deactivateRedact]);

  // Form fill context
  const { fetchFields: fetchFormFields, setProviderMode } = useFormFill();

  const isInAnnotationTool =
    selectedTool === "sign" ||
    selectedTool === "addText" ||
    selectedTool === "addImage" ||
    selectedTool === "annotate";
  const isManualRedactMode = selectedTool === "redact";

  // Live layer visibility is controlled via showBakedAnnotations CSS; unmounting
  // AnnotationPlugin on visibility toggle destroys in-memory annotations.
  const shouldEnableAnnotations = true;

  // Enable redaction only when redaction tool is selected
  const shouldEnableRedaction = selectedTool === "redact";

  // FormFill tool mode — uses PDFBox backend for full-fidelity form handling
  const isFormFillToolActive = (selectedTool as string) === "formFill";

  // Form overlays are shown in BOTH modes:
  // - Normal viewer: form overlays visible (PDFium WASM, frontend-only)
  // - formFill tool: form overlays visible (PDFBox, backend)
  const shouldEnableFormFill = true;

  // Switch the provider when the tool mode changes
  useEffect(() => {
    setProviderMode(isFormFillToolActive ? "pdfbox" : "pdflib");
  }, [isFormFillToolActive, setProviderMode]);

  // Track previous annotation/redaction state to detect tool switches
  const prevEnableAnnotationsRef = useRef(shouldEnableAnnotations);
  const prevEnableRedactionRef = useRef(shouldEnableRedaction);

  // Track scroll position whenever scrollState changes from the context
  // This ensures we always have the most up-to-date position
  useEffect(() => {
    if (scrollState.currentPage > 0) {
      lastKnownScrollPageRef.current = scrollState.currentPage;
    }
  }, [scrollState.currentPage]);

  // Preserve scroll position when switching between annotation and redaction tools
  // Using useLayoutEffect to capture synchronously before DOM updates
  useLayoutEffect(() => {
    const annotationsChanged =
      prevEnableAnnotationsRef.current !== shouldEnableAnnotations;
    const redactionChanged =
      prevEnableRedactionRef.current !== shouldEnableRedaction;

    if (annotationsChanged || redactionChanged) {
      // Read scroll state directly AND use the tracked value - take whichever is valid
      const currentScrollState = getScrollState();
      const pageFromState = currentScrollState.currentPage;
      const pageFromRef = lastKnownScrollPageRef.current;

      // Use the current state if valid, otherwise fall back to tracked ref
      const pageToRestore = pageFromState > 0 ? pageFromState : pageFromRef;

      if (pageToRestore > 0) {
        queueScrollRestore(pageToRestore);
      }

      prevEnableAnnotationsRef.current = shouldEnableAnnotations;
      prevEnableRedactionRef.current = shouldEnableRedaction;
    }
  }, [shouldEnableAnnotations, shouldEnableRedaction, getScrollState]);

  // Keep annotation mode enabled when entering placement tools without overriding manual toggles
  useEffect(() => {
    if (isInAnnotationTool) {
      setAnnotationMode(true);
    }
  }, [isInAnnotationTool, setAnnotationMode]);
  const isPlacementOverlayActive = Boolean(
    isInAnnotationTool && isPlacementMode && signatureConfig,
  );

  // Determine which file to display — use activeFileId (stable) not activeFileIndex (shifts on removal)
  const currentFile = React.useMemo(() => {
    if (previewFile) {
      return previewFile;
    } else if (activeFiles.length > 0) {
      const byId = activeFileId
        ? activeFiles.find(
            (f) => isStirlingFile(f) && f.fileId === activeFileId,
          )
        : null;
      return byId || activeFiles[0];
    }
    return null;
  }, [previewFile, activeFiles, activeFileId]);

  // Identity of the bytes: the viewer's mount key, its blob URL and form-fill
  // state all have to turn over when a disk reload swaps the file under an
  // unchanged fileId. Keep aligned with FormFill.
  const currentFileId = React.useMemo(
    () => getFormFillFileId(currentFile),
    [currentFile],
  );

  // The workbench record to act on. Bare id, not the content key above: the
  // consume/undo paths below pass it back as a FileId.
  const currentFileStableId =
    currentFile && isStirlingFile(currentFile) ? currentFile.fileId : null;
  const fileWithUrl = useFileWithUrl(currentFile, currentFileId);

  // Lineage root of the open document: saves and tool outputs add a child record,
  // so mounting on the root keeps the engine alive across reloads.
  const currentFileRootId = React.useMemo(() => {
    if (previewFile) {
      return `preview-${previewFile.name}|${previewFile.size}|${previewFile.lastModified}`;
    }
    if (currentFile && isStirlingFile(currentFile)) {
      const stub = selectors.getStirlingFileStub(currentFile.fileId);
      return stub?.originalFileId ?? stub?.id ?? currentFile.fileId;
    }
    return currentFileId;
  }, [previewFile, currentFile, currentFileId, selectors]);

  // Determine the effective file to display
  const effectiveFile = React.useMemo(() => {
    if (previewFile) {
      // In preview mode, show the preview file
      if (previewFile.size === 0) {
        return null;
      }
      return { file: previewFile, url: null };
    } else {
      return fileWithUrl;
    }
  }, [previewFile, fileWithUrl]);

  // Check if the current file is encrypted (gate the viewer to prevent PDFium crash)
  const isCurrentFileEncrypted = useFileSelector((s) =>
    currentFile && isStirlingFile(currentFile)
      ? s.files.byId[currentFile.fileId]?.processedFile?.isEncrypted === true
      : false,
  );

  const bookmarkCacheKey = React.useMemo(() => {
    if (currentFile && isStirlingFile(currentFile)) {
      return documentCacheKey(currentFile);
    }

    if (previewFile) {
      const uniquePreviewId = `${previewFile.name}-${previewFile.size}-${previewFile.lastModified ?? "na"}`;
      return `preview-${uniquePreviewId}`;
    }

    if (effectiveFile?.url) {
      return effectiveFile.url;
    }

    if (effectiveFile?.file instanceof File) {
      const fileObj = effectiveFile.file;
      return `file-${fileObj.name}-${fileObj.size}-${fileObj.lastModified ?? "na"}`;
    }

    return undefined;
  }, [currentFile, effectiveFile, previewFile]);

  // Generate cache keys for all active files to enable preloading
  const allBookmarkCacheKeys = React.useMemo(() => {
    if (previewFile) {
      return [bookmarkCacheKey].filter(Boolean) as string[];
    }

    return activeFiles
      .map((file) =>
        isStirlingFile(file) ? documentCacheKey(file) : undefined,
      )
      .filter(Boolean) as string[];
  }, [activeFiles, previewFile, bookmarkCacheKey]);

  useWheelZoom({
    ref: viewerRef,
    onZoomIn: zoomActions.zoomIn,
    onZoomOut: zoomActions.zoomOut,
  });

  const viewerKeyCommand = useViewerKeyCommand();

  const policyFileBadges = usePolicyFileBadges();
  const policyEnforcing =
    !!activeFileId &&
    (policyFileBadges.get(activeFileId) ?? []).some((p) => p.enforcing);
  // Use a ref so the keydown handler always reads the latest value without
  // needing to be in the effect's dependency array.
  const policyEnforcingRef = useRef(false);
  policyEnforcingRef.current = policyEnforcing;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      // Ctrl+P (print) must be intercepted unconditionally
      // whenever the viewer is mounted, even before the user has hovered over it.
      // Ctrl+R (rotate) is intercepted only on desktop (Tauri), while on web it still falls through to browser refresh.
      // Without this, the browser falls through to its native "print HTML page"
      // or "reload page" behaviour.

      if (mod) {
        const target = event.target as Element;
        const isInTextInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable;

        if (!isInTextInput) {
          const wasOverridden = viewerKeyCommand(event);
          if (!wasOverridden) {
            switch (event.key) {
              case "p":
              case "P":
                event.preventDefault();
                if (!policyEnforcingRef.current) {
                  printActions.print();
                }
                return;
              case "a":
              case "A":
                // Intercept unconditionally so the browser can't blanket-select the surrounding UI chrome.
                event.preventDefault();
                {
                  const totalPages = getScrollState().totalPages;
                  if (totalPages > 0) {
                    void selectionActions.selectAll(totalPages);
                  }
                }
                return;
              case "=":
              case "+":
                event.preventDefault();
                zoomActions.zoomIn();
                return;
              case "-":
              case "_":
                event.preventDefault();
                zoomActions.zoomOut();
                return;
              case "0":
                event.preventDefault();
                zoomActions.requestZoom(ZoomMode.FitWidth);
                return;
            }
          }
        }
      }

      // All remaining shortcuts require the viewer to be hovered so they
      // don't conflict with the rest of the UI when the viewer is mounted
      // but not the active focus target.
      if (!isViewerHovered) return;

      // Modifier key shortcuts (Ctrl/Cmd + key)
      if (mod) {
        switch (event.key) {
          case "f":
          case "F":
            event.preventDefault();
            if (isSearchInterfaceVisible) {
              window.dispatchEvent(new CustomEvent("refocus-search-input"));
            } else {
              searchInterfaceActions.open();
            }
            return;
          case "s":
          case "S":
            // Ctrl+S: Save/apply changes
            if (!event.shiftKey) {
              event.preventDefault();
              if (viewerApplyChanges) {
                viewerApplyChanges();
              }
            }
            return;

          case "z":
          case "Z":
            // Ctrl+Z: Undo; Ctrl+Shift+Z: Redo
            event.preventDefault();
            if (event.shiftKey) {
              historyApiRef.current?.redo?.();
            } else {
              historyApiRef.current?.undo?.();
            }
            return;
          case "y":
          case "Y":
            // Ctrl+Y: Redo
            event.preventDefault();
            historyApiRef.current?.redo?.();
            return;
        }
        return;
      }

      // Non-modifier shortcuts
      switch (event.key) {
        case "Home":
          event.preventDefault();
          scrollActions.scrollToFirstPage();
          return;
        case "End":
          event.preventDefault();
          scrollActions.scrollToLastPage();
          return;
        case "PageUp":
          event.preventDefault();
          scrollActions.scrollToPreviousPage();
          return;
        case "PageDown":
          event.preventDefault();
          scrollActions.scrollToNextPage();
          return;
        case "Escape":
          if (isSearchInterfaceVisible) {
            event.preventDefault();
            searchInterfaceActions.close();
          }
          return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isViewerHovered,
    isSearchInterfaceVisible,
    zoomActions,
    searchInterfaceActions,
    scrollActions,
    printActions,
    exportActions,
    rotationActions,
    historyApiRef,
    viewerApplyChanges,
    cyclePdfRenderMode,
    viewerKeyCommand,
    selectionActions,
    getScrollState,
  ]);

  // Accepting a disk reload swaps the bytes under an unchanged fileId, which
  // remounts the inner viewer with a clean history but leaves these flags
  // describing edits that no longer exist: every later disk change then reads as
  // a conflict, and navigation keeps warning about work already discarded.
  const documentIdentityRef = useRef<DocumentIdentity | null>(null);
  useEffect(() => {
    const previous = documentIdentityRef.current;
    const current =
      currentFileStableId && currentFileId
        ? { id: currentFileStableId, key: currentFileId }
        : null;
    documentIdentityRef.current = current;

    if (!documentBytesReplaced(previous, current)) return;

    hasAnnotationChangesRef.current = false;
    historyRevisionRef.current = 0;
    savedHistoryRevisionRef.current = 0;
    setHasUnsavedChanges(false);
    setRedactionsApplied(false);
  }, [
    currentFileStableId,
    currentFileId,
    setHasUnsavedChanges,
    setRedactionsApplied,
  ]);

  // Watch the annotation history API to detect when the document becomes "dirty".
  // We treat any change that makes the history undoable as unsaved changes until
  // the user explicitly applies them via applyChanges.
  useEffect(() => {
    const historyApi = historyApiRef.current;
    if (!historyApi || !historyApi.subscribe) {
      return;
    }

    const updateHasChanges = () => {
      const canUndo = historyApi.canUndo?.() ?? false;
      if (!canUndo && savedHistoryRevisionRef.current === 0) {
        historyRevisionRef.current = 0;
        hasAnnotationChangesRef.current = false;
        const hasPendingRedactions =
          (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;
        if (!hasPendingRedactions && !redactionsApplied) {
          setHasUnsavedChanges(false);
        }
        return;
      }
      historyRevisionRef.current += 1;
      if (suppressHistoryDirtyRef.current) return;
      // A revision equal to the save point means the annotations match the
      // exported bytes again (for example an undo that lands back on them).
      const annotationDirty =
        historyRevisionRef.current !== savedHistoryRevisionRef.current;
      hasAnnotationChangesRef.current = annotationDirty;
      if (annotationDirty) {
        setHasUnsavedChanges(true);
        return;
      }
      // Undo back to the saved state disarms the warning, but redactions keep
      // their own claim on the flag.
      const hasPendingRedactions =
        (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;
      if (!hasPendingRedactions && !redactionsApplied) {
        setHasUnsavedChanges(false);
      }
    };

    const unsubscribe = historyApi.subscribe(updateHasChanges);
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    historyApiRef.current,
    setHasUnsavedChanges,
    redactionsApplied,
    redactionTrackerRef,
  ]);

  // Register checker for unsaved changes (annotations only for now)
  useEffect(() => {
    if (previewFile) {
      return;
    }

    const checkForChanges = () => {
      // Check for annotation history changes (using ref that's updated by useEffect)
      const hasAnnotationChanges = hasAnnotationChangesRef.current;

      // Check for pending redactions
      const hasPendingRedactions =
        (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;

      // Always consider applied redactions as unsaved until export
      const hasAppliedRedactions = redactionsApplied;

      return (
        hasAnnotationChanges || hasPendingRedactions || hasAppliedRedactions
      );
    };

    registerUnsavedChangesChecker(checkForChanges);

    return () => {
      unregisterUnsavedChangesChecker();
    };
  }, [
    historyApiRef,
    previewFile,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    isManualRedactMode,
    redactionsApplied,
  ]);

  // Save changes - save annotations and redactions to file (overwrites active file)
  const applyChanges = useCallback(async () => {
    if (applyChangesInFlightRef.current) {
      return applyChangesInFlightRef.current;
    }

    if (!currentFile || activeFileIds.length === 0) return;

    const saveChanges = async () => {
      console.log(
        "[Viewer] Applying changes - exporting PDF with annotations/redactions",
      );

      // Step 0: Commit any pending redactions before export
      const hadPendingRedactions =
        (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;

      // Mark redactions as applied BEFORE committing, so the button stays enabled during the save process
      // This ensures the button doesn't become disabled when pendingCount becomes 0
      if (hadPendingRedactions || redactionsApplied) {
        setRedactionsApplied(true);
      }

      if (hadPendingRedactions) {
        console.log("[Viewer] Committing pending redactions before export");
        redactionTrackerRef.current?.commitAllPending();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Step 1: Export PDF with annotations using EmbedPDF
      suppressHistoryDirtyRef.current = true;
      const exportRevision = historyRevisionRef.current;
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error("Failed to export PDF");
      }

      // Step 2: Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const filename = currentFile.name || "document.pdf";
      const file = new File([blob], filename, { type: "application/pdf" });

      // Step 3: Create StirlingFiles and stubs for version history
      // Only consume the current file, not all active files
      const currentFileId = currentFileStableId;
      if (!currentFileId) throw new Error("Current file ID not found");

      const parentStub = selectors.getStirlingFileStub(currentFileId);
      if (!parentStub) throw new Error("Parent stub not found");

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [file],
        parentStub,
        selectedTool ?? "multiTool",
      );

      // The live document already renders what was exported, and a reopen would
      // reset the scroll, so the save must not reopen it.
      const savedFile = stirlingFiles[0];
      if (savedFile) {
        skipReloadContentKeyRef.current = getFormFillFileId(savedFile);
      }

      // Track the new file ID so the viewer follows it after the list reorders
      const newFileId = stubs[0]?.id;
      if (newFileId) setActiveFileId(newFileId);

      // Step 4: Consume only the current file (replace in context)
      await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

      // The exported bytes cover everything up to this revision; an edit that
      // landed while the save was in flight stays unsaved.
      savedHistoryRevisionRef.current = exportRevision;
      hasAnnotationChangesRef.current =
        historyRevisionRef.current !== exportRevision;
      suppressHistoryDirtyRef.current = false;
      setHasUnsavedChanges(hasAnnotationChangesRef.current);
      setRedactionsApplied(false);
    };

    const savePromise = saveChanges()
      .catch((error) => {
        suppressHistoryDirtyRef.current = false;
        console.error("Apply changes failed:", error);
        alert({
          title: t("viewer.saveChangesErrorTitle", "Could not save changes"),
          body:
            error instanceof Error && error.message
              ? error.message
              : t(
                  "viewer.saveChangesErrorBody",
                  "The document could not be saved. Try again.",
                ),
          alertType: "error",
        });
        throw error;
      })
      .finally(() => {
        applyChangesInFlightRef.current = null;
      });

    applyChangesInFlightRef.current = savePromise;
    return savePromise;
  }, [
    currentFile,
    activeFiles,
    exportActions,
    actions,
    selectors,
    historyApiRef,
    setHasUnsavedChanges,
    setRedactionsApplied,
    rotationState.rotation,
    t,
  ]);

  // Apply form fill changes - reload the filled PDF into the viewer
  const handleFormApply = useCallback(
    async (filledBlob: Blob) => {
      if (formApplyInProgressRef.current) return;
      if (!currentFile || activeFileIds.length === 0) return;

      formApplyInProgressRef.current = true;
      try {
        console.log(
          "[Viewer] Applying form fill changes - reloading filled PDF",
        );

        // Use the continuously tracked scroll position
        const pageToRestore = lastKnownScrollPageRef.current;

        // Save the current rotation to restore after reload
        const currentRotation = rotationState.rotation ?? 0;

        // Convert Blob to File
        const filename = currentFile.name || "document.pdf";
        const file = new File([filledBlob], filename, {
          type: "application/pdf",
        });

        // Get current file info for creating the updated version
        const currentFileId = currentFileStableId;
        if (!currentFileId) throw new Error("Current file ID not found");

        const parentStub = selectors.getStirlingFileStub(currentFileId);
        if (!parentStub) throw new Error("Parent stub not found");

        // Create StirlingFiles and stubs for version history
        const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
          [file],
          parentStub,
          selectedTool ?? "multiTool",
        );

        // Store the page to restore after file replacement
        queueScrollRestore(pageToRestore, true);

        // Store the rotation to restore after file replacement
        pendingRotationRestoreRef.current = currentRotation;
        rotationRestoreAttemptsRef.current = 0;

        const newFileId = stubs[0]?.id;
        if (newFileId) setActiveFileId(newFileId);

        // Replace the current file in context
        await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

        console.log("[Viewer] Form fill changes applied successfully");
      } catch (error) {
        console.error("[Viewer] Apply form changes failed:", error);
      } finally {
        formApplyInProgressRef.current = false;
      }
    },
    [
      currentFile,
      activeFiles,
      actions,
      selectors,
      activeFileIds.length,
      rotationState.rotation,
    ],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const blob = (e as CustomEvent).detail?.blob;
      if (blob) {
        handleFormApply(blob);
      }
    };
    window.addEventListener(FORM_APPLY_EVENT, handler);
    return () => window.removeEventListener(FORM_APPLY_EVENT, handler);
  }, [handleFormApply]);

  // Apply layer visibility changes - reload the modified PDF into the viewer
  const layerApplyInProgressRef = useRef(false);
  const handleLayerApply = useCallback(
    async (modifiedBlob: Blob) => {
      if (layerApplyInProgressRef.current) return;
      if (!currentFile || activeFileIds.length === 0) return;

      layerApplyInProgressRef.current = true;
      try {
        const pageToRestore = lastKnownScrollPageRef.current;
        const currentRotation = rotationState.rotation ?? 0;

        const filename = currentFile.name || "document.pdf";
        const file = new File([modifiedBlob], filename, {
          type: "application/pdf",
        });

        const currentFileId = currentFileStableId;
        if (!currentFileId) throw new Error("Current file ID not found");

        const parentStub = selectors.getStirlingFileStub(currentFileId);
        if (!parentStub) throw new Error("Parent stub not found");

        const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
          [file],
          parentStub,
          selectedTool ?? "multiTool",
        );

        queueScrollRestore(pageToRestore, true);
        pendingRotationRestoreRef.current = currentRotation;
        rotationRestoreAttemptsRef.current = 0;

        const newFileId = stubs[0]?.id;
        if (newFileId) setActiveFileId(newFileId);

        await actions.consumeFiles([currentFileId], stirlingFiles, stubs);
      } catch (error) {
        console.error("[Viewer] Apply layer changes failed:", error);
      } finally {
        layerApplyInProgressRef.current = false;
      }
    },
    [
      currentFile,
      activeFiles,
      actions,
      selectors,
      activeFileIds.length,
      rotationState.rotation,
    ],
  );

  // Discard pending redactions but save already-applied ones
  // This is called when user clicks "Discard & Leave" - we want to:
  // 1. NOT commit pending redaction marks (they get discarded)
  // 2. Save the PDF with already-applied redactions (if any)
  const discardAndSaveApplied = useCallback(async () => {
    // Only save if there are applied redactions to preserve
    if (!redactionsApplied || !currentFile || activeFileIds.length === 0) {
      return;
    }

    try {
      console.log(
        "[Viewer] Discarding pending marks but saving applied redactions",
      );

      // Save current view state to restore after file replacement
      const pageToRestore = lastKnownScrollPageRef.current;
      const currentRotation = rotationState.rotation ?? 0;

      // Export PDF WITHOUT committing pending marks - this saves only applied redactions
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error("Failed to export PDF");
      }

      // Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: "application/pdf" });
      const filename = currentFile.name || "document.pdf";
      const file = new File([blob], filename, { type: "application/pdf" });

      // Create StirlingFiles and stubs for version history
      const currentFileId = currentFileStableId;
      if (!currentFileId) throw new Error("Current file ID not found");

      const parentStub = selectors.getStirlingFileStub(currentFileId);
      if (!parentStub) throw new Error("Parent stub not found");

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [file],
        parentStub,
        selectedTool ?? "multiTool",
      );

      // Store view state to restore after file replacement
      queueScrollRestore(pageToRestore, true);
      pendingRotationRestoreRef.current = currentRotation;
      rotationRestoreAttemptsRef.current = 0;

      const newFileId = stubs[0]?.id;
      if (newFileId) setActiveFileId(newFileId);

      // Consume only the current file (replace in context)
      await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

      // Clear flags
      hasAnnotationChangesRef.current = false;
      setRedactionsApplied(false);
    } catch (error) {
      console.error("Failed to save applied redactions:", error);
    }
  }, [
    redactionsApplied,
    currentFile,
    activeFiles,
    activeFileIds.length,
    exportActions,
    actions,
    selectors,
    setRedactionsApplied,
    rotationState.rotation,
  ]);

  // Register navigation warning handlers so the global modal can call our save/discard logic
  useEffect(() => {
    if (previewFile) return;

    registerNavigationWarningHandlers({
      onApplyAndContinue: async () => {
        await applyChanges();
      },
      onDiscardAndContinue: async () => {
        await discardAndSaveApplied();
        const historyApi = historyApiRef.current;
        if (historyApi?.canUndo) {
          while (historyApi.canUndo()) {
            historyApi.undo?.();
          }
        }
        hasAnnotationChangesRef.current = false;
        historyRevisionRef.current = 0;
        savedHistoryRevisionRef.current = 0;
      },
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    previewFile,
    applyChanges,
    discardAndSaveApplied,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);

  // Veto the byte swap for a key whose visual state is already on screen.
  const shouldSkipBytes = useCallback((stableKey: string) => {
    const skipKey = skipReloadContentKeyRef.current;
    if (skipKey && skipKey === stableKey) {
      skipReloadContentKeyRef.current = null;
      return true;
    }
    return false;
  }, []);

  // Carry the reading position across an in-place reload; a genuinely different
  // document starts fresh.
  const previousDocumentRef = useRef<{
    root: string | null;
    content: string | null;
    encrypted: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    const root = currentFileRootId ?? null;
    const content = currentFileId;
    const encrypted = isCurrentFileEncrypted;
    const previous = previousDocumentRef.current;
    previousDocumentRef.current = { root, content, encrypted };

    if (!previous || !root || !content) return;
    if (previous.encrypted || encrypted) return;
    if (previous.root !== root || previous.content === content) return;

    const page = getScrollState().currentPage || lastKnownScrollPageRef.current;
    if (page > 0) {
      // Captures the within-page offset and waits for the replacement node, so
      // the restore cannot apply to the outgoing document.
      queueScrollRestore(page, true);
    }

    pendingRotationRestoreRef.current = getRotationState().rotation ?? 0;
    rotationRestoreAttemptsRef.current = 0;

    const zoom = getZoomState();
    // Automatic re-evaluates against the unmounted shell; preserve the numeric scale.
    const level =
      zoom.level === ZoomMode.Automatic && typeof zoom.currentZoom === "number"
        ? zoom.currentZoom
        : (zoom.level ?? zoom.currentZoom);
    if (level !== undefined && level !== null) {
      pendingZoomRestoreRef.current = level;
      zoomRestoreAttemptsRef.current = 0;
      zoomRestorePendingRef.current = true;
    }

    pendingSpreadRestoreRef.current = getSpreadState().spreadMode ?? null;

    setRestoreTick((tick) => tick + 1);
  }, [
    currentFileRootId,
    currentFileId,
    isCurrentFileEncrypted,
    getScrollState,
    getRotationState,
    getZoomState,
    getSpreadState,
    queueScrollRestore,
  ]);
  // Restore scroll position after file replacement or tool switch
  // Uses polling with retries to ensure the scroll succeeds
  useEffect(() => {
    if (pendingScrollRestoreRef.current === null) return;

    const pageToRestore = pendingScrollRestoreRef.current;
    // A tool output can take seconds to land, so retries are bounded by time,
    // not a frame count.
    const deadline = performance.now() + 30_000;
    // The effect re-runs as the viewer's state settles; retire old chains so a
    // stale fallback cannot clear the position the current chain just applied.
    let cancelled = false;
    // Frame-accurate retries: the replacement document paints its own top for
    // as long as it takes to re-apply, so waiting whole intervals is visible.
    const retry = () => {
      if (cancelled) return;
      scrollRestoreAttemptsRef.current++;
      requestAnimationFrame(attemptScroll);
    };

    const finish = () => {
      if (cancelled) return;
      pendingScrollRestoreRef.current = null;
      scrollRestoreAttemptsRef.current = 0;
      swapTargetRef.current = null;
      swapLayoutRef.current = null;
      clearPendingScrollRestore();
    };

    const attemptScroll = () => {
      if (cancelled) return;
      const currentState = getScrollState();
      const targetPage = Math.min(pageToRestore, currentState.totalPages);
      const captured = pendingScrollPositionRef.current;
      if (captured) {
        // An exact capture never falls back to the page top; wait for the
        // replacement (or apply straight away for a same-document restore).
        if (
          !applyPendingScrollPosition({
            useFraction: pendingZoomRestoreRef.current !== null,
          })
        ) {
          if (performance.now() < deadline) {
            retry();
          } else {
            finish();
          }
          return;
        }
        pendingScrollRestoreRef.current = null;
        scrollRestoreAttemptsRef.current = 0;
        return;
      }

      // Only attempt if we have valid state (totalPages > 0 means PDF is loaded)
      if (currentState.totalPages > 0 && targetPage > 0) {
        scrollActions.scrollToPage(targetPage, "instant");

        // Check if scroll succeeded after a brief delay
        setTimeout(() => {
          if (cancelled) return;
          const afterState = getScrollState();
          if (afterState.currentPage === targetPage) {
            finish();
          } else if (performance.now() < deadline) {
            retry();
          } else {
            finish();
          }
        }, 50);
      } else if (performance.now() < deadline) {
        retry();
      } else {
        finish();
      }
    };

    // Start on the next frame so the swapped document's DOM is favoured.
    const timer = setTimeout(attemptScroll, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    restoreTick,
    scrollState.totalPages,
    scrollActions,
    getScrollState,
    applyPendingScrollPosition,
    clearPendingScrollRestore,
  ]);

  // The swap bridge reports activation; reused page nodes need this layout-pass
  // backstop to apply the position before paint.
  const handleDocumentSwapped = useCallback(() => {
    documentSwappedRef.current = true;
    const zoomToRestore = pendingZoomRestoreRef.current;
    if (zoomToRestore !== null) {
      // The incoming document is still hidden, so a carried mode or level can
      // land before anything is shown.
      try {
        const current = getZoomState();
        const alreadyApplied =
          current.level === zoomToRestore &&
          (typeof zoomToRestore !== "number" ||
            Math.abs((current.currentZoom ?? 0) - zoomToRestore) < 0.001);
        if (!alreadyApplied) {
          zoomActions.requestZoom(zoomToRestore);
        }
      } catch {
        // Handled by retry effect
      }
    }
    const spreadToRestore = pendingSpreadRestoreRef.current;
    if (spreadToRestore !== null) {
      try {
        if (spreadActions.getSpreadMode() !== spreadToRestore) {
          spreadActions.setSpreadMode(spreadToRestore);
        }
      } catch {
        // Handled by retry effect
      }
    }
    const rotationToRestore = pendingRotationRestoreRef.current;
    if (rotationToRestore !== null && rotationToRestore !== 0) {
      try {
        if (rotationActions.getRotation() !== rotationToRestore) {
          rotationActions.setRotation(rotationToRestore);
        }
      } catch {
        // Handled by retry effect
      }
    }
    if (pendingScrollRestoreRef.current === null) return;
    if (!pendingScrollPositionRef.current) return;
    if (pendingScrollSwappedRef.current) return;
    applyPendingScrollPosition({
      useFraction: pendingZoomRestoreRef.current !== null,
    });
  }, [applyPendingScrollPosition, zoomActions, spreadActions, rotationActions]);

  const handleDocumentSwapFailed = useCallback(() => {
    clearPendingScrollRestore();
  }, [clearPendingScrollRestore]);
  useLayoutEffect(() => {
    if (!restorePending) return;
    if (pendingScrollRestoreRef.current === null) return;
    if (!pendingScrollPositionRef.current) return;
    if (!documentSwappedRef.current) return;
    if (pendingScrollSwappedRef.current) return;
    applyPendingScrollPosition({
      useFraction: pendingZoomRestoreRef.current !== null,
    });
  });

  // Runs from the layout pass that mounts the replacement's pages, so the saved
  // position lands before their first frame paints.
  const handleViewerPageLayout = useCallback(() => {
    if (pendingScrollRestoreRef.current === null) return;
    if (!pendingScrollPositionRef.current) return;
    if (pendingScrollSwappedRef.current) return;
    applyPendingScrollPosition({
      useFraction: pendingZoomRestoreRef.current !== null,
    });
  }, [applyPendingScrollPosition]);

  // Never leave the viewer hidden or holding a scroll if this unmounts mid-swap.
  useEffect(() => clearPendingScrollRestore, [clearPendingScrollRestore]);
  // Uses polling with retries to ensure the scroll succeeds
  useEffect(() => {
    if (pendingScrollRestoreRef.current === null) return;

    const pageToRestore = pendingScrollRestoreRef.current;
    const maxAttempts = 10;
    const attemptInterval = 100; // ms between attempts

    const attemptScroll = () => {
      const currentState = getScrollState();
      const targetPage = Math.min(pageToRestore, currentState.totalPages);

      // An exact-offset capture is restored by the layout attempt and held by
      // the reassert chain; the page-level fallback would snap to the page top.
      if (pendingScrollPositionRef.current) return;

      // Only attempt if we have valid state (totalPages > 0 means PDF is loaded)
      if (currentState.totalPages > 0 && targetPage > 0) {
        scrollActions.scrollToPage(targetPage, "instant");

        // Check if scroll succeeded after a brief delay
        setTimeout(() => {
          const afterState = getScrollState();
          if (
            afterState.currentPage === targetPage ||
            scrollRestoreAttemptsRef.current >= maxAttempts
          ) {
            // Success or max attempts reached - clear pending
            pendingScrollRestoreRef.current = null;
            scrollRestoreAttemptsRef.current = 0;
          } else {
            // Scroll might not have worked, retry
            scrollRestoreAttemptsRef.current++;
            if (scrollRestoreAttemptsRef.current < maxAttempts) {
              setTimeout(attemptScroll, attemptInterval);
            } else {
              // Give up after max attempts
              pendingScrollRestoreRef.current = null;
              scrollRestoreAttemptsRef.current = 0;
            }
          }
        }, 100);
      } else if (scrollRestoreAttemptsRef.current < maxAttempts) {
        // PDF not ready yet, retry
        scrollRestoreAttemptsRef.current++;
        setTimeout(attemptScroll, attemptInterval);
      } else {
        // Give up after max attempts
        pendingScrollRestoreRef.current = null;
        scrollRestoreAttemptsRef.current = 0;
      }
    };

    // Start attempting after initial delay to let PDF start loading
    const timer = setTimeout(attemptScroll, 200);
    return () => clearTimeout(timer);
  }, [restoreTick, scrollState.totalPages, scrollActions, getScrollState]);

  // Restore rotation after file replacement or tool switch
  // Uses polling with retries to ensure rotation is applied
  useEffect(() => {
    if (pendingRotationRestoreRef.current === null) return;

    const rotationToRestore = pendingRotationRestoreRef.current;
    const maxAttempts = 10;
    const attemptInterval = 100; // ms between attempts

    const attemptRotation = () => {
      if (
        pendingScrollPositionRef.current?.expectSwap &&
        !documentSwappedRef.current
      ) {
        return;
      }
      if (getScrollState().totalPages > 0) {
        // Check if rotation already matches
        const currentRotation = rotationActions.getRotation();
        if (currentRotation === rotationToRestore) {
          pendingRotationRestoreRef.current = null;
          rotationRestoreAttemptsRef.current = 0;
          return;
        }

        // Apply rotation
        rotationActions.setRotation(rotationToRestore);

        // Verify rotation succeeded after a brief delay
        setTimeout(() => {
          const afterRotation = rotationActions.getRotation();
          if (afterRotation === rotationToRestore) {
            pendingRotationRestoreRef.current = null;
            rotationRestoreAttemptsRef.current = 0;
          } else {
            // Rotation might not have worked, retry
            rotationRestoreAttemptsRef.current++;
            if (rotationRestoreAttemptsRef.current < maxAttempts) {
              setTimeout(attemptRotation, attemptInterval);
            } else {
              // Give up after max attempts
              pendingRotationRestoreRef.current = null;
              rotationRestoreAttemptsRef.current = 0;
            }
          }
        }, 50);
      } else if (rotationRestoreAttemptsRef.current < maxAttempts) {
        // PDF not ready yet, retry
        rotationRestoreAttemptsRef.current++;
        setTimeout(attemptRotation, attemptInterval);
      } else {
        // Give up after max attempts
        pendingRotationRestoreRef.current = null;
        rotationRestoreAttemptsRef.current = 0;
      }
    };

    // Start attempting after initial delay
    const timer = setTimeout(attemptRotation, 150);
    return () => clearTimeout(timer);
  }, [restoreTick, scrollState.totalPages, rotationActions, getScrollState]);

  // A replacement starts single-page, so the spread lands before the reading
  // position settles or the pages reflow under it.
  useEffect(() => {
    if (pendingSpreadRestoreRef.current === null) return;

    const modeToRestore = pendingSpreadRestoreRef.current;
    const maxAttempts = 10;
    const attemptInterval = 100;

    const attemptSpread = () => {
      if (
        pendingScrollPositionRef.current?.expectSwap &&
        !documentSwappedRef.current
      ) {
        return;
      }
      if (getScrollState().totalPages > 0) {
        pendingSpreadRestoreRef.current = null;
        if (spreadActions.getSpreadMode() !== modeToRestore) {
          spreadActions.setSpreadMode(modeToRestore);
          // The spread reflows the pages, so any held position has to be
          // recomputed against the new geometry.
          swapLayoutRef.current = null;
          swapTargetRef.current = null;
          if (pendingScrollPositionRef.current) {
            applyPendingScrollPosition({ useFraction: true });
          }
        }
        return;
      }
      spreadRestoreAttemptsRef.current++;
      if (spreadRestoreAttemptsRef.current < maxAttempts) {
        setTimeout(attemptSpread, attemptInterval);
      } else {
        pendingSpreadRestoreRef.current = null;
        spreadRestoreAttemptsRef.current = 0;
      }
    };

    const timer = setTimeout(attemptSpread, 150);
    return () => clearTimeout(timer);
  }, [restoreTick, scrollState.totalPages, spreadActions, getScrollState]);

  // Re-asserts the carried zoom until it sticks; the plugin's own fit pass can
  // override the first request and zoomRestorePendingRef keeps the UI quiet.
  useEffect(() => {
    const levelToRestore = pendingZoomRestoreRef.current;
    if (levelToRestore === null) return;

    let cancelled = false;
    const deadline = performance.now() + 1_500;

    const matchesLevel = () => {
      const current = getZoomState();
      if (current.level !== levelToRestore) return false;
      return (
        typeof levelToRestore !== "number" ||
        Math.abs((current.currentZoom ?? 0) - levelToRestore) < 0.001
      );
    };

    const attemptZoom = () => {
      if (cancelled) return;
      // A byte replacement must land before this document's zoom can apply.
      if (
        pendingScrollPositionRef.current?.expectSwap &&
        !documentSwappedRef.current
      ) {
        if (performance.now() < deadline) {
          setTimeout(attemptZoom, 100);
        }
        return;
      }
      if (getScrollState().totalPages === 0) {
        if (performance.now() < deadline) {
          setTimeout(attemptZoom, 100);
        } else {
          pendingZoomRestoreRef.current = null;
          settleZoomRestore();
        }
        return;
      }
      if (matchesLevel()) {
        pendingZoomRestoreRef.current = null;
        zoomRestoreAttemptsRef.current = 0;
        settleZoomRestore();
        return;
      }

      try {
        zoomActions.requestZoom(levelToRestore);
      } catch {
        // Retried below while the deadline holds.
      }
      // The rescale moves the page geometry, so re-apply the reading offset.
      applyPendingScrollPosition({ useFraction: true });
      if (performance.now() < deadline) {
        setTimeout(attemptZoom, 100);
      } else {
        pendingZoomRestoreRef.current = null;
        settleZoomRestore();
      }
    };

    const timer = setTimeout(attemptZoom, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    restoreTick,
    scrollState.totalPages,
    zoomActions,
    getScrollState,
    getZoomState,
    applyPendingScrollPosition,
    settleZoomRestore,
  ]);
  // Register applyChanges with ViewerContext so tools can access it directly
  useEffect(() => {
    setApplyChanges(applyChanges);
    return () => {
      setApplyChanges(null);
    };
  }, [applyChanges, setApplyChanges]);

  // Ruler / measurement tool state is handled by the dedicated hook.
  const rulerOverlayRef = useRef<RulerOverlayHandle | null>(null);

  const {
    isRulerActive,
    setIsRulerActive,
    pageMeasureScales,
    customScale,
    handleSetCustomScale,
    isScaleCalibrationActive,
    scaleCalibrationMeasurement,
    startScaleCalibration,
    cancelScaleCalibration,
    handleScaleCalibrationMeasurement,
    applyScaleCalibration,
  } = useMeasurementManager({
    currentFile,
    effectiveFile,
    rulerOverlayRef,
  });

  // Register workbench bar buttons for the viewer
  useViewerWorkbenchBarButtons(
    isRulerActive,
    setIsRulerActive,
    customScale,
    handleSetCustomScale,
    isScaleCalibrationActive,
    startScaleCalibration,
    cancelScaleCalibration,
  );

  // Auto-fetch form fields when a PDF is loaded in the viewer.
  // In normal viewer mode, this uses PDFium WASM (frontend-only).
  // In formFill tool mode, this uses PDFBox (backend).
  const formFillFileIdRef = useRef<string | null>(null);
  const formFillProviderRef = useRef(isFormFillToolActive);

  // Generate a unique identifier for the current file to detect file changes
  useEffect(() => {
    const fileChanged = currentFileId !== formFillFileIdRef.current;
    const providerChanged =
      formFillProviderRef.current !== isFormFillToolActive;
    formFillProviderRef.current = isFormFillToolActive;

    if (fileChanged) {
      console.log(
        "[FormFill] File changed. Old:",
        formFillFileIdRef.current,
        "New:",
        currentFileId,
      );
      formFillFileIdRef.current = currentFileId;
      // NOTE: Don't call resetFormFill() here — fetchFormFields() handles
      // clearing old state internally. Calling reset() before fetch() would
      // double-increment fetchVersionRef, causing version mismatches when
      // the effect re-fires before the async fetch completes.
    }

    if (
      currentFile &&
      !isCurrentFileEncrypted &&
      (fileChanged || providerChanged)
    ) {
      console.log("[FormFill] Fetching form fields for:", currentFileId);
      fetchFormFields(currentFile, currentFileId ?? undefined);
    }
  }, [
    isFormFillToolActive,
    currentFile,
    currentFileId,
    fetchFormFields,
    isCurrentFileEncrypted,
  ]);

  const sidebarWidthRem = 15;
  const commentsSidebarWidthRem = 15;
  const totalRightMargin =
    (isThumbnailSidebarVisible ? sidebarWidthRem : 0) +
    (isBookmarkSidebarVisible ? sidebarWidthRem : 0) +
    (isAttachmentSidebarVisible ? sidebarWidthRem : 0) +
    (isLayerSidebarVisible ? sidebarWidthRem : 0) +
    (isCommentsSidebarVisible ? commentsSidebarWidthRem : 0);

  return (
    <Box
      ref={viewerRef}
      onMouseEnter={() => setIsViewerHovered(true)}
      onMouseLeave={() => setIsViewerHovered(false)}
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        contain: "layout style paint",
      }}
    >
      {/* Close Button - Only show in preview mode */}
      {onClose && previewFile && (
        <ActionIcon
          variant="secondary"
          size="lg"
          aria-label={t("common.close", "Close")}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            zIndex: 1000,
          }}
          onClick={onClose}
        >
          <Icon name="x" />
        </ActionIcon>
      )}

      {!effectiveFile ? (
        <Center style={{ flex: 1 }}>
          <Text c="var(--color-red-dark)">
            {t(
              "viewer.error.noFileProvided",
              "Error: No file provided to viewer",
            )}
          </Text>
        </Center>
      ) : isCurrentFileEncrypted ? (
        <Center style={{ flex: 1 }}>
          <Stack align="center" gap="md">
            <Icon name="lock" size={48} style={{ opacity: 0.5 }} />
            <Text fw={500}>
              {t(
                "encryptedPdfUnlock.viewerLocked",
                "This PDF is password-protected",
              )}
            </Text>
            <Button
              onClick={() => {
                if (currentFile && isStirlingFile(currentFile)) {
                  actions.openEncryptedUnlockPrompt(currentFile.fileId);
                }
              }}
            >
              {t("encryptedPdfUnlock.viewerUnlock", "Unlock")}
            </Button>
          </Stack>
        </Center>
      ) : (
        <>
          {/* EmbedPDF Viewer */}
          <Box
            ref={pdfContainerRef}
            style={{
              position: "relative",
              flex: 1,
              overflow: "hidden",
              minHeight: 0,
              minWidth: 0,
              marginRight: `${totalRightMargin}rem`,
              transition: "margin-right 0.3s ease",
            }}
          >
            <LocalEmbedPDF
              key={currentFileRootId || "no-file"}
              shouldSkipBytes={shouldSkipBytes}
              onPageLayout={handleViewerPageLayout}
              onDocumentSwapped={handleDocumentSwapped}
              onDocumentSwapFailed={handleDocumentSwapFailed}
              restorePending={restorePending}
              pdfRenderMode={pdfRenderMode}
              file={effectiveFile.file}
              url={effectiveFile.url}
              fileName={
                previewFile
                  ? previewFile.name
                  : currentFile && isStirlingFile(currentFile)
                    ? currentFile.name
                    : effectiveFile?.file instanceof File
                      ? effectiveFile.file.name
                      : undefined
              }
              enableAnnotations={shouldEnableAnnotations}
              isSignMode={selectedTool === "sign"}
              showBakedAnnotations={isAnnotationsVisible}
              enableRedaction={shouldEnableRedaction}
              enableFormFill={shouldEnableFormFill}
              formEditingActive={isFormFillToolActive}
              isManualRedactionMode={isManualRedactMode}
              signatureApiRef={signatureApiRef}
              annotationApiRef={annotationApiRef}
              historyApiRef={historyApiRef}
              redactionTrackerRef={
                redactionTrackerRef as React.RefObject<RedactionPendingTrackerAPI>
              }
              fileId={currentFileId}
              isCommentsSidebarVisible={isCommentsSidebarVisible}
              commentsSidebarRightOffset={`${(isThumbnailSidebarVisible ? sidebarWidthRem : 0) + (isBookmarkSidebarVisible ? sidebarWidthRem : 0) + (isAttachmentSidebarVisible ? sidebarWidthRem : 0) + (isLayerSidebarVisible ? sidebarWidthRem : 0)}rem`}
              onSignatureAdded={() => {
                // Handle signature added - for debugging, enable console logs as needed
                // Future: Handle signature completion
              }}
              signaturePreviews={signaturePreviews}
              signaturePreviewsReadOnly={signaturePreviewsReadOnly}
              signaturePlacementMode={signaturePlacementMode}
              signaturePlacementData={signaturePlacementData}
              signaturePlacementType={signaturePlacementType}
              onSignaturePreviewsChange={onSignaturePreviewsChange}
              signatureOverlayApiRef={signatureOverlayApiRef}
            />
            {/* Floating save bar for form-filled PDFs (like Chrome/Firefox PDF viewers) */}
            <FormSaveBar
              file={currentFile ?? null}
              isFormFillToolActive={isFormFillToolActive}
              onApply={handleFormApply}
              policyEnforcing={policyEnforcing}
            />
            <StampPlacementOverlay
              containerRef={pdfContainerRef}
              isActive={isPlacementOverlayActive}
              signatureConfig={signatureConfig}
            />
            <RulerOverlay
              ref={rulerOverlayRef}
              containerRef={pdfContainerRef}
              isActive={isRulerActive}
              pageMeasureScales={pageMeasureScales}
              customScale={customScale}
              isCalibrationActive={isScaleCalibrationActive}
              onCalibrationMeasure={handleScaleCalibrationMeasurement}
            />
          </Box>
          <ScaleCalibrationDialog
            opened={!!scaleCalibrationMeasurement}
            measurement={scaleCalibrationMeasurement}
            defaultUnit={customScale?.unit ?? "m"}
            onApplyScale={applyScaleCalibration}
            onClose={cancelScaleCalibration}
          />
        </>
      )}

      {/* Bottom Toolbar Overlay */}
      {effectiveFile && (
        <div
          className="pdf-viewer-toolbar-dock"
          style={{
            position: "fixed",
            // Gutter matching the workbench rails, so the bar reads as a
            // floating card rather than one welded to the viewport edge.
            bottom: "0.5rem",
            left: 0,
            right: 0,
            zIndex: 50,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "none",
            background: "transparent",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>
            <PdfViewerToolbar
              currentPage={scrollState.currentPage}
              totalPages={scrollState.totalPages}
            />
          </div>
        </div>
      )}

      {/* Thumbnail Sidebar */}
      <ThumbnailSidebar
        visible={isThumbnailSidebarVisible}
        onToggle={toggleThumbnailSidebar}
        activeFileId={activeFileId}
      />
      <BookmarkSidebar
        visible={isBookmarkSidebarVisible}
        thumbnailVisible={isThumbnailSidebarVisible}
        documentCacheKey={bookmarkCacheKey}
        preloadCacheKeys={allBookmarkCacheKeys}
      />
      {!portfolioPinned && (
        <AttachmentSidebar
          visible={isAttachmentSidebarVisible}
          thumbnailVisible={isThumbnailSidebarVisible}
          bookmarkVisible={isBookmarkSidebarVisible}
          documentCacheKey={bookmarkCacheKey}
          preloadCacheKeys={allBookmarkCacheKeys}
        />
      )}
      <LayerSidebar
        visible={isLayerSidebarVisible}
        rightOffset={
          (isThumbnailSidebarVisible ? sidebarWidthRem : 0) +
          (isBookmarkSidebarVisible ? sidebarWidthRem : 0) +
          (isAttachmentSidebarVisible ? sidebarWidthRem : 0)
        }
        file={effectiveFile?.file ?? null}
        documentCacheKey={bookmarkCacheKey}
        onApplyLayers={handleLayerApply}
        onLayersDetected={setHasLayers}
      />
    </Box>
  );
};

const EmbedPdfViewer = (props: EmbedPdfViewerProps) => {
  return <EmbedPdfViewerContent {...props} />;
};

export default EmbedPdfViewer;
