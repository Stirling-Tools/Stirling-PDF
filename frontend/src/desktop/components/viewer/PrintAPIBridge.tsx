import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { usePrintCapability } from '@embedpdf/plugin-print/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';
import { printPdfNatively } from '@app/services/nativePrintService';

interface PrintAPIBridgeProps {
  file?: File | Blob;
  url?: string | null;
  fileName?: string;
}

function isMacDesktop() {
  return isTauri() && navigator.userAgent.includes('Macintosh');
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
              void printPdfNatively(file, url, fileName).catch((error) => {
                console.error('[Desktop Print] Native macOS PDF print failed, falling back to EmbedPDF print', error);
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
