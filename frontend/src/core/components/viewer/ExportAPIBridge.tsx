import { useEffect } from 'react';
import { useExportCapability } from '@embedpdf/plugin-export/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Component that runs inside EmbedPDF context and provides export functionality
 */
export function ExportAPIBridge() {
  const { provides: exportApi } = useExportCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (exportApi && documentReady) {
      // Register this bridge with ViewerContext
      registerBridge('export', {
        state: {
          canExport: true,
        },
        api: exportApi
      });
    }

    return () => {
      registerBridge('export', null);
    };
  }, [exportApi, documentReady, registerBridge]);

  return null;
}
