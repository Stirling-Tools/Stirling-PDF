import React from 'react';
import { Group, TextInput, Button, Text } from '@mantine/core';

interface BulkSelectionPanelProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  selectedPages: number[];
  onUpdatePagesFromCSV: () => void;
}

const BulkSelectionPanel = ({
  csvInput,
  setCsvInput,
  selectedPages,
  onUpdatePagesFromCSV,
}: BulkSelectionPanelProps) => {
  return (
    <>
      <Group>
        <TextInput
          value={csvInput}
          onChange={(e) => setCsvInput(e.target.value)}
          placeholder="1,3,5-10"
          label="Page Selection"
          onBlur={onUpdatePagesFromCSV}
          onKeyDown={(e) => e.key === 'Enter' && onUpdatePagesFromCSV()}
          style={{ flex: 1 }}
        />
        <Button onClick={onUpdatePagesFromCSV} mt="xl">
          Apply
        </Button>
      </Group>
      {selectedPages.length > 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          Selected: {selectedPages.length} pages
        </Text>
      )}
      </>
  );
};

export default BulkSelectionPanel;