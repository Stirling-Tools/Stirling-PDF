import { useEffect, useState } from 'react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useViewer } from '@app/contexts/ViewerContext';

export function SelectionAPIBridge() {
  const { provides: selection } = useSelectionCapability();
  const { registerBridge } = useViewer();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    if (selection) {
      const newState = {
        hasSelection
      };

      registerBridge('selection', {
        state: newState,
        api: {
          copyToClipboard: () => selection.copyToClipboard(),
          getSelectedText: () => selection.getSelectedText(),
          getFormattedSelection: () => selection.getFormattedSelection(),
        }
      });

      const unsubscribe = selection.onSelectionChange((event: any) => {
        const hasText = !!(event?.selection || event);
        setHasSelection(hasText);
        const updatedState = { hasSelection: hasText };
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
