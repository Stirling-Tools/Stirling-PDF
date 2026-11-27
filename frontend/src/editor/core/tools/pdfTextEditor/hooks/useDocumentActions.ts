import { useMemo } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetLockCommand } from "@editor/tools/pdfTextEditor/commands/SetLockCommand";
import type { ScanFitTarget } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import { ensureAllPagesRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { useDispatchAfterScanFit } from "@editor/tools/pdfTextEditor/hooks/useDispatchAfterScanFit";
import {
  parseCssColor,
  toCssHex,
} from "@editor/tools/pdfTextEditor/model/Color";

/**
 * Changes that sweep the whole document rather than the selection. Each lands
 * as one undo step, and locked items are left alone as the selection's own
 * controls leave them. Changing a font everywhere lives with the selection's
 * font change, which it shares.
 */
export function useDocumentActions(store: EditorStore) {
  const { dispatch: dispatchAfterScanFit } = useDispatchAfterScanFit(store);
  return useMemo(
    () => ({
      /**
       * Recolour every unlocked run filled `fromHex`, keeping its own alpha;
       * with no `fromHex`, every unlocked run.
       */
      recolour: async (fromHex: string | null, toHex: string) => {
        const next = parseCssColor(toHex);
        const doc = store.document;
        if (!next || !doc) return;
        ensureAllPagesRead(store);
        const from = fromHex?.toLowerCase() ?? null;
        const targets: ScanFitTarget[] = [];
        for (const page of doc.loadedPages()) {
          for (const run of page.runs) {
            if (run.locked) continue;
            if (from !== null && toCssHex(run.fill).toLowerCase() !== from)
              continue;
            targets.push({ page, run });
          }
        }
        await dispatchAfterScanFit(targets, () =>
          targets.map(
            ({ run }) =>
              new SetColourCommand({
                pageIndex: run.pageIndex,
                runId: run.id,
                nextFill: { ...next, a: run.fill.a },
              }),
          ),
        );
      },

      /** Unlock every locked run and image. */
      unlockAll: () => {
        const doc = store.document;
        if (!doc) return;
        ensureAllPagesRead(store);
        const cmds: Command[] = [];
        for (const page of doc.loadedPages()) {
          for (const run of page.runs) {
            if (run.locked)
              cmds.push(
                new SetLockCommand({
                  pageIndex: page.index,
                  runId: run.id,
                  locked: false,
                }),
              );
          }
          for (const image of page.images) {
            if (image.locked)
              cmds.push(
                new SetLockCommand({
                  pageIndex: page.index,
                  imageId: image.id,
                  locked: false,
                }),
              );
          }
        }
        if (cmds.length === 1) store.dispatch(cmds[0]);
        else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
      },
    }),
    [store, dispatchAfterScanFit],
  );
}
