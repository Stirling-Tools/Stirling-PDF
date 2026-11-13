import { useLayoutEffect, useRef } from "react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";

/**
 * Connects the PDF scroll plugin to the shared ViewerContext.
 */
export function ScrollAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  const documentReady = useDocumentReady();

  // Don't render the inner component until we have a valid document ID and document is ready
  if (!activeDocumentId || !documentReady) {
    return null;
  }

  return (
    <ScrollAPIBridgeInner
      key={activeDocumentId}
      documentId={activeDocumentId}
    />
  );
}

function ScrollAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { registerBridge, triggerImmediateScrollUpdate } = useViewer();

  // Keep scroll ref updated to avoid re-running effect when object reference changes
  const scrollRef = useRef(scroll);
  useLayoutEffect(() => {
    scrollRef.current = scroll;
  }, [scroll]);

  // Extract primitive values to avoid dependency on object references
  const currentPage = scrollState?.currentPage;
  const totalPages = scrollState?.totalPages;

  // Publish state without unregistering; cleanup runs on unmount only.
  useLayoutEffect(() => {
    const currentScroll = scrollRef.current;
    if (
      currentScroll &&
      currentPage !== undefined &&
      totalPages !== undefined
    ) {
      // Trigger immediate update for responsive UI
      triggerImmediateScrollUpdate(currentPage, totalPages);

      registerBridge("scroll", {
        state: { currentPage, totalPages },
        api: currentScroll,
      });
    }
  }, [currentPage, totalPages, registerBridge, triggerImmediateScrollUpdate]);

  useLayoutEffect(() => {
    return () => {
      registerBridge("scroll", null);
    };
  }, [registerBridge]);

  return null;
}
