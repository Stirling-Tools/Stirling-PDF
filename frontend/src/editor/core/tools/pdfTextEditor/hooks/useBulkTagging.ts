import { useCallback, useMemo, useRef } from "react";
import i18n from "i18next";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import { SetMarkedTaggedCommand } from "@editor/tools/pdfTextEditor/commands/SetMarkedTaggedCommand";
import {
  TagPageContentCommand,
  hasUntaggedContent,
  textRunsToTag,
} from "@editor/tools/pdfTextEditor/commands/TagPageContentCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { HeadingType } from "@editor/tools/pdfTextEditor/model/structureTypes";
import { publishAllPages } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import {
  PdfiumTextReader,
  boldRuns,
} from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  guessHeadings,
  type HeadingPage,
} from "@editor/tools/pdfTextEditor/util/headingGuess";
import { recogniseFurniture } from "@editor/tools/pdfTextEditor/util/pageFurniture";

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
 * its progress paints, then mark the document fully tagged and record it all
 * as one undo step. Every page is read before any is tagged, so text repeated
 * across pages can be recognised as page furniture, and headings levelled by
 * how the whole document sets its text. Every page tagged is untagged again
 * when one fails.
 */
export async function tagAllPages(store: EditorStore): Promise<void> {
  const doc = store.document;
  if (!doc || store.getState().loading) return;
  const pageIndices = store.getState().pages.map((p) => p.pageIndex);
  const stage = i18n.t(
    "pdfTextEditor.inspector.accessibility.tagging",
    "Tagging pages",
  );
  const total = pageIndices.length * 2;
  const applied: TagPageContentCommand[] = [];
  store.setLoading(true);
  try {
    const slices = slicer(() => store.document === doc);
    for (const [done, pageIndex] of pageIndices.entries()) {
      if (
        !(await slices(() =>
          store.setProgress({ stage, current: done, total }),
        ))
      ) {
        return;
      }
      const page = doc.page(pageIndex);
      if (!page.loaded)
        PdfiumTextReader.populate(doc, page, store.groupingMode);
    }
    const read = pageIndices.map((pageIndex) => {
      const { display, runs, images } = doc.page(pageIndex);
      return { pageIndex, display, runs, images };
    });
    const furniture = recogniseFurniture(read, doc.pageCount);
    // A file that has tags already gets paragraphs only: guessed levels could
    // not follow the headings it has, nor where its tree puts new elements.
    const headings = hasTaggedContent(doc, pageIndices)
      ? new Map<number, Map<string, HeadingType>>()
      : guessHeadings(headingPages(doc, pageIndices), furniture);
    for (const [done, pageIndex] of pageIndices.entries()) {
      const current = pageIndices.length + done;
      if (!(await slices(() => store.setProgress({ stage, current, total })))) {
        return;
      }
      if (!hasUntaggedContent(doc, pageIndex)) continue;
      const command = new TagPageContentCommand({
        pageIndex,
        furniture: furniture.get(pageIndex),
        headings: headings.get(pageIndex),
      });
      command.apply(doc);
      applied.push(command);
    }
    const steps: Command[] = [...applied];
    if (doc.canSetMarkedTagged() && !doc.markedTagged()) {
      const mark = new SetMarkedTaggedCommand(true);
      mark.apply(doc);
      steps.push(mark);
    }
    publishAllPages(store);
    if (steps.length > 0) {
      store.recordApplied(
        steps.length === 1 ? steps[0] : new CompositeCommand(steps),
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

function headingPages(
  doc: EditorDocument,
  pageIndices: readonly number[],
): HeadingPage[] {
  const bold = boldRuns(doc.module);
  return pageIndices.map((pageIndex) => {
    const page = doc.page(pageIndex);
    return {
      pageIndex,
      runs: page.runs.map((run) => ({
        id: run.id,
        text: run.text,
        fontSize: run.fontSize,
        bold: bold(run),
        fill: run.fill,
        bounds: run.bounds,
      })),
      tagged: textRunsToTag(doc, pageIndex),
      display: page.display,
    };
  });
}

/** True when any page has tagged content, the file's own or added since it opened. */
function hasTaggedContent(
  doc: EditorDocument,
  pageIndices: readonly number[],
): boolean {
  return pageIndices.some((pageIndex) => {
    const structure = doc.structure(pageIndex);
    return structure.tagged || structure.addedElements().length > 0;
  });
}

/**
 * A step that yields to the browser once a slice of work has run, after
 * `report`ing progress, so the progress paints. Resolves false when `current`
 * no longer holds, and the work should stop.
 */
function slicer(
  current: () => boolean,
): (report: () => void) => Promise<boolean> {
  let sliceStart = -Infinity;
  return async (report) => {
    if (performance.now() - sliceStart <= SLICE_MS) return true;
    report();
    await new Promise((resolve) => setTimeout(resolve, 0));
    sliceStart = performance.now();
    return current();
  };
}
