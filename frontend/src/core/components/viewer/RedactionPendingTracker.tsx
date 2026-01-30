import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export interface RedactionPendingTrackerAPI {
  commitAllPending: () => void;
  getPendingCount: () => number;
}

export const RedactionPendingTracker = forwardRef<RedactionPendingTrackerAPI>(
  function RedactionPendingTracker(_, ref) {
    const activeDocumentId = useActiveDocumentId();
    
    // Don't render the inner component until we have a valid document ID
    if (!activeDocumentId) {
      return null;
    }
    
    return <RedactionPendingTrackerInner documentId={activeDocumentId} ref={ref} />;
  }
);

const RedactionPendingTrackerInner = forwardRef<RedactionPendingTrackerAPI, { documentId: string }>(
  function RedactionPendingTrackerInner({ documentId }, ref) {
    const { state, provides } = useEmbedPdfRedaction(documentId);
    
    const pendingCountRef = useRef(0);
    
    // Expose API through ref
    useImperativeHandle(ref, () => ({
      commitAllPending: () => {
        if (provides?.commitAllPending) {
          provides.commitAllPending();
        }
      },
      getPendingCount: () => pendingCountRef.current,
    }), [provides]);
    
    // Update ref when pending count changes
    useEffect(() => {
      pendingCountRef.current = state?.pendingCount ?? 0;
    }, [state?.pendingCount]);

    return null;
  }
);

