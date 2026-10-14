import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import {
  useActiveDocumentId,
  useDocumentReady,
} from "@app/components/viewer/useActiveDocumentId";
import {
  getLastViewedPage,
  setLastViewedPage,
} from "@app/services/lastViewedPageStore";

const SAVE_DEBOUNCE_MS = 500;

interface LastViewedPageBridgeProps {
  /** Null remembers and restores nothing, e.g. for a preview file. */
  fileId: string | null;
  restorePending: boolean;
}

/**
 * Remembers the page each file was last viewed at and reopens it there. Only
 * the mount's first document is restored: later ones are replacements whose
 * position DocumentRestoreBridge carries over.
 */
export function LastViewedPageBridge({
  fileId,
  restorePending,
}: LastViewedPageBridgeProps) {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();
  const restoreClaimedRef = useRef(false);

  if (!activeDocumentId || !documentReady || !fileId) return null;

  return (
    <LastViewedPageBridgeInner
      key={activeDocumentId}
      documentId={activeDocumentId}
      fileId={fileId}
      restorePending={restorePending}
      restoreClaimedRef={restoreClaimedRef}
    />
  );
}

function LastViewedPageBridgeInner({
  documentId,
  fileId,
  restorePending,
  restoreClaimedRef,
}: {
  documentId: string;
  fileId: string;
  restorePending: boolean;
  restoreClaimedRef: RefObject<boolean>;
}) {
  const { provides: scroll } = useScrollCapability();
  const fileIdRef = useRef(fileId);
  fileIdRef.current = fileId;
  const restorePendingRef = useRef(restorePending);
  restorePendingRef.current = restorePending;

  useLayoutEffect(() => {
    if (!scroll) return;
    return scroll.onLayoutReady((event) => {
      if (event.documentId !== documentId || restoreClaimedRef.current) return;
      restoreClaimedRef.current = true;
      // Something else has already positioned this document.
      if (restorePendingRef.current || event.pageNumber > 1) return;
      const page = getLastViewedPage(fileIdRef.current);
      if (page === null || page > event.totalPages) return;
      scroll
        .forDocument(documentId)
        .scrollToPage({ pageNumber: page, behavior: "instant" });
    });
  }, [scroll, documentId, restoreClaimedRef]);

  useEffect(() => {
    if (!scroll) return;
    let pendingPage: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (pendingPage !== null)
        setLastViewedPage(fileIdRef.current, pendingPage);
      pendingPage = null;
    };
    const unsubscribe = scroll.onPageChange((event) => {
      // Pages seen before the restore would overwrite the page it reads.
      if (event.documentId !== documentId || !restoreClaimedRef.current) return;
      pendingPage = event.pageNumber;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      save();
    };
  }, [scroll, documentId, restoreClaimedRef]);

  return null;
}
