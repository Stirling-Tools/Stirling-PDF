import React from "react";
import { useTranslation } from "react-i18next";

import type { MeasureScale, Measurement } from "@app/utils/measurementTypes";
import {
  POINT_TO_UNIT,
  convertUnit,
  generateScaleLabel,
  isImperialUnit,
} from "@app/utils/measurementUtils";

export interface RulerPoint {
  x: number;
  y: number;
}

export interface RulerRenderedMeasurement {
  measurement: Measurement;
  startS: RulerPoint;
  endS: RulerPoint;
  distPts: number;
  measureScale: MeasureScale | null;
}

export type RulerLabelVisibilityMode = "hideSmall" | "showAll" | "hideAll";

interface RulerMeasurementLayerProps {
  measurements: RulerRenderedMeasurement[];
  zoom: number;
  selectedId: string | null;
  hoveredId: string | null;
  labelVisibilityMode: RulerLabelVisibilityMode;
  isInteractionPassthroughActive: boolean;
  liveLine?: {
    startS: RulerPoint;
    endS: RulerPoint;
    measureScale?: MeasureScale | null;
  } | null;
  firstPoint?: RulerPoint | null;
  cursor?: RulerPoint | null;
  pageContentRef?: React.Ref<SVGGElement>;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  onClearAll: () => void;
  onCycleLabelVisibilityMode: () => void;
}

interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface MeasurementLineLabels {
  scaled: string;
  physical: string;
}

export const RULER_DOT_RADIUS = 5;

const TICK = 10;
const LH = 26; // label height (normal, 1 line)
const LH2 = 44; // label height (hovered, no scale, 2 lines)
const LH3 = 62; // label height (hovered, with scale, 3 lines)
const LP = 10; // label horizontal padding
const DEL_R = 8;
const IDLE_LH = 20;
const IDLE_LP = 6;
const IDLE_LABEL_MIN_WIDTH = 42;
const IDLE_LABEL_MIN_LINE_LENGTH = 88;
const IDLE_LABEL_COLLISION_GAP = 6;
const LABEL_LINE_GAP = 8;
const DELETE_LINE_GAP = 10;
const DELETE_LABEL_GAP = 8;
const LINE_HIT_WIDTH = 18;
const LABEL_MODE_BUTTON_WIDTH = 124;

function dist(a: RulerPoint, b: RulerPoint): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function midpoint(a: RulerPoint, b: RulerPoint): RulerPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function perpUnit(a: RulerPoint, b: RulerPoint): { nx: number; ny: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

function angleDeg(a: RulerPoint, b: RulerPoint): number {
  return Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * (180 / Math.PI);
}

function formatDist(pts: number): string {
  const mm = (pts / 72) * 25.4;
  if (mm < 100) return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 1000).toFixed(2)} m`;
}

function formatInches(pts: number): string {
  const inches = pts / 72;
  if (inches < 12) return `${inches.toFixed(2)} in`;
  return `${(inches / 12).toFixed(2)} ft`;
}

function getDecimalPlaces(value: number): number {
  const absVal = Math.abs(value);

  const decimalRanges = [
    { threshold: 1000000, decimals: 0 },
    { threshold: 1000, decimals: 2 },
    { threshold: 1, decimals: 3 },
    { threshold: 0.1, decimals: 3 },
    { threshold: 0.01, decimals: 4 },
    { threshold: 0.001, decimals: 5 },
  ];

  return decimalRanges.find((r) => absVal >= r.threshold)?.decimals ?? 6;
}

function formatScaled(pts: number, scale: MeasureScale): string {
  const val = pts * scale.factor;
  if (val === 0) return `0 ${scale.unit}`;

  const decimals = getDecimalPlaces(val);

  return `${val.toFixed(decimals)} ${scale.unit}`;
}

function scaledCross(pts: number, scale: MeasureScale): string | null {
  const unit = scale.unit.toLowerCase().trim();

  if (!Object.hasOwn(POINT_TO_UNIT, unit)) return null;

  const valueInUnit = pts * scale.factor;

  if (isImperialUnit(scale.unit)) {
    const meters = convertUnit(valueInUnit, scale.unit, "m");
    if (meters === null) return null;
    const decimals = getDecimalPlaces(meters);
    return `${meters.toFixed(decimals)} m`;
  } else {
    const feet = convertUnit(valueInUnit, scale.unit, "ft");
    if (feet === null) return null;
    const decimals = getDecimalPlaces(feet);
    return `${feet.toFixed(decimals)} ft`;
  }
}

function getZoomScale(zoom: number): number {
  return Math.max(0.6, Math.min(1.0, zoom / 1.5));
}

function getMeasurementLabel(
  distPts: number,
  measureScale?: MeasureScale | null,
): string {
  return measureScale
    ? formatScaled(distPts, measureScale)
    : formatDist(distPts);
}

function preferredPerpUnit(
  a: RulerPoint,
  b: RulerPoint,
): { nx: number; ny: number } {
  const normal = perpUnit(a, b);
  if (normal.ny > 0 || (Math.abs(normal.ny) < 0.001 && normal.nx < 0)) {
    return { nx: -normal.nx, ny: -normal.ny };
  }
  return normal;
}

function getLabelCenter(
  a: RulerPoint,
  b: RulerPoint,
  width: number,
  height: number,
): RulerPoint {
  const mid = midpoint(a, b);
  const { nx, ny } = preferredPerpUnit(a, b);
  const projectedHalfSize =
    (Math.abs(nx) * width) / 2 + (Math.abs(ny) * height) / 2;
  const offset = projectedHalfSize + RULER_DOT_RADIUS + LABEL_LINE_GAP;
  return {
    x: mid.x + nx * offset,
    y: mid.y + ny * offset,
  };
}

function getIdleLabelDimensions(label: string, zoom: number) {
  return {
    width: Math.max(label.length * 7 + IDLE_LP * 2, IDLE_LABEL_MIN_WIDTH),
    height: Math.max(18, Math.round(IDLE_LH * getZoomScale(zoom))),
  };
}

function getIdleLabelBox(
  startS: RulerPoint,
  endS: RulerPoint,
  label: string,
  zoom: number,
): LabelBox {
  const { width, height } = getIdleLabelDimensions(label, zoom);
  const center = getLabelCenter(startS, endS, width, height);
  return {
    left: center.x - width / 2,
    top: center.y - height / 2,
    right: center.x + width / 2,
    bottom: center.y + height / 2,
  };
}

function getBoxFromCenter(
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

function circleOverlapsBox(
  center: RulerPoint,
  radius: number,
  box: LabelBox,
  gap: number,
): boolean {
  return (
    center.x + radius + gap >= box.left &&
    center.x - radius - gap <= box.right &&
    center.y + radius + gap >= box.top &&
    center.y - radius - gap <= box.bottom
  );
}

function lineUnit(a: RulerPoint, b: RulerPoint): { ux: number; uy: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { ux: dx / len, uy: dy / len };
}

function getDeleteCenter(
  startS: RulerPoint,
  endS: RulerPoint,
  labelCenter: RulerPoint,
  labelWidth: number,
  labelHeight: number,
): RulerPoint {
  const { nx, ny } = preferredPerpUnit(startS, endS);
  const endpointCenter = {
    x: endS.x + nx * (RULER_DOT_RADIUS + DEL_R + DELETE_LINE_GAP),
    y: endS.y + ny * (RULER_DOT_RADIUS + DEL_R + DELETE_LINE_GAP),
  };
  const labelBox = getBoxFromCenter(labelCenter, labelWidth, labelHeight);

  if (!circleOverlapsBox(endpointCenter, DEL_R, labelBox, DELETE_LABEL_GAP)) {
    return endpointCenter;
  }

  const { ux, uy } = lineUnit(startS, endS);
  const projectedLabelRadius =
    (Math.abs(ux) * labelWidth) / 2 + (Math.abs(uy) * labelHeight) / 2;

  return {
    x: labelCenter.x + ux * (projectedLabelRadius + DEL_R + DELETE_LABEL_GAP),
    y: labelCenter.y + uy * (projectedLabelRadius + DEL_R + DELETE_LABEL_GAP),
  };
}

function getVisibleIdleLabelIds(
  renderedMeasurements: RulerRenderedMeasurement[],
  zoom: number,
): Set<string> {
  const visibleIds = new Set<string>();
  const occupiedBoxes: LabelBox[] = [];

  renderedMeasurements
    .map((item, index) => ({
      item,
      index,
      lineLength: dist(item.startS, item.endS),
      label: getMeasurementLabel(item.distPts, item.measureScale),
    }))
    .sort((a, b) => b.lineLength - a.lineLength || a.index - b.index)
    .forEach(({ item, lineLength, label }) => {
      const box = getIdleLabelBox(item.startS, item.endS, label, zoom);
      const labelWidth = box.right - box.left;
      const hasEnoughRoom =
        lineLength >= Math.max(IDLE_LABEL_MIN_LINE_LENGTH, labelWidth + 24);
      const collides = occupiedBoxes.some((occupiedBox) =>
        boxesOverlap(box, occupiedBox, IDLE_LABEL_COLLISION_GAP),
      );

      if (hasEnoughRoom && !collides) {
        visibleIds.add(item.measurement.id);
        occupiedBoxes.push(box);
      }
    });

  return visibleIds;
}

interface MeasurementLineProps {
  id: string;
  startS: RulerPoint;
  endS: RulerPoint;
  distPts: number;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  onHoverChange: (id: string | null) => void;
  measureScale?: MeasureScale | null;
  zoom: number;
  showIdleLabel: boolean;
  expandLabelOnHover: boolean;
  isInteractionPassthroughActive: boolean;
  labels: MeasurementLineLabels;
}

function MeasurementLine({
  id,
  startS,
  endS,
  distPts,
  isSelected,
  isHovered,
  onSelect,
  onDelete,
  onHoverChange,
  measureScale,
  zoom,
  showIdleLabel,
  expandLabelOnHover,
  isInteractionPassthroughActive,
  labels,
}: MeasurementLineProps) {
  const { nx, ny } = preferredPerpUnit(startS, endS);
  const ang = angleDeg(startS, endS);
  const angLabel = `∠ ${ang.toFixed(1)}°`;

  const imperialFirst = !!measureScale && isImperialUnit(measureScale.unit);
  const distLabel = getMeasurementLabel(distPts, measureScale);

  const hoverLine1 = measureScale
    ? (() => {
        const primary = formatScaled(distPts, measureScale);
        const cross = scaledCross(distPts, measureScale);
        return cross
          ? `${labels.scaled}: ${primary} / ${cross}`
          : `${labels.scaled}: ${primary}`;
      })()
    : `${formatDist(distPts)} / ${formatInches(distPts)}`;

  const hoverLine2 = measureScale
    ? imperialFirst
      ? `${labels.physical}: ${formatInches(distPts)} / ${formatDist(distPts)}`
      : `${labels.physical}: ${formatDist(distPts)} / ${formatInches(distPts)}`
    : null;

  const scaleLabel = measureScale
    ? generateScaleLabel(measureScale.ratio, measureScale.unit)
    : null;
  const contextLabel = scaleLabel ? `${scaleLabel}   ${angLabel}` : angLabel;

  const zoomScale = getZoomScale(zoom);
  const scaledLH = Math.round(LH * zoomScale);
  const scaledLH2 = Math.round(LH2 * zoomScale);
  const scaledLH3 = Math.round(LH3 * zoomScale);
  const idleDimensions = getIdleLabelDimensions(distLabel, zoom);

  const maxHoverLh = measureScale ? scaledLH3 : scaledLH2;
  const isHoveredLabelExpanded = isHovered && expandLabelOnHover;
  const isInspecting = isSelected || isHoveredLabelExpanded;
  const isCompactIdle = !isInspecting;
  const showLabel = isSelected || isHovered || showIdleLabel;
  const showDelete = isSelected || isHovered;
  const lh = isSelected
    ? maxHoverLh
    : isHoveredLabelExpanded
      ? scaledLH
      : idleDimensions.height;

  const lwNormal = Math.max(distLabel.length * 8 + LP * 2, 80);
  const lwHover = Math.max(
    hoverLine1.length * 8 + LP * 2,
    (hoverLine2?.length ?? 0) * 8 + LP * 2,
    contextLabel.length * 8 + LP * 2,
    80,
  );
  const lw = isSelected
    ? lwHover
    : isHoveredLabelExpanded
      ? lwNormal
      : idleDimensions.width;
  const sw = isSelected ? 3 : 2;

  const labelCenter = getLabelCenter(startS, endS, lw, lh);
  const deleteCenter = getDeleteCenter(startS, endS, labelCenter, lw, lh);
  const mono = "'Roboto Mono','Consolas',monospace";

  return (
    <g
      data-ruler-interactive="true"
      onPointerEnter={() => {
        if (!isInteractionPassthroughActive) {
          onHoverChange(id);
        }
      }}
      onPointerLeave={() => onHoverChange(null)}
      onClick={(e) => {
        if (isInteractionPassthroughActive) {
          return;
        }

        e.stopPropagation();
        onSelect(isSelected ? null : id);
      }}
      style={{
        pointerEvents: isInteractionPassthroughActive ? "none" : "all",
        cursor: isInteractionPassthroughActive ? "crosshair" : "pointer",
      }}
    >
      <line
        x1={startS.x}
        y1={startS.y}
        x2={endS.x}
        y2={endS.y}
        stroke="transparent"
        strokeWidth={LINE_HIT_WIDTH}
        strokeLinecap="round"
        pointerEvents="stroke"
      />

      <line
        x1={startS.x}
        y1={startS.y}
        x2={endS.x}
        y2={endS.y}
        stroke="#1e88e5"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <line
        x1={startS.x + (nx * TICK) / 2}
        y1={startS.y + (ny * TICK) / 2}
        x2={startS.x - (nx * TICK) / 2}
        y2={startS.y - (ny * TICK) / 2}
        stroke="#1e88e5"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <line
        x1={endS.x + (nx * TICK) / 2}
        y1={endS.y + (ny * TICK) / 2}
        x2={endS.x - (nx * TICK) / 2}
        y2={endS.y - (ny * TICK) / 2}
        stroke="#1e88e5"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      <circle
        cx={startS.x}
        cy={startS.y}
        r={RULER_DOT_RADIUS}
        fill="#1e88e5"
        stroke="white"
        strokeWidth={2}
      />
      <circle
        cx={endS.x}
        cy={endS.y}
        r={RULER_DOT_RADIUS}
        fill="#1e88e5"
        stroke="white"
        strokeWidth={2}
      />

      {showLabel && (
        <g style={{ pointerEvents: "all", cursor: "pointer" }}>
          <rect
            x={labelCenter.x - lw / 2 - 4}
            y={labelCenter.y - lh / 2 - 4}
            width={lw + 8}
            height={lh + 8}
            fill="transparent"
            stroke="none"
          />

          <rect
            x={labelCenter.x - lw / 2}
            y={labelCenter.y - lh / 2}
            width={lw}
            height={lh}
            rx={isCompactIdle ? 4 : 5}
            fill={isCompactIdle ? "rgba(255,255,255,0.94)" : "white"}
            stroke="#1e88e5"
            strokeWidth={isCompactIdle ? 1 : 1.5}
            filter="url(#ruler-shadow)"
          />

          {isSelected && measureScale ? (
            <>
              <text
                x={labelCenter.x}
                y={labelCenter.y - Math.round(17 * zoomScale)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#1e88e5"
                fontSize={12}
                fontFamily={mono}
                fontWeight={600}
                style={{ userSelect: "none" }}
              >
                {hoverLine1}
              </text>
              <text
                x={labelCenter.x}
                y={labelCenter.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#546e7a"
                fontSize={11}
                fontFamily={mono}
                fontWeight={500}
                style={{ userSelect: "none" }}
              >
                {hoverLine2}
              </text>
              <text
                x={labelCenter.x}
                y={labelCenter.y + Math.round(17 * zoomScale)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#5c6bc0"
                fontSize={10}
                fontFamily={mono}
                fontWeight={500}
                style={{ userSelect: "none" }}
              >
                {contextLabel}
              </text>
            </>
          ) : isSelected ? (
            <>
              <text
                x={labelCenter.x}
                y={labelCenter.y - Math.round(6 * zoomScale)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#1e88e5"
                fontSize={12}
                fontFamily={mono}
                fontWeight={600}
                style={{ userSelect: "none" }}
              >
                {hoverLine1}
              </text>
              <text
                x={labelCenter.x}
                y={labelCenter.y + Math.round(13 * zoomScale)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#5c6bc0"
                fontSize={11}
                fontFamily={mono}
                fontWeight={500}
                style={{ userSelect: "none" }}
              >
                {contextLabel}
              </text>
            </>
          ) : (
            <text
              x={labelCenter.x}
              y={labelCenter.y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1e88e5"
              fontSize={isCompactIdle ? 10 : 12}
              fontFamily={mono}
              fontWeight={600}
              style={{ userSelect: "none" }}
            >
              {distLabel}
            </text>
          )}
        </g>
      )}

      {showDelete && (
        <>
          <line
            x1={endS.x}
            y1={endS.y}
            x2={deleteCenter.x}
            y2={deleteCenter.y}
            stroke="transparent"
            strokeWidth={DEL_R * 2}
            strokeLinecap="round"
            pointerEvents="stroke"
          />
          <g
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
          >
            <circle
              cx={deleteCenter.x}
              cy={deleteCenter.y}
              r={DEL_R}
              fill="#ef5350"
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
        </>
      )}
    </g>
  );
}

interface LiveLineProps {
  startS: RulerPoint;
  endS: RulerPoint;
  zoom: number;
  measureScale?: MeasureScale | null;
}

function LiveLine({ startS, endS, zoom, measureScale }: LiveLineProps) {
  const d = dist(startS, endS) / zoom;
  const { nx, ny } = preferredPerpUnit(startS, endS);
  const ang = angleDeg(startS, endS);
  const distLabel = measureScale
    ? formatScaled(d, measureScale)
    : formatDist(d);
  const lw = Math.max(distLabel.length * 8 + LP * 2, 80);
  const lh = Math.round(LH2 * getZoomScale(zoom));
  const labelCenter = getLabelCenter(startS, endS, lw, lh);

  return (
    <g>
      <line
        x1={startS.x}
        y1={startS.y}
        x2={endS.x}
        y2={endS.y}
        stroke="#1e88e5"
        strokeWidth={2}
        strokeDasharray="7 4"
        strokeLinecap="round"
        opacity={0.85}
      />
      <line
        x1={startS.x + (nx * TICK) / 2}
        y1={startS.y + (ny * TICK) / 2}
        x2={startS.x - (nx * TICK) / 2}
        y2={startS.y - (ny * TICK) / 2}
        stroke="#1e88e5"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {d > 4 && (
        <g>
          <rect
            x={labelCenter.x - lw / 2}
            y={labelCenter.y - lh / 2}
            width={lw}
            height={lh}
            rx={5}
            fill="#1e88e5"
            stroke="white"
            strokeWidth={1}
          />
          <text
            x={labelCenter.x}
            y={labelCenter.y - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize={12}
            fontFamily="'Roboto Mono','Consolas',monospace"
            fontWeight={600}
            style={{ userSelect: "none" }}
          >
            {distLabel}
          </text>
          <text
            x={labelCenter.x}
            y={labelCenter.y + 13}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.85)"
            fontSize={11}
            fontFamily="'Roboto Mono','Consolas',monospace"
            fontWeight={500}
            style={{ userSelect: "none" }}
          >
            {`∠ ${ang.toFixed(1)}°`}
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
  labelVisibilityMode,
  isInteractionPassthroughActive,
  liveLine,
  firstPoint,
  cursor,
  pageContentRef,
  onSelect,
  onDelete,
  onHoverChange,
  onClearAll,
  onCycleLabelVisibilityMode,
}: RulerMeasurementLayerProps) {
  const { t } = useTranslation();
  const measurementLineLabels = React.useMemo(
    () => ({
      scaled: t("ruler.scaled", "Scaled"),
      physical: t("ruler.physicalValues", "Physical"),
    }),
    [t],
  );
  const visibleIdleLabelIds = React.useMemo(
    () => getVisibleIdleLabelIds(measurements, zoom),
    [measurements, zoom],
  );
  const orderedMeasurements = React.useMemo(() => {
    const getRank = (item: RulerRenderedMeasurement) => {
      if (item.measurement.id === hoveredId) {
        return 2;
      }

      if (item.measurement.id === selectedId) {
        return 1;
      }

      return 0;
    };

    return [...measurements].sort((a, b) => getRank(a) - getRank(b));
  }, [hoveredId, measurements, selectedId]);

  const getShouldShowIdleLabel = (measurementId: string) => {
    if (labelVisibilityMode === "showAll") {
      return true;
    }

    if (labelVisibilityMode === "hideAll") {
      return false;
    }

    return visibleIdleLabelIds.has(measurementId);
  };

  const labelModeButtonLabel =
    labelVisibilityMode === "hideSmall"
      ? t("ruler.showAllLabels", "Show all labels")
      : labelVisibilityMode === "showAll"
        ? t("ruler.hideAllLabels", "Hide all labels")
        : t("ruler.hideSmallLabels", "Hide small labels");

  return (
    <>
      <g ref={pageContentRef}>
        {orderedMeasurements.map((item) => {
          const { measurement, startS, endS, distPts, measureScale } = item;
          return (
            <MeasurementLine
              key={measurement.id}
              id={measurement.id}
              startS={startS}
              endS={endS}
              distPts={distPts}
              isSelected={
                !isInteractionPassthroughActive && selectedId === measurement.id
              }
              isHovered={
                !isInteractionPassthroughActive && hoveredId === measurement.id
              }
              onSelect={onSelect}
              onDelete={onDelete}
              onHoverChange={onHoverChange}
              measureScale={measureScale}
              zoom={zoom}
              showIdleLabel={getShouldShowIdleLabel(measurement.id)}
              expandLabelOnHover={labelVisibilityMode !== "showAll"}
              isInteractionPassthroughActive={isInteractionPassthroughActive}
              labels={measurementLineLabels}
            />
          );
        })}

        {firstPoint && (
          <circle
            cx={firstPoint.x}
            cy={firstPoint.y}
            r={RULER_DOT_RADIUS}
            fill="#1e88e5"
            stroke="white"
            strokeWidth={2}
          />
        )}
      </g>

      {liveLine && (
        <LiveLine
          startS={liveLine.startS}
          endS={liveLine.endS}
          zoom={zoom}
          measureScale={liveLine.measureScale}
        />
      )}

      {cursor && (
        <g opacity={0.75}>
          <line
            x1={cursor.x - 12}
            y1={cursor.y}
            x2={cursor.x + 12}
            y2={cursor.y}
            stroke="#1e88e5"
            strokeWidth={1.5}
          />
          <line
            x1={cursor.x}
            y1={cursor.y - 12}
            x2={cursor.x}
            y2={cursor.y + 12}
            stroke="#1e88e5"
            strokeWidth={1.5}
          />
          <circle cx={cursor.x} cy={cursor.y} r={2} fill="#1e88e5" />
        </g>
      )}

      {measurements.length > 0 && (
        <>
          <g
            data-ruler-interactive="true"
            data-ruler-control="true"
            style={{ pointerEvents: "all", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onClearAll();
            }}
          >
            <rect
              x={8}
              y={8}
              width={88}
              height={26}
              rx={5}
              fill="rgba(239,83,80,0.9)"
              stroke="white"
              strokeWidth={1}
            />
            <text
              x={52}
              y={25}
              textAnchor="middle"
              fill="white"
              fontSize={12}
              fontFamily="sans-serif"
              fontWeight={600}
              style={{ userSelect: "none" }}
            >
              {t("ruler.clearAll", "Clear all")}
            </text>
          </g>
          <g
            data-ruler-interactive="true"
            data-ruler-control="true"
            style={{ pointerEvents: "all", cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onCycleLabelVisibilityMode();
            }}
          >
            <rect
              x={8}
              y={40}
              width={LABEL_MODE_BUTTON_WIDTH}
              height={26}
              rx={5}
              fill="rgba(30,136,229,0.9)"
              stroke="white"
              strokeWidth={1}
            />
            <text
              x={8 + LABEL_MODE_BUTTON_WIDTH / 2}
              y={57}
              textAnchor="middle"
              fill="white"
              fontSize={12}
              fontFamily="sans-serif"
              fontWeight={600}
              style={{ userSelect: "none" }}
            >
              {labelModeButtonLabel}
            </text>
          </g>
        </>
      )}
    </>
  );
}
