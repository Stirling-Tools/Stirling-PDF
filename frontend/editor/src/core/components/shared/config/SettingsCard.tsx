import { useState, type ReactNode } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@app/components/shared/config/SettingsCard.css";

export interface SettingsCardProps {
  /** Doubles as the `?focus=` anchor and the id the nav's card list jumps to. */
  id: string;
  title: string;
  description?: string;
  /** A tier or maturity marker the retired nav row used to carry. */
  badge?: ReactNode;
  /** Long or rarely-touched cards start shut; the rest open. */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/**
 * One card on a settings page: an anchored heading you can fold away.
 *
 * The heading is a real button rather than a styled div so the whole row is
 * keyboard-reachable, and the id sits on the button so an anchor jump lands on
 * the control that opens the card rather than on hidden content.
 */
export function SettingsCard({
  id,
  title,
  description,
  badge,
  defaultCollapsed = false,
  children,
}: SettingsCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);

  return (
    <section className="settings-card" data-open={open || undefined}>
      <h2 className="settings-card__heading">
        <button
          type="button"
          id={id}
          className="settings-card__toggle"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <LocalIcon
            icon="expand-more-rounded"
            width={16}
            height={16}
            className="settings-card__chevron"
          />
          <span className="settings-card__title">{title}</span>
          {badge}
        </button>
      </h2>
      {description && (
        <p className="settings-card__description">{description}</p>
      )}
      <div id={`${id}-panel`} className="settings-card__panel" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
