import { useEffect, useMemo, useState } from 'react';
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

interface LocalEmbedPDFWithAnnotationsProps {
  file?: File | Blob;
  url?: string | null;
  onAnnotationChange?: (annotations: any[]) => void;
}

export function LocalEmbedPDFWithAnnotations({
  file,
  url,
  onAnnotationChange
}: LocalEmbedPDFWithAnnotationsProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

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
        onInitialized={async (registry: any) => {
          // v2.0: Use registry.getPlugin() to access plugin APIs
          const annotationPlugin = registry.getPlugin('annotation');
          if (!annotationPlugin || !annotationPlugin.provides) return;

          const annotationApi = annotationPlugin.provides();
          if (!annotationApi) return;

          // Add custom signature stamp tool
          annotationApi.addTool({
            id: 'signatureStamp',
            name: 'Digital Signature',
            interaction: { exclusive: false, cursor: 'copy' },
            matchScore: () => 0,
            defaults: {
              type: PdfAnnotationSubtype.STAMP,
              // Will be set dynamically when user creates signature
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
                  renderPage={({ width, height, pageIndex }) => (
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
                            msUserSelect: 'none'
                          }}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                          onDrop={(e) => e.preventDefault()}
                          onDragOver={(e) => e.preventDefault()}
                        >
                          <TilingLayer documentId={documentId} pageIndex={pageIndex} />

                          <CustomSearchLayer documentId={documentId} pageIndex={pageIndex} />

                          <SelectionLayer documentId={documentId} pageIndex={pageIndex} />

                          <AnnotationLayer
                            documentId={documentId}
                            pageIndex={pageIndex}
                            selectionOutlineColor="#007ACC"
                          />
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
}
