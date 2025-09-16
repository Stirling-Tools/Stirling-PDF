import { useEffect, useState } from 'react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { useViewer } from '../../contexts/ViewerContext';

/**
 * ScrollAPIBridge manages scroll state and exposes scroll actions.
 * Registers with ViewerContext to provide scroll functionality to UI components.
 */
export function ScrollAPIBridge() {
  const { provides: scroll, state: scrollState } = useScroll();
  const { registerBridge } = useViewer();
  
  const [_localState, setLocalState] = useState({
    currentPage: 1,
    totalPages: 0
  });

  useEffect(() => {
    if (scroll && scrollState) {
      const newState = {
        currentPage: scrollState.currentPage,
        totalPages: scrollState.totalPages,
      };
      setLocalState(newState);

      registerBridge('scroll', {
        state: newState,
        api: scroll
      });
    }
  }, [scroll, scrollState, registerBridge]);

  return null;
}
