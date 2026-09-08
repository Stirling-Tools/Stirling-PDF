import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { OptionCard } from "@app/ui";
import type { CatalogueEntry } from "@portal/api/policies";
import { policyCategoryIcon } from "@app/components/policies/policyCategoryIcon";

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
 * setup. A thin adapter over the {@link OptionCard} primitive - it maps the catalogue category to
 * the card's icon/title/blurb and picks the CTA vs the disabled note (coming soon / AI-locked).
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
  const disabled = comingSoon || locked;

  return (
    <OptionCard
      icon={policyCategoryIcon(category.id)}
      title={t(category.label)}
      description={t(category.desc)}
      disabled={disabled}
      onSelect={() => onOpen(entry)}
      cta={
        <>
          {t("portal.pipelines.templates.setUp")}
          <Icon name="arrow-right" size={"1rem"} />
        </>
      }
      note={
        <>
          <Icon name="lock" size={"0.95rem"} />
          {comingSoon
            ? t("portal.policies.card.comingSoon")
            : (lockedLabel ?? t("portal.policies.card.requiresAiEngine"))}
        </>
      }
    />
  );
}
