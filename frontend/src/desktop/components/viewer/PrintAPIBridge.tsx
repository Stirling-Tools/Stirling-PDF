import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { usePrintCapability } from '@embedpdf/plugin-print/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

interface PrintAPIBridgeProps {
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
}

const PRINT_WINDOW_LABEL = 'desktop-pdf-print';

function isMacDesktop() {
  return isTauri() && navigator.userAgent.includes('Macintosh');
}

async function openPdfPrintWindow(file?: File | Blob, url?: string | null, fileName?: string) {
  let ownedUrl: string | null = null;
  const pdfUrl = file ? URL.createObjectURL(file) : url;

  if (!pdfUrl) {
    throw new Error('No PDF URL available for desktop print');
  }

  if (file) {
    ownedUrl = pdfUrl;
  }

  const helperUrl = `/desktop-pdf-print.html?pdf=${encodeURIComponent(pdfUrl)}&name=${encodeURIComponent(fileName || 'document.pdf')}`;
  const existingWindow = await WebviewWindow.getByLabel(PRINT_WINDOW_LABEL);
  if (existingWindow) {
    await existingWindow.close();
  }

  const printWindow = new WebviewWindow(PRINT_WINDOW_LABEL, {
    url: helperUrl,
    title: fileName || 'Print PDF',
    width: 960,
    height: 1200,
    center: true,
    focus: true,
  });

  const cleanup = () => {
    if (ownedUrl) {
      const urlToRevoke = ownedUrl;
      ownedUrl = null;
      window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 30000);
    }
  };

  void printWindow.once('tauri://error', (event) => {
    cleanup();
    console.error('[Desktop Print] Failed to create print window', event.payload);
  });

  void printWindow.once('tauri://created', () => {
    cleanup();
  });
}

export function PrintAPIBridge({ file, url, fileName }: PrintAPIBridgeProps) {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (documentReady) {
      registerBridge('print', {
        state: {},
        api: {
          print: () => {
            if (isMacDesktop()) {
              void openPdfPrintWindow(file, url, fileName).catch((error) => {
                console.error('[Desktop Print] Popup PDF print failed, falling back to EmbedPDF print', error);
                print?.print?.();
              });
              return;
            }

            print?.print?.();
          },
        }
      });
    }

    return () => {
      registerBridge('print', null);
    };
  }, [documentReady, file, fileName, print, registerBridge, url]);

  return null;
}
