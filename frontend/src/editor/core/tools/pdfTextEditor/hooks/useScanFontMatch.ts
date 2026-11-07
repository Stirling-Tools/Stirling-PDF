import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  drawnBlockStyle,
  previewScanStyle,
  rerankScanStyles,
  scanBlockUndrawable,
  scanEditOf,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  preferredScanFace,
  type RankedStyle,
  type ScanStyle,
} from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  FIT_PAUSED,
  withFitDeadline,
} from "@editor/tools/pdfTextEditor/commands/scanStyle";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  FIT_GAP_MS,
  FIT_SLICE_MS,
} from "@editor/tools/pdfTextEditor/hooks/useScanPrefit";
import {
  noteRankedWithCurrentFaces,
  rankedWithCurrentFaces,
} from "@editor/tools/pdfTextEditor/util/scanRankingFaces";
import { SetScanStyleCommand } from "@editor/tools/pdfTextEditor/commands/SetScanStyleCommand";
import type { PixelPatch } from "@editor/tools/pdfTextEditor/pdfium/BackgroundSampler";
import {
  localFontPermission,
  watchLocalFontPermission,
  type LocalFontPermission,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import {
  deviceScanFaceCount,
  faceCovers,
  loadDeviceScanFaces,
  scanFaces,
  subscribeScanFaces,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";

export interface ScanFontChoice {
  label: string;
  match: number;
  preview: string | null;
  active: boolean;
}

export interface ScanFontMatch {
  status: "matching" | "ready" | "unmeasurable" | "noFont";
  scan: string | null;
  choices: ScanFontChoice[];
  choose: (index: number) => void;
  open: boolean;
  canShow: boolean;
  undrawable: boolean;
  typedFromScan: boolean;
  show: () => void;
  close: () => void;
  deviceFonts: {
    permission: LocalFontPermission;
    loading: boolean;
    count: number | null;
    load: () => void;
  };
}

function patchUrl(patch: PixelPatch): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = patch.width;
  canvas.height = patch.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(patch.rgba), patch.width, patch.height),
    0,
    0,
  );
  return canvas.toDataURL();
}

interface Ranked {
  runId: string;
  drawable: boolean;
  ranked: RankedStyle[];
  scan: string | null;
  previews: Array<string | null>;
}

function currentRanking(
  doc: EditorDocument,
  run: TextRun,
): RankedStyle[] | null {
  const block = scanEditOf(doc, run)?.block;
  if (!block || !rankedWithCurrentFaces(block.ranked)) return null;
  const preferred = preferredScanFace(doc);
  const fresh =
    !preferred ||
    block.preferred === preferred ||
    block.ranked.some((r) => r.face.label === preferred);
  return fresh ? block.ranked : null;
}

function inSlice<T>(fit: () => T): T | typeof FIT_PAUSED {
  try {
    return withFitDeadline(performance.now() + FIT_SLICE_MS, fit);
  } catch (e) {
    if (e === FIT_PAUSED) return FIT_PAUSED;
    throw e;
  }
}

function drawnStyle(doc: EditorDocument, run: TextRun): ScanStyle | undefined {
  const state = scanEditOf(doc, run);
  if (!state || state.typedFromScan) return undefined;
  return state.override.style ?? drawnBlockStyle(doc, state) ?? undefined;
}

interface ScanRunRef {
  runId: string;
  pageIndex: number;
}

function runOf(store: EditorStore, ref: ScanRunRef | null) {
  const doc = store.document;
  const run = ref ? doc?.page(ref.pageIndex).findRun(ref.runId) : null;
  return doc && run ? { doc, run } : null;
}

export function useScanFontMatch(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): ScanFontMatch | null {
  const facesVersion = useSyncExternalStore(
    subscribeScanFaces,
    () => scanFaces().length,
    () => scanFaces().length,
  );
  const selected = useMemo<ScanRunRef | null>(() => {
    if (selection.runIds.length !== 1) return null;
    const id = selection.runIds[0];
    for (const page of state.pages)
      for (const run of page.runs)
        if (run.id === id && run.renderMode === 3)
          return { runId: id, pageIndex: page.pageIndex };
    return null;
  }, [selection.runIds, state.pages]);

  const [ranked, setRanked] = useState<Ranked | null>(null);
  const [loadingDevice, setLoadingDevice] = useState(false);
  const [permission, setPermission] =
    useState<LocalFontPermission>("unsupported");
  const [picking, setPicking] = useState<ScanRunRef | null>(null);

  const loadDevice = useCallback(() => {
    setLoadingDevice(true);
    void loadDeviceScanFaces()
      .then(localFontPermission)
      .then(setPermission)
      .finally(() => setLoadingDevice(false));
  }, []);

  useEffect(() => {
    if (!picking) return;
    let stopped = false;
    const settle = (next: LocalFontPermission) => {
      if (stopped) return;
      setPermission(next);
      if (next === "granted" && deviceScanFaceCount() === null) loadDevice();
    };
    void localFontPermission().then(settle);
    const unwatch = watchLocalFontPermission(settle);
    return () => {
      stopped = true;
      unwatch();
    };
  }, [picking, loadDevice]);

  const target = picking ?? selected;

  useEffect(() => {
    if (!picking) return;
    let timer = 0;
    let undrawable: boolean | null = null;
    const attempt = () => {
      const doc = store.document;
      if (!doc) return;
      const page = doc.page(picking.pageIndex);
      const run = page.findRun(picking.runId);
      undrawable ??= !!run && scanBlockUndrawable(doc, run);
      const fitted = run
        ? (currentRanking(doc, run) ??
          inSlice(() => rerankScanStyles(doc, page, run)))
        : [];
      if (fitted === FIT_PAUSED) {
        timer = window.setTimeout(attempt, FIT_GAP_MS);
        return;
      }
      noteRankedWithCurrentFaces(fitted);
      if (undrawable && fitted[0] && run && scanEditOf(doc, run)?.edited)
        store.dispatch(
          new SetScanStyleCommand({
            pageIndex: picking.pageIndex,
            runId: picking.runId,
            choice: fitted[0],
          }),
        );
      const previews = fitted.map((choice) =>
        run ? previewScanStyle(doc, page, run, choice.style) : null,
      );
      setRanked({
        runId: picking.runId,
        drawable: !!run && scanFaces().some((f) => faceCovers(f, run.text)),
        ranked: fitted,
        scan: previews[0] ? patchUrl(previews[0].scan) : null,
        previews: previews.map((p) => (p ? patchUrl(p.drawn) : null)),
      });
    };
    timer = window.setTimeout(attempt, 0);
    return () => window.clearTimeout(timer);
  }, [store, picking, facesVersion]);

  const targetRun = runOf(store, target);
  const activeStyle = targetRun
    ? drawnStyle(targetRun.doc, targetRun.run)
    : undefined;
  const isActive = (choice: RankedStyle) =>
    !!activeStyle &&
    activeStyle.family === choice.style.family &&
    activeStyle.fontSize === choice.style.fontSize;

  const choose = useCallback(
    (index: number) => {
      if (!target || !ranked || ranked.runId !== target.runId) return;
      const choice = ranked.ranked[index];
      if (!choice) return;
      if (!isActive(choice))
        store.dispatch(
          new SetScanStyleCommand({
            pageIndex: target.pageIndex,
            runId: target.runId,
            choice,
          }),
        );
      setPicking(null);
    },
    [store, target, ranked, isActive],
  );

  if (!target) return null;
  const selectedRun = runOf(store, selected);
  const undrawable =
    !!selectedRun && scanBlockUndrawable(selectedRun.doc, selectedRun.run);
  const scanEdit = selectedRun?.run.scanEdit;
  const redrawn = !!scanEdit?.created.length || !!scanEdit?.override.style;
  const current = ranked && ranked.runId === target.runId ? ranked : null;
  return {
    status: !current
      ? "matching"
      : current.ranked.length > 0
        ? "ready"
        : current.drawable
          ? "unmeasurable"
          : "noFont",
    scan: current?.scan ?? null,
    choices: (current?.ranked ?? []).map((choice, i) => ({
      label: choice.face.label,
      match: Math.round(Math.max(0, choice.score) * 100),
      preview: current?.previews[i] ?? null,
      active: isActive(choice),
    })),
    choose,
    open: !!picking,
    canShow: redrawn || undrawable,
    undrawable,
    typedFromScan: !!targetRun?.run.scanEdit?.typedFromScan,
    show: () => {
      setRanked(null);
      setPicking(selected);
    },
    close: () => setPicking(null),
    deviceFonts: {
      permission,
      loading: loadingDevice,
      count: deviceScanFaceCount(),
      load: loadDevice,
    },
  };
}
