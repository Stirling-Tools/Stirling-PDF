import React, { ReactNode } from "react";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@app/components/shared/InfoBanner.css";

/** Picks the whole look. Callers choose meaning, never colours. */
export type InfoBannerTone = "info" | "promo" | "warning" | "danger";

/** Tone decides the button too, so the CTA can't drift from the bar it sits on. */
const TONE_BUTTON = {
  info: { variant: "primary", accent: "default" },
  promo: { variant: "primary", accent: "premium" },
  warning: { variant: "primary", accent: "warning" },
  danger: { variant: "primary", accent: "danger" },
} as const;

interface InfoBannerProps {
  /** A LocalIcon name, or a pre-rendered node (e.g. a logo) dropped in as-is. */
  icon?: string | ReactNode;
  title?: ReactNode;
  message: ReactNode;
  buttonText?: string;
  buttonIcon?: string;
  onButtonClick?: () => void;
  /** Muted secondary action, e.g. "Don't remind me again". */
  secondaryButtonText?: string;
  onSecondaryButtonClick?: () => void;
  onDismiss?: () => void;
  dismissible?: boolean;
  loading?: boolean;
  show?: boolean;
  tone?: InfoBannerTone;
  compact?: boolean;
}

/** The app's top bar: dismissible messaging above the workspace. */
export const InfoBanner: React.FC<InfoBannerProps> = ({
  icon,
  title,
  message,
  buttonText,
  buttonIcon = "check-circle-rounded",
  onButtonClick,
  secondaryButtonText,
  onSecondaryButtonClick,
  onDismiss,
  dismissible = true,
  loading = false,
  show = true,
  tone = "info",
  compact = false,
}) => {
  const { t } = useTranslation();
  if (!show) return null;

  const iconSize = compact ? "1rem" : "1.25rem";

  return (
    <div
      className={[
        "sui-banner",
        `sui-banner--${tone}`,
        compact ? "sui-banner--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon != null && (
        <span className="sui-banner__icon" aria-hidden>
          {typeof icon === "string" ? (
            <LocalIcon icon={icon} width={iconSize} height={iconSize} />
          ) : (
            icon
          )}
        </span>
      )}

      <div className="sui-banner__body">
        {title && <span className="sui-banner__title">{title}</span>}
        <span className="sui-banner__message">{message}</span>
      </div>

      <div className="sui-banner__actions">
        {buttonText && onButtonClick && (
          <Button
            variant={TONE_BUTTON[tone].variant}
            accent={TONE_BUTTON[tone].accent}
            size="sm"
            loading={loading}
            onClick={onButtonClick}
            leftSection={
              <LocalIcon icon={buttonIcon} width="0.9rem" height="0.9rem" />
            }
          >
            {buttonText}
          </Button>
        )}
        {secondaryButtonText && onSecondaryButtonClick && (
          <Button
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={onSecondaryButtonClick}
          >
            {secondaryButtonText}
          </Button>
        )}
        {dismissible && (
          <ActionIcon
            variant="tertiary"
            accent="neutral"
            size="sm"
            onClick={() => onDismiss?.()}
            aria-label={t("infoBanner.dismiss", "Dismiss")}
          >
            <LocalIcon icon="close-rounded" width="1rem" height="1rem" />
          </ActionIcon>
        )}
      </div>
    </div>
  );
};
