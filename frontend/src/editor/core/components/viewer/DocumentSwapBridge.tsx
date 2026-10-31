import { useEffect, useRef } from "react";
import { useDocumentManagerCapability } from "@embedpdf/plugin-document-manager/react";

interface PendingDocument {
  buffer: ArrayBuffer;
  name: string;
  fileKey: string;
  password?: string;
  honorOwnerPasswords?: boolean;
}

interface DocumentSwapBridgeProps {
  pending: PendingDocument | null;
  onSwapped: (documentId: string, fileKey: string) => void;
  onFailed: (fileKey: string, error: unknown) => void;
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
  const pendingRef = useRef(pending);

  useEffect(() => {
    const generation = ++generationRef.current;
    pendingRef.current = documentManager ? pending : null;
    if (!documentManager || !pending) return;
    let cancelled = false;
    let settled = false;
    const fail = (error: unknown) => {
      settled = true;
      onFailed(pending.fileKey, error);
    };
    const previousId = documentManager.getActiveDocumentId();

    void Promise.resolve()
      .then(() =>
        documentManager
          .openDocumentBuffer({
            buffer: pending.buffer,
            name: pending.name,
            password: pending.password,
            permissions: {
              enforceDocumentPermissions: pending.honorOwnerPasswords !== false,
            },
            autoActivate: false,
          })
          .toPromise(),
      )
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
          if (!cancelled) fail(error);
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
          settled = true;
          onSwapped(response.documentId, pending.fileKey);
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
          if (!cancelled) fail(error);
        }
      })
      .catch((error) => {
        // A superseded open rejecting must not clear the newer pending
        // document its replacement already queued.
        if (!cancelled && generation === generationRef.current) fail(error);
      });

    return () => {
      cancelled = true;
      // A StrictMode replay or callback change restarts the same load. Only
      // report cancellation when no replacement attempt owns that request.
      queueMicrotask(() => {
        if (
          !settled &&
          (generationRef.current === generation ||
            pendingRef.current !== pending)
        ) {
          fail(new Error("The document load was cancelled."));
        }
      });
    };
  }, [documentManager, pending, onSwapped, onFailed]);

  return null;
}
