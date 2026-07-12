import type { ReactNode } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import "@app/ui/Collapsible.css";

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
          <KeyboardArrowDownIcon
            className="sui-collapsible__chevron"
            data-open={open}
            sx={{ fontSize: 16 }}
          />
        </span>
      </button>
      <div className="sui-collapsible__body" data-open={open}>
        <div className="sui-collapsible__body-inner">{children}</div>
      </div>
    </div>
  );
}
