import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { ExportPluginPackage } from '@embedpdf/plugin-export/react';

// Import annotation plugins
import { HistoryPluginPackage } from '@embedpdf/plugin-history/react';
import { AnnotationLayer, AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react';
import { RedactionLayer, RedactionPluginPackage, useRedaction } from '@embedpdf/plugin-redaction/react';
import type { SelectionMenuProps } from '@embedpdf/plugin-redaction/react';
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
import { SignatureAPIBridge } from '@app/components/viewer/SignatureAPIBridge';
import { HistoryAPIBridge } from '@app/components/viewer/HistoryAPIBridge';
import type { SignatureAPI, HistoryAPI } from '@app/components/viewer/viewerTypes';
import { ExportAPIBridge } from '@app/components/viewer/ExportAPIBridge';
import { RedactionAPIBridge } from '@app/components/viewer/RedactionAPIBridge';

interface LocalEmbedPDFProps {
  file?: File | Blob;
  url?: string | null;
  enableAnnotations?: boolean;
  enableRedaction?: boolean;
  onSignatureAdded?: (annotation: any) => void;
  signatureApiRef?: React.RefObject<SignatureAPI>;
  historyApiRef?: React.RefObject<HistoryAPI>;
}

export function LocalEmbedPDF({ file, url, enableAnnotations = false, enableRedaction = false, onSignatureAdded, signatureApiRef, historyApiRef }: LocalEmbedPDFProps) {
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

    const base = [
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
      createPluginRegistration(RenderPluginPackage),

      // Register interaction manager (required for zoom and selection features)
      createPluginRegistration(InteractionManagerPluginPackage),

      // Register selection plugin (depends on InteractionManager)
      createPluginRegistration(SelectionPluginPackage),
      ...(enableAnnotations ? [createPluginRegistration(HistoryPluginPackage)] : []),
      ...(enableAnnotations ? [createPluginRegistration(AnnotationPluginPackage, {
        annotationAuthor: 'Digital Signature',
        autoCommit: true,
        deactivateToolAfterCreate: false,
        selectAfterCreate: true,
      })] : []),
      // Always register redaction plugin so hooks are available immediately
      createPluginRegistration(RedactionPluginPackage, { autoPreview: true }),

      // Register pan plugin (depends on Viewport, InteractionManager)
      createPluginRegistration(PanPluginPackage, {
        defaultMode: 'mobile', // Try mobile mode which might be more permissive
      }),

      // Register zoom plugin with configuration
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: 1.4, // Start at 140% zoom for better readability
        minZoom: 0.2,
        maxZoom: 3.0,
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

      // Register rotate plugin
      createPluginRegistration(RotatePluginPackage),

      // Register export plugin for downloading PDFs
      createPluginRegistration(ExportPluginPackage, {
        defaultFileName: 'document.pdf',
      }),
    ];

    return base;
  }, [pdfUrl, enableAnnotations, enableRedaction]);

  // Initialize the engine with the React hook
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

  // Wrap your UI with the <EmbedPDF> provider
  return (
    <div
      className='ph-no-capture'

      style={{
        height: '100%',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
    }}>
      <EmbedPDF
        engine={engine}
        plugins={plugins}
        onInitialized={enableAnnotations ? async (registry) => {
          const annotationPlugin = registry.getPlugin('annotation');
          if (!annotationPlugin || !annotationPlugin.provides) return;

          const annotationApi = annotationPlugin.provides();
          if (!annotationApi) return;

          // Add custom signature stamp tool for image signatures
          annotationApi.addTool({
            id: 'signatureStamp',
            name: 'Digital Signature',
            interaction: { exclusive: false, cursor: 'copy' },
            matchScore: () => 0,
            defaults: {
              type: PdfAnnotationSubtype.STAMP,
              // Image will be set dynamically when signature is created
            },
          });

          // Add custom ink signature tool for drawn signatures
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

          // Listen for annotation events to track annotations and notify parent
          annotationApi.onAnnotationEvent((event: any) => {
            if (event.type === 'create' && event.committed) {
              // Add to annotations list
              setAnnotations(prev => [...prev, {
                id: event.annotation.id,
                pageIndex: event.pageIndex,
                rect: event.annotation.rect
              }]);


              // Notify parent if callback provided
              if (onSignatureAdded) {
                onSignatureAdded(event.annotation);
              }
            } else if (event.type === 'delete' && event.committed) {
              // Remove from annotations list
              setAnnotations(prev => prev.filter(ann => ann.id !== event.annotation.id));
            } else if (event.type === 'loaded') {
              // Handle initial load of annotations
              const loadedAnnotations = event.annotations || [];
              setAnnotations(loadedAnnotations.map((ann: any) => ({
                id: ann.id,
                pageIndex: ann.pageIndex || 0,
                rect: ann.rect
              })));
            }
          });
        } : undefined}
      >
        <ZoomAPIBridge />
        <ScrollAPIBridge />
        <SelectionAPIBridge />
        <PanAPIBridge />
        <SpreadAPIBridge />
        <SearchAPIBridge />
        <ThumbnailAPIBridge />
        <RotateAPIBridge />
        {enableAnnotations && <SignatureAPIBridge ref={signatureApiRef} />}
        {enableAnnotations && <HistoryAPIBridge ref={historyApiRef} />}
        <ExportAPIBridge />
        {enableRedaction && <RedactionAPIBridge />}
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

                      {/* Selection layer for text interaction */
                      }
                      <SelectionLayer pageIndex={pageIndex} scale={scale} />
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
                      {enableRedaction && (
                        <RedactionLayer
                          pageIndex={pageIndex}
                          scale={scale}
                          rotation={rotation}
                          selectionMenu={(props: SelectionMenuProps) => <InlineRedactionMenu {...props} />}
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
  );
}

// Inline redaction menu displayed beneath selection/rectangle
function InlineRedactionMenu(
  { item, selected, menuWrapperProps, rect }: SelectionMenuProps & { rect?: any }
) {
  const { provides, state } = useRedaction() as any;
  const [lastAdded, setLastAdded] = useState<{ page: number; id: string } | null>(null);
  const isVisible = Boolean(selected || (lastAdded && lastAdded.page === item?.page && lastAdded.id === item?.id));

  // Try to auto-select or at least show the menu for the most recently created pending item
  useEffect(() => {
    if (!provides) return;
    let off: any;
    try {
      off = provides.onRedactionEvent?.((evt: any) => {
        const type = evt?.type || evt?.event || evt?.name;
        if (type && String(type).toLowerCase().includes('add')) {
          const page = evt?.page ?? evt?.item?.page;
          const id = evt?.id ?? evt?.item?.id;
          if (page != null && id != null) {
            setLastAdded({ page, id });
            // Clear after a short period so the menu doesn't linger forever
            setTimeout(() => setLastAdded(null), 2000);
          }
        }
      });
    } catch {}
    return () => { try { off?.(); } catch {} };
  }, [provides]);

  // Measure wrapper to portal the menu to the document body so clicks aren't intercepted
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [screenRect, setScreenRect] = useState<{ left: number; top: number; height: number } | null>(null);
  const mergeRef = useCallback((node: any) => {
    wrapperRef.current = node;
    try {
      const r = (menuWrapperProps as any)?.ref;
      if (typeof r === 'function') r(node);
      else if (r && typeof r === 'object') (r as any).current = node;
    } catch {}
  }, [menuWrapperProps]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rectEl = el.getBoundingClientRect();
    setScreenRect({ left: rectEl.left, top: rectEl.top, height: rectEl.height || ((rect as any)?.size?.height ?? 0) });
  }, [item?.id, item?.page, isVisible]);

  // Keep the inline menu positioned with the selection while scrolling/resizing
  useEffect(() => {
    if (!isVisible) return;
    const el = wrapperRef.current;
    if (!el) return;

    const update = () => {
      try {
        const r = el.getBoundingClientRect();
        setScreenRect({ left: r.left, top: r.top, height: r.height || ((rect as any)?.size?.height ?? 0) });
      } catch {}
    };

    const getScrollableAncestors = (node: HTMLElement | null) => {
      const list: (HTMLElement | Window)[] = [];
      let current: HTMLElement | null = node;
      while (current && current !== document.body && current !== document.documentElement) {
        const style = getComputedStyle(current);
        const overflowY = style.overflowY;
        const overflow = style.overflow;
        const isScrollable = /(auto|scroll|overlay)/.test(overflowY) || /(auto|scroll|overlay)/.test(overflow);
        if (isScrollable) list.push(current);
        current = current.parentElement as any;
      }
      list.push(window);
      return list;
    };

    const owners = getScrollableAncestors(el);
    owners.forEach(owner => {
      (owner as any).addEventListener?.('scroll', update, { passive: true });
    });
    window.addEventListener('resize', update, { passive: true });

    // Observe size/position changes of the wrapper itself
    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => update());
      resizeObserver.observe(el);
    }

    // Initial sync
    update();

    return () => {
      owners.forEach(owner => {
        (owner as any).removeEventListener?.('scroll', update);
      });
      window.removeEventListener('resize', update);
      try { resizeObserver?.disconnect(); } catch {}
    };
  }, [isVisible, item?.id, item?.page, rect]);

  const panel = (
    <div
      onPointerDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); }}
      onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); }}
      style={{
        position: 'fixed',
        left: (screenRect?.left ?? 0),
        top: (screenRect?.top ?? 0) + (screenRect?.height ?? 0) + 8,
        pointerEvents: 'auto',
        zIndex: 2147483647,
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', cursor: 'default' }}>
        <button style={{ padding: '4px 8px', background: '#e03131', color: 'white', borderRadius: 6, border: 'none' }} onClick={(e) => { e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); (provides?.commitAllPending?.() ?? provides?.commitPending?.(item.page, item.id)); }}>
          Apply
        </button>
        <button style={{ padding: '4px 8px', background: 'var(--bg-surface)', color: 'var(--text-default)', borderRadius: 6, border: '1px solid var(--border-default)' }} onClick={(e) => { e.stopPropagation(); (e as any).nativeEvent?.stopImmediatePropagation?.(); provides?.removePending?.(item.page, item.id); }}>
          Cancel
        </button>
      </div>
    </div>
  );

  const { ref: _ignoredRef, ...restWrapper } = (menuWrapperProps as any) || {};

  return (
    <>
      <div ref={mergeRef} {...restWrapper} />
      {isVisible && screenRect ? createPortal(panel, document.body) : null}
    </>
  );
}

