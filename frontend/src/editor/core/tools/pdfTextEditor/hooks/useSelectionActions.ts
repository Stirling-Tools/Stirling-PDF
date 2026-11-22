import { wholeFaceLookalike } from "@editor/tools/pdfTextEditor/util/wholeFaceLookalike";
import { useCallback, useRef } from "react";
import { ignoresTextStroke } from "@editor/tools/pdfTextEditor/charcode/fontGlyphs";
import { BOLD_WEIGHT } from "@editor/tools/pdfTextEditor/util/faceNames";
import {
  fauxBoldWidth,
  isFauxBold,
} from "@editor/tools/pdfTextEditor/util/fauxBold";
import { KeepWidthCommand } from "@editor/tools/pdfTextEditor/commands/KeepWidthCommand";
import { DeleteImageCommand } from "@editor/tools/pdfTextEditor/commands/DeleteImageCommand";
import { ReplaceImageCommand } from "@editor/tools/pdfTextEditor/commands/ReplaceImageCommand";
import type { DecodedImage } from "@editor/utils/pdfiumBitmapUtils";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { DeleteShapeCommand } from "@editor/tools/pdfTextEditor/commands/DeleteShapeCommand";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { unsafeRtlEditMessage } from "@editor/tools/pdfTextEditor/commands/readOnlyText";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import {
  KeepObliqueCommand,
  SetObliqueCommand,
} from "@editor/tools/pdfTextEditor/commands/SetObliqueCommand";
import { isFauxItalic } from "@editor/tools/pdfTextEditor/util/fauxItalic";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import {
  rangeRefusal,
  selectedFontStretches,
  selectedPartOfRun,
  StyleTextRangeCommand,
  type FaceStretch,
  type RangeRefusal,
  type SelectedPart,
} from "@editor/tools/pdfTextEditor/commands/StyleTextRangeCommand";
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
import {
  faceKeepingStyle,
  faceStyleOf,
  familyOfFace,
  knownDocumentFamilies,
  restyledFace,
  type FaceSources,
  type FontFamilyEntry,
  type StyleRequest,
} from "@editor/tools/pdfTextEditor/util/fontFaces";
import {
  isBoldWeight,
  type FaceStyle,
} from "@editor/tools/pdfTextEditor/util/faceNames";
import { isScanRun } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  loadedExternalFonts,
  loadExternalFont,
} from "@editor/tools/pdfTextEditor/util/externalFonts";
import { serverFaceFor } from "@editor/tools/pdfTextEditor/util/serverFonts";
import { CompositeCommand } from "@editor/tools/pdfTextEditor/commands/CompositeCommand";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { Affine } from "@editor/tools/pdfTextEditor/types";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { ScanFitTarget } from "@editor/tools/pdfTextEditor/commands/scanFitSlices";
import { useDispatchAfterScanFit } from "@editor/tools/pdfTextEditor/hooks/useDispatchAfterScanFit";
import { needsShaping } from "@editor/tools/pdfTextEditor/util/complexShaping";
import { lineWidthIn } from "@editor/tools/pdfTextEditor/util/wrapText";
import {
  focusedRunCaret,
  focusRunWhenPainted,
  isFocusInContentEditable,
} from "@editor/tools/pdfTextEditor/util/dom";
import {
  SetParagraphFormatCommand,
  type TextAlign,
} from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import {
  caretAfterListToggle,
  listIndentFor,
  mayBeList,
  toggledListText,
  type ListKind,
} from "@editor/tools/pdfTextEditor/util/listText";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { SetLineSpacingCommand } from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";
import { softStartsOf } from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";

function styleWithFauxFaces(fontId: string, run: TextRun): FaceStyle {
  const style = faceStyleOf(fontId);
  return {
    ...style,
    weight: isFauxBold(run) ? BOLD_WEIGHT : style.weight,
    italic: style.italic || isFauxItalic(run),
  };
}

function canFauxBold(request: StyleRequest, run: TextRun): boolean {
  return (
    "bold" in request &&
    request.bold &&
    (run.renderMode ?? 0) === 0 &&
    !run.textReadOnly &&
    !ignoresTextStroke(run.fontId)
  );
}

function canFauxItalic(request: StyleRequest, run: TextRun): boolean {
  return (
    "italic" in request &&
    request.italic &&
    !isScanRun(run) &&
    !run.textReadOnly
  );
}

/** The fields the selection actions read off a run they are about to change. */
interface SelectedRun {
  id: string;
  pageIndex: number;
  fontId: string;
  text: string;
  fill: { r: number; g: number; b: number; a: number };
  textReadOnly: boolean;
  renderMode?: number;
  matrix: Affine;
}

function keptOblique(run: SelectedRun, command: Command): Command {
  return isFauxItalic(run)
    ? new KeepObliqueCommand(command, {
        pageIndex: run.pageIndex,
        runId: run.id,
      })
    : command;
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
  | "someLeftUnchanged"
  | "closestMatch"
  | "styleUnavailable"
  | "styleSkipped"
  | "partOfRunUnsupported"
  | "documentFontCannotDraw";

interface FamilyChange {
  pageIndex: number;
  runId: string;
  family: string;
  text: string;
  restyle?: boolean;
}

/** How many runs a font change reached, how many it left as they were and why, and how many of the changed ones the new font lacks letters of. */
interface FamilyChangeOutcome {
  applied: number;
  undrawable: number;
  wouldLoseText: number;
  notRestored: number;
  unshapeable: number;
  inClosestMatch: number;
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

function isDeviceFace(face: string): boolean {
  return !isDocumentFontId(face) && nearestStandardFont(face) !== face;
}

/**
 * Loads and embeds a device face ahead of the command that draws in it, as
 * Command.apply cannot wait for bytes. Null when `doc` closed meanwhile.
 */
async function embedDeviceFace(
  store: EditorStore,
  doc: EditorDocument,
  face: string,
): Promise<boolean | null> {
  const refused = await prepareExternalFont(face);
  if (store.document !== doc) return null;
  return !refused && tryEmbedDeviceFont(doc, face);
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
    keepLineStarts: change.restyle,
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

/** Moves every run headed for a document face to one lookalike when the face lacks letters of any of them, so runs restyled together match. */
function moveToLookalikeWhereFaceLacks(
  doc: EditorDocument,
  targets: Array<FamilyChange & { fit: ScanFitTarget }>,
): void {
  for (const face of new Set(targets.map((t) => t.family))) {
    const sharing = targets.filter((t) => t.family === face);
    const lookalike = wholeFaceLookalike(
      doc,
      sharing[0].fit.page,
      face,
      sharing.map((t) => t.text).join(" "),
    );
    if (lookalike) for (const target of sharing) target.family = lookalike;
  }
}

function faceSources(doc: EditorDocument | null): FaceSources {
  const fontIds: string[] = [];
  for (const page of doc?.loadedPages() ?? []) {
    for (const run of page.runs) {
      fontIds.push(run.fontId);
      if (run.documentFont) fontIds.push(run.documentFont.fontId);
    }
  }
  return {
    documentFamilies: knownDocumentFamilies(fontIds),
    externalFonts: loadedExternalFonts(),
  };
}

/**
 * The family the font list offers `family` as, standing for it by its regular
 * face; null for a face named outright. A pick of it takes each run to the
 * face nearest its own weight and slant.
 */
function listedFamily(
  doc: EditorDocument | null,
  family: string,
): FontFamilyEntry | null {
  const owner = familyOfFace(family, faceSources(doc));
  return owner?.value === family ? owner : null;
}

/** The warning a font or style change owes the user, or null when it changed everything as asked. */
function changeFailure(
  outcome: FamilyChangeOutcome,
  leftAsIs: number,
): FontPickFailure | null {
  if (outcome.unshapeable > 0) return "needsShaping";
  if (leftAsIs > 0)
    return outcome.applied > 0 ? "styleSkipped" : "styleUnavailable";
  return outcome.inClosestMatch > 0 ? "closestMatch" : null;
}

function liveRuns(store: EditorStore): Map<string, TextRun> {
  const runs = new Map<string, TextRun>();
  for (const page of store.document?.loadedPages() ?? []) {
    for (const run of page.runs) runs.set(run.id, run);
  }
  return runs;
}

/** The width a change to part of a run rewraps its lines at, as typing in it would. */
function rewrapWidth(store: EditorStore, part: SelectedPart): number {
  const { run, page } = part;
  if (store.getState().widthMode === "wrap")
    return run.wrapWidthPt ?? run.bounds.width;
  return page.display.cropLeft + page.display.cropWidth - run.bounds.x;
}

/** What to tell the user when the selected characters cannot be restyled apart from the rest of their run; undefined when they can. */
function refusalFailure(
  store: EditorStore,
  refusal: RangeRefusal | null,
): FontPickFailure | null | undefined {
  if (refusal === "rightToLeft") {
    store.setError(unsafeRtlEditMessage());
    return null;
  }
  if (refusal === "needsShaping") return "needsShaping";
  if (refusal === "unsupported") return "partOfRunUnsupported";
  return undefined;
}

function refusePart(
  store: EditorStore,
  part: SelectedPart,
): FontPickFailure | null | undefined {
  if (part.run.locked) return null;
  const doc = store.document;
  return refusalFailure(
    store,
    doc && rangeRefusal(doc, part.page, part.run, part.range),
  );
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
    (size: number) =>
      dispatchPerRun(
        (run) =>
          keptOblique(
            run,
            new SetFontSizeCommand({
              pageIndex: run.pageIndex,
              runId: run.id,
              nextSize: size,
            }),
          ),
        true,
      ),
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
        inClosestMatch: 0,
      };
      if (doc) await loadScriptFacesFor(doc, drawable);
      if (store.document !== doc) return outcome;
      await dispatchAfterScanFit(
        fit.filter((target) => changing.has(target.run.id)),
        () => {
          // A font picked for a run while these bytes loaded wins; applying this one now would undo it.
          const applies = stillApplies();
          const open = store.document;
          const commands = drawable
            .filter((change) => applies(change.runId))
            .map((change) => ({ change, command: familyCommand(change) }))
            .map(({ change, command }) => ({
              change,
              command,
              coverage: open ? command.coverage(open) : "all",
            }));
          const reachable = commands.filter((c) => c.coverage !== "none");
          const refusals = reachable.map(({ command }) =>
            open ? command.refusal(open) : null,
          );
          const safe = reachable.filter((_, i) => refusals[i] === null);
          outcome.undrawable += commands.length - reachable.length;
          outcome.applied = safe.length;
          outcome.wouldLoseText = refusals.filter(
            (r) => r === "losesText",
          ).length;
          outcome.notRestored = refusals.filter(
            (r) => r === "notRestored",
          ).length;
          outcome.inClosestMatch = safe.filter(
            (c) => c.coverage === "some",
          ).length;
          const live = liveRuns(store);
          return safe.map(({ change, command }) => {
            const run = live.get(change.runId);
            return run ? keptOblique(run, command) : command;
          });
        },
      );
      return outcome;
    },
    [store, dispatchAfterScanFit],
  );

  const restyleSelectedPart = useCallback(
    async (
      part: SelectedPart,
      faceFor: (
        fontIds: string[],
      ) => (fontId: string) => string | null | undefined,
      fallbackFace?: string,
    ): Promise<FontPickFailure | null> => {
      const doc = store.document;
      if (!doc) return null;
      const refused = refusePart(store, part);
      if (refused !== undefined) return refused;
      const stretches = selectedFontStretches(
        doc,
        part.page,
        part.run,
        part.range,
      );
      if (stretches.length === 0) return null;
      const face = faceFor([...new Set(stretches.map((s) => s.fontId))]);
      let leftAsIs = 0;
      const faces: FaceStretch[] = [];
      for (const stretch of stretches) {
        const next = face(stretch.fontId);
        if (next === undefined) continue;
        if (next === null) leftAsIs++;
        else faces.push({ start: stretch.start, end: stretch.end, face: next });
      }
      const ready = new Map<string, string | null>();
      for (const { face: wanted } of faces) {
        if (ready.has(wanted)) continue;
        if (!isDeviceFace(wanted)) {
          ready.set(wanted, wanted);
          continue;
        }
        const embedded = await embedDeviceFace(store, doc, wanted);
        if (embedded === null) return null;
        ready.set(wanted, embedded ? wanted : (fallbackFace ?? null));
      }
      const usable = faces.flatMap((stretch) => {
        const drawn = ready.get(stretch.face);
        if (!drawn) leftAsIs++;
        return drawn ? [{ ...stretch, face: drawn }] : [];
      });
      // The run may have been edited or regrouped while fonts loaded.
      if (part.page.findRun(part.run.id) !== part.run) return null;
      if (usable.length === 0) return leftAsIs > 0 ? "styleUnavailable" : null;
      const command = new StyleTextRangeCommand({
        pageIndex: part.page.index,
        runId: part.run.id,
        faces: usable,
        wrapWidthPt: rewrapWidth(store, part),
      });
      const commandRefused = refusalFailure(store, command.refusal(doc));
      if (commandRefused !== undefined) return commandRefused;
      const coverage = command.coverage(doc);
      if (coverage === "unchanged")
        return leftAsIs > 0 ? "styleUnavailable" : null;
      if (coverage === "none")
        return leftAsIs > 0 ? "styleUnavailable" : "noGlyphs";
      store.dispatch(command);
      if (leftAsIs > 0) return "styleSkipped";
      return coverage === "some" ? "closestMatch" : null;
    },
    [store],
  );

  const changeFontFamily = useCallback(
    async (family: string): Promise<FontPickFailure | null> => {
      const doc = store.document;
      const part = selectedPartOfRun(doc, store.selection.value);
      if (part) {
        const refused = refusePart(store, part);
        if (refused !== undefined) return refused;
        const text = part.run.text.slice(part.range.start, part.range.end);
        if (!isDocumentFontId(family)) {
          const failure = await prepareFamily(store, doc, family, [text]);
          if (failure) return failure;
          if (store.document !== doc) return null;
        }
        const picked = listedFamily(doc, family);
        return restyleSelectedPart(
          part,
          () => (fontId) =>
            picked ? faceKeepingStyle(picked, faceStyleOf(fontId)) : family,
          family,
        );
      }
      const targets: SelectedRun[] = [];
      const fit: ScanFitTarget[] = [];
      forEachSelectedRun((run, page) => {
        targets.push(run);
        fit.push({ page, run: run as TextRun });
      }, true);
      const stillApplies = claimFontChange(targets);
      const picked = listedFamily(doc, family);
      const changes = targets.map((run) => ({
        pageIndex: run.pageIndex,
        runId: run.id,
        family:
          picked && !isScanRun(run)
            ? faceKeepingStyle(picked, faceStyleOf(run.fontId))
            : family,
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
          changes
            .map((c) => c.family)
            .filter((f) => f !== family && !isDocumentFontId(f)),
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
      const unchanged = new Set(
        targets
          .filter((run, i) => changes[i].family === run.fontId)
          .map((run) => run.id),
      );
      const outcome = await dispatchFamilyChanges(
        stillApplies,
        changes.filter((change) => !unchanged.has(change.runId)),
        fit,
      );
      const { applied, undrawable, wouldLoseText, notRestored, unshapeable } =
        outcome;
      if (unshapeable > 0) return "needsShaping";
      if (undrawable + wouldLoseText + notRestored === 0)
        return outcome.inClosestMatch > 0 ? "closestMatch" : null;
      if (applied > 0) return "someLeftUnchanged";
      if (notRestored > 0) return "documentFontCannotDraw";
      return wouldLoseText > 0 ? "missingGlyphs" : "noGlyphs";
    },
    [
      store,
      forEachSelectedRun,
      claimFontChange,
      dispatchFamilyChanges,
      restyleSelectedPart,
    ],
  );

  const restyle = useCallback(
    async (
      request: (styles: FaceStyle[]) => StyleRequest,
    ): Promise<FontPickFailure | null> => {
      const doc = store.document;
      const sources = faceSources(doc);
      const part = selectedPartOfRun(doc, store.selection.value);
      if (part) {
        const selected = part.run.text.slice(part.range.start, part.range.end);
        return restyleSelectedPart(part, (fontIds) => {
          const wanted = request(fontIds.map(faceStyleOf));
          return (fontId) => {
            const face = restyledFace(fontId, wanted, sources);
            if (!face || !doc) return face;
            return wholeFaceLookalike(doc, part.page, face, selected) ?? face;
          };
        });
      }
      const runs: Array<{ run: SelectedRun; fit: ScanFitTarget }> = [];
      forEachSelectedRun((run, page) => {
        runs.push({ run, fit: { page, run: run as TextRun } });
      }, true);
      if (!doc || runs.length === 0) return null;
      const wanted = request(
        runs.map(({ run, fit }) => styleWithFauxFaces(run.fontId, fit.run)),
      );
      let leftAsIs = 0;
      const targets: Array<FamilyChange & { fit: ScanFitTarget }> = [];
      const outlined: Array<{ fit: ScanFitTarget; bold: boolean }> = [];
      const slanted: Array<{ fit: ScanFitTarget; oblique: boolean }> = [];
      for (const { run, fit } of runs) {
        if ("bold" in wanted && isFauxBold(fit.run)) {
          if (!wanted.bold) outlined.push({ fit, bold: false });
          continue;
        }
        if ("italic" in wanted && isFauxItalic(fit.run)) {
          if (!wanted.italic) slanted.push({ fit, oblique: false });
          continue;
        }
        const face = restyledFace(run.fontId, wanted, sources);
        if (face === undefined) continue;
        if (face === null) {
          if (canFauxBold(wanted, fit.run)) outlined.push({ fit, bold: true });
          else if (canFauxItalic(wanted, fit.run))
            slanted.push({ fit, oblique: true });
          else leftAsIs++;
          continue;
        }
        targets.push({
          pageIndex: run.pageIndex,
          runId: run.id,
          family: face,
          text: run.text,
          restyle: true,
          fit,
        });
      }
      moveToLookalikeWhereFaceLacks(doc, targets);
      const stillApplies = claimFontChange(
        targets.map((target) => target.fit.run),
      );
      const ready: Array<FamilyChange & { fit: ScanFitTarget }> = [];
      for (const target of targets) {
        if (isDeviceFace(target.family)) {
          const embedded = await embedDeviceFace(store, doc, target.family);
          if (embedded === null) return null;
          if (!embedded) {
            leftAsIs++;
            continue;
          }
        }
        ready.push(target);
      }
      if (outlined.length > 0)
        await dispatchAfterScanFit(
          outlined.map(({ fit }) => fit),
          () => {
            const live = liveRuns(store);
            return outlined.flatMap(({ fit, bold }) => {
              const run = live.get(fit.run.id);
              if (!run || run.locked) return [];
              return [
                new SetTextOutlineCommand({
                  pageIndex: run.pageIndex,
                  runId: run.id,
                  stroke: bold ? { ...run.fill, a: 255 } : null,
                  width: bold ? fauxBoldWidth(run.fontSize) : 0,
                }),
              ];
            });
          },
        );
      if (slanted.length > 0)
        await dispatchAfterScanFit(
          slanted.map(({ fit }) => fit),
          () => {
            const live = liveRuns(store);
            return slanted.flatMap(({ fit, oblique }) => {
              const run = live.get(fit.run.id);
              if (!run || run.locked) return [];
              return [
                new SetObliqueCommand({
                  pageIndex: run.pageIndex,
                  runId: run.id,
                  oblique,
                }),
              ];
            });
          },
        );
      const outcome = await dispatchFamilyChanges(
        stillApplies,
        ready,
        ready.map((target) => target.fit),
      );
      return changeFailure(
        outcome,
        leftAsIs +
          outcome.undrawable +
          outcome.wouldLoseText +
          outcome.notRestored,
      );
    },
    [
      store,
      forEachSelectedRun,
      claimFontChange,
      dispatchFamilyChanges,
      restyleSelectedPart,
      dispatchAfterScanFit,
    ],
  );

  // A selection that is all one style toggles off; a mixed one goes all on.
  const toggleBold = useCallback(
    () =>
      restyle((styles) => ({
        bold: !styles.every((style) => isBoldWeight(style.weight)),
      })),
    [restyle],
  );

  const setBold = useCallback(
    (bold: boolean) => restyle(() => ({ bold })),
    [restyle],
  );

  const toggleItalic = useCallback(
    () =>
      restyle((styles) => ({
        italic: !styles.every((style) => style.italic),
      })),
    [restyle],
  );

  const changeFontWeight = useCallback(
    (weight: number) => restyle(() => ({ weight })),
    [restyle],
  );

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

  const setAlign = useCallback(
    (align: TextAlign) => {
      void dispatchPerRun(
        (run) =>
          new SetParagraphFormatCommand({
            pageIndex: run.pageIndex,
            runIds: [run.id],
            align,
          }),
        true,
      );
    },
    [dispatchPerRun],
  );

  const toggleUnderline = useCallback(() => {
    const live = liveRuns(store);
    const selected = store.selection.value.runIds.flatMap((id) => {
      const run = live.get(id);
      return run && !run.locked && !run.textReadOnly ? [run] : [];
    });
    if (selected.length === 0) return;
    const underline = !selected.every((run) => run.underline);
    void dispatchPerRun(
      (run) =>
        new SetParagraphFormatCommand({
          pageIndex: run.pageIndex,
          runIds: [run.id],
          underline,
        }),
      true,
    );
  }, [dispatchPerRun, store]);

  const setLineSpacing = useCallback(
    (factor: number) => {
      void dispatchPerRun(
        (run) =>
          new SetLineSpacingCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            factor,
          }),
        true,
      );
    },
    [dispatchPerRun],
  );

  const toggleList = useCallback(
    (kind: ListKind) => {
      const editing = editedRunId();
      const caret = editing ? focusedRunCaret(editing) : null;
      const textBefore = editing ? liveRuns(store).get(editing)?.text : null;
      if (isFocusInContentEditable())
        (document.activeElement as HTMLElement).blur();
      const listed = dispatchPerRun((run) => {
        const live = liveRuns(store).get(run.id);
        const doc = store.document;
        if (!live) return null;
        const nextText = toggledListText(live.text, softStartsOf(live), kind);
        if (nextText === live.text) return null;
        const list = new CompositeCommand([
          new EditTextCommand({
            pageIndex: run.pageIndex,
            runId: run.id,
            nextText,
            explicit: true,
          }),
          new SetParagraphFormatCommand({
            pageIndex: run.pageIndex,
            runIds: [run.id],
            listIndent:
              doc && mayBeList(nextText)
                ? listIndentFor(
                    nextText,
                    lineWidthIn(doc, doc.page(run.pageIndex), live),
                  )
                : 0,
          }),
        ]);
        return new KeepWidthCommand(keptOblique(run, list), {
          pageIndex: run.pageIndex,
          runId: run.id,
        });
      }, true);
      if (!editing || textBefore == null) return;
      void listed.then(() => {
        const textAfter = liveRuns(store).get(editing)?.text;
        if (textAfter == null) return;
        const offset =
          caret === null
            ? null
            : caretAfterListToggle(textBefore, textAfter, caret);
        focusRunWhenPainted(
          editing,
          offset === null,
          undefined,
          offset ?? undefined,
        );
      });
    },
    [dispatchPerRun, store],
  );

  return {
    fittingScan,
    setAlign,
    toggleUnderline,
    setLineSpacing,
    toggleList,
    changeFontSize,
    changeFill,
    changeOutline,
    changeFontFamily,
    toggleBold,
    setBold,
    toggleItalic,
    changeFontWeight,
    deleteSelection,
    replaceSelectedImage,
    replaceImageById,
    duplicateFirstSelected,
  };
}

function editedRunId(): string | null {
  if (!isFocusInContentEditable()) return null;
  const box = (document.activeElement as HTMLElement).closest<HTMLElement>(
    "[data-run-id]",
  );
  return box?.dataset.runId ?? null;
}
