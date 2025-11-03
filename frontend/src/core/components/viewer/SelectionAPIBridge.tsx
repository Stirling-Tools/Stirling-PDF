import { useEffect, useState } from 'react';
import { useSelectionCapability, SelectionRangeX } from '@embedpdf/plugin-selection/react';
import { useViewer } from '@app/contexts/ViewerContext';

/**
 * Component that runs inside EmbedPDF context and updates selection state in ViewerContext
 */
export function SelectionAPIBridge() {
  const { provides: selection } = useSelectionCapability();
  const { registerBridge } = useViewer();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (selection) {
      const newState = {
        hasSelection
      };

      // Register this bridge with ViewerContext
      registerBridge('selection', {
        state: newState,
        api: {
          copyToClipboard: () => selection.copyToClipboard(),
          getSelectedText: () => selection.getSelectedText(),
          getFormattedSelection: () => selection.getFormattedSelection(),
        }
      });

      // Listen for selection changes to track when text is selected
      const unsubscribe = selection.onSelectionChange((sel: SelectionRangeX | null) => {
        const hasText = !!sel;
        setHasSelection(hasText);
        const updatedState = { hasSelection: hasText };
        // Re-register with updated state
        registerBridge('selection', {
          state: updatedState,
          api: {
            copyToClipboard: () => selection.copyToClipboard(),
            getSelectedText: () => selection.getSelectedText(),
            getFormattedSelection: () => selection.getFormattedSelection(),
          }
        });
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

  return null;
}
