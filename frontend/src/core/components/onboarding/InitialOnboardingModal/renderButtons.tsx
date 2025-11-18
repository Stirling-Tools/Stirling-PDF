import React from 'react';
import { Button, Group, ActionIcon } from '@mantine/core';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { ButtonDefinition, type FlowState } from '@app/components/onboarding/onboardingFlowConfig';
import type { LicenseNotice } from '@app/components/onboarding/slides/types';
import type { ButtonAction } from '@app/components/onboarding/onboardingFlowConfig';

interface RenderButtonsProps {
  slideDefinition: {
    buttons: ButtonDefinition[];
    id: string;
  };
  licenseNotice: LicenseNotice;
  flowState: FlowState;
  onAction: (action: ButtonAction) => void;
}

export function renderButtons({ slideDefinition, licenseNotice, flowState, onAction }: RenderButtonsProps) {
  const leftButtons = slideDefinition.buttons.filter((btn) => btn.group === 'left');
  const rightButtons = slideDefinition.buttons.filter((btn) => btn.group === 'right');

  const buttonStyles = (variant: ButtonDefinition['variant']) =>
    variant === 'primary'
      ? {
          root: {
            background: 'var(--onboarding-primary-button-bg)',
            color: 'var(--onboarding-primary-button-text)',
          },
        }
      : {
          root: {
            background: 'var(--onboarding-secondary-button-bg)',
            border: '1px solid var(--onboarding-secondary-button-border)',
            color: 'var(--onboarding-secondary-button-text)',
          },
        };

  const resolveButtonLabel = (button: ButtonDefinition) => {
    if (
      button.type === 'button' &&
      slideDefinition.id === 'server-license' &&
      button.action === 'see-plans' &&
      licenseNotice.isOverLimit
    ) {
      return 'Upgrade now →';
    }
    return button.label ?? '';
  };

  const renderButton = (button: ButtonDefinition) => {
    const disabled = button.disabledWhen?.(flowState) ?? false;

    if (button.type === 'icon') {
      return (
        <ActionIcon
          key={button.key}
          onClick={() => onAction(button.action)}
          radius="md"
          size={40}
          disabled={disabled}
          styles={{
            root: {
              background: 'var(--onboarding-secondary-button-bg)',
              border: '1px solid var(--onboarding-secondary-button-border)',
              color: 'var(--onboarding-secondary-button-text)',
            },
          }}
        >
          {button.icon === 'chevron-left' && <ChevronLeftIcon fontSize="small" />}
        </ActionIcon>
      );
    }

    const variant = button.variant ?? 'secondary';
    const label = resolveButtonLabel(button);

    return (
      <Button key={button.key} onClick={() => onAction(button.action)} disabled={disabled} styles={buttonStyles(variant)}>
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

