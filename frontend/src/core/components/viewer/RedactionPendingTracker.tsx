import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { DEFAULT_DOCUMENT_ID } from '@app/components/viewer/viewerConstants';

export interface RedactionPendingTrackerAPI {
  commitAllPending: () => void;
  getPendingCount: () => number;
}

export const RedactionPendingTracker = forwardRef<RedactionPendingTrackerAPI>(
  function RedactionPendingTracker(_, ref) {
    const { state, provides } = useEmbedPdfRedaction(DEFAULT_DOCUMENT_ID);
    
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

