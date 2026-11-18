import { useCallback, useRef } from "react";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import { ReplaceImageCommand } from "@editor/tools/pdfTextEditor/commands/ReplaceImageCommand";
import type { DecodedImage } from "@editor/utils/pdfiumBitmapUtils";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { unsafeRtlEditMessage } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import { parseCssColor } from "@editor/tools/pdfTextEditor/model/Color";
import {
  drawsSomeOf,
  familyCoverage,
  loadDeviceFontInto,
  visibleCodePoints,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  loadScriptScanFaces,
  scanScriptsOf,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import {
  isDocumentFontId,
  nearestStandardFont,
} from "@editor/tools/pdfTextEditor/util/fontFamily";
import { isItalicFont } from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import {
  italicCapability,
  italicCutOf,
} from "@editor/tools/pdfTextEditor/util/fontCapability";
import {
  loadedExternalFonts,
  loadExternalFont,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import { serverFaceFor } from "@editor/tools/pdfTextEditor/util/serverFonts";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { ScanFitTarget } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import { useDispatchAfterScanFit } from "@editor/tools/pdfTextEditor/hooks/useDispatchAfterScanFit";
import { needsShaping } from "@editor/tools/pdfTextEditor/util/complexShaping";

/** The fields the selection actions read off a run they are about to change. */
interface SelectedRun {
  id: string;
  pageIndex: number;
  fontId: string;
  text: string;
  fill: { r: number; g: number; b: number; a: number };
  textReadOnly: boolean;
}

/** `redraws` is for an action that redraws, rescales or restyles text: it leaves out the lines the editor cannot redraw and says so. */
type VisitSelectedRuns = (
  visit: (run: SelectedRun, page: Page) => void,
  redraws?: boolean,
) => void;

export type FontPickFailure =
  | "needsShaping"
  | "serverFontFailed"
  | "embeddingForbidden"
  | "embedFailed"
  | "noGlyphs"
  | "missingGlyphs"
  | "documentFontCannotDraw"
  | "someLeftUnchanged";

interface FamilyChange {
  pageIndex: number;
  runId: string;
  family: string;
  text: string;
}

/** How many runs a font change reached, and how many it left as they were and why. */
interface FamilyChangeOutcome {
  applied: number;
  undrawable: number;
  wouldLoseText: number;
  notRestored: number;
  unshapeable: number;
}

/** Loads the family's bytes; the failure that must stop the pick, or null to go on. */
async function prepareExternalFont(
  family: string,
): Promise<FontPickFailure | null> {
  const load = await loadExternalFont(family);
  if ("bytes" in load) return null;
  if (serverFaceFor(family)) return "serverFontFailed";
  return load.refused === "licence" ? "embeddingForbidden" : null;
}

function tryEmbedDeviceFont(doc: EditorDocument, family: string): boolean {
  return loadDeviceFontInto(doc, family) !== 0;
}

async function fontPickFailure(
  doc: EditorDocument | null,
  family: string,
  texts: string[],
): Promise<FontPickFailure | null> {
  if (nearestStandardFont(family) !== family) {
    const refusal = await prepareExternalFont(family);
    if (refusal) return refusal;
  }
  const draws = familyCoverage(doc, family);
  return texts.length === 0 || texts.some((text) => drawsSomeOf(draws, text))
    ? null
    : "noGlyphs";
}

/** Null when the family is ready to draw at least one of `texts`, or when `doc` is no longer the open document, which callers check for themselves. */
async function prepareFamily(
  store: EditorStore,
  doc: EditorDocument | null,
  family: string,
  texts: string[],
): Promise<FontPickFailure | null> {
  // Embedding is async and Command.apply is not, so warm the bytes first.
  // A no-op for the built-in families.
  const failure = await fontPickFailure(doc, family, texts);
  if (failure) return failure;
  // Another document may have opened during the download; this one's PDFium handle is then gone.
  if (!doc || store.document !== doc) return null;
  // Refuse here, as the command would fall back to a standard face the user never picked.
  if (
    nearestStandardFont(family) !== family &&
    !tryEmbedDeviceFont(doc, family)
  )
    return "embedFailed";
  return null;
}

function familyCommand(change: FamilyChange): SetFontFamilyCommand {
  return new SetFontFamilyCommand({
    pageIndex: change.pageIndex,
    runId: change.runId,
    nextFamily: change.family,
  });
}

/**
 * Fetch the script fonts that draw text a change would otherwise leave
 * undrawn. Typed text gets them the same way, by being redrawn once they are
 * in; a font change is refused instead of drawn short, so they are fetched first.
 */
async function loadScriptFacesFor(
  doc: EditorDocument,
  changes: FamilyChange[],
): Promise<void> {
  const lost = changes
    .filter((change) => {
      if (isDocumentFontId(change.family)) return false;
      const covers = familyCoverage(doc, change.family);
      return (
        covers !== null &&
        visibleCodePoints(change.text).some((cp) => !covers(cp))
      );
    })
    .filter((change) => familyCommand(change).wouldLoseText(doc))
    .map((change) => change.text)
    .join("");
  const scripts = scanScriptsOf(lost);
  if (scripts.length > 0)
    await loadScriptScanFaces(scripts).catch(() => undefined);
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
  const { busy: fittingScan, dispatch: dispatchAfterScanFit } =
    useDispatchAfterScanFit(store);
  const forEachSelectedRun = useCallback<VisitSelectedRuns>(
    (visit, redraws = false) => {
      const sel = store.selection.value;
      const doc = store.document;
      if (!doc || sel.runIds.length === 0) return;
      // Pre-index the selection for O(1) membership in the nested walk.
      const selIds = new Set(sel.runIds);
      let refused = false;
      for (const page of doc.loadedPages()) {
        for (const run of page.runs) {
          // Locked runs are selectable but must not mutate.
          if (!selIds.has(run.id) || run.locked) continue;
          if (redraws && run.textReadOnly) refused = true;
          else visit(run, page);
        }
      }
      if (refused) store.setError(unsafeRtlEditMessage());
    },
    [store],
  );

  const dispatchPerRun = useCallback(
    (build: (run: SelectedRun) => Command | null, redraws = false) => {
      const targets: ScanFitTarget[] = [];
      forEachSelectedRun((run, page) => {
        targets.push({ page, run: run as TextRun });
      }, redraws);
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
        true,
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
        true,
      );
    },
    [dispatchPerRun],
  );

  const fontRequests = useRef({
    last: 0,
    latestByRun: new Map<string, number>(),
  });
  const claimFontChange = useCallback(
    (runs: SelectedRun[]) => {
      const requests = fontRequests.current;
      const request = ++requests.last;
      const doc = store.document;
      const claimed = new Map(runs.map((run) => [run.id, run]));
      for (const run of runs) requests.latestByRun.set(run.id, request);
      return () => {
        // Run ids repeat across documents, so a change outliving its document would hit unrelated text.
        if (!doc || store.document !== doc) return () => false;
        // Regrouping rebuilds the runs under the same ids, so only the run object that was picked still means the same text.
        const editable = new Set<string>();
        for (const page of doc.loadedPages()) {
          for (const run of page.runs)
            if (!run.locked && claimed.get(run.id) === run)
              editable.add(run.id);
        }
        return (runId: string) =>
          editable.has(runId) && requests.latestByRun.get(runId) === request;
      };
    },
    [store],
  );

  const dispatchFamilyChanges = useCallback(
    async (
      stillApplies: () => (runId: string) => boolean,
      changes: FamilyChange[],
      fit: ScanFitTarget[],
    ): Promise<FamilyChangeOutcome> => {
      const doc = store.document;
      const shapeable = changes.filter((change) => !needsShaping(change.text));
      // Run by run: one with none of its letters in the family would be named after a font it is not drawn in, so it stays as it is.
      const drawable = shapeable.filter(
        (change) =>
          isDocumentFontId(change.family) ||
          drawsSomeOf(familyCoverage(doc, change.family), change.text),
      );
      const changing = new Set(drawable.map((change) => change.runId));
      const outcome = {
        applied: 0,
        undrawable: shapeable.length - drawable.length,
        wouldLoseText: 0,
        notRestored: 0,
        unshapeable: changes.length - shapeable.length,
      };
      if (doc) await loadScriptFacesFor(doc, drawable);
      if (store.document !== doc) return outcome;
      await dispatchAfterScanFit(
        fit.filter((target) => changing.has(target.run.id)),
        () => {
          // A font picked for a run while these bytes loaded wins; applying this one now would undo it.
          const applies = stillApplies();
          const commands = drawable
            .filter((change) => applies(change.runId))
            .map(familyCommand);
          const open = store.document;
          const refusals = commands.map((command) =>
            open ? command.refusal(open) : null,
          );
          outcome.applied = refusals.filter((r) => r === null).length;
          outcome.wouldLoseText = refusals.filter(
            (r) => r === "losesText",
          ).length;
          outcome.notRestored = refusals.filter(
            (r) => r === "notRestored",
          ).length;
          return commands.filter((_, i) => refusals[i] === null);
        },
      );
      return outcome;
    },
    [store, dispatchAfterScanFit],
  );

  const changeFontFamily = useCallback(
    async (family: string): Promise<FontPickFailure | null> => {
      const doc = store.document;
      const targets: SelectedRun[] = [];
      const fit: ScanFitTarget[] = [];
      forEachSelectedRun((run, page) => {
        targets.push(run);
        fit.push({ page, run: run as TextRun });
      }, true);
      const stillApplies = claimFontChange(targets);
      const changes = targets.map((run) => ({
        pageIndex: run.pageIndex,
        runId: run.id,
        // The list offers bold cuts as their own entries but italic only through its toggle.
        family:
          isDocumentFontId(family) || !isItalicFont(run.fontId)
            ? family
            : italicCutOf(family),
        text: run.text,
      }));
      if (
        changes.length > 0 &&
        changes.every((change) => needsShaping(change.text))
      )
        return "needsShaping";
      if (!isDocumentFontId(family)) {
        const failure = await prepareFamily(
          store,
          doc,
          family,
          changes.map((change) => change.text),
        );
        if (failure) return failure;
        if (store.document !== doc) return null;
        const styled = new Set(
          changes.map((c) => c.family).filter((f) => f !== family),
        );
        for (const face of styled) {
          const texts = changes
            .filter((c) => c.family === face)
            .map((c) => c.text);
          // A styled cut that will not load is not worth refusing the family the user picked.
          if (await prepareFamily(store, doc, face, texts)) {
            for (const change of changes)
              if (change.family === face) change.family = family;
          }
          if (store.document !== doc) return null;
        }
      }
      // A run whose letters the styled cut lacks may still have them in the family that was picked.
      for (const change of changes) {
        if (
          change.family !== family &&
          !drawsSomeOf(familyCoverage(doc, change.family), change.text)
        )
          change.family = family;
      }
      const { applied, undrawable, wouldLoseText, notRestored, unshapeable } =
        await dispatchFamilyChanges(stillApplies, changes, fit);
      if (unshapeable > 0) return "needsShaping";
      if (undrawable + wouldLoseText + notRestored === 0) return null;
      if (applied > 0) return "someLeftUnchanged";
      if (notRestored > 0) return "documentFontCannotDraw";
      return wouldLoseText > 0 ? "missingGlyphs" : "noGlyphs";
    },
    [store, forEachSelectedRun, claimFontChange, dispatchFamilyChanges],
  );

  const toggleItalic = useCallback(async () => {
    const doc = store.document;
    const fonts = loadedExternalFonts();
    const targets: Array<
      FamilyChange & { device: boolean; fit: ScanFitTarget }
    > = [];
    forEachSelectedRun((run, page) => {
      const cap = italicCapability(
        run.fontId,
        !isItalicFont(run.fontId),
        fonts,
      );
      // No real italic cut for this face. Leave it alone: swapping the
      // document's own font for Helvetica-Oblique is not making it italic.
      if (!cap.family) return;
      targets.push({
        pageIndex: run.pageIndex,
        runId: run.id,
        family: cap.family,
        text: run.text,
        device: cap.source === "device",
        fit: { page, run: run as TextRun },
      });
    }, true);
    const stillApplies = claimFontChange(
      targets.map((target) => target.fit.run),
    );
    // Embedding is async and Command.apply is not, so warm the bytes first.
    const ready: Array<FamilyChange & { fit: ScanFitTarget }> = [];
    for (const target of targets) {
      if (target.device) {
        if (await prepareExternalFont(target.family)) continue;
        if (!doc || store.document !== doc) return;
        if (!tryEmbedDeviceFont(doc, target.family)) continue;
      }
      ready.push(target);
    }
    await dispatchFamilyChanges(
      stillApplies,
      ready,
      ready.map((target) => target.fit),
    );
  }, [store, forEachSelectedRun, claimFontChange, dispatchFamilyChanges]);

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
