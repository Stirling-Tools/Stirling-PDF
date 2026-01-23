import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';

export interface RedactionPendingTrackerAPI {
  commitAllPending: () => void;
  getPendingCount: () => number;
}

/**
 * RedactionPendingTracker monitors pending redactions and exposes an API
 * for committing and checking pending redactions.
 * Must be rendered inside the EmbedPDF context.
 * 
 * Note: The unsaved changes checker is registered by EmbedPdfViewer, not here,
 * to avoid conflicts and allow the viewer to check both annotations and redactions.
 */
export const RedactionPendingTracker = forwardRef<RedactionPendingTrackerAPI>(
  function RedactionPendingTracker(_, ref) {
    const { state, provides } = useEmbedPdfRedaction();
    
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

