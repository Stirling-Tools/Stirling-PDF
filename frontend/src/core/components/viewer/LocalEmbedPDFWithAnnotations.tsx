import {
  useEffect,
  useMemo,
  useState,
  useImperativeHandle,
  forwardRef,
  useRef,
} from "react";
import { createPluginRegistration } from "@embedpdf/core";
import type { PluginRegistry } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";

// Import the essential plugins
import {
  Viewport,
  ViewportPluginPackage,
} from "@embedpdf/plugin-viewport/react";
import { Scroller, ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
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

const DOCUMENT_NAME = "stirling-pdf-signing-viewer";

const TRANSPARENT_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface SignaturePreview {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signatureData: string; // Base64 PNG image
  signatureType: "canvas" | "image" | "text";
  /** When set to certificate, the overlay is a resizable placement box (no image). */
  kind?: "wet" | "certificate";
  color?: string; // Per-participant color (rgb(...) string); falls back to default blue
  participantName?: string; // Shown in tooltip on hover
}

interface LocalEmbedPDFWithAnnotationsProps {
  file?: File | Blob;
  url?: string | null;
  onAnnotationChange?: (annotations: SignaturePreview[]) => void;
  placementMode?: boolean;
  /** Wet signatures need drawn/uploaded image data; certificate uses a plain placement box. */
  placementAppearance?: "wet" | "certificate";
  /** When set to 1, a new placement replaces the previous preview (e.g. certificate widget). */
  maxSignaturePreviews?: number;
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
      placementAppearance = "wet",
      maxSignaturePreviews,
      signatureData,
      signatureType,
      onPlaceSignature,
      onPreviewCountChange,
      initialSignatures = [],
      readOnly = false,
    },
    ref,
  ) => {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const annotationApiRef = useRef<any>(null);
    const zoomApiRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // State for signature preview overlays (support multiple)
    const [signaturePreviews, setSignaturePreviews] =
      useState<SignaturePreview[]>(initialSignatures);

    const placementAllowsWithoutImage = placementAppearance === "certificate";
    const effectiveSignatureData =
      placementAppearance === "certificate"
        ? (signatureData ?? TRANSPARENT_PIXEL_PNG)
        : signatureData;

    // Track if a drag operation just occurred to prevent click from firing
    const isDraggingRef = useRef(false);
    const interactionPauseRef = useRef<{
      pause: () => void;
      resume: () => void;
    } | null>(null);

    // Track cursor position over a specific page for hover preview
    const [cursorOnPage, setCursorOnPage] = useState<{
      pageIndex: number;
      x: number;
      y: number;
    } | null>(null);

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
          // Get all annotations across all pages
          // Note: In practice, we'll use getPageAnnotations for the specific page
          // where the user placed their signature, so this method is optional
          if (!annotationApiRef.current?.getPageAnnotations) return [];

          // Would need document page count to iterate through all pages
          // For signing workflow, we track annotations via onAnnotationChange callback instead
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

    // Convert File to URL if needed
    useEffect(() => {
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        setPdfUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
      } else if (url) {
        setPdfUrl(url);
      }
    }, [file, url]);

    // Notify parent when signature previews change
    useEffect(() => {
      if (onAnnotationChange) {
        onAnnotationChange(signaturePreviews);
      }
      if (onPreviewCountChange) {
        onPreviewCountChange(signaturePreviews.length);
      }
    }, [signaturePreviews, onAnnotationChange, onPreviewCountChange]);

    // Create plugins configuration with annotation support
    const plugins = useMemo(() => {
      if (!pdfUrl) return [];

      // Calculate 3.5rem in pixels dynamically based on root font size
      const rootFontSize = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const viewportGap = rootFontSize * 3.5;

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
          viewportGap,
        }),
        createPluginRegistration(ScrollPluginPackage),
        createPluginRegistration(RenderPluginPackage, {
          withForms: true,
          withAnnotations: true,
        }),

        // Register interaction manager (required for annotations)
        createPluginRegistration(InteractionManagerPluginPackage),

        // Register selection plugin (depends on InteractionManager)
        createPluginRegistration(SelectionPluginPackage),

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
          tileSize: 768,
          overlapPx: 5,
          extraRings: 1,
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

    // Initialize the engine
    const { engine, isLoading, error } = usePdfiumEngine();

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
            // v2.0: Use registry.getPlugin() to access plugin APIs
            const annotationPlugin = registry.getPlugin("annotation");
            if (!annotationPlugin || !annotationPlugin.provides) return;

            const annotationApi = annotationPlugin.provides();
            if (!annotationApi) return;

            // Store reference for parent component access
            annotationApiRef.current = annotationApi;

            // Add custom signature image tool
            // Using FreeText with appearance for better image support
            annotationApi.addTool({
              id: "signatureStamp",
              name: "Digital Signature",
              interaction: { exclusive: false, cursor: "crosshair" },
              matchScore: () => 0,
              defaults: {
                type: PdfAnnotationSubtype.STAMP,
                // Image data will be set dynamically via setToolDefaults
                width: 150,
                height: 75,
              },
            });

            // Add custom ink signature tool
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

            // Wire zoom API so parent can call zoomIn/zoomOut/resetZoom
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
                  <Scroller
                    documentId={documentId}
                    renderPage={({ width, height, pageIndex }) => (
                      <Rotate
                        key={`${documentId}-${pageIndex}`}
                        documentId={documentId}
                        pageIndex={pageIndex}
                      >
                        <PagePointerProvider
                          documentId={documentId}
                          pageIndex={pageIndex}
                        >
                          <div
                            style={{
                              width,
                              height,
                              position: "relative",
                              userSelect: "none",
                              WebkitUserSelect: "none",
                              MozUserSelect: "none",
                              msUserSelect: "none",
                              cursor: placementMode ? "crosshair" : "default",
                              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                            }}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onDrop={(e) => e.preventDefault()}
                            onDragOver={(e) => e.preventDefault()}
                            onMouseMove={(e) => {
                              if (
                                !placementMode ||
                                (!placementAllowsWithoutImage && !signatureData)
                              )
                                return;
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              setCursorOnPage({
                                pageIndex,
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }}
                            onMouseLeave={() => {
                              setCursorOnPage((prev) =>
                                prev?.pageIndex === pageIndex ? null : prev,
                              );
                            }}
                            onClick={(e) => {
                              if (isDraggingRef.current) return;

                              if (
                                placementMode &&
                                (placementAllowsWithoutImage || signatureData)
                              ) {
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                // Store as fractions (0–1) of the rendered page so overlays
                                // remain correct at any zoom level (scale not in new API)
                                const sigWidth = 150 / width;
                                const sigHeight = 75 / height;
                                const rawX = (e.clientX - rect.left) / width;
                                const rawY = (e.clientY - rect.top) / height;
                                const x = Math.max(
                                  0,
                                  Math.min(rawX - sigWidth / 2, 1 - sigWidth),
                                );
                                const y = Math.max(
                                  0,
                                  Math.min(rawY - sigHeight / 2, 1 - sigHeight),
                                );

                                const newPreview: SignaturePreview = {
                                  id: `sig-preview-${Date.now()}-${Math.random()}`,
                                  pageIndex,
                                  x,
                                  y,
                                  width: sigWidth,
                                  height: sigHeight,
                                  signatureData:
                                    placementAppearance === "certificate"
                                      ? TRANSPARENT_PIXEL_PNG
                                      : signatureData || "",
                                  signatureType: signatureType || "image",
                                  kind:
                                    placementAppearance === "certificate"
                                      ? "certificate"
                                      : "wet",
                                };
                                setSignaturePreviews((prev) =>
                                  maxSignaturePreviews === 1
                                    ? [newPreview]
                                    : [...prev, newPreview],
                                );
                                onPlaceSignature?.(
                                  newPreview.id,
                                  pageIndex,
                                  x * width,
                                  y * height,
                                  sigWidth * width,
                                  sigHeight * height,
                                );
                              }
                            }}
                          >
                            <TilingLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                            />

                            <CustomSearchLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                            />

                            <SelectionLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                            />

                            {/* Annotation layer for signatures */}
                            <AnnotationLayer
                              documentId={documentId}
                              pageIndex={pageIndex}
                              selectionOutline={{ color: "#007ACC" }}
                            />

                            {/* Signature preview overlays (support multiple) */}
                            {signaturePreviews
                              .filter(
                                (preview) => preview.pageIndex === pageIndex,
                              )
                              .map((preview) => {
                                if (
                                  !preview.signatureData &&
                                  preview.kind !== "certificate"
                                )
                                  return null;
                                const color =
                                  preview.color ?? "rgb(0, 122, 204)";
                                const colorOpacity = (opacity: number) =>
                                  color.startsWith("rgb(")
                                    ? color
                                        .replace("rgb(", "rgba(")
                                        .replace(")", `, ${opacity})`)
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
                                        boxShadow: readOnly
                                          ? "none"
                                          : `0 0 10px ${colorOpacity(0.5)}`,
                                        cursor: readOnly ? "default" : "move",
                                        zIndex: Z_INDEX_SIGNATURE_OVERLAY,
                                        backgroundColor: readOnly
                                          ? "transparent"
                                          : "rgba(255, 255, 255, 0.1)",
                                        pointerEvents: "auto",
                                      }}
                                    >
                                      {/* Delete button - only show when not read-only */}
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
                                            zIndex:
                                              Z_INDEX_SIGNATURE_OVERLAY_DELETE,
                                            pointerEvents: "auto",
                                            boxShadow:
                                              "0 1px 4px rgba(0,0,0,0.25)",
                                            border: "2px solid white",
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSignaturePreviews((prev) =>
                                              prev.filter(
                                                (p) => p.id !== preview.id,
                                              ),
                                            );
                                          }}
                                          aria-label="Delete signature"
                                        >
                                          <CloseIcon
                                            style={{ fontSize: "0.8rem" }}
                                          />
                                        </ActionIcon>
                                      )}

                                      <div
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          pointerEvents: readOnly
                                            ? "none"
                                            : "auto",
                                        }}
                                        onPointerDown={
                                          readOnly
                                            ? undefined
                                            : (e) => {
                                                if (
                                                  (e.target as HTMLElement)
                                                    .dataset.resizeHandle
                                                )
                                                  return;
                                                e.stopPropagation();
                                                e.preventDefault();
                                                const el = e.currentTarget;
                                                el.setPointerCapture(
                                                  e.pointerId,
                                                );
                                                interactionPauseRef.current?.pause();

                                                const startX = e.clientX;
                                                const startY = e.clientY;
                                                const startLeft = preview.x;
                                                const startTop = preview.y;

                                                const handlePointerMove = (
                                                  moveEvent: PointerEvent,
                                                ) => {
                                                  isDraggingRef.current = true;
                                                  const deltaX =
                                                    (moveEvent.clientX -
                                                      startX) /
                                                    width;
                                                  const deltaY =
                                                    (moveEvent.clientY -
                                                      startY) /
                                                    height;
                                                  setSignaturePreviews((prev) =>
                                                    prev.map((p) =>
                                                      p.id === preview.id
                                                        ? {
                                                            ...p,
                                                            x:
                                                              startLeft +
                                                              deltaX,
                                                            y:
                                                              startTop + deltaY,
                                                          }
                                                        : p,
                                                    ),
                                                  );
                                                };

                                                const handlePointerUp = (
                                                  upEvent: PointerEvent,
                                                ) => {
                                                  el.removeEventListener(
                                                    "pointermove",
                                                    handlePointerMove,
                                                  );
                                                  el.removeEventListener(
                                                    "pointerup",
                                                    handlePointerUp,
                                                  );
                                                  el.releasePointerCapture(
                                                    upEvent.pointerId,
                                                  );
                                                  interactionPauseRef.current?.resume();
                                                  window
                                                    .getSelection()
                                                    ?.removeAllRanges();
                                                  setTimeout(() => {
                                                    isDraggingRef.current = false;
                                                  }, 10);
                                                };

                                                el.addEventListener(
                                                  "pointermove",
                                                  handlePointerMove,
                                                );
                                                el.addEventListener(
                                                  "pointerup",
                                                  handlePointerUp,
                                                );
                                              }
                                        }
                                      >
                                        {preview.kind === "certificate" ? (
                                          <Center
                                            style={{
                                              width: "100%",
                                              height: "100%",
                                              pointerEvents: "none",
                                            }}
                                          >
                                            <Text
                                              size="xs"
                                              ta="center"
                                              fw={600}
                                              c="dimmed"
                                              style={{
                                                lineHeight: 1.2,
                                                padding: 4,
                                              }}
                                            >
                                              Digital signature
                                            </Text>
                                          </Center>
                                        ) : (
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
                                        )}

                                        {/* Resize handles */}
                                        {[
                                          {
                                            position: "nw",
                                            cursor: "nw-resize",
                                            top: -4,
                                            left: -4,
                                          },
                                          {
                                            position: "ne",
                                            cursor: "ne-resize",
                                            top: -4,
                                            right: -4,
                                          },
                                          {
                                            position: "sw",
                                            cursor: "sw-resize",
                                            bottom: -4,
                                            left: -4,
                                          },
                                          {
                                            position: "se",
                                            cursor: "se-resize",
                                            bottom: -4,
                                            right: -4,
                                          },
                                        ].map((handle) => (
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
                                              zIndex:
                                                Z_INDEX_SIGNATURE_OVERLAY_HANDLE,
                                              ...(handle.top !== undefined && {
                                                top: handle.top,
                                              }),
                                              ...(handle.bottom !==
                                                undefined && {
                                                bottom: handle.bottom,
                                              }),
                                              ...(handle.left !== undefined && {
                                                left: handle.left,
                                              }),
                                              ...(handle.right !==
                                                undefined && {
                                                right: handle.right,
                                              }),
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
                                              const startHeight =
                                                preview.height;
                                              const startLeft = preview.x;
                                              const startTop = preview.y;

                                              const handlePointerMove = (
                                                moveEvent: PointerEvent,
                                              ) => {
                                                isDraggingRef.current = true;
                                                const deltaX =
                                                  (moveEvent.clientX - startX) /
                                                  width;
                                                const deltaY =
                                                  (moveEvent.clientY - startY) /
                                                  height;

                                                let newWidth = startWidth;
                                                let newHeight = startHeight;
                                                let newX = startLeft;
                                                let newY = startTop;

                                                // Min sizes as fractions: 50px / pageWidth, 25px / pageHeight
                                                const minW = 50 / width;
                                                const minH = 25 / height;

                                                if (
                                                  handle.position.includes("e")
                                                ) {
                                                  newWidth = Math.max(
                                                    minW,
                                                    startWidth + deltaX,
                                                  );
                                                }
                                                if (
                                                  handle.position.includes("w")
                                                ) {
                                                  newWidth = Math.max(
                                                    minW,
                                                    startWidth - deltaX,
                                                  );
                                                  newX =
                                                    startLeft +
                                                    (startWidth - newWidth);
                                                }
                                                if (
                                                  handle.position.includes("s")
                                                ) {
                                                  newHeight = Math.max(
                                                    minH,
                                                    startHeight + deltaY,
                                                  );
                                                }
                                                if (
                                                  handle.position.includes("n")
                                                ) {
                                                  newHeight = Math.max(
                                                    minH,
                                                    startHeight - deltaY,
                                                  );
                                                  newY =
                                                    startTop +
                                                    (startHeight - newHeight);
                                                }

                                                setSignaturePreviews((prev) =>
                                                  prev.map((p) =>
                                                    p.id === preview.id
                                                      ? {
                                                          ...p,
                                                          x: newX,
                                                          y: newY,
                                                          width: newWidth,
                                                          height: newHeight,
                                                        }
                                                      : p,
                                                  ),
                                                );
                                              };

                                              const handlePointerUp = (
                                                upEvent: PointerEvent,
                                              ) => {
                                                el.removeEventListener(
                                                  "pointermove",
                                                  handlePointerMove,
                                                );
                                                el.removeEventListener(
                                                  "pointerup",
                                                  handlePointerUp,
                                                );
                                                el.releasePointerCapture(
                                                  upEvent.pointerId,
                                                );
                                                interactionPauseRef.current?.resume();
                                                window
                                                  .getSelection()
                                                  ?.removeAllRanges();
                                                setTimeout(() => {
                                                  isDraggingRef.current = false;
                                                }, 10);
                                              };

                                              el.addEventListener(
                                                "pointermove",
                                                handlePointerMove,
                                              );
                                              el.addEventListener(
                                                "pointerup",
                                                handlePointerUp,
                                              );
                                            }}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </Tooltip>
                                );
                              })}

                            {/* Hover preview: ghost signature following cursor in placement mode */}
                            {placementMode &&
                              (placementAllowsWithoutImage || signatureData) &&
                              cursorOnPage?.pageIndex === pageIndex &&
                              (placementAppearance === "certificate" ? (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: Math.max(
                                      0,
                                      Math.min(
                                        cursorOnPage.x - 75,
                                        width - 150,
                                      ),
                                    ),
                                    top: Math.max(
                                      0,
                                      Math.min(
                                        cursorOnPage.y - 37.5,
                                        height - 75,
                                      ),
                                    ),
                                    width: 150,
                                    height: 75,
                                    opacity: 0.55,
                                    pointerEvents: "none",
                                    border:
                                      "2px dashed rgba(30, 136, 229, 0.85)",
                                    borderRadius: "4px",
                                    backgroundColor:
                                      "rgba(30, 136, 229, 0.08)",
                                    zIndex: Z_INDEX_SIGNATURE_OVERLAY + 1,
                                  }}
                                />
                              ) : (
                                <img
                                  src={effectiveSignatureData}
                                  alt=""
                                  style={{
                                    position: "absolute",
                                    left: Math.max(
                                      0,
                                      Math.min(
                                        cursorOnPage.x - 75,
                                        width - 150,
                                      ),
                                    ),
                                    top: Math.max(
                                      0,
                                      Math.min(
                                        cursorOnPage.y - 37.5,
                                        height - 75,
                                      ),
                                    ),
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
                              ))}
                          </div>
                        </PagePointerProvider>
                      </Rotate>
                    )}
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
