import { useState, useEffect } from 'react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';

/**
 * useDocumentReady - Custom hook to track whether a PDF document is fully loaded
 * and ready for interaction.
 *
 * Subscribes to both onDocumentOpened (sets true) and onDocumentClosed (resets
 * to false) so the flag correctly tracks the document lifecycle across
 * open → close → reopen transitions.
 *
 * The initial check is synchronous (getActiveDocument is sync) — no debounce
 * needed.
 */
export function useDocumentReady() {
  const { provides: documentManagerCapability } = useDocumentManagerCapability();
  const [documentReady, setDocumentReady] = useState(false);

  useEffect(() => {
    if (!documentManagerCapability) {
      setDocumentReady(false);
      return;
    }

    let mounted = true;

    const unsubOpen = documentManagerCapability.onDocumentOpened?.((event: any) => {
      if (mounted && (event?.documentId || event?.id)) {
        setDocumentReady(true);
      }
    });

    const unsubClose = documentManagerCapability.onDocumentClosed?.(() => {
      if (!mounted) return;

      try {
        const remaining = documentManagerCapability.getActiveDocument?.();
        if (!remaining?.id && mounted) {
          setDocumentReady(false);
        }
      } catch {
        if (mounted) setDocumentReady(false);
      }
    });

    try {
      const activeDoc = documentManagerCapability.getActiveDocument?.();
      if (mounted) {
        setDocumentReady(!!activeDoc?.id);
      }
    } catch {
      if (mounted) setDocumentReady(false);
    }

    return () => {
      mounted = false;
      if (typeof unsubOpen === 'function') {
        unsubOpen();
      }
      if (typeof unsubClose === 'function') {
        unsubClose();
      }
    };
  }, [documentManagerCapability]);

  return documentReady;
}
