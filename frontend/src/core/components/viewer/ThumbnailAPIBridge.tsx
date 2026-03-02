import { useEffect } from 'react';
import { useThumbnailCapability } from '@embedpdf/plugin-thumbnail/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * ThumbnailAPIBridge - Updated for embedPDF v2.6.0
 * Provides thumbnail generation functionality.
 */
export function ThumbnailAPIBridge() {
  const { provides: thumbnail } = useThumbnailCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (thumbnail && documentReady) {
      registerBridge('thumbnail', {
        state: null, // No state - just provides API
        api: thumbnail
      });
    }

    return () => {
      registerBridge('thumbnail', null);
    };
  }, [thumbnail, documentReady, registerBridge]);

  return null;
}
