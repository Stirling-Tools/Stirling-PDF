import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";

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
  const generationRef = useRef(0);

  useEffect(() => {
    if (!documentManager || !pending) return;
    const generation = ++generationRef.current;
    let cancelled = false;
    const previousId = documentManager.getActiveDocumentId();

    void documentManager
      .openDocumentBuffer({
        buffer: pending.buffer,
        name: pending.name,
        autoActivate: false,
      })
      .toPromise()
      .then(async (response) => {
        // The open task resolves with the loading task; the pages only render
        // once the engine reports the document loaded.
        try {
          await response.task.toPromise();
        } catch (error) {
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
        documentManager.setActiveDocument(response.documentId);
        onSwapped();
        if (previousId && previousId !== response.documentId) {
          // A failed close only leaks a background document until unmount.
          void documentManager
            .closeDocument(previousId)
            .toPromise()
            .catch(() => {});
        }
      })
      .catch(onFailed);

    return () => {
      cancelled = true;
    };
  }, [documentManager, pending, onSwapped, onFailed]);

  return null;
}
