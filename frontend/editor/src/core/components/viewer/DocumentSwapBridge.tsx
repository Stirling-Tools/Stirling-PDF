import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";
import { toEngineDocumentBuffer } from "@app/utils/engineDocumentSource";

interface PendingDocument {
  /** Blob sources stream in the worker; ArrayBuffer sources (URL documents)
   *  are still copied there. */
  source: Blob | ArrayBuffer;
  name: string;
}

interface DocumentSwapBridgeProps {
  pending: PendingDocument | null;
  onSwapped: () => void;
  onFailed: (error: unknown) => void;
}

/** Activates replacement bytes once loaded, so the mounted document keeps
 *  rendering through the swap; activate before closing, or the manager
 *  promotes whatever is left. A superseded open is closed without being shown. */
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
        buffer: toEngineDocumentBuffer(pending.source),
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
      .catch((error) => {
        // A superseded open rejecting must not clear the newer pending
        // document its replacement already queued.
        if (!cancelled && generation === generationRef.current) onFailed(error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentManager, pending, onSwapped, onFailed]);

  return null;
}
