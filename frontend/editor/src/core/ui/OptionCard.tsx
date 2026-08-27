import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { Card } from "@app/ui/Card";
import "@app/ui/OptionCard.css";

export interface OptionCardProps {
  /** Leading glyph, shown in a tinted chip. */
  icon: ReactNode;
  title: ReactNode;
  /** Short blurb under the title; clamped to {@link descriptionLines} lines. */
  description?: ReactNode;
  /**
   * Footer shown when the card is selectable - typically a call to action like "Set up ->". Pinned
   * to the bottom edge so footers line up across a row of cards.
   */
  cta?: ReactNode;
  /**
   * When true the card is inert (no click, no hover) and recedes to a muted, sunken treatment.
   * {@link note} replaces the CTA to say why (e.g. a "coming soon" or lock chip).
   */
  disabled?: boolean;
  note?: ReactNode;
  /** Lines the description clamps to before ellipsis. Default 3. */
  descriptionLines?: number;
  /** Fires when a selectable card is clicked or activated by keyboard. Ignored when disabled. */
  onSelect?: () => void;
  className?: string;
}

/**
 * A choice presented as a titled card: a tinted icon chip, a title, a clamped blurb, and a footer
 * (a CTA when selectable, a muted note when not). The recurring "pick one of these" motif - template
 * galleries, feature pickers, plan tiers - lifted into a primitive on the shared card surface, the
 * same way {@link NodeCard} and {@link MetricCard} centralise their motifs, so its layout, disabled
 * treatment and select a11y are shared rather than re-styled per feature.
 */
export function OptionCard({
  icon,
  title,
  description,
  cta,
  disabled = false,
  note,
  descriptionLines = 3,
  onSelect,
  className,
}: OptionCardProps) {
  const interactive = !disabled && !!onSelect;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  }

  return (
    <Card
      interactive={interactive}
      className={[
        "sui-option-card",
        disabled ? "sui-option-card--disabled" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--sui-option-card-lines": descriptionLines } as CSSProperties}
      onClick={interactive ? onSelect : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      aria-disabled={disabled || undefined}
    >
      <span className="sui-option-card__icon" aria-hidden>
        {icon}
      </span>
      <h3 className="sui-option-card__title">{title}</h3>
      {description && <p className="sui-option-card__desc">{description}</p>}
      {(disabled ? note : cta) && (
        <span className="sui-option-card__foot">{disabled ? note : cta}</span>
      )}
    </Card>
  );
}
