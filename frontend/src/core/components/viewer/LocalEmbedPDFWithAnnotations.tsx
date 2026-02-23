import { useEffect, useMemo, useState, useImperativeHandle, forwardRef, useRef } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

// Import the essential plugins
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { DocumentManagerPluginPackage } from '@embedpdf/plugin-document-manager/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage } from '@embedpdf/plugin-zoom/react';
import { InteractionManagerPluginPackage, PagePointerProvider, GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { SpreadPluginPackage, SpreadMode } from '@embedpdf/plugin-spread/react';
import { SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { RotatePluginPackage, Rotate } from '@embedpdf/plugin-rotate/react';
import { Rotation, PdfAnnotationSubtype } from '@embedpdf/models';

// Import annotation plugins
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationLayer, AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';

import { CustomSearchLayer } from '@app/components/viewer/CustomSearchLayer';
import { ZoomAPIBridge } from '@app/components/viewer/ZoomAPIBridge';
import ToolLoadingFallback from '@app/components/tools/ToolLoadingFallback';
import { Center, Stack, Text } from '@mantine/core';
import { ScrollAPIBridge } from '@app/components/viewer/ScrollAPIBridge';
import { SelectionAPIBridge } from '@app/components/viewer/SelectionAPIBridge';
import { PanAPIBridge } from '@app/components/viewer/PanAPIBridge';
import { SpreadAPIBridge } from '@app/components/viewer/SpreadAPIBridge';
import { SearchAPIBridge } from '@app/components/viewer/SearchAPIBridge';
import { ThumbnailAPIBridge } from '@app/components/viewer/ThumbnailAPIBridge';
import { RotateAPIBridge } from '@app/components/viewer/RotateAPIBridge';
import { DocumentReadyWrapper } from '@app/components/viewer/DocumentReadyWrapper';

const DOCUMENT_NAME = 'stirling-pdf-signing-viewer';

export interface SignaturePreview {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signatureData: string; // Base64 PNG image
  signatureType: 'canvas' | 'image' | 'text';
}

interface LocalEmbedPDFWithAnnotationsProps {
  file?: File | Blob;
  url?: string | null;
  onAnnotationChange?: (annotations: any[]) => void;
  placementMode?: boolean;
  signatureData?: string;
  signatureType?: 'canvas' | 'image' | 'text';
  onPlaceSignature?: (id: string, pageIndex: number, x: number, y: number, width: number, height: number) => void;
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

export const LocalEmbedPDFWithAnnotations = forwardRef<AnnotationAPI | null, LocalEmbedPDFWithAnnotationsProps>(({
  file,
  url,
  onAnnotationChange,
  placementMode = false,
  signatureData,
  signatureType,
  onPlaceSignature,
  onPreviewCountChange,
  initialSignatures = [],
  readOnly = false
}, ref) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const annotationApiRef = useRef<any>(null);
  const zoomApiRef = useRef<any>(null);

  // State for signature preview overlays (support multiple)
  const [signaturePreviews, setSignaturePreviews] = useState<SignaturePreview[]>(initialSignatures);

  // Track if a drag operation just occurred to prevent click from firing
  const isDraggingRef = useRef(false);

  // Expose annotation API to parent
  useImperativeHandle(ref, () => ({
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
      const task = annotationApiRef.current.getPageAnnotations({ pageIndex });
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
  }), [signaturePreviews]);

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
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const viewportGap = rootFontSize * 3.5;

    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{
          url: pdfUrl,
          name: DOCUMENT_NAME,
        }],
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
        annotationAuthor: 'Digital Signature',
        autoCommit: true,
        deactivateToolAfterCreate: false,
        selectAfterCreate: true,
      }),

      // Register pan plugin
      createPluginRegistration(PanPluginPackage, {
        defaultMode: 'mobile',
      }),

      // Register zoom plugin
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: 1.4,
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
          <div style={{ fontSize: '24px' }}>📄</div>
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
          <div style={{ fontSize: '24px' }}>❌</div>
          <Text c="red" size="sm" style={{ textAlign: 'center' }}>
            Error loading PDF engine: {error.message}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <div style={{
      height: '100%',
      width: '100%',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minHeight: 0,
      minWidth: 0
    }}>
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={async (registry) => {
          // Store zoom API reference
          const zoomPlugin = registry.getPlugin('zoom');
          if (zoomPlugin && zoomPlugin.provides) {
            zoomApiRef.current = zoomPlugin.provides();
          }

          const annotationPlugin = registry.getPlugin('annotation');
          if (!annotationPlugin || !annotationPlugin.provides) return;

          const annotationApi = annotationPlugin.provides();
          if (!annotationApi) return;

          // Store reference for parent component access
          annotationApiRef.current = annotationApi;

          // Add custom signature image tool
          // Using FreeText with appearance for better image support
          annotationApi.addTool({
            id: 'signatureStamp',
            name: 'Digital Signature',
            interaction: { exclusive: false, cursor: 'crosshair' },
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
            id: 'signatureInk',
            name: 'Signature Draw',
            interaction: { exclusive: true, cursor: 'crosshair' },
            matchScore: () => 0,
            defaults: {
              type: PdfAnnotationSubtype.INK,
              color: '#000000',
              opacity: 1.0,
              borderWidth: 2,
            },
          });

          // Annotation events are now tracked via signaturePreviews state
          // and notified to parent via useEffect
        }}
      >
        <ZoomAPIBridge />
        <ScrollAPIBridge />
        <SelectionAPIBridge />
        <PanAPIBridge />
        <SpreadAPIBridge />
        <SearchAPIBridge />
        <ThumbnailAPIBridge />
        <RotateAPIBridge />
        <DocumentReadyWrapper
          fallback={
            <Center style={{ height: '100%', width: '100%' }}>
              <ToolLoadingFallback />
            </Center>
          }
        >
          {(documentId) => (
            <GlobalPointerProvider documentId={documentId}>
              <Viewport
                documentId={documentId}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  height: '100%',
                  width: '100%',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  overflow: 'auto',
                  position: 'relative',
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  contain: 'strict',
                }}
              >
                <Scroller
                  documentId={documentId}
                  renderPage={({ width, height, pageIndex, scale }: {
                    width: number;
                    height: number;
                    pageIndex: number;
                    scale: number;
                  }) => (
                    <Rotate key={`${documentId}-${pageIndex}`} documentId={documentId} pageIndex={pageIndex}>
                      <PagePointerProvider documentId={documentId} pageIndex={pageIndex}>
                        <div
                          style={{
                            width,
                            height,
                            position: 'relative',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            cursor: placementMode ? 'crosshair' : 'default',
                          }}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                          onDrop={(e) => e.preventDefault()}
                          onDragOver={(e) => e.preventDefault()}
                          onClick={(e) => {
                            if (isDraggingRef.current) return;

                            if (placementMode && onPlaceSignature) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const x = (e.clientX - rect.left) / scale;
                              const y = (e.clientY - rect.top) / scale;
                              const sigWidth = 150;
                              const sigHeight = 75;

                              const newPreview = {
                                id: `sig-preview-${Date.now()}-${Math.random()}`,
                                pageIndex,
                                x,
                                y,
                                width: sigWidth,
                                height: sigHeight,
                                signatureData: signatureData || '',
                                signatureType: signatureType || 'image',
                              };
                              setSignaturePreviews(prev => [...prev, newPreview]);
                              onPlaceSignature(newPreview.id, pageIndex, x, y, sigWidth, sigHeight);
                            }
                          }}
                        >
                          <TilingLayer documentId={documentId} pageIndex={pageIndex} />

                          <CustomSearchLayer documentId={documentId} pageIndex={pageIndex} />

                          <SelectionLayer documentId={documentId} pageIndex={pageIndex} />

                          {/* Annotation layer for signatures */}
                          <AnnotationLayer
                            documentId={documentId}
                            pageIndex={pageIndex}
                            selectionOutlineColor="#007ACC"
                          />

                          {/* Signature preview overlays (support multiple) */}
                          {signaturePreviews
                            .filter(preview => preview.pageIndex === pageIndex)
                            .map((preview) => preview.signatureData && (
                              <div
                                key={preview.id}
                                style={{
                                  position: 'absolute',
                                  left: preview.x * scale,
                                  top: preview.y * scale,
                                  width: preview.width * scale,
                                  height: preview.height * scale,
                                  border: readOnly ? '1px dashed rgba(0, 122, 204, 0.4)' : '2px solid #007ACC',
                                  boxShadow: readOnly ? 'none' : '0 0 10px rgba(0, 122, 204, 0.5)',
                                  cursor: readOnly ? 'default' : 'move',
                                  zIndex: 1000,
                                  backgroundColor: readOnly ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                                  pointerEvents: readOnly ? 'none' : 'auto',
                                }}
                              >
                                {/* Delete button - only show when not read-only */}
                                {!readOnly && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: -12,
                                      right: -12,
                                      width: 24,
                                      height: 24,
                                      borderRadius: '50%',
                                      backgroundColor: '#DC3545',
                                      color: 'white',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      fontSize: '16px',
                                      fontWeight: 'bold',
                                      border: '2px solid white',
                                      zIndex: 1002,
                                      pointerEvents: 'auto',
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSignaturePreviews(prev => prev.filter(p => p.id !== preview.id));
                                    }}
                                    title="Delete signature"
                                  >
                                    ×
                                  </div>
                                )}

                                <div
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    pointerEvents: readOnly ? 'none' : 'auto',
                                  }}
                                  onMouseDown={readOnly ? undefined : (e) => {
                                    e.stopPropagation();
                                    const startX = e.clientX;
                                    const startY = e.clientY;
                                    const startLeft = preview.x;
                                    const startTop = preview.y;

                                    const handleMouseMove = (moveEvent: MouseEvent) => {
                                      isDraggingRef.current = true;
                                      const deltaX = (moveEvent.clientX - startX) / scale;
                                      const deltaY = (moveEvent.clientY - startY) / scale;
                                      setSignaturePreviews(prev => prev.map(p =>
                                        p.id === preview.id
                                          ? { ...p, x: startLeft + deltaX, y: startTop + deltaY }
                                          : p
                                      ));
                                    };

                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                      setTimeout(() => { isDraggingRef.current = false; }, 10);
                                    };

                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }}
                                >
                                  <img
                                    src={preview.signatureData}
                                    alt="Signature preview"
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'contain',
                                      pointerEvents: 'none',
                                    }}
                                  />

                                  {/* Resize handles */}
                                  {[
                                    { position: 'nw', cursor: 'nw-resize', top: -4, left: -4 },
                                    { position: 'ne', cursor: 'ne-resize', top: -4, right: -4 },
                                    { position: 'sw', cursor: 'sw-resize', bottom: -4, left: -4 },
                                    { position: 'se', cursor: 'se-resize', bottom: -4, right: -4 },
                                  ].map((handle) => (
                                    <div
                                      key={handle.position}
                                      style={{
                                        position: 'absolute',
                                        width: 8,
                                        height: 8,
                                        backgroundColor: '#007ACC',
                                        border: '1px solid white',
                                        cursor: handle.cursor,
                                        zIndex: 1001,
                                        ...(handle.top !== undefined && { top: handle.top }),
                                        ...(handle.bottom !== undefined && { bottom: handle.bottom }),
                                        ...(handle.left !== undefined && { left: handle.left }),
                                        ...(handle.right !== undefined && { right: handle.right }),
                                      }}
                                      onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const startX = e.clientX;
                                        const startY = e.clientY;
                                        const startWidth = preview.width;
                                        const startHeight = preview.height;
                                        const startLeft = preview.x;
                                        const startTop = preview.y;

                                        const handleMouseMove = (moveEvent: MouseEvent) => {
                                          isDraggingRef.current = true;
                                          const deltaX = (moveEvent.clientX - startX) / scale;
                                          const deltaY = (moveEvent.clientY - startY) / scale;

                                          let newWidth = startWidth;
                                          let newHeight = startHeight;
                                          let newX = startLeft;
                                          let newY = startTop;

                                          if (handle.position.includes('e')) {
                                            newWidth = Math.max(50, startWidth + deltaX);
                                          }
                                          if (handle.position.includes('w')) {
                                            newWidth = Math.max(50, startWidth - deltaX);
                                            newX = startLeft + (startWidth - newWidth);
                                          }
                                          if (handle.position.includes('s')) {
                                            newHeight = Math.max(25, startHeight + deltaY);
                                          }
                                          if (handle.position.includes('n')) {
                                            newHeight = Math.max(25, startHeight - deltaY);
                                            newY = startTop + (startHeight - newHeight);
                                          }

                                          setSignaturePreviews(prev => prev.map(p =>
                                            p.id === preview.id
                                              ? { ...p, x: newX, y: newY, width: newWidth, height: newHeight }
                                              : p
                                          ));
                                        };

                                        const handleMouseUp = () => {
                                          document.removeEventListener('mousemove', handleMouseMove);
                                          document.removeEventListener('mouseup', handleMouseUp);
                                          setTimeout(() => { isDraggingRef.current = false; }, 10);
                                        };

                                        document.addEventListener('mousemove', handleMouseMove);
                                        document.addEventListener('mouseup', handleMouseUp);
                                      }}
                                    />
                                  ))}
                                </div>
                              </div>
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
});

LocalEmbedPDFWithAnnotations.displayName = 'LocalEmbedPDFWithAnnotations';
