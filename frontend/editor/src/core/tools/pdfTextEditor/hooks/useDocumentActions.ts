import { useMemo } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/store/EditorStore";
import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@app/tools/pdfTextEditor/commands/CompositeCommand";
import { SetColourCommand } from "@app/tools/pdfTextEditor/commands/SetColourCommand";
import { SetFontFamilyCommand } from "@app/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetLockCommand } from "@app/tools/pdfTextEditor/commands/SetLockCommand";
import { ensureAllPagesRead } from "@app/tools/pdfTextEditor/hooks/useDocumentLoader";
import { parseCssColor, toCssHex } from "@app/tools/pdfTextEditor/model/Color";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { ensureDeviceFontReady } from "@app/tools/pdfTextEditor/util/deviceFontEmbed";

/**
 * Changes that sweep the whole document rather than the selection. Each one
 * lands as a single undo step, and locked items are left alone just as they
 * are by the selection's own controls.
 */
export function useDocumentActions(store: EditorStore) {
  return useMemo(() => {
    /** Every unlocked run matching `pick`, with pages past the eager read loaded. */
    const runsWhere = (pick: (run: TextRun) => boolean): TextRun[] => {
      const doc = store.document;
      if (!doc) return [];
      ensureAllPagesRead(store);
      return doc
        .loadedPages()
        .flatMap((page) => page.runs)
        .filter((run) => !run.locked && pick(run));
    };

    const dispatchAll = (cmds: Command[]) => {
      if (cmds.length === 1) store.dispatch(cmds[0]);
      else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    };

    return {
      /**
       * Re-set every run in `fontName` in `family`; with no `fontName`, every
       * run in the document.
       */
      replaceFont: async (fontName: string | null, family: string) => {
        // Embedding is async and Command.apply is not, so warm the bytes first.
        await ensureDeviceFontReady(family);
        dispatchAll(
          runsWhere(
            (run) => fontName === null || run.fontId.endsWith(fontName),
          ).map(
            (run) =>
              new SetFontFamilyCommand({
                pageIndex: run.pageIndex,
                runId: run.id,
                nextFamily: family,
              }),
          ),
        );
      },

      /**
       * Recolour every run currently filled `fromHex`, keeping its own alpha;
       * with no `fromHex`, every run in the document.
       */
      recolour: (fromHex: string | null, toHex: string) => {
        const next = parseCssColor(toHex);
        if (!next) return;
        const from = fromHex?.toLowerCase() ?? null;
        dispatchAll(
          runsWhere(
            (run) => from === null || toCssHex(run.fill).toLowerCase() === from,
          ).map(
            (run) =>
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
            if (run.locked) {
              cmds.push(
                new SetLockCommand({
                  pageIndex: page.index,
                  runId: run.id,
                  locked: false,
                }),
              );
            }
          }
          for (const image of page.images) {
            if (image.locked) {
              cmds.push(
                new SetLockCommand({
                  pageIndex: page.index,
                  imageId: image.id,
                  locked: false,
                }),
              );
            }
          }
        }
        dispatchAll(cmds);
      },
    };
  }, [store]);
}
