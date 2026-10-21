import { useEffect, useRef } from "react";
import { useThumbnailCapability } from "@embedpdf/plugin-thumbnail/react";
import { useRenderCapability } from "@embedpdf/plugin-render/react";
import { useDocumentState } from "@embedpdf/core/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";

/**
 * ThumbnailAPIBridge - Updated for embedPDF v2.6.0
 * Provides thumbnail generation functionality.
 *
 * Also exposes renderPreview: the thumbnail plugin hard-codes a 120px width,
 * which is too coarse for the Cut & Tile schematic. That path renders the same
 * page through the render capability at the caller's width instead.
 */
export function ThumbnailAPIBridge() {
  const { provides: thumbnail } = useThumbnailCapability();
  const { provides: render } = useRenderCapability();
  const activeDocumentId = useActiveDocumentId();
  const documentState = useDocumentState(activeDocumentId ?? "");
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();

  // Read the page geometry at call time instead of re-registering the bridge
  // on every document-state change (zoom, rotation, scroll all publish one).
  const documentStateRef = useRef(documentState);
  documentStateRef.current = documentState;

  useEffect(() => {
    if (thumbnail && documentReady) {
      registerBridge("thumbnail", {
        state: null, // No state - just provides API
        api: {
          ...thumbnail,
          renderPreview:
            render && activeDocumentId
              ? (pageIndex: number, targetWidth: number) => {
                  const page =
                    documentStateRef.current?.document?.pages?.[pageIndex];
                  if (!page?.size) {
                    throw new Error(
                      `Page ${pageIndex} has no size in document ${activeDocumentId}`,
                    );
                  }
                  return render
                    .forDocument(activeDocumentId)
                    .renderPageRect({
                      pageIndex,
                      rect: {
                        origin: { x: 0, y: 0 },
                        size: page.size,
                      },
                      options: {
                        scaleFactor: targetWidth / page.size.width,
                        dpr: 1,
                        rotation: page.rotation ?? 0,
                      },
                    });
                }
              : undefined,
        },
      });
    }

    return () => {
      registerBridge("thumbnail", null);
    };
  }, [thumbnail, render, activeDocumentId, documentReady, registerBridge]);

  return null;
}
