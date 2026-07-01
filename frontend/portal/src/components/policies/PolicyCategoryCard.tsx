import { useTranslation } from "react-i18next";
<<<<<<< HEAD
import { Button } from "@shared/components/Button";
import { Card, Chip, StatusBadge, StatTile } from "@shared/components";
=======
import { Card, Chip, StatusBadge } from "@shared/components";
>>>>>>> 6c85200eb90e29c7bc00db99808695e9208dc75e
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
<<<<<<< HEAD

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
          <Chip size="sm">{t("policies.card.comingSoon")}</Chip>
        ) : policy ? (
=======
  const openable = !comingSoon;
  const status = policy?.state.status;
  const enforces = config.rules.join(" · ");

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
      <span className="portal-policies__cat-icon" aria-hidden>
        {policyIcon(category.icon)}
      </span>

      <div className="portal-policies__card-identity">
        <h2 className="portal-policies__card-title">{category.label}</h2>
        {enforces && (
          <span className="portal-policies__card-enforces">{enforces}</span>
        )}
      </div>

      {comingSoon ? (
        <Chip tone="neutral" size="sm">
          {t("policies.card.comingSoon")}
        </Chip>
      ) : policy ? (
        <div className="portal-policies__card-meta">
          <span className="portal-policies__card-statpair">
            <span className="portal-policies__card-statval">
              {policy.stats.enforced.toLocaleString()}
            </span>
            <span className="portal-policies__card-statlbl">
              {t("policies.stats.docsEnforced")}
            </span>
          </span>
          <span className="portal-policies__card-statpair">
            <span className="portal-policies__card-statval">
              {policy.stats.dataProcessed}
            </span>
            <span className="portal-policies__card-statlbl">
              {t("policies.stats.dataProcessed")}
            </span>
          </span>
>>>>>>> 6c85200eb90e29c7bc00db99808695e9208dc75e
          <StatusBadge
            tone={policy.state.status === "paused" ? "warning" : "success"}
            size="sm"
            pulse={policy.state.status !== "paused"}
          >
            {policy.state.status === "paused"
              ? t("policies.status.paused")
              : t("policies.status.active")}
          </StatusBadge>
<<<<<<< HEAD
        ) : (
          <Chip size="sm">{t("policies.card.notSetUp")}</Chip>
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
=======
        </div>
      ) : (
        <Chip tone="blue" size="sm">
          {t("policies.card.notSetUp")}
        </Chip>
>>>>>>> 6c85200eb90e29c7bc00db99808695e9208dc75e
      )}
    </Card>
  );
}
