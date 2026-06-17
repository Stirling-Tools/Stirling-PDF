import { useCallback } from "react";
import { DeleteImageCommand } from "@app/tools/pdfTextEditor/v2/commands/DeleteImageCommand";
import { DeleteObjectCommand } from "@app/tools/pdfTextEditor/v2/commands/DeleteObjectCommand";
import { DuplicateRunCommand } from "@app/tools/pdfTextEditor/v2/commands/DuplicateRunCommand";
import { SetColourCommand } from "@app/tools/pdfTextEditor/v2/commands/SetColourCommand";
import { SetFontFamilyCommand } from "@app/tools/pdfTextEditor/v2/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@app/tools/pdfTextEditor/v2/commands/SetFontSizeCommand";
import { parseCssColor } from "@app/tools/pdfTextEditor/v2/model/Color";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import {
  familyOf,
  flipBold,
  flipItalic,
  isBoldFamily,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";

/**
 * Bundle of callbacks that operate on the current selection. Centralising
 * them here keeps `PdfTextEditorV2.tsx` free of the run/page traversal
 * boilerplate that every per-attribute mutation otherwise repeats.
 */
export function useSelectionActions(store: EditorStore) {
  const forEachSelectedRun = useCallback(
    (
      visit: (run: { id: string; pageIndex: number; fontId: string }) => void,
    ) => {
      const sel = store.selection.value;
      const doc = store.document;
      if (!doc || sel.runIds.length === 0) return;
      for (const page of doc.loadedPages()) {
        for (const run of page.runs) {
          if (sel.runIds.includes(run.id)) visit(run);
        }
      }
    },
    [store],
  );

  const changeFontSize = useCallback(
    (size: number) => {
      forEachSelectedRun((run) =>
        store.dispatch(
          new SetFontSizeCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextSize: size,
          }),
        ),
      );
    },
    [store, forEachSelectedRun],
  );

  const changeFill = useCallback(
    (hex: string) => {
      const fill = parseCssColor(hex);
      if (!fill) return;
      forEachSelectedRun((run) =>
        store.dispatch(
          new SetColourCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextFill: fill,
          }),
        ),
      );
    },
    [store, forEachSelectedRun],
  );

  const changeFontFamily = useCallback(
    (family: string) => {
      forEachSelectedRun((run) =>
        store.dispatch(
          new SetFontFamilyCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextFamily: family,
          }),
        ),
      );
    },
    [store, forEachSelectedRun],
  );

  const toggleBold = useCallback(() => {
    forEachSelectedRun((run) => {
      // For base-14 source fonts, flip the variant in place
      // (Helvetica → Helvetica-Bold). For embedded source fonts (the
      // dominant case for real PDFs - Word / InDesign / Quark output),
      // flipBold returns null because the family isn't one we know how
      // to bold. Fall back to swapping the run wholesale to Helvetica-
      // Bold so the user CAN actually bold their text. Earlier this
      // path silently no-op'd and the Bold button appeared dead.
      const isOn = isBoldFamily(run.fontId);
      const next =
        flipBold(familyOf(run.fontId), !isOn) ??
        (isOn ? "Helvetica" : "Helvetica-Bold");
      store.dispatch(
        new SetFontFamilyCommand({
          pageIndex: run.pageIndex,
          runId: run.id,
          nextFamily: next,
        }),
      );
    });
  }, [store, forEachSelectedRun]);

  const toggleItalic = useCallback(() => {
    forEachSelectedRun((run) => {
      // Same fallback as toggleBold: for unknown / embedded families,
      // swap wholesale to Helvetica-Oblique so the button isn't dead.
      const isOn = isItalicFamily(run.fontId);
      const next =
        flipItalic(familyOf(run.fontId), !isOn) ??
        (isOn ? "Helvetica" : "Helvetica-Oblique");
      store.dispatch(
        new SetFontFamilyCommand({
          pageIndex: run.pageIndex,
          runId: run.id,
          nextFamily: next,
        }),
      );
    });
  }, [store, forEachSelectedRun]);

  const deleteSelection = useCallback(() => {
    const sel = store.selection.value;
    const doc = store.document;
    if (!doc) return;
    if (sel.runIds.length === 0 && sel.imageIds.length === 0) return;
    for (const page of doc.loadedPages()) {
      for (const run of page.runs) {
        if (sel.runIds.includes(run.id)) {
          store.dispatch(
            new DeleteObjectCommand({
              pageIndex: run.pageIndex,
              runId: run.id,
            }),
          );
        }
      }
      for (const img of page.images) {
        if (sel.imageIds.includes(img.id)) {
          store.dispatch(
            new DeleteImageCommand({
              pageIndex: img.pageIndex,
              imageId: img.id,
            }),
          );
        }
      }
    }
    store.selection.clear();
  }, [store]);

  const duplicateFirstSelected = useCallback(() => {
    const sel = store.selection.value;
    if (sel.runIds.length === 0) return;
    const doc = store.document;
    if (!doc) return;
    const targetId = sel.runIds[0];
    for (const page of doc.loadedPages()) {
      for (const r of page.runs) {
        if (r.id !== targetId) continue;
        const cmd = new DuplicateRunCommand({
          pageIndex: r.pageIndex,
          runId: targetId,
        });
        store.dispatch(cmd);
        if (cmd.insertedRunId) store.selection.selectOne(cmd.insertedRunId);
        return;
      }
    }
  }, [store]);

  return {
    changeFontSize,
    changeFill,
    changeFontFamily,
    toggleBold,
    toggleItalic,
    deleteSelection,
    duplicateFirstSelected,
  };
}
