import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPluginRegistration, type PluginRegistry } from "@embedpdf/core";
import type { InitialDocumentOptions } from "@embedpdf/plugin-document-manager";
import { EmbedPDF, useDocumentState } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { useAppConfig } from "@app/contexts/AppConfigContext";

// Import the essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionLayer,
  SelectionPluginPackage,
} from "@embedpdf/plugin-selection/react";
import {
  TilingLayer,
  TilingPluginPackage,
} from "@embedpdf/plugin-tiling/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { VIEWER_PAN_CONFIG } from "@app/components/viewer/viewerPanConfig";
import {
  ViewerGlobalPointerProvider,
  ViewerPagePointerProvider,
} from "@app/components/viewer/ViewerPointerProviders";
import { SpreadPluginPackage, SpreadMode } from "@embedpdf/plugin-spread/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";
import { RotatePluginPackage, Rotate } from "@embedpdf/plugin-rotate/react";
import { ExportPluginPackage } from "@embedpdf/plugin-export/react";
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark/react";
import { AttachmentPluginPackage } from "@embedpdf/plugin-attachment/react";
import { PrintPluginPackage } from "@embedpdf/plugin-print/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import {
  AnnotationLayer,
  AnnotationPluginPackage,
} from "@embedpdf/plugin-annotation/react";
import type { AnnotationEvent } from "@embedpdf/plugin-annotation";
import type { PdfAnnotationObject, Rect } from "@embedpdf/models";
import { registerAnnotationTools } from "@app/components/viewer/annotationTools";
import {
  RedactionPluginPackage,
  RedactionLayer,
} from "@embedpdf/plugin-redaction/react";
import { CustomSearchLayer } from "@app/components/viewer/CustomSearchLayer";
import { ZoomAPIBridge } from "@app/components/viewer/ZoomAPIBridge";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { ScrollAPIBridge } from "@app/components/viewer/ScrollAPIBridge";
import { SelectionAPIBridge } from "@app/components/viewer/SelectionAPIBridge";
import { PanAPIBridge } from "@app/components/viewer/PanAPIBridge";
import { SpreadAPIBridge } from "@app/components/viewer/SpreadAPIBridge";
import { SearchAPIBridge } from "@app/components/viewer/SearchAPIBridge";
import { ThumbnailAPIBridge } from "@app/components/viewer/ThumbnailAPIBridge";
import { RotateAPIBridge } from "@app/components/viewer/RotateAPIBridge";
import { SignatureAPIBridge } from "@app/components/viewer/SignatureAPIBridge";
import { AnnotationAPIBridge } from "@app/components/viewer/AnnotationAPIBridge";
import { HistoryAPIBridge } from "@app/components/viewer/HistoryAPIBridge";
import type {
  SignatureAPI,
  AnnotationAPI,
  AnnotationMenuAnchor,
  HistoryAPI,
  SignaturePreview,
  SignatureOverlayAPI,
} from "@app/components/viewer/viewerTypes";
import {
  SignaturePreviewLayer,
  type SignaturePreviewLayerProps,
} from "@app/components/viewer/SignaturePreviewLayer";
import { ExportAPIBridge } from "@app/components/viewer/ExportAPIBridge";
import { BookmarkAPIBridge } from "@app/components/viewer/BookmarkAPIBridge";
import { AttachmentAPIBridge } from "@app/components/viewer/AttachmentAPIBridge";
import { PrintAPIBridge } from "@app/components/viewer/PrintAPIBridge";
import { isPdfFile } from "@app/utils/fileUtils";
import { useTranslation } from "react-i18next";
import { LinkLayer } from "@app/components/viewer/LinkLayer";
import { TextSelectionHandler } from "@app/components/viewer/TextSelectionHandler";
import { RedactionSelectionMenu } from "@app/components/viewer/RedactionSelectionMenu";
import { AnnotationSelectionMenu } from "@app/components/viewer/AnnotationSelectionMenu";
import { AnnotationMenuEvents } from "@app/components/viewer/AnnotationMenuEvents";
import { DocumentSwapBridge } from "@app/components/viewer/DocumentSwapBridge";
import { AnnotationDeletedMenu } from "@app/components/viewer/AnnotationDeletedMenu";
import { TextSelectionMenu } from "@app/components/viewer/TextSelectionMenu";
import {
  RedactionPendingTracker,
  RedactionPendingTrackerAPI,
} from "@app/components/viewer/RedactionPendingTracker";
import { RedactionAPIBridge } from "@app/components/viewer/RedactionAPIBridge";
import { DocumentPermissionsAPIBridge } from "@app/components/viewer/DocumentPermissionsAPIBridge";
import { DocumentReadyWrapper } from "@app/components/viewer/DocumentReadyWrapper";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";
import { getLocalFontFallbackConfig } from "@app/services/pdfiumFontFallback";
import { pdfiumWasmUrl } from "@app/services/wasmPrecompiler";
import { FormFieldOverlay } from "@app/tools/formFill/FormFieldOverlay";
import { FormCreationInteractionLock } from "@app/tools/formFill/FormCreationInteractionLock";
import { FormFieldCreationOverlay } from "@app/tools/formFill/FormFieldCreationOverlay";
import { FormFieldEditOverlay } from "@app/tools/formFill/FormFieldEditOverlay";
import { ButtonAppearanceOverlay } from "@app/tools/formFill/ButtonAppearanceOverlay";
import SignatureFieldOverlay from "@app/components/viewer/SignatureFieldOverlay";
import { CommentsSidebar } from "@app/components/viewer/CommentsSidebar";
import { CommentAuthorProvider } from "@app/contexts/CommentAuthorContext";
import { accountService } from "@app/services/accountService";

interface LocalEmbedPDFProps {
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
  enableAnnotations?: boolean;
  enableRedaction?: boolean;
  enableFormFill?: boolean;
  /** Structural create/modify overlays only mount while the Form tool owns the viewer. */
  formEditingActive?: boolean;
  isManualRedactionMode?: boolean;
  showBakedAnnotations?: boolean;
  onSignatureAdded?: (annotation: PdfAnnotationObject) => void;
  signatureApiRef?: React.RefObject<SignatureAPI | null>;
  annotationApiRef?: React.RefObject<AnnotationAPI | null>;
  historyApiRef?: React.RefObject<HistoryAPI | null>;
  redactionTrackerRef?: React.RefObject<RedactionPendingTrackerAPI>;
  /** File identity passed through to FormFieldOverlay for stale-field guards */
  fileId?: string | null;
  /** Comments sidebar visibility and offset (from EmbedPdfViewer) */
  isCommentsSidebarVisible?: boolean;
  commentsSidebarRightOffset?: string;
  /** When true, blocks the general ink/pen annotation tool (sign tool context). */
  isSignMode?: boolean;
  /** Controls CSS filter applied only to rendered PDF canvas tiles */
  pdfRenderMode?: "normal" | "dark" | "sepia";
  // ── Signature overlay (opt-in; all default off) ──────────────────────────
  /** Read-only / interactive signature preview overlays to render per page. */
  signaturePreviews?: SignaturePreview[];
  /** If true, previews are display-only (cannot be moved, resized, or deleted). */
  signaturePreviewsReadOnly?: boolean;
  /** When true (and not read-only), clicking a page places a new preview. */
  signaturePlacementMode?: boolean;
  /** Base64 PNG used for placement and the cursor ghost preview. */
  signaturePlacementData?: string;
  /** Signature type assigned to newly placed previews. */
  signaturePlacementType?: "canvas" | "image" | "text";
  /** Emits the full updated preview array whenever overlays change. */
  onSignaturePreviewsChange?: (previews: SignaturePreview[]) => void;
  /** Imperative handle for reading/clearing/deleting signature previews. */
  signatureOverlayApiRef?: React.RefObject<SignatureOverlayAPI | null>;
  /** Veto for a swap the mounted document already shows; must be stable. */
  shouldSkipBytes?: (stableKey: string) => boolean;
  /** Fires from the layout pass that mounts a page, before it paints. */
  onPageLayout?: () => void;
  /** Fires when the swap bridge activates a replacement document. */
  onDocumentSwapped?: () => void;
  /** Fires when the swap bridge fails to open or activate a replacement document. */
  onDocumentSwapFailed?: (error: unknown) => void;
  /** True while a view restore is in flight; gates the per-page layout hook. */
  restorePending?: boolean;
}

interface ViewerPageContainerProps {
  documentId: string;
  pageIndex: number;
  width: number;
  height: number;
  children: React.ReactNode;
  /** Runs in the same layout pass that mounts a page, before it paints. */
  onPageLayout?: () => void;
  /** Gates the layout callback so steady-state scrolling pays nothing. */
  restorePending?: boolean;
}

function normalizePageRotation(rotation: number | null | undefined): number {
  const value =
    typeof rotation === "number" && Number.isFinite(rotation) ? rotation : 0;
  return ((Math.round(value) % 4) + 4) % 4;
}

function ViewerPageContainer({
  documentId,
  pageIndex,
  width,
  height,
  children,
  onPageLayout,
  restorePending = false,
}: ViewerPageContainerProps) {
  const documentState = useDocumentState(documentId);
  const pageRotation = normalizePageRotation(
    documentState?.document?.pages?.[pageIndex]?.rotation,
  );

  useLayoutEffect(() => {
    if (!restorePending) return;
    onPageLayout?.();
  });

  return (
    <div
      data-page-index={pageIndex}
      data-page-width={width}
      data-page-height={height}
      data-page-rotation={pageRotation}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden", // clip overlays (buttons, fields) that extend beyond the page rect
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
      }}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

type SignatureOverlayOptions = Omit<
  SignaturePreviewLayerProps,
  "pageIndex" | "pageWidth" | "pageHeight"
>;

type PdfRenderMode = NonNullable<LocalEmbedPDFProps["pdfRenderMode"]>;

const PDF_RENDER_FILTERS: Record<PdfRenderMode, string | undefined> = {
  normal: undefined,
  dark: "invert(1) hue-rotate(180deg)",
  sepia: "sepia(0.7) brightness(0.85)",
};

interface PageLayerProps {
  documentId: string;
  pageIndex: number;
}

interface PageGeometry extends PageLayerProps {
  width: number;
  height: number;
}

interface PageLayerOptions {
  file?: File | Blob;
  fileId?: string | null;
  pdfRenderMode: PdfRenderMode;
  enableFormFill: boolean;
  formEditingActive: boolean;
  enableAnnotations: boolean;
  enableRedaction: boolean;
  showBakedAnnotations: boolean;
  onAnnotationMenuAnchor: (anchor: AnnotationMenuAnchor | null) => void;
  /** Null while the signature preview overlay is not mounted. */
  signatureOverlay: SignatureOverlayOptions | null;
}

/** Everything a page needs besides the geometry the Scroller supplies. */
interface ViewerPageOptions extends PageLayerOptions {
  onPageLayout?: () => void;
  restorePending: boolean;
}

function PageTiles({
  documentId,
  pageIndex,
  renderMode,
}: PageLayerProps & { renderMode: PdfRenderMode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transition: "filter 0.25s ease",
        filter: PDF_RENDER_FILTERS[renderMode],
      }}
    >
      <TilingLayer documentId={documentId} pageIndex={pageIndex} />
    </div>
  );
}

function PageTextSelection({ documentId, pageIndex }: PageLayerProps) {
  return (
    <>
      <div
        className="pdf-selection-layer"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
        }}
      >
        <SelectionLayer
          documentId={documentId}
          pageIndex={pageIndex}
          background="var(--pdf-selection-bg)"
          selectionMenu={(props) => <TextSelectionMenu {...props} />}
        />
      </div>
      <TextSelectionHandler documentId={documentId} pageIndex={pageIndex} />
    </>
  );
}

interface FormFieldLayersProps extends PageGeometry {
  fileId?: string | null;
}

function FormFieldEditingOverlays({
  active,
  documentId,
  pageIndex,
  width,
  height,
  fileId,
}: FormFieldLayersProps & { active: boolean }) {
  if (!active) return null;
  return (
    <>
      {/* Create-mode: drag to place new fields */}
      <FormFieldCreationOverlay
        documentId={documentId}
        pageIndex={pageIndex}
        pageWidth={width}
        pageHeight={height}
        fileId={fileId}
      />
      {/* Modify-mode: select / move / resize existing fields */}
      <FormFieldEditOverlay
        documentId={documentId}
        pageIndex={pageIndex}
        pageWidth={width}
        pageHeight={height}
        fileId={fileId}
      />
    </>
  );
}

function FormFillLayers({
  enabled,
  editing,
  file,
  ...page
}: FormFieldLayersProps & {
  enabled: boolean;
  editing: boolean;
  file?: File | Blob;
}) {
  if (!enabled) return null;
  return (
    <>
      {/* ButtonAppearanceOverlay: renders PDF-native button visuals as bitmaps */}
      {file && (
        <ButtonAppearanceOverlay
          pageIndex={page.pageIndex}
          pdfSource={file}
          pageWidth={page.width}
          pageHeight={page.height}
        />
      )}
      {/* FormFieldOverlay for interactive form filling */}
      <FormFieldOverlay
        documentId={page.documentId}
        pageIndex={page.pageIndex}
        pageWidth={page.width}
        pageHeight={page.height}
        fileId={page.fileId}
      />
      <FormFieldEditingOverlays active={editing} {...page} />
    </>
  );
}

interface AnnotationEditingLayersProps extends PageLayerProps {
  enableAnnotations: boolean;
  enableRedaction: boolean;
  showBakedAnnotations: boolean;
  onAnnotationMenuAnchor: (anchor: AnnotationMenuAnchor | null) => void;
}

function AnnotationEditingLayers({
  documentId,
  pageIndex,
  enableAnnotations,
  enableRedaction,
  showBakedAnnotations,
  onAnnotationMenuAnchor,
}: AnnotationEditingLayersProps) {
  if (!enableAnnotations && !enableRedaction) return null;
  return (
    <>
      {/* AnnotationLayer for annotation editing and annotation-based redactions */}
      <AnnotationLayer
        documentId={documentId}
        pageIndex={pageIndex}
        selectionOutline={{ color: "#007ACC" }}
        selectionMenu={(props) => (
          <AnnotationSelectionMenu
            {...props}
            onAnchor={onAnnotationMenuAnchor}
          />
        )}
        style={
          !showBakedAnnotations
            ? {
                opacity: 0,
                pointerEvents: "none",
              }
            : undefined
        }
      />
      {enableRedaction && (
        <RedactionLayer
          documentId={documentId}
          pageIndex={pageIndex}
          selectionMenu={(props) => <RedactionSelectionMenu {...props} />}
        />
      )}
    </>
  );
}

function PageLayers({
  documentId,
  pageIndex,
  width,
  height,
  file,
  fileId,
  pdfRenderMode,
  enableFormFill,
  formEditingActive,
  enableAnnotations,
  enableRedaction,
  showBakedAnnotations,
  onAnnotationMenuAnchor,
  signatureOverlay,
}: PageGeometry & PageLayerOptions) {
  return (
    <>
      <PageTiles
        documentId={documentId}
        pageIndex={pageIndex}
        renderMode={pdfRenderMode}
      />
      <CustomSearchLayer documentId={documentId} pageIndex={pageIndex} />
      <PageTextSelection documentId={documentId} pageIndex={pageIndex} />
      <FormFillLayers
        enabled={enableFormFill}
        editing={formEditingActive}
        file={file}
        documentId={documentId}
        pageIndex={pageIndex}
        width={width}
        height={height}
        fileId={fileId}
      />
      {/* SignatureFieldOverlay: bitmaps of digital-signature appearances */}
      {file && (
        <SignatureFieldOverlay
          documentId={documentId}
          pageIndex={pageIndex}
          pdfSource={file}
          pageWidth={width}
          pageHeight={height}
        />
      )}
      <AnnotationEditingLayers
        documentId={documentId}
        pageIndex={pageIndex}
        enableAnnotations={enableAnnotations}
        enableRedaction={enableRedaction}
        showBakedAnnotations={showBakedAnnotations}
        onAnnotationMenuAnchor={onAnnotationMenuAnchor}
      />
      {/* LinkLayer: uses EmbedPDF annotation state for link rendering */}
      <LinkLayer documentId={documentId} pageIndex={pageIndex} />
      {/* Signature preview overlay (opt-in; off by default) */}
      {signatureOverlay && (
        <SignaturePreviewLayer
          pageIndex={pageIndex}
          pageWidth={width}
          pageHeight={height}
          {...signatureOverlay}
        />
      )}
    </>
  );
}

function ViewerPage({
  onPageLayout,
  restorePending,
  ...layers
}: PageGeometry & ViewerPageOptions) {
  const { documentId, pageIndex } = layers;
  return (
    <Rotate documentId={documentId} pageIndex={pageIndex}>
      <ViewerPagePointerProvider documentId={documentId} pageIndex={pageIndex}>
        <ViewerPageContainer
          documentId={documentId}
          pageIndex={pageIndex}
          width={layers.width}
          height={layers.height}
          onPageLayout={onPageLayout}
          restorePending={restorePending}
        >
          <PageLayers {...layers} />
        </ViewerPageContainer>
      </ViewerPagePointerProvider>
    </Rotate>
  );
}

interface DocumentViewportProps {
  documentId: string;
  pageOptions: ViewerPageOptions;
}

function DocumentViewport({ documentId, pageOptions }: DocumentViewportProps) {
  return (
    <ViewerGlobalPointerProvider documentId={documentId}>
      <Viewport
        documentId={documentId}
        style={{
          backgroundColor: "var(--c-bg)",
          height: "100%",
          width: "100%",
          maxHeight: "100%",
          maxWidth: "100%",
          overflow: "auto",
          position: "relative",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          contain: "strict",
        }}
      >
        <Scroller
          documentId={documentId}
          renderPage={({ width, height, pageIndex }) => (
            <ViewerPage
              key={`${documentId}-${pageIndex}`}
              documentId={documentId}
              pageIndex={pageIndex}
              width={width}
              height={height}
              {...pageOptions}
            />
          )}
        />
      </Viewport>
    </ViewerGlobalPointerProvider>
  );
}

interface DocumentCommentsProps {
  enabled: boolean;
  documentId: string;
  authorName: string;
  visible: boolean;
  rightOffset: string;
}

function DocumentComments({
  enabled,
  documentId,
  authorName,
  visible,
  rightOffset,
}: DocumentCommentsProps) {
  if (!enabled) return null;
  return (
    <CommentAuthorProvider displayName={authorName}>
      <CommentsSidebar
        documentId={documentId}
        visible={visible}
        rightOffset={rightOffset}
      />
    </CommentAuthorProvider>
  );
}

type EditingBridgesProps = Pick<
  LocalEmbedPDFProps,
  | "historyApiRef"
  | "signatureApiRef"
  | "annotationApiRef"
  | "redactionTrackerRef"
> & {
  enableAnnotations: boolean;
  enableRedaction: boolean;
  isManualRedactionMode: boolean;
  isSignMode: boolean;
  getAnnotationAnchor: (annotationId: string) => AnnotationMenuAnchor | null;
  onAnnotationDeleted: (anchor: AnnotationMenuAnchor) => void;
  deletedAnnotationMenu: AnnotationMenuAnchor | null;
  onDismissDeletedAnnotationMenu: () => void;
};

/** Bridges that exist only while annotations or redaction can edit the document. */
function EditingBridges({
  enableAnnotations,
  enableRedaction,
  isManualRedactionMode,
  isSignMode,
  historyApiRef,
  signatureApiRef,
  annotationApiRef,
  redactionTrackerRef,
  getAnnotationAnchor,
  onAnnotationDeleted,
  deletedAnnotationMenu,
  onDismissDeletedAnnotationMenu,
}: EditingBridgesProps) {
  const redactionActive = enableRedaction || isManualRedactionMode;
  if (!enableAnnotations && !redactionActive) return null;
  return (
    <>
      <HistoryAPIBridge ref={historyApiRef} />
      <AnnotationMenuEvents
        getAnchor={getAnnotationAnchor}
        onDeleted={onAnnotationDeleted}
      />
      <AnnotationDeletedMenu
        anchor={deletedAnnotationMenu}
        onDismiss={onDismissDeletedAnnotationMenu}
      />
      {/* Always render RedactionAPIBridge when in manual redaction mode so buttons can switch from annotation mode */}
      {redactionActive && <RedactionAPIBridge />}
      {/* Always render SignatureAPIBridge so annotation tools (draw) can be activated even when starting in redaction mode */}
      <SignatureAPIBridge ref={signatureApiRef} isSignMode={isSignMode} />
      {redactionActive && <RedactionPendingTracker ref={redactionTrackerRef} />}
      {enableAnnotations && <AnnotationAPIBridge ref={annotationApiRef} />}
    </>
  );
}

export function LocalEmbedPDF({
  file,
  url,
  fileName,
  enableAnnotations = false,
  enableRedaction = false,
  enableFormFill = false,
  formEditingActive = false,
  isManualRedactionMode = false,
  showBakedAnnotations = true,
  onSignatureAdded,
  signatureApiRef,
  annotationApiRef,
  historyApiRef,
  redactionTrackerRef,
  fileId,
  isCommentsSidebarVisible = false,
  commentsSidebarRightOffset = "0rem",
  isSignMode = false,
  pdfRenderMode = "normal",
  signaturePreviews,
  signaturePreviewsReadOnly = false,
  signaturePlacementMode = false,
  signaturePlacementData,
  signaturePlacementType,
  onSignaturePreviewsChange,
  signatureOverlayApiRef,
  shouldSkipBytes,
  onPageLayout,
  onDocumentSwapped,
  onDocumentSwapFailed,
  restorePending = false,
}: LocalEmbedPDFProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [pdfUrl, setPdfUrl] = useState<string | null>(() => url ?? null);
  const [, setAnnotations] = useState<
    Array<{ id: string; pageIndex: number; rect: Rect }>
  >([]);
  const [commentAuthorName, setCommentAuthorName] = useState<string>("Guest");

  const [localSignaturePreviews, setLocalSignaturePreviews] = useState<
    SignaturePreview[]
  >(signaturePreviews ?? []);

  // Mount the overlay for controlled previews, placement mode, or once any
  // signature is placed — so leaving placement mode doesn't hide placements.
  const signatureOverlayEnabled =
    signaturePreviews !== undefined ||
    signaturePlacementMode ||
    localSignaturePreviews.length > 0;
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(
    null,
  );

  // Keep internal state in sync when the caller supplies controlled previews.
  useEffect(() => {
    if (signaturePreviews !== undefined) {
      setLocalSignaturePreviews(signaturePreviews);
    }
  }, [signaturePreviews]);

  const handleSignaturePreviewsChange = useCallback(
    (next: SignaturePreview[]) => {
      setLocalSignaturePreviews(next);
      onSignaturePreviewsChange?.(next);
    },
    [onSignaturePreviewsChange],
  );

  useImperativeHandle(
    signatureOverlayApiRef,
    () => ({
      getSignaturePreviews: () => localSignaturePreviews,
      clearPreviews: () => {
        setLocalSignaturePreviews([]);
        setSelectedSignatureId(null);
        onSignaturePreviewsChange?.([]);
      },
      deleteSelected: () => {
        if (!selectedSignatureId) return;
        const next = localSignaturePreviews.filter(
          (p) => p.id !== selectedSignatureId,
        );
        setSelectedSignatureId(null);
        setLocalSignaturePreviews(next);
        onSignaturePreviewsChange?.(next);
      },
      hasSelected: () => selectedSignatureId !== null,
    }),
    [localSignaturePreviews, selectedSignatureId, onSignaturePreviewsChange],
  );

  useEffect(() => {
    if (!config?.enableLogin) return;
    accountService
      .getAccountData()
      .then((data) => {
        if (data?.username) setCommentAuthorName(data.username);
      })
      .catch(() => {
        /* not logged in or security disabled */
      });
  }, [config?.enableLogin]);

  // Stable key — avoids recreating the blob URL (and crashing ViewportPlugin) when
  // FileContext produces new File object references for the same file content.
  const fileStableKey =
    fileId ?? (file ? `${(file as File).name}-${file.size}` : null);

  // Keyed by fileStableKey to avoid recomputing on every FileContext re-render.
  const exportFileName = useMemo(() => {
    if (fileName) return fileName;
    if (file && "name" in file) return (file as File).name;
    if (url) return url.split("/").pop()?.split("?")[0] || "document.pdf";
    return "document.pdf";
  }, [fileStableKey, fileName, url]);

  // The first document goes through the registry; replacements open in the
  // background and activate once ready, so the viewer never blanks.
  const [initialDocument, setInitialDocument] = useState<{
    buffer: ArrayBuffer;
    name: string;
  } | null>(null);
  const [pendingDocument, setPendingDocument] = useState<{
    buffer: ArrayBuffer;
    name: string;
  } | null>(null);
  const initialDocumentOpenedRef = useRef(false);
  const openedContentKeyRef = useRef<string | null>(null);
  // Anchors survive deselection per annotation id, so a delete that happens
  // while no menu is open (keyboard, sidebar) still has somewhere to appear.
  const annotationAnchorsByIdRef = useRef<Map<string, AnnotationMenuAnchor>>(
    new Map(),
  );
  const [deletedAnnotationMenu, setDeletedAnnotationMenu] =
    useState<AnnotationMenuAnchor | null>(null);
  const handleAnnotationMenuAnchor = useCallback(
    (anchor: AnnotationMenuAnchor | null) => {
      if (anchor) {
        annotationAnchorsByIdRef.current.set(anchor.annotationId, anchor);
      }
    },
    [],
  );
  const getAnnotationAnchor = useCallback(
    (annotationId: string) =>
      // Only the anchor keyed by this annotation: falling back to the
      // last-open menu would pin a deletion to another annotation's spot.
      annotationAnchorsByIdRef.current.get(annotationId) ?? null,
    [],
  );
  const handleAnnotationDeleted = useCallback(
    (anchor: AnnotationMenuAnchor) => setDeletedAnnotationMenu(anchor),
    [],
  );
  const dismissDeletedAnnotationMenu = useCallback(
    () => setDeletedAnnotationMenu(null),
    [],
  );
  // The published blob URL is revoked by its replacement or on unmount, never
  // by the effect run that decided to skip a swap.
  const publishedObjectUrlRef = useRef<string | null>(null);
  const revokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reads bytes on the main thread for the worker, and lands bytes plus URL in
  // one commit so the registry rebuilds once per replacement.
  useEffect(() => {
    if (fileStableKey && shouldSkipBytes?.(fileStableKey)) {
      // The live document already shows this save; swapping the bytes would
      // reopen it and lose the scroll position for no visual gain.
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const openDocument = (
      buffer: ArrayBuffer,
      name: string,
      contentKey: string | null,
    ) => {
      // A repeat run for the same content (a rename, a FileContext churn) must
      // not reopen the document.
      if (!contentKey || openedContentKeyRef.current === contentKey) return;
      openedContentKeyRef.current = contentKey;
      if (!initialDocumentOpenedRef.current) {
        initialDocumentOpenedRef.current = true;
        setInitialDocument({ buffer, name });
        return;
      }
      setPendingDocument({ buffer, name });
    };
    const fail = (source: string) => (err: unknown) => {
      console.error(
        `[LocalEmbedPDF] Failed to read ${source} arrayBuffer:`,
        err,
      );
    };
    if (file && typeof (file as Blob).arrayBuffer === "function") {
      (file as Blob)
        .arrayBuffer()
        .then((buf) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(file);
          const previous = publishedObjectUrlRef.current;
          publishedObjectUrlRef.current = objectUrl;
          openDocument(buf, exportFileName, fileStableKey);
          setPdfUrl(objectUrl);
          if (previous && previous !== objectUrl) {
            URL.revokeObjectURL(previous);
          }
        })
        .catch(fail("file"));
    } else if (url) {
      setPdfUrl(url);
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          if (!cancelled) openDocument(buf, exportFileName, url);
        })
        .catch(fail("url"));
    } else {
      initialDocumentOpenedRef.current = false;
      openedContentKeyRef.current = null;
      setInitialDocument(null);
      setPendingDocument(null);
      setPdfUrl(null);
    }
    return () => {
      cancelled = true;
      // Revokes only URLs that never reached state; the published one is
      // replaced or revoked on real unmount below.
      if (objectUrl && publishedObjectUrlRef.current !== objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file ? fileStableKey : null, url, shouldSkipBytes, exportFileName]);

  useEffect(() => {
    // A pending revocation belongs to a previous mount of this effect; cancel
    // it so React's strict-mode simulated unmount cannot revoke the live URL.
    if (revokeTimerRef.current !== null) {
      clearTimeout(revokeTimerRef.current);
      revokeTimerRef.current = null;
    }
    return () => {
      revokeTimerRef.current = setTimeout(() => {
        revokeTimerRef.current = null;
        const urlToRevoke = publishedObjectUrlRef.current;
        publishedObjectUrlRef.current = null;
        if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      }, 0);
    };
  }, []);

  const [swapAnnouncement, setSwapAnnouncement] = useState<string | null>(null);

  const handleDocumentSwapped = useCallback(() => {
    onDocumentSwapped?.();
    setPendingDocument(null);
    setSwapAnnouncement(t("viewer.documentUpdated", "Document updated"));
    setTimeout(() => setSwapAnnouncement(null), 3000);
  }, [onDocumentSwapped, t]);
  const handleDocumentSwapFailed = useCallback(
    (error: unknown) => {
      // The outgoing document stays active; the replacement never landed.
      console.warn(
        "[LocalEmbedPDF] Replacement document failed to open:",
        error,
      );
      onDocumentSwapFailed?.(error);
      setPendingDocument(null);
    },
    [onDocumentSwapFailed],
  );

  useEffect(() => {
    // A replacement document has no relation to the deleted annotation.
    setDeletedAnnotationMenu(null);
    annotationAnchorsByIdRef.current.clear();
  }, [fileStableKey]);

  // The registry is built from the viewer's first source; later bytes arrive
  // through DocumentSwapBridge, so no replacement may change that identity.
  const urlDocumentSource = file ? null : pdfUrl;
  const urlPluginsSource = useMemo(() => {
    if (file || !urlDocumentSource) return null;
    return { url: urlDocumentSource, name: exportFileName };
  }, [!!file, urlDocumentSource, exportFileName]);

  // Create plugins configuration
  const plugins = useMemo(() => {
    const initialSource = initialDocument ?? urlPluginsSource;
    if (!initialSource) return [];
    const initialDocuments: InitialDocumentOptions[] =
      "buffer" in initialSource
        ? [{ buffer: initialSource.buffer, name: initialSource.name }]
        : [{ url: initialSource.url, name: initialSource.name }];

    // Calculate 3.5rem in pixels dynamically based on root font size
    const rootFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const viewportGap = rootFontSize * 3.5;

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments,
      }),
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap,
      }),
      // Register spread plugin before scroll and zoom plugins that depend on it
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(ScrollPluginPackage),
      createPluginRegistration(RenderPluginPackage, {
        withForms: !enableFormFill,
        withAnnotations: !enableAnnotations, // Show baked annotations only when annotation layer is OFF; live layer visibility is controlled via CSS
      }),

      // Register interaction manager (required for zoom and selection features)
      createPluginRegistration(InteractionManagerPluginPackage),

      // Register selection plugin (depends on InteractionManager)
      createPluginRegistration(SelectionPluginPackage, {
        marquee: { enabled: false },
        toleranceFactor: 3,
      }),

      // Register history plugin for undo/redo (recommended for annotations)
      // Always register for reading existing annotations
      createPluginRegistration(HistoryPluginPackage),

      // Register annotation plugin (depends on InteractionManager, Selection, History)
      // Always register for reading existing annotations like links
      createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: "Digital Signature",
        autoCommit: true,
        deactivateToolAfterCreate: false,
        selectAfterCreate: true,
      }),

      // Register redaction plugin (depends on InteractionManager, Selection, History)
      // Always register for redaction functionality
      createPluginRegistration(RedactionPluginPackage, {
        useAnnotationMode: true,
        drawBlackBoxes: false,
      }),

      createPluginRegistration(PanPluginPackage, VIEWER_PAN_CONFIG),

      // Register zoom plugin with configuration
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth,
        minZoom: 0.2,
        maxZoom: 5.0,
      }),

      // Register tiling plugin (depends on Render, Scroll, Viewport)
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 5,
        extraRings: 1,
      }),

      // Register search plugin for text search
      createPluginRegistration(SearchPluginPackage),

      // Register thumbnail plugin for page thumbnails
      createPluginRegistration(ThumbnailPluginPackage),

      // Register bookmark plugin for PDF outline support
      createPluginRegistration(BookmarkPluginPackage),

      // Register attachment plugin for PDF attachments support
      createPluginRegistration(AttachmentPluginPackage),

      // Register rotate plugin
      createPluginRegistration(RotatePluginPackage),

      // Register export plugin for downloading PDFs
      createPluginRegistration(ExportPluginPackage, {
        defaultFileName: exportFileName,
      }),

      createPluginRegistration(PrintPluginPackage),
    ];
  }, [initialDocument, urlPluginsSource, enableAnnotations]);

  const fontFallbackConfig = useMemo(() => getLocalFontFallbackConfig(), []);

  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: pdfiumWasmUrl,
    fontFallback: fontFallbackConfig,
  });

  const [engineTimeout, setEngineTimeout] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setEngineTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      if (isLoading) {
        setEngineTimeout(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!file && !url) {
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <div style={{ fontSize: "24px" }}>📄</div>
          <Text c="dimmed" size="sm">
            No PDF provided
          </Text>
        </Stack>
      </Center>
    );
  }

  // Check if the file is actually a PDF
  if (file && !isPdfFile(file)) {
    const fileName = "name" in file ? file.name : t("viewer.unknownFile");
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <div style={{ fontSize: "48px" }}>📄</div>
          <Text size="lg" fw={600} c="dimmed">
            {t("viewer.cannotPreviewFile")}
          </Text>
          <Text
            c="dimmed"
            size="sm"
            style={{ textAlign: "center", maxWidth: "400px" }}
          >
            {t("viewer.onlyPdfSupported")}
          </Text>
          <PrivateContent>
            <Text c="dimmed" size="xs" style={{ fontFamily: "monospace" }}>
              {fileName}
            </Text>
          </PrivateContent>
        </Stack>
      </Center>
    );
  }

  const hasInput = Boolean(file || url);
  const isInputReady = Boolean(initialDocument || (!file && pdfUrl));

  if (isLoading || !engine || (hasInput && !isInputReady)) {
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <Loader size="lg" />
          <Text c="dimmed" size="sm">
            {t("viewer.loadingEngine", "Loading PDF Engine...")}
          </Text>
          {engineTimeout && (
            <Text
              c="var(--color-red-dark)"
              size="xs"
              style={{ textAlign: "center", maxWidth: "360px" }}
            >
              {t(
                "viewer.engineSlowWarning",
                "PDF engine initialization is taking longer than expected. Please check your browser WebAssembly and Worker settings, or reload the page.",
              )}
            </Text>
          )}
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <div style={{ fontSize: "24px" }}>⚠️</div>
          <Text c="red" size="sm">
            {t(
              "viewer.engineLoadError",
              "Failed to initialize PDF viewer engine",
            )}
          </Text>
          <Text c="dimmed" size="xs">
            {error.message}
          </Text>
        </Stack>
      </Center>
    );
  }

  const handleInitialized = async (registry: PluginRegistry) => {
    // v2.0: Use registry.getPlugin() to access plugin APIs
    const annotationPlugin = registry.getPlugin("annotation");
    if (!annotationPlugin || !annotationPlugin.provides) return;

    const annotationApi = annotationPlugin.provides();
    if (!annotationApi || !enableAnnotations) return;

    registerAnnotationTools(annotationApi);

    annotationApi.onAnnotationEvent((event: AnnotationEvent) => {
      if (event.type === "create" && event.committed) {
        setAnnotations((prev) => [
          ...prev,
          {
            id: event.annotation.id,
            pageIndex: event.pageIndex,
            rect: event.annotation.rect,
          },
        ]);

        // If the annotation doesn't have customData.toolId, patch it from the active tool.
        // EmbedPDF doesn't always persist customData from setToolDefaults into created annotations.
        const annotationId = event.annotation.id;
        const existingCustomData = (
          event.annotation as unknown as {
            customData?: Record<string, unknown>;
          }
        ).customData;
        if (annotationId && !existingCustomData?.toolId) {
          const activeTool = (
            annotationApi as unknown as {
              getActiveTool?: () => { id: string } | null;
            }
          ).getActiveTool?.();
          if (activeTool?.id && activeTool.id !== "select") {
            (
              annotationApi as unknown as {
                updateAnnotation?: (
                  page: number,
                  id: string,
                  patch: Record<string, unknown>,
                ) => void;
              }
            ).updateAnnotation?.(event.pageIndex, annotationId, {
              customData: {
                ...(existingCustomData ?? {}),
                toolId: activeTool.id,
              },
            });
          }
        }

        // Auto-select the annotation after creation so the selection menu appears immediately,
        // letting users discover the editing options before they click away.
        if (annotationId) {
          (
            annotationApi as unknown as {
              selectAnnotation?: (pageIndex: number, id: string) => void;
            }
          ).selectAnnotation?.(event.pageIndex, annotationId);
        }

        if (onSignatureAdded) {
          onSignatureAdded(event.annotation);
        }
      } else if (event.type === "delete" && event.committed) {
        setAnnotations((prev) =>
          prev.filter((ann) => ann.id !== event.annotation.id),
        );
      }
    });
  };

  const pageOptions: ViewerPageOptions = {
    file,
    fileId,
    pdfRenderMode,
    enableFormFill,
    formEditingActive,
    enableAnnotations,
    enableRedaction,
    showBakedAnnotations,
    onAnnotationMenuAnchor: handleAnnotationMenuAnchor,
    signatureOverlay: signatureOverlayEnabled
      ? {
          previews: localSignaturePreviews,
          readOnly: signaturePreviewsReadOnly,
          placementMode: signaturePlacementMode,
          placementData: signaturePlacementData,
          placementType: signaturePlacementType,
          onChange: handleSignaturePreviewsChange,
          selectedId: selectedSignatureId,
          onSelect: setSelectedSignatureId,
        }
      : null,
    onPageLayout,
    restorePending,
  };

  // Wrap your UI with the <EmbedPDF> provider
  return (
    <PrivateContent>
      <div
        aria-busy={pendingDocument !== null}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {swapAnnouncement}
        </span>
        <EmbedPDF
          engine={engine}
          plugins={plugins}
          onInitialized={handleInitialized}
        >
          <DocumentSwapBridge
            pending={pendingDocument}
            onSwapped={handleDocumentSwapped}
            onFailed={handleDocumentSwapFailed}
          />
          <ZoomAPIBridge />
          <ScrollAPIBridge />
          <SelectionAPIBridge />
          <FormCreationInteractionLock />
          <PanAPIBridge />
          <SpreadAPIBridge />
          <SearchAPIBridge />
          <ThumbnailAPIBridge />
          <RotateAPIBridge />
          <EditingBridges
            enableAnnotations={enableAnnotations}
            enableRedaction={enableRedaction}
            isManualRedactionMode={isManualRedactionMode}
            isSignMode={isSignMode}
            historyApiRef={historyApiRef}
            signatureApiRef={signatureApiRef}
            annotationApiRef={annotationApiRef}
            redactionTrackerRef={redactionTrackerRef}
            getAnnotationAnchor={getAnnotationAnchor}
            onAnnotationDeleted={handleAnnotationDeleted}
            deletedAnnotationMenu={deletedAnnotationMenu}
            onDismissDeletedAnnotationMenu={dismissDeletedAnnotationMenu}
          />
          <ExportAPIBridge />
          <BookmarkAPIBridge />
          <AttachmentAPIBridge />
          <PrintAPIBridge file={file} url={pdfUrl} fileName={fileName} />
          <DocumentPermissionsAPIBridge />
          <DocumentReadyWrapper
            fallback={
              <Center style={{ height: "100%", width: "100%" }}>
                <ToolLoadingFallback />
              </Center>
            }
          >
            {(documentId) => (
              <>
                <DocumentViewport
                  documentId={documentId}
                  pageOptions={pageOptions}
                />
                <DocumentComments
                  enabled={enableAnnotations}
                  documentId={documentId}
                  authorName={commentAuthorName}
                  visible={isCommentsSidebarVisible}
                  rightOffset={commentsSidebarRightOffset}
                />
              </>
            )}
          </DocumentReadyWrapper>
        </EmbedPDF>
      </div>
    </PrivateContent>
  );
}
