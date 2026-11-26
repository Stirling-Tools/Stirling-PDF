import { useId, type ReactNode } from "react";
import { Icon } from "@editor/ui/Icon";
import "@editor/ui/Collapsible.css";

export interface CollapsibleProps {
  /** Whether the section is expanded. Controlled — pair with `onToggle`. */
  open: boolean;
  onToggle: () => void;
  /** The toggle's label, shown after the chevron. */
  header: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A lightweight inline disclosure: a chevron-led label that toggles, and a body
 * that animates open/closed via a grid-rows transition (no magic max-height).
 * No surface or box - it sits inline within a form or panel.
 */
export function Collapsible({
  open,
  onToggle,
  header,
  children,
  className,
}: CollapsibleProps) {
  const bodyId = useId();
  return (
    <div
      className={["sui-collapsible", className ?? ""].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="sui-collapsible__head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <Icon
          name="chevron-down"
          size={16}
          strokeWidth={2}
          className="sui-collapsible__chevron"
        />
        {header}
      </button>
      {/* A closed body is only squashed to no height, so inert keeps Tab out of it. */}
      <div
        id={bodyId}
        className="sui-collapsible__body"
        data-open={open}
        inert={!open}
      >
        <div className="sui-collapsible__body-inner">{children}</div>
      </div>
    </div>
  );
}
