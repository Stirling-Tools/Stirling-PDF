import { useEffect } from 'react';
import { useSpread, SpreadMode } from '@embedpdf/plugin-spread/react';

/**
 * Component that runs inside EmbedPDF context and exports spread controls globally
 */
export function SpreadAPIBridge() {
  const { provides: spread, spreadMode } = useSpread();

  useEffect(() => {
    if (spread) {
      // Export spread controls to global window for toolbar access
      (window as any).embedPdfSpread = {
        setSpreadMode: (mode: SpreadMode) => {
          console.log('EmbedPDF: Setting spread mode to:', mode);
          spread.setSpreadMode(mode);
        },
        getSpreadMode: () => spread.getSpreadMode(),
        toggleSpreadMode: () => {
          // Toggle between None and Odd (most common dual-page mode)
          const newMode = spreadMode === SpreadMode.None ? SpreadMode.Odd : SpreadMode.None;
          console.log('EmbedPDF: Toggling spread mode from', spreadMode, 'to', newMode);
          spread.setSpreadMode(newMode);
        },
        currentSpreadMode: spreadMode,
        isDualPage: spreadMode !== SpreadMode.None,
        SpreadMode: SpreadMode, // Export enum for reference
      };

      console.log('EmbedPDF spread controls exported to window.embedPdfSpread', {
        currentSpreadMode: spreadMode,
        isDualPage: spreadMode !== SpreadMode.None,
        spreadAPI: spread,
        availableMethods: Object.keys(spread)
      });
    } else {
      console.warn('EmbedPDF spread API not available yet');
    }
  }, [spread, spreadMode]);

  return null;
}
