import { useEffect, useState } from 'react';
import { useSelectionCapability, SelectionRangeX } from '@embedpdf/plugin-selection/react';

/**
 * Component that runs inside EmbedPDF context and exports selection controls globally
 */
export function SelectionControlsExporter() {
  const { provides: selection } = useSelectionCapability();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (selection) {
      // Export selection controls to global window
      (window as any).embedPdfSelection = {
        copyToClipboard: () => selection.copyToClipboard(),
        getSelectedText: () => selection.getSelectedText(),
        getFormattedSelection: () => selection.getFormattedSelection(),
        hasSelection: hasSelection,
      };

      // Listen for selection changes to track when text is selected
      const unsubscribe = selection.onSelectionChange((sel: SelectionRangeX | null) => {
        const hasText = !!sel;
        setHasSelection(hasText);
        // Update global state
        if ((window as any).embedPdfSelection) {
          (window as any).embedPdfSelection.hasSelection = hasText;
        }
      });

      // Intercept Ctrl+C only when we have PDF text selected
      const handleKeyDown = (event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'c' && hasSelection) {
          // Call EmbedPDF's copyToClipboard API
          selection.copyToClipboard();
          // Don't prevent default - let EmbedPDF handle the clipboard
        }
      };

      // Add keyboard listener
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        unsubscribe?.();
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [selection, hasSelection]);

  return null; // This component doesn't render anything
}