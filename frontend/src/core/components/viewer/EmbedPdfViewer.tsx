import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Center, Text, ActionIcon } from '@mantine/core';
import CloseIcon from '@mui/icons-material/Close';

import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useFileWithUrl } from "@app/hooks/useFileWithUrl";
import { useViewer } from "@app/contexts/ViewerContext";
import { LocalEmbedPDF } from '@app/components/viewer/LocalEmbedPDF';
import { PdfViewerToolbar } from '@app/components/viewer/PdfViewerToolbar';
import { ThumbnailSidebar } from '@app/components/viewer/ThumbnailSidebar';
import { BookmarkSidebar } from '@app/components/viewer/BookmarkSidebar';
import { AttachmentSidebar } from '@app/components/viewer/AttachmentSidebar';
import { useNavigationGuard, useNavigationState } from '@app/contexts/NavigationContext';
import { useSignature } from '@app/contexts/SignatureContext';
import { useRedaction } from '@app/contexts/RedactionContext';
import type { RedactionPendingTrackerAPI } from '@app/components/viewer/RedactionPendingTracker';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
import NavigationWarningModal from '@app/components/shared/NavigationWarningModal';
import { isStirlingFile } from '@app/types/fileContext';
import { useViewerRightRailButtons } from '@app/components/viewer/useViewerRightRailButtons';
import { StampPlacementOverlay } from '@app/components/viewer/StampPlacementOverlay';
import { RulerOverlay, type PageMeasureScales, type PageScaleInfo, type ViewportScale } from '@app/components/viewer/RulerOverlay';
import { useWheelZoom } from '@app/hooks/useWheelZoom';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { FormSaveBar } from '@app/tools/formFill/FormSaveBar';

import type { PDFDict, PDFNumber } from '@cantoo/pdf-lib';

// ─── Measure dictionary extraction ────────────────────────────────────────────

async function extractPageMeasureScales(file: Blob): Promise<PageMeasureScales | null> {
  try {
    const { PDFDocument, PDFDict, PDFName, PDFArray, PDFNumber, PDFString, PDFHexString } = await import('@cantoo/pdf-lib');
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });

    // Parse a Measure dict into a MeasureScale, or return null if malformed.
    const parseScale = (measureObj: unknown) => {
      if (!(measureObj instanceof PDFDict)) return null;
      const rObj = measureObj.lookup(PDFName.of('R'));
      const ratioLabel = (rObj instanceof PDFString || rObj instanceof PDFHexString)
        ? rObj.decodeText() : '';
      // D = distance array, X = x-axis fallback
      let fmtArray = measureObj.lookup(PDFName.of('D'));
      if (!(fmtArray instanceof PDFArray)) fmtArray = measureObj.lookup(PDFName.of('X'));
      if (!(fmtArray instanceof PDFArray)) return null;
      const firstFmt = fmtArray.lookup(0);
      if (!(firstFmt instanceof PDFDict)) return null;
      const cObj = firstFmt.lookup(PDFName.of('C'));
      const uObj = firstFmt.lookup(PDFName.of('U'));
      if (!(cObj instanceof PDFNumber) || cObj.asNumber() <= 0) return null;
      const unit = (uObj instanceof PDFString || uObj instanceof PDFHexString)
        ? uObj.decodeText() : 'units';
      return { factor: cObj.asNumber(), unit, ratioLabel };
    };

    const result: PageMeasureScales = new Map();

    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      const pageHeight = page.getHeight();
      const pageNode = page.node as unknown as PDFDict;
      const viewports: ViewportScale[] = [];

      // Spec-conformant: /VP array — each viewport can have its own scale and BBox
      const vpObj = pageNode.lookup(PDFName.of('VP'));
      if (vpObj instanceof PDFArray) {
        for (let j = 0; j < vpObj.size(); j++) {
          const vpEntry = vpObj.lookup(j);
          if (!(vpEntry instanceof PDFDict)) continue;
          const scale = parseScale(vpEntry.lookup(PDFName.of('Measure')));
          if (!scale) continue;
          let bbox: ViewportScale['bbox'] = null;
          const bboxObj = vpEntry.lookup(PDFName.of('BBox'));
          if (bboxObj instanceof PDFArray && bboxObj.size() >= 4) {
            bbox = [
              (bboxObj.lookup(0) as PDFNumber).asNumber(),
              (bboxObj.lookup(1) as PDFNumber).asNumber(),
              (bboxObj.lookup(2) as PDFNumber).asNumber(),
              (bboxObj.lookup(3) as PDFNumber).asNumber(),
            ];
          }
          viewports.push({ bbox, scale });
        }
      }

      // Fallback: /Measure directly on page (non-conforming but seen in the wild)
      if (viewports.length === 0) {
        const scale = parseScale(pageNode.lookup(PDFName.of('Measure')));
        if (scale) viewports.push({ bbox: null, scale });
      }

      if (viewports.length > 0) result.set(i, { viewports, pageHeight } satisfies PageScaleInfo);
    }

    return result.size > 0 ? result : null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────

export interface EmbedPdfViewerProps {
  sidebarsVisible: boolean;
  setSidebarsVisible: (v: boolean) => void;
  onClose?: () => void;
  previewFile?: File | null;
  activeFileIndex?: number;
  setActiveFileIndex?: (index: number) => void;
}

const EmbedPdfViewerContent = ({
  sidebarsVisible: _sidebarsVisible,
  setSidebarsVisible: _setSidebarsVisible,
  onClose,
  previewFile,
  activeFileIndex: externalActiveFileIndex,
  setActiveFileIndex: externalSetActiveFileIndex,
}: EmbedPdfViewerProps) => {
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const [isViewerHovered, setIsViewerHovered] = React.useState(false);

  const {
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    isBookmarkSidebarVisible,
    isAttachmentSidebarVisible,
    isSearchInterfaceVisible,
    searchInterfaceActions,
    zoomActions,
    scrollActions,
    panActions: _panActions,
    rotationActions,
    getScrollState,
    getRotationState,
    setAnnotationMode,
    isAnnotationsVisible,
    exportActions,
    printActions,
    setApplyChanges,
    applyChanges: viewerApplyChanges,
  } = useViewer();

  const scrollState = getScrollState();
  const rotationState = getRotationState();

  // Track initial rotation to detect changes
  const initialRotationRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialRotationRef.current === null && rotationState.rotation !== undefined) {
      initialRotationRef.current = rotationState.rotation;
    }
  }, [rotationState.rotation]);

  // Get signature and annotation contexts
  const { signatureApiRef, annotationApiRef, historyApiRef, signatureConfig, isPlacementMode } = useSignature();

  // Track whether there are unsaved annotation changes in this viewer session.
  // This is our source of truth for navigation guards; it is set when the
  // annotation history changes, and cleared after we successfully apply changes.
  const hasAnnotationChangesRef = useRef(false);

  // Scroll position preservation system
  // We continuously track the last known good scroll position, so we always have it available
  const lastKnownScrollPageRef = useRef<number>(1);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const scrollRestoreAttemptsRef = useRef<number>(0);

  // Rotation preservation system
  // Similar to scroll preservation - track rotation across file reloads
  const pendingRotationRestoreRef = useRef<number | null>(null);
  const rotationRestoreAttemptsRef = useRef<number>(0);
  // Track the file ID we should be viewing after a save (to handle list reordering)
  const pendingFileIdRef = useRef<string | null>(null);

  const formApplyInProgressRef = useRef(false);

  // Get redaction context
  const { redactionsApplied, setRedactionsApplied } = useRedaction();

  // Ref for redaction pending tracker API
  const redactionTrackerRef = useRef<RedactionPendingTrackerAPI>(null);

  // Get current file from FileContext
  const { selectors, state } = useFileState();
  const { actions } = useFileActions();
  const activeFiles = selectors.getFiles();
  const activeFileIds = activeFiles.map(f => f.fileId);
  const selectedFileIds = state.ui.selectedFileIds;

  // Navigation guard for unsaved changes
  const { setHasUnsavedChanges, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker } = useNavigationGuard();

  const { selectedTool } = useNavigationState();

  // Form fill context
  const { fetchFields: fetchFormFields, setProviderMode } = useFormFill();

  const isInAnnotationTool = selectedTool === 'sign' || selectedTool === 'addText' || selectedTool === 'addImage' || selectedTool === 'annotate';
  const isSignatureMode = isInAnnotationTool;
  const isManualRedactMode = selectedTool === 'redact';

  // Enable annotations only when annotation tool is selected
  const shouldEnableAnnotations = selectedTool === 'annotate' || isSignatureMode;

  // Enable redaction only when redaction tool is selected
  const shouldEnableRedaction = selectedTool === 'redact';

  // FormFill tool mode — uses PDFBox backend for full-fidelity form handling
  const isFormFillToolActive = (selectedTool as string) === 'formFill';

  // Form overlays are shown in BOTH modes:
  // - Normal viewer: form overlays visible (pdf-lib, frontend-only)
  // - formFill tool: form overlays visible (PDFBox, backend)
  const shouldEnableFormFill = true;

  // Switch the provider when the tool mode changes
  useEffect(() => {
    setProviderMode(isFormFillToolActive ? 'pdfbox' : 'pdflib');
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
    const annotationsChanged = prevEnableAnnotationsRef.current !== shouldEnableAnnotations;
    const redactionChanged = prevEnableRedactionRef.current !== shouldEnableRedaction;

    if (annotationsChanged || redactionChanged) {
      // Read scroll state directly AND use the tracked value - take whichever is valid
      const currentScrollState = getScrollState();
      const pageFromState = currentScrollState.currentPage;
      const pageFromRef = lastKnownScrollPageRef.current;

      // Use the current state if valid, otherwise fall back to tracked ref
      const pageToRestore = pageFromState > 0 ? pageFromState : pageFromRef;

      if (pageToRestore > 0) {
        pendingScrollRestoreRef.current = pageToRestore;
        scrollRestoreAttemptsRef.current = 0;
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
    isInAnnotationTool && isPlacementMode && signatureConfig
  );

  // Track which file tab is active
  const [internalActiveFileIndex, setInternalActiveFileIndex] = useState(0);
  const activeFileIndex = externalActiveFileIndex ?? internalActiveFileIndex;
  const setActiveFileIndex = externalSetActiveFileIndex ?? setInternalActiveFileIndex;
  const hasInitializedFromSelection = useRef(false);

  // When viewer opens with a selected file, switch to that file
  useEffect(() => {
    if (!hasInitializedFromSelection.current && selectedFileIds.length > 0 && activeFiles.length > 0) {
      const selectedFileId = selectedFileIds[0];
      const index = activeFiles.findIndex(f => f.fileId === selectedFileId);
      if (index !== -1 && index !== activeFileIndex) {
        setActiveFileIndex(index);
      }
      hasInitializedFromSelection.current = true;
    }
  }, [selectedFileIds, activeFiles, activeFileIndex]);

  // Reset active tab if it's out of bounds
  useEffect(() => {
    if (activeFileIndex >= activeFiles.length && activeFiles.length > 0) {
      setActiveFileIndex(0);
    }
  }, [activeFiles.length, activeFileIndex]);

  // After saving a file, the list may reorder (sorted by version).
  // Track the saved file's ID and update activeFileIndex to follow it.
  useEffect(() => {
    if (pendingFileIdRef.current && activeFiles.length > 0) {
      const targetFileId = pendingFileIdRef.current;
      const newIndex = activeFiles.findIndex(f => f.fileId === targetFileId);
      if (newIndex !== -1 && newIndex !== activeFileIndex) {
        setActiveFileIndex(newIndex);
      }
      // Clear the pending file ID once we've found and switched to it
      pendingFileIdRef.current = null;
    }
  }, [activeFiles, activeFileIndex, setActiveFileIndex]);

  // Determine which file to display
  const currentFile = React.useMemo(() => {
    if (previewFile) {
      return previewFile;
    } else if (activeFiles.length > 0) {
      return activeFiles[activeFileIndex] || activeFiles[0];
    }
    return null;
  }, [previewFile, activeFiles, activeFileIndex]);

  // Get file with URL for rendering
  const fileWithUrl = useFileWithUrl(currentFile);

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

  const bookmarkCacheKey = React.useMemo(() => {
    if (currentFile && isStirlingFile(currentFile)) {
      return currentFile.fileId;
    }

    if (previewFile) {
      const uniquePreviewId = `${previewFile.name}-${previewFile.size}-${previewFile.lastModified ?? 'na'}`;
      return `preview-${uniquePreviewId}`;
    }

    if (effectiveFile?.url) {
      return effectiveFile.url;
    }

    if (effectiveFile?.file instanceof File) {
      const fileObj = effectiveFile.file;
      return `file-${fileObj.name}-${fileObj.size}-${fileObj.lastModified ?? 'na'}`;
    }

    return undefined;
  }, [currentFile, effectiveFile, previewFile]);

  // Generate cache keys for all active files to enable preloading
  const allBookmarkCacheKeys = React.useMemo(() => {
    if (previewFile) {
      return [bookmarkCacheKey].filter(Boolean) as string[];
    }

    return activeFiles.map(file => {
      if (isStirlingFile(file)) {
        return file.fileId;
      }
      return undefined;
    }).filter(Boolean) as string[];
  }, [activeFiles, previewFile, bookmarkCacheKey]);

  useWheelZoom({
    ref: viewerRef,
    onZoomIn: zoomActions.zoomIn,
    onZoomOut: zoomActions.zoomOut,
  });

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isViewerHovered) return;

      const mod = event.ctrlKey || event.metaKey;

      // Modifier key shortcuts (Ctrl/Cmd + key)
      if (mod) {
        switch (event.key) {
          case '=':
          case '+':
            event.preventDefault();
            zoomActions.zoomIn();
            return;
          case '-':
          case '_':
            event.preventDefault();
            zoomActions.zoomOut();
            return;
          case '0':
            // Ctrl+0: Reset zoom to fit width
            event.preventDefault();
            zoomActions.requestZoom('fit-width');
            return;
          case 'a':
          case 'A':
            // Ctrl+A: Prevent browser from selecting all UI text
            event.preventDefault();
            return;
          case 'f':
          case 'F':
            event.preventDefault();
            if (isSearchInterfaceVisible) {
              window.dispatchEvent(new CustomEvent('refocus-search-input'));
            } else {
              searchInterfaceActions.open();
            }
            return;
          case 'p':
          case 'P':
            event.preventDefault();
            printActions.print();
            return;
          case 's':
          case 'S':
            // Ctrl+S: Save/apply changes
            if (!event.shiftKey) {
              event.preventDefault();
              if (viewerApplyChanges) {
                viewerApplyChanges();
              }
            }
            return;
          case 'z':
          case 'Z':
            // Ctrl+Z: Undo; Ctrl+Shift+Z: Redo
            event.preventDefault();
            if (event.shiftKey) {
              historyApiRef.current?.redo?.();
            } else {
              historyApiRef.current?.undo?.();
            }
            return;
          case 'y':
          case 'Y':
            // Ctrl+Y: Redo
            event.preventDefault();
            historyApiRef.current?.redo?.();
            return;
          case 'r':
          case 'R':
            // Ctrl+R: Rotate forward; Ctrl+Shift+R: Rotate backward
            // Prevent browser refresh
            event.preventDefault();
            if (event.shiftKey) {
              rotationActions.rotateBackward();
            } else {
              rotationActions.rotateForward();
            }
            return;
        }
        return;
      }

      // Non-modifier shortcuts
      switch (event.key) {
        case 'Home':
          event.preventDefault();
          scrollActions.scrollToFirstPage();
          return;
        case 'End':
          event.preventDefault();
          scrollActions.scrollToLastPage();
          return;
        case 'PageUp':
          event.preventDefault();
          scrollActions.scrollToPreviousPage();
          return;
        case 'PageDown':
          event.preventDefault();
          scrollActions.scrollToNextPage();
          return;
        case 'Escape':
          if (isSearchInterfaceVisible) {
            event.preventDefault();
            searchInterfaceActions.close();
          }
          return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isViewerHovered, isSearchInterfaceVisible, zoomActions, searchInterfaceActions,
    scrollActions, printActions, exportActions, rotationActions, historyApiRef,
    viewerApplyChanges,
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
      if (!hasAnnotationChangesRef.current && canUndo) {
        hasAnnotationChangesRef.current = true;
        setHasUnsavedChanges(true);
      }
    };

    const unsubscribe = historyApi.subscribe(updateHasChanges);
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [historyApiRef.current, setHasUnsavedChanges]);

  // Register checker for unsaved changes (annotations only for now)
  useEffect(() => {
    if (previewFile) {
      return;
    }

    const checkForChanges = () => {
      // Check for annotation history changes (using ref that's updated by useEffect)
      const hasAnnotationChanges = hasAnnotationChangesRef.current;

      // Check for pending redactions
      const hasPendingRedactions = (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;

      // Always consider applied redactions as unsaved until export
      const hasAppliedRedactions = redactionsApplied;

      return hasAnnotationChanges || hasPendingRedactions || hasAppliedRedactions;
    };

    registerUnsavedChangesChecker(checkForChanges);

    return () => {
      unregisterUnsavedChangesChecker();
    };
  }, [historyApiRef, previewFile, registerUnsavedChangesChecker, unregisterUnsavedChangesChecker, isManualRedactMode, redactionsApplied]);

  // Save changes - save annotations and redactions to file (overwrites active file)
  const applyChanges = useCallback(async () => {
    if (!currentFile || activeFileIds.length === 0) return;

    try {
      console.log('[Viewer] Applying changes - exporting PDF with annotations/redactions');

      // Use the continuously tracked scroll position - more reliable than reading at this moment
      const pageToRestore = lastKnownScrollPageRef.current;

      // Save the current rotation to restore after reload
      const currentRotation = rotationState.rotation ?? 0;

      // Step 0: Commit any pending redactions before export
      const hadPendingRedactions = (redactionTrackerRef.current?.getPendingCount() ?? 0) > 0;

      // Mark redactions as applied BEFORE committing, so the button stays enabled during the save process
      // This ensures the button doesn't become disabled when pendingCount becomes 0
      if (hadPendingRedactions || redactionsApplied) {
        setRedactionsApplied(true);
      }

      if (hadPendingRedactions) {
        console.log('[Viewer] Committing pending redactions before export');
        redactionTrackerRef.current?.commitAllPending();
        // Give a small delay for the commit to process
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Step 1: Export PDF with annotations using EmbedPDF
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error('Failed to export PDF');
      }

      // Step 2: Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const filename = currentFile.name || 'document.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Step 3: Create StirlingFiles and stubs for version history
      // Only consume the current file, not all active files
      const currentFileId = activeFiles[activeFileIndex]?.fileId;
      if (!currentFileId) throw new Error('Current file ID not found');

      const parentStub = selectors.getStirlingFileStub(currentFileId);
      if (!parentStub) throw new Error('Parent stub not found');

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'multiTool');

      // Store the page to restore after file replacement triggers re-render
      pendingScrollRestoreRef.current = pageToRestore;
      scrollRestoreAttemptsRef.current = 0;

      // Store the rotation to restore after file replacement
      pendingRotationRestoreRef.current = currentRotation;
      rotationRestoreAttemptsRef.current = 0;
      // Store the new file ID so we can track it after the list reorders
      const newFileId = stubs[0]?.id;
      if (newFileId) {
        pendingFileIdRef.current = newFileId;
      }

      // Step 4: Consume only the current file (replace in context)
      await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

      // Mark annotations as saved so navigation away from the viewer is allowed.
      hasAnnotationChangesRef.current = false;
      setHasUnsavedChanges(false);
      setRedactionsApplied(false);
    } catch (error) {
      console.error('Apply changes failed:', error);
    }
  }, [currentFile, activeFiles, activeFileIndex, exportActions, actions, selectors, setHasUnsavedChanges, setRedactionsApplied, rotationState.rotation]);

  // Apply form fill changes - reload the filled PDF into the viewer
  const handleFormApply = useCallback(async (filledBlob: Blob) => {
    if (formApplyInProgressRef.current) return;
    if (!currentFile || activeFileIds.length === 0) return;

    formApplyInProgressRef.current = true;
    try {
      console.log('[Viewer] Applying form fill changes - reloading filled PDF');

      // Use the continuously tracked scroll position
      const pageToRestore = lastKnownScrollPageRef.current;

      // Save the current rotation to restore after reload
      const currentRotation = rotationState.rotation ?? 0;

      // Convert Blob to File
      const filename = currentFile.name || 'document.pdf';
      const file = new File([filledBlob], filename, { type: 'application/pdf' });

      // Get current file info for creating the updated version
      const currentFileId = activeFiles[activeFileIndex]?.fileId;
      if (!currentFileId) throw new Error('Current file ID not found');

      const parentStub = selectors.getStirlingFileStub(currentFileId);
      if (!parentStub) throw new Error('Parent stub not found');

      // Create StirlingFiles and stubs for version history
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'multiTool');

      // Store the page to restore after file replacement
      pendingScrollRestoreRef.current = pageToRestore;
      scrollRestoreAttemptsRef.current = 0;

      // Store the rotation to restore after file replacement
      pendingRotationRestoreRef.current = currentRotation;
      rotationRestoreAttemptsRef.current = 0;

      // Store the new file ID for tracking
      const newFileId = stubs[0]?.id;
      if (newFileId) {
        pendingFileIdRef.current = newFileId;
      }

      // Replace the current file in context
      await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

      console.log('[Viewer] Form fill changes applied successfully');
    } catch (error) {
      console.error('[Viewer] Apply form changes failed:', error);
    } finally {
      formApplyInProgressRef.current = false;
    }
  }, [currentFile, activeFiles, activeFileIndex, actions, selectors, activeFileIds.length, rotationState.rotation]);

  useEffect(() => {
    const handler = (e: Event) => {
      const blob = (e as CustomEvent).detail?.blob;
      if (blob) {
        handleFormApply(blob);
      }
    };
    window.addEventListener('formfill:apply', handler);
    return () => window.removeEventListener('formfill:apply', handler);
  }, [handleFormApply]);

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
      console.log('[Viewer] Discarding pending marks but saving applied redactions');

      // Save current view state to restore after file replacement
      const pageToRestore = lastKnownScrollPageRef.current;
      const currentRotation = rotationState.rotation ?? 0;

      // Export PDF WITHOUT committing pending marks - this saves only applied redactions
      const arrayBuffer = await exportActions.saveAsCopy();
      if (!arrayBuffer) {
        throw new Error('Failed to export PDF');
      }

      // Convert ArrayBuffer to File
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const filename = currentFile.name || 'document.pdf';
      const file = new File([blob], filename, { type: 'application/pdf' });

      // Create StirlingFiles and stubs for version history
      const currentFileId = activeFiles[activeFileIndex]?.fileId;
      if (!currentFileId) throw new Error('Current file ID not found');

      const parentStub = selectors.getStirlingFileStub(currentFileId);
      if (!parentStub) throw new Error('Parent stub not found');

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs([file], parentStub, 'multiTool');

      // Store view state to restore after file replacement
      pendingScrollRestoreRef.current = pageToRestore;
      scrollRestoreAttemptsRef.current = 0;
      pendingRotationRestoreRef.current = currentRotation;
      rotationRestoreAttemptsRef.current = 0;

      // Consume only the current file (replace in context)
      await actions.consumeFiles([currentFileId], stirlingFiles, stubs);

      // Clear flags
      hasAnnotationChangesRef.current = false;
      setRedactionsApplied(false);

      console.log('[Viewer] Applied redactions saved, pending marks discarded');
    } catch (error) {
      console.error('Failed to save applied redactions:', error);
    }
  }, [redactionsApplied, currentFile, activeFiles, activeFileIndex, activeFileIds.length, exportActions, actions, selectors, setRedactionsApplied, rotationState.rotation]);

  // Restore scroll position after file replacement or tool switch
  // Uses polling with retries to ensure the scroll succeeds
  useEffect(() => {
    if (pendingScrollRestoreRef.current === null) return;

    const pageToRestore = pendingScrollRestoreRef.current;
    const maxAttempts = 10;
    const attemptInterval = 100; // ms between attempts

    const attemptScroll = () => {
      const currentState = getScrollState();
      const targetPage = Math.min(pageToRestore, currentState.totalPages);

      // Only attempt if we have valid state (totalPages > 0 means PDF is loaded)
      if (currentState.totalPages > 0 && targetPage > 0) {
        scrollActions.scrollToPage(targetPage, 'instant');

        // Check if scroll succeeded after a brief delay
        setTimeout(() => {
          const afterState = getScrollState();
          if (afterState.currentPage === targetPage || scrollRestoreAttemptsRef.current >= maxAttempts) {
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
        }, 50);
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

    // Start attempting after initial delay
    const timer = setTimeout(attemptScroll, 150);
    return () => clearTimeout(timer);
  }, [scrollState.totalPages, scrollActions, getScrollState]);

  // Restore rotation after file replacement or tool switch
  // Uses polling with retries to ensure the rotation succeeds
  useEffect(() => {
    if (pendingRotationRestoreRef.current === null) return;

    const rotationToRestore = pendingRotationRestoreRef.current;
    const maxAttempts = 10;
    const attemptInterval = 100; // ms between attempts

    const attemptRotation = () => {
      const currentState = getScrollState();

      // Only attempt if PDF is loaded (totalPages > 0)
      if (currentState.totalPages > 0) {
        rotationActions.setRotation(rotationToRestore);

        // Check if rotation succeeded after a brief delay
        setTimeout(() => {
          const currentRotation = rotationActions.getRotation();
          if (currentRotation === rotationToRestore || rotationRestoreAttemptsRef.current >= maxAttempts) {
            // Success or max attempts reached - clear pending
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
  }, [scrollState.totalPages, rotationActions, getScrollState]);

  // Register applyChanges with ViewerContext so tools can access it directly
  useEffect(() => {
    setApplyChanges(applyChanges);
    return () => {
      setApplyChanges(null);
    };
  }, [applyChanges, setApplyChanges]);

  // Ruler / measurement tool state
  const [isRulerActive, setIsRulerActive] = useState(false);
  const [pageMeasureScales, setPageMeasureScales] = useState<PageMeasureScales | null>(null);

  useEffect(() => {
    const file = effectiveFile?.file;
    if (!file) { setPageMeasureScales(null); return; }
    let cancelled = false;
    extractPageMeasureScales(file).then(scales => { if (!cancelled) setPageMeasureScales(scales); });
    return () => { cancelled = true; };
  }, [effectiveFile]);

  // Register viewer right-rail buttons
  useViewerRightRailButtons(isRulerActive, setIsRulerActive);

  // Auto-fetch form fields when a PDF is loaded in the viewer.
  // In normal viewer mode, this uses pdf-lib (frontend-only).
  // In formFill tool mode, this uses PDFBox (backend).
  const formFillFileIdRef = useRef<string | null>(null);
  const formFillProviderRef = useRef(isFormFillToolActive);

  // Generate a unique identifier for the current file to detect file changes
  const currentFileId = React.useMemo(() => {
    if (!currentFile) return null;

    if (isStirlingFile(currentFile)) {
      return `stirling-${currentFile.fileId}`;
    }

    // File is also a Blob, but has more specific properties
    if (currentFile instanceof File) {
      return `file-${currentFile.name}-${currentFile.size}-${currentFile.lastModified}`;
    }

    // Fallback for any other object (shouldn't happen in practice)
    return `unknown-${(currentFile as any).size || 0}`;
  }, [currentFile]);

  useEffect(() => {
    const fileChanged = currentFileId !== formFillFileIdRef.current;
    const providerChanged = formFillProviderRef.current !== isFormFillToolActive;
    formFillProviderRef.current = isFormFillToolActive;

    if (fileChanged) {
      console.log('[FormFill] File changed. Old:', formFillFileIdRef.current, 'New:', currentFileId);
      formFillFileIdRef.current = currentFileId;
      // NOTE: Don't call resetFormFill() here — fetchFormFields() handles
      // clearing old state internally. Calling reset() before fetch() would
      // double-increment fetchVersionRef, causing version mismatches when
      // the effect re-fires before the async fetch completes.
    }

    if (currentFile && (fileChanged || providerChanged)) {
      console.log('[FormFill] Fetching form fields for:', currentFileId);
      fetchFormFields(currentFile, currentFileId ?? undefined);
    }
  }, [isFormFillToolActive, currentFile, currentFileId, fetchFormFields]);

  const sidebarWidthRem = 15;
  const totalRightMargin =
    (isThumbnailSidebarVisible ? sidebarWidthRem : 0) +
    (isBookmarkSidebarVisible ? sidebarWidthRem : 0) +
    (isAttachmentSidebarVisible ? sidebarWidthRem : 0);

  return (
    <Box
      ref={viewerRef}
      onMouseEnter={() => setIsViewerHovered(true)}
      onMouseLeave={() => setIsViewerHovered(false)}
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        contain: 'layout style paint'
      }}>
      {/* Close Button - Only show in preview mode */}
      {onClose && previewFile && (
        <ActionIcon
          variant="filled"
          color="gray"
          size="lg"
          style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1000, borderRadius: '50%' }}
          onClick={onClose}
        >
          <CloseIcon />
        </ActionIcon>
      )}

      {!effectiveFile ? (
        <Center style={{ flex: 1 }}>
          <Text c="red">Error: No file provided to viewer</Text>
        </Center>
      ) : (
        <>
          {/* EmbedPDF Viewer */}
          <Box
            ref={pdfContainerRef}
            style={{
              position: 'relative',
              flex: 1,
              overflow: 'hidden',
              minHeight: 0,
              minWidth: 0,
              marginRight: `${totalRightMargin}rem`,
              transition: 'margin-right 0.3s ease'
            }}>
            <LocalEmbedPDF
              key={currentFileId || 'no-file'}
              file={effectiveFile.file}
              url={effectiveFile.url}
              fileName={
                previewFile ? previewFile.name :
                (currentFile && isStirlingFile(currentFile) ? currentFile.name :
                (effectiveFile?.file instanceof File ? effectiveFile.file.name : undefined))
              }
              enableAnnotations={shouldEnableAnnotations}
              showBakedAnnotations={isAnnotationsVisible}
              enableRedaction={shouldEnableRedaction}
              enableFormFill={shouldEnableFormFill}
              isManualRedactionMode={isManualRedactMode}
              signatureApiRef={signatureApiRef as React.RefObject<any>}
              annotationApiRef={annotationApiRef as React.RefObject<any>}
              historyApiRef={historyApiRef as React.RefObject<any>}
              redactionTrackerRef={redactionTrackerRef as React.RefObject<RedactionPendingTrackerAPI>}
              fileId={currentFileId}
              onSignatureAdded={() => {
                // Handle signature added - for debugging, enable console logs as needed
                // Future: Handle signature completion
              }}
            />
            {/* Floating save bar for form-filled PDFs (like Chrome/Firefox PDF viewers) */}
            <FormSaveBar
              file={currentFile ?? null}
              isFormFillToolActive={isFormFillToolActive}
              onApply={handleFormApply}
            />
            <StampPlacementOverlay
              containerRef={pdfContainerRef}
              isActive={isPlacementOverlayActive}
              signatureConfig={signatureConfig}
            />
            <RulerOverlay
              containerRef={pdfContainerRef}
              isActive={isRulerActive}
              pageMeasureScales={pageMeasureScales}
            />
          </Box>
        </>
      )}

      {/* Bottom Toolbar Overlay */}
      {effectiveFile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
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
        activeFileIndex={activeFileIndex}
      />
      <BookmarkSidebar
        visible={isBookmarkSidebarVisible}
        thumbnailVisible={isThumbnailSidebarVisible}
        documentCacheKey={bookmarkCacheKey}
        preloadCacheKeys={allBookmarkCacheKeys}
      />
      <AttachmentSidebar
        visible={isAttachmentSidebarVisible}
        thumbnailVisible={isThumbnailSidebarVisible}
        documentCacheKey={bookmarkCacheKey}
        preloadCacheKeys={allBookmarkCacheKeys}
      />

      {/* Navigation Warning Modal */}
      {!previewFile && (
        <NavigationWarningModal
          onApplyAndContinue={async () => {
            await applyChanges();
          }}
          onDiscardAndContinue={async () => {
            // Save applied redactions (if any) while discarding pending ones
            await discardAndSaveApplied();
          }}
        />
      )}
    </Box>
  );
};

const EmbedPdfViewer = (props: EmbedPdfViewerProps) => {
  return (
    <EmbedPdfViewerContent {...props} />
  );
};

export default EmbedPdfViewer;
