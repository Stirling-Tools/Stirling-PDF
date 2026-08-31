import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Group,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";

import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { getDefaultWorkbench } from "@app/types/workbench";
import { pdfWorkerManager } from "@app/services/pdfWorkerManager";
import { generateId } from "@app/utils/generateId";
import {
  distance,
  polygonArea,
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
import TakeoffRow from "@app/components/tools/takeoff/TakeoffRow";

export interface TakeoffWorkbenchData {
  file: File;
}

const DEFAULT_ZOOM = 1.2;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const CALIBRATION_UNITS = ["m", "cm", "mm", "ft", "in"];

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
// badge as a sanity-check against what's printed on the sheet. A page with
// several details at different scales only has room for ONE calibration
// here — if this number doesn't match the detail currently being measured,
// that's the signal to recalibrate rather than trust the last-set scale.
function estimateArchitecturalRatio(scale: TakeoffPageScale): number | null {
  const mmPerUnit = MM_PER_UNIT[scale.unit];
  if (!mmPerUnit) return null;
  const realMm = scale.real * mmPerUnit;
  const paperMm = scale.pointsSpan * MM_PER_POINT;
  if (paperMm <= 0) return null;
  return realMm / paperMm;
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

const AUTO_UNITS = ["lm", "m2", "ea"];
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

type DragState = {
  kind: "length" | "calibrate";
  start: TakeoffPoint;
  current: TakeoffPoint;
};

function AnnotationShape({
  annotation,
  selected,
  zoom,
  onSelect,
}: {
  annotation: TakeoffAnnotation;
  selected: boolean;
  zoom: number;
  onSelect: () => void;
}) {
  const pts = annotation.points.map((p) => ({ x: p.x * zoom, y: p.y * zoom }));
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  if (annotation.type === "count") {
    const p = pts[0];
    if (!p) return null;
    return (
      <circle
        cx={p.x}
        cy={p.y}
        r={selected ? 8 : 6}
        fill="#059669"
        stroke="#FFFFFF"
        strokeWidth={2}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (annotation.type === "area") {
    return (
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="rgba(220,38,38,0.15)"
        stroke={selected ? "#991B1B" : "#DC2626"}
        strokeWidth={selected ? 3 : 2}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      />
    );
  }

  const [a, b] = pts;
  if (!a || !b) return null;
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={selected ? "#1D4ED8" : "#2563EB"}
      strokeWidth={selected ? 4 : 3}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    />
  );
}

const TakeoffWorkbenchView = ({ data }: { data: TakeoffWorkbenchData }) => {
  const { t } = useTranslation();
  const { actions: navigationActions } = useNavigationActions();

  const [materials, setMaterials] = useState<TakeoffMaterial[]>([]);
  const [annotations, setAnnotations] = useState<TakeoffAnnotation[]>([]);
  const [pageScales, setPageScales] = useState<
    Record<number, TakeoffPageScale>
  >({});

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [numPages, setNumPages] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pageDims, setPageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [armedMaterialId, setArmedMaterialId] = useState<string | null>(null);
  const [armedTool, setArmedTool] = useState<TakeoffAnnotationType | null>(
    null,
  );
  const [inProgress, setInProgress] = useState<TakeoffPoint[]>([]);
  const [hoverPoint, setHoverPoint] = useState<TakeoffPoint | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [calibrating, setCalibrating] = useState(false);
  const [calibrationPrompt, setCalibrationPrompt] = useState<{
    pointsSpan: number;
  } | null>(null);
  const [calibrationValue, setCalibrationValue] = useState("");
  const [calibrationUnit, setCalibrationUnit] = useState("m");

  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load the PDF document whenever the incoming file changes. The
  // [data.file] dependency already guards against reloading on unrelated
  // re-renders, so this doesn't also need a manual ref-based duplicate
  // check — an earlier version had one, but it set its ref before the
  // async load resolved, so React's dev-mode mount/cleanup/remount cycle
  // left the ref pointing at the file while the *cancelled* first effect
  // was still the only one actually loading it, and the surviving effect
  // silently skipped loading altogether.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buf = await data.file.arrayBuffer();
      const doc = await pdfWorkerManager.createDocument(buf);
      if (cancelled) {
        pdfWorkerManager.destroyDocument(doc);
        return;
      }
      setPdfDoc(doc);
      setNumPages(doc.numPages);
      setPageIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [data.file]);

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
  // Skipped entirely if the page already has a scale — manual calibration
  // always takes priority and is never overwritten by this.
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

  // Render the current page to the canvas whenever page/zoom/doc changes.
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      if (!cancelled)
        setPageDims({ width: viewport.width, height: viewport.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageIndex, zoom]);

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

  function eventToPagePoint(e: React.MouseEvent<SVGSVGElement>): TakeoffPoint {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  }

  function disarmAllTools() {
    setArmedMaterialId(null);
    setArmedTool(null);
    setInProgress([]);
    setHoverPoint(null);
    setDragState(null);
    setCalibrating(false);
    setCalibrationPrompt(null);
    setCalibrationValue("");
  }

  function armTool(materialId: string, tool: TakeoffAnnotationType) {
    if (armedMaterialId === materialId && armedTool === tool) {
      disarmAllTools();
      return;
    }
    if ((tool === "length" || tool === "area") && !pageScales[pageIndex]) {
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

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (calibrationPrompt) return;
    const pt = eventToPagePoint(e);
    if (calibrating) {
      setDragState({ kind: "calibrate", start: pt, current: pt });
      return;
    }
    if (armedMaterial && armedTool === "length") {
      setDragState({ kind: "length", start: pt, current: pt });
    }
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const pt = eventToPagePoint(e);
    if (dragState) {
      setDragState((prev) => (prev ? { ...prev, current: pt } : prev));
      return;
    }
    if (armedMaterial && armedTool === "area" && inProgress.length > 0) {
      setHoverPoint(pt);
    }
  }

  function handleMouseUp() {
    if (!dragState) return;
    const { kind, start, current } = dragState;
    setDragState(null);
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
      type: "length",
      page: pageIndex,
      points: [start, current],
    };
    // Append rather than replace: a row can own several length segments
    // (see the comment on TakeoffAnnotation), so drawing another one — even
    // on a different page — adds to the row's total instead of overwriting
    // its previous segment.
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
    // several markers in a row. Navigate to another page and draw again to
    // keep adding to this row's total; click the tool button again to stop.
  }

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (dragState || calibrationPrompt || calibrating) return;
    if (!armedMaterial) {
      setSelectedMaterialId(null);
      return;
    }
    const pt = eventToPagePoint(e);
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
    if (armedTool === "area") {
      setInProgress((prev) => [...prev, pt]);
    }
  }

  function handleDoubleClick() {
    if (!armedMaterial || armedTool !== "area") return;
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
      type: "area",
      page: pageIndex,
      points: inProgress,
    };
    // Append rather than replace — see the matching comment in handleMouseUp.
    const nextAnnotations = [...annotations, newAnnotation];
    setAnnotations(nextAnnotations);
    setMaterials((prev) =>
      recomputeIds(
        affectedIds(armedMaterial.id, prev),
        syncDefaultUnit(prev, armedMaterial.id, "m2"),
        nextAnnotations,
        pageScales,
      ),
    );
    setInProgress([]);
    setHoverPoint(null);
    // Stays armed — see the matching comment in handleMouseUp. Double-click
    // again to start the next shape for this row.
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

  const dragTooltipText = useMemo(() => {
    if (!dragState) return "";
    const pointsSpan = distance(dragState.start, dragState.current);
    if (dragState.kind === "calibrate") return `${pointsSpan.toFixed(0)} pt`;
    const scale = pageScales[pageIndex];
    if (!scale) return t("takeoff.setScale", "set scale");
    return `${(pointsSpan * (scale.real / scale.pointsSpan)).toFixed(2)} ${scale.unit}`;
  }, [dragState, pageScales, pageIndex, t]);

  const polygonTooltipText = useMemo(() => {
    if (inProgress.length === 0) return "";
    const pts = hoverPoint ? [...inProgress, hoverPoint] : inProgress;
    if (pts.length < 3) return `${pts.length} pt${pts.length === 1 ? "" : "s"}`;
    const scale = pageScales[pageIndex];
    if (!scale) return t("takeoff.setScale", "set scale");
    const upp = scale.real / scale.pointsSpan;
    return `${(polygonArea(pts) * upp * upp).toFixed(2)} ${scale.unit}²`;
  }, [inProgress, hoverPoint, pageScales, pageIndex, t]);

  const tooltipAnchor = dragState
    ? dragState.current
    : (hoverPoint ?? inProgress[inProgress.length - 1]);
  const tooltipText = dragState ? dragTooltipText : polygonTooltipText;

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      <Group
        justify="space-between"
        px="md"
        py="xs"
        wrap="wrap"
        style={{ borderBottom: "1px solid var(--c-border)", rowGap: 8 }}
      >
        <Group gap="sm">
          <ActionIcon
            variant="quiet"
            onClick={handleBack}
            aria-label={t("takeoff.back", "Back")}
          >
            <ArrowBackOutlinedIcon fontSize="small" />
          </ActionIcon>
          <Text size="sm" fw={600}>
            {t("takeoff.title", "Take Off")}
          </Text>
          <Text size="xs" c="dimmed">
            {data.file.name}
          </Text>
        </Group>

        <Group gap="md">
          <Tooltip
            multiline
            w={280}
            label={t(
              "takeoff.scaleTooltip",
              "One scale applies to this whole page. If this sheet has multiple details at different scales (e.g. a 3D view at 1:10 next to an elevation at 1:20), recalibrate against the detail you're about to measure before drawing on it — otherwise the numbers will be wrong for anything not drawn at the calibrated scale.",
            )}
          >
            <Button
              size="sm"
              variant="secondary"
              leftSection={
                currentScale ? (
                  <CheckCircleOutlinedIcon fontSize="small" />
                ) : (
                  <ErrorOutlinedIcon fontSize="small" />
                )
              }
              onClick={armCalibration}
            >
              {calibrating
                ? t("takeoff.dragKnownLength", "Drag a known length…")
                : currentScale
                  ? t(
                      currentScale.source === "auto"
                        ? "takeoff.scaleAutoDetected"
                        : "takeoff.scaleSetWithRatio",
                      currentScale.source === "auto"
                        ? "Scale auto-detected (≈1:{{ratio}})"
                        : "Scale set (≈1:{{ratio}})",
                      {
                        ratio: (() => {
                          const ratio =
                            estimateArchitecturalRatio(currentScale);
                          return ratio ? Math.round(ratio) : "?";
                        })(),
                      },
                    )
                  : t("takeoff.scaleNotSet", "Scale not set")}
            </Button>
          </Tooltip>

          <Group gap={4}>
            <ActionIcon
              variant="quiet"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              aria-label={t("takeoff.prevPage", "Previous page")}
            >
              <ChevronLeftIcon fontSize="small" />
            </ActionIcon>
            <Text size="xs" style={{ minWidth: 48, textAlign: "center" }}>
              {pageIndex + 1} / {numPages}
            </Text>
            <ActionIcon
              variant="quiet"
              disabled={pageIndex >= numPages - 1}
              onClick={() => setPageIndex((p) => Math.min(numPages - 1, p + 1))}
              aria-label={t("takeoff.nextPage", "Next page")}
            >
              <ChevronRightIcon fontSize="small" />
            </ActionIcon>
          </Group>

          <Group gap={4}>
            <ActionIcon
              variant="quiet"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.2))}
              aria-label={t("takeoff.zoomOut", "Zoom out")}
            >
              <ZoomOutIcon fontSize="small" />
            </ActionIcon>
            <Text size="xs" style={{ width: 42, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </Text>
            <ActionIcon
              variant="quiet"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.2))}
              aria-label={t("takeoff.zoomIn", "Zoom in")}
            >
              <ZoomInIcon fontSize="small" />
            </ActionIcon>
          </Group>
        </Group>
      </Group>

      <Box style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Box
          style={{
            width: "24rem",
            borderRight: "1px solid var(--c-border)",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          <Group
            justify="space-between"
            px="md"
            py="sm"
            style={{ borderBottom: "1px solid var(--c-border-subtle)" }}
          >
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {t("takeoff.materials", "Takeoffs")}
            </Text>
            <Button
              size="sm"
              variant="quiet"
              leftSection={<AddOutlinedIcon fontSize="small" />}
              onClick={addMaterial}
            >
              {t("takeoff.addRow", "Add")}
            </Button>
          </Group>
          <ScrollArea style={{ flex: 1 }}>
            {materials.length === 0 ? (
              <Text size="xs" c="dimmed" p="md">
                {t(
                  "takeoff.empty",
                  "No items yet — add one to start measuring.",
                )}
              </Text>
            ) : (
              <Stack gap={0}>
                {materials.map((m) => (
                  <TakeoffRow
                    key={m.id}
                    material={m}
                    materials={materials}
                    annotations={annotations}
                    armedTool={armedMaterialId === m.id ? armedTool : null}
                    selected={selectedMaterialId === m.id}
                    onArmTool={(tool) => armTool(m.id, tool)}
                    onChange={(patch) => updateMaterial(m.id, patch)}
                    onRemove={() => removeMaterial(m.id)}
                    onSelect={() => setSelectedMaterialId(m.id)}
                  />
                ))}
              </Stack>
            )}
          </ScrollArea>
          <Group
            justify="space-between"
            px="md"
            py="sm"
            style={{ borderTop: "1px solid var(--c-border-subtle)" }}
          >
            <Text size="xs" fw={600} tt="uppercase" c="dimmed">
              {t("takeoff.estimatedTotal", "Estimated total")}
            </Text>
            <Text size="lg" fw={700}>
              $
              {totalCost.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </Group>
        </Box>

        <Box
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--c-bg-raised)",
            padding: "1rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {!pdfDoc ? (
            <Text size="sm" c="dimmed" p="xl">
              {t("takeoff.loading", "Loading plan…")}
            </Text>
          ) : (
            <div style={{ position: "relative", lineHeight: 0 }}>
              <canvas ref={canvasRef} />
              {pageDims && (
                <svg
                  width={pageDims.width}
                  height={pageDims.height}
                  style={{
                    position: "absolute",
                    inset: 0,
                    cursor:
                      calibrating || armedMaterial ? "crosshair" : "default",
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onClick={handleClick}
                  onDoubleClick={handleDoubleClick}
                >
                  {visibleAnnotations.map((a) => (
                    <AnnotationShape
                      key={a.id}
                      annotation={a}
                      selected={selectedMaterialId === a.materialId}
                      zoom={zoom}
                      onSelect={() => setSelectedMaterialId(a.materialId)}
                    />
                  ))}

                  {inProgress.length > 0 && (
                    <polyline
                      points={[
                        ...inProgress,
                        hoverPoint ?? inProgress[inProgress.length - 1],
                      ]
                        .map((p) => `${p.x * zoom},${p.y * zoom}`)
                        .join(" ")}
                      fill="rgba(220,38,38,0.12)"
                      stroke="#DC2626"
                      strokeWidth={2}
                    />
                  )}

                  {dragState && (
                    <line
                      x1={dragState.start.x * zoom}
                      y1={dragState.start.y * zoom}
                      x2={dragState.current.x * zoom}
                      y2={dragState.current.y * zoom}
                      stroke={
                        dragState.kind === "calibrate" ? "#78716C" : "#2563EB"
                      }
                      strokeDasharray={
                        dragState.kind === "calibrate" ? "6 4" : undefined
                      }
                      strokeWidth={2}
                    />
                  )}

                  {tooltipAnchor && tooltipText && (
                    <text
                      x={tooltipAnchor.x * zoom + 10}
                      y={tooltipAnchor.y * zoom - 10}
                      fontSize={12}
                      fill="#1C1917"
                    >
                      {tooltipText}
                    </text>
                  )}
                </svg>
              )}
            </div>
          )}
        </Box>
      </Box>

      {calibrationPrompt && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
            zIndex: 1000,
          }}
        >
          <Box
            style={{
              background: "var(--c-surface)",
              borderRadius: 8,
              padding: "1.25rem",
              width: 320,
            }}
          >
            <Text size="sm" fw={600} mb="xs">
              {t("takeoff.calibrateTitle", "What is this length in real life?")}
            </Text>
            <Group gap="xs" mb="md">
              <TextInput
                autoFocus
                type="number"
                value={calibrationValue}
                onChange={(e) => setCalibrationValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCalibration();
                  if (e.key === "Escape") cancelCalibration();
                }}
                placeholder={t("takeoff.calibratePlaceholder", "e.g. 5")}
                style={{ flex: 1 }}
              />
              <Select
                data={CALIBRATION_UNITS}
                value={calibrationUnit}
                onChange={(v) => setCalibrationUnit(v ?? "m")}
                style={{ width: 90 }}
              />
            </Group>
            <Group justify="flex-end" gap="xs">
              <Button size="sm" variant="secondary" onClick={cancelCalibration}>
                {t("takeoff.cancel", "Cancel")}
              </Button>
              <Button size="sm" variant="primary" onClick={confirmCalibration}>
                {t("takeoff.confirm", "Confirm")}
              </Button>
            </Group>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default TakeoffWorkbenchView;
