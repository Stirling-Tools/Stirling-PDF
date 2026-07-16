import React from "react";
import { Group } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { useTranslation } from "react-i18next";
import {
  ButtonDefinition,
  type FlowState,
} from "@app/components/onboarding/onboardingFlowConfig";
import type { LicenseNotice } from "@app/types/types";
import type { ButtonAction } from "@app/components/onboarding/onboardingFlowConfig";

interface SlideButtonsProps {
  slideDefinition: {
    buttons: ButtonDefinition[];
    id: string;
  };
  licenseNotice: LicenseNotice;
  flowState: FlowState;
  onAction: (action: ButtonAction) => void;
}

export function SlideButtons({
  slideDefinition,
  licenseNotice,
  flowState,
  onAction,
}: SlideButtonsProps) {
  const { t } = useTranslation();
  // Back/icon buttons anchor the left edge; all text actions (skip + primary)
  // cluster together on the right, matching the onboarding card layout.
  const backButtons = slideDefinition.buttons.filter(
    (btn) => btn.type === "icon",
  );
  const actionButtons = slideDefinition.buttons.filter(
    (btn) => btn.type !== "icon",
  );

  const resolveButtonLabel = (button: ButtonDefinition) => {
    // Special case: override "See Plans" with "Upgrade now" when over limit
    if (
      button.type === "button" &&
      slideDefinition.id === "server-license" &&
      button.action === "see-plans" &&
      licenseNotice.isOverLimit
    ) {
      return t("onboarding.serverLicense.upgrade", "Upgrade now →");
    }

    // Translate the label (it's a translation key)
    const label = button.label ?? "";
    if (!label) return "";

    // Extract fallback text from translation key (e.g., 'onboarding.buttons.next' -> 'Next')
    const fallback = label.split(".").pop() || label;
    return t(label, fallback);
  };

  const renderButton = (button: ButtonDefinition) => {
    const disabled = button.disabledWhen?.(flowState) ?? false;

    if (button.type === "icon") {
      return (
        <ActionIcon
          key={button.key}
          onClick={() => onAction(button.action)}
          variant="secondary"
          accent="neutral"
          disabled={disabled}
          aria-label={t("onboarding.buttons.back", "Back")}
        >
          {button.icon === "chevron-left" ? (
            <ChevronLeftIcon fontSize="small" />
          ) : null}
        </ActionIcon>
      );
    }

    const isPrimary = (button.variant ?? "secondary") === "primary";
    const label = resolveButtonLabel(button);

    return (
      <Button
        key={button.key}
        onClick={() => onAction(button.action)}
        disabled={disabled}
        variant={isPrimary ? "primary" : "quiet"}
        accent={button.accent ?? (isPrimary ? "default" : "neutral")}
      >
        {label}
      </Button>
    );
  };

  const actions = <Group gap={8}>{actionButtons.map(renderButton)}</Group>;

  if (backButtons.length === 0) {
    return <Group justify="flex-end">{actions}</Group>;
  }

  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap={8}>{backButtons.map(renderButton)}</Group>
      {actions}
    </Group>
  );
}
