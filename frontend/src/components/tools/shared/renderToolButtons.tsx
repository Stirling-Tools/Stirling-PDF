import React from 'react';
import { Box, Stack } from '@mantine/core';
import ToolButton from '../toolPicker/ToolButton';
import SubcategoryHeader from './SubcategoryHeader';

// Helper function to render tool buttons for a subcategory
export const renderToolButtons = (
  subcategory: any,
  selectedToolKey: string | null,
  onSelect: (id: string) => void,
  showSubcategoryHeader: boolean = true
) => (
  <Box key={subcategory.subcategory} w="100%">
    {showSubcategoryHeader && (
      <SubcategoryHeader label={subcategory.subcategory} />
    )}
    <Stack gap="xs">
      {subcategory.tools.map(({ id, tool }: { id: string; tool: any }) => (
        <ToolButton
          key={id}
          id={id}
          tool={tool}
          isSelected={selectedToolKey === id}
          onSelect={onSelect}
        />
      ))}
    </Stack>
  </Box>
);