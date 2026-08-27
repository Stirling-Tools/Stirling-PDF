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
import { isItalicFamily } from "@app/tools/pdfTextEditor/v2/util/fontFamily";
import { italicCapability } from "@app/tools/pdfTextEditor/v2/util/fontCapability";
import { loadedLocalFonts } from "@app/tools/pdfTextEditor/v2/util/localFonts";
import { CompositeCommand } from "@app/tools/pdfTextEditor/v2/commands/CompositeCommand";
import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";

/** The fields the selection actions read off a run they are about to change. */
interface SelectedRun {
  id: string;
  pageIndex: number;
  fontId: string;
  fill: { r: number; g: number; b: number; a: number };
}

/** Bundle of callbacks that operate on the current selection. */
export function useSelectionActions(store: EditorStore) {
  const forEachSelectedRun = useCallback(
    (visit: (run: SelectedRun) => void) => {
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

  // One command per run, dispatched as ONE undo step - same reason
  // `deleteSelection` groups its deletes. Select-all now reaches the whole
  // document, so a per-run dispatch left the user hundreds of undos behind and
  // the first Ctrl+Z looked like the restyle had only covered part of the file.
  const dispatchPerRun = useCallback(
    (build: (run: SelectedRun) => Command | null) => {
      const cmds: Command[] = [];
      forEachSelectedRun((run) => {
        const cmd = build(run);
        if (cmd) cmds.push(cmd);
      });
      if (cmds.length === 1) store.dispatch(cmds[0]);
      else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    },
    [store, forEachSelectedRun],
  );

  const changeFontSize = useCallback(
    (size: number) => {
      dispatchPerRun(
        (run) =>
          new SetFontSizeCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextSize: size,
          }),
      );
    },
    [dispatchPerRun],
  );

  const changeFill = useCallback(
    (hex: string) => {
      const fill = parseCssColor(hex);
      if (!fill) return;
      dispatchPerRun(
        (run) =>
          new SetColourCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            // The picker edits RGB only; keep each run's OWN alpha so
            // recolouring semi-transparent text doesn't force it opaque.
            nextFill: { ...fill, a: run.fill.a },
          }),
      );
    },
    [dispatchPerRun],
  );

  const changeOutline = useCallback(
    (hex: string | null, width: number) => {
      const stroke = hex ? parseCssColor(hex) : null;
      dispatchPerRun(
        (run) =>
          new SetTextOutlineCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            stroke: stroke ? { ...stroke, a: 255 } : null,
            width,
          }),
      );
    },
    [dispatchPerRun],
  );

  const changeFontFamily = useCallback(
    async (family: string) => {
      // Embedding is async and Command.apply is not, so warm the bytes first.
      // A no-op for the built-in families.
      await ensureDeviceFontReady(family);
      dispatchPerRun(
        (run) =>
          new SetFontFamilyCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextFamily: family,
          }),
      );
    },
    [dispatchPerRun],
  );

  const toggleItalic = useCallback(async () => {
    const fonts = loadedLocalFonts();
    const targets: Array<{
      pageIndex: number;
      runId: string;
      family: string;
      device: boolean;
    }> = [];
    forEachSelectedRun((run) => {
      const cap = italicCapability(
        run.fontId,
        !isItalicFamily(run.fontId),
        fonts,
      );
      // No real italic cut for this face. Leave it alone: swapping the
      // document's own font for Helvetica-Oblique is not making it italic.
      if (!cap.family) return;
      targets.push({
        pageIndex: run.pageIndex,
        runId: run.id,
        family: cap.family,
        device: cap.source === "device",
      });
    });
    // Embedding is async and Command.apply is not, so warm the bytes first.
    for (const target of targets) {
      if (target.device) await ensureDeviceFontReady(target.family);
    }
    const cmds = targets.map(
      (target) =>
        new SetFontFamilyCommand({
          pageIndex: target.pageIndex,
          runId: target.runId,
          nextFamily: target.family,
        }),
    );
    if (cmds.length === 1) store.dispatch(cmds[0]);
    else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
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
    toggleItalic,
    deleteSelection,
    replaceSelectedImage,
    replaceImageById,
    duplicateFirstSelected,
  };
}
