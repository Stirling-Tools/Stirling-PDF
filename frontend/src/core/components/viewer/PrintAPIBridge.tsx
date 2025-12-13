import { useEffect } from 'react';
import { usePrintCapability } from '@embedpdf/plugin-print/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and exposes print API to ViewerContext
 */
export function PrintAPIBridge() {
  const { provides: print } = usePrintCapability();
  const { registerBridge } = useViewer();

  useEffect(() => {
    if (print) {
      // Register this bridge with ViewerContext
      registerBridge('print', {
        state: {},
        api: {
          print: () => print.print(),
        }
      });
    }
  }, [print, registerBridge]);

  return null;
}
