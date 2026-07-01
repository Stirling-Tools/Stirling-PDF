import { useTranslation } from "react-i18next";
import { Card, Chip, StatusBadge } from "@shared/components";
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
          <StatusBadge
            tone={status === "paused" ? "warning" : "success"}
            size="sm"
            pulse={status !== "paused"}
          >
            {status === "paused"
              ? t("policies.status.paused")
              : t("policies.status.active")}
          </StatusBadge>
        </div>
      ) : (
        <Chip tone="blue" size="sm">
          {t("policies.card.notSetUp")}
        </Chip>
      )}
    </Card>
  );
}
