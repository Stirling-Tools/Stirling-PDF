import { useEffect, useImperativeHandle } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { useRedaction } from '@app/contexts/RedactionContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export function RedactionAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }
  
  return <RedactionAPIBridgeInner documentId={activeDocumentId} />;
}

function RedactionAPIBridgeInner({ documentId }: { documentId: string }) {
  const { state, provides } = useEmbedPdfRedaction(documentId);
  const { 
    redactionApiRef, 
    setPendingCount, 
    setActiveType, 
    setIsRedacting,
    setRedactionsApplied,
    setBridgeReady
  } = useRedaction();

  // Mark bridge as ready on mount, not ready on unmount
  useEffect(() => {
    setBridgeReady(true);
    return () => {
      setBridgeReady(false);
    };
  }, [setBridgeReady]);

  // Sync EmbedPDF state to our context
  useEffect(() => {
    if (state) {
      setPendingCount(state.pendingCount ?? 0);
      setActiveType(state.activeType ?? null);
      setIsRedacting(state.isRedacting ?? false);
    }
  }, [state?.pendingCount, state?.activeType, state?.isRedacting, setPendingCount, setActiveType, setIsRedacting]);

  // Expose the EmbedPDF API through our context's ref
  useImperativeHandle(redactionApiRef, () => ({
    toggleRedactSelection: () => {
      provides?.toggleRedactSelection();
    },
    toggleMarqueeRedact: () => {
      provides?.toggleMarqueeRedact();
    },
    commitAllPending: () => {
      provides?.commitAllPending();
      // Don't set redactionsApplied here - it should only be set after the file is saved
      // The save operation in applyChanges will handle setting/clearing this flag
    },
    getActiveType: () => state?.activeType ?? null,
    getPendingCount: () => state?.pendingCount ?? 0,
  }), [provides, state, setRedactionsApplied]);

  return null;
}

