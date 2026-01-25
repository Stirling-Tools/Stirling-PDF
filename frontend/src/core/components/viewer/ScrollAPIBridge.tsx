import { useEffect, useRef } from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export function ScrollAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }
  
  return <ScrollAPIBridgeInner documentId={activeDocumentId} />;
}

function ScrollAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { registerBridge, triggerImmediateScrollUpdate } = useViewer();

  // Keep scroll ref updated to avoid re-running effect when object reference changes
  const scrollRef = useRef(scroll);
  useEffect(() => {
    scrollRef.current = scroll;
  }, [scroll]);

  // Extract primitive values to avoid dependency on object references
  const currentPage = scrollState?.currentPage;
  const totalPages = scrollState?.totalPages;

  useEffect(() => {
    const currentScroll = scrollRef.current;
    if (currentScroll && currentPage !== undefined && totalPages !== undefined) {
      const newState = {
        currentPage,
        totalPages,
      };
      
      // Trigger immediate update for responsive UI
      triggerImmediateScrollUpdate(newState.currentPage, newState.totalPages);

      registerBridge('scroll', {
        state: newState,
        api: currentScroll
      });
    }
  }, [currentPage, totalPages, registerBridge, triggerImmediateScrollUpdate]);

  return null;
}
