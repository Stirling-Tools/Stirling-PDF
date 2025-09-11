import React, { useEffect, useMemo, useState } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';

// Import the essential plugins
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { Scroller, ScrollPluginPackage, ScrollStrategy } from '@embedpdf/plugin-scroll/react';
import { LoaderPluginPackage } from '@embedpdf/plugin-loader/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { ZoomPluginPackage, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { InteractionManagerPluginPackage } from '@embedpdf/plugin-interaction-manager/react';
import { ZoomControlsExporter } from './ZoomControlsExporter';
import { ScrollControlsExporter } from './ScrollControlsExporter';

interface LocalEmbedPDFProps {
  file?: File | Blob;
  url?: string | null;
  colorScheme: 'light' | 'dark' | 'auto';
}

export function LocalEmbedPDF({ file, url, colorScheme }: LocalEmbedPDFProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  
  // Convert color scheme (handle 'auto' mode by defaulting to 'light')
  const actualColorScheme = colorScheme === 'auto' ? 'light' : colorScheme;

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
      
      // Register interaction manager (required for zoom features)
      createPluginRegistration(InteractionManagerPluginPackage),
      
      // Register zoom plugin with configuration
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitPage,
        minZoom: 0.2,
        maxZoom: 5.0,
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
        background: actualColorScheme === 'dark' ? '#1a1b1e' : '#f8f9fa',
        color: actualColorScheme === 'dark' ? '#ffffff' : '#666666',
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
        background: actualColorScheme === 'dark' ? '#1a1b1e' : '#f1f3f5',
        color: actualColorScheme === 'dark' ? '#ffffff' : '#666666',
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
        background: actualColorScheme === 'dark' ? '#1a1b1e' : '#f1f3f5',
        color: '#ff6b6b',
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
    <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <EmbedPDF engine={engine} plugins={plugins}>
        <ZoomControlsExporter />
        <ScrollControlsExporter />
        <Viewport
          style={{
            backgroundColor: actualColorScheme === 'dark' ? '#1a1b1e' : '#f1f3f5',
            height: '100%',
            width: '100%',
            overflow: 'auto',
          }}
        >
          <Scroller
            renderPage={({ width, height, pageIndex, scale }: { width: number; height: number; pageIndex: number; scale: number }) => (
              <div style={{ width, height }}>
                <RenderLayer pageIndex={pageIndex} scale={scale} />
              </div>
            )}
          />
        </Viewport>
      </EmbedPDF>
    </div>
  );
}