import { useTranslation } from "react-i18next";
import { Card, Chip, StatusBadge } from "@shared/components";
import {
  type SdkComponent,
  MATURITY_META,
  formatPrice,
} from "@portal/api/sdkComponents";
import "@portal/views/Components.css";

interface ComponentCardProps {
  component: SdkComponent;
  /** False when the component sits above the active tier — renders locked. */
  unlocked: boolean;
  onOpen: (component: SdkComponent) => void;
}

/** A single catalogue tile: name, maturity, description, price and frameworks. */
export function ComponentCard({
  component,
  unlocked,
  onOpen,
}: ComponentCardProps) {
  const { t } = useTranslation();
  const maturity = MATURITY_META[component.maturity];

  return (
    <Card
      interactive
      padding="default"
      className={"portal-components__card" + (unlocked ? "" : " is-locked")}
      role="button"
      tabIndex={0}
      aria-label={t("catalogue.card.openAriaLabel", { name: component.name })}
      onClick={() => onOpen(component)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(component);
        }
      }}
    >
      <div className="portal-components__card-head">
        <h3 className="portal-components__card-name">{component.name}</h3>
        <StatusBadge tone={maturity.tone} size="sm" showDot={false}>
          {maturity.label}
        </StatusBadge>
        {!unlocked && (
          <span
            className="portal-components__lock"
            aria-label={t("catalogue.card.lockedAriaLabel")}
          >
            🔒
          </span>
        )}
      </div>

      <p className="portal-components__card-desc">{component.description}</p>

      <div className="portal-components__card-meta">
        <span className="portal-components__price">
          {formatPrice(component.pricing)}
        </span>
        <span className="portal-components__pkg">
          @stirling/{component.package}
        </span>
      </div>

      <div className="portal-components__frameworks">
        {component.frameworks.map((fw) => (
          <Chip key={fw} size="sm" tone="neutral">
            {fw}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
