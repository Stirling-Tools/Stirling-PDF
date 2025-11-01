import { useEffect } from 'react';
import { useExportCapability } from '@embedpdf/plugin-export/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and provides export functionality
 */
export function ExportAPIBridge() {
  const { provides: exportApi } = useExportCapability();
  const { registerBridge } = useViewer();

  useEffect(() => {
    if (exportApi) {
      // Register this bridge with ViewerContext
      registerBridge('export', {
        state: {
          canExport: true,
        },
        api: exportApi
      });
    }
  }, [exportApi, registerBridge]);

  return null;
}