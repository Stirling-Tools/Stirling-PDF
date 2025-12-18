import React from 'react';
import { Modal, Stack, ColorPicker as MantineColorPicker, Group, Button, ColorSwatch, Slider, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface ColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
  title?: string;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  showOpacity?: boolean;
  opacityLabel?: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  isOpen,
  onClose,
  selectedColor,
  onColorChange,
  title,
  opacity,
  onOpacityChange,
  showOpacity = false,
  opacityLabel,
}) => {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('colorPicker.title', 'Choose colour');
  const resolvedOpacityLabel = opacityLabel ?? t('annotation.opacity', 'Opacity');

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
        {showOpacity && onOpacityChange && opacity !== undefined && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>{resolvedOpacityLabel}</Text>
            <Slider
              min={10}
              max={100}
              value={opacity}
              onChange={onOpacityChange}
              marks={[
                { value: 25, label: '25%' },
                { value: 50, label: '50%' },
                { value: 75, label: '75%' },
                { value: 100, label: '100%' },
              ]}
            />
          </Stack>
        )}
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
