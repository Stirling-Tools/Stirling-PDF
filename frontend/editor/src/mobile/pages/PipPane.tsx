import { useRef, type ReactNode } from "react";
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
  /** Not in front, but shown shrunk in the corner; otherwise hidden. */
  pip: boolean;
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

/**
 * One of the two full screens. Behind the other one it is the same live
 * content scaled into a corner, so what you see in the corner is exactly what
 * you get back; drag it to any corner. Its content never unmounts.
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
  const state = front ? "front" : pip ? "pip" : "hidden";
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  return (
    <>
      <section className="pip-pane" data-state={state} inert={!front}>
        {children}
      </section>
      {state === "pip" && (
        <button
          type="button"
          className="pip-target"
          aria-label={t("mobile.pip.open", "Open {{name}}", { name: label })}
          onPointerDown={(event) => {
            start.current = { x: event.clientX, y: event.clientY };
            dragged.current = false;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const x = event.clientX - start.current.x;
            const y = event.clientY - start.current.y;
            if (!dragged.current && Math.hypot(x, y) < TAP_SLOP_PX) return;
            dragged.current = true;
            onDrag({ x, y });
          }}
          onPointerUp={(event) => {
            start.current = null;
            if (!dragged.current) return;
            const stage = event.currentTarget.parentElement;
            const bounds = stage?.getBoundingClientRect();
            onDrag(null);
            if (!bounds) return;
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
            start.current = null;
            dragged.current = false;
            onDrag(null);
          }}
          onClick={() => {
            if (!dragged.current) onOpen();
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
