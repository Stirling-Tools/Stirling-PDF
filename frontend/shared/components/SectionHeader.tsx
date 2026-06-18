import type { ReactNode } from "react";
import "@shared/components/SectionHeader.css";

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
  className,
}: SectionHeaderProps) {
  const classes = ["sui-sectionhdr", className ?? ""].filter(Boolean).join(" ");
  const inner = (
    <>
      <span className="sui-sectionhdr__title">{title}</span>
      {count != null && <span className="sui-sectionhdr__count">{count}</span>}
      {collapsible && (
        <svg
          className="sui-sectionhdr__chevron"
          data-collapsed={!expanded}
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </>
  );

  return collapsible ? (
    <button
      type="button"
      className={classes}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      {inner}
    </button>
  ) : (
    <div className={classes}>{inner}</div>
  );
}
