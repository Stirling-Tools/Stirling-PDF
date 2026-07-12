import type { ReactNode } from "react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import "@app/ui/SectionHeader.css";

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
        <KeyboardArrowDownIcon
          className="sui-sectionhdr__chevron"
          data-collapsed={!expanded}
          sx={{ fontSize: 14 }}
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
    >
      {inner}
    </button>
  ) : (
    <div className={classes}>{inner}</div>
  );
}
