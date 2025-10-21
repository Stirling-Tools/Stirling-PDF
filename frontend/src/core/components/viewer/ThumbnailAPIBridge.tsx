import { useEffect } from 'react';
import { useThumbnailCapability } from '@embedpdf/plugin-thumbnail/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * ThumbnailAPIBridge provides thumbnail generation functionality.
 * Exposes thumbnail API to UI components without managing state.
 */
export function ThumbnailAPIBridge() {
  const { provides: thumbnail } = useThumbnailCapability();
  const { registerBridge } = useViewer();

  useEffect(() => {
    if (thumbnail) {
      registerBridge('thumbnail', {
        state: null, // No state - just provides API
        api: thumbnail
      });
    }
  }, [thumbnail]);

  return null;
}
