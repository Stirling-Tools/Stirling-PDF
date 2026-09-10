import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useFileSelection, useAllFiles } from "@app/contexts/FileContext";
import {
  useNavigationActions,
  useNavigationState,
} from "@app/contexts/NavigationContext";
import { getDefaultWorkbench } from "@app/types/workbench";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { generateId } from "@app/utils/generateId";
import {
  distance,
  computeValue,
  roundTo2,
  detectScaleFromText,
} from "@app/tools/takeoff/geometry";
import type {
  TakeoffAnnotation,
  TakeoffAnnotationType,
  TakeoffMaterial,
  TakeoffPageScale,
  TakeoffPoint,
} from "@app/tools/takeoff/types";

const DEFAULT_ZOOM = 1.2;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;

// 1 PDF point = 1/72 inch, at 100% print scale.
const MM_PER_POINT = 25.4 / 72;
const MM_PER_UNIT: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  ft: 304.8,
  in: 25.4,
};

// Estimates the drawing's architectural ratio (the "1:N" a title block would
// print) from a calibration, purely so it can be shown next to the scale
// badge as a sanity-check against what's printed on the sheet.
export function estimateArchitecturalRatio(
  scale: TakeoffPageScale,
): number | null {
  const mmPerUnit = MM_PER_UNIT[scale.unit];
  if (!mmPerUnit) return null;
  const realMm = scale.real * mmPerUnit;
  const paperMm = scale.pointsSpan * MM_PER_POINT;
  if (paperMm <= 0) return null;
  return realMm / paperMm;
}

export type TakeoffDragState = {
  kind: "length" | "radius" | "diameter" | "calibrate";
  start: TakeoffPoint;
  current: TakeoffPoint;
};

// Tools drawn as a closed multi-point shape via click-to-add-point +
// double-click-to-finish (as opposed to a single drag, or angle's
// auto-finishing 3-click sequence).
const CLOSED_SHAPE_TOOLS: TakeoffAnnotationType[] = [
  "area",
  "perimeter",
  "volume",
];

function closedShapeDefaultUnit(tool: TakeoffAnnotationType): string {
  if (tool === "volume") return "m3";
  if (tool === "perimeter") return "lm";
  return "m2";
}

function affectedIds(
  materialId: string,
  materials: TakeoffMaterial[],
): Set<string> {
  const ids = new Set([materialId]);
  const m = materials.find((mm) => mm.id === materialId);
  if (m?.deductsFromMaterialId) ids.add(m.deductsFromMaterialId);
  return ids;
}

function recomputeIds(
  ids: Set<string>,
  materials: TakeoffMaterial[],
  annotations: TakeoffAnnotation[],
  pageScales: Record<number, TakeoffPageScale>,
): TakeoffMaterial[] {
  return materials.map((m) =>
    ids.has(m.id)
      ? {
          ...m,
          quantity:
            roundTo2(computeValue(m, materials, annotations, pageScales)) ??
            m.quantity,
        }
      : m,
  );
}

const AUTO_UNITS = ["lm", "m2", "ea", "m3", "°"];
function syncDefaultUnit(
  materials: TakeoffMaterial[],
  materialId: string,
  defaultUnit: string,
): TakeoffMaterial[] {
  return materials.map((m) => {
    if (m.id !== materialId) return m;
    if (m.unit !== "" && !AUTO_UNITS.includes(m.unit)) return m;
    return { ...m, unit: defaultUnit };
  });
}

interface TakeoffContextValue {
  activeFile: File | null;
  materials: TakeoffMaterial[];
  annotations: TakeoffAnnotation[];
  visibleAnnotations: TakeoffAnnotation[];
  pageScales: Record<number, TakeoffPageScale>;
  currentScale: TakeoffPageScale | null;
  pdfDoc: PDFDocumentProxy | null;
  pageIndex: number;
  numPages: number;
  zoom: number;
  armedMaterialId: string | null;
  armedTool: TakeoffAnnotationType | null;
  inProgress: TakeoffPoint[];
  hoverPoint: TakeoffPoint | null;
  dragState: TakeoffDragState | null;
  calibrating: boolean;
  calibrationPrompt: { pointsSpan: number } | null;
  calibrationValue: string;
  calibrationUnit: string;
  selectedMaterialId: string | null;
  totalCost: number;

  goToPage: (updater: (p: number) => number) => void;
  changeZoom: (updater: (z: number) => number) => void;
  setSelectedMaterialId: (id: string | null) => void;
  setCalibrationValue: (v: string) => void;
  setCalibrationUnit: (v: string) => void;

  armTool: (materialId: string, tool: TakeoffAnnotationType) => void;
  armCalibration: () => void;
  addMaterial: () => void;
  updateMaterial: (id: string, patch: Partial<TakeoffMaterial>) => void;
  removeMaterial: (id: string) => void;
  confirmCalibration: () => void;
  cancelCalibration: () => void;
  handleBack: () => void;

  onCanvasMouseDown: (pt: TakeoffPoint) => void;
  onCanvasMouseMove: (pt: TakeoffPoint) => void;
  onCanvasMouseUp: () => void;
  onCanvasClick: (pt: TakeoffPoint) => void;
  onCanvasDoubleClick: () => void;
}

const TakeoffContext = createContext<TakeoffContextValue | null>(null);

// Owns all Take Off state so the sidebar panel (the materials list, the
// scale/page/zoom toolbar) and the full-screen canvas workbench — two
// separately-mounted trees — can share one source of truth instead of the
// canvas view owning everything privately (which is what forced
// hideToolPanel:true in the first place).
export function TakeoffProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const liveSelectedFile = selectedFiles[0] ?? allFiles[0] ?? null;

  // The file a Take Off session is measuring. Captured only at the moment
  // Take Off is entered (below) rather than tracking the app's global file
  // selection live: this context is mounted at the app root for every tool,
  // so reacting to every selection change would wipe an in-progress
  // materials list the instant the user picks a different file for an
  // unrelated tool (e.g. to run Compress on it).
  const [activeFile, setActiveFile] = useState<File | null>(null);

  const hasEnteredRef = useRef(false);
  useEffect(() => {
    if (navigationState.selectedTool !== "takeoff") {
      hasEnteredRef.current = false;
      return;
    }
    if (hasEnteredRef.current) return;
    hasEnteredRef.current = true;
    setActiveFile(liveSelectedFile);
  }, [navigationState.selectedTool, liveSelectedFile]);

  const [materials, setMaterials] = useState<TakeoffMaterial[]>([]);
  const [annotations, setAnnotations] = useState<TakeoffAnnotation[]>([]);
  const [pageScales, setPageScales] = useState<
    Record<number, TakeoffPageScale>
  >({});

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndexRaw] = useState(0);
  const numPages = pdfDoc?.numPages ?? 1;
  const [zoom, setZoomRaw] = useState(DEFAULT_ZOOM);

  const [armedMaterialId, setArmedMaterialId] = useState<string | null>(null);
  const [armedTool, setArmedTool] = useState<TakeoffAnnotationType | null>(
    null,
  );
  const [inProgress, setInProgress] = useState<TakeoffPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<TakeoffPoint | null>(null);
  const [dragState, setDragStateRaw] = useState<TakeoffDragState | null>(null);

  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPrompt, setCalibrationPrompt] = useState<{
    pointsSpan: number;
  } | null>(null);
  const [calibrationValue, setCalibrationValue] = useState("");
  const [calibrationUnit, setCalibrationUnit] = useState("m");

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );

  // Starting a Take Off session on a different file resets the measurement
  // state rather than carrying the previous file's rows/annotations over.
  // Clearing pdfDoc here too (not just in the load effect below) matters:
  // it makes the auto-detect-scale effect's `!pdfDoc` guard bail out
  // immediately, instead of running one more pass against the *previous*
  // file's document (still sitting in state until the async load below
  // resolves) against the just-reset pageIndex 0 and writing a bogus
  // detected scale for the new file's first page.
  const lastFileRef = useRef<File | null>(null);
  useEffect(() => {
    if (activeFile === lastFileRef.current) return;
    lastFileRef.current = activeFile;
    setMaterials([]);
    setAnnotations([]);
    setPageScales({});
    setPageIndexRaw(0);
    setArmedMaterialId(null);
    setArmedTool(null);
    setSelectedMaterialId(null);
    setPdfDoc(null);
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile) {
      setPdfDoc(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const buf = await activeFile.arrayBuffer();
      const doc = await pdfWorkerManager.createDocument(buf);
      if (cancelled) {
        pdfWorkerManager.destroyDocument(doc);
        return;
      }
      setPdfDoc(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFile]);

  useEffect(() => {
    return () => {
      if (pdfDoc) pdfWorkerManager.destroyDocument(pdfDoc);
    };
  }, [pdfDoc]);

  // Mirrors for the auto-detect effect below, which reads current state
  // from an async callback keyed only on [pdfDoc, pageIndex] — using these
  // instead of the state values directly avoids stale closures without
  // adding pageScales/materials/annotations (which change on every draw)
  // to that effect's deps, which would re-run text extraction constantly.
  const pageScalesRef = useRef(pageScales);
  useEffect(() => {
    pageScalesRef.current = pageScales;
  }, [pageScales]);
  const materialsRef = useRef(materials);
  useEffect(() => {
    materialsRef.current = materials;
  }, [materials]);
  const annotationsRef = useRef(annotations);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  // Auto-detect this page's printed scale note (e.g. "1:100" or
  // '1/4" = 1'-0"') so most sheets never need a manual calibration drag.
  useEffect(() => {
    if (!pdfDoc || pageScalesRef.current[pageIndex]) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      if (cancelled) return;
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      const detected = detectScaleFromText(text);
      if (!detected || cancelled || pageScalesRef.current[pageIndex]) return;
      const nextPageScales = {
        ...pageScalesRef.current,
        [pageIndex]: detected,
      };
      setPageScales(nextPageScales);
      setMaterials(
        recomputeIds(
          new Set(materialsRef.current.map((m) => m.id)),
          materialsRef.current,
          annotationsRef.current,
          nextPageScales,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex]);

  const armedMaterial = armedMaterialId
    ? (materials.find((m) => m.id === armedMaterialId) ?? null)
    : null;
  const currentScale = pageScales[pageIndex] ?? null;

  const totalCost = useMemo(
    () =>
      materials.reduce((s, m) => s + (m.quantity ?? 0) * (m.unitPrice ?? 0), 0),
    [materials],
  );

  const visibleAnnotations = useMemo(
    () => annotations.filter((a) => a.page === pageIndex),
    [annotations, pageIndex],
  );

  const goToPage = useCallback(
    (updater: (p: number) => number) =>
      setPageIndexRaw((p) => Math.max(0, Math.min(numPages - 1, updater(p)))),
    [numPages],
  );
  const changeZoom = useCallback(
    (updater: (z: number) => number) =>
      setZoomRaw((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, updater(z)))),
    [],
  );

  function disarmAllTools() {
    setArmedMaterialId(null);
    setArmedTool(null);
    setInProgress([]);
    setHoverPoint(null);
    setDragStateRaw(null);
    setCalibrating(false);
    setCalibrationPrompt(null);
    setCalibrationValue("");
  }

  function armTool(materialId: string, tool: TakeoffAnnotationType) {
    if (armedMaterialId === materialId && armedTool === tool) {
      disarmAllTools();
      return;
    }
    const needsScale = tool !== "count" && tool !== "angle";
    if (needsScale && !pageScales[pageIndex]) {
      window.alert(
        t(
          "takeoff.setScaleFirst",
          "Set this page's scale first — otherwise the measurement will show 0.",
        ),
      );
    }
    disarmAllTools();
    // A row only ever owns geometry of one type — switching tools clears
    // whatever the row previously held.
    const nextAnnotations = annotations.filter(
      (a) => !(a.materialId === materialId && a.type !== tool),
    );
    setAnnotations(nextAnnotations);
    if (!nextAnnotations.some((a) => a.materialId === materialId)) {
      setMaterials((prev) =>
        prev.map((m) => (m.id === materialId ? { ...m, quantity: 0 } : m)),
      );
    }
    setArmedMaterialId(materialId);
    setArmedTool(tool);
  }

  function armCalibration() {
    disarmAllTools();
    setCalibrating(true);
  }

  function onCanvasMouseDown(pt: TakeoffPoint) {
    if (calibrationPrompt) return;
    if (calibrating) {
      setDragStateRaw({ kind: "calibrate", start: pt, current: pt });
      return;
    }
    if (
      armedMaterial &&
      (armedTool === "length" ||
        armedTool === "radius" ||
        armedTool === "diameter")
    ) {
      setDragStateRaw({ kind: armedTool, start: pt, current: pt });
    }
  }

  function onCanvasMouseMove(pt: TakeoffPoint) {
    if (dragState) {
      setDragStateRaw((prev) => (prev ? { ...prev, current: pt } : prev));
      return;
    }
    if (
      armedMaterial &&
      armedTool &&
      (CLOSED_SHAPE_TOOLS.includes(armedTool) || armedTool === "angle") &&
      inProgress.length > 0
    ) {
      setHoverPoint(pt);
    }
  }

  function onCanvasMouseUp() {
    if (!dragState) return;
    const { kind, start, current } = dragState;
    setDragStateRaw(null);
    const pointsSpan = distance(start, current);
    // A stray click-without-drag isn't a real segment — ignore it and stay
    // armed (same as a failed calibration drag) rather than kicking the user
    // out of the tool over a mis-click.
    if (pointsSpan < 2) return;
    if (kind === "calibrate") {
      setCalibrationPrompt({ pointsSpan });
      setCalibrationValue("");
      return;
    }
    if (!armedMaterial) return;
    const newAnnotation: TakeoffAnnotation = {
      id: generateId(),
      materialId: armedMaterial.id,
      type: kind,
      page: pageIndex,
      points: [start, current],
    };
    // Append rather than replace: a row can own several segments, so
    // drawing another one — even on a different page — adds to the row's
    // total instead of overwriting its previous segment.
    const nextAnnotations = [...annotations, newAnnotation];
    setAnnotations(nextAnnotations);
    setMaterials((prev) =>
      recomputeIds(
        affectedIds(armedMaterial.id, prev),
        syncDefaultUnit(prev, armedMaterial.id, "lm"),
        nextAnnotations,
        pageScales,
      ),
    );
    // Deliberately stays armed — matches Count, which already lets you place
    // several markers in a row.
  }

  function onCanvasClick(pt: TakeoffPoint) {
    if (dragState || calibrationPrompt || calibrating) return;
    if (!armedMaterial) {
      setSelectedMaterialId(null);
      return;
    }
    if (armedTool === "count") {
      const newAnnotation: TakeoffAnnotation = {
        id: generateId(),
        materialId: armedMaterial.id,
        type: "count",
        page: pageIndex,
        points: [pt],
      };
      const nextAnnotations = [...annotations, newAnnotation];
      setAnnotations(nextAnnotations);
      setMaterials((prev) =>
        recomputeIds(
          new Set([armedMaterial.id]),
          syncDefaultUnit(prev, armedMaterial.id, "ea"),
          nextAnnotations,
          pageScales,
        ),
      );
      return;
    }
    if (armedTool === "angle") {
      const next = [...inProgress, pt];
      if (next.length < 3) {
        setInProgress(next);
        return;
      }
      const newAnnotation: TakeoffAnnotation = {
        id: generateId(),
        materialId: armedMaterial.id,
        type: "angle",
        page: pageIndex,
        points: next,
      };
      const nextAnnotations = [...annotations, newAnnotation];
      setAnnotations(nextAnnotations);
      setMaterials((prev) =>
        recomputeIds(
          new Set([armedMaterial.id]),
          syncDefaultUnit(prev, armedMaterial.id, "°"),
          nextAnnotations,
          pageScales,
        ),
      );
      setInProgress([]);
      setHoverPoint(null);
      return;
    }
    if (armedTool && CLOSED_SHAPE_TOOLS.includes(armedTool)) {
      setInProgress((prev) => [...prev, pt]);
    }
  }

  function onCanvasDoubleClick() {
    if (!armedMaterial || !armedTool || !CLOSED_SHAPE_TOOLS.includes(armedTool))
      return;
    if (inProgress.length < 3) {
      window.alert(
        t(
          "takeoff.needThreePoints",
          "Need at least 3 points to close a shape.",
        ),
      );
      return;
    }
    const newAnnotation: TakeoffAnnotation = {
      id: generateId(),
      materialId: armedMaterial.id,
      type: armedTool,
      page: pageIndex,
      points: inProgress,
    };
    const nextAnnotations = [...annotations, newAnnotation];
    setAnnotations(nextAnnotations);
    setMaterials((prev) =>
      recomputeIds(
        affectedIds(armedMaterial.id, prev),
        syncDefaultUnit(
          prev,
          armedMaterial.id,
          closedShapeDefaultUnit(armedTool),
        ),
        nextAnnotations,
        pageScales,
      ),
    );
    setInProgress([]);
    setHoverPoint(null);
  }

  function confirmCalibration() {
    const real = Number(calibrationValue);
    if (calibrationPrompt && !Number.isNaN(real) && real > 0) {
      const nextScale: TakeoffPageScale = {
        pointsSpan: calibrationPrompt.pointsSpan,
        real,
        unit: calibrationUnit,
        source: "manual",
      };
      const nextPageScales = { ...pageScales, [pageIndex]: nextScale };
      setPageScales(nextPageScales);
      setMaterials((prev) =>
        recomputeIds(
          new Set(prev.map((m) => m.id)),
          prev,
          annotations,
          nextPageScales,
        ),
      );
    }
    setCalibrationPrompt(null);
    setCalibrationValue("");
    setCalibrating(false);
  }

  function cancelCalibration() {
    setCalibrationPrompt(null);
    setCalibrationValue("");
    setCalibrating(false);
  }

  function addMaterial() {
    setMaterials((prev) => [
      ...prev,
      { id: generateId(), name: "", unit: "", quantity: 0, unitPrice: 0 },
    ]);
  }

  function updateMaterial(id: string, patch: Partial<TakeoffMaterial>) {
    setMaterials((prev) => {
      const old = prev.find((m) => m.id === id);
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      const ids = new Set<string>();
      if ("pitchDegrees" in patch) ids.add(id);
      if ("deductsFromMaterialId" in patch) {
        ids.add(id);
        if (old?.deductsFromMaterialId) ids.add(old.deductsFromMaterialId);
        if (patch.deductsFromMaterialId) ids.add(patch.deductsFromMaterialId);
      }
      if (ids.size === 0) return next;
      return recomputeIds(ids, next, annotations, pageScales);
    });
  }

  function removeMaterial(id: string) {
    const removed = materials.find((m) => m.id === id);
    const nextAnnotations = annotations.filter((a) => a.materialId !== id);
    setAnnotations(nextAnnotations);
    setMaterials((prev) => {
      const filtered = prev
        .filter((m) => m.id !== id)
        .map((m) =>
          m.deductsFromMaterialId === id
            ? { ...m, deductsFromMaterialId: undefined }
            : m,
        );
      if (!removed?.deductsFromMaterialId) return filtered;
      return recomputeIds(
        new Set([removed.deductsFromMaterialId]),
        filtered,
        nextAnnotations,
        pageScales,
      );
    });
    if (armedMaterialId === id) disarmAllTools();
  }

  function handleBack() {
    navigationActions.setWorkbench(getDefaultWorkbench());
  }

  const value: TakeoffContextValue = {
    activeFile,
    materials,
    annotations,
    visibleAnnotations,
    pageScales,
    currentScale,
    pdfDoc,
    pageIndex,
    numPages,
    zoom,
    armedMaterialId,
    armedTool,
    inProgress,
    hoverPoint,
    dragState,
    calibrating,
    calibrationPrompt,
    calibrationValue,
    calibrationUnit,
    selectedMaterialId,
    totalCost,
    goToPage,
    changeZoom,
    setSelectedMaterialId,
    setCalibrationValue,
    setCalibrationUnit,
    armTool,
    armCalibration,
    addMaterial,
    updateMaterial,
    removeMaterial,
    confirmCalibration,
    cancelCalibration,
    handleBack,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasClick,
    onCanvasDoubleClick,
  };

  return (
    <TakeoffContext.Provider value={value}>{children}</TakeoffContext.Provider>
  );
}

export function useTakeoffContext(): TakeoffContextValue {
  const ctx = useContext(TakeoffContext);
  if (!ctx) {
    throw new Error("useTakeoffContext must be used within a TakeoffProvider");
  }
  return ctx;
}
