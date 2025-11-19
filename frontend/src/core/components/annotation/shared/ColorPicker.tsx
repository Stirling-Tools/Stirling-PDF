import React from 'react';
import { Modal, Stack, ColorPicker as MantineColorPicker, Group, Button, ColorSwatch } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface ColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
  title?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  isOpen,
  onClose,
  selectedColor,
  onColorChange,
  title
}) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('colorPicker.title', 'Choose colour');

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={resolvedTitle}
      size="sm"
      centered
    >
      <Stack gap="md">
        <MantineColorPicker
          format="hex"
          value={selectedColor}
          onChange={onColorChange}
          swatches={['#000000', '#0066cc', '#cc0000', '#cc6600', '#009900', '#6600cc']}
          swatchesPerRow={6}
          size="lg"
          fullWidth
        />
        <Group justify="flex-end">
          <Button onClick={onClose}>
            {t('common.done', 'Done')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

interface ColorSwatchButtonProps {
  color: string;
  onClick: () => void;
  size?: number;
}

export const ColorSwatchButton: React.FC<ColorSwatchButtonProps> = ({
  color,
  onClick,
  size = 24
}) => {
  return (
    <ColorSwatch
      color={color}
      size={size}
      radius={0}
      style={{ cursor: 'pointer' }}
      onClick={onClick}
    />
  );
};
