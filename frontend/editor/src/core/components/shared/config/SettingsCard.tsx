import { useState, type ReactNode } from "react";
import LocalIcon from "@app/components/shared/LocalIcon";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import "@app/components/shared/config/SettingsCard.css";

export interface SettingsCardProps {
  /** The card's `#slug`, and the id the nav's card list jumps to. */
  id: string;
  title: string;
  /** Shown behind an (i) rather than as a standing line, so the page stays scannable. */
  description?: ReactNode;
  /** A tier or maturity marker the retired nav row used to carry. */
  badge?: ReactNode;
  /** Long or rarely-touched cards start shut; the rest open. */
  defaultCollapsed?: boolean;
  /** Hold off mounting children until first opened, for expensive content. */
  lazy?: boolean;
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
  lazy = false,
  children,
}: SettingsCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const [everOpened, setEverOpened] = useState(!defaultCollapsed);

  return (
    <section className="settings-card" data-open={open || undefined}>
      <h2 className="settings-card__heading">
        <button
          type="button"
          id={id}
          className="settings-card__toggle"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => {
            setOpen((wasOpen) => !wasOpen);
            setEverOpened(true);
          }}
        >
          <LocalIcon
            icon="expand-more-rounded"
            width={16}
            height={16}
            className="settings-card__chevron"
          />
          <span className="settings-card__title">{title}</span>
        </button>
        {badge}
        {/* Outside the toggle: InfoTooltip is a button, and buttons do not nest. */}
        {description && <InfoTooltip label={description} position="right" />}
      </h2>
      <div id={`${id}-panel`} className="settings-card__panel" hidden={!open}>
        {lazy && !everOpened ? null : children}
      </div>
    </section>
  );
}
