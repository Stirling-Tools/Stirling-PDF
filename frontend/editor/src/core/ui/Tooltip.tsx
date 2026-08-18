import {
  cloneElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import "@app/ui/Tooltip.css";

export type TooltipPlacement = "top" | "bottom" | "left" | "right";

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
 * app-config providers, which the portal does not mount.
 *
 * The bubble is only in the DOM while open, and `aria-describedby` is only set
 * while it is, so the reference never dangles.
 */
export function Tooltip({
  content,
  placement = "top",
  children,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    // React's onFocus/onBlur bubble, so the trigger's focus opens the bubble.
    <span
      className={["sui-tip", className ?? ""].filter(Boolean).join(" ")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": open ? id : undefined,
      })}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={`sui-tip__bubble sui-tip__bubble--${placement}`}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
