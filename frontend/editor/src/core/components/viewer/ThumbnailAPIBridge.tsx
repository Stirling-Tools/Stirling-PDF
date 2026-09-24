import { useEffect } from "react";
import { useThumbnailCapability } from "@embedpdf/plugin-thumbnail/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";
import {
  beginViewerFileOpen,
  blobToDataUrl,
  registerEngineThumbnailRenderer,
  resolveViewerFileOpen,
  unregisterEngineThumbnailRenderer,
} from "@app/services/engineThumbnail";
import type { FileId } from "@app/types/file";

interface ThumbnailAPIBridgeProps {
  fileId?: FileId;
}

/**
 * ThumbnailAPIBridge - Updated for embedPDF v2.6.0
 * Provides thumbnail generation functionality.
 */
export function ThumbnailAPIBridge({ fileId }: ThumbnailAPIBridgeProps) {
  const { provides: thumbnail } = useThumbnailCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();
  const activeDocumentId = useActiveDocumentId();

  useEffect(() => {
    if (thumbnail && documentReady) {
      registerBridge("thumbnail", {
        state: null, // No state - just provides API
        api: thumbnail,
      });
    }

    return () => {
      registerBridge("thumbnail", null);
    };
  }, [thumbnail, documentReady, registerBridge]);

  // Page 1 of the open document, rendered in the worker, so the file list can
  // show a thumbnail without any main-thread parse of the file.
  useEffect(() => {
    if (!fileId) return;
    beginViewerFileOpen(fileId);
    if (thumbnail && documentReady && activeDocumentId) {
      resolveViewerFileOpen(fileId, activeDocumentId);
      registerEngineThumbnailRenderer(activeDocumentId, async () => {
        const blob = await thumbnail.renderThumb(0, 1.0).toPromise();
        return blobToDataUrl(blob);
      });
    }
    return () => {
      resolveViewerFileOpen(fileId, null);
      if (activeDocumentId) unregisterEngineThumbnailRenderer(activeDocumentId);
    };
  }, [thumbnail, documentReady, activeDocumentId, fileId]);

  return null;
}
