import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, Group, Select, Text, TextInput } from "@mantine/core";

import { Button } from "@app/ui/Button";
import {
  angleBetween,
  distance,
  polygonArea,
  polygonPerimeter,
} from "@app/tools/takeoff/geometry";
import type { TakeoffAnnotation, TakeoffPoint } from "@app/tools/takeoff/types";
import { useTakeoffContext } from "@app/tools/takeoff/TakeoffContext";

// Kept for the registerCustomWorkbenchView data contract (see
// TakeoffWorkbenchRegistration) even though this view now reads everything
// it needs from TakeoffContext rather than from this prop.
export interface TakeoffWorkbenchData {
  file: File;
}

const CALIBRATION_UNITS = ["m", "cm", "mm", "ft", "in"];

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
        fill="var(--c-success-solid)"
        stroke="var(--c-text-on-primary)"
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
        fill="color-mix(in srgb, var(--c-danger) 15%, transparent)"
        stroke={selected ? "var(--c-danger-solid)" : "var(--c-danger)"}
        strokeWidth={selected ? 3 : 2}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (annotation.type === "volume") {
    return (
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="color-mix(in srgb, var(--c-danger) 25%, transparent)"
        stroke={selected ? "var(--c-danger-solid)" : "var(--c-danger)"}
        strokeWidth={selected ? 3 : 2}
        strokeDasharray="6 3"
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (annotation.type === "perimeter") {
    return (
      <polygon
        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={selected ? "var(--c-primary-hover)" : "var(--c-primary)"}
        strokeWidth={selected ? 3 : 2}
        strokeDasharray="6 3"
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      />
    );
  }

  if (annotation.type === "radius" || annotation.type === "diameter") {
    const [p1, p2] = pts;
    if (!p1 || !p2) return null;
    const center =
      annotation.type === "radius"
        ? p1
        : { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const radius =
      annotation.type === "radius"
        ? Math.hypot(p2.x - p1.x, p2.y - p1.y)
        : Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    const stroke = selected ? "var(--c-primary-hover)" : "var(--c-primary)";
    return (
      <g onClick={handleClick} style={{ cursor: "pointer" }}>
        <circle
          cx={center.x}
          cy={center.y}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={selected ? 3 : 2}
        />
        <line
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </g>
    );
  }

  if (annotation.type === "angle") {
    const [vertex, rayA, rayB] = pts;
    if (!vertex || !rayA || !rayB) return null;
    const stroke = selected ? "var(--c-primary-hover)" : "var(--c-primary)";
    const deg = angleBetween(
      annotation.points[0],
      annotation.points[1],
      annotation.points[2],
    );
    return (
      <g onClick={handleClick} style={{ cursor: "pointer" }}>
        <line
          x1={vertex.x}
          y1={vertex.y}
          x2={rayA.x}
          y2={rayA.y}
          stroke={stroke}
          strokeWidth={selected ? 3 : 2}
        />
        <line
          x1={vertex.x}
          y1={vertex.y}
          x2={rayB.x}
          y2={rayB.y}
          stroke={stroke}
          strokeWidth={selected ? 3 : 2}
        />
        <text
          x={vertex.x + 10}
          y={vertex.y - 10}
          fontSize={12}
          fill="var(--c-text)"
        >
          {deg.toFixed(1)}°
        </text>
      </g>
    );
  }

  // length
  const [a, b] = pts;
  if (!a || !b) return null;
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={selected ? "var(--c-primary-hover)" : "var(--c-primary)"}
      strokeWidth={selected ? 4 : 3}
      onClick={handleClick}
      style={{ cursor: "pointer" }}
    />
  );
}

// Canvas-only surface: the materials list and the scale/page/zoom toolbar
// live in the persistent left sidebar (see TakeoffSidebarPanel) so the tool
// panel no longer has to be hidden while Take Off is active.
const TakeoffWorkbenchView = (_props: { data: TakeoffWorkbenchData }) => {
  const { t } = useTranslation();
  const {
    pdfDoc,
    pageIndex,
    zoom,
    armedMaterialId,
    armedTool,
    visibleAnnotations,
    inProgress,
    hoverPoint,
    dragState,
    calibrating,
    calibrationPrompt,
    calibrationValue,
    calibrationUnit,
    pageScales,
    selectedMaterialId,
    setSelectedMaterialId,
    setCalibrationValue,
    setCalibrationUnit,
    confirmCalibration,
    cancelCalibration,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasClick,
    onCanvasDoubleClick,
  } = useTakeoffContext();

  const [pageDims, setPageDims] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Render the current page to the canvas whenever page/zoom/doc changes.
  // Tracks the in-flight render task so a fast page/zoom change (e.g. two
  // quick zoom clicks) cancels the stale render instead of racing it against
  // a fresh one on the same canvas — PDF.js throws if render() is called
  // again on a canvas that already has an active render task.
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
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
      renderTaskRef.current?.cancel();
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        canvas,
      });
      renderTaskRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch {
        // Cancelled render tasks reject — nothing to do, a newer render is
        // already taking over.
        return;
      }
      if (!cancelled)
        setPageDims({ width: viewport.width, height: viewport.height });
    })();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [pdfDoc, pageIndex, zoom]);

  const armedMaterial = armedMaterialId !== null;

  function eventToPagePoint(e: React.MouseEvent<SVGSVGElement>): TakeoffPoint {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
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
    if (armedTool === "angle") {
      if (pts.length < 3)
        return `${pts.length} pt${pts.length === 1 ? "" : "s"}`;
      return `${angleBetween(pts[0], pts[1], pts[2]).toFixed(1)}°`;
    }
    if (pts.length < 3) return `${pts.length} pt${pts.length === 1 ? "" : "s"}`;
    const scale = pageScales[pageIndex];
    if (!scale) return t("takeoff.setScale", "set scale");
    const upp = scale.real / scale.pointsSpan;
    if (armedTool === "perimeter") {
      return `${(polygonPerimeter(pts) * upp).toFixed(2)} ${scale.unit}`;
    }
    // area and volume both preview as an enclosed area — volume's depth
    // multiplier only applies once the shape is closed.
    return `${(polygonArea(pts) * upp * upp).toFixed(2)} ${scale.unit}²`;
  }, [inProgress, hoverPoint, pageScales, pageIndex, t, armedTool]);

  const tooltipAnchor = dragState
    ? dragState.current
    : (hoverPoint ?? inProgress[inProgress.length - 1]);
  const tooltipText = dragState ? dragTooltipText : polygonTooltipText;

  return (
    <Box
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        height: "100%",
        width: "100%",
        overflow: "auto",
        background: "var(--c-bg-raised)",
        padding: "1rem",
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
                cursor: calibrating || armedMaterial ? "crosshair" : "default",
              }}
              onMouseDown={(e) => onCanvasMouseDown(eventToPagePoint(e))}
              onMouseMove={(e) => onCanvasMouseMove(eventToPagePoint(e))}
              onMouseUp={onCanvasMouseUp}
              onClick={(e) => onCanvasClick(eventToPagePoint(e))}
              onDoubleClick={onCanvasDoubleClick}
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
                  fill="color-mix(in srgb, var(--c-danger) 12%, transparent)"
                  stroke="var(--c-danger)"
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
                    dragState.kind === "calibrate"
                      ? "var(--c-text-muted)"
                      : "var(--c-primary)"
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
                  fill="var(--c-text)"
                >
                  {tooltipText}
                </text>
              )}
            </svg>
          )}
        </div>
      )}

      {calibrationPrompt && (
        <Box
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--c-overlay)",
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
