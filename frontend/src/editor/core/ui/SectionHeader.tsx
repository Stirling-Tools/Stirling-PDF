import type { ReactNode } from "react";
import { Icon } from "@editor/ui/Icon";
import "@editor/ui/SectionHeader.css";

export interface SectionHeaderProps {
  /** Uppercase eyebrow title. */
  title: ReactNode;
  /** Optional right-aligned tally/count. */
  count?: ReactNode;
  /** Render as a button with a disclosure chevron. */
  collapsible?: boolean;
  /** When collapsible, whether the section is expanded. */
  expanded?: boolean;
  onToggle?: () => void;
  /** When collapsible, the id of the body it shows and hides. */
  controls?: string;
  className?: string;
}

/**
 * An uppercase section eyebrow with an optional trailing count and, when
 * `collapsible`, a disclosure chevron + toggle. Use above a group of rows/cards.
 */
export function SectionHeader({
  title,
  count,
  collapsible,
  expanded = true,
  onToggle,
  controls,
  className,
}: SectionHeaderProps) {
  const classes = ["sui-sectionhdr", className ?? ""].filter(Boolean).join(" ");
  const inner = (
    <>
      <span className="sui-sectionhdr__title">{title}</span>
      {count != null && <span className="sui-sectionhdr__count">{count}</span>}
      {collapsible && (
        <Icon
          name="chevron-down"
          size={14}
          strokeWidth={2}
          className="sui-sectionhdr__chevron"
        />
      )}
    </>
  );

  return collapsible ? (
    <button
      type="button"
      className={classes}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
    >
      {inner}
    </button>
  ) : (
    <div className={classes}>{inner}</div>
  );
}
