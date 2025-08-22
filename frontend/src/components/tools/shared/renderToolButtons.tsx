import React from 'react';
import { Box, Stack } from '@mantine/core';
import ToolButton from '../toolPicker/ToolButton';
import SubcategoryHeader from './SubcategoryHeader';

import { getSubcategoryLabel } from "../../../data/toolsTaxonomy";
import { TFunction } from 'i18next';
import { SubcategoryGroup } from '../../../hooks/useToolSections';

// Helper function to render tool buttons for a subcategory
export const renderToolButtons = (
  t: TFunction,
  subcategory: SubcategoryGroup,
  selectedToolKey: string | null,
  onSelect: (id: string) => void,
  showSubcategoryHeader: boolean = true
) => (
  <Box key={subcategory.subcategoryId} w="100%">
    {showSubcategoryHeader && (
      <SubcategoryHeader label={getSubcategoryLabel(t, subcategory.subcategoryId)} />
    )}
    <Stack gap="xs">
      {subcategory.tools.map(({ id, tool }) => (
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
