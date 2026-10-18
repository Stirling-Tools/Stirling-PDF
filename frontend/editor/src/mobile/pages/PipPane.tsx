import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import "@app/pages/PipPane.css";

export type PipCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type Point = { x: number; y: number };

interface PipPaneProps {
  /** Fills the screen. */
  front: boolean;
  /** Not in front, but waiting in the corner; otherwise hidden. */
  pip: boolean;
  /**
   * "live" waits as the pane itself scaled down (pinch to resize); "card"
   * shrinks into a small card naming it, for a pane you need to recognise
   * rather than read.
   */
  variant: "live" | "card";
  /** Thumbnail size as a fraction of the screen; pinch changes it. */
  scale: number;
  onScale: (scale: number) => void;
  label: string;
  caption: string;
  icon?: ReactNode;
  onOpen: () => void;
  /** Offset from the corner while dragged or settling, null at rest. */
  onDrag: (offset: Point | null) => void;
  /** The corner to settle in, chosen on release. */
  onDrop: (corner: PipCorner) => void;
  children: ReactNode;
}

const TAP_SLOP_PX = 8;
const MIN_SCALE = 0.2;
const MAX_SCALE = 0.55;
// How far ahead a flick carries the thumbnail when choosing its corner.
const FLICK_PROJECTION_MS = 180;
// Matches .pip-stage --pip-gap.
const GAP_PX = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Where a box of this size sits in each corner of the stage. */
function cornerOrigin(
  corner: PipCorner,
  stage: DOMRect,
  width: number,
  height: number,
): Point {
  return {
    x: corner.endsWith("left")
      ? stage.left + GAP_PX
      : stage.right - GAP_PX - width,
    y: corner.startsWith("top")
      ? stage.top + GAP_PX
      : stage.bottom - GAP_PX - height,
  };
}

interface Gesture {
  pointers: Map<number, Point>;
  start: Point;
  box: DOMRect;
  stage: DOMRect;
  offset: Point;
  last: { point: Point; time: number };
  velocity: Point;
  pinch: { distance: number; scale: number } | null;
  moved: boolean;
}

/**
 * One of the two full screens. Behind the other one it is the same live
 * content scaled into a corner: tap to bring it back, drag it to another
 * corner, pinch to resize. Its content never unmounts.
 */
export function PipPane({
  front,
  pip,
  variant,
  scale,
  onScale,
  label,
  caption,
  icon,
  onOpen,
  onDrag,
  onDrop,
  children,
}: PipPaneProps) {
  const { t } = useTranslation();
  const state = front
    ? "front"
    : pip
      ? variant === "live"
        ? "pip"
        : "card"
      : "hidden";
  // Growing back out of the card is played once, on the way to the front.
  const previousState = useRef(state);
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    if (previousState.current === "card" && state === "front")
      setEntering(true);
    previousState.current = state;
  }, [state]);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [gesturing, setGesturing] = useState(false);
  const scaleStyle = { "--pip-scale": scale } as CSSProperties;

  const settle = (g: Gesture) => {
    const width = g.box.width;
    const height = g.box.height;
    const releasedAt = {
      x: g.box.left + g.offset.x,
      y: g.box.top + g.offset.y,
    };
    const projected = {
      x: releasedAt.x + width / 2 + g.velocity.x * FLICK_PROJECTION_MS,
      y: releasedAt.y + height / 2 + g.velocity.y * FLICK_PROJECTION_MS,
    };
    const midX = g.stage.left + g.stage.width / 2;
    const midY = g.stage.top + g.stage.height / 2;
    const next: PipCorner =
      projected.y < midY
        ? projected.x < midX
          ? "top-left"
          : "top-right"
        : projected.x < midX
          ? "bottom-left"
          : "bottom-right";
    const origin = cornerOrigin(next, g.stage, width, height);

    // Re-anchor to the new corner without moving, then let it glide home.
    onDrop(next);
    onDrag({ x: releasedAt.x - origin.x, y: releasedAt.y - origin.y });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setGesturing(false);
        onDrag(null);
      }),
    );
  };

  return (
    <>
      <section
        className="pip-pane"
        data-state={state}
        data-entering={entering}
        data-gesture={gesturing}
        style={scaleStyle}
        inert={!front}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setEntering(false);
        }}
      >
        {children}
      </section>
      {(state === "pip" || state === "card") && (
        <button
          type="button"
          className="pip-target"
          data-variant={variant}
          data-gesture={gesturing}
          style={scaleStyle}
          aria-label={t("mobile.pip.open", "Open {{name}}", { name: label })}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = { x: event.clientX, y: event.clientY };
            const g = gesture.current;
            if (!g) {
              const stage = event.currentTarget.parentElement;
              if (!stage) return;
              gesture.current = {
                pointers: new Map([[event.pointerId, point]]),
                start: point,
                box: event.currentTarget.getBoundingClientRect(),
                stage: stage.getBoundingClientRect(),
                offset: { x: 0, y: 0 },
                last: { point, time: event.timeStamp },
                velocity: { x: 0, y: 0 },
                pinch: null,
                moved: false,
              };
              return;
            }
            g.pointers.set(event.pointerId, point);
            if (g.pointers.size === 2 && variant === "live") {
              const [a, b] = [...g.pointers.values()];
              g.pinch = { distance: distance(a, b), scale };
              g.moved = true;
              setGesturing(true);
              onDrag(null);
            }
          }}
          onPointerMove={(event) => {
            const g = gesture.current;
            if (!g || !g.pointers.has(event.pointerId)) return;
            const point = { x: event.clientX, y: event.clientY };
            g.pointers.set(event.pointerId, point);

            if (g.pinch) {
              if (g.pointers.size !== 2) return;
              const [a, b] = [...g.pointers.values()];
              onScale(
                clamp(
                  g.pinch.scale * (distance(a, b) / g.pinch.distance),
                  MIN_SCALE,
                  MAX_SCALE,
                ),
              );
              return;
            }

            const dx = point.x - g.start.x;
            const dy = point.y - g.start.y;
            if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
            if (!g.moved) {
              g.moved = true;
              setGesturing(true);
            }
            // Keep the whole thumbnail on screen.
            g.offset = {
              x: clamp(
                dx,
                g.stage.left + GAP_PX - g.box.left,
                g.stage.right - GAP_PX - g.box.right,
              ),
              y: clamp(
                dy,
                g.stage.top + GAP_PX - g.box.top,
                g.stage.bottom - GAP_PX - g.box.bottom,
              ),
            };
            const elapsed = Math.max(1, event.timeStamp - g.last.time);
            g.velocity = {
              x: (point.x - g.last.point.x) / elapsed,
              y: (point.y - g.last.point.y) / elapsed,
            };
            g.last = { point, time: event.timeStamp };
            onDrag(g.offset);
          }}
          onPointerUp={(event) => {
            const g = gesture.current;
            if (!g) return;
            g.pointers.delete(event.pointerId);
            if (g.pointers.size > 0) return;
            gesture.current = null;
            suppressClick.current = g.moved;
            if (g.moved && !g.pinch) settle(g);
            else setGesturing(false);
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setGesturing(false);
            onDrag(null);
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onOpen();
          }}
        >
          {variant === "card" ? (
            <span className="pip-card">
              <span className="pip-card-head">
                {icon && <span className="pip-card-icon">{icon}</span>}
                <span className="pip-label-text">
                  <span className="pip-label-name">{label}</span>
                  <span className="pip-label-caption">{caption}</span>
                </span>
              </span>
              <span className="pip-card-action">
                {t("mobile.pip.openSettings", "Open settings")}
                <Icon name="maximize-2" size="0.875rem" />
              </span>
            </span>
          ) : (
            <span className="pip-label">
              {icon && <span className="pip-label-icon">{icon}</span>}
              <span className="pip-label-text">
                <span className="pip-label-name">{label}</span>
                <span className="pip-label-caption">{caption}</span>
              </span>
            </span>
          )}
        </button>
      )}
    </>
  );
}
