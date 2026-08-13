import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  guideToLine,
  lineToGuide,
  pageGuides,
  rulerTicks,
  snapToGuides,
} from "@app/tools/pdfTextEditor/v2/util/guides";
import type {
  Guide,
  GuideAxis,
  GuideOrientation,
  GuideTransform,
} from "@app/tools/pdfTextEditor/v2/util/guides";

const RULER_SIZE = 20;
const MINOR_TICK = 4;
const MAJOR_TICK = 9;
const LABEL_FONT = 8;
const GUIDE_HIT = 4;
const SNAP_PX = 4;
const RULER_BG = "#f4f5f7";
const RULER_FG = "#7c8595";
const RULER_EDGE = "#c9ced6";
const GUIDE_COLOR = "#2c7be5";

interface PageRulersProps {
  pageIndex: number;
  /** Displayed page size in PDF points (rotation applied), not CSS pixels. */
  width: number;
  height: number;
  /** CSS pixels per PDF point. */
  scale: number;
  /** Raw-PDF -> display (CropBox/rotation) transform for this page. */
  transform: GuideTransform;
  guides: readonly Guide[];
  onAddGuide: (
    pageIndex: number,
    axis: GuideAxis,
    position: number,
  ) => Guide | null;
  onMoveGuide: (pageIndex: number, id: string, position: number) => void;
  onRemoveGuide: (pageIndex: number, id: string) => void;
}

interface RulerMark {
  /** Offset along the band in CSS pixels. */
  css: number;
  major: boolean;
  label: string | null;
}

interface RulerModel {
  marks: RulerMark[];
  /** Major ticks as snap targets, in raw PDF space. */
  snapTargets: Guide[];
}

// Rulers plus draggable guides. Every coordinate shown is a raw PDF point
// routed through `transform`, so cropped and rotated pages read true.
export function PageRulers({
  pageIndex,
  width,
  height,
  scale,
  transform,
  guides,
  onAddGuide,
  onMoveGuide,
  onRemoveGuide,
}: PageRulersProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stopDragRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const cssWidth = width * scale;
  const cssHeight = height * scale;
  const unit = t("pdfTextEditorV2.rulers.unit", "pt");

  const topBand = useMemo(
    () => buildRuler(width, scale, "vertical", transform),
    [width, scale, transform],
  );
  const leftBand = useMemo(
    () => buildRuler(height, scale, "horizontal", transform),
    [height, scale, transform],
  );

  // Drop the window listeners if the page unmounts (scrolls away) mid-drag.
  useEffect(() => () => stopDragRef.current?.(), []);

  const seedAt = useCallback(
    (
      clientX: number,
      clientY: number,
      orientation: GuideOrientation,
      snap: boolean,
    ): { axis: GuideAxis; position: number; offPage: boolean } | null => {
      const root = rootRef.current;
      if (!root) return null;
      const rect = root.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      const vertical = orientation === "vertical";
      const display = vertical
        ? clamp(cssX / scale, 0, width)
        : clamp(height - cssY / scale, 0, height);
      const seed = lineToGuide({ orientation, position: display }, transform);
      const targets = vertical ? topBand.snapTargets : leftBand.snapTargets;
      const position = snap
        ? snapToGuides(seed.position, targets, SNAP_PX / scale).value
        : seed.position;
      return {
        axis: seed.axis,
        position,
        offPage: vertical
          ? cssX < 0 || cssX > cssWidth
          : cssY < 0 || cssY > cssHeight,
      };
    },
    [
      scale,
      width,
      height,
      transform,
      cssWidth,
      cssHeight,
      topBand.snapTargets,
      leftBand.snapTargets,
    ],
  );

  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      orientation: GuideOrientation,
      existing: Guide | null,
    ) => {
      if (e.button !== 0 || stopDragRef.current || !rootRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      let id = existing ? existing.id : null;
      const apply = (ev: PointerEvent): void => {
        const next = seedAt(ev.clientX, ev.clientY, orientation, !ev.altKey);
        if (!next) return;
        let current = id;
        if (current === null) {
          // A new guide only exists once the pointer actually moves, so a
          // bare click on a ruler leaves no stray guide behind.
          const created = onAddGuide(pageIndex, next.axis, next.position);
          if (!created) return;
          current = created.id;
          id = current;
        } else {
          onMoveGuide(pageIndex, current, next.position);
        }
        setDragging({ id: current, label: formatPoints(next.position) });
      };
      const finish = (ev: PointerEvent): void => {
        const end = seedAt(ev.clientX, ev.clientY, orientation, false);
        stopDragRef.current?.();
        if (id !== null && end && end.offPage) onRemoveGuide(pageIndex, id);
      };
      stopDragRef.current = () => {
        window.removeEventListener("pointermove", apply);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        stopDragRef.current = null;
        setDragging(null);
      };
      window.addEventListener("pointermove", apply);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [pageIndex, seedAt, onAddGuide, onMoveGuide, onRemoveGuide],
  );

  return (
    <div
      ref={rootRef}
      data-testid={`v2-rulers-${pageIndex}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
      }}
    >
      <div
        title={t(
          "pdfTextEditorV2.rulers.hint",
          "Drag from a ruler to add an alignment guide",
        )}
        style={{
          position: "absolute",
          top: -RULER_SIZE,
          left: -RULER_SIZE,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: RULER_BG,
          borderRight: `1px solid ${RULER_EDGE}`,
          borderBottom: `1px solid ${RULER_EDGE}`,
          pointerEvents: "auto",
        }}
      />
      <RulerBand
        edge="top"
        pageIndex={pageIndex}
        marks={topBand.marks}
        cssLength={cssWidth}
        label={t("pdfTextEditorV2.rulers.horizontal", "Horizontal ruler")}
        onPointerDown={(e) => startDrag(e, "horizontal", null)}
      />
      <RulerBand
        edge="left"
        pageIndex={pageIndex}
        marks={leftBand.marks}
        cssLength={cssHeight}
        label={t("pdfTextEditorV2.rulers.vertical", "Vertical ruler")}
        onPointerDown={(e) => startDrag(e, "vertical", null)}
      />
      {guides.map((guide) => {
        const line = guideToLine(guide, transform);
        const vertical = line.orientation === "vertical";
        const css = vertical
          ? line.position * scale
          : (height - line.position) * scale;
        const activeLabel =
          dragging && dragging.id === guide.id ? dragging.label : null;
        const label = t(
          "pdfTextEditorV2.rulers.guide",
          "Alignment guide at {{value}} {{unit}} - drag onto a ruler to remove",
          { value: formatPoints(guide.position), unit },
        );
        return (
          <div
            key={guide.id}
            role="separator"
            aria-orientation={vertical ? "vertical" : "horizontal"}
            aria-label={label}
            title={label}
            data-testid={`v2-guide-${guide.id}`}
            onPointerDown={(e) => startDrag(e, line.orientation, guide)}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              cursor: vertical ? "col-resize" : "row-resize",
              pointerEvents: "auto",
              touchAction: "none",
              ...(vertical
                ? {
                    top: 0,
                    height: cssHeight,
                    left: css - GUIDE_HIT,
                    width: GUIDE_HIT * 2,
                  }
                : {
                    left: 0,
                    width: cssWidth,
                    top: css - GUIDE_HIT,
                    height: GUIDE_HIT * 2,
                  }),
            }}
          >
            <div
              style={{
                position: "absolute",
                background: GUIDE_COLOR,
                opacity: activeLabel === null ? 0.7 : 1,
                pointerEvents: "none",
                ...(vertical
                  ? { top: 0, bottom: 0, left: GUIDE_HIT, width: 1 }
                  : { left: 0, right: 0, top: GUIDE_HIT, height: 1 }),
              }}
            />
            {activeLabel !== null && (
              <span
                style={{
                  position: "absolute",
                  ...(vertical
                    ? { top: 2, left: GUIDE_HIT + 3 }
                    : { left: 3, top: 2 }),
                  background: GUIDE_COLOR,
                  color: "#fff",
                  borderRadius: 2,
                  padding: "0 3px",
                  fontSize: 10,
                  lineHeight: "14px",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                {activeLabel} {unit}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Live guides for one page from the shared store. */
export function usePageGuides(pageIndex: number): Guide[] {
  const [guides, setGuides] = useState<Guide[]>(() =>
    pageGuides.get(pageIndex),
  );
  useEffect(() => {
    setGuides(pageGuides.get(pageIndex));
    return pageGuides.subscribe((changed, next) => {
      if (changed === pageIndex) setGuides(next);
    });
  }, [pageIndex]);
  return guides;
}

type PageGuidesProps = Omit<
  PageRulersProps,
  "guides" | "onAddGuide" | "onMoveGuide" | "onRemoveGuide"
>;

/** `PageRulers` bound to the shared store, so mounting it takes one element. */
export function PageGuides(props: PageGuidesProps) {
  const guides = usePageGuides(props.pageIndex);
  return (
    <PageRulers
      {...props}
      guides={guides}
      onAddGuide={(index, axis, position) =>
        pageGuides.add(index, axis, position)
      }
      onMoveGuide={(index, id, position) =>
        pageGuides.move(index, id, position)
      }
      onRemoveGuide={(index, id) => pageGuides.remove(index, id)}
    />
  );
}

interface RulerBandProps {
  edge: "top" | "left";
  pageIndex: number;
  marks: RulerMark[];
  cssLength: number;
  label: string;
  onPointerDown: (e: React.PointerEvent) => void;
}

function RulerBand({
  edge,
  pageIndex,
  marks,
  cssLength,
  label,
  onPointerDown,
}: RulerBandProps) {
  const horizontal = edge === "top";
  const bandWidth = horizontal ? cssLength : RULER_SIZE;
  const bandHeight = horizontal ? RULER_SIZE : cssLength;
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      data-testid={`v2-ruler-${edge}-${pageIndex}`}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        ...(horizontal
          ? { top: -RULER_SIZE, left: 0 }
          : { left: -RULER_SIZE, top: 0 }),
        width: bandWidth,
        height: bandHeight,
        background: RULER_BG,
        borderBottom: horizontal ? `1px solid ${RULER_EDGE}` : undefined,
        borderRight: horizontal ? undefined : `1px solid ${RULER_EDGE}`,
        // Pull the guide out perpendicular to the band, as every design tool does.
        cursor: horizontal ? "row-resize" : "col-resize",
        pointerEvents: "auto",
        touchAction: "none",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      <svg
        width={bandWidth}
        height={bandHeight}
        aria-hidden="true"
        shapeRendering="crispEdges"
        style={{ display: "block" }}
      >
        {marks.map((mark) => {
          const length = mark.major ? MAJOR_TICK : MINOR_TICK;
          return (
            <line
              key={`t${mark.css}`}
              x1={horizontal ? mark.css : RULER_SIZE - length}
              x2={horizontal ? mark.css : RULER_SIZE}
              y1={horizontal ? RULER_SIZE - length : mark.css}
              y2={horizontal ? RULER_SIZE : mark.css}
              stroke={RULER_FG}
            />
          );
        })}
        {marks.map((mark) =>
          mark.label === null ? null : (
            <text
              key={`l${mark.css}`}
              fill={RULER_FG}
              fontSize={LABEL_FONT}
              x={horizontal ? mark.css + 2 : undefined}
              y={horizontal ? LABEL_FONT + 1 : undefined}
              transform={
                horizontal
                  ? undefined
                  : `translate(${LABEL_FONT + 1}, ${mark.css - 2}) rotate(-90)`
              }
            >
              {mark.label}
            </text>
          ),
        )}
      </svg>
    </div>
  );
}

// Tick geometry for one band, named for the lines it measures: the top band
// measures vertical lines, the left band horizontal (y-up) ones.
function buildRuler(
  lengthInPoints: number,
  scale: number,
  orientation: GuideOrientation,
  transform: GuideTransform,
): RulerModel {
  const vertical = orientation === "vertical";
  const marks: RulerMark[] = [];
  const snapTargets: Guide[] = [];
  for (const tick of rulerTicks(lengthInPoints, scale).ticks) {
    const seed = lineToGuide(
      { orientation, position: tick.position },
      transform,
    );
    marks.push({
      css: vertical
        ? tick.position * scale
        : (lengthInPoints - tick.position) * scale,
      major: tick.major,
      label: tick.major ? formatPoints(seed.position) : null,
    });
    if (tick.major) {
      snapTargets.push({
        id: `tick-${String(snapTargets.length).padStart(6, "0")}`,
        ...seed,
      });
    }
  }
  return { marks, snapTargets };
}

function formatPoints(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
