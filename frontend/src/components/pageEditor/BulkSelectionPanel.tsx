import React from 'react';
import { Group, TextInput, Button, Text } from '@mantine/core';

interface BulkSelectionPanelProps {
  csvInput: string;
  setCsvInput: (value: string) => void;
  selectedPageIds: string[];
  displayDocument?: { pages: { id: string; pageNumber: number }[] };
  onUpdatePagesFromCSV: () => void;
}

const BulkSelectionPanel = ({
  csvInput,
  setCsvInput,
  selectedPageIds,
  displayDocument,
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
      {selectedPageIds.length > 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          Selected: {selectedPageIds.length} pages ({displayDocument ? selectedPageIds.map(id => {
            const page = displayDocument.pages.find(p => p.id === id);
            return page?.pageNumber || 0;
          }).filter(n => n > 0).join(', ') : ''})
        </Text>
      )}
      </>
  );
};

export default BulkSelectionPanel;