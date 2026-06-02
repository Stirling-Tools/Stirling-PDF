import { useEffect, useRef } from "react";
import {
  useSelectionCapability,
  useSelectionPlugin,
} from "@embedpdf/plugin-selection/react";
import { useViewer } from "@app/contexts/ViewerContext";
import { useDocumentReady } from "@app/components/viewer/hooks/useDocumentReady";
import { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";

/**
 * Connects the PDF selection plugin to the shared ViewerContext.
 */
export function SelectionAPIBridge() {
  const { provides: selection } = useSelectionCapability();
  const { plugin: selectionPlugin } = useSelectionPlugin();
  const { registerBridge } = useViewer();
  const documentReady = useDocumentReady();
  const activeDocumentId = useActiveDocumentId();

  const hasSelectionRef = useRef(false);
  const selectedTextRef = useRef("");

  useEffect(() => {
    if (!selection || !documentReady) return;

    // Select every glyph on a single page using the plugin's begin/update/end
    // primitives. The plugin marks these private in TypeScript but they are
    // accessible at runtime - the same pattern the TextSelectionHandler uses
    // for word/line selection.
    const selectAllOnPage = (documentId: string, pageIndex: number) => {
      const plugin = selectionPlugin as unknown as {
        clearSelection: (id: string) => void;
        beginSelection: (id: string, page: number, glyph: number) => void;
        updateSelection: (id: string, page: number, glyph: number) => void;
        endSelection: (id: string) => void;
      };
      const state = selection.getState(documentId);
      const geo = state.geometry[pageIndex];
      if (!geo || geo.runs.length === 0) return false;
      let lastGlyph = 0;
      for (const run of geo.runs) {
        const end = run.charStart + run.glyphs.length - 1;
        if (end > lastGlyph) lastGlyph = end;
      }
      plugin.clearSelection(documentId);
      plugin.beginSelection(documentId, pageIndex, 0);
      plugin.updateSelection(documentId, pageIndex, lastGlyph);
      plugin.endSelection(documentId);
      return true;
    };

    const buildApi = () => ({
      copyToClipboard: () => selection.copyToClipboard(),
      getSelectedText: () => selection.getSelectedText(),
      getFormattedSelection: () => selection.getFormattedSelection(),
      selectAllOnPage: (pageIndex: number) => {
        const docId = activeDocumentId;
        if (!docId || !selectionPlugin) return false;
        return selectAllOnPage(docId, pageIndex);
      },
    });

    registerBridge("selection", {
      state: { hasSelection: false },
      api: buildApi(),
    });

    const unsubChange = selection.onSelectionChange((event: any) => {
      const hasText = !!event?.selection;
      hasSelectionRef.current = hasText;

      registerBridge("selection", {
        state: { hasSelection: hasText },
        api: buildApi(),
      });

      if (hasText) {
        try {
          const result = selection.getSelectedText();
          result?.wait?.(
            (texts: string[]) => {
              selectedTextRef.current = texts.join("\n");
            },
            () => {
              /* ignore errors */
            },
          );
        } catch {
          // Engine access failed
        }
      } else {
        selectedTextRef.current = "";
      }
    });

    // Fallback: subscribe to the plugin's copy event for navigator.clipboard writes
    const unsubCopy = selection.onCopyToClipboard(
      ({ text }: { text: string }) => {
        if (text) {
          navigator.clipboard.writeText(text).catch(() => {
            /* ignore */
          });
        }
      },
    );

    const handleCopy = (event: ClipboardEvent) => {
      if (!hasSelectionRef.current || !selectedTextRef.current) return;
      event.clipboardData?.setData("text/plain", selectedTextRef.current);
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "c" &&
        hasSelectionRef.current
      ) {
        selection.copyToClipboard();
      }
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubChange?.();
      unsubCopy?.();
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("keydown", handleKeyDown);
      registerBridge("selection", null);
    };
  }, [
    selection,
    selectionPlugin,
    activeDocumentId,
    documentReady,
    registerBridge,
  ]);

  return null;
}
