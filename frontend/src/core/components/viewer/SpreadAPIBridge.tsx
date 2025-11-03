import { useEffect } from 'react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates spread state in ViewerContext
 */
export function SpreadAPIBridge() {
  const { provides: spread, spreadMode } = useSpread();
  const { registerBridge } = useViewer();

  useEffect(() => {
    if (spread) {
      const newState = {
        spreadMode, 
        isDualPage: spreadMode !== SpreadMode.None
      };

      // Register this bridge with ViewerContext
      registerBridge('spread', {
        state: newState,
        api: {
          setSpreadMode: (mode: SpreadMode) => {
            spread.setSpreadMode(mode);
          },
          getSpreadMode: () => spread.getSpreadMode(),
          toggleSpreadMode: () => {
            // Toggle between None and Odd (most common dual-page mode)
            const newMode = spreadMode === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None;
            spread.setSpreadMode(newMode);
          },
          SpreadMode: SpreadMode, // Export enum for reference
        }
      });
    }
  }, [spread, spreadMode]);

  return null;
}
