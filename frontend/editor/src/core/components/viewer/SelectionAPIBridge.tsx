import { useEffect, useRef } from "react";
import {
  useSelectionCapability,
  useSelectionPlugin,
  glyphAt,
} from "@embedpdf/plugin-selection/react";
import { useDocumentState } from "@embedpdf/core/react";
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
  const documentState = useDocumentState(activeDocumentId ?? "");
  const scaleRef = useRef(1);
  scaleRef.current =
    (documentState as { scale?: number } | undefined)?.scale ?? 1;

  const hasSelectionRef = useRef(false);
  const selectedTextRef = useRef("");

  useEffect(() => {
    if (!selection || !documentReady) return;

    // begin/update/end + getOrLoadGeometry are runtime-public but typed private;
    // matches the TextSelectionHandler word/line cast.
    type SelectionPluginInternals = {
      clearSelection: (id: string) => void;
      beginSelection: (id: string, page: number, glyph: number) => void;
      updateSelection: (id: string, page: number, glyph: number) => void;
      endSelection: (id: string) => void;
      getOrLoadGeometry: (
        id: string,
        pageIdx: number,
      ) => { toPromise: () => Promise<unknown> };
    };

    const lastGlyphOnPage = (geo: {
      runs: { charStart: number; glyphs: unknown[] }[];
    }): number => {
      let last = 0;
      for (const run of geo.runs) {
        const end = run.charStart + run.glyphs.length - 1;
        if (end > last) last = end;
      }
      return last;
    };

    const selectAllInDocument = async (
      documentId: string,
      totalPages: number,
    ) => {
      const plugin = selectionPlugin as unknown as SelectionPluginInternals;
      if (totalPages <= 0) return false;

      // Pre-load geometry for every page so updateRectsAndSlices has data to
      // emit rects for, and getSelectedText has slices for, every page.
      try {
        await Promise.all(
          Array.from({ length: totalPages }, (_, p) =>
            plugin.getOrLoadGeometry(documentId, p).toPromise(),
          ),
        );
      } catch {
        // Continue with whatever geometry did load
      }

      const state = selection.getState(documentId);
      let firstPage = -1;
      let lastPage = -1;
      let lastGlyph = 0;
      for (let p = 0; p < totalPages; p++) {
        const geo = state.geometry[p];
        if (!geo || geo.runs.length === 0) continue;
        if (firstPage === -1) firstPage = p;
        lastPage = p;
        lastGlyph = lastGlyphOnPage(geo);
      }

      if (firstPage === -1 || lastPage === -1) return false;

      plugin.clearSelection(documentId);
      plugin.beginSelection(documentId, firstPage, 0);
      plugin.updateSelection(documentId, lastPage, lastGlyph);
      plugin.endSelection(documentId);
      return true;
    };

    const selectWordAt = (
      documentId: string,
      pageIndex: number,
      x: number,
      y: number,
    ) => {
      const plugin = selectionPlugin as unknown as {
        selectWord: (
          id: string,
          page: number,
          glyph: number,
          modeId: string,
        ) => void;
      };
      const state = selection.getState(documentId);
      const geo = state.geometry[pageIndex];
      if (!geo) return false;
      const g = glyphAt(geo, { x, y }, 3);
      if (g === -1) return false;
      plugin.selectWord(documentId, pageIndex, g, "pointerMode");
      return true;
    };

    const buildApi = () => ({
      copyToClipboard: () => selection.copyToClipboard(),
      getSelectedText: () => selection.getSelectedText(),
      getFormattedSelection: () => selection.getFormattedSelection(),
      selectAll: async (totalPages: number) => {
        const docId = activeDocumentId;
        if (!docId || !selectionPlugin) return false;
        return selectAllInDocument(docId, totalPages);
      },
      selectWordAt: (pageIndex: number, x: number, y: number) => {
        const docId = activeDocumentId;
        if (!docId || !selectionPlugin) return false;
        return selectWordAt(docId, pageIndex, x, y);
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

    // Right-click anywhere inside a PDF page: suppress the browser's "Copy
    // image" menu, and if nothing is currently selected, auto-select the
    // word under the cursor so the floating Copy menu appears in place.
    const handleContextMenu = (event: MouseEvent) => {
      let el = event.target as HTMLElement | null;
      while (el && !el.dataset?.pageIndex) {
        el = el.parentElement;
      }
      if (!el) return;
      event.preventDefault();
      if (hasSelectionRef.current) return;
      const docId = activeDocumentId;
      if (!docId || !selectionPlugin) return;
      const pageIndex = Number(el.dataset.pageIndex);
      if (Number.isNaN(pageIndex)) return;
      const rect = el.getBoundingClientRect();
      const scale = scaleRef.current || 1;
      const x = (event.clientX - rect.left) / scale;
      const y = (event.clientY - rect.top) / scale;
      selectWordAt(docId, pageIndex, x, y);
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      unsubChange?.();
      unsubCopy?.();
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
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
