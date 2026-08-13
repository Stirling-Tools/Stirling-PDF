import { useCallback } from "react";
import { DeleteImageCommand } from "@app/tools/pdfTextEditor/v2/commands/DeleteImageCommand";
import { ReplaceImageCommand } from "@app/tools/pdfTextEditor/v2/commands/ReplaceImageCommand";
import type { DecodedImage } from "@app/utils/pdfiumBitmapUtils";
import { DeleteObjectCommand } from "@app/tools/pdfTextEditor/v2/commands/DeleteObjectCommand";
import { DuplicateRunCommand } from "@app/tools/pdfTextEditor/v2/commands/DuplicateRunCommand";
import { SetColourCommand } from "@app/tools/pdfTextEditor/v2/commands/SetColourCommand";
import { SetTextOutlineCommand } from "@app/tools/pdfTextEditor/v2/commands/SetTextOutlineCommand";
import { SetFontFamilyCommand } from "@app/tools/pdfTextEditor/v2/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@app/tools/pdfTextEditor/v2/commands/SetFontSizeCommand";
import { parseCssColor } from "@app/tools/pdfTextEditor/v2/model/Color";
import { ensureDeviceFontReady } from "@app/tools/pdfTextEditor/v2/util/deviceFontEmbed";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import {
  familyOf,
  flipBold,
  flipItalic,
  helveticaWith,
  isBoldFamily,
  isItalicFamily,
} from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import { CompositeCommand } from "@app/tools/pdfTextEditor/v2/commands/CompositeCommand";

/** Bundle of callbacks that operate on the current selection. */
export function useSelectionActions(store: EditorStore) {
  const forEachSelectedRun = useCallback(
    (
      visit: (run: {
        id: string;
        pageIndex: number;
        fontId: string;
        fill: { r: number; g: number; b: number; a: number };
      }) => void,
    ) => {
      const sel = store.selection.value;
      const doc = store.document;
      if (!doc || sel.runIds.length === 0) return;
      // Pre-index the selection for O(1) membership in the nested walk.
      const selIds = new Set(sel.runIds);
      for (const page of doc.loadedPages()) {
        for (const run of page.runs) {
          // Locked runs are selectable but must not mutate.
          if (selIds.has(run.id) && !run.locked) visit(run);
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
            // The picker edits RGB only; keep each run's OWN alpha so
            // recolouring semi-transparent text doesn't force it opaque.
            nextFill: { ...fill, a: run.fill.a },
          }),
        ),
      );
    },
    [store, forEachSelectedRun],
  );

  const changeOutline = useCallback(
    (hex: string | null, width: number) => {
      const stroke = hex ? parseCssColor(hex) : null;
      forEachSelectedRun((run) =>
        store.dispatch(
          new SetTextOutlineCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            stroke: stroke ? { ...stroke, a: 255 } : null,
            width,
          }),
        ),
      );
    },
    [store, forEachSelectedRun],
  );

  const changeFontFamily = useCallback(
    async (family: string) => {
      // Embedding is async and Command.apply is not, so warm the bytes first.
      // A no-op for the built-in families.
      await ensureDeviceFontReady(family);
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
      // For base-14 source fonts, flip the variant in place (Helvetica →
      // Helvetica-Bold).
      const isOn = isBoldFamily(run.fontId);
      // Preserve the OTHER style axis in the wholesale fallback: bolding an
      // italic embedded font must land on Helvetica-BoldOblique.
      const next =
        flipBold(familyOf(run.fontId), !isOn) ??
        helveticaWith(!isOn, isItalicFamily(run.fontId));
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
        helveticaWith(isBoldFamily(run.fontId), !isOn);
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
    // Collect one command per object but dispatch them as ONE composite: a
    // 30-object delete must be a single undo step, not 30.
    const cmds: Array<DeleteObjectCommand | DeleteImageCommand> = [];
    for (const page of doc.loadedPages()) {
      for (const run of page.runs) {
        if (sel.runIds.includes(run.id) && !run.locked) {
          cmds.push(
            new DeleteObjectCommand({
              pageIndex: run.pageIndex,
              runId: run.id,
            }),
          );
        }
      }
      for (const img of page.images) {
        if (sel.imageIds.includes(img.id) && !img.locked) {
          cmds.push(
            new DeleteImageCommand({
              pageIndex: img.pageIndex,
              imageId: img.id,
            }),
          );
        }
      }
    }
    if (cmds.length === 1) store.dispatch(cmds[0]);
    else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    store.selection.clear();
  }, [store]);

  const replaceImageById = useCallback(
    (
      pageIndex: number,
      imageId: string,
      image: DecodedImage,
      jpegBytes?: Uint8Array,
    ) => {
      const doc = store.document;
      if (!doc) return;
      // By id, not the live selection: an external edit can land long after
      // the user selected something else, or opened another document.
      const page = doc.loadedPages().find((p) => p.index === pageIndex);
      const img = page?.images.find((i) => i.id === imageId);
      if (!img || img.locked) return;
      store.dispatch(
        new ReplaceImageCommand({
          pageIndex: img.pageIndex,
          imageId: img.id,
          image,
          jpegBytes,
        }),
      );
    },
    [store],
  );

  const replaceSelectedImage = useCallback(
    (image: DecodedImage, jpegBytes?: Uint8Array) => {
      const sel = store.selection.value;
      if (sel.imageIds.length !== 1) return;
      const doc = store.document;
      const img = doc
        ?.loadedPages()
        .flatMap((p) => p.images)
        .find((i) => i.id === sel.imageIds[0]);
      if (!img) return;
      replaceImageById(img.pageIndex, img.id, image, jpegBytes);
    },
    [store, replaceImageById],
  );

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
    changeOutline,
    changeFontFamily,
    toggleBold,
    toggleItalic,
    deleteSelection,
    replaceSelectedImage,
    replaceImageById,
    duplicateFirstSelected,
  };
}
