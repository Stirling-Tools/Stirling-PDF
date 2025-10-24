import React from 'react';
import { Group, Button } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface DrawingControlsProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onPlaceSignature?: () => void;
  hasSignatureData?: boolean;
  disabled?: boolean;
  showPlaceButton?: boolean;
  placeButtonText?: string;
}

export const DrawingControls: React.FC<DrawingControlsProps> = ({
  onUndo,
  onRedo,
  onPlaceSignature,
  hasSignatureData = false,
  disabled = false,
  showPlaceButton = true,
  placeButtonText = "Update and Place"
}) => {
  const { t } = useTranslation();

  return (
    <Group gap="sm">
      {/* Undo/Redo Controls */}
      <Button
        variant="outline"
        onClick={onUndo}
        disabled={disabled}
        flex={1}
      >
        {t('sign.undo', 'Undo')}
      </Button>
      <Button
        variant="outline"
        onClick={onRedo}
        disabled={disabled}
        flex={1}
      >
        {t('sign.redo', 'Redo')}
      </Button>

      {/* Place Signature Button */}
      {showPlaceButton && onPlaceSignature && (
        <Button
          variant="filled"
          color="blue"
          onClick={onPlaceSignature}
          disabled={disabled || !hasSignatureData}
          flex={1}
        >
          {placeButtonText}
        </Button>
      )}
    </Group>
  );
};