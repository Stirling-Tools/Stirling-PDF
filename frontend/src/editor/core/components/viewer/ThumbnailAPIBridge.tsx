import { useEffect } from "react";
import { useRegistry } from "@embedpdf/core/react";
import { useRenderCapability } from "@embedpdf/plugin-render/react";
import { useThumbnailCapability } from "@embedpdf/plugin-thumbnail/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";

/**
 * ThumbnailAPIBridge - Updated for embedPDF v2.6.0
 * Provides thumbnail generation functionality.
 */
// Matches the thumbnail plugin's default width; LocalEmbedPDF registers it without config.
const THUMB_WIDTH = 120;

export function ThumbnailAPIBridge() {
  const { provides: thumbnail } = useThumbnailCapability();
  const { provides: render } = useRenderCapability();
  const { registry } = useRegistry();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  useEffect(() => {
    if (thumbnail && render && registry && documentReady) {
      registerBridge("thumbnail", {
        state: null, // No state - just provides API
        api: {
          ...thumbnail,
          // Thumbnails have no form overlay, so always bake field values in.
          renderThumb: (pageIndex: number, dpr: number) => {
            const core = registry.getStore().getState().core;
            const documentId = core.activeDocumentId ?? "";
            const page = core.documents[documentId]?.document?.pages[pageIndex];
            if (!page) return thumbnail.renderThumb(pageIndex, dpr);
            return render.forDocument(documentId).renderPageRect({
              pageIndex,
              rect: { origin: { x: 0, y: 0 }, size: page.size },
              options: {
                scaleFactor: THUMB_WIDTH / page.size.width,
                dpr,
                rotation: page.rotation,
                withForms: true,
              },
            });
          },
        },
      });
    }

    return () => {
      registerBridge("thumbnail", null);
    };
  }, [thumbnail, render, registry, documentReady, registerBridge]);

  return null;
}
