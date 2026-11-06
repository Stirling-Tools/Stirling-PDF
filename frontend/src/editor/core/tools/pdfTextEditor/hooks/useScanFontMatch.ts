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
  previewScanStyle,
  rerankScanStyles,
  scanBlockUndrawable,
  scanEditOf,
  type RankedStyle,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
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

interface ScanRunRef {
  runId: string;
  pageIndex: number;
}

function wasRedrawn(store: EditorStore, ref: ScanRunRef): boolean {
  const run = store.document?.page(ref.pageIndex).findRun(ref.runId);
  return !!run?.scanEdit && run.scanEdit.created.length > 0;
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
    let cancelled = false;
    const id = window.setTimeout(() => {
      const doc = store.document;
      if (!doc || cancelled) return;
      const page = doc.page(picking.pageIndex);
      const run = page.findRun(picking.runId);
      const undrawable = !!run && scanBlockUndrawable(doc, run);
      const fitted = run ? rerankScanStyles(doc, page, run) : [];
      if (undrawable && fitted[0])
        store.dispatch(
          new SetScanStyleCommand({
            pageIndex: picking.pageIndex,
            runId: picking.runId,
            choice: fitted[0],
          }),
        );
      const ref =
        run && fitted[0]
          ? previewScanStyle(doc, page, run, fitted[0].style)
          : null;
      setRanked({
        runId: picking.runId,
        drawable: !!run && scanFaces().some((f) => faceCovers(f, run.text)),
        ranked: fitted,
        scan: ref ? patchUrl(ref.scan) : null,
        previews: fitted.map((choice) => {
          const p = run ? previewScanStyle(doc, page, run, choice.style) : null;
          return p ? patchUrl(p.drawn) : null;
        }),
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [store, picking, facesVersion]);

  const activeStyle = (() => {
    if (!target) return null;
    const doc = store.document;
    const run = doc?.page(target.pageIndex).findRun(target.runId);
    const state = doc && run ? scanEditOf(doc, run) : null;
    return state?.override.style ?? state?.block?.style ?? null;
  })();

  const choose = useCallback(
    (index: number) => {
      if (!target || !ranked || ranked.runId !== target.runId) return;
      const choice = ranked.ranked[index];
      if (!choice) return;
      store.dispatch(
        new SetScanStyleCommand({
          pageIndex: target.pageIndex,
          runId: target.runId,
          choice,
        }),
      );
      setPicking(null);
    },
    [store, target, ranked],
  );

  if (!target) return null;
  const selectedRun =
    selected &&
    store.document?.page(selected.pageIndex).findRun(selected.runId);
  const undrawable =
    !!selectedRun &&
    !!store.document &&
    scanBlockUndrawable(store.document, selectedRun);
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
      active:
        !!activeStyle &&
        activeStyle.family === choice.style.family &&
        activeStyle.fontSize === choice.style.fontSize,
    })),
    choose,
    open: !!picking,
    canShow: !!selected && (wasRedrawn(store, selected) || undrawable),
    undrawable,
    show: () => setPicking(selected),
    close: () => setPicking(null),
    deviceFonts: {
      permission,
      loading: loadingDevice,
      count: deviceScanFaceCount(),
      load: loadDevice,
    },
  };
}
