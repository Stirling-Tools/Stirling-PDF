import { useEffect, useRef } from "react";
import {
  useSelectionCapability,
  useSelectionPlugin,
  glyphAt,
} from "@embedpdf/plugin-selection/react";
import { useDocumentState } from "@embedpdf/core/react";
import { useViewer } from "@editor/contexts/ViewerContext";
import { useDocumentReady } from "@editor/components/viewer/hooks/useDocumentReady";
import { useActiveDocumentId } from "@editor/components/viewer/useActiveDocumentId";
import { copyText } from "@editor/utils/copyText";

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/**
 * Connects the PDF selection plugin to the shared ViewerContext.
 */
export function SelectionAPIBridge({ canCopy = false }: { canCopy?: boolean }) {
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
  const textLookupRef = useRef(0);

  useEffect(() => {
    return () => {
      hasSelectionRef.current = false;
      selectedTextRef.current = "";
      textLookupRef.current += 1;
    };
  }, [activeDocumentId]);

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
      for (let p = 0; p < totalPages; p++) {
        try {
          await plugin.getOrLoadGeometry(documentId, p).toPromise();
        } catch {
          // Continue with whatever geometry did load
        }
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

      try {
        await selection
          .setSelection(
            {
              start: { page: firstPage, index: 0 },
              end: { page: lastPage, index: lastGlyph },
            },
            documentId,
          )
          .toPromise();
      } catch {
        // Fallback: use internal begin/update/end flow
        plugin.clearSelection(documentId);
        plugin.beginSelection(documentId, firstPage, 0);
        plugin.updateSelection(documentId, lastPage, lastGlyph);
        plugin.endSelection(documentId);
      }

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
      copyToClipboard: () =>
        canCopy ? copyText(selectedTextRef.current) : Promise.resolve(false),
      getFormattedSelection: () =>
        selection.getFormattedSelection(activeDocumentId ?? undefined),
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

    const unsubChange = selection.onSelectionChange((event) => {
      const hasText = !!event?.selection;
      hasSelectionRef.current = hasText;

      registerBridge("selection", {
        state: { hasSelection: hasText },
        api: buildApi(),
      });

      // Cleared before the async lookup so a copy in the gap fails rather than
      // writing the previous selection's text.
      selectedTextRef.current = "";
      const lookup = ++textLookupRef.current;
      if (hasText) {
        try {
          const result = selection.getSelectedText(
            activeDocumentId ?? undefined,
          );
          result?.wait?.(
            (texts: string[]) => {
              if (lookup === textLookupRef.current)
                selectedTextRef.current = texts.join("\n");
            },
            () => {
              /* ignore errors */
            },
          );
        } catch {
          // Engine access failed
        }
      }
    });

    // Ctrl+C must reach this event uncancelled: writing clipboardData here
    // works over plain HTTP, where navigator.clipboard is absent. Copies from
    // editable fields, including copyText's fallback textarea, keep their own text.
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (!hasSelectionRef.current || !selectedTextRef.current) return;
      if (canCopy)
        event.clipboardData?.setData("text/plain", selectedTextRef.current);
      event.preventDefault();
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
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      unsubChange?.();
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("contextmenu", handleContextMenu);
      registerBridge("selection", null);
    };
  }, [
    selection,
    selectionPlugin,
    activeDocumentId,
    documentReady,
    registerBridge,
    canCopy,
  ]);

  return null;
}
