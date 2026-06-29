import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/Button";
import { Card, Chip, StatusBadge, StatTile } from "@shared/components";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyIcon } from "@portal/components/policies/policyIcons";
import "@portal/views/Policies.css";

interface PolicyCategoryCardProps {
  entry: CatalogueEntry;
  onOpen: (entry: CatalogueEntry) => void;
}

export function PolicyCategoryCard({ entry, onOpen }: PolicyCategoryCardProps) {
  const { t } = useTranslation();
  const { category, config, policy } = entry;
  const comingSoon = category.comingSoon === true;

  return (
    <Card onClick={comingSoon ? undefined : () => onOpen(entry)}>
      <header className="portal-policies__card-header">
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
          <Chip size="sm">
            {t("policies.card.comingSoon")}
          </Chip>
        ) : policy ? (
          <StatusBadge
            tone={policy.state.status === "paused" ? "warning" : "success"}
            size="sm"
            pulse={policy.state.status !== "paused"}
          >
            {policy.state.status === "paused"
              ? t("policies.status.paused")
              : t("policies.status.active")}
          </StatusBadge>
        ) : (
          <Chip size="sm">
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
              <Chip key={rule} size="sm">
                {rule}
              </Chip>
            ))}
          </div>
          {!comingSoon && (
            <Button variant="tertiary" size="sm">
              {t("policies.card.setUp")}
            </Button>
          )}
        </footer>
      )}
    </Card>
  );
}
