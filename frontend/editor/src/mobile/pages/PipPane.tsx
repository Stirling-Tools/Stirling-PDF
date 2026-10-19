import {
  useEffect,
  useRef,
  useState,
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
  /** Not in front, but waiting in the corner as a card; otherwise hidden. */
  pip: boolean;
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
// How far ahead a flick carries the card when choosing its corner.
const FLICK_PROJECTION_MS = 180;
// Matches .pip-stage --pip-gap.
const GAP_PX = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  pointerId: number;
  start: Point;
  box: DOMRect;
  stage: DOMRect;
  offset: Point;
  last: { point: Point; time: number };
  velocity: Point;
  moved: boolean;
}

/**
 * One of the two full screens. Behind the other one it shrinks into a card in
 * a corner: tap to bring it back, drag it to another corner. Its content never
 * unmounts.
 */
export function PipPane({
  front,
  pip,
  label,
  caption,
  icon,
  onOpen,
  onDrag,
  onDrop,
  children,
}: PipPaneProps) {
  const { t } = useTranslation();
  const state = front ? "front" : pip ? "card" : "hidden";
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
        inert={!front}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setEntering(false);
        }}
      >
        {children}
      </section>
      {state === "card" && (
        <button
          type="button"
          className="pip-target"
          data-gesture={gesturing}
          aria-label={t("mobile.pip.open", "Open {{name}}", { name: label })}
          onPointerDown={(event) => {
            if (gesture.current) return;
            const stage = event.currentTarget.parentElement;
            if (!stage) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const point = { x: event.clientX, y: event.clientY };
            gesture.current = {
              pointerId: event.pointerId,
              start: point,
              box: event.currentTarget.getBoundingClientRect(),
              stage: stage.getBoundingClientRect(),
              offset: { x: 0, y: 0 },
              last: { point, time: event.timeStamp },
              velocity: { x: 0, y: 0 },
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const g = gesture.current;
            if (!g || g.pointerId !== event.pointerId) return;
            const point = { x: event.clientX, y: event.clientY };
            const dx = point.x - g.start.x;
            const dy = point.y - g.start.y;
            if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
            if (!g.moved) {
              g.moved = true;
              setGesturing(true);
            }
            // Keep the whole card on screen.
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
            if (!g || g.pointerId !== event.pointerId) return;
            gesture.current = null;
            suppressClick.current = g.moved;
            if (g.moved) settle(g);
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
          <span className="pip-card">
            {icon && <span className="pip-card-icon">{icon}</span>}
            <span className="pip-card-text">
              <span className="pip-card-name">{label}</span>
              <span className="pip-card-caption">{caption}</span>
            </span>
            <span className="pip-card-action">
              <Icon name="maximize-2" size="0.875rem" />
            </span>
          </span>
        </button>
      )}
    </>
  );
}
