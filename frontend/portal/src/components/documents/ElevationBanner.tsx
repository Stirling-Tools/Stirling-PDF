import { useTranslation } from "react-i18next";
import { Banner, Button } from "@shared/components";
import { formatCountdown } from "@portal/components/documents/format";

interface ElevationBannerProps {
  /** Seconds left on the active grant, or null when no grant is active. */
  secondsLeft: number | null;
  /** True for tiers with the four-eyes elevation flow (enterprise). */
  fourEyes: boolean;
  onRequest: () => void;
}

/**
 * Zero-standing-access affordance for a sensitive document. With no active
 * grant it offers a "Request access" button; once granted it counts down the
 * remaining window. The grant is client-side only — see the view for the
 * backend TODO.
 */
export function ElevationBanner({
  secondsLeft,
  fourEyes,
  onRequest,
}: ElevationBannerProps) {
  const { t } = useTranslation();
  if (secondsLeft !== null) {
    return (
      <Banner
        tone="success"
        icon={<span aria-hidden>⏱</span>}
        title={t("documents.elevation.active.title", {
          time: formatCountdown(secondsLeft),
        })}
        description={
          fourEyes
            ? t("documents.elevation.active.descriptionFourEyes")
            : t("documents.elevation.active.description")
        }
      />
    );
  }

  return (
    <Banner
      tone="warning"
      icon={<span aria-hidden>🔒</span>}
      title={t("documents.elevation.gated.title")}
      description={
        fourEyes
          ? t("documents.elevation.gated.descriptionFourEyes")
          : t("documents.elevation.gated.description")
      }
      action={
        <Button size="sm" onClick={onRequest}>
          {t("documents.elevation.requestAccess")}
        </Button>
      }
    />
  );
}
