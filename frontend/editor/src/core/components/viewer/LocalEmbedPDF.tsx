import React, {
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
} from "react";
import { createPluginRegistration } from "@embedpdf/core";
import type { PluginRegistry } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { useEngineContext } from "@embedpdf/engines/react";
import { PrivateContent } from "@app/components/shared/PrivateContent";
import { useAppConfig } from "@app/contexts/AppConfigContext";

// Import the essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import {
  RenderLayer,
  RenderPluginPackage,
} from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
  InteractionManagerPluginPackage,
  PagePointerProvider,
  GlobalPointerProvider,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionLayer,
  SelectionPluginPackage,
} from "@embedpdf/plugin-selection/react";
import {
  TilingLayer,
  TilingPluginPackage,
} from "@embedpdf/plugin-tiling/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
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
import type {
  AnnotationTool,
  AnnotationEvent,
} from "@embedpdf/plugin-annotation";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { PdfAnnotationObject, Rect } from "@embedpdf/models";

// Blob URL cache: keyed by `filename-size`. Capped at 10 entries so long
// sessions with many distinct PDFs don't accumulate unbounded object URLs.
const BLOB_CACHE_MAX = 10;
const globalBlobUrlCache = new Map<string, string>();

function cacheBlobUrl(key: string, url: string): void {
  // Evict the oldest entry when at capacity
  if (globalBlobUrlCache.size >= BLOB_CACHE_MAX) {
    const oldestKey = globalBlobUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldUrl = globalBlobUrlCache.get(oldestKey);
      globalBlobUrlCache.delete(oldestKey);
      // Only revoke if it's not the URL we're about to add
      if (oldUrl && oldUrl !== url) {
        URL.revokeObjectURL(oldUrl);
      }
    }
  }
  globalBlobUrlCache.set(key, url);
}

// Viewport gap in pixels (equivalent to 3.5rem at standard 16px root font size)
const VIEWPORT_GAP = 56;

type LooseAnnotationTool = {
  id: string;
  name: string;
  interaction?: {
    exclusive: boolean;
    cursor: string;
    textSelection?: boolean;
    isRotatable?: boolean;
  };
  matchScore?: (annotation: PdfAnnotationObject) => number;
  defaults?: Record<string, unknown>;
  clickBehavior?: Record<string, unknown>;
  behavior?: {
    deactivateToolAfterCreate?: boolean;
    selectAfterCreate?: boolean;
  };
};

/**
 * Static annotation tool definitions. Extracted to module scope so they are
 * allocated once rather than recreated on every EmbedPDF mount.
 */
const ANNOTATION_TOOLS: LooseAnnotationTool[] = [
  {
    id: "highlight",
    name: "Highlight",
    interaction: { exclusive: true, cursor: "text", textSelection: true },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.HIGHLIGHT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.HIGHLIGHT,
      strokeColor: "#ffd54f",
      color: "#ffd54f",
      opacity: 0.6,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "underline",
    name: "Underline",
    interaction: { exclusive: true, cursor: "text", textSelection: true },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.UNDERLINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.UNDERLINE,
      strokeColor: "#ffb300",
      color: "#ffb300",
      opacity: 1,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "strikeout",
    name: "Strikeout",
    interaction: { exclusive: true, cursor: "text", textSelection: true },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.STRIKEOUT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.STRIKEOUT,
      strokeColor: "#e53935",
      color: "#e53935",
      opacity: 1,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "squiggly",
    name: "Squiggly",
    interaction: { exclusive: true, cursor: "text", textSelection: true },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.SQUIGGLY ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.SQUIGGLY,
      strokeColor: "#00acc1",
      color: "#00acc1",
      opacity: 1,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "ink",
    name: "Pen",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.INK ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#1f2933",
      color: "#1f2933",
      opacity: 1,
      borderWidth: 2,
      lineWidth: 2,
      strokeWidth: 2,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "inkHighlighter",
    name: "Ink Highlighter",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.INK &&
      (annotation.strokeColor === "#ffd54f" || annotation.color === "#ffd54f")
        ? 8
        : 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#ffd54f",
      color: "#ffd54f",
      opacity: 0.5,
      borderWidth: 6,
      lineWidth: 6,
      strokeWidth: 6,
    },
    behavior: { deactivateToolAfterCreate: false, selectAfterCreate: true },
  },
  {
    id: "square",
    name: "Square",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.SQUARE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.SQUARE,
      color: "#0000ff",
      strokeColor: "#cf5b5b",
      opacity: 0.5,
      borderWidth: 1,
      strokeWidth: 1,
      lineWidth: 1,
    },
    clickBehavior: { enabled: true, defaultSize: { width: 120, height: 90 } },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "circle",
    name: "Circle",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.CIRCLE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.CIRCLE,
      color: "#0000ff",
      strokeColor: "#cf5b5b",
      opacity: 0.5,
      borderWidth: 1,
      strokeWidth: 1,
      lineWidth: 1,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 100, height: 100 },
    },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "line",
    name: "Line",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.LINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
      strokeWidth: 2,
      lineWidth: 2,
    },
    clickBehavior: { enabled: true, defaultLength: 120, defaultAngle: 0 },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "lineArrow",
    name: "Arrow",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) => {
      if (annotation.type !== PdfAnnotationSubtype.LINE) return 0;
      // EmbedPDF stores endStyle/lineEndingStyles at runtime; library types use lineEndings
      const ann = annotation as PdfAnnotationObject & {
        endStyle?: string;
        lineEndingStyles?: { end?: string };
      };
      return ann.endStyle === "ClosedArrow" ||
        ann.lineEndingStyles?.end === "ClosedArrow"
        ? 9
        : 0;
    },
    defaults: {
      type: PdfAnnotationSubtype.LINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
      startStyle: "None",
      endStyle: "ClosedArrow",
      lineEndingStyles: { start: "None", end: "ClosedArrow" },
    },
    clickBehavior: { enabled: true, defaultLength: 120, defaultAngle: 0 },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "polyline",
    name: "Polyline",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.POLYLINE ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.POLYLINE,
      color: "#1565c0",
      opacity: 1,
      borderWidth: 2,
    },
    clickBehavior: { enabled: true, finishOnDoubleClick: true },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "polygon",
    name: "Polygon",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.POLYGON ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.POLYGON,
      color: "#0000ff",
      strokeColor: "#cf5b5b",
      opacity: 0.5,
      borderWidth: 1,
    },
    clickBehavior: {
      enabled: true,
      finishOnDoubleClick: true,
      defaultSize: { width: 140, height: 100 },
    },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "text",
    name: "Text",
    interaction: { exclusive: true, cursor: "text", isRotatable: false },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.FREETEXT ? 10 : 0,
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      textColor: "#111111",
      fontSize: 14,
      fontFamily: "Helvetica",
      opacity: 1,
      interiorColor: "#fffef7",
      contents: "Text",
    },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "note",
    name: "Note",
    interaction: { exclusive: true, cursor: "pointer", isRotatable: false },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.FREETEXT ? 8 : 0,
    defaults: {
      type: PdfAnnotationSubtype.FREETEXT,
      textColor: "#1b1b1b",
      color: "#ffa000",
      interiorColor: "#fff8e1",
      opacity: 1,
      contents: "Note",
      fontSize: 12,
    },
    clickBehavior: {
      enabled: true,
      defaultSize: { width: 160, height: 100 },
    },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "stamp",
    name: "Image Stamp",
    interaction: { exclusive: false, cursor: "copy" },
    matchScore: (annotation: PdfAnnotationObject) =>
      annotation.type === PdfAnnotationSubtype.STAMP ? 5 : 0,
    defaults: { type: PdfAnnotationSubtype.STAMP },
    behavior: { deactivateToolAfterCreate: true, selectAfterCreate: true },
  },
  {
    id: "signatureStamp",
    name: "Digital Signature",
    interaction: { exclusive: false, cursor: "copy" },
    matchScore: () => 0,
    defaults: { type: PdfAnnotationSubtype.STAMP },
  },
  {
    id: "signatureInk",
    name: "Signature Draw",
    interaction: { exclusive: true, cursor: "crosshair" },
    matchScore: () => 0,
    defaults: {
      type: PdfAnnotationSubtype.INK,
      strokeColor: "#000000",
      color: "#000000",
      opacity: 1.0,
      borderWidth: 2,
    },
  },
];
import {
  RedactionPluginPackage,
  RedactionLayer,
} from "@embedpdf/plugin-redaction/react";
import { CustomSearchLayer } from "@app/components/viewer/CustomSearchLayer";
import { ZoomAPIBridge } from "@app/components/viewer/ZoomAPIBridge";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";
import { Center, Stack, Text } from "@mantine/core";
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
  HistoryAPI,
} from "@app/components/viewer/viewerTypes";
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
import {
  RedactionPendingTracker,
  RedactionPendingTrackerAPI,
} from "@app/components/viewer/RedactionPendingTracker";
import { RedactionAPIBridge } from "@app/components/viewer/RedactionAPIBridge";
import { DocumentPermissionsAPIBridge } from "@app/components/viewer/DocumentPermissionsAPIBridge";
import { DocumentReadyWrapper } from "@app/components/viewer/DocumentReadyWrapper";
import { ActiveDocumentProvider } from "@app/components/viewer/ActiveDocumentContext";
import { FormFieldOverlay } from "@app/tools/formFill/FormFieldOverlay";
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
  isManualRedactionMode?: boolean;
  showBakedAnnotations?: boolean;
  onSignatureAdded?: (annotation: PdfAnnotationObject) => void;
  signatureApiRef?: React.RefObject<SignatureAPI>;
  annotationApiRef?: React.RefObject<AnnotationAPI>;
  historyApiRef?: React.RefObject<HistoryAPI>;
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
}

interface TiledPageBackgroundProps {
  documentId: string;
  pageIndex: number;
  pdfRenderMode?: "normal" | "dark" | "sepia";
}

interface LazyPageContentProps {
  pageIndex: number;
  width: number;
  height: number;
  children: React.ReactNode;
}

const LazyPageContent = ({
  pageIndex: _pageIndex,
  width: _width,
  height: _height,
  children,
}: LazyPageContentProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: "300px", // Pre-render pages within 300px margin to avoid flashes and save DOM node memory
      },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {isVisible ? (
        children
      ) : (
        <div
          className="pdf-page-skeleton"
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#ffffff",
          }}
        />
      )}
    </div>
  );
};

// Module-scope memoized component that renders all layers for a single PDF page.
// Lifting it out of LocalEmbedPDF means React can skip re-rendering individual
// pages when the parent re-renders for unrelated state (e.g. commentAuthorName).
interface PageContentProps {
  documentId: string;
  pageIndex: number;
  width: number;
  height: number;
  pdfRenderMode: "normal" | "dark" | "sepia";
  enableFormFill: boolean;
  enableAnnotations: boolean;
  enableRedaction: boolean;
  showBakedAnnotations: boolean;
  file: File | Blob | undefined;
  fileId: string | null | undefined;
}

const PageContent = React.memo(function PageContent({
  documentId,
  pageIndex,
  width,
  height,
  pdfRenderMode,
  enableFormFill,
  enableAnnotations,
  enableRedaction,
  showBakedAnnotations,
  file,
  fileId,
}: PageContentProps) {
  return (
    <Rotate
      key={`${documentId}-${pageIndex}`}
      documentId={documentId}
      pageIndex={pageIndex}
    >
      <PagePointerProvider documentId={documentId} pageIndex={pageIndex}>
        <div
          data-page-index={pageIndex}
          data-page-width={width}
          data-page-height={height}
          style={{
            width,
            height,
            position: "relative",
            overflow: "hidden",
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
          <LazyPageContent pageIndex={pageIndex} width={width} height={height}>
            <TiledPageBackground
              documentId={documentId}
              pageIndex={pageIndex}
              pdfRenderMode={pdfRenderMode}
            />

            <CustomSearchLayer documentId={documentId} pageIndex={pageIndex} />

            <div
              className="pdf-selection-layer"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <SelectionLayer
                documentId={documentId}
                pageIndex={pageIndex}
                background="var(--pdf-selection-bg)"
              />
            </div>
            <TextSelectionHandler
              documentId={documentId}
              pageIndex={pageIndex}
            />

            {/* ButtonAppearanceOverlay, renders PDF-native button visuals as bitmaps */}
            {enableFormFill && file && (
              <ButtonAppearanceOverlay
                pageIndex={pageIndex}
                pdfSource={file}
                pageWidth={width}
                pageHeight={height}
              />
            )}

            {/* FormFieldOverlay for interactive form filling */}
            {enableFormFill && (
              <FormFieldOverlay
                documentId={documentId}
                pageIndex={pageIndex}
                pageWidth={width}
                pageHeight={height}
                fileId={fileId}
              />
            )}

            {/* SignatureFieldOverlay, bitmaps of digital-signature appearances */}
            {file && (
              <SignatureFieldOverlay
                documentId={documentId}
                pageIndex={pageIndex}
                pdfSource={file}
                pageWidth={width}
                pageHeight={height}
              />
            )}

            {/* AnnotationLayer, for annotation editing and annotation-based redactions */}
            {(enableAnnotations || enableRedaction) && (
              <AnnotationLayer
                documentId={documentId}
                pageIndex={pageIndex}
                selectionOutline={{ color: "#007ACC" }}
                selectionMenu={(props) => (
                  <AnnotationSelectionMenu {...props} />
                )}
                style={
                  !showBakedAnnotations
                    ? { opacity: 0, pointerEvents: "none" }
                    : undefined
                }
              />
            )}

            {enableRedaction && (
              <RedactionLayer
                documentId={documentId}
                pageIndex={pageIndex}
                selectionMenu={(props) => <RedactionSelectionMenu {...props} />}
              />
            )}

            {/* LinkLayer, uses EmbedPDF annotation state for link rendering */}
            <LinkLayer documentId={documentId} pageIndex={pageIndex} />
          </LazyPageContent>
        </div>
      </PagePointerProvider>
    </Rotate>
  );
});

const TiledPageBackground = ({
  documentId,
  pageIndex,
  pdfRenderMode = "normal",
}: TiledPageBackgroundProps) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#ffffff",
        transition: "filter 0.25s ease",
        filter:
          pdfRenderMode === "dark"
            ? "invert(1) hue-rotate(180deg)"
            : pdfRenderMode === "sepia"
              ? "sepia(0.7) brightness(0.85)"
              : undefined,
      }}
    >
      <RenderLayer
        documentId={documentId}
        pageIndex={pageIndex}
        scale={0.2}
        dpr={1.0}
        style={{ position: "absolute", inset: 0 }}
      />
      <div className="pdf-tile-layer">
        <TilingLayer documentId={documentId} pageIndex={pageIndex} />
      </div>
    </div>
  );
};

// DocumentScroller binds documentId to the renderPageFactory so that the
// Scroller's renderPage prop stays referentially stable across parent
// re-renders that don't touch the feature flags or file reference.
interface DocumentScrollerProps {
  documentId: string;
  renderPageFactory: (
    documentId: string,
  ) => (props: {
    width: number;
    height: number;
    pageIndex: number;
  }) => React.ReactNode;
}

const DocumentScroller = React.memo(function DocumentScroller({
  documentId,
  renderPageFactory,
}: DocumentScrollerProps) {
  const renderPage = useCallback(
    (props: { width: number; height: number; pageIndex: number }) =>
      renderPageFactory(documentId)(props),
    [documentId, renderPageFactory],
  );

  return <Scroller documentId={documentId} renderPage={renderPage} />;
});

export function LocalEmbedPDF({
  file,
  url,
  fileName,
  enableAnnotations = false,
  enableRedaction = false,
  enableFormFill = false,
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
}: LocalEmbedPDFProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [, setAnnotations] = useState<
    Array<{ id: string; pageIndex: number; rect: Rect }>
  >([]);
  const [commentAuthorName, setCommentAuthorName] = useState<string>("Guest");

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
  const fileStableKey = file ? `${(file as File).name}-${file.size}` : null;
  useEffect(() => {
    if (url) {
      setPdfUrl(url);
    } else if (file && fileStableKey) {
      let objectUrl = globalBlobUrlCache.get(fileStableKey);
      if (!objectUrl) {
        objectUrl = URL.createObjectURL(file);
        cacheBlobUrl(fileStableKey, objectUrl);
      }
      setPdfUrl(objectUrl);
    }
    // Do not revoke object URL synchronously on cleanup since the worker/PDFium
    // might still be asynchronously fetching it during React unmount/remount cycles.
  }, [file ? fileStableKey : url]);

  // Keyed by fileStableKey to avoid recomputing on every FileContext re-render.
  const exportFileName = useMemo(() => {
    if (fileName) return fileName;
    if (file && "name" in file) return (file as File).name;
    if (url) return url.split("/").pop()?.split("?")[0] || "document.pdf";
    return "document.pdf";
  }, [fileStableKey, fileName, url]);

  const plugins = useMemo(() => {
    if (!pdfUrl) return [];

    const deviceMemory =
      typeof navigator !== "undefined"
        ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
          4)
        : 4;
    const bufferSize = deviceMemory >= 4 ? 4 : 2;

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          {
            url: pdfUrl,
            name: exportFileName,
          },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap: VIEWPORT_GAP,
        scrollEndDelay: 150,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultBufferSize: bufferSize,
      }),
      createPluginRegistration(RenderPluginPackage, {
        withForms: !enableFormFill,
        withAnnotations: !enableAnnotations, // Show baked annotations only when annotation layer is OFF; live layer visibility is controlled via CSS
        defaultImageType: "image/bmp",
      }),

      // Register interaction manager (required for zoom and selection features)
      createPluginRegistration(InteractionManagerPluginPackage),

      // Register selection plugin (depends on InteractionManager)
      createPluginRegistration(SelectionPluginPackage, {
        marquee: { enabled: false },
        toleranceFactor: 3,
        maxCachedGeometries: 15,
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

      // Register pan plugin (depends on Viewport, InteractionManager).
      // Keep the default mode ("never"). Do NOT set defaultMode: "mobile" - the pan
      // react layer makes pan the default interaction on any touch-capable device
      // (navigator.maxTouchPoints > 0), e.g. Windows touchscreen laptops, which then
      // permanently locks the viewer in pan mode and blocks all text selection.
      createPluginRegistration(PanPluginPackage),

      // Register zoom plugin with configuration
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth, // Start with FitWidth, will be adjusted in ZoomAPIBridge
        minZoom: 0.2,
        maxZoom: 5.0,
      }),

      // Register tiling plugin (depends on Render, Scroll, Viewport)
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 1024,
        overlapPx: 2.5,
        extraRings: 0,
        defaultImageType: "image/bmp", // BMP is faster for local processing than WebP
      }),

      // Register spread plugin for dual page layout
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None, // Start with single page view
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

      // Register print plugin for printing PDFs
      createPluginRegistration(PrintPluginPackage),
    ];
  }, [pdfUrl, enableAnnotations, exportFileName]);

  // Retrieve the global engine instance from context
  const { engine, isLoading, error } = useEngineContext();

  // renderPageFactory creates a stable per-page renderer that closes over
  // feature flags and file reference. Only recreates when those actually change.
  // DocumentScroller (below) binds documentId and produces the final renderPage
  // callback that Scroller expects, keeping documentId in the right closure.
  const renderPageFactory = useCallback(
    (documentId: string) =>
      ({
        width,
        height,
        pageIndex,
      }: {
        width: number;
        height: number;
        pageIndex: number;
      }) => (
        <PageContent
          key={`${documentId}-${pageIndex}`}
          documentId={documentId}
          pageIndex={pageIndex}
          width={width}
          height={height}
          pdfRenderMode={pdfRenderMode}
          enableFormFill={enableFormFill}
          enableAnnotations={enableAnnotations}
          enableRedaction={enableRedaction}
          showBakedAnnotations={showBakedAnnotations}
          file={file}
          fileId={fileId}
        />
      ),
    [
      enableAnnotations,
      enableRedaction,
      enableFormFill,
      showBakedAnnotations,
      pdfRenderMode,
      file,
      fileId,
    ],
  );

  // Early return if no file or URL provided
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

  if (isLoading || !engine || !pdfUrl) {
    return <ToolLoadingFallback toolName="PDF Engine" />;
  }

  if (error) {
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <div style={{ fontSize: "24px" }}>❌</div>
          <Text c="red" size="sm" style={{ textAlign: "center" }}>
            Error loading PDF engine: {error.message}
          </Text>
        </Stack>
      </Center>
    );
  }

  // Wrap your UI with the <EmbedPDF> provider
  return (
    <PrivateContent>
      <div
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <EmbedPDF
          engine={engine}
          plugins={plugins}
          onInitialized={async (registry: PluginRegistry) => {
            if (typeof window !== "undefined") {
              (window as any).__embedPdfRegistry = registry;
            }
            // v2.0: Use registry.getPlugin() to access plugin APIs
            const annotationPlugin = registry.getPlugin("annotation");

            if (!annotationPlugin || !annotationPlugin.provides) return;

            const annotationApi = annotationPlugin.provides();
            if (!annotationApi) return;

            if (enableAnnotations) {
              const ensureTool = (tool: LooseAnnotationTool) => {
                const existing = annotationApi.getTool?.(tool.id);
                if (!existing) {
                  annotationApi.addTool(tool as unknown as AnnotationTool);
                }
              };

              ANNOTATION_TOOLS.forEach(ensureTool);

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
                        selectAnnotation?: (
                          pageIndex: number,
                          id: string,
                        ) => void;
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
            }
          }}
        >
          <ActiveDocumentProvider>
            <ZoomAPIBridge />
            <ScrollAPIBridge />
            <SelectionAPIBridge />
            <PanAPIBridge />
            <SpreadAPIBridge />
            <SearchAPIBridge />
            <ThumbnailAPIBridge />
            <RotateAPIBridge />
            {(enableAnnotations ||
              enableRedaction ||
              isManualRedactionMode) && (
              <HistoryAPIBridge ref={historyApiRef} />
            )}
            {/* Always render RedactionAPIBridge when in manual redaction mode so buttons can switch from annotation mode */}
            {(enableRedaction || isManualRedactionMode) && (
              <RedactionAPIBridge />
            )}
            {/* Always render SignatureAPIBridge so annotation tools (draw) can be activated even when starting in redaction mode */}
            {(enableAnnotations ||
              enableRedaction ||
              isManualRedactionMode) && (
              <SignatureAPIBridge
                ref={signatureApiRef}
                isSignMode={isSignMode}
              />
            )}
            {(enableRedaction || isManualRedactionMode) && (
              <RedactionPendingTracker ref={redactionTrackerRef} />
            )}
            {enableAnnotations && (
              <AnnotationAPIBridge ref={annotationApiRef} />
            )}

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
                  <GlobalPointerProvider documentId={documentId}>
                    <Viewport
                      documentId={documentId}
                      style={{
                        backgroundColor: "var(--bg-background)",
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
                      <DocumentScroller
                        documentId={documentId}
                        renderPageFactory={renderPageFactory}
                      />
                    </Viewport>
                  </GlobalPointerProvider>
                  {enableAnnotations && (
                    <CommentAuthorProvider displayName={commentAuthorName}>
                      <CommentsSidebar
                        documentId={documentId}
                        visible={isCommentsSidebarVisible}
                        rightOffset={commentsSidebarRightOffset}
                      />
                    </CommentAuthorProvider>
                  )}
                </>
              )}
            </DocumentReadyWrapper>
          </ActiveDocumentProvider>
        </EmbedPDF>
      </div>
    </PrivateContent>
  );
}
