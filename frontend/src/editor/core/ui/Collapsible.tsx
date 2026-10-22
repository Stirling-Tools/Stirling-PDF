import type { ReactNode } from "react";
import { Icon } from "@app/ui/Icon";
import "@app/ui/Collapsible.css";

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
  return (
    <div
      className={["sui-collapsible", className ?? ""].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="sui-collapsible__head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <Icon
          name="chevron-down"
          size={16}
          strokeWidth={2}
          className="sui-collapsible__chevron"
        />
        {header}
      </button>
      <div className="sui-collapsible__body" data-open={open}>
        <div className="sui-collapsible__body-inner">{children}</div>
      </div>
    </div>
  );
}
