import { useEffect, useMemo, useState, useImperativeHandle, forwardRef, useRef } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

// Import the essential plugins
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
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
import { Rotation } from '@embedpdf/models';

// Import annotation plugins
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationLayer, AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';

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

interface LocalEmbedPDFWithAnnotationsProps {
  file?: File | Blob;
  url?: string | null;
  onAnnotationChange?: (annotations: any[]) => void;
  placementMode?: boolean;
  signatureData?: string;
  onPlaceSignature?: (pageIndex: number, x: number, y: number, width: number, height: number) => void;
}

export interface AnnotationAPI {
  setActiveTool: (toolId: string | null) => void;
  setToolDefaults: (toolId: string, defaults: any) => void;
  getActiveTool: () => any;
  getPageAnnotations: (pageIndex: number) => Promise<any[]>;
  getAllAnnotations: () => Promise<any[]>;
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
  onPlaceSignature
}, ref) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const annotationApiRef = useRef<any>(null);
  const zoomApiRef = useRef<any>(null);

  // State for signature preview overlay
  const [signaturePreview, setSignaturePreview] = useState<{
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

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
    zoomIn: () => {
      zoomApiRef.current?.zoomIn();
    },
    zoomOut: () => {
      zoomApiRef.current?.zoomOut();
    },
    resetZoom: () => {
      zoomApiRef.current?.resetZoom();
    },
  }), []);

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

  // Create plugins configuration with annotation support
  const plugins = useMemo(() => {
    if (!pdfUrl) return [];

    // Calculate 3.5rem in pixels dynamically based on root font size
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const viewportGap = rootFontSize * 3.5;

    return [
      createPluginRegistration(LoaderPluginPackage, {
        loadingOptions: {
          type: 'url',
          pdfFile: {
            id: 'stirling-pdf-signing-viewer',
            url: pdfUrl,
          },
        },
      }),
      createPluginRegistration(ViewportPluginPackage, {
        viewportGap,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        strategy: ScrollStrategy.Vertical,
        initialPage: 0,
      }),
      createPluginRegistration(RenderPluginPackage),

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

          // Listen for annotation events to notify parent
          if (onAnnotationChange) {
            annotationApi.onAnnotationEvent((event: any) => {
              if (event.committed) {
                // Get all annotations and notify parent
                // This is a simplified approach - in reality you'd need to get all annotations
                onAnnotationChange([event.annotation]);
              }
            });
          }
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
        <GlobalPointerProvider>
          <Viewport
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
              renderPage={({ width, height, pageIndex, scale, rotation }: {
                width: number;
                height: number;
                pageIndex: number;
                scale: number;
                rotation?: number;
              }) => (
                <Rotate pageSize={{ width, height }}>
                  <PagePointerProvider {...{
                    pageWidth: width,
                    pageHeight: height,
                    pageIndex,
                    scale,
                    rotation: rotation || 0
                  }}>
                    <div
                      style={{
                        width,
                        height,
                        position: 'relative',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        cursor: placementMode ? 'crosshair' : 'default'
                      }}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onDrop={(e) => e.preventDefault()}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={(e) => {
                        if (placementMode && onPlaceSignature) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = (e.clientX - rect.left) / scale;
                          const y = (e.clientY - rect.top) / scale;
                          // Default signature size: 150x75 pts
                          const sigWidth = 150;
                          const sigHeight = 75;

                          // Show preview
                          setSignaturePreview({
                            pageIndex,
                            x,
                            y,
                            width: sigWidth,
                            height: sigHeight,
                          });

                          // Notify parent
                          onPlaceSignature(pageIndex, x, y, sigWidth, sigHeight);
                        }
                      }}
                    >
                      {/* High-resolution tile layer */}
                      <TilingLayer pageIndex={pageIndex} scale={scale} />

                      {/* Search highlight layer */}
                      <CustomSearchLayer pageIndex={pageIndex} scale={scale} />

                      {/* Selection layer for text interaction */}
                      <SelectionLayer pageIndex={pageIndex} scale={scale} />

                      {/* Annotation layer for signatures */}
                      <AnnotationLayer
                        pageIndex={pageIndex}
                        scale={scale}
                        pageWidth={width}
                        pageHeight={height}
                        rotation={rotation || 0}
                        selectionOutlineColor="#007ACC"
                      />

                      {/* Signature preview overlay */}
                      {signaturePreview &&
                       signaturePreview.pageIndex === pageIndex &&
                       signatureData && (
                        <div
                          style={{
                            position: 'absolute',
                            left: signaturePreview.x * scale,
                            top: signaturePreview.y * scale,
                            width: signaturePreview.width * scale,
                            height: signaturePreview.height * scale,
                            border: '2px solid #007ACC',
                            boxShadow: '0 0 10px rgba(0, 122, 204, 0.5)',
                            cursor: 'move',
                            zIndex: 1000,
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startLeft = signaturePreview.x;
                            const startTop = signaturePreview.y;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const deltaX = (moveEvent.clientX - startX) / scale;
                              const deltaY = (moveEvent.clientY - startY) / scale;

                              setSignaturePreview({
                                ...signaturePreview,
                                x: startLeft + deltaX,
                                y: startTop + deltaY,
                              });

                              // Update parent with new position
                              if (onPlaceSignature) {
                                onPlaceSignature(
                                  pageIndex,
                                  startLeft + deltaX,
                                  startTop + deltaY,
                                  signaturePreview.width,
                                  signaturePreview.height
                                );
                              }
                            };

                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                        >
                          <img
                            src={signatureData}
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
                                const startWidth = signaturePreview.width;
                                const startHeight = signaturePreview.height;
                                const startLeft = signaturePreview.x;
                                const startTop = signaturePreview.y;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                  const deltaX = (moveEvent.clientX - startX) / scale;
                                  const deltaY = (moveEvent.clientY - startY) / scale;

                                  let newWidth = startWidth;
                                  let newHeight = startHeight;
                                  let newX = startLeft;
                                  let newY = startTop;

                                  // Calculate new dimensions based on handle position
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

                                  setSignaturePreview({
                                    pageIndex,
                                    x: newX,
                                    y: newY,
                                    width: newWidth,
                                    height: newHeight,
                                  });

                                  // Update parent with new dimensions
                                  if (onPlaceSignature) {
                                    onPlaceSignature(pageIndex, newX, newY, newWidth, newHeight);
                                  }
                                };

                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };

                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </PagePointerProvider>
                </Rotate>
              )}
            />
          </Viewport>
        </GlobalPointerProvider>
      </EmbedPDF>
    </div>
  );
});
