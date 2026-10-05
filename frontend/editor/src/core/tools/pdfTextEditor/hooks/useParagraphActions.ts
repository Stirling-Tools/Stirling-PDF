import { useCallback, useMemo } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import { MergeRunsCommand } from "@app/tools/pdfTextEditor/commands/MergeRunsCommand";
import { UngroupParagraphCommand } from "@app/tools/pdfTextEditor/commands/UngroupParagraphCommand";

/** Merge selected lines into a paragraph, or split a paragraph into lines. */
export function useParagraphActions(store: EditorStore) {
  const ungroupSelection = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    const ids = store.selection.value.runIds;
    // Snapshot the target runs first - dispatching mutates page.runs, and
    // the ungroup replaces the paragraph run with per-line runs.
    const targets: Array<{ pageIndex: number; runId: string }> = [];
    for (const pageIdx of doc.loadedPages().map((p) => p.index)) {
      for (const r of doc.page(pageIdx).runs) {
        if (!ids.includes(r.id)) continue;
        if (r.paragraphMemberPtrs.length < 2) continue;
        targets.push({ pageIndex: pageIdx, runId: r.id });
      }
    }
    const resultIds: string[] = [];
    for (const t of targets) {
      const cmd = new UngroupParagraphCommand(t);
      store.dispatch(cmd);
      resultIds.push(...cmd.resultRunIds);
    }
    // Reconcile selection against the new run model so the toolbar keeps
    // acting on real runs instead of the now-removed paragraph ids.
    if (resultIds.length > 0) store.selection.selectMany(resultIds);
    else store.selection.clear();
  }, [store]);

  const mergeSelection = useCallback(() => {
    const doc = store.document;
    if (!doc) return;
    const selectedIds = new Set(store.selection.value.runIds);
    if (selectedIds.size < 2) return;
    const byPage = new Map<number, string[]>();
    for (const page of doc.loadedPages()) {
      for (const r of page.runs) {
        if (!selectedIds.has(r.id)) continue;
        const list = byPage.get(r.pageIndex) ?? [];
        list.push(r.id);
        byPage.set(r.pageIndex, list);
      }
    }
    // Collect every page's new representative, then select them all once -
    // selecting inside the loop left only the last page's merge selected.
    const reps: string[] = [];
    for (const [pageIndex, runIds] of byPage) {
      if (runIds.length < 2) continue;
      const cmd = new MergeRunsCommand({ pageIndex, runIds });
      store.dispatch(cmd);
      if (cmd.representativeRunId) reps.push(cmd.representativeRunId);
    }
    if (reps.length > 0) store.selection.selectMany(reps);
  }, [store]);

  return useMemo(
    () => ({ mergeSelection, ungroupSelection }),
    [mergeSelection, ungroupSelection],
  );
}
