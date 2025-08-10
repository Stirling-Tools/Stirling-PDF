import React from 'react';
import { Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export interface OperationButtonProps {
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  loadingText?: string;
  submitText?: string;
  variant?: 'filled' | 'outline' | 'subtle';
  color?: string;
  fullWidth?: boolean;
  mt?: string;
  type?: 'button' | 'submit' | 'reset';
  'data-testid'?: string;
}

const OperationButton = ({
  onClick,
  isLoading = false,
  disabled = false,
  loadingText,
  submitText,
  variant = 'filled',
  color = 'blue',
  fullWidth = true,
  mt = 'md',
  type = 'button',
  'data-testid': dataTestId
}: OperationButtonProps) => {
  const { t } = useTranslation();

  return (
    <Button
      type={type}
      onClick={onClick}
      fullWidth={fullWidth}
      mt={mt}
      loading={isLoading}
      disabled={disabled}
      variant={variant}
      color={color}
      data-testid={dataTestId}
    >
      {isLoading 
        ? (loadingText || t("loading", "Loading..."))
        : (submitText || t("submit", "Submit"))
      }
    </Button>
  );
}

export default OperationButton;