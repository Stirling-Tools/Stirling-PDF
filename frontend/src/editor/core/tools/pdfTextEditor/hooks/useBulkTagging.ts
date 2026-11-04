import { useCallback, useMemo, useRef } from "react";
import i18n from "i18next";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import {
  TagPageContentCommand,
  hasUntaggedContent,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { publishAllPages } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

/** Work this long before letting the browser paint the progress. */
const SLICE_MS = 50;

interface CountCache {
  doc: EditorDocument | null;
  /** By page index: whether the page had untagged content at that revision. */
  pages: Map<number, { revision: number; untagged: boolean }>;
}

/**
 * How many read pages have content TagPageContentCommand would tag, and a way
 * to tag every page's as one undo step. Counted only while `shown`, and only
 * for pages whose revision changed since the last count.
 */
export function useBulkTagging(
  store: EditorStore,
  state: EditorViewState,
  shown: boolean,
) {
  const cache = useRef<CountCache>({ doc: null, pages: new Map() });

  const untaggedPages = useMemo(() => {
    const doc = shown ? store.document : null;
    if (!doc) return 0;
    if (cache.current.doc !== doc) cache.current = { doc, pages: new Map() };
    const counted = cache.current.pages;
    let count = 0;
    for (const page of doc.loadedPages()) {
      if (!page.loaded) continue;
      let entry = counted.get(page.index);
      if (entry?.revision !== page.revision) {
        entry = {
          revision: page.revision,
          untagged: hasUntaggedContent(doc, page.index),
        };
        counted.set(page.index, entry);
      }
      if (entry.untagged) count++;
    }
    return count;
    // state.pages is new whenever a page is read or edited.
  }, [store, state.pages, shown]);

  const tagAll = useCallback(() => void tagAllPages(store), [store]);

  return { untaggedPages, tagAll };
}

/**
 * Read and tag every page behind the loading overlay, a slice at a time so
 * its progress paints, then record the pages tagged as one undo step. Every
 * page tagged is untagged again when one fails.
 */
export async function tagAllPages(store: EditorStore): Promise<void> {
  const doc = store.document;
  if (!doc || store.getState().loading) return;
  const pageIndices = store.getState().pages.map((p) => p.pageIndex);
  const stage = i18n.t(
    "pdfTextEditor.inspector.accessibility.tagging",
    "Tagging content",
  );
  const applied: TagPageContentCommand[] = [];
  store.setLoading(true);
  try {
    let sliceStart = -Infinity;
    for (const [done, pageIndex] of pageIndices.entries()) {
      if (performance.now() - sliceStart > SLICE_MS) {
        store.setProgress({ stage, current: done, total: pageIndices.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (store.document !== doc) return;
        sliceStart = performance.now();
      }
      const page = doc.page(pageIndex);
      if (!page.loaded)
        PdfiumTextReader.populate(doc, page, store.groupingMode);
      if (!hasUntaggedContent(doc, pageIndex)) continue;
      const command = new TagPageContentCommand({ pageIndex });
      command.apply(doc);
      applied.push(command);
    }
    publishAllPages(store);
    if (applied.length > 0) {
      store.recordApplied(
        applied.length === 1 ? applied[0] : new CompositeCommand(applied),
      );
    }
  } catch (err) {
    for (const command of applied.reverse()) command.revert(doc);
    publishAllPages(store);
    store.setError(err instanceof Error ? err.message : String(err));
  } finally {
    if (store.document === doc) store.setLoading(false);
  }
}
