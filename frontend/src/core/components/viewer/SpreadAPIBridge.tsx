import { useEffect, useRef } from 'react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useActiveDocumentId } from '@app/components/viewer/useActiveDocumentId';

export function SpreadAPIBridge() {
  const activeDocumentId = useActiveDocumentId();
  
  // Don't render the inner component until we have a valid document ID
  if (!activeDocumentId) {
    return null;
  }
  
  return <SpreadAPIBridgeInner documentId={activeDocumentId} />;
}

function SpreadAPIBridgeInner({ documentId }: { documentId: string }) {
  const { provides: spread, spreadMode } = useSpread(documentId);
  const { registerBridge, triggerImmediateSpreadUpdate } = useViewer();

  // Keep spread ref updated to avoid re-running effect when object reference changes
  const spreadRef = useRef(spread);
  useEffect(() => {
    spreadRef.current = spread;
  }, [spread]);

  useEffect(() => {
    const currentSpread = spreadRef.current;
    if (!currentSpread || spreadMode === undefined) {
      return;
    }

    const newState = {
      spreadMode,
      isDualPage: spreadMode !== SpreadMode.None,
    };

    registerBridge('spread', {
      state: newState,
      api: {
        setSpreadMode: (mode: SpreadMode) => {
          currentSpread.setSpreadMode(mode);
        },
        getSpreadMode: () => currentSpread.getSpreadMode(),
        toggleSpreadMode: () => {
          const current = currentSpread.getSpreadMode();
          const nextMode = current === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None;
          currentSpread.setSpreadMode(nextMode);
        },
        SpreadMode,
      },
    });

    triggerImmediateSpreadUpdate(spreadMode);
  }, [spreadMode, registerBridge, triggerImmediateSpreadUpdate]);

  return null;
}
