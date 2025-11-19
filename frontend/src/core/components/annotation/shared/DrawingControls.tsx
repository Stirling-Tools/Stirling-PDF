import React from 'react';
import { Group, Button, ActionIcon, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LocalIcon } from '@app/components/shared/LocalIcon';

interface DrawingControlsProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onPlaceSignature?: () => void;
  hasSignatureData?: boolean;
  disabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  showPlaceButton?: boolean;
  placeButtonText?: string;
  additionalControls?: React.ReactNode;
}

export const DrawingControls: React.FC<DrawingControlsProps> = ({
  onUndo,
  onRedo,
  onPlaceSignature,
  hasSignatureData = false,
  disabled = false,
  canUndo = true,
  canRedo = true,
  showPlaceButton = true,
  placeButtonText = "Update and Place",
  additionalControls,
}) => {
  const { t } = useTranslation();
  const undoDisabled = disabled || !canUndo;
  const redoDisabled = disabled || !canRedo;

  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {onUndo && (
        <Tooltip label={t('sign.undo', 'Undo')}>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={t('sign.undo', 'Undo')}
            onClick={onUndo}
            disabled={undoDisabled}
            color={undoDisabled ? 'gray' : 'blue'}
          >
            <LocalIcon icon="undo" width={20} height={20} style={{ color: 'currentColor' }} />
          </ActionIcon>
        </Tooltip>
      )}
      {onRedo && (
        <Tooltip label={t('sign.redo', 'Redo')}>
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label={t('sign.redo', 'Redo')}
            onClick={onRedo}
            disabled={redoDisabled}
            color={redoDisabled ? 'gray' : 'blue'}
          >
            <LocalIcon icon="redo" width={20} height={20} style={{ color: 'currentColor' }} />
          </ActionIcon>
        </Tooltip>
      )}

      {additionalControls}

      {/* Place Signature Button */}
      {showPlaceButton && onPlaceSignature && (
        <Button
          variant="filled"
          color="blue"
          onClick={onPlaceSignature}
          disabled={disabled || !hasSignatureData}
          ml="auto"
        >
          {placeButtonText}
        </Button>
      )}
    </Group>
  );
};
