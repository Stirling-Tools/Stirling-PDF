/**
 * Measurement state shared by the viewer overlay (which draws and edits
 * measurements) and the Measure tool panel (which lists them and owns scale
 * and display settings). Holds the measurements and scales of the file the
 * viewer is showing; the viewer binds that file with `bindFile`.
 *
 * Measurements and scales persist per file in sessionStorage; display
 * settings persist per browser in localStorage.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import type {
  FileMeasureScales,
  Measurement,
  MeasurementDisplaySettings,
  MeasurementKind,
  MeasureScale,
  PageMeasureScales,
  PagePoint,
} from "@editor/utils/measurementTypes";
import {
  loadSessionMap,
  normalizeFileScales,
  normalizeMeasurement,
  polygonCentroid,
  resolvePageScale,
  resolveScale,
  saveSessionMap,
  type PageView,
} from "@editor/utils/measurementUtils";
import {
  getMeasurementDisplaySettings,
  setMeasurementDisplaySettings,
} from "@editor/utils/measurementPreferences";
import { extractPageMeasureScales } from "@editor/utils/pdfMeasurementExtraction";

export type MeasureMode = MeasurementKind | "calibrate";

/** Where a newly set scale applies: every page, or only the given page. */
export type ScaleTarget = { kind: "all" } | { kind: "page"; pageIndex: number };

/** What the panel can do to the shape being drawn on the viewer. */
export interface DrawingActions {
  /** Keep the points placed so far, if there are enough for a measurement. */
  finish: () => void;
  cancel: () => void;
}

export interface CalibrationSample {
  start: PagePoint;
  end: PagePoint;
  pdfDistancePts: number;
}

const SCALES_STORAGE_KEY = "stirling_scales";
const MEASUREMENTS_STORAGE_KEY = "stirling_measurements";
const EMPTY_SCALES: FileMeasureScales = { defaultScale: null, pageScales: {} };

interface MeasurementContextValue {
  fileKey: string | null;
  measurements: Measurement[];
  fileScales: FileMeasureScales;
  embeddedScales: PageMeasureScales | null;
  /** True while the Measure tool is the selected tool. */
  isToolOpen: boolean;
  mode: MeasureMode;
  setMode: (mode: MeasureMode) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  /** Points placed so far in the shape being drawn; 0 when idle. */
  draftPointCount: number;
  setDraftPointCount: (count: number) => void;
  /** Lets the overlay, which owns the shape being drawn, take finish/cancel. */
  registerDrawingActions: (actions: DrawingActions) => () => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;
  settings: MeasurementDisplaySettings;
  updateSettings: (patch: Partial<MeasurementDisplaySettings>) => void;
  /** Whether scale edits in the panel apply to every page or the current one. */
  scaleTargetKind: ScaleTarget["kind"];
  setScaleTargetKind: (kind: ScaleTarget["kind"]) => void;

  /**
   * How a page is displayed (size and rotation), so values can be shown as
   * the user sees them. Null until the viewer has laid the page out.
   */
  pageViewFor: (pageIndex: number) => PageView | null;
  /** Lets the overlay, which can read the page layout, answer pageViewFor. */
  registerPageViewProvider: (
    provider: (pageIndex: number) => PageView | null,
  ) => () => void;
  /** Called when page rotation changes, so pageViewFor consumers re-render. */
  notifyPageViewChange: () => void;
  /** Changes whenever pageViewFor's answers may have; a memo dependency. */
  pageViewVersion: number;

  addMeasurement: (kind: MeasurementKind, points: PagePoint[]) => string;
  updateMeasurement: (
    id: string,
    patch: Partial<Omit<Measurement, "id">>,
  ) => void;
  deleteMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  /** Drop a file's measurements, whether or not it is the one being viewed. */
  clearMeasurementsFor: (fileKey: string) => void;

  setScale: (scale: MeasureScale | null, target: ScaleTarget) => void;
  scaleFor: (measurement: Pick<Measurement, "points">) => MeasureScale | null;
  scaleForPage: (pageIndex: number) => MeasureScale | null;

  calibrationSample: CalibrationSample | null;
  submitCalibrationSample: (sample: CalibrationSample) => void;
  cancelCalibration: () => void;
  applyCalibration: (scale: MeasureScale) => void;

  /** Give another file (e.g. a new version of this one) the current scales. */
  copyScalesTo: (fileKey: string) => void;
  /** Called by the viewer when the displayed file changes. */
  bindFile: (fileKey: string | null, fileBlob: Blob | null) => void;
}

const MeasurementContext = createContext<MeasurementContextValue | null>(null);

let measurementIdCounter = 0;

function createMeasurementId(): string {
  measurementIdCounter += 1;
  return `measure-${Date.now().toString(36)}-${measurementIdCounter.toString(36)}`;
}

function readStoredMeasurements(fileKey: string): Measurement[] | undefined {
  const stored = loadSessionMap(MEASUREMENTS_STORAGE_KEY);
  if (!(fileKey in stored)) return undefined;
  const value = stored[fileKey];
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeMeasurement)
    .filter((m): m is Measurement => m !== null);
}

function readStoredScales(fileKey: string): FileMeasureScales | undefined {
  const stored = loadSessionMap(SCALES_STORAGE_KEY);
  if (!(fileKey in stored)) return undefined;
  return normalizeFileScales(stored[fileKey]);
}

export function MeasurementProvider({ children }: { children: ReactNode }) {
  const { selectedTool } = useNavigationState();
  const isToolOpen = selectedTool === "measure";

  const [fileKey, setFileKey] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [fileScales, setFileScales] = useState<FileMeasureScales>(EMPTY_SCALES);
  const [embeddedScales, setEmbeddedScales] =
    useState<PageMeasureScales | null>(null);
  const [mode, setModeState] = useState<MeasureMode>("distance");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPointCount, setDraftPointCount] = useState(0);
  const drawingActionsRef = useRef<DrawingActions | null>(null);
  const pageViewProviderRef = useRef<
    ((pageIndex: number) => PageView | null) | null
  >(null);
  const [pageViewVersion, setPageViewVersion] = useState(0);

  const registerPageViewProvider = useCallback(
    (provider: (pageIndex: number) => PageView | null) => {
      pageViewProviderRef.current = provider;
      setPageViewVersion((n) => n + 1);
      return () => {
        if (pageViewProviderRef.current === provider) {
          pageViewProviderRef.current = null;
        }
      };
    },
    [],
  );
  const notifyPageViewChange = useCallback(
    () => setPageViewVersion((n) => n + 1),
    [],
  );
  const pageViewFor = useCallback(
    (pageIndex: number) => pageViewProviderRef.current?.(pageIndex) ?? null,
    [],
  );

  const registerDrawingActions = useCallback((actions: DrawingActions) => {
    drawingActionsRef.current = actions;
    return () => {
      if (drawingActionsRef.current === actions) {
        drawingActionsRef.current = null;
      }
    };
  }, []);
  const finishDrawing = useCallback(
    () => drawingActionsRef.current?.finish(),
    [],
  );
  const cancelDrawing = useCallback(
    () => drawingActionsRef.current?.cancel(),
    [],
  );
  const [settings, setSettings] = useState<MeasurementDisplaySettings>(
    getMeasurementDisplaySettings,
  );
  const [scaleTargetKind, setScaleTargetKind] =
    useState<ScaleTarget["kind"]>("all");
  const [calibrationSample, setCalibrationSample] =
    useState<CalibrationSample | null>(null);

  // Calibration is a detour: finishing or cancelling it returns here.
  const modeBeforeCalibrationRef = useRef<MeasurementKind>("distance");
  // Survives sessionStorage being unavailable or trimmed.
  const memoryRef = useRef(
    new Map<
      string,
      { measurements: Measurement[]; scales: FileMeasureScales }
    >(),
  );
  const fileKeyRef = useRef<string | null>(null);

  const remember = useCallback(
    (
      key: string,
      next: Partial<{ measurements: Measurement[]; scales: FileMeasureScales }>,
    ) => {
      const previous = memoryRef.current.get(key) ?? {
        measurements: [],
        scales: EMPTY_SCALES,
      };
      memoryRef.current.set(key, { ...previous, ...next });
    },
    [],
  );

  const commitMeasurements = useCallback(
    (updater: (current: Measurement[]) => Measurement[]) => {
      setMeasurements((current) => {
        const next = updater(current);
        const key = fileKeyRef.current;
        if (key) {
          remember(key, { measurements: next });
          saveSessionMap(MEASUREMENTS_STORAGE_KEY, key, next);
        }
        return next;
      });
    },
    [remember],
  );

  const bindFile = useCallback(
    (nextKey: string | null, nextBlob: Blob | null) => {
      setFileBlob(nextBlob);
      if (fileKeyRef.current === nextKey) return;
      fileKeyRef.current = nextKey;
      setFileKey(nextKey);
      setSelectedId(null);
      setCalibrationSample(null);
      setEmbeddedScales(null);

      if (!nextKey) {
        setMeasurements([]);
        setFileScales(EMPTY_SCALES);
        return;
      }
      const memory = memoryRef.current.get(nextKey);
      setMeasurements(
        readStoredMeasurements(nextKey) ?? memory?.measurements ?? [],
      );
      setFileScales(
        readStoredScales(nextKey) ?? memory?.scales ?? EMPTY_SCALES,
      );
    },
    [],
  );

  const needsEmbeddedScales = isToolOpen || measurements.length > 0;
  useEffect(() => {
    if (!fileBlob || !needsEmbeddedScales) return;
    let cancelled = false;
    extractPageMeasureScales(fileBlob)
      .then((scales) => {
        if (!cancelled) setEmbeddedScales(scales);
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[Measurement] Failed to read PDF scales", error);
          setEmbeddedScales(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileBlob, needsEmbeddedScales]);

  useEffect(() => {
    if (!isToolOpen) {
      setCalibrationSample(null);
      setSelectedId(null);
      setModeState((current) =>
        current === "calibrate" ? modeBeforeCalibrationRef.current : current,
      );
    }
  }, [isToolOpen]);

  const setMode = useCallback((next: MeasureMode) => {
    setModeState((current) => {
      if (next === "calibrate" && current !== "calibrate") {
        modeBeforeCalibrationRef.current = current;
      }
      return next;
    });
    setCalibrationSample(null);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<MeasurementDisplaySettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        setMeasurementDisplaySettings(next);
        return next;
      });
    },
    [],
  );

  const addMeasurement = useCallback(
    (kind: MeasurementKind, points: PagePoint[]) => {
      const id = createMeasurementId();
      const { defaultColor, defaultStrokeWidth } = settings;
      commitMeasurements((current) => [
        ...current,
        {
          id,
          kind,
          points,
          color: defaultColor,
          strokeWidth: defaultStrokeWidth,
        },
      ]);
      return id;
    },
    [commitMeasurements, settings],
  );

  const updateMeasurement = useCallback(
    (id: string, patch: Partial<Omit<Measurement, "id">>) => {
      commitMeasurements((current) =>
        current.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      );
    },
    [commitMeasurements],
  );

  const deleteMeasurement = useCallback(
    (id: string) => {
      commitMeasurements((current) => current.filter((m) => m.id !== id));
      setSelectedId((current) => (current === id ? null : current));
    },
    [commitMeasurements],
  );

  const clearMeasurements = useCallback(() => {
    commitMeasurements(() => []);
    setSelectedId(null);
  }, [commitMeasurements]);

  const clearMeasurementsFor = useCallback(
    (key: string) => {
      if (key === fileKeyRef.current) {
        clearMeasurements();
        return;
      }
      remember(key, { measurements: [] });
      saveSessionMap(MEASUREMENTS_STORAGE_KEY, key, []);
    },
    [clearMeasurements, remember],
  );

  const setScale = useCallback(
    (scale: MeasureScale | null, target: ScaleTarget) => {
      setFileScales((current) => {
        let next: FileMeasureScales;
        if (target.kind === "all") {
          // A whole-file scale replaces per-page ones so the result is what
          // the user just chose, everywhere.
          next = { defaultScale: scale, pageScales: {} };
        } else {
          const pageScales = { ...current.pageScales };
          if (scale) {
            pageScales[target.pageIndex] = scale;
          } else {
            delete pageScales[target.pageIndex];
          }
          next = { ...current, pageScales };
        }
        const key = fileKeyRef.current;
        if (key) {
          remember(key, { scales: next });
          saveSessionMap(SCALES_STORAGE_KEY, key, next);
        }
        return next;
      });
    },
    [remember],
  );

  const copyScalesTo = useCallback(
    (targetKey: string) => {
      remember(targetKey, { scales: fileScales });
      saveSessionMap(SCALES_STORAGE_KEY, targetKey, fileScales);
    },
    [fileScales, remember],
  );

  const scaleFor = useCallback(
    (measurement: Pick<Measurement, "points">) => {
      const first = measurement.points[0];
      if (!first) return null;
      return resolveScale(
        first.pageIndex,
        polygonCentroid(measurement.points),
        fileScales,
        embeddedScales,
      );
    },
    [embeddedScales, fileScales],
  );

  const scaleForPage = useCallback(
    (pageIndex: number) =>
      resolvePageScale(pageIndex, fileScales, embeddedScales),
    [embeddedScales, fileScales],
  );

  const submitCalibrationSample = useCallback((sample: CalibrationSample) => {
    setCalibrationSample(sample);
  }, []);

  const cancelCalibration = useCallback(() => {
    setCalibrationSample(null);
    setModeState(modeBeforeCalibrationRef.current);
  }, []);

  const applyCalibration = useCallback(
    (scale: MeasureScale) => {
      const sample = calibrationSample;
      setScale(
        scale,
        scaleTargetKind === "page" && sample
          ? { kind: "page", pageIndex: sample.start.pageIndex }
          : { kind: "all" },
      );
      setCalibrationSample(null);
      setModeState(modeBeforeCalibrationRef.current);
    },
    [calibrationSample, scaleTargetKind, setScale],
  );

  const value = useMemo<MeasurementContextValue>(
    () => ({
      fileKey,
      measurements,
      fileScales,
      embeddedScales,
      isToolOpen,
      mode,
      setMode,
      selectedId,
      setSelectedId,
      draftPointCount,
      setDraftPointCount,
      registerDrawingActions,
      finishDrawing,
      cancelDrawing,
      pageViewFor,
      registerPageViewProvider,
      notifyPageViewChange,
      pageViewVersion,
      clearMeasurementsFor,
      settings,
      updateSettings,
      scaleTargetKind,
      setScaleTargetKind,
      addMeasurement,
      updateMeasurement,
      deleteMeasurement,
      clearMeasurements,
      setScale,
      scaleFor,
      scaleForPage,
      calibrationSample,
      submitCalibrationSample,
      cancelCalibration,
      applyCalibration,
      copyScalesTo,
      bindFile,
    }),
    [
      fileKey,
      measurements,
      fileScales,
      embeddedScales,
      isToolOpen,
      mode,
      setMode,
      selectedId,
      draftPointCount,
      registerDrawingActions,
      finishDrawing,
      cancelDrawing,
      pageViewFor,
      registerPageViewProvider,
      notifyPageViewChange,
      pageViewVersion,
      clearMeasurementsFor,
      settings,
      updateSettings,
      scaleTargetKind,
      addMeasurement,
      updateMeasurement,
      deleteMeasurement,
      clearMeasurements,
      setScale,
      scaleFor,
      scaleForPage,
      calibrationSample,
      submitCalibrationSample,
      cancelCalibration,
      applyCalibration,
      copyScalesTo,
      bindFile,
    ],
  );

  return (
    <MeasurementContext.Provider value={value}>
      {children}
    </MeasurementContext.Provider>
  );
}

export function useMeasurements(): MeasurementContextValue {
  const context = useContext(MeasurementContext);
  if (!context) {
    throw new Error(
      "useMeasurements must be used within a MeasurementProvider",
    );
  }
  return context;
}
