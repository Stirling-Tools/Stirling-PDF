import { useCallback, useMemo } from "react";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import {
  TagPageContentCommand,
  hasUntaggedContent,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { ensureAllPagesRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

/**
 * How many read pages have content TagPageContentCommand would tag, and a way
 * to tag every page's as one undo step. Counted only while `shown`: the count
 * re-reads every read page's marks on each page change.
 */
export function useBulkTagging(
  store: EditorStore,
  state: EditorViewState,
  shown: boolean,
) {
  const untaggedPages = useMemo(() => {
    const doc = shown ? store.document : null;
    return doc ? pagesToTag(doc).length : 0;
    // state.pages is new whenever a page is read or edited.
  }, [store, state.pages, shown]);

  const tagAll = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    ensureAllPagesRead(store);
    const commands = pagesToTag(doc).map(
      (pageIndex) => new TagPageContentCommand({ pageIndex }),
    );
    if (commands.length === 0) return;
    store.dispatch(
      commands.length === 1 ? commands[0] : new CompositeCommand(commands),
    );
  }, [store]);

  return { untaggedPages, tagAll };
}

function pagesToTag(doc: EditorDocument): number[] {
  return doc
    .loadedPages()
    .filter((page) => page.loaded && hasUntaggedContent(doc, page.index))
    .map((page) => page.index)
    .sort((a, b) => a - b);
}
