import { useTranslation } from "react-i18next";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { Card, Chip } from "@app/ui";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";
import "@portal/components/pipelines/PipelineTemplateCard.css";

interface PipelineTemplateCardProps {
  entry: CatalogueEntry;
  /** Open the simple setup wizard seeded from this template. */
  onOpen: (entry: CatalogueEntry) => void;
  /** Setup is unavailable (e.g. the AI engine is off): shown, but not openable. */
  locked?: boolean;
  /** Chip text explaining why setup is locked (e.g. "Requires AI engine"). */
  lockedLabel?: string;
}

/**
 * A template in the Pipelines gallery: a ready-made starting point that opens the simple, guided
 * setup. Vertical card (icon, title, blurb, a "Set up" affordance) so the gallery reads as a set of
 * choices, distinct from the pipelines table below. Locked/coming-soon templates show a chip and
 * don't open.
 */
export function PipelineTemplateCard({
  entry,
  onOpen,
  locked = false,
  lockedLabel,
}: PipelineTemplateCardProps) {
  const { t } = useTranslation();
  const { category } = entry;
  const comingSoon = category.comingSoon === true;
  const openable = !comingSoon && !locked;

  return (
    <Card
      className={
        "portal-pipelines__template-card" +
        (openable ? "" : " portal-pipelines__template-card--locked")
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
      <span className="portal-pipelines__template-icon" aria-hidden>
        {policyCategoryIcon(category.id)}
      </span>

      <h3 className="portal-pipelines__template-title">{t(category.label)}</h3>
      <p className="portal-pipelines__template-blurb">{t(category.desc)}</p>

      {comingSoon ? (
        <Chip accent="neutral" size="sm">
          {t("portal.policies.card.comingSoon")}
        </Chip>
      ) : locked ? (
        <Chip accent="neutral" size="sm">
          {lockedLabel ?? t("portal.policies.card.requiresAiEngine")}
        </Chip>
      ) : (
        <span className="portal-pipelines__template-cta">
          {t("portal.pipelines.templates.setUp")}
          <ArrowForwardRoundedIcon style={{ fontSize: "1rem" }} />
        </span>
      )}
    </Card>
  );
}
