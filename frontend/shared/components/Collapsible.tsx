import type { ReactNode } from "react";
import "@shared/components/Collapsible.css";

export interface CollapsibleProps {
  /** Whether the section is expanded. Controlled — pair with `onToggle`. */
  open: boolean;
  onToggle: () => void;
  /** Header content (left/main side); the chevron is appended automatically. */
  header: ReactNode;
  /** Right-aligned header content shown before the chevron (a count, a label). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A single bordered disclosure section: an always-visible header that toggles,
 * and a body that animates open/closed via a grid-rows transition (no magic
 * max-height). Stack several to build an accordion. Header content is fully
 * caller-supplied, so it suits both terse and rich (icon + chips + count) rows.
 */
export function Collapsible({
  open,
  onToggle,
  header,
  aside,
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
        <span className="sui-collapsible__head-main">{header}</span>
        <span className="sui-collapsible__head-end">
          {aside}
          <svg
            className="sui-collapsible__chevron"
            data-open={open}
            viewBox="0 0 24 24"
            width={16}
            height={16}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>
      <div className="sui-collapsible__body" data-open={open}>
        <div className="sui-collapsible__body-inner">{children}</div>
      </div>
    </div>
  );
}
