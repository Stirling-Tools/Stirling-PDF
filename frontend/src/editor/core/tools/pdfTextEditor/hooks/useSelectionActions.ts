import { useCallback, useState } from "react";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import { ReplaceImageCommand } from "@editor/tools/pdfTextEditor/commands/ReplaceImageCommand";
import type { DecodedImage } from "@editor/utils/pdfiumBitmapUtils";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import { parseCssColor } from "@editor/tools/pdfTextEditor/model/Color";
import {
  deviceFontDrawsAnyOf,
  ensureDeviceFontReady,
  loadDeviceFontInto,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  isItalicFamily,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { italicCapability } from "@editor/tools/pdfTextEditor/util/fontCapability";
import { loadedExternalFonts } from "@editor/tools/pdfTextEditor/util/externalFonts";
import { serverFaceFor } from "@editor/tools/pdfTextEditor/util/serverFonts";
import { isLocalFontEmbeddingForbidden } from "@editor/tools/pdfTextEditor/util/localFonts";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  prefitInSlices,
  scanRunsToFit,
  type ScanFitTarget,
} from "@editor/tools/pdfTextEditor/hooks/useScanPrefit";

/** The fields the selection actions read off a run they are about to change. */
interface SelectedRun {
  id: string;
  pageIndex: number;
  fontId: string;
  text: string;
  fill: { r: number; g: number; b: number; a: number };
}

export type FontPickFailure =
  | "serverFontFailed"
  | "embeddingForbidden"
  | "embedFailed"
  | "noGlyphs";

async function serverFontUnavailable(family: string): Promise<boolean> {
  return (
    !(await ensureDeviceFontReady(family)) && serverFaceFor(family) !== null
  );
}

async function fontPickFailure(
  family: string,
  text: string,
): Promise<FontPickFailure | null> {
  if (nearestStandardFont(family) === family) return null;
  if (await serverFontUnavailable(family)) return "serverFontFailed";
  if (isLocalFontEmbeddingForbidden(family)) return "embeddingForbidden";
  return deviceFontDrawsAnyOf(family, text) ? null : "noGlyphs";
}

function liveRuns(store: EditorStore): Map<string, TextRun> {
  const runs = new Map<string, TextRun>();
  for (const page of store.document?.loadedPages() ?? []) {
    for (const run of page.runs) runs.set(run.id, run);
  }
  return runs;
}

/** Bundle of callbacks that operate on the current selection. */
export function useSelectionActions(store: EditorStore) {
  const [fittingScan, setFittingScan] = useState(false);
  const forEachSelectedRun = useCallback(
    (visit: (run: SelectedRun, page: Page) => void) => {
      const sel = store.selection.value;
      const doc = store.document;
      if (!doc || sel.runIds.length === 0) return;
      // Pre-index the selection for O(1) membership in the nested walk.
      const selIds = new Set(sel.runIds);
      for (const page of doc.loadedPages()) {
        for (const run of page.runs) {
          // Locked runs are selectable but must not mutate.
          if (selIds.has(run.id) && !run.locked) visit(run, page);
        }
      }
    },
    [store],
  );

  // One command per run, dispatched as ONE undo step - same reason
  // `deleteSelection` groups its deletes. Select-all now reaches the whole
  // document, so a per-run dispatch left the user hundreds of undos behind and
  // the first Ctrl+Z looked like the restyle had only covered part of the file.
  const dispatchAll = useCallback(
    (cmds: Command[]) => {
      if (cmds.length === 1) store.dispatch(cmds[0]);
      else if (cmds.length > 1) store.dispatch(new CompositeCommand(cmds));
    },
    [store],
  );

  const dispatchAfterScanFit = useCallback(
    async (targets: ScanFitTarget[], build: () => Command[]) => {
      const doc = store.document;
      if (!doc) return;
      const unfitted = scanRunsToFit(doc, targets);
      if (unfitted.length > 0) {
        setFittingScan(true);
        try {
          await prefitInSlices(doc, unfitted);
        } finally {
          setFittingScan(false);
        }
        if (store.document !== doc) return;
      }
      dispatchAll(build());
    },
    [store, dispatchAll],
  );

  const dispatchPerRun = useCallback(
    (build: (run: SelectedRun) => Command | null) => {
      const targets: ScanFitTarget[] = [];
      forEachSelectedRun((run, page) => {
        targets.push({ page, run: run as TextRun });
      });
      return dispatchAfterScanFit(targets, () => {
        const live = liveRuns(store);
        return targets.flatMap(({ run: target }) => {
          const run = live.get(target.id);
          const cmd = run && !run.locked ? build(run) : null;
          return cmd ? [cmd] : [];
        });
      });
    },
    [store, forEachSelectedRun, dispatchAfterScanFit],
  );

  const changeFontSize = useCallback(
    (size: number) => {
      void dispatchPerRun(
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
      void dispatchPerRun(
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
      void dispatchPerRun(
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
    async (family: string): Promise<FontPickFailure | null> => {
      const doc = store.document;
      const targets: SelectedRun[] = [];
      const pages: Page[] = [];
      forEachSelectedRun((run, page) => {
        targets.push(run);
        pages.push(page);
      });
      // Embedding is async and Command.apply is not, so warm the bytes first.
      // A no-op for the built-in families.
      const failure = await fontPickFailure(
        family,
        targets.map((run) => run.text).join(""),
      );
      if (failure) return failure;
      if (store.document !== doc) return null;
      // The command falls back to a standard face when the font will not
      // embed, which would change the text to a font the user never picked.
      if (
        doc &&
        nearestStandardFont(family) !== family &&
        !loadDeviceFontInto(doc, family)
      )
        return "embedFailed";
      await dispatchAfterScanFit(
        targets.map((run, i) => ({ page: pages[i], run: run as TextRun })),
        () => {
          const live = liveRuns(store);
          return targets
            .filter((run) => live.has(run.id))
            .map(
              (run) =>
                new SetFontFamilyCommand({
                  pageIndex: run.pageIndex,
                  runId: run.id,
                  nextFamily: family,
                }),
            );
        },
      );
      return null;
    },
    [store, forEachSelectedRun, dispatchAfterScanFit],
  );

  const toggleItalic = useCallback(async () => {
    const doc = store.document;
    const fonts = loadedExternalFonts();
    const targets: Array<{
      pageIndex: number;
      runId: string;
      family: string;
      device: boolean;
      fit: ScanFitTarget;
    }> = [];
    forEachSelectedRun((run, page) => {
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
        fit: { page, run: run as TextRun },
      });
    });
    // Embedding is async and Command.apply is not, so warm the bytes first.
    const ready: typeof targets = [];
    for (const target of targets) {
      if (target.device && (await serverFontUnavailable(target.family)))
        continue;
      if (target.device && isLocalFontEmbeddingForbidden(target.family))
        continue;
      ready.push(target);
    }
    if (store.document !== doc) return;
    await dispatchAfterScanFit(
      ready.map((target) => target.fit),
      () => {
        const live = liveRuns(store);
        return ready
          .filter((target) => live.has(target.runId))
          .map(
            (target) =>
              new SetFontFamilyCommand({
                pageIndex: target.pageIndex,
                runId: target.runId,
                nextFamily: target.family,
              }),
          );
      },
    );
  }, [store, forEachSelectedRun, dispatchAfterScanFit]);

  const deleteSelection = useCallback(() => {
    const sel = store.selection.value;
    const doc = store.document;
    if (!doc) return;
    if (
      sel.runIds.length === 0 &&
      sel.imageIds.length === 0 &&
      sel.shapeIds.length === 0
    )
      return;
    // Collect one command per object but dispatch them as ONE composite: a
    // 30-object delete must be a single undo step, not 30.
    const cmds: Command[] = [];
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
      for (const shape of page.shapes) {
        if (sel.shapeIds.includes(shape.id)) {
          cmds.push(
            new DeleteShapeCommand({
              pageIndex: shape.pageIndex,
              shapeId: shape.id,
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
    fittingScan,
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
