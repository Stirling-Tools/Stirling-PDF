import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useScrollCapability } from "@embedpdf/plugin-scroll/react";
import {
  useActiveDocumentId,
  useDocumentReady,
} from "@app/components/viewer/useActiveDocumentId";
import {
  getLastViewedPage,
  moveLastViewedPage,
  resumeLastViewedPages,
  setLastViewedPage,
  type LastViewedFile,
} from "@app/services/lastViewedPageStore";

const SAVE_DEBOUNCE_MS = 500;

interface LastViewedPageBridgeProps {
  /** Null remembers and restores nothing, e.g. for a preview file. */
  file: LastViewedFile | null;
  restorePending: boolean;
}

/**
 * Remembers the page each file was last viewed at and reopens it there. Only
 * the mount's first document is restored: later ones are replacements whose
 * position DocumentRestoreBridge carries over.
 */
export function LastViewedPageBridge({
  file,
  restorePending,
}: LastViewedPageBridgeProps) {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();
  const restoreClaimedRef = useRef(false);
  const lastFileRef = useRef(file);

  useEffect(() => resumeLastViewedPages(), []);

  // Only the same record under a new key (a rename or a disk reload) moves its
  // entry. A mount can switch between versions of one lineage that all stay in
  // the workspace, and those keep their own; consumeFiles moves a new version's.
  const fileId = file?.fileId;
  const quickKey = file?.quickKey;
  useEffect(() => {
    if (!fileId || !quickKey) return;
    const last = lastFileRef.current;
    if (last && last.fileId === fileId && last.quickKey !== quickKey) {
      moveLastViewedPage(last.quickKey, { fileId, quickKey });
    }
    lastFileRef.current = { fileId, quickKey };
  }, [fileId, quickKey]);

  if (!activeDocumentId || !documentReady || !file) return null;

  return (
    <LastViewedPageBridgeInner
      key={activeDocumentId}
      documentId={activeDocumentId}
      file={file}
      restorePending={restorePending}
      restoreClaimedRef={restoreClaimedRef}
    />
  );
}

function LastViewedPageBridgeInner({
  documentId,
  file,
  restorePending,
  restoreClaimedRef,
}: {
  documentId: string;
  file: LastViewedFile;
  restorePending: boolean;
  restoreClaimedRef: RefObject<boolean>;
}) {
  const { provides: scroll } = useScrollCapability();
  const fileRef = useRef(file);
  fileRef.current = file;
  const restorePendingRef = useRef(restorePending);
  restorePendingRef.current = restorePending;

  useLayoutEffect(() => {
    if (!scroll) return;
    return scroll.onLayoutReady((event) => {
      if (event.documentId !== documentId || restoreClaimedRef.current) return;
      restoreClaimedRef.current = true;
      // Something else has already positioned this document.
      if (restorePendingRef.current || event.pageNumber > 1) return;
      const page = getLastViewedPage(fileRef.current.quickKey);
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
      if (pendingPage !== null) setLastViewedPage(fileRef.current, pendingPage);
      pendingPage = null;
    };
    const unsubscribe = scroll.onPageChange((event) => {
      // Pages seen before the restore would overwrite the page it reads.
      if (event.documentId !== documentId || !restoreClaimedRef.current) return;
      pendingPage = event.pageNumber;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DEBOUNCE_MS);
    });
    // Closing the tab unmounts nothing, so the cleanup below would not run.
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      unsubscribe();
      save();
    };
  }, [scroll, documentId, restoreClaimedRef]);

  return null;
}
