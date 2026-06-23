import React from "react";
import { Group } from "@mantine/core";
import { Button } from "@shared/components/Button";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { TFunction } from "i18next";
import {
  ButtonDefinition,
  type FlowState,
  type ButtonAction,
} from "@app/components/onboarding/saasOnboardingFlowConfig";

interface RenderButtonsProps {
  slideDefinition: {
    buttons: ButtonDefinition[];
    id: string;
  };
  flowState: FlowState;
  onAction: (action: ButtonAction) => void;
  t: TFunction;
}

export function renderButtons({
  slideDefinition,
  flowState,
  onAction,
  t,
}: RenderButtonsProps) {
  const leftButtons = slideDefinition.buttons.filter(
    (btn) => btn.group === "left",
  );
  const rightButtons = slideDefinition.buttons.filter(
    (btn) => btn.group === "right",
  );

  const resolveButtonLabel = (button: ButtonDefinition) => {
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
        <Button
          key={button.key}
          onClick={() => onAction(button.action)}
          size="lg"
          variant="outlined"
          disabled={disabled}
          aria-label={t("onboarding.buttons.back", "Back")}
          style={{
            "--sui-btn-bg": "var(--onboarding-secondary-button-bg)",
            "--sui-btn-fg": "var(--onboarding-secondary-button-text)",
            "--sui-btn-bd": "var(--onboarding-secondary-button-border)",
          }}
          leftSection={
            button.icon === "chevron-left" ? (
              <ChevronLeftIcon fontSize="small" />
            ) : null
          }
        />
      );
    }

    const variant = button.variant ?? "secondary";
    const label = resolveButtonLabel(button);

    return (
      <Button
        key={button.key}
        onClick={() => onAction(button.action)}
        disabled={disabled}
        variant={variant === "primary" ? "filled" : "outlined"}
        style={
          variant === "primary"
            ? {
                "--sui-btn-bg": "var(--onboarding-primary-button-bg)",
                "--sui-btn-fg": "var(--onboarding-primary-button-text)",
              }
            : {
                "--sui-btn-bg": "var(--onboarding-secondary-button-bg)",
                "--sui-btn-fg": "var(--onboarding-secondary-button-text)",
                "--sui-btn-bd": "var(--onboarding-secondary-button-border)",
              }
        }
      >
        {label}
      </Button>
    );
  };

  if (leftButtons.length === 0) {
    return <Group justify="flex-end">{rightButtons.map(renderButton)}</Group>;
  }

  if (rightButtons.length === 0) {
    return <Group justify="flex-start">{leftButtons.map(renderButton)}</Group>;
  }

  return (
    <Group justify="space-between">
      <Group gap={12}>{leftButtons.map(renderButton)}</Group>
      <Group gap={12}>{rightButtons.map(renderButton)}</Group>
    </Group>
  );
}
