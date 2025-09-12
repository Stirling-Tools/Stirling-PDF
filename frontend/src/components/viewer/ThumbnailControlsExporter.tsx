import { useEffect } from 'react';
import { useThumbnailCapability } from '@embedpdf/plugin-thumbnail/react';

/**
 * Component that runs inside EmbedPDF context and exports thumbnail controls globally
 */
export function ThumbnailControlsExporter() {
  const { provides: thumbnail } = useThumbnailCapability();

  useEffect(() => {
    console.log('📄 ThumbnailControlsExporter useEffect:', { thumbnail: !!thumbnail });
    if (thumbnail) {
      console.log('📄 Exporting thumbnail controls to window:', {
        availableMethods: Object.keys(thumbnail),
        renderThumb: typeof thumbnail.renderThumb
      });
      // Export thumbnail controls to global window for debugging
      (window as any).embedPdfThumbnail = {
        thumbnailAPI: thumbnail,
        availableMethods: Object.keys(thumbnail),
      };
    }
  }, [thumbnail]);

  return null; // This component doesn't render anything
}