import { useEffect } from 'react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates spread state in ViewerContext
 */
export function SpreadAPIBridge() {
  const { provides: spread, spreadMode } = useSpread();
  const { registerBridge, triggerImmediateSpreadUpdate } = useViewer();

  useEffect(() => {
    if (!spread) {
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
          spread.setSpreadMode(mode);
        },
        getSpreadMode: () => spread.getSpreadMode(),
        toggleSpreadMode: () => {
          const current = spread.getSpreadMode();
          const nextMode = current === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None;
          spread.setSpreadMode(nextMode);
        },
        SpreadMode,
      },
    });

    triggerImmediateSpreadUpdate(spreadMode);
  }, [spread, spreadMode, registerBridge, triggerImmediateSpreadUpdate]);

  return null;
}
