import { useEffect, useState } from 'react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';
import { useViewer } from '../../contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates spread state in ViewerContext
 */
export function SpreadAPIBridge() {
  const { provides: spread, spreadMode } = useSpread();
  const { registerBridge } = useViewer();
  
  // Store state locally
  const [_localState, setLocalState] = useState({
    spreadMode: SpreadMode.None,
    isDualPage: false
  });

  useEffect(() => {
    if (spread) {
      // Update local state
      const newState = {
        spreadMode, 
        isDualPage: spreadMode !== SpreadMode.None
      };
      setLocalState(newState);

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
