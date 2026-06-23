import { useTranslation } from "react-i18next";
import { Card, Chip, StatusBadge, StatTile } from "@shared/components";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/views/Policies.css";

interface PolicyCategoryCardProps {
  entry: CatalogueEntry;
  onOpen: (entry: CatalogueEntry) => void;
}

/**
 * One card per policy category. Configured categories show the live status +
 * stats and open the detail panel; unconfigured ones show the summary + a
 * "Set up" affordance; coming-soon categories render locked and inert.
 */
export function PolicyCategoryCard({ entry, onOpen }: PolicyCategoryCardProps) {
  const { t } = useTranslation();
  const { category, config, policy } = entry;
  const comingSoon = category.comingSoon === true;
  const openable = !comingSoon;
  const status = policy?.state.status;

  return (
    <Card
      className={
        "portal-policies__card" +
        (comingSoon ? " portal-policies__card--locked" : "")
      }
      interactive={openable}
      onClick={openable ? () => onOpen(entry) : undefined}
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      onKeyDown={
        openable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(entry);
              }
            }
          : undefined
      }
    >
      <header className="portal-policies__card-head">
        <span
          className={`portal-policies__cat-icon portal-policies__cat-icon--${category.tone}`}
          aria-hidden
        >
          {policyIcon(category.icon)}
        </span>
        <div className="portal-policies__card-titles">
          <h2 className="portal-policies__card-title">{category.label}</h2>
          <span className="portal-policies__card-blurb">{category.desc}</span>
        </div>
        {comingSoon ? (
          <Chip tone="neutral" size="sm">
            {t("policies.card.comingSoon")}
          </Chip>
        ) : policy ? (
          <StatusBadge
            tone={status === "paused" ? "warning" : "success"}
            size="sm"
            pulse={status !== "paused"}
          >
            {status === "paused"
              ? t("policies.status.paused")
              : t("policies.status.active")}
          </StatusBadge>
        ) : (
          <Chip tone="blue" size="sm">
            {t("policies.card.notSetUp")}
          </Chip>
        )}
      </header>

      <p className="portal-policies__card-summary">{config.summary}</p>

      {policy ? (
        <footer className="portal-policies__card-stats">
          <StatTile
            label={t("policies.stats.docsEnforced")}
            value={policy.stats.enforced.toLocaleString()}
          />
          <StatTile
            label={t("policies.stats.dataProcessed")}
            value={policy.stats.dataProcessed}
          />
          <StatTile
            label={t("policies.stats.activeFor")}
            value={policy.stats.activeFor}
          />
        </footer>
      ) : (
        <footer className="portal-policies__card-foot">
          <div className="portal-policies__card-rules">
            {config.rules.slice(0, 3).map((rule) => (
              <Chip key={rule} tone="neutral" size="sm">
                {rule}
              </Chip>
            ))}
          </div>
          {!comingSoon && (
            <span className="portal-policies__card-cta">
              {t("policies.card.setUp")}
            </span>
          )}
        </footer>
      )}
    </Card>
  );
}
