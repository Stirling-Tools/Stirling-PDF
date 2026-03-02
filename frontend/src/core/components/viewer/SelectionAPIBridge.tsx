import { useEffect, useRef } from 'react';
import { useSelectionCapability } from '@embedpdf/plugin-selection/react';
import { useViewer } from '@app/contexts/ViewerContext';
import { useDocumentReady } from '@app/components/viewer/hooks/useDocumentReady';

/**
 * Connects the PDF selection plugin to the shared ViewerContext.
 */
export function SelectionAPIBridge() {
  const { provides: selection } = useSelectionCapability();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();


  const hasSelectionRef = useRef(false);
  const selectedTextRef = useRef('');

  useEffect(() => {
    if (!selection || !documentReady) return;

    const buildApi = () => ({
      copyToClipboard: () => selection.copyToClipboard(),
      getSelectedText: () => selection.getSelectedText(),
      getFormattedSelection: () => selection.getFormattedSelection(),
    });

    registerBridge('selection', { state: { hasSelection: false }, api: buildApi() });

    const unsubChange = selection.onSelectionChange((event: any) => {
      const hasText = !!event?.selection;
      hasSelectionRef.current = hasText;

      registerBridge('selection', { state: { hasSelection: hasText }, api: buildApi() });

      if (hasText) {
        try {
          const result = selection.getSelectedText();
          result?.wait?.((texts: string[]) => {
            selectedTextRef.current = texts.join('\n');
          }, () => { /* ignore errors */ });
        } catch {
          // Engine access failed
        }
      } else {
        selectedTextRef.current = '';
      }
    });

    // Fallback: subscribe to the plugin's copy event for navigator.clipboard writes
    const unsubCopy = selection.onCopyToClipboard(({ text }: { text: string }) => {
      if (text) {
        navigator.clipboard.writeText(text).catch(() => { /* ignore */ });
      }
    });

    const handleCopy = (event: ClipboardEvent) => {
      if (!hasSelectionRef.current || !selectedTextRef.current) return;
      event.clipboardData?.setData('text/plain', selectedTextRef.current);
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && hasSelectionRef.current) {
        selection.copyToClipboard();
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubChange?.();
      unsubCopy?.();
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('keydown', handleKeyDown);
      registerBridge('selection', null);
    };
  }, [selection, documentReady, registerBridge]);

  return null;
}
