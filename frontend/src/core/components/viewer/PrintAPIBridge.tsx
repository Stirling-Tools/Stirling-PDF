import { useEffect } from 'react';
import { usePrintCapability } from '@embedpdf/plugin-print/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF print plugin to the shared ViewerContext.
 */
export function PrintAPIBridge() {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (print && documentReady) {
      // Register this bridge with ViewerContext
      registerBridge('print', {
        state: {},
        api: {
          print: () => print.print(),
        }
      });
    }

    return () => {
      registerBridge('print', null);
    };
  }, [print, documentReady, registerBridge]);

  return null;
}
