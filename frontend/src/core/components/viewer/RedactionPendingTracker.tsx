import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useRedaction as useEmbedPdfRedaction } from '@embedpdf/plugin-redaction/react';
import { useNavigationGuard } from '@app/contexts/NavigationContext';

export interface RedactionPendingTrackerAPI {
  commitAllPending: () => void;
  getPendingCount: () => number;
}

/**
 * RedactionPendingTracker monitors pending redactions and integrates with
 * the navigation guard to warn users about unsaved changes.
 * Must be rendered inside the EmbedPDF context.
 */
export const RedactionPendingTracker = forwardRef<RedactionPendingTrackerAPI>(
  function RedactionPendingTracker(_, ref) {
    const { state, provides } = useEmbedPdfRedaction();
    const { registerUnsavedChangesChecker, unregisterUnsavedChangesChecker, setHasUnsavedChanges } = useNavigationGuard();
    
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
      
      // Also update the hasUnsavedChanges state
      if (pendingCountRef.current > 0) {
        setHasUnsavedChanges(true);
      }
    }, [state?.pendingCount, setHasUnsavedChanges]);

    // Register checker for pending redactions
    useEffect(() => {
      const checkForPendingRedactions = () => {
        const hasPending = pendingCountRef.current > 0;
        return hasPending;
      };

      registerUnsavedChangesChecker(checkForPendingRedactions);

      return () => {
        unregisterUnsavedChangesChecker();
      };
    }, [registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

    return null;
  }
);

