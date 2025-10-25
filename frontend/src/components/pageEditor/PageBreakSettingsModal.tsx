import React, { useState } from 'react';
import { Modal, Button, Select, Radio, Group, Stack } from '@mantine/core';

export type PageSize = 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageBreakSettings {
  size: PageSize;
  orientation: PageOrientation;
}

interface PageBreakSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (settings: PageBreakSettings) => void;
  selectedPageCount: number;
}

const PAGE_SIZES: { value: PageSize; label: string; dimensions: string }[] = [
  { value: 'A4', label: 'A4', dimensions: '210 × 297 mm' },
  { value: 'Letter', label: 'Letter', dimensions: '8.5 × 11 in' },
  { value: 'Legal', label: 'Legal', dimensions: '8.5 × 14 in' },
  { value: 'A3', label: 'A3', dimensions: '297 × 420 mm' },
  { value: 'A5', label: 'A5', dimensions: '148 × 210 mm' },
];

export const PageBreakSettingsModal: React.FC<PageBreakSettingsModalProps> = ({
  opened,
  onClose,
  onConfirm,
  selectedPageCount,
}) => {
  const [size, setSize] = useState<PageSize>('A4');
  const [orientation, setOrientation] = useState<PageOrientation>('portrait');

  const handleConfirm = () => {
    onConfirm({ size, orientation });
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Insert ${selectedPageCount} Page Break${selectedPageCount > 1 ? 's' : ''}`}
      centered
      size="md"
    >
      <Stack gap="md">
        <Select
          label="Page Size"
          value={size}
          onChange={(value) => setSize(value as PageSize)}
          data={PAGE_SIZES.map(ps => ({
            value: ps.value,
            label: `${ps.label} (${ps.dimensions})`
          }))}
        />

        <div>
          <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Orientation
          </div>
          <Radio.Group
            value={orientation}
            onChange={(value) => setOrientation(value as PageOrientation)}
          >
            <Group gap="md">
              <Radio value="portrait" label="Portrait" />
              <Radio value="landscape" label="Landscape" />
            </Group>
          </Radio.Group>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Insert Page Break{selectedPageCount > 1 ? 's' : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
