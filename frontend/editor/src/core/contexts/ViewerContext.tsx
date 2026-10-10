import React, {
  useState,
  useMemo,
  useEffect,
  useLayoutEffect,
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
import {
  ViewerContext,
  type ViewerContextType,
  ViewerActiveFileContext,
  type ViewerActiveFileType,
} from "@app/contexts/viewer/viewerContext";
import type { SpreadMode } from "@embedpdf/plugin-spread/react";

/**
 * SpreadMode.None as a literal. This context sits at the app root, and a runtime
 * import of any embedpdf module loads the whole viewer engine chunk, so
 * importing the enum would put all of it on the initial load. `satisfies` keeps
 * the literal checked against the library's own values.
 */
const SPREAD_NONE = "none" satisfies `${SpreadMode}` as SpreadMode;

export {
  ViewerContext,
  useViewer,
  ViewerActiveFileContext,
  useViewerActiveFile,
} from "@app/contexts/viewer/viewerContext";
export type {
  ViewerContextType,
  ViewerActiveFileType,
} from "@app/contexts/viewer/viewerContext";

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
  const selectorsRef = useRef(selectors);
  const tRef = useRef(t);
  const activeFileIdRef = useRef(activeFileId);
  // Updated after commit, not during render: a concurrent render React abandons
  // would otherwise leave the callbacks reading values that were never shown.
  useLayoutEffect(() => {
    selectorsRef.current = selectors;
    tRef.current = t;
    activeFileIdRef.current = activeFileId;
  }, [selectors, t, activeFileId]);
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
  const setActiveFileIndex = useCallback((index: number) => {
    const files = selectorsRef.current.getFiles();
    const file = files[index];
    if (file && isStirlingFile(file)) setActiveFileId(file.fileId);
  }, []);
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
    (mode: SpreadMode, isDualPage: boolean = mode !== SPREAD_NONE) => {
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

  const toggleThumbnailSidebar = useCallback(() => {
    setIsThumbnailSidebarVisible((prev) => !prev);
  }, []);

  const toggleBookmarkSidebar = useCallback(() => {
    setIsBookmarkSidebarVisible((prev) => !prev);
  }, []);

  const toggleAttachmentSidebar = useCallback(() => {
    setIsAttachmentSidebarVisible((prev) => !prev);
  }, []);

  const toggleLayerSidebar = useCallback(() => {
    setIsLayerSidebarVisible((prev) => !prev);
  }, []);

  const setCommentsSidebarVisible = useCallback((visible: boolean) => {
    setIsCommentsSidebarVisible(visible);
  }, []);

  const toggleCommentsSidebar = useCallback(() => {
    setIsCommentsSidebarVisible((prev) => !prev);
  }, []);

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

  const searchInterfaceActions = useMemo(
    () => ({
      open: () => setSearchInterfaceVisible(true),
      close: () => setSearchInterfaceVisible(false),
      toggle: () => setSearchInterfaceVisible((prev) => !prev),
    }),
    [],
  );

  const toggleAnnotationsVisibility = useCallback(() => {
    setIsAnnotationsVisible((prev) => !prev);
  }, []);

  const setAnnotationMode = useCallback((enabled: boolean) => {
    setIsAnnotationModeState(enabled);
  }, []);

  const cyclePdfRenderMode = useCallback(() => {
    setPdfRenderModeState((prev) => {
      const next: PdfRenderMode =
        prev === "normal" ? "dark" : prev === "dark" ? "sepia" : "normal";
      preferencesService.setPreference("pdfRenderMode", next);
      return next;
    });
  }, []);

  // State getters - read from bridge refs
  const getScrollState = useCallback((): ScrollState => {
    return (
      bridgeRefs.current.scroll?.state || { currentPage: 1, totalPages: 0 }
    );
  }, []);

  const getZoomState = useCallback((): ZoomState => {
    return (
      bridgeRefs.current.zoom?.state || { currentZoom: 1.4, zoomPercent: 140 }
    );
  }, []);

  const getPanState = useCallback((): PanState => {
    return bridgeRefs.current.pan?.state || { isPanning: false };
  }, []);

  const getSelectionState = useCallback((): SelectionState => {
    return bridgeRefs.current.selection?.state || { hasSelection: false };
  }, []);

  const getSpreadState = useCallback((): SpreadState => {
    return (
      bridgeRefs.current.spread?.state || {
        spreadMode: SPREAD_NONE,
        isDualPage: false,
      }
    );
  }, []);

  const getRotationState = useCallback((): RotationState => {
    return bridgeRefs.current.rotation?.state || { rotation: 0 };
  }, []);

  const getSearchState = useCallback((): SearchState => {
    return (
      bridgeRefs.current.search?.state || { results: null, activeIndex: 0 }
    );
  }, []);

  const getThumbnailAPI = useCallback(() => {
    return bridgeRefs.current.thumbnail?.api || null;
  }, []);

  const getExportState = useCallback((): ExportState => {
    return bridgeRefs.current.export?.state || { canExport: false };
  }, []);

  const getBookmarkState = useCallback((): BookmarkState => {
    return (
      bridgeRefs.current.bookmark?.state || {
        bookmarks: null,
        isLoading: false,
        error: null,
      }
    );
  }, []);

  const hasBookmarkSupport = useCallback(
    () => Boolean(bridgeRefs.current.bookmark),
    [],
  );

  const getAttachmentState = useCallback((): AttachmentState => {
    return (
      bridgeRefs.current.attachment?.state || {
        attachments: null,
        isLoading: false,
        error: null,
      }
    );
  }, []);

  const hasAttachmentSupport = useCallback(
    () => Boolean(bridgeRefs.current.attachment),
    [],
  );

  const getDocumentPermissions = useCallback((): DocumentPermissionsState => {
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
  }, []);

  const hasPermission = useCallback((flag: PdfPermissionFlag): boolean => {
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
  }, []);

  // Action handlers - call APIs directly
  const actionsBundle = useMemo(
    () =>
      createViewerActions({
        registry: bridgeRefs,
        getScrollState,
        getZoomState,
        triggerImmediateZoomUpdate,
      }),
    [getScrollState, getZoomState, triggerImmediateZoomUpdate],
  );

  // Printing is an exit path, so a "run on export" policy must enforce here too.
  // Enforce the current file through the same path export uses: when a policy
  // rewrites it, that path versions the in-editor file to the enforced output
  // and marks it enforced, so a follow-up print of the unedited result prints
  // it as-is instead of re-running the (non-idempotent) policy. Ask the user to
  // review the updated doc before printing again, rather than printing bytes
  // they haven't seen. With no active export policy this is a no-op and print
  // runs straight away.
  const printWithPolicy = useCallback(async () => {
    // Through a ref: switching the active file must not rebuild this callback,
    // or the memoised actions bundle and every effect depending on it churn.
    const currentActiveFileId = activeFileIdRef.current;
    const file = currentActiveFileId
      ? selectorsRef.current.getFiles([currentActiveFileId as FileId])[0]
      : undefined;
    if (!currentActiveFileId || !file) {
      actionsBundle.printActions.print();
      return;
    }
    const [enforced] = await enforceExportPolicies(
      [file],
      [currentActiveFileId],
      "print",
    );
    // Original file back means no policy rewrote it (no active policy, already
    // enforced, or graceful failure fallback) — nothing new to review, print it.
    if (!enforced || enforced === file) {
      actionsBundle.printActions.print();
      return;
    }
    alert({
      alertType: "warning",
      title: tRef.current("policies.enforcement.printPolicyAppliedTitle"),
      body: tRef.current("policies.enforcement.printPolicyAppliedBody"),
    });
  }, [actionsBundle.printActions]);

  const enforcedPrintActions = useMemo<PrintActions>(
    () => ({ print: printWithPolicy }),
    [printWithPolicy],
  );

  const zoomRestorePendingRef = useRef(false);
  const [zoomRestoreSettledTick, setZoomRestoreSettledTick] = useState(0);
  const notifyZoomRestoreSettled = useCallback(() => {
    setZoomRestoreSettledTick((tick) => tick + 1);
  }, []);

  const value = useMemo<ViewerContextType>(
    () => ({
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
      scrollActions: actionsBundle.scrollActions,
      zoomActions: actionsBundle.zoomActions,
      panActions: actionsBundle.panActions,
      selectionActions: actionsBundle.selectionActions,
      spreadActions: actionsBundle.spreadActions,
      rotationActions: actionsBundle.rotationActions,
      searchActions: actionsBundle.searchActions,
      exportActions: actionsBundle.exportActions,
      bookmarkActions: actionsBundle.bookmarkActions,
      attachmentActions: actionsBundle.attachmentActions,
      printActions: enforcedPrintActions,

      // Bridge registration
      registerBridge,

      // Apply changes
      applyChanges,
      setApplyChanges,

      // PDF page rendering mode
      pdfRenderMode,
      cyclePdfRenderMode,
    }),
    [
      isThumbnailSidebarVisible,
      toggleThumbnailSidebar,
      isBookmarkSidebarVisible,
      toggleBookmarkSidebar,
      isAttachmentSidebarVisible,
      toggleAttachmentSidebar,
      isLayerSidebarVisible,
      toggleLayerSidebar,
      hasLayers,
      isCommentsSidebarVisible,
      setCommentsSidebarVisible,
      toggleCommentsSidebar,
      highlightCommentRequest,
      requestCommentFocus,
      clearHighlightCommentRequest,
      isSearchInterfaceVisible,
      searchInterfaceActions,
      isAnnotationsVisible,
      toggleAnnotationsVisibility,
      isAnnotationMode,
      setAnnotationMode,
      activeFileId,
      activeFileIndex,
      setActiveFileIndex,
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
      registerImmediateZoomUpdate,
      registerImmediateScrollUpdate,
      registerImmediateSpreadUpdate,
      registerImmediatePanUpdate,
      registerImmediateRotationUpdate,
      triggerImmediateScrollUpdate,
      triggerImmediateZoomUpdate,
      triggerImmediateSpreadUpdate,
      zoomRestoreSettledTick,
      notifyZoomRestoreSettled,
      triggerImmediatePanUpdate,
      triggerImmediateRotationUpdate,
      actionsBundle,
      enforcedPrintActions,
      registerBridge,
      applyChanges,
      setApplyChanges,
      pdfRenderMode,
      cyclePdfRenderMode,
    ],
  );

  const activeFileValue: ViewerActiveFileType = useMemo(
    () => ({
      activeFileId,
      setActiveFileId,
    }),
    [activeFileId],
  );

  return (
    <ViewerActiveFileContext.Provider value={activeFileValue}>
      <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
    </ViewerActiveFileContext.Provider>
  );
};
