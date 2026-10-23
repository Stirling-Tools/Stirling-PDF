import { useLayoutEffect, useRef } from "react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import {
  readViewedPage,
  writeViewedPage,
} from "@editor/services/workbenchSession";

interface LastViewedPageBridgeProps {
  /** Null remembers and restores nothing, e.g. for a preview file. */
  originalFileId: string | null;
  restorePending: boolean;
}

/**
 * Reopens a file at the page it was last read at, and records the page as the
 * reader moves. Only the mount's first document is restored: the viewer is
 * mounted per original file, so later documents are new versions whose
 * position DocumentRestoreBridge carries over.
 */
export function LastViewedPageBridge({
  originalFileId,
  restorePending,
}: LastViewedPageBridgeProps) {
  const { provides: scroll } = useScrollCapability();
  const restoreClaimed = useRef(false);
  const restorePendingRef = useRef(restorePending);
  useLayoutEffect(() => {
    restorePendingRef.current = restorePending;
  }, [restorePending]);

  useLayoutEffect(() => {
    if (!scroll || !originalFileId) return;
    const unsubscribeLayout = scroll.onLayoutReady((event) => {
      if (restoreClaimed.current) return;
      restoreClaimed.current = true;
      // Something else has already positioned this document.
      if (restorePendingRef.current || event.pageNumber > 1) return;
      const page = readViewedPage(originalFileId);
      if (page === null || page > event.totalPages) return;
      scroll
        .forDocument(event.documentId)
        .scrollToPage({ pageNumber: page, behavior: "instant" });
    });
    const unsubscribePage = scroll.onPageChange((event) => {
      // Page 1 is reported on load, before the restore, and would erase the page it reads.
      if (restoreClaimed.current)
        writeViewedPage(originalFileId, event.pageNumber);
    });
    return () => {
      unsubscribeLayout();
      unsubscribePage();
    };
  }, [scroll, originalFileId]);

  return null;
}
