import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import { useZoomCapability, ZoomMode } from "@embedpdf/plugin-zoom/react";
import { useSpreadCapability, SpreadMode } from "@embedpdf/plugin-spread/react";

interface PendingDocument {
  buffer: ArrayBuffer;
  name: string;
}

interface DocumentSwapBridgeProps {
  pending: PendingDocument | null;
  onSwapped: () => void;
  onFailed: (error: unknown) => void;
}

/**
 * Opens replacement bytes as a background document and activates them only
 * once they are ready, so the mounted document keeps rendering through the
 * swap instead of blanking while the new one loads.
 *
 * Order matters: activate the replacement before closing the outgoing
 * document, otherwise the document manager promotes whatever is left. A
 * superseded open is closed without ever being activated.
 */
export function DocumentSwapBridge({
  pending,
  onSwapped,
  onFailed,
}: DocumentSwapBridgeProps) {
  const { provides: documentManager } = useDocumentManagerCapability();
  const { provides: zoomCapability } = useZoomCapability();
  const { provides: spreadCapability } = useSpreadCapability();
  const generationRef = useRef(0);

  useEffect(() => {
    if (!documentManager || !pending) return;
    const generation = ++generationRef.current;
    let cancelled = false;
    const previousId = documentManager.getActiveDocumentId();

    const currentSpreadMode =
      previousId && spreadCapability
        ? spreadCapability.forDocument(previousId).getSpreadMode()
        : spreadCapability?.getSpreadMode();
    const currentZoomState =
      previousId && zoomCapability
        ? zoomCapability.forDocument(previousId).getState()
        : zoomCapability?.getState();
    const currentScale = currentZoomState?.currentZoomLevel;
    const currentZoomLevel = currentZoomState?.zoomLevel;

    void documentManager
      .openDocumentBuffer({
        buffer: pending.buffer,
        name: pending.name,
        autoActivate: false,
        scale:
          typeof currentScale === "number" && currentScale > 0
            ? currentScale
            : undefined,
      })
      .toPromise()
      .then(async (response) => {
        // The open task resolves with the loading task; the pages only render
        // once the engine reports the document loaded.
        try {
          await response.task.toPromise();
        } catch (error) {
          void documentManager
            .closeDocument(response.documentId)
            .toPromise()
            .catch(() => {});
          if (!cancelled) onFailed(error);
          return;
        }
        if (cancelled || generation !== generationRef.current) {
          // Superseded or unmounted: the background document is never shown.
          void documentManager
            .closeDocument(response.documentId)
            .toPromise()
            .catch(() => {});
          return;
        }

        try {
          if (
            currentSpreadMode &&
            currentSpreadMode !== SpreadMode.None &&
            spreadCapability
          ) {
            try {
              spreadCapability
                .forDocument(response.documentId)
                .setSpreadMode(currentSpreadMode);
            } catch {
              // Ignore if spread restore is unsupported or fails to apply.
            }
          }

          const targetZoom =
            currentZoomLevel === ZoomMode.FitWidth ||
            currentZoomLevel === ZoomMode.FitPage
              ? currentZoomLevel
              : typeof currentScale === "number" && currentScale > 0
                ? currentScale
                : currentZoomLevel;

          if (targetZoom !== undefined && zoomCapability) {
            try {
              zoomCapability
                .forDocument(response.documentId)
                .requestZoom(targetZoom);
            } catch {
              // Ignore if zoom restore is unsupported or fails to apply.
            }
          }

          documentManager.setActiveDocument(response.documentId);
          onSwapped();
          if (previousId && previousId !== response.documentId) {
            // A failed close only leaks a background document until unmount.
            void documentManager
              .closeDocument(previousId)
              .toPromise()
              .catch(() => {});
          }
        } catch (error) {
          if (previousId) {
            try {
              documentManager.setActiveDocument(previousId);
            } catch {
              // Ignore rollback failure if previous document was destroyed.
            }
          }
          void documentManager
            .closeDocument(response.documentId)
            .toPromise()
            .catch(() => {});
          if (!cancelled) onFailed(error);
        }
      })
      .catch(onFailed);

    return () => {
      cancelled = true;
    };
  }, [
    documentManager,
    zoomCapability,
    spreadCapability,
    pending,
    onSwapped,
    onFailed,
  ]);

  return null;
}
