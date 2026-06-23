import type { ReactNode } from "react";
import "@shared/components/ListRow.css";
import type { StatusTone } from "@shared/components/StatusBadge";

export interface ListRowProps {
  /** Leading visual (icon/avatar), shown in a tone-tinted square. */
  leading?: ReactNode;
  /** Tint for the leading square. Defaults to neutral. */
  leadingTone?: StatusTone;
  /** Primary line. */
  title: ReactNode;
  /** Secondary line. */
  description?: ReactNode;
  /** Tertiary line (e.g. timestamp). */
  meta?: ReactNode;
  /** Right-aligned content (badge, chevron, action). */
  trailing?: ReactNode;
  /** Makes the whole row a button. */
  onClick?: () => void;
  /** Draw a top hairline — set on every row after the first inside a list. */
  divider?: boolean;
  className?: string;
}

/**
 * A single list row: a tone-tinted leading glyph + a title/description/meta
 * stack + an optional trailing slot. Compose a divided list by wrapping rows in
 * a {@code Card padding="none"} and setting {@code divider} on all but the first.
 */
export function ListRow({
  leading,
  leadingTone = "neutral",
  title,
  description,
  meta,
  trailing,
  onClick,
  divider,
  className,
}: ListRowProps) {
  const classes = [
    "sui-listrow",
    divider ? "sui-listrow--divider" : "",
    onClick ? "sui-listrow--interactive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leading && (
        <span
          className="sui-listrow__leading"
          data-tone={leadingTone}
          aria-hidden
        >
          {leading}
        </span>
      )}
      <span className="sui-listrow__text">
        <span className="sui-listrow__title">{title}</span>
        {description && (
          <span className="sui-listrow__desc">{description}</span>
        )}
        {meta && <span className="sui-listrow__meta">{meta}</span>}
      </span>
      {trailing && <span className="sui-listrow__trailing">{trailing}</span>}
    </>
  );

  return onClick ? (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}
