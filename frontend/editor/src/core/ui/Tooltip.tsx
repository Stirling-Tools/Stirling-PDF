import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import "@app/ui/Tooltip.css";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

/** Breathing room kept between the bubble and both the trigger and the viewport. */
const GAP = 8;

export interface TooltipProps {
  /** Explanatory text. Keep it to a sentence or two. */
  content: ReactNode;
  placement?: TooltipPlacement;
  /**
   * The trigger. Must be focusable (a Button or ActionIcon), otherwise the
   * tooltip is unreachable by keyboard and by touch.
   */
  children: ReactElement;
  className?: string;
}

/**
 * Hover, focus and tap tooltip with no context dependencies, so it works in the
 * editor, the portal and the processor alike. The richer editor tooltip
 * (`@app/components/shared/Tooltip`) needs the sidebar, preferences and
 * app-config providers, which the portal does not mount; this matches its look.
 *
 * The bubble is portalled to the body and positioned fixed, because a tooltip
 * rendered inside the flow is clipped by the first ancestor that hides its
 * overflow — a card, a table, a scroll container.
 */
export function Tooltip({
  content,
  placement = "top",
  children,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!anchor || !bubble) return;

    let top: number;
    let left: number;
    switch (placement) {
      case "bottom":
        top = anchor.bottom + GAP;
        left = anchor.left + anchor.width / 2 - bubble.width / 2;
        break;
      case "left":
        top = anchor.top + anchor.height / 2 - bubble.height / 2;
        left = anchor.left - bubble.width - GAP;
        break;
      case "right":
        top = anchor.top + anchor.height / 2 - bubble.height / 2;
        left = anchor.right + GAP;
        break;
      default:
        top = anchor.top - bubble.height - GAP;
        left = anchor.left + anchor.width / 2 - bubble.width / 2;
    }

    // Flip rather than hang off the top or bottom edge.
    if (top < GAP && placement === "top") top = anchor.bottom + GAP;
    if (
      top + bubble.height > window.innerHeight - GAP &&
      placement === "bottom"
    )
      top = anchor.top - bubble.height - GAP;

    const maxLeft = window.innerWidth - bubble.width - GAP;
    setPos({
      top: Math.max(
        GAP,
        Math.min(top, window.innerHeight - bubble.height - GAP),
      ),
      left: Math.max(GAP, Math.min(left, Math.max(GAP, maxLeft))),
    });
  }, [placement]);

  // Measured before paint, so the bubble never shows at its unplaced position.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place, content]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reflow = () => place();
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reflow);
    // Capture phase: the trigger may sit inside a scrolling container.
    window.addEventListener("scroll", reflow, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open, place]);

  return (
    // React's onFocus/onBlur bubble, so the trigger's focus opens the bubble.
    <span
      ref={anchorRef}
      className={["sui-tip", className ?? ""].filter(Boolean).join(" ")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": open ? id : undefined,
      })}
      {open
        ? createPortal(
            <div
              ref={bubbleRef}
              role="tooltip"
              id={id}
              className="sui-tip__bubble"
              style={{
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: pos ? "visible" : "hidden",
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
