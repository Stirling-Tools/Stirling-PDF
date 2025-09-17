import React, { useEffect, useMemo, useState } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

// Import the essential plugins
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
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
import { CustomSearchLayer } from './CustomSearchLayer';
import { ZoomAPIBridge } from './ZoomAPIBridge';
import { ScrollAPIBridge } from './ScrollAPIBridge';
import { SelectionAPIBridge } from './SelectionAPIBridge';
import { PanAPIBridge } from './PanAPIBridge';
import { SpreadAPIBridge } from './SpreadAPIBridge';
import { SearchAPIBridge } from './SearchAPIBridge';
import { ThumbnailAPIBridge } from './ThumbnailAPIBridge';
import { RotateAPIBridge } from './RotateAPIBridge';

interface LocalEmbedPDFProps {
  file?: File | Blob;
  url?: string | null;
  colorScheme?: 'light' | 'dark' | 'auto'; // Optional since we use CSS variables
}

export function LocalEmbedPDF({ file, url }: LocalEmbedPDFProps) {
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

  // Create plugins configuration
  const plugins = useMemo(() => {
    if (!pdfUrl) return [];

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
        viewportGap: 10,
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
      createPluginRegistration(RotatePluginPackage, {
        defaultRotation: Rotation.Degree0, // Start with no rotation
      }),
    ];
  }, [pdfUrl]);

  // Initialize the engine with the React hook
  const { engine, isLoading, error } = usePdfiumEngine();


  // Early return if no file or URL provided
  if (!file && !url) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        background: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>📄</div>
          <div>No PDF provided</div>
        </div>
      </div>
    );
  }

  if (isLoading || !engine || !pdfUrl) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        background: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>⏳</div>
          <div>Loading PDF Engine...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        background: 'var(--bg-surface)',
        color: 'var(--color-red-500)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '16px' }}>❌</div>
          <div>Error loading PDF engine: {error.message}</div>
        </div>
      </div>
    );
  }

  // Wrap your UI with the <EmbedPDF> provider
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
      <EmbedPDF engine={engine} plugins={plugins}>
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
            renderPage={({ width, height, pageIndex, scale, rotation }: { width: number; height: number; pageIndex: number; scale: number; rotation?: number }) => (
              <Rotate pageSize={{ width, height }}>
                <PagePointerProvider {...{ pageWidth: width, pageHeight: height, pageIndex, scale, rotation: rotation || 0 }}>
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
                    {/* High-resolution tile layer */}
                    <TilingLayer pageIndex={pageIndex} scale={scale} />

                    {/* Search highlight layer */}
                    <CustomSearchLayer pageIndex={pageIndex} scale={scale} />

                    {/* Selection layer for text interaction */}
                    <SelectionLayer pageIndex={pageIndex} scale={scale} />
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
}
