import { useTranslation } from "react-i18next";
import { Card, Chip, StatusBadge } from "@app/ui";
import type { CatalogueEntry } from "@processor/api/policies";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@processor/views/Policies.css";

interface PolicyCategoryCardProps {
  entry: CatalogueEntry;
  onOpen: (entry: CatalogueEntry) => void;
  /** Setup is unavailable (e.g. the AI engine is off): shown, but not openable. */
  locked?: boolean;
  /** Chip text explaining why setup is locked (e.g. "Requires AI engine"). */
  lockedLabel?: string;
}

export function PolicyCategoryCard({
  entry,
  onOpen,
  locked = false,
  lockedLabel,
}: PolicyCategoryCardProps) {
  const { t } = useTranslation();
  const { category, config, policy } = entry;
  const comingSoon = category.comingSoon === true;
  const openable = !comingSoon && !locked;
  const status = policy?.state.status;
  const enforces = config.rules.map((r) => t(r)).join(" · ");

  return (
    <Card
      className={
        "processor-policies__card" +
        (comingSoon || locked ? " processor-policies__card--locked" : "")
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
      <span className="processor-policies__cat-icon" aria-hidden>
        {policyCategoryIcon(category.id)}
      </span>

      <div className="processor-policies__card-identity">
        <h2 className="processor-policies__card-title">{t(category.label)}</h2>
        {enforces && (
          <span className="processor-policies__card-enforces">{enforces}</span>
        )}
      </div>

      {comingSoon ? (
        <Chip accent="neutral" size="sm">
          {t("processor.policies.card.comingSoon")}
        </Chip>
      ) : locked ? (
        <Chip accent="neutral" size="sm">
          {lockedLabel ?? t("processor.policies.card.requiresAiEngine")}
        </Chip>
      ) : policy ? (
        <div className="processor-policies__card-meta">
          <span className="processor-policies__card-statpair">
            <span className="processor-policies__card-statval">
              {policy.stats.enforced.toLocaleString()}
            </span>
            <span className="processor-policies__card-statlbl">
              {t("processor.policies.stats.docsEnforced")}
            </span>
          </span>
          <span className="processor-policies__card-statpair">
            <span className="processor-policies__card-statval">
              {policy.stats.dataProcessed}
            </span>
            <span className="processor-policies__card-statlbl">
              {t("processor.policies.stats.dataProcessed")}
            </span>
          </span>
          <StatusBadge
            tone={status === "paused" ? "warning" : "success"}
            size="sm"
          >
            {status === "paused"
              ? t("processor.policies.status.paused")
              : t("processor.policies.status.active")}
          </StatusBadge>
        </div>
      ) : (
        <Chip accent="default" size="sm">
          {t("processor.policies.card.notSetUp")}
        </Chip>
      )}
    </Card>
  );
}
