import React, {
  useEffect,
  useMemo,
  useState,
  useImperativeHandle,
  forwardRef,
  useRef,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { createPluginRegistration } from "@embedpdf/core";
import type { PluginRegistry } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { useEngineContext } from "@embedpdf/engines/react";

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
  useInteractionManagerCapability,
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
import { Rotation, PdfAnnotationSubtype } from "@embedpdf/models";

// Import annotation plugins
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import {
  AnnotationLayer,
  AnnotationPluginPackage,
} from "@embedpdf/plugin-annotation/react";

import { CustomSearchLayer } from "@app/components/viewer/CustomSearchLayer";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";
import { ActionIcon, Center, Stack, Text, Tooltip } from "@mantine/core";
import CloseIcon from "@mui/icons-material/Close";
import { ScrollAPIBridge } from "@app/components/viewer/ScrollAPIBridge";
import { SelectionAPIBridge } from "@app/components/viewer/SelectionAPIBridge";
import { PanAPIBridge } from "@app/components/viewer/PanAPIBridge";
import { SpreadAPIBridge } from "@app/components/viewer/SpreadAPIBridge";
import { SearchAPIBridge } from "@app/components/viewer/SearchAPIBridge";
import { ThumbnailAPIBridge } from "@app/components/viewer/ThumbnailAPIBridge";
import { RotateAPIBridge } from "@app/components/viewer/RotateAPIBridge";
import { DocumentReadyWrapper } from "@app/components/viewer/DocumentReadyWrapper";
import {
  Z_INDEX_SIGNATURE_OVERLAY,
  Z_INDEX_SIGNATURE_OVERLAY_DELETE,
  Z_INDEX_SIGNATURE_OVERLAY_HANDLE,
} from "@app/styles/zIndex";

/** Rendered inside EmbedPDF context; exposes interaction manager pause/resume via ref. */
function InteractionPauseBridge({
  bridgeRef,
}: {
  bridgeRef: React.MutableRefObject<{
    pause: () => void;
    resume: () => void;
  } | null>;
}) {
  const { provides } = useInteractionManagerCapability();
  useEffect(() => {
    if (provides) {
      bridgeRef.current = {
        pause: () => provides.pause(),
        resume: () => provides.resume(),
      };
    }
    return () => {
      bridgeRef.current = null;
    };
  }, [provides, bridgeRef]);
  return null;
}

// LRU-capped blob URL cache (max 10 entries) to prevent unbounded accumulation
// across long multi-document sessions.
const globalBlobUrlCache = new Map<string, string>();

function cacheBlobUrl(key: string, url: string): void {
  if (globalBlobUrlCache.size >= 10) {
    const oldest = globalBlobUrlCache.keys().next().value;
    if (oldest !== undefined) {
      const oldUrl = globalBlobUrlCache.get(oldest);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      globalBlobUrlCache.delete(oldest);
    }
  }
  globalBlobUrlCache.set(key, url);
}

const DOCUMENT_NAME = "stirling-pdf-signing-viewer";

// Viewport gap in pixels (equivalent to 3.5rem at standard 16px root font size)
const VIEWPORT_GAP = 56;

export interface SignaturePreview {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signatureData: string; // Base64 PNG image
  signatureType: "canvas" | "image" | "text";
  color?: string; // Per-participant color (rgb(...) string); falls back to default blue
  participantName?: string; // Shown in tooltip on hover
}

interface LocalEmbedPDFWithAnnotationsProps {
  file?: File | Blob;
  url?: string | null;
  onAnnotationChange?: (annotations: SignaturePreview[]) => void;
  placementMode?: boolean;
  signatureData?: string;
  signatureType?: "canvas" | "image" | "text";
  onPlaceSignature?: (
    id: string,
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  onPreviewCountChange?: (count: number) => void;
  initialSignatures?: SignaturePreview[]; // Initial signatures to display (read-only preview)
  readOnly?: boolean; // If true, signature previews cannot be moved or deleted
}

export interface AnnotationAPI {
  setActiveTool: (toolId: string | null) => void;
  setToolDefaults: (toolId: string, defaults: any) => void;
  getActiveTool: () => any;
  getPageAnnotations: (pageIndex: number) => Promise<any[]>;
  getAllAnnotations: () => Promise<any[]>;
  getSignaturePreviews: () => SignaturePreview[];
  clearPreviews: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

interface TiledPageBackgroundProps {
  documentId: string;
  pageIndex: number;
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

const TiledPageBackground = ({
  documentId,
  pageIndex,
}: TiledPageBackgroundProps) => {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: "#ffffff",
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

// Module-scope memoized component for the stable PDF rendering layers.
// These never depend on signature state, so they are immune to drag/resize
// re-renders that happen when signaturePreviews changes.
const PageStaticLayers = React.memo(function PageStaticLayers({
  documentId,
  pageIndex,
}: {
  documentId: string;
  pageIndex: number;
}) {
  return (
    <>
      <TiledPageBackground documentId={documentId} pageIndex={pageIndex} />
      <CustomSearchLayer documentId={documentId} pageIndex={pageIndex} />
      <SelectionLayer documentId={documentId} pageIndex={pageIndex} />
      <AnnotationLayer
        documentId={documentId}
        pageIndex={pageIndex}
        selectionOutline={{ color: "#007ACC" }}
      />
    </>
  );
});

// Resize handle positions for the 4 corners
const RESIZE_HANDLES = [
  { position: "nw", cursor: "nw-resize", top: -4, left: -4 },
  { position: "ne", cursor: "ne-resize", top: -4, right: -4 },
  { position: "sw", cursor: "sw-resize", bottom: -4, left: -4 },
  { position: "se", cursor: "se-resize", bottom: -4, right: -4 },
] as const;

interface SignatureOverlayForPageProps {
  previews: SignaturePreview[];
  width: number;
  height: number;
  readOnly: boolean;
  onDelete: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
  interactionPauseRef: React.RefObject<{
    pause: () => void;
    resume: () => void;
  } | null>;
  isDraggingRef: React.RefObject<boolean>;
  deleteLabel: string;
}

// Module-scope memoized component for the signature overlay for a single page.
// Only re-renders when previews for THIS page change (the parent filters by
// pageIndex before passing previews in).
const SignatureOverlayForPage = React.memo(function SignatureOverlayForPage({
  previews,
  width,
  height,
  readOnly,
  onDelete,
  onMove,
  onResize,
  interactionPauseRef,
  isDraggingRef,
  deleteLabel,
}: SignatureOverlayForPageProps) {
  return (
    <>
      {previews.map((preview) => {
        if (!preview.signatureData) return null;
        const color = preview.color ?? "rgb(0, 122, 204)";
        const colorOpacity = (opacity: number) =>
          color.startsWith("rgb(")
            ? color.replace("rgb(", "rgba(").replace(")", `, ${opacity})`)
            : color;
        return (
          <Tooltip
            key={preview.id}
            label={preview.participantName ?? ""}
            position="top"
            withArrow
            disabled={!preview.participantName}
          >
            <div
              style={{
                position: "absolute",
                left: preview.x * width,
                top: preview.y * height,
                width: preview.width * width,
                height: preview.height * height,
                border: readOnly
                  ? `1px dashed ${colorOpacity(0.4)}`
                  : `2px solid ${color}`,
                boxShadow: readOnly ? "none" : `0 0 10px ${colorOpacity(0.5)}`,
                cursor: readOnly ? "default" : "move",
                zIndex: Z_INDEX_SIGNATURE_OVERLAY,
                backgroundColor: readOnly
                  ? "transparent"
                  : "rgba(255, 255, 255, 0.1)",
                pointerEvents: "auto",
              }}
            >
              {/* Delete button only show when not read-only */}
              {!readOnly && (
                <ActionIcon
                  size="sm"
                  radius="xl"
                  variant="filled"
                  color="red"
                  style={{
                    position: "absolute",
                    top: -10,
                    right: -10,
                    zIndex: Z_INDEX_SIGNATURE_OVERLAY_DELETE,
                    pointerEvents: "auto",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    border: "2px solid white",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(preview.id);
                  }}
                  aria-label={deleteLabel}
                >
                  <CloseIcon style={{ fontSize: 12 }} />
                </ActionIcon>
              )}

              {/* Drag handle */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  position: "relative",
                }}
                onPointerDown={(e) => {
                  if (readOnly) return;
                  const target = e.target as HTMLElement;
                  if (
                    target.closest("[data-resize-handle]") ||
                    target.closest("button")
                  ) {
                    return;
                  }

                  e.stopPropagation();
                  e.preventDefault();
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  interactionPauseRef.current?.pause();

                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startLeft = preview.x;
                  const startTop = preview.y;

                  const handlePointerMove = (moveEvent: PointerEvent) => {
                    isDraggingRef.current = true;
                    const deltaX = (moveEvent.clientX - startX) / width;
                    const deltaY = (moveEvent.clientY - startY) / height;
                    onMove(preview.id, startLeft + deltaX, startTop + deltaY);
                  };

                  const handlePointerUp = (upEvent: PointerEvent) => {
                    el.removeEventListener("pointermove", handlePointerMove);
                    el.removeEventListener("pointerup", handlePointerUp);
                    el.releasePointerCapture(upEvent.pointerId);
                    interactionPauseRef.current?.resume();
                    window.getSelection()?.removeAllRanges();
                    setTimeout(() => {
                      isDraggingRef.current = false;
                    }, 10);
                  };

                  el.addEventListener("pointermove", handlePointerMove);
                  el.addEventListener("pointerup", handlePointerUp);
                }}
              >
                <img
                  src={preview.signatureData}
                  alt="Signature preview"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    pointerEvents: "none",
                  }}
                />

                {/* Resize handles */}
                {RESIZE_HANDLES.map((handle) => (
                  <div
                    key={handle.position}
                    data-resize-handle="true"
                    style={{
                      position: "absolute",
                      width: 8,
                      height: 8,
                      backgroundColor: color,
                      border: "1px solid white",
                      cursor: handle.cursor,
                      zIndex: Z_INDEX_SIGNATURE_OVERLAY_HANDLE,
                      ...("top" in handle && { top: handle.top }),
                      ...("bottom" in handle && { bottom: handle.bottom }),
                      ...("left" in handle && { left: handle.left }),
                      ...("right" in handle && { right: handle.right }),
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const el = e.currentTarget;
                      el.setPointerCapture(e.pointerId);
                      interactionPauseRef.current?.pause();

                      const startX = e.clientX;
                      const startY = e.clientY;
                      const startWidth = preview.width;
                      const startHeight = preview.height;
                      const startLeft = preview.x;
                      const startTop = preview.y;
                      const minW = 50 / width;
                      const minH = 25 / height;

                      const handlePointerMove = (moveEvent: PointerEvent) => {
                        isDraggingRef.current = true;
                        const deltaX = (moveEvent.clientX - startX) / width;
                        const deltaY = (moveEvent.clientY - startY) / height;

                        let newWidth = startWidth;
                        let newHeight = startHeight;
                        let newX = startLeft;
                        let newY = startTop;

                        if (handle.position.includes("e")) {
                          newWidth = Math.max(minW, startWidth + deltaX);
                        }
                        if (handle.position.includes("w")) {
                          newWidth = Math.max(minW, startWidth - deltaX);
                          newX = startLeft + (startWidth - newWidth);
                        }
                        if (handle.position.includes("s")) {
                          newHeight = Math.max(minH, startHeight + deltaY);
                        }
                        if (handle.position.includes("n")) {
                          newHeight = Math.max(minH, startHeight - deltaY);
                          newY = startTop + (startHeight - newHeight);
                        }

                        onResize(preview.id, newX, newY, newWidth, newHeight);
                      };

                      const handlePointerUp = (upEvent: PointerEvent) => {
                        el.removeEventListener(
                          "pointermove",
                          handlePointerMove,
                        );
                        el.removeEventListener("pointerup", handlePointerUp);
                        el.releasePointerCapture(upEvent.pointerId);
                        interactionPauseRef.current?.resume();
                        window.getSelection()?.removeAllRanges();
                        setTimeout(() => {
                          isDraggingRef.current = false;
                        }, 10);
                      };

                      el.addEventListener("pointermove", handlePointerMove);
                      el.addEventListener("pointerup", handlePointerUp);
                    }}
                  />
                ))}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
});

// Hover ghost: tracks cursor in placement mode. Uses a ref for cursor position
// to avoid React state updates (and thus full re-renders) on every mouse move.
// The ghost is a raw DOM element updated imperatively.
interface PlacementGhostProps {
  signatureData: string;
  pageIndex: number;
  width: number;
  height: number;
  cursorRef: React.RefObject<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>;
}

const PlacementGhost = React.memo(function PlacementGhost({
  signatureData,
  pageIndex,
  width,
  height,
  cursorRef,
}: PlacementGhostProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Update ghost position imperatively on animation frames to avoid setState
  useEffect(() => {
    let rafId: number;
    const update = () => {
      const img = imgRef.current;
      if (!img) return;
      const cursor = cursorRef.current;
      if (cursor && cursor.pageIndex === pageIndex) {
        const left = Math.max(0, Math.min(cursor.x - 75, width - 150));
        const top = Math.max(0, Math.min(cursor.y - 37.5, height - 75));
        img.style.display = "block";
        img.style.left = `${left}px`;
        img.style.top = `${top}px`;
      } else {
        img.style.display = "none";
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [pageIndex, width, height, cursorRef]);

  return (
    <img
      ref={imgRef}
      src={signatureData}
      alt=""
      style={{
        display: "none",
        position: "absolute",
        width: 150,
        height: 75,
        opacity: 0.6,
        pointerEvents: "none",
        objectFit: "contain",
        boxShadow:
          "0 0 0 1px rgba(30, 136, 229, 0.55), 0 6px 18px rgba(30, 136, 229, 0.25)",
        borderRadius: "4px",
        zIndex: Z_INDEX_SIGNATURE_OVERLAY + 1,
      }}
    />
  );
});

// PageContent: module-scope memoized component for a single page.
// Closes over NO component-level state — all needed values arrive as props.
interface PageContentAnnotationsProps {
  documentId: string;
  pageIndex: number;
  width: number;
  height: number;
  placementMode: boolean;
  signatureData: string | undefined;
  signatureType: "canvas" | "image" | "text" | undefined;
  previews: SignaturePreview[];
  readOnly: boolean;
  onDelete: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, x: number, y: number, w: number, h: number) => void;
  onPlaceSignatureOnPage: (
    pageIndex: number,
    clickX: number,
    clickY: number,
    pageWidth: number,
    pageHeight: number,
  ) => void;
  onMouseMoveOnPage: (pageIndex: number, x: number, y: number) => void;
  onMouseLeaveFromPage: (pageIndex: number) => void;
  interactionPauseRef: React.RefObject<{
    pause: () => void;
    resume: () => void;
  } | null>;
  isDraggingRef: React.RefObject<boolean>;
  cursorRef: React.RefObject<{
    pageIndex: number;
    x: number;
    y: number;
  } | null>;
  deleteLabel: string;
}

const PageContentAnnotations = React.memo(function PageContentAnnotations({
  documentId,
  pageIndex,
  width,
  height,
  placementMode,
  signatureData,
  signatureType: _signatureType,
  previews,
  readOnly,
  onDelete,
  onMove,
  onResize,
  onPlaceSignatureOnPage,
  onMouseMoveOnPage,
  onMouseLeaveFromPage,
  interactionPauseRef,
  isDraggingRef,
  cursorRef,
  deleteLabel,
}: PageContentAnnotationsProps) {
  return (
    <Rotate
      key={`${documentId}-${pageIndex}`}
      documentId={documentId}
      pageIndex={pageIndex}
    >
      <PagePointerProvider documentId={documentId} pageIndex={pageIndex}>
        <div
          style={{
            width,
            height,
            position: "relative",
            backgroundColor: "#ffffff",
            userSelect: "none",
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
            cursor: placementMode ? "crosshair" : "default",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
          }}
          className="pdf-page-skeleton"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          onDragOver={(e) => e.preventDefault()}
          onMouseMove={(e) => {
            if (!placementMode || !signatureData) return;
            const rect = e.currentTarget.getBoundingClientRect();
            onMouseMoveOnPage(
              pageIndex,
              e.clientX - rect.left,
              e.clientY - rect.top,
            );
          }}
          onMouseLeave={() => onMouseLeaveFromPage(pageIndex)}
          onClick={(e) => {
            if (isDraggingRef.current) return;
            if (!placementMode) return;
            const rect = e.currentTarget.getBoundingClientRect();
            onPlaceSignatureOnPage(
              pageIndex,
              e.clientX - rect.left,
              e.clientY - rect.top,
              width,
              height,
            );
          }}
        >
          <LazyPageContent pageIndex={pageIndex} width={width} height={height}>
            <PageStaticLayers documentId={documentId} pageIndex={pageIndex} />

            <SignatureOverlayForPage
              previews={previews}
              width={width}
              height={height}
              readOnly={readOnly}
              onDelete={onDelete}
              onMove={onMove}
              onResize={onResize}
              interactionPauseRef={interactionPauseRef}
              isDraggingRef={isDraggingRef}
              deleteLabel={deleteLabel}
            />

            {/* Hover ghost — updated imperatively via RAF, no setState on mouse move */}
            {placementMode && signatureData && (
              <PlacementGhost
                signatureData={signatureData}
                pageIndex={pageIndex}
                width={width}
                height={height}
                cursorRef={cursorRef}
              />
            )}
          </LazyPageContent>
        </div>
      </PagePointerProvider>
    </Rotate>
  );
});

// DocumentScrollerAnnotations: binds documentId to the renderPageFactory and
// creates a stable renderPage callback that Scroller receives. React.memo
// ensures this only re-renders when documentId or the factory changes.
interface DocumentScrollerAnnotationsProps {
  documentId: string;
  renderPageFactory: (
    documentId: string,
  ) => (props: {
    width: number;
    height: number;
    pageIndex: number;
  }) => React.ReactNode;
}

const DocumentScrollerAnnotations = React.memo(
  function DocumentScrollerAnnotations({
    documentId,
    renderPageFactory,
  }: DocumentScrollerAnnotationsProps) {
    const renderPage = useCallback(
      (props: { width: number; height: number; pageIndex: number }) =>
        renderPageFactory(documentId)(props),
      [documentId, renderPageFactory],
    );

    return <Scroller documentId={documentId} renderPage={renderPage} />;
  },
);

export const LocalEmbedPDFWithAnnotations = forwardRef<
  AnnotationAPI | null,
  LocalEmbedPDFWithAnnotationsProps
>(
  (
    {
      file,
      url,
      onAnnotationChange,
      placementMode = false,
      signatureData,
      signatureType,
      onPlaceSignature,
      onPreviewCountChange,
      initialSignatures = [],
      readOnly = false,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const annotationApiRef = useRef<any>(null);
    const zoomApiRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // State for signature preview overlays (support multiple)
    const [signaturePreviews, setSignaturePreviews] =
      useState<SignaturePreview[]>(initialSignatures);

    // Track if a drag operation just occurred to prevent click from firing
    const isDraggingRef = useRef(false);
    const interactionPauseRef = useRef<{
      pause: () => void;
      resume: () => void;
    } | null>(null);

    // Cursor position stored as a ref, NOT state, to avoid 60fps re-renders
    // during placement-mode mouse moves. PlacementGhost reads this via RAF.
    const cursorRef = useRef<{
      pageIndex: number;
      x: number;
      y: number;
    } | null>(null);

    // Stable refs for callbacks to avoid recreating renderPageFactory
    const onPlaceSignatureRef = useRef(onPlaceSignature);
    useEffect(() => {
      onPlaceSignatureRef.current = onPlaceSignature;
    }, [onPlaceSignature]);

    const onAnnotationChangeRef = useRef(onAnnotationChange);
    useEffect(() => {
      onAnnotationChangeRef.current = onAnnotationChange;
    }, [onAnnotationChange]);

    const onPreviewCountChangeRef = useRef(onPreviewCountChange);
    useEffect(() => {
      onPreviewCountChangeRef.current = onPreviewCountChange;
    }, [onPreviewCountChange]);

    const deleteLabel = t("viewer.signature.delete", "Delete signature");

    // Stable signature preview mutation callbacks
    const handleDelete = useCallback((id: string) => {
      setSignaturePreviews((prev) => prev.filter((p) => p.id !== id));
    }, []);

    const handleMove = useCallback((id: string, x: number, y: number) => {
      setSignaturePreviews((prev) =>
        prev.map((p) => (p.id === id ? { ...p, x, y } : p)),
      );
    }, []);

    const handleResize = useCallback(
      (id: string, x: number, y: number, w: number, h: number) => {
        setSignaturePreviews((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, x, y, width: w, height: h } : p,
          ),
        );
      },
      [],
    );

    // Stable placement handler — reads latest onPlaceSignature via ref
    const signatureDataRef = useRef(signatureData);
    useEffect(() => {
      signatureDataRef.current = signatureData;
    }, [signatureData]);

    const signatureTypeRef = useRef(signatureType);
    useEffect(() => {
      signatureTypeRef.current = signatureType;
    }, [signatureType]);

    const handlePlaceOnPage = useCallback(
      (
        pageIndex: number,
        clickX: number,
        clickY: number,
        pageWidth: number,
        pageHeight: number,
      ) => {
        const sd = signatureDataRef.current;
        const st = signatureTypeRef.current;
        if (!sd) return;
        const sigWidth = 150 / pageWidth;
        const sigHeight = 75 / pageHeight;
        const rawX = clickX / pageWidth;
        const rawY = clickY / pageHeight;
        const x = Math.max(0, Math.min(rawX - sigWidth / 2, 1 - sigWidth));
        const y = Math.max(0, Math.min(rawY - sigHeight / 2, 1 - sigHeight));

        const newPreview: SignaturePreview = {
          id: `sig-preview-${Date.now()}-${Math.random()}`,
          pageIndex,
          x,
          y,
          width: sigWidth,
          height: sigHeight,
          signatureData: sd,
          signatureType: st || "image",
        };
        setSignaturePreviews((prev) => [...prev, newPreview]);
        onPlaceSignatureRef.current?.(
          newPreview.id,
          pageIndex,
          x * pageWidth,
          y * pageHeight,
          sigWidth * pageWidth,
          sigHeight * pageHeight,
        );
      },
      [],
    );

    // Cursor tracking — writes to ref, no state update, so no React re-render
    const handleMouseMoveOnPage = useCallback(
      (pageIndex: number, x: number, y: number) => {
        cursorRef.current = { pageIndex, x, y };
      },
      [],
    );

    const handleMouseLeaveFromPage = useCallback((pageIndex: number) => {
      if (cursorRef.current?.pageIndex === pageIndex) {
        cursorRef.current = null;
      }
    }, []);

    // Expose annotation API to parent
    useImperativeHandle(
      ref,
      () => ({
        setActiveTool: (toolId: string | null) => {
          annotationApiRef.current?.setActiveTool(toolId);
        },
        setToolDefaults: (toolId: string, defaults: any) => {
          annotationApiRef.current?.setToolDefaults(toolId, defaults);
        },
        getActiveTool: () => {
          return annotationApiRef.current?.getActiveTool();
        },
        getPageAnnotations: async (pageIndex: number) => {
          if (!annotationApiRef.current?.getPageAnnotations) return [];
          const task = annotationApiRef.current.getPageAnnotations({
            pageIndex,
          });
          if (task?.toPromise) {
            return await task.toPromise();
          }
          return [];
        },
        getAllAnnotations: async () => {
          if (!annotationApiRef.current?.getPageAnnotations) return [];
          return [];
        },
        getSignaturePreviews: () => {
          return signaturePreviews;
        },
        clearPreviews: () => {
          setSignaturePreviews([]);
        },
        zoomIn: () => {
          zoomApiRef.current?.zoomIn();
        },
        zoomOut: () => {
          zoomApiRef.current?.zoomOut();
        },
        resetZoom: () => {
          zoomApiRef.current?.resetZoom();
        },
      }),
      [signaturePreviews],
    );

    const fileStableKey = file ? `${(file as File).name}-${file.size}` : null;
    // Convert File to URL if needed
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

    // Notify parent when signature previews change
    useEffect(() => {
      onAnnotationChangeRef.current?.(signaturePreviews);
      onPreviewCountChangeRef.current?.(signaturePreviews.length);
    }, [signaturePreviews]);

    const plugins = useMemo(() => {
      if (!pdfUrl) return [];

      const deviceMemory =
        typeof navigator !== "undefined"
          ? ((navigator as Navigator & { deviceMemory?: number })
              .deviceMemory ?? 4)
          : 4;
      const bufferSize = deviceMemory >= 4 ? 4 : 2;

      return [
        createPluginRegistration(DocumentManagerPluginPackage, {
          initialDocuments: [
            {
              url: pdfUrl,
              name: DOCUMENT_NAME,
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
          withForms: true,
          withAnnotations: true,
          defaultImageType: "image/bmp",
        }),

        // Register interaction manager (required for annotations)
        createPluginRegistration(InteractionManagerPluginPackage),

        // Register selection plugin (depends on InteractionManager)
        createPluginRegistration(SelectionPluginPackage, {
          maxCachedGeometries: 15,
        }),

        // Register history plugin for undo/redo (recommended for annotations)
        createPluginRegistration(HistoryPluginPackage),

        // Register annotation plugin (depends on InteractionManager, Selection, History)
        createPluginRegistration(AnnotationPluginPackage, {
          annotationAuthor: "Digital Signature",
          autoCommit: true,
          deactivateToolAfterCreate: false,
          selectAfterCreate: true,
        }),

        // Register pan plugin
        createPluginRegistration(PanPluginPackage, {
          defaultMode: "mobile",
        }),

        // Register zoom plugin
        createPluginRegistration(ZoomPluginPackage, {
          defaultZoomLevel: ZoomMode.FitWidth,
          minZoom: 0.2,
          maxZoom: 3.0,
        }),

        // Register tiling plugin
        createPluginRegistration(TilingPluginPackage, {
          tileSize: 1024,
          overlapPx: 2.5,
          extraRings: 0,
          defaultImageType: "image/bmp", // BMP is faster for local processing than WebP
        }),

        // Register spread plugin
        createPluginRegistration(SpreadPluginPackage, {
          defaultSpreadMode: SpreadMode.None,
        }),

        // Register search plugin
        createPluginRegistration(SearchPluginPackage),

        // Register thumbnail plugin
        createPluginRegistration(ThumbnailPluginPackage),

        // Register rotate plugin
        createPluginRegistration(RotatePluginPackage, {
          defaultRotation: Rotation.Degree0,
        }),
      ];
    }, [pdfUrl]);

    // Retrieve the global engine instance from context
    const { engine, isLoading, error } = useEngineContext();

    // renderPageFactory — recreates only when feature flags / stable callbacks change.
    // signaturePreviews is NOT in deps; instead we pass per-page previews as a
    // derived prop inside the factory so React.memo on PageContentAnnotations
    // handles fine-grained updates (only pages with changed sigs re-render).
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
        }) => {
          // NOTE: This factory captures signaturePreviews via closure and is
          // recreated when signaturePreviews changes. PageContentAnnotations is
          // React.memo'd, so only pages where `previews` actually changes will
          // re-render — the PDF rendering layers (PageStaticLayers) remain stable.
          return (
            <PageContentAnnotations
              key={`${documentId}-${pageIndex}`}
              documentId={documentId}
              pageIndex={pageIndex}
              width={width}
              height={height}
              placementMode={placementMode}
              signatureData={signatureData}
              signatureType={signatureType}
              previews={signaturePreviews.filter(
                (p) => p.pageIndex === pageIndex,
              )}
              readOnly={readOnly}
              onDelete={handleDelete}
              onMove={handleMove}
              onResize={handleResize}
              onPlaceSignatureOnPage={handlePlaceOnPage}
              onMouseMoveOnPage={handleMouseMoveOnPage}
              onMouseLeaveFromPage={handleMouseLeaveFromPage}
              interactionPauseRef={interactionPauseRef}
              isDraggingRef={isDraggingRef}
              cursorRef={cursorRef}
              deleteLabel={deleteLabel}
            />
          );
        },
      [
        placementMode,
        signatureData,
        signatureType,
        signaturePreviews,
        readOnly,
        handleDelete,
        handleMove,
        handleResize,
        handlePlaceOnPage,
        handleMouseMoveOnPage,
        handleMouseLeaveFromPage,
        deleteLabel,
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

    return (
      <div
        ref={containerRef}
        style={{
          height: "100%",
          width: "100%",
          position: "relative",
          overflow: "hidden",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <EmbedPDF
          key={pdfUrl}
          engine={engine}
          plugins={plugins}
          onInitialized={async (registry: PluginRegistry) => {
            if (typeof window !== "undefined") {
              (window as any).__embedPdfRegistry = registry;
            }
            const annotationPlugin = registry.getPlugin("annotation");
            if (!annotationPlugin || !annotationPlugin.provides) return;

            const annotationApi = annotationPlugin.provides();
            if (!annotationApi) return;

            annotationApiRef.current = annotationApi;

            annotationApi.addTool({
              id: "signatureStamp",
              name: "Digital Signature",
              interaction: { exclusive: false, cursor: "crosshair" },
              matchScore: () => 0,
              defaults: {
                type: PdfAnnotationSubtype.STAMP,
                width: 150,
                height: 75,
              },
            });

            annotationApi.addTool({
              id: "signatureInk",
              name: "Signature Draw",
              interaction: { exclusive: true, cursor: "crosshair" },
              matchScore: () => 0,
              defaults: {
                type: PdfAnnotationSubtype.INK,
                color: "#000000",
                opacity: 1.0,
                borderWidth: 2,
              },
            });

            const zoomPlugin = registry.getPlugin("zoom");
            if (zoomPlugin?.provides) {
              const zoomApi = zoomPlugin.provides();
              zoomApiRef.current = {
                zoomIn: () => zoomApi.zoomIn?.(),
                zoomOut: () => zoomApi.zoomOut?.(),
                resetZoom: () =>
                  zoomApi.requestZoom?.(ZoomMode.FitWidth, { vx: 0.5, vy: 0 }),
              };
            }
          }}
        >
          <InteractionPauseBridge bridgeRef={interactionPauseRef} />
          <ScrollAPIBridge />
          <SelectionAPIBridge />
          <PanAPIBridge />
          <SpreadAPIBridge />
          <SearchAPIBridge />
          <ThumbnailAPIBridge />
          <RotateAPIBridge />
          <DocumentReadyWrapper
            fallback={
              <Center style={{ height: "100%", width: "100%" }}>
                <ToolLoadingFallback />
              </Center>
            }
          >
            {(documentId) => (
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
                  <DocumentScrollerAnnotations
                    documentId={documentId}
                    renderPageFactory={renderPageFactory}
                  />
                </Viewport>
              </GlobalPointerProvider>
            )}
          </DocumentReadyWrapper>
        </EmbedPDF>
      </div>
    );
  },
);

LocalEmbedPDFWithAnnotations.displayName = "LocalEmbedPDFWithAnnotations";
