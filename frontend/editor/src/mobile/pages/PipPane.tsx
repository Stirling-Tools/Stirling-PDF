import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@app/pages/PipPane.css";

export type PipCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

interface PipPaneProps {
  /** Fills the screen. */
  front: boolean;
  /** Not in front, but waiting in the corner; otherwise hidden. */
  pip: boolean;
  /**
   * "live" shows the pane itself scaled down (pinch to resize it); "bar" shows
   * only its label, for a pane you need to recognise rather than read.
   */
  variant: "live" | "bar";
  /** Size of the live miniature as a fraction of the screen. */
  scale?: number;
  onScale?: (scale: number) => void;
  label: string;
  caption: string;
  icon?: ReactNode;
  onOpen: () => void;
  /** Called while the miniature is dragged (offset in px) and with null on release. */
  onDrag: (offset: { x: number; y: number } | null) => void;
  /** Called on release with the corner nearest the pointer. */
  onDrop: (corner: PipCorner) => void;
  children: ReactNode;
}

// Movement below this is a tap, not a drag.
const TAP_SLOP_PX = 8;
const MIN_SCALE = 0.2;
const MAX_SCALE = 0.55;

type Point = { x: number; y: number };

function distance(points: Point[]) {
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

/**
 * One of the two full screens. Behind the other one it waits in a corner,
 * either as the same live content scaled down or as just its label; drag it to
 * any corner. Its content never unmounts.
 */
export function PipPane({
  front,
  pip,
  variant,
  scale = 0.34,
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
  const state = front ? "front" : pip ? `pip-${variant}` : "hidden";
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<Point | null>(null);
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const moved = useRef(false);
  const [gesturing, setGesturing] = useState(false);
  const scaleStyle = { "--pip-scale": scale } as CSSProperties;

  const endGesture = () => {
    pointers.current.clear();
    start.current = null;
    pinch.current = null;
    setGesturing(false);
    onDrag(null);
  };

  return (
    <>
      <section
        className="pip-pane"
        data-state={state}
        data-gesture={gesturing}
        style={scaleStyle}
        inert={!front}
      >
        {children}
      </section>
      {pip && !front && (
        <button
          type="button"
          className="pip-target"
          data-variant={variant}
          data-gesture={gesturing}
          style={scaleStyle}
          aria-label={t("mobile.pip.open", "Open {{name}}", { name: label })}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            if (pointers.current.size === 1) {
              start.current = { x: event.clientX, y: event.clientY };
              moved.current = false;
            } else if (
              pointers.current.size === 2 &&
              variant === "live" &&
              onScale
            ) {
              pinch.current = {
                distance: distance([...pointers.current.values()]),
                scale,
              };
              moved.current = true;
              setGesturing(true);
              onDrag(null);
            }
          }}
          onPointerMove={(event) => {
            if (!pointers.current.has(event.pointerId)) return;
            pointers.current.set(event.pointerId, {
              x: event.clientX,
              y: event.clientY,
            });
            if (pinch.current && pointers.current.size === 2 && onScale) {
              const ratio =
                distance([...pointers.current.values()]) /
                pinch.current.distance;
              onScale(
                Math.min(
                  MAX_SCALE,
                  Math.max(MIN_SCALE, pinch.current.scale * ratio),
                ),
              );
              return;
            }
            if (!start.current || pinch.current) return;
            const x = event.clientX - start.current.x;
            const y = event.clientY - start.current.y;
            if (!moved.current && Math.hypot(x, y) < TAP_SLOP_PX) return;
            moved.current = true;
            setGesturing(true);
            onDrag({ x, y });
          }}
          onPointerUp={(event) => {
            const wasDrag = moved.current && !pinch.current;
            const bounds =
              event.currentTarget.parentElement?.getBoundingClientRect();
            pointers.current.delete(event.pointerId);
            if (pointers.current.size > 0) return;
            endGesture();
            if (!wasDrag || !bounds) return;
            const left = event.clientX < bounds.left + bounds.width / 2;
            const top = event.clientY < bounds.top + bounds.height / 2;
            onDrop(
              top
                ? left
                  ? "top-left"
                  : "top-right"
                : left
                  ? "bottom-left"
                  : "bottom-right",
            );
          }}
          onPointerCancel={() => {
            moved.current = false;
            endGesture();
          }}
          onClick={() => {
            if (!moved.current) onOpen();
          }}
        >
          <span className="pip-label">
            {icon && <span className="pip-label-icon">{icon}</span>}
            <span className="pip-label-text">
              <span className="pip-label-name">{label}</span>
              <span className="pip-label-caption">{caption}</span>
            </span>
          </span>
        </button>
      )}
    </>
  );
}
