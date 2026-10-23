import React from "react";

import type {
  MeasurementKind,
  MeasurementLabelVisibility,
} from "@editor/utils/measurementTypes";
import { polygonCentroid } from "@editor/utils/measurementUtils";

export interface RulerPoint {
  x: number;
  y: number;
}

/** A measurement already projected to screen space, with its text resolved. */
export interface RulerRenderedMeasurement {
  id: string;
  kind: MeasurementKind;
  pointsS: RulerPoint[];
  color: string;
  strokeWidth: number;
  /** Compact label: the headline value, prefixed by the user's name for it. */
  label: string;
  /** Lines shown in the expanded label of the selected measurement. */
  detailLines: string[];
}

export interface RulerGuide {
  from: RulerPoint;
  to: RulerPoint;
  /** align: lined up with another point; angle: locked to a 45-degree step. */
  kind: "align" | "angle";
}

export interface RulerDraft {
  kind: MeasurementKind | "calibrate";
  pointsS: RulerPoint[];
  label: string | null;
  color: string;
}

interface RulerMeasurementLayerProps {
  measurements: RulerRenderedMeasurement[];
  zoom: number;
  selectedId: string | null;
  hoveredId: string | null;
  labelVisibility: MeasurementLabelVisibility;
  isInteractionPassthroughActive: boolean;
  /** Vertex handles are only offered while the tool is open. */
  isEditable: boolean;
  draft: RulerDraft | null;
  cursor: RulerPoint | null;
  snapPoint: RulerPoint | null;
  guides: RulerGuide[];
  pageContentRef?: React.Ref<SVGGElement>;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  onVertexPointerDown: (
    id: string,
    vertexIndex: number,
    event: React.PointerEvent,
  ) => void;
}

interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const RULER_DOT_RADIUS = 5;

const TICK = 10;
const LINE_HEIGHT = 17;
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 6;
const DEL_R = 8;
const IDLE_LH = 20;
const IDLE_LP = 6;
const IDLE_LABEL_MIN_WIDTH = 42;
const IDLE_LABEL_MIN_EXTENT = 88;
const IDLE_LABEL_COLLISION_GAP = 6;
const LABEL_LINE_GAP = 8;
const DELETE_LABEL_GAP = 8;
const LINE_HIT_WIDTH = 18;
const HANDLE_RADIUS = 6;
const AREA_FILL_OPACITY = 0.14;
const MONO = "'Roboto Mono','Consolas',monospace";
// Theme tokens go through style, not SVG presentation attributes, which do
// not resolve var().
const GUIDE_COLOR = "var(--c-danger)";
const DELETE_COLOR = "var(--c-danger)";
const DEFAULT_CURSOR_COLOR = "var(--c-primary)";
/** How far a guide runs past the points it joins, in screen pixels. */
const GUIDE_OVERSHOOT = 24;

function dist(a: RulerPoint, b: RulerPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a: RulerPoint, b: RulerPoint): RulerPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Unit normal of a→b, flipped to point up (or left on vertical lines). */
function upwardNormal(
  a: RulerPoint,
  b: RulerPoint,
): { nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  if (ny > 0 || (Math.abs(ny) < 0.001 && nx < 0)) {
    return { nx: -nx, ny: -ny };
  }
  return { nx, ny };
}

function getZoomScale(zoom: number): number {
  return Math.max(0.6, Math.min(1.0, zoom / 1.5));
}

function textWidth(text: string, charWidth: number): number {
  return text.length * charWidth;
}

function longestSegment(
  points: RulerPoint[],
  closed: boolean,
): [RulerPoint, RulerPoint] {
  let best: [RulerPoint, RulerPoint] = [points[0], points[1] ?? points[0]];
  let bestLength = -1;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const length = dist(a, b);
    if (length > bestLength) {
      bestLength = length;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Where a label of the given size sits: beside the middle of a distance line,
 * beside the longest segment of a path, and at the centroid of an area.
 */
function getLabelCenter(
  kind: MeasurementKind | "calibrate",
  points: RulerPoint[],
  width: number,
  height: number,
): RulerPoint {
  if (kind === "area" && points.length >= 3) {
    return polygonCentroid(points);
  }
  const [a, b] = longestSegment(points, false);
  const mid = midpoint(a, b);
  const { nx, ny } = upwardNormal(a, b);
  const projectedHalfSize =
    (Math.abs(nx) * width) / 2 + (Math.abs(ny) * height) / 2;
  const offset = projectedHalfSize + RULER_DOT_RADIUS + LABEL_LINE_GAP;
  return { x: mid.x + nx * offset, y: mid.y + ny * offset };
}

function boxFromCenter(
  center: RulerPoint,
  width: number,
  height: number,
): LabelBox {
  return {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
  };
}

function boxesOverlap(a: LabelBox, b: LabelBox, gap: number): boolean {
  return !(
    a.right + gap < b.left ||
    a.left - gap > b.right ||
    a.bottom + gap < b.top ||
    a.top - gap > b.bottom
  );
}

function idleLabelSize(label: string, zoom: number) {
  return {
    width: Math.max(textWidth(label, 7) + IDLE_LP * 2, IDLE_LABEL_MIN_WIDTH),
    height: Math.max(18, Math.round(IDLE_LH * getZoomScale(zoom))),
  };
}

function screenExtent(points: RulerPoint[]): number {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return Math.hypot(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
}

/** Largest-first, keep each idle label that has room and hits no kept label. */
function getVisibleIdleLabelIds(
  measurements: RulerRenderedMeasurement[],
  zoom: number,
): Set<string> {
  const visibleIds = new Set<string>();
  const occupied: LabelBox[] = [];

  measurements
    .map((item, index) => ({ item, index, extent: screenExtent(item.pointsS) }))
    .sort((a, b) => b.extent - a.extent || a.index - b.index)
    .forEach(({ item, extent }) => {
      const { width, height } = idleLabelSize(item.label, zoom);
      const box = boxFromCenter(
        getLabelCenter(item.kind, item.pointsS, width, height),
        width,
        height,
      );
      const hasRoom = extent >= Math.max(IDLE_LABEL_MIN_EXTENT, width + 24);
      if (
        hasRoom &&
        !occupied.some((o) => boxesOverlap(box, o, IDLE_LABEL_COLLISION_GAP))
      ) {
        visibleIds.add(item.id);
        occupied.push(box);
      }
    });

  return visibleIds;
}

function pointsAttr(points: RulerPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function EndTicks({
  a,
  b,
  color,
  strokeWidth,
}: {
  a: RulerPoint;
  b: RulerPoint;
  color: string;
  strokeWidth: number;
}) {
  const { nx, ny } = upwardNormal(a, b);
  return (
    <>
      {[a, b].map((p, i) => (
        <line
          key={i}
          x1={p.x + (nx * TICK) / 2}
          y1={p.y + (ny * TICK) / 2}
          x2={p.x - (nx * TICK) / 2}
          y2={p.y - (ny * TICK) / 2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function Shape({
  kind,
  points,
  color,
  strokeWidth,
  dashed = false,
}: {
  kind: MeasurementKind | "calibrate";
  points: RulerPoint[];
  color: string;
  strokeWidth: number;
  dashed?: boolean;
}) {
  const dash = dashed ? "7 4" : undefined;
  if (kind === "area" && points.length >= 3) {
    return (
      <polygon
        points={pointsAttr(points)}
        fill={color}
        fillOpacity={AREA_FILL_OPACITY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinejoin="round"
      />
    );
  }
  return (
    <>
      <polyline
        points={pointsAttr(points)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {(kind === "distance" || kind === "calibrate") && points.length === 2 && (
        <EndTicks
          a={points[0]}
          b={points[1]}
          color={color}
          strokeWidth={strokeWidth}
        />
      )}
    </>
  );
}

interface MeasurementShapeProps {
  item: RulerRenderedMeasurement;
  zoom: number;
  isSelected: boolean;
  isHovered: boolean;
  showIdleLabel: boolean;
  isEditable: boolean;
  isInteractionPassthroughActive: boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  onVertexPointerDown: RulerMeasurementLayerProps["onVertexPointerDown"];
}

function MeasurementShape({
  item,
  zoom,
  isSelected,
  isHovered,
  showIdleLabel,
  isEditable,
  isInteractionPassthroughActive,
  onSelect,
  onDelete,
  onHoverChange,
  onVertexPointerDown,
}: MeasurementShapeProps) {
  const { id, kind, pointsS, color, label, detailLines } = item;
  const strokeWidth = isSelected ? item.strokeWidth + 1 : item.strokeWidth;
  const zoomScale = getZoomScale(zoom);
  const lines = isSelected ? [label, ...detailLines] : [label];
  const charWidth = isSelected ? 7.4 : 7;
  const width = isSelected
    ? Math.max(...lines.map((l) => textWidth(l, charWidth)), 80) +
      LABEL_PADDING_X * 2
    : idleLabelSize(label, zoom).width;
  const height = isSelected
    ? Math.round((lines.length * LINE_HEIGHT + LABEL_PADDING_Y * 2) * zoomScale)
    : idleLabelSize(label, zoom).height;
  const labelCenter = getLabelCenter(kind, pointsS, width, height);
  const showLabel = isSelected || isHovered || showIdleLabel;
  const showDelete = isSelected || isHovered;
  const deleteCenter = {
    x: labelCenter.x + width / 2 + DEL_R + DELETE_LABEL_GAP,
    y: labelCenter.y,
  };
  const lineStep = Math.round(LINE_HEIGHT * zoomScale);
  const firstLineY = labelCenter.y - ((lines.length - 1) * lineStep) / 2;
  const closedForHit = kind === "area" ? [...pointsS, pointsS[0]] : pointsS;

  return (
    <g
      data-ruler-interactive="true"
      onPointerEnter={() => {
        if (!isInteractionPassthroughActive) onHoverChange(id);
      }}
      onPointerLeave={() => onHoverChange(null)}
      onClick={(e) => {
        if (isInteractionPassthroughActive) return;
        e.stopPropagation();
        onSelect(isSelected ? null : id);
      }}
      style={{
        pointerEvents: isInteractionPassthroughActive ? "none" : "all",
        cursor: isInteractionPassthroughActive ? "crosshair" : "pointer",
      }}
    >
      <polyline
        points={pointsAttr(closedForHit)}
        fill={kind === "area" ? "transparent" : "none"}
        stroke="transparent"
        strokeWidth={LINE_HIT_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents={
          isInteractionPassthroughActive
            ? "none"
            : kind === "area"
              ? "all"
              : "stroke"
        }
      />
      <Shape
        kind={kind}
        points={pointsS}
        color={color}
        strokeWidth={strokeWidth}
      />

      {pointsS.map((p, index) =>
        isSelected && isEditable ? (
          <circle
            key={index}
            data-ruler-control="true"
            cx={p.x}
            cy={p.y}
            r={HANDLE_RADIUS}
            fill="white"
            stroke={color}
            strokeWidth={2}
            style={{ cursor: "move", pointerEvents: "all" }}
            onPointerDown={(e) => onVertexPointerDown(id, index, e)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <circle
            key={index}
            cx={p.x}
            cy={p.y}
            r={kind === "distance" ? RULER_DOT_RADIUS : RULER_DOT_RADIUS - 1.5}
            fill={color}
            stroke="white"
            strokeWidth={2}
          />
        ),
      )}

      {showLabel && (
        <g
          style={{
            pointerEvents: isInteractionPassthroughActive ? "none" : "all",
            cursor: "pointer",
          }}
        >
          <rect
            x={labelCenter.x - width / 2}
            y={labelCenter.y - height / 2}
            width={width}
            height={height}
            rx={isSelected ? 5 : 4}
            fill="white"
            fillOpacity={isSelected ? 1 : 0.94}
            stroke={color}
            strokeWidth={isSelected ? 1.5 : 1}
            filter="url(#ruler-shadow)"
          />
          {lines.map((line, index) => (
            <text
              key={index}
              x={labelCenter.x}
              y={firstLineY + index * lineStep + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={index === 0 ? color : "black"}
              fillOpacity={index === 0 ? 1 : 0.62}
              fontSize={index === 0 ? (isSelected ? 12 : 10) : 11}
              fontFamily={MONO}
              fontWeight={index === 0 ? 600 : 500}
              style={{ userSelect: "none" }}
            >
              {line}
            </text>
          ))}
        </g>
      )}

      {showDelete && (
        <g
          data-ruler-control="true"
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(id);
          }}
        >
          <circle
            cx={deleteCenter.x}
            cy={deleteCenter.y}
            r={DEL_R}
            style={{ fill: DELETE_COLOR }}
            stroke="white"
            strokeWidth={1.5}
          />
          <text
            x={deleteCenter.x}
            y={deleteCenter.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={12}
            fontWeight={700}
            style={{ userSelect: "none" }}
          >
            ×
          </text>
        </g>
      )}
    </g>
  );
}

function Guide({ guide }: { guide: RulerGuide }) {
  const { from, to, kind } = guide;
  const length = dist(from, to) || 1;
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  // Angle guides run on past the cursor; alignment guides span both points.
  const start = kind === "align" ? GUIDE_OVERSHOOT : 0;
  return (
    <g>
      <line
        x1={from.x - ux * start}
        y1={from.y - uy * start}
        x2={to.x + ux * GUIDE_OVERSHOOT * (kind === "angle" ? 4 : 1)}
        y2={to.y + uy * GUIDE_OVERSHOOT * (kind === "angle" ? 4 : 1)}
        style={{ stroke: GUIDE_COLOR }}
        strokeWidth={1}
        strokeDasharray={kind === "angle" ? "6 4" : "3 3"}
      />
      {kind === "align" && (
        <>
          <circle
            cx={from.x}
            cy={from.y}
            r={2.5}
            style={{ fill: GUIDE_COLOR }}
          />
          <circle cx={to.x} cy={to.y} r={2.5} style={{ fill: GUIDE_COLOR }} />
        </>
      )}
    </g>
  );
}

function DraftShape({ draft, zoom }: { draft: RulerDraft; zoom: number }) {
  const { kind, pointsS, label, color } = draft;
  if (pointsS.length === 0) return null;
  const width = label
    ? Math.max(textWidth(label, 8) + LABEL_PADDING_X * 2, 80)
    : 0;
  const height = Math.round(26 * getZoomScale(zoom));
  const labelCenter =
    label && pointsS.length >= 2
      ? getLabelCenter(kind, pointsS, width, height)
      : null;

  return (
    <g>
      {pointsS.length >= 2 && (
        <Shape
          kind={kind}
          points={pointsS}
          color={color}
          strokeWidth={2}
          dashed
        />
      )}
      {pointsS.slice(0, -1).map((p, index) => (
        <circle
          key={index}
          cx={p.x}
          cy={p.y}
          r={index === 0 ? RULER_DOT_RADIUS : RULER_DOT_RADIUS - 1.5}
          fill={color}
          stroke="white"
          strokeWidth={2}
        />
      ))}
      {labelCenter && label && (
        <g>
          <rect
            x={labelCenter.x - width / 2}
            y={labelCenter.y - height / 2}
            width={width}
            height={height}
            rx={5}
            fill={color}
            stroke="white"
            strokeWidth={1}
          />
          <text
            x={labelCenter.x}
            y={labelCenter.y + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={12}
            fontFamily={MONO}
            fontWeight={600}
            style={{ userSelect: "none" }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

export function RulerMeasurementLayer({
  measurements,
  zoom,
  selectedId,
  hoveredId,
  labelVisibility,
  isInteractionPassthroughActive,
  isEditable,
  draft,
  cursor,
  snapPoint,
  guides,
  pageContentRef,
  onSelect,
  onDelete,
  onHoverChange,
  onVertexPointerDown,
}: RulerMeasurementLayerProps) {
  const visibleIdleLabelIds = React.useMemo(
    () => getVisibleIdleLabelIds(measurements, zoom),
    [measurements, zoom],
  );
  const orderedMeasurements = React.useMemo(() => {
    const rank = (item: RulerRenderedMeasurement) =>
      item.id === hoveredId ? 2 : item.id === selectedId ? 1 : 0;
    return [...measurements].sort((a, b) => rank(a) - rank(b));
  }, [hoveredId, measurements, selectedId]);

  const shouldShowIdleLabel = (id: string) =>
    labelVisibility === "showAll" ||
    (labelVisibility === "hideSmall" && visibleIdleLabelIds.has(id));

  const cursorColor = draft?.color ?? DEFAULT_CURSOR_COLOR;

  return (
    <>
      <g ref={pageContentRef}>
        {orderedMeasurements.map((item) => (
          <MeasurementShape
            key={item.id}
            item={item}
            zoom={zoom}
            isSelected={
              !isInteractionPassthroughActive && selectedId === item.id
            }
            isHovered={!isInteractionPassthroughActive && hoveredId === item.id}
            showIdleLabel={shouldShowIdleLabel(item.id)}
            isEditable={isEditable}
            isInteractionPassthroughActive={isInteractionPassthroughActive}
            onSelect={onSelect}
            onDelete={onDelete}
            onHoverChange={onHoverChange}
            onVertexPointerDown={onVertexPointerDown}
          />
        ))}
      </g>

      {guides.map((guide, index) => (
        <Guide key={index} guide={guide} />
      ))}

      {draft && <DraftShape draft={draft} zoom={zoom} />}

      {snapPoint && (
        <circle
          cx={snapPoint.x}
          cy={snapPoint.y}
          r={HANDLE_RADIUS + 3}
          fill="none"
          style={{ stroke: cursorColor }}
          strokeWidth={2}
        />
      )}

      {cursor && (
        <g opacity={0.75}>
          <line
            x1={cursor.x - 12}
            y1={cursor.y}
            x2={cursor.x + 12}
            y2={cursor.y}
            style={{ stroke: cursorColor }}
            strokeWidth={1.5}
          />
          <line
            x1={cursor.x}
            y1={cursor.y - 12}
            x2={cursor.x}
            y2={cursor.y + 12}
            style={{ stroke: cursorColor }}
            strokeWidth={1.5}
          />
          <circle
            cx={cursor.x}
            cy={cursor.y}
            r={2}
            style={{ fill: cursorColor }}
          />
        </g>
      )}
    </>
  );
}
