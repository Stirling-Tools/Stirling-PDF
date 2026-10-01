import React, {
  useState,
  useMemo,
  useEffect,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { useNavigation } from "@app/contexts/NavigationContext";
import {
  useFileIndex,
  useFileSelector,
  useFileSelectors,
} from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import { enforceExportPolicies } from "@app/services/policyExport";
import { useTranslation } from "react-i18next";
import { alert } from "@app/components/toast";
import {
  preferencesService,
  type PdfRenderMode,
} from "@app/services/preferencesService";
import {
  createViewerActions,
  type PrintActions,
} from "@app/contexts/viewer/viewerActions";
import {
  BridgeRef,
  BridgeApiMap,
  BridgeStateMap,
  BridgeKey,
  ViewerBridgeRegistry,
  createBridgeRegistry,
  registerBridge as setBridgeRef,
  ScrollState,
  ZoomState,
  PanState,
  SelectionState,
  SpreadState,
  RotationState,
  SearchState,
  ExportState,
  BookmarkState,
  AttachmentState,
  DocumentPermissionsState,
  PdfPermissionFlag,
} from "@app/contexts/viewer/viewerBridges";
import { SpreadMode } from "@embedpdf/plugin-spread/react";
import {
  ViewerContext,
  type ViewerContextType,
} from "@app/contexts/viewer/viewerContext";

export { ViewerContext, useViewer } from "@app/contexts/viewer/viewerContext";
export type { ViewerContextType } from "@app/contexts/viewer/viewerContext";

function useImmediateNotifier<Args extends unknown[]>() {
  const callbacksRef = useRef(new Set<(...args: Args) => void>());

  const register = useCallback((callback: (...args: Args) => void) => {
    callbacksRef.current.add(callback);
    return () => {
      callbacksRef.current.delete(callback);
    };
  }, []);

  const trigger = useCallback((...args: Args) => {
    callbacksRef.current.forEach((cb) => {
      try {
        cb(...args);
      } catch (error) {
        console.error("Immediate callback error:", error);
      }
    });
  }, []);

  return { register, trigger };
}

interface ViewerProviderProps {
  children: ReactNode;
}

export const ViewerProvider: React.FC<ViewerProviderProps> = ({ children }) => {
  const { t } = useTranslation();
  // UI state - only state directly managed by this context
  const [isThumbnailSidebarVisible, setIsThumbnailSidebarVisible] =
    useState(false);
  const [isBookmarkSidebarVisible, setIsBookmarkSidebarVisible] =
    useState(false);
  const [isAttachmentSidebarVisible, setIsAttachmentSidebarVisible] =
    useState(false);
  const [isLayerSidebarVisible, setIsLayerSidebarVisible] = useState(false);
  const [hasLayers, setHasLayers] = useState(false);
  const [isCommentsSidebarVisible, setIsCommentsSidebarVisible] =
    useState(false);
  const [highlightCommentRequest, setHighlightCommentRequest] = useState<{
    documentId: string;
    pageIndex: number;
    annotationId: string;
    action: "focus" | "highlight";
  } | null>(null);
  const [isSearchInterfaceVisible, setSearchInterfaceVisible] = useState(false);
  const [isAnnotationsVisible, setIsAnnotationsVisible] = useState(true);
  const [isAnnotationMode, setIsAnnotationModeState] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // activeFileIndex is derived from activeFileId so they can never desync.
  // ViewerProvider sits inside FileContextProvider so these hooks are valid here.
  const selectors = useFileSelectors();
  const fileIds = useFileSelector((s) => s.files.ids);

  // Clear activeFileId when its file is removed from the workbench.
  // Dep on state.files.ids so the effect re-runs on every add/remove.
  useEffect(() => {
    if (!activeFileId) return;
    const stillInWorkbench = fileIds.some(
      (id) => (id as string) === activeFileId,
    );
    if (!stillInWorkbench) setActiveFileId(null);
  }, [activeFileId, fileIds]);

  const activeFileIndex = useFileIndex(activeFileId);
  const setActiveFileIndex = useCallback(
    (index: number) => {
      const files = selectors.getFiles();
      const file = files[index];
      if (file && isStirlingFile(file)) setActiveFileId(file.fileId);
    },
    [selectors],
  );
  const [pdfRenderMode, setPdfRenderModeState] = useState<PdfRenderMode>(() =>
    preferencesService.getPreference("pdfRenderMode"),
  );

  // Get current navigation state to check if we're in sign mode
  useNavigation();

  // Bridge registry - bridges register their state and APIs here
  const bridgeRefs = useRef<ViewerBridgeRegistry>(createBridgeRegistry());

  // Apply changes function - registered by EmbedPdfViewer
  const applyChangesRef = useRef<(() => Promise<void>) | null>(null);

  const setApplyChanges = useCallback((fn: (() => Promise<void>) | null) => {
    applyChangesRef.current = fn;
  }, []);

  const applyChanges = useCallback(async () => {
    if (applyChangesRef.current) {
      await applyChangesRef.current();
    }
  }, []);

  const {
    register: registerImmediateZoomUpdate,
    trigger: triggerImmediateZoomInternal,
  } = useImmediateNotifier<[number]>();
  const {
    register: registerImmediateScrollUpdate,
    trigger: triggerImmediateScrollInternal,
  } = useImmediateNotifier<[number, number]>();
  const {
    register: registerImmediateSpreadUpdate,
    trigger: triggerImmediateSpreadInternal,
  } = useImmediateNotifier<[SpreadMode, boolean]>();
  const {
    register: registerImmediatePanUpdate,
    trigger: triggerImmediatePanInternal,
  } = useImmediateNotifier<[boolean]>();
  const {
    register: registerImmediateRotationUpdate,
    trigger: triggerImmediateRotationInternal,
  } = useImmediateNotifier<[number]>();

  const triggerImmediateZoomUpdate = useCallback(
    (percent: number) => {
      triggerImmediateZoomInternal(percent);
    },
    [triggerImmediateZoomInternal],
  );

  const triggerImmediateScrollUpdate = useCallback(
    (currentPage: number, totalPages: number) => {
      triggerImmediateScrollInternal(currentPage, totalPages);
    },
    [triggerImmediateScrollInternal],
  );

  const triggerImmediateSpreadUpdate = useCallback(
    (mode: SpreadMode, isDualPage: boolean = mode !== SpreadMode.None) => {
      triggerImmediateSpreadInternal(mode, isDualPage);
    },
    [triggerImmediateSpreadInternal],
  );

  const triggerImmediatePanUpdate = useCallback(
    (isPanning: boolean) => {
      triggerImmediatePanInternal(isPanning);
    },
    [triggerImmediatePanInternal],
  );

  const triggerImmediateRotationUpdate = useCallback(
    (rotation: number) => {
      triggerImmediateRotationInternal(rotation);
    },
    [triggerImmediateRotationInternal],
  );

  const registerBridge = useCallback(
    <K extends BridgeKey>(
      type: K,
      ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]> | null,
    ) => {
      setBridgeRef(bridgeRefs.current, type, ref);
    },
    [],
  );

  const toggleThumbnailSidebar = () => {
    setIsThumbnailSidebarVisible((prev) => !prev);
  };

  const toggleBookmarkSidebar = () => {
    setIsBookmarkSidebarVisible((prev) => !prev);
  };

  const toggleAttachmentSidebar = () => {
    setIsAttachmentSidebarVisible((prev) => !prev);
  };

  const toggleLayerSidebar = () => {
    setIsLayerSidebarVisible((prev) => !prev);
  };

  const setCommentsSidebarVisible = (visible: boolean) => {
    setIsCommentsSidebarVisible(visible);
  };

  const toggleCommentsSidebar = () => {
    setIsCommentsSidebarVisible((prev) => !prev);
  };

  const requestCommentFocus = useCallback(
    (
      documentId: string,
      pageIndex: number,
      annotationId: string,
      hasContent: boolean,
    ) => {
      setIsCommentsSidebarVisible(true);
      setHighlightCommentRequest({
        documentId,
        pageIndex,
        annotationId,
        action: hasContent ? "highlight" : "focus",
      });
    },
    [],
  );

  const clearHighlightCommentRequest = useCallback(() => {
    setHighlightCommentRequest(null);
  }, []);

  const searchInterfaceActions = {
    open: () => setSearchInterfaceVisible(true),
    close: () => setSearchInterfaceVisible(false),
    toggle: () => setSearchInterfaceVisible((prev) => !prev),
  };

  const toggleAnnotationsVisibility = () => {
    setIsAnnotationsVisible((prev) => !prev);
  };

  const setAnnotationMode = (enabled: boolean) => {
    setIsAnnotationModeState(enabled);
  };

  const cyclePdfRenderMode = useCallback(() => {
    setPdfRenderModeState((prev) => {
      const next: PdfRenderMode =
        prev === "normal" ? "dark" : prev === "dark" ? "sepia" : "normal";
      preferencesService.setPreference("pdfRenderMode", next);
      return next;
    });
  }, []);

  // State getters - read from bridge refs
  const getScrollState = (): ScrollState => {
    return (
      bridgeRefs.current.scroll?.state || { currentPage: 1, totalPages: 0 }
    );
  };

  const getZoomState = (): ZoomState => {
    return (
      bridgeRefs.current.zoom?.state || { currentZoom: 1.4, zoomPercent: 140 }
    );
  };

  const getPanState = (): PanState => {
    return bridgeRefs.current.pan?.state || { isPanning: false };
  };

  const getSelectionState = (): SelectionState => {
    return bridgeRefs.current.selection?.state || { hasSelection: false };
  };

  const getSpreadState = (): SpreadState => {
    return (
      bridgeRefs.current.spread?.state || {
        spreadMode: SpreadMode.None,
        isDualPage: false,
      }
    );
  };

  const getRotationState = (): RotationState => {
    return bridgeRefs.current.rotation?.state || { rotation: 0 };
  };

  const getSearchState = (): SearchState => {
    return (
      bridgeRefs.current.search?.state || { results: null, activeIndex: 0 }
    );
  };

  const getThumbnailAPI = () => {
    return bridgeRefs.current.thumbnail?.api || null;
  };

  const getExportState = (): ExportState => {
    return bridgeRefs.current.export?.state || { canExport: false };
  };

  const getBookmarkState = (): BookmarkState => {
    return (
      bridgeRefs.current.bookmark?.state || {
        bookmarks: null,
        isLoading: false,
        error: null,
      }
    );
  };

  const hasBookmarkSupport = () => Boolean(bridgeRefs.current.bookmark);

  const getAttachmentState = (): AttachmentState => {
    return (
      bridgeRefs.current.attachment?.state || {
        attachments: null,
        isLoading: false,
        error: null,
      }
    );
  };

  const hasAttachmentSupport = () => Boolean(bridgeRefs.current.attachment);

  const getDocumentPermissions = (): DocumentPermissionsState => {
    return (
      bridgeRefs.current.permissions?.state || {
        isEncrypted: false,
        isOwnerUnlocked: false,
        permissions: PdfPermissionFlag.AllowAll,
        canPrint: true,
        canModifyContents: true,
        canCopyContents: true,
        canModifyAnnotations: true,
        canFillForms: true,
        canExtractForAccessibility: true,
        canAssembleDocument: true,
        canPrintHighQuality: true,
      }
    );
  };

  const hasPermission = (flag: PdfPermissionFlag): boolean => {
    const api = bridgeRefs.current.permissions?.api;
    if (api?.hasPermission) {
      return api.hasPermission(flag);
    }
    // Default: allow all permissions - warn in development
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[ViewerContext] Permissions API not available, defaulting to allow",
      );
    }
    return true;
  };

  // Action handlers - call APIs directly
  const {
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    exportActions,
    bookmarkActions,
    attachmentActions,
    printActions,
  } = createViewerActions({
    registry: bridgeRefs,
    getScrollState,
    getZoomState,
    triggerImmediateZoomUpdate,
  });

  // Printing is an exit path, so a "run on export" policy must enforce here too.
  // Enforce the current file through the same path export uses: when a policy
  // rewrites it, that path versions the in-editor file to the enforced output
  // and marks it enforced, so a follow-up print of the unedited result prints
  // it as-is instead of re-running the (non-idempotent) policy. Ask the user to
  // review the updated doc before printing again, rather than printing bytes
  // they haven't seen. With no active export policy this is a no-op and print
  // runs straight away.
  const printWithPolicy = useCallback(async () => {
    const file = activeFileId
      ? selectors.getFiles([activeFileId as FileId])[0]
      : undefined;
    if (!activeFileId || !file) {
      printActions.print();
      return;
    }
    const [enforced] = await enforceExportPolicies(
      [file],
      [activeFileId],
      "print",
    );
    // Original file back means no policy rewrote it (no active policy, already
    // enforced, or graceful failure fallback) — nothing new to review, print it.
    if (!enforced || enforced === file) {
      printActions.print();
      return;
    }
    alert({
      alertType: "warning",
      title: t("policies.enforcement.printPolicyAppliedTitle"),
      body: t("policies.enforcement.printPolicyAppliedBody"),
    });
  }, [activeFileId, selectors, printActions]);

  const enforcedPrintActions = useMemo<PrintActions>(
    () => ({ print: printWithPolicy }),
    [printWithPolicy],
  );

  const zoomRestorePendingRef = useRef(false);
  const [zoomRestoreSettledTick, setZoomRestoreSettledTick] = useState(0);
  const notifyZoomRestoreSettled = useCallback(() => {
    setZoomRestoreSettledTick((tick) => tick + 1);
  }, []);

  const value: ViewerContextType = {
    // UI state
    isThumbnailSidebarVisible,
    toggleThumbnailSidebar,
    isBookmarkSidebarVisible,
    toggleBookmarkSidebar,
    isAttachmentSidebarVisible,
    toggleAttachmentSidebar,
    isLayerSidebarVisible,
    toggleLayerSidebar,
    hasLayers,
    setHasLayers,
    isCommentsSidebarVisible,
    setCommentsSidebarVisible,
    toggleCommentsSidebar,
    highlightCommentRequest,
    requestCommentFocus,
    clearHighlightCommentRequest,

    // Search interface
    isSearchInterfaceVisible,
    searchInterfaceActions,

    // Annotation controls
    isAnnotationsVisible,
    toggleAnnotationsVisibility,
    isAnnotationMode,
    setAnnotationMode,

    // Active file tracking
    activeFileId,
    setActiveFileId,
    activeFileIndex,
    setActiveFileIndex,

    // State getters
    getScrollState,
    getZoomState,
    getPanState,
    getSelectionState,
    getSpreadState,
    getRotationState,
    getSearchState,
    getThumbnailAPI,
    getExportState,
    getBookmarkState,
    hasBookmarkSupport,
    getAttachmentState,
    hasAttachmentSupport,
    getDocumentPermissions,
    hasPermission,

    // Immediate updates
    registerImmediateZoomUpdate,
    registerImmediateScrollUpdate,
    registerImmediateSpreadUpdate,
    registerImmediatePanUpdate,
    registerImmediateRotationUpdate,
    triggerImmediateScrollUpdate,
    triggerImmediateZoomUpdate,
    triggerImmediateSpreadUpdate,
    zoomRestorePendingRef,
    zoomRestoreSettledTick,
    notifyZoomRestoreSettled,
    triggerImmediatePanUpdate,
    triggerImmediateRotationUpdate,

    // Actions
    scrollActions,
    zoomActions,
    panActions,
    selectionActions,
    spreadActions,
    rotationActions,
    searchActions,
    exportActions,
    bookmarkActions,
    attachmentActions,
    printActions: enforcedPrintActions,

    // Bridge registration
    registerBridge,

    // Apply changes
    applyChanges,
    setApplyChanges,

    // PDF page rendering mode
    pdfRenderMode,
    cyclePdfRenderMode,
  };

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  );
};
