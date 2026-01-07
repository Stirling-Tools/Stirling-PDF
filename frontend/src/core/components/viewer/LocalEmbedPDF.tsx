import React, { useEffect, useMemo, useState } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { PrivateContent } from '@app/components/shared/PrivateContent';

// Import the essential plugins
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { InteractionManagerPluginPackage, PagePointerProvider, GlobalPointerProvider } from '@embedpdf/plugin-interaction-manager/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react';
import { PanPluginPackage } from '@embedpdf/plugin-pan/react';
import { SpreadPluginPackage, SpreadMode } from '@embedpdf/plugin-spread/react';
import { SearchPluginPackage } from '@embedpdf/plugin-search/react';
import { ThumbnailPluginPackage } from '@embedpdf/plugin-thumbnail/react';
import { RotatePluginPackage, Rotate } from '@embedpdf/plugin-rotate/react';
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark';
import { PrintPluginPackage } from '@embedpdf/plugin-print/react';
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationLayer, AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { PdfAnnotationSubtype } from '@embedpdf/models';
import { RedactionPluginPackage, RedactionLayer } from '@embedpdf/plugin-redaction/react';
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
import { SignatureAPIBridge } from '@app/components/viewer/SignatureAPIBridge';
import { AnnotationAPIBridge } from '@app/components/viewer/AnnotationAPIBridge';
import { HistoryAPIBridge } from '@app/components/viewer/HistoryAPIBridge';
import type { SignatureAPI, AnnotationAPI, HistoryAPI } from '@app/components/viewer/viewerTypes';
import { ExportAPIBridge } from '@app/components/viewer/ExportAPIBridge';
import { BookmarkAPIBridge } from '@app/components/viewer/BookmarkAPIBridge';
import { PrintAPIBridge } from '@app/components/viewer/PrintAPIBridge';
import { isPdfFile } from '@app/utils/fileUtils';
import { useTranslation } from 'react-i18next';
import { LinkLayer } from '@app/components/viewer/LinkLayer';
import { RedactionSelectionMenu } from '@app/components/viewer/RedactionSelectionMenu';
import { RedactionPendingTracker, RedactionPendingTrackerAPI } from '@app/components/viewer/RedactionPendingTracker';
import { RedactionAPIBridge } from '@app/components/viewer/RedactionAPIBridge';
import { absoluteWithBasePath } from '@app/constants/app';

interface LocalEmbedPDFProps {
  file?: File | Blob;
  url?: string | null;
  enableAnnotations?: boolean;
  enableRedaction?: boolean;
  isManualRedactionMode?: boolean;
  showBakedAnnotations?: boolean;
  onSignatureAdded?: (annotation: any) => void;
  signatureApiRef?: React.RefObject<SignatureAPI>;
  annotationApiRef?: React.RefObject<AnnotationAPI>;
  historyApiRef?: React.RefObject<HistoryAPI>;
  redactionTrackerRef?: React.RefObject<RedactionPendingTrackerAPI>;
}

export function LocalEmbedPDF({ file, url, enableAnnotations = false, enableRedaction = false, isManualRedactionMode = false, showBakedAnnotations = true, onSignatureAdded, signatureApiRef, annotationApiRef, historyApiRef, redactionTrackerRef }: LocalEmbedPDFProps) {
  const { t } = useTranslation();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [, setAnnotations] = useState<Array<{id: string, pageIndex: number, rect: any}>>([]);

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

  // Create plugins configuration
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
            id: 'stirling-pdf-viewer',
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
      createPluginRegistration(RenderPluginPackage, {
        withForms: true,
        withAnnotations: showBakedAnnotations && !enableAnnotations, // Show baked annotations only when: visibility is ON and annotation layer is OFF
      }),

      // Register interaction manager (required for zoom and selection features)
      createPluginRegistration(InteractionManagerPluginPackage),

      // Register selection plugin (depends on InteractionManager)
      createPluginRegistration(SelectionPluginPackage),

      // Register history plugin for undo/redo (recommended for annotations)
      // Always register for reading existing annotations
      createPluginRegistration(HistoryPluginPackage),

      // Register annotation plugin (depends on InteractionManager, Selection, History)
      // Always register for reading existing annotations like links
      createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: 'Digital Signature',
        autoCommit: true,
        deactivateToolAfterCreate: false,
        selectAfterCreate: true,
      }),

      // Register redaction plugin (depends on InteractionManager, Selection, History)
      // Always register for redaction functionality
      createPluginRegistration(RedactionPluginPackage),

      // Register pan plugin (depends on Viewport, InteractionManager)
      createPluginRegistration(PanPluginPackage, {
        defaultMode: 'mobile', // Try mobile mode which might be more permissive
      }),
      // Register pan plugin (depends on Viewport, InteractionManager) - keep disabled to prevent drag panning
      createPluginRegistration(PanPluginPackage, {}),

      // Register zoom plugin with configuration
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth, // Start with FitWidth, will be adjusted in ZoomAPIBridge
        minZoom: 0.2,
        maxZoom: 5.0,
      }),

      // Register tiling plugin (depends on Render, Scroll, Viewport)
      createPluginRegistration(TilingPluginPackage, {
        tileSize: 768,
        overlapPx: 5,
        extraRings: 1,
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

      // Register rotate plugin
      createPluginRegistration(RotatePluginPackage),

      // Register export plugin for downloading PDFs
      createPluginRegistration(ExportPluginPackage, {
        defaultFileName: 'document.pdf',
      }),

      // Register print plugin for printing PDFs
      createPluginRegistration(PrintPluginPackage),
    ];
  }, [pdfUrl, enableAnnotations, showBakedAnnotations]);

  // Initialize the engine with the React hook - use local WASM for offline support
  const { engine, isLoading, error } = usePdfiumEngine({
    wasmUrl: absoluteWithBasePath('/pdfium/pdfium.wasm'),
  });


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

  // Check if the file is actually a PDF
  if (file && !isPdfFile(file)) {
    const fileName = 'name' in file ? file.name : t('viewer.unknownFile');
    return (
      <Center h="100%" w="100%">
        <Stack align="center" gap="md">
          <div style={{ fontSize: '48px' }}>📄</div>
          <Text size="lg" fw={600} c="dimmed">
            {t('viewer.cannotPreviewFile')}
          </Text>
          <Text c="dimmed" size="sm" style={{ textAlign: 'center', maxWidth: '400px' }}>
            {t('viewer.onlyPdfSupported')}
          </Text>
          <PrivateContent>
            <Text c="dimmed" size="xs" style={{ fontFamily: 'monospace' }}>
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
          <div style={{ fontSize: '24px' }}>❌</div>
          <Text c="red" size="sm" style={{ textAlign: 'center' }}>
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
          height: '100%',
          width: '100%',
          position: 'relative',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
      }}>
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={async (registry) => {
          const annotationPlugin = registry.getPlugin('annotation');
          if (!annotationPlugin || !annotationPlugin.provides) return;

          const annotationApi = annotationPlugin.provides();
          if (!annotationApi) return;

          if (enableAnnotations) {
            const ensureTool = (tool: any) => {
              const existing = annotationApi.getTool?.(tool.id);
              if (!existing) {
                annotationApi.addTool(tool);
              }
            };

            ensureTool({
              id: 'highlight',
              name: 'Highlight',
              interaction: { exclusive: true, cursor: 'text', textSelection: true },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.HIGHLIGHT ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.HIGHLIGHT,
                color: '#ffd54f',
                opacity: 0.6,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'underline',
              name: 'Underline',
              interaction: { exclusive: true, cursor: 'text', textSelection: true },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.UNDERLINE ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.UNDERLINE,
                color: '#ffb300',
                opacity: 1,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'strikeout',
              name: 'Strikeout',
              interaction: { exclusive: true, cursor: 'text', textSelection: true },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.STRIKEOUT ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.STRIKEOUT,
                color: '#e53935',
                opacity: 1,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'squiggly',
              name: 'Squiggly',
              interaction: { exclusive: true, cursor: 'text', textSelection: true },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.SQUIGGLY ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.SQUIGGLY,
                color: '#00acc1',
                opacity: 1,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'ink',
              name: 'Pen',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.INK ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.INK,
                color: '#1f2933',
                opacity: 1,
                borderWidth: 2,
                lineWidth: 2,
                strokeWidth: 2,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'inkHighlighter',
              name: 'Ink Highlighter',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.INK && annotation.color === '#ffd54f' ? 8 : 0),
              defaults: {
                type: PdfAnnotationSubtype.INK,
                color: '#ffd54f',
                opacity: 0.5,
                borderWidth: 6,
                lineWidth: 6,
                strokeWidth: 6,
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'square',
              name: 'Square',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.SQUARE ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.SQUARE,
                color: '#0000ff', // fill color (blue)
                strokeColor: '#cf5b5b', // border color (reddish pink)
                opacity: 0.5,
                borderWidth: 1,
                strokeWidth: 1,
                lineWidth: 1,
              },
              clickBehavior: {
                enabled: true,
                defaultSize: { width: 120, height: 90 },
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'circle',
              name: 'Circle',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.CIRCLE ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.CIRCLE,
                color: '#0000ff', // fill color (blue)
                strokeColor: '#cf5b5b', // border color (reddish pink)
                opacity: 0.5,
                borderWidth: 1,
                strokeWidth: 1,
                lineWidth: 1,
              },
              clickBehavior: {
                enabled: true,
                defaultSize: { width: 100, height: 100 },
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'line',
              name: 'Line',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.LINE ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.LINE,
                color: '#1565c0',
                opacity: 1,
                borderWidth: 2,
                strokeWidth: 2,
                lineWidth: 2,
              },
              clickBehavior: {
                enabled: true,
                defaultLength: 120,
                defaultAngle: 0,
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'lineArrow',
              name: 'Arrow',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.LINE && (annotation.endStyle === 'ClosedArrow' || annotation.lineEndingStyles?.end === 'ClosedArrow') ? 9 : 0),
              defaults: {
                type: PdfAnnotationSubtype.LINE,
                color: '#1565c0',
                opacity: 1,
                borderWidth: 2,
                startStyle: 'None',
                endStyle: 'ClosedArrow',
                lineEndingStyles: { start: 'None', end: 'ClosedArrow' },
              },
              clickBehavior: {
                enabled: true,
                defaultLength: 120,
                defaultAngle: 0,
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'polyline',
              name: 'Polyline',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.POLYLINE ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.POLYLINE,
                color: '#1565c0',
                opacity: 1,
                borderWidth: 2,
              },
              clickBehavior: {
                enabled: true,
                finishOnDoubleClick: true,
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'polygon',
              name: 'Polygon',
              interaction: { exclusive: true, cursor: 'crosshair' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.POLYGON ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.POLYGON,
                color: '#0000ff', // fill color (blue)
                strokeColor: '#cf5b5b', // border color (reddish pink)
                opacity: 0.5,
                borderWidth: 1,
              },
              clickBehavior: {
                enabled: true,
                finishOnDoubleClick: true,
                defaultSize: { width: 140, height: 100 },
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'text',
              name: 'Text',
              interaction: { exclusive: true, cursor: 'text' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.FREETEXT ? 10 : 0),
              defaults: {
                type: PdfAnnotationSubtype.FREETEXT,
                textColor: '#111111',
                fontSize: 14,
                fontFamily: 'Helvetica',
                opacity: 1,
                interiorColor: '#fffef7',
                contents: 'Text',
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'note',
              name: 'Note',
              interaction: { exclusive: true, cursor: 'pointer' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.FREETEXT ? 8 : 0),
              defaults: {
                type: PdfAnnotationSubtype.FREETEXT,
                textColor: '#1b1b1b',
                color: '#ffa000',
                interiorColor: '#fff8e1',
                opacity: 1,
                contents: 'Note',
                fontSize: 12,
              },
              clickBehavior: {
                enabled: true,
                defaultSize: { width: 160, height: 100 },
              },
              behavior: {
                deactivateToolAfterCreate: false,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'stamp',
              name: 'Image Stamp',
              interaction: { exclusive: false, cursor: 'copy' },
              matchScore: (annotation: any) => (annotation.type === PdfAnnotationSubtype.STAMP ? 5 : 0),
              defaults: {
                type: PdfAnnotationSubtype.STAMP,
              },
              behavior: {
                deactivateToolAfterCreate: true,
                selectAfterCreate: true,
              },
            });

            ensureTool({
              id: 'signatureStamp',
              name: 'Digital Signature',
              interaction: { exclusive: false, cursor: 'copy' },
              matchScore: () => 0,
              defaults: {
                type: PdfAnnotationSubtype.STAMP,
              },
            });

            ensureTool({
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

            annotationApi.onAnnotationEvent((event: any) => {
              if (event.type === 'create' && event.committed) {
                setAnnotations(prev => [...prev, {
                  id: event.annotation.id,
                  pageIndex: event.pageIndex,
                  rect: event.annotation.rect
                }]);


                if (onSignatureAdded) {
                  onSignatureAdded(event.annotation);
                }
              } else if (event.type === 'delete' && event.committed) {
                setAnnotations(prev => prev.filter(ann => ann.id !== event.annotation.id));
              } else if (event.type === 'loaded') {
                const loadedAnnotations = event.annotations || [];
                setAnnotations(loadedAnnotations.map((ann: any) => ({
                  id: ann.id,
                  pageIndex: ann.pageIndex || 0,
                  rect: ann.rect
                })));
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
        {(enableAnnotations || enableRedaction || isManualRedactionMode) && <HistoryAPIBridge ref={historyApiRef} />}
        {/* Always render RedactionAPIBridge when in manual redaction mode so buttons can switch from annotation mode */}
        {(enableRedaction || isManualRedactionMode) && <RedactionAPIBridge />}
        {/* Always render SignatureAPIBridge so annotation tools (draw) can be activated even when starting in redaction mode */}
        {(enableAnnotations || enableRedaction || isManualRedactionMode) && <SignatureAPIBridge ref={signatureApiRef} />}
        {(enableRedaction || isManualRedactionMode) && <RedactionPendingTracker ref={redactionTrackerRef} />}
        {enableAnnotations && <AnnotationAPIBridge ref={annotationApiRef} />}
        
        <ExportAPIBridge />
        <BookmarkAPIBridge />
        <PrintAPIBridge />
        <GlobalPointerProvider>
          <Viewport
            style={{
              backgroundColor: 'var(--bg-background)',
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
            renderPage={({ document, width, height, pageIndex, scale, rotation }) => {
              return (
                <Rotate key={document?.id} pageSize={{ width, height }}>
                  <PagePointerProvider pageIndex={pageIndex} pageWidth={width} pageHeight={height} scale={scale} rotation={rotation}>
                    <div
                      data-page-index={pageIndex}
                      data-page-width={width}
                      data-page-height={height}
                      style={{
                        width,
                        height,
                        position: 'relative',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
                      }}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onDrop={(e) => e.preventDefault()}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      {/* High-resolution tile layer */}
                      <TilingLayer pageIndex={pageIndex} scale={scale} />

                      {/* Search highlight layer */}
                      <CustomSearchLayer pageIndex={pageIndex} scale={scale} />

                      {/* Selection layer for text interaction */}
                      <SelectionLayer pageIndex={pageIndex} scale={scale} />

                      {/* Link layer for clickable PDF links */}
                      <LinkLayer pageIndex={pageIndex} scale={scale} document={document} pdfFile={file} />

                      {/* Annotation layer for signatures (only when enabled) */}
                      {enableAnnotations && (
                        <AnnotationLayer
                          pageIndex={pageIndex}
                          scale={scale}
                          pageWidth={width}
                          pageHeight={height}
                          rotation={rotation}
                          selectionOutlineColor="#007ACC"
                        />
                      )}

                      {/* Redaction layer for marking areas to redact (only when enabled) */}
                      {enableRedaction && (
                        <RedactionLayer
                          pageIndex={pageIndex}
                          scale={scale}
                          rotation={rotation}
                          selectionMenu={(props) => <RedactionSelectionMenu {...props} />}
                        />
                      )}
                    </div>
                  </PagePointerProvider>
                </Rotate>
              );
            }}
          />
          </Viewport>
        </GlobalPointerProvider>
      </EmbedPDF>
      </div>
    </PrivateContent>
  );
}
