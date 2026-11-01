import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useRedaction as useEmbedPdfRedaction } from "@embedpdf/plugin-redaction/react";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { useRedaction } from "@editor/contexts/RedactionContext";

export interface RedactionPendingTrackerAPI {
  /** Resolves after the document is redacted; rejects if it cannot be committed. */
  commitAllPending: () => Promise<void>;
  getPendingCount: () => number;
}

export const RedactionPendingTracker = forwardRef<RedactionPendingTrackerAPI>(
  function RedactionPendingTracker(_, ref) {
    const activeDocumentId = useActiveDocumentId();

    // Don't render the inner component until we have a valid document ID
    if (!activeDocumentId) {
      return null;
    }

    return (
      <RedactionPendingTrackerInner documentId={activeDocumentId} ref={ref} />
    );
  },
);

const RedactionPendingTrackerInner = forwardRef<
  RedactionPendingTrackerAPI,
  { documentId: string }
>(function RedactionPendingTrackerInner({ documentId }, ref) {
  const { state, provides } = useEmbedPdfRedaction(documentId);
  const { setPendingCount } = useRedaction();

  const pendingCountRef = useRef(0);

  // Expose API through ref
  useImperativeHandle(
    ref,
    () => ({
      commitAllPending: async () => {
        if (!provides) throw new Error("Redaction API unavailable");
        await provides.commitAllPending().toPromise();
      },
      getPendingCount: () => pendingCountRef.current,
    }),
    [provides],
  );

  useEffect(() => {
    pendingCountRef.current = state?.pendingCount ?? 0;
    setPendingCount(pendingCountRef.current);
  }, [state?.pendingCount, setPendingCount]);

  return null;
});
