import { Button, Box } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@app/components/shared/Tooltip';
import { useBackendHealth } from '@app/hooks/useBackendHealth';
import { CloudBadge } from '@app/components/shared/CloudBadge';
import type { ExecuteDisabledReason } from '@app/hooks/tools/shared/toolOperationTypes';

export interface OperationButtonProps {
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  disabledReason?: ExecuteDisabledReason;
  loadingText?: string;
  submitText?: string;
  variant?: 'filled' | 'outline' | 'subtle';
  color?: string;
  fullWidth?: boolean;
  mt?: string;
  type?: 'button' | 'submit' | 'reset';
  showCloudBadge?: boolean;
  'data-testid'?: string;
  'data-tour'?: string;
}

const OperationButton = ({
  onClick,
  isLoading = false,
  disabled = false,
  disabledReason,
  loadingText,
  submitText,
  variant = 'filled',
  color = 'blue',
  fullWidth = false,
  mt = 'md',
  type = 'button',
  showCloudBadge = false,
  'data-testid': dataTestId,
  'data-tour': dataTour
}: OperationButtonProps) => {
  const { t } = useTranslation();
  const { isOnline, message: backendMessage } = useBackendHealth();
  const blockedByBackend = !isOnline;

  const effectiveDisabled = disabled || disabledReason !== null && disabledReason !== undefined;
  const combinedDisabled = effectiveDisabled || blockedByBackend;

  const reasonTooltip: Record<NonNullable<ExecuteDisabledReason>, string> = {
    endpointUnavailable: t('tool.endpointUnavailable', 'This tool is unavailable on your server.'),
    noFiles: t('tool.noFiles', 'Add a file to get started.'),
    invalidParams: t('tool.invalidParams', 'Fill in the required settings.'),
  };

  const tooltipLabel = blockedByBackend
    ? (backendMessage ?? t('backendHealth.checking', 'Checking backend status...'))
    : (disabledReason ? (reasonTooltip[disabledReason] ?? null) : null);

  const button = (
    <Button
      type={type}
      onClick={onClick}
      fullWidth={fullWidth || !!tooltipLabel}
      mr={tooltipLabel ? 0 : 'md'}
      ml={tooltipLabel ? 0 : 'md'}
      mt={tooltipLabel ? 0 : mt}
      loading={isLoading}
      disabled={combinedDisabled}
      variant={variant}
      color={color}
      data-testid={dataTestId}
      data-tour={dataTour}
      style={{ minHeight: '2.5rem', position: 'relative' }}
    >
      {isLoading
        ? (loadingText || t("loading", "Loading..."))
        : (submitText || t("submit", "Submit"))
      }
      {showCloudBadge && (
        <Box style={{ position: 'absolute', top: 4, right: 4 }}>
          <CloudBadge />
        </Box>
      )}
    </Button>
  );

  if (tooltipLabel) {
    // Disabled buttons suppress pointer events at the browser level, so the Tooltip's
    // cloneElement handlers would never fire. Wrap in a Box to capture them instead.
    return (
      <Tooltip content={tooltipLabel} position="top" arrow>
        <Box mr="md" ml="md" mt={mt} style={{ display: 'block' }}>
          {button}
        </Box>
      </Tooltip>
    );
  }

  return button;
};

export default OperationButton;
