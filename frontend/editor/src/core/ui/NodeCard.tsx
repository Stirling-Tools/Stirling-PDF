import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { Button } from "@app/ui/Button";
import { IconBadge, type IconBadgeAccent } from "@app/ui/IconBadge";
import "@app/ui/NodeCard.css";

/** Border tone. `selected` (a separate prop) overrides this with the primary ring. */
export type NodeCardTone = "default" | "warning";

export interface NodeCardProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "onSelect"
> {
  /** Glyph shown in a tone-tinted badge at the leading edge. */
  icon: ReactNode;
  iconAccent?: IconBadgeAccent;
  title: ReactNode;
  /** One-line summary under the title. Any node - a plain string, or a richer line. */
  detail?: ReactNode;
  tone?: NodeCardTone;
  selected?: boolean;
  /**
   * When given, the whole card is a single select button (aria-pressed tracks `selected`). Trailing
   * controls stay siblings of that button, never nested inside it, so the card holds no invalid
   * nested interactive elements.
   */
  onSelect?: (event: MouseEvent) => void;
  /** Controls rendered over the card's trailing edge (a remove button, a status glyph, ...). */
  trailing?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A labelled tile: an icon badge, a title, and an optional sub-line, on a raised card surface that
 * can be selected. The recurring "node" motif - a step in a graph, an item in a board - lifted into
 * a primitive so its surface, selection ring and content layout are shared rather than re-styled per
 * feature. Callers layer their own state (drag, run status, ...) via `className` and `trailing`.
 */
export function NodeCard({
  icon,
  iconAccent,
  title,
  detail,
  tone = "default",
  selected = false,
  onSelect,
  trailing,
  className,
  ref,
  ...rest
}: NodeCardProps) {
  return (
    <div
      {...rest}
      ref={ref}
      className={[
        "sui-node-card",
        tone === "warning" ? "sui-node-card--warning" : "",
        selected ? "is-selected" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Button
        variant="quiet"
        className="sui-node-card__select"
        aria-pressed={onSelect ? selected : undefined}
        onClick={onSelect}
      >
        <IconBadge accent={iconAccent} size="sm">
          {icon}
        </IconBadge>
        <span className="sui-node-card__text">
          <span className="sui-node-card__title">{title}</span>
          {detail && <span className="sui-node-card__detail">{detail}</span>}
        </span>
      </Button>
      {trailing}
    </div>
  );
}
