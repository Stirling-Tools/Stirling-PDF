import { useEffect } from "react";
import { useRegistry } from "@embedpdf/core/react";
import { useRenderCapability } from "@embedpdf/plugin-render/react";
import type { RenderCapability } from "@embedpdf/plugin-render";
import { useThumbnailCapability } from "@embedpdf/plugin-thumbnail/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";

// Matches the thumbnail plugin's default width; LocalEmbedPDF registers it without config.
const THUMB_WIDTH = 150;

type ThumbTask = ReturnType<RenderCapability["renderPageRect"]>;

/**
 * ThumbnailAPIBridge - Updated for embedPDF v2.6.0
 * Provides thumbnail generation functionality.
 */
export function ThumbnailAPIBridge() {
  const { provides: thumbnail } = useThumbnailCapability();
  const { provides: render } = useRenderCapability();
  const { registry } = useRegistry();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();
  // A swapped-in version gets a new id; re-registering makes the sidebar regenerate.
  const activeDocumentId = useActiveDocumentId();

  useEffect(() => {
    if (thumbnail && render && registry && documentReady) {
      // Shares an in-flight render per page, like the plugin's own task cache.
      const pending = new Map<string, ThumbTask>();
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
            const key = `${documentId}:${pageIndex}:${dpr}`;
            const existing = pending.get(key);
            if (existing) return existing;
            const task = render.forDocument(documentId).renderPageRect({
              pageIndex,
              rect: { origin: { x: 0, y: 0 }, size: page.size },
              options: {
                scaleFactor: THUMB_WIDTH / page.size.width,
                dpr,
                rotation: page.rotation,
                withForms: true,
              },
            });
            pending.set(key, task);
            const settle = () => pending.delete(key);
            task.wait(settle, settle);
            return task;
          },
        },
      });
    }

    return () => {
      registerBridge("thumbnail", null);
    };
  }, [
    thumbnail,
    render,
    registry,
    documentReady,
    activeDocumentId,
    registerBridge,
  ]);

  return null;
}
