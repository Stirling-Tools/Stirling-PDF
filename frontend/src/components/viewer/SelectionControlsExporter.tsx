import { useEffect } from 'react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';

/**
 * Component that runs inside EmbedPDF context and exports selection controls globally
 */
export function SelectionControlsExporter() {
  const { provides: selection } = useSelectionCapability();

  useEffect(() => {
    if (selection) {
      // Export selection controls to global window
      (window as any).embedPdfSelection = {
        copyToClipboard: () => selection.copyToClipboard(),
        getSelectedText: () => selection.getSelectedText(),
        getFormattedSelection: () => selection.getFormattedSelection(),
      };
    }
  }, [selection]);

  return null; // This component doesn't render anything
}