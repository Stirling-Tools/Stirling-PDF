import { createContext, useContext, type MutableRefObject } from "react";
import type { PdfRenderMode } from "@app/services/preferencesService";
import type {
  ScrollActions,
  ZoomActions,
  PanActions,
  SelectionActions,
  SpreadActions,
  RotationActions,
  SearchActions,
  ExportActions,
  BookmarkActions,
  AttachmentActions,
  PrintActions,
} from "@app/contexts/viewer/viewerActions";
import type {
  BridgeRef,
  BridgeApiMap,
  BridgeStateMap,
  BridgeKey,
  ScrollState,
  ZoomState,
  PanState,
  SelectionState,
  SpreadState,
  RotationState,
  SearchState,
  ExportState,
  ThumbnailAPIWrapper,
  BookmarkState,
  AttachmentState,
  DocumentPermissionsState,
  PdfPermissionFlag,
} from "@app/contexts/viewer/viewerBridges";
import type { SpreadMode } from "@embedpdf/plugin-spread/react";

/**
 * ViewerContext provides a unified interface to EmbedPDF functionality.
 *
 * Architecture:
 * - Bridges store their own state locally and register with this context
 * - Context provides read-only access to bridge state via getter functions
 * - Actions call EmbedPDF APIs directly through bridge references
 * - No circular dependencies - bridges don't call back into this context
 */
export interface ViewerContextType {
  isThumbnailSidebarVisible: boolean;
  toggleThumbnailSidebar: () => void;
  isBookmarkSidebarVisible: boolean;
  toggleBookmarkSidebar: () => void;
  isAttachmentSidebarVisible: boolean;
  toggleAttachmentSidebar: () => void;
  isLayerSidebarVisible: boolean;
  toggleLayerSidebar: () => void;
  isCommentsSidebarVisible: boolean;
  setCommentsSidebarVisible: (visible: boolean) => void;
  toggleCommentsSidebar: () => void;

  /** Request focus or highlight of a comment card in the sidebar (opens sidebar, then scrolls + flashes or focuses input). */
  highlightCommentRequest: {
    documentId: string;
    pageIndex: number;
    annotationId: string;
    action: "focus" | "highlight";
  } | null;
  requestCommentFocus: (
    documentId: string,
    pageIndex: number,
    annotationId: string,
    hasContent: boolean,
  ) => void;
  clearHighlightCommentRequest: () => void;

  isSearchInterfaceVisible: boolean;
  searchInterfaceActions: {
    open: () => void;
    close: () => void;
    toggle: () => void;
  };

  isAnnotationsVisible: boolean;
  toggleAnnotationsVisibility: () => void;

  isAnnotationMode: boolean;
  setAnnotationMode: (enabled: boolean) => void;

  // Active file tracking — ID is the stable source of truth; index is derived from it
  activeFileId: string | null;
  setActiveFileId: (id: string | null) => void;
  activeFileIndex: number;
  setActiveFileIndex: (index: number) => void;

  getScrollState: () => ScrollState;
  getZoomState: () => ZoomState;
  getPanState: () => PanState;
  getSelectionState: () => SelectionState;
  getSpreadState: () => SpreadState;
  getRotationState: () => RotationState;
  getSearchState: () => SearchState;
  getThumbnailAPI: () => ThumbnailAPIWrapper | null;
  getExportState: () => ExportState;
  getBookmarkState: () => BookmarkState;
  hasBookmarkSupport: () => boolean;
  getAttachmentState: () => AttachmentState;
  hasAttachmentSupport: () => boolean;
  getDocumentPermissions: () => DocumentPermissionsState;
  hasPermission: (flag: PdfPermissionFlag) => boolean;

  registerImmediateZoomUpdate: (
    callback: (percent: number) => void,
  ) => () => void;
  registerImmediateScrollUpdate: (
    callback: (currentPage: number, totalPages: number) => void,
  ) => () => void;
  registerImmediateSpreadUpdate: (
    callback: (mode: SpreadMode, isDualPage: boolean) => void,
  ) => () => void;
  registerImmediatePanUpdate: (
    callback: (isPanning: boolean) => void,
  ) => () => void;
  registerImmediateRotationUpdate: (
    callback: (rotation: number) => void,
  ) => () => void;

  // True while a carried zoom lands after a swap; zoom percent updates in that
  // window are intermediate and must not reach the toolbar.
  zoomRestorePendingRef: MutableRefObject<boolean>;
  /** Bumped when the carried zoom settles so bridges can re-publish the state. */
  zoomRestoreSettledTick: number;
  notifyZoomRestoreSettled: () => void;

  triggerImmediateScrollUpdate: (
    currentPage: number,
    totalPages: number,
  ) => void;
  triggerImmediateZoomUpdate: (zoomPercent: number) => void;
  triggerImmediateSpreadUpdate: (
    mode: SpreadMode,
    isDualPage?: boolean,
  ) => void;
  triggerImmediatePanUpdate: (isPanning: boolean) => void;
  triggerImmediateRotationUpdate: (rotation: number) => void;

  scrollActions: ScrollActions;
  zoomActions: ZoomActions;
  panActions: PanActions;
  selectionActions: SelectionActions;
  spreadActions: SpreadActions;
  rotationActions: RotationActions;
  searchActions: SearchActions;
  exportActions: ExportActions;
  bookmarkActions: BookmarkActions;
  attachmentActions: AttachmentActions;
  printActions: PrintActions;

  registerBridge: <K extends BridgeKey>(
    type: K,
    ref: BridgeRef<BridgeStateMap[K], BridgeApiMap[K]> | null,
  ) => void;

  // Save changes function - registered by EmbedPdfViewer
  applyChanges: (() => Promise<void>) | null;
  setApplyChanges: (fn: (() => Promise<void>) | null) => void;

  // PDF page color rendering mode (viewer-only, never modifies the PDF)
  pdfRenderMode: PdfRenderMode;
  cyclePdfRenderMode: () => void;
}

// Shared outside the provider module so Fast Refresh cannot split mounted providers from their consumers.
export const ViewerContext = createContext<ViewerContextType | null>(null);

/** Requires an ancestor ViewerProvider; missing providers are programming errors. */
export const useViewer = (): ViewerContextType => {
  const context = useContext(ViewerContext);
  if (!context) {
    throw new Error("useViewer must be used within a ViewerProvider");
  }
  return context;
};
